import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import {
  Session, freePort, login, makeRunDir, removeRunDir, requestJson,
  run, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";

test("local Worker, D1, KV, R2, auth, quote, and order journeys", { timeout: 180_000 }, async (t) => {
  const runDir = await makeRunDir("api");
  const assets = join(runDir, "assets");
  const state = join(runDir, "state");
  const wranglerLog = join(runDir, "wrangler.log");
  let server;
  try {
    const wranglerEnv = { WRANGLER_LOG_PATH: wranglerLog, XDG_CONFIG_HOME: join(runDir, "config") };
    await run(process.execPath, [viteCli, "build", "--outDir", assets, "--emptyOutDir"]);
    await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "amj-db", "--local", "--persist-to", state], { env: wranglerEnv });
    const migrationRerun = await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "amj-db", "--local", "--persist-to", state], { env: wranglerEnv });
    assert.match(migrationRerun.stdout + migrationRerun.stderr, /No migrations to apply/i);
    await run(process.execPath, [wranglerCli, "d1", "execute", "amj-db", "--local", "--persist-to", state, "--file", "scripts/db/seed.sql"], { env: wranglerEnv });
    const dbCheck = await run(process.execPath, [wranglerCli, "d1", "execute", "amj-db", "--local", "--persist-to", state, "--json", "--command", "SELECT (SELECT count(*) FROM user) AS users, (SELECT count(*) FROM project) AS projects, (SELECT count(*) FROM quote_line) AS quote_lines, (SELECT count(*) FROM quote_revision) AS revisions, (SELECT count(*) FROM [order]) AS orders, (SELECT count(*) FROM payment) AS payments, (SELECT count(*) FROM approval_rule) AS approval_rules; PRAGMA foreign_key_check;"], { env: wranglerEnv });
    const statements = JSON.parse(dbCheck.stdout);
    assert.deepEqual(statements[0].results[0], {
      users: 3, projects: 3, quote_lines: 4, revisions: 1,
      orders: 1, payments: 2, approval_rules: 2,
    });
    assert.deepEqual(statements[1].results, []);

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    server = start(process.execPath, [
      wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
      "--persist-to", state, "--assets", assets, "--log-level", "warn",
    ], { env: wranglerEnv });
    await waitForUrl(`${baseUrl}/api/health`, server);

    const anonymous = new Session(baseUrl);
    await t.test("health, routing, and unauthenticated access boundaries", async () => {
      const health = await requestJson(anonymous, "/api/health");
      assert.equal(health.body.ok, true);
      assert.deepEqual(health.body.bindings, { db: true, files: true, kv: true });
      await requestJson(anonymous, "/api/not-a-route", {}, 404);
      await requestJson(anonymous, "/api/ops/summary", {}, 403);
      await requestJson(anonymous, "/api/orders/o_1", {}, 404);
      await requestJson(anonymous, "/api/auth/verify", { method: "POST", json: { email: "bad", code: "1" } }, 400);
      const neutral = await requestJson(anonymous, "/api/guest/track/request", { method: "POST", json: { email: "nobody@example.com", ref: "AMJ-00000" } });
      assert.deepEqual(neutral.body, { ok: true });
    });

    const customer = new Session(baseUrl);
    let customerProjectId;
    await t.test("anonymous project, server pricing, OTP login, and claim merge", async () => {
      const empty = await requestJson(customer, "/api/projects/current");
      assert.equal(empty.body.project, null);
      const saved = await requestJson(customer, "/api/projects/current/lines", {
        method: "PUT",
        json: {
          title: "Regression project",
          items: [{
            code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
            measuredBy: "opening", width: "1200", height: "900", qty: 1,
            options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
            lineTotal: 1,
          }],
        },
      });
      customerProjectId = saved.body.project.id;
      assert.equal(saved.body.items[0].lineTotal, 510);
      await login(customer, "/api/auth", "regression@example.com");
      const claimed = await requestJson(customer, "/api/projects/current");
      assert.equal(claimed.body.project.id, customerProjectId);
      assert.equal(claimed.body.items.length, 1);
    });

    await t.test("R2 upload, listing, and owner download", async () => {
      const bytes = await readFile(join(process.cwd(), "README.md"));
      const form = new FormData();
      form.append("kind", "plan");
      form.append("file", new Blob([bytes], { type: "text/markdown" }), "README.md");
      const uploadResponse = await customer.request("/api/files/upload", { method: "POST", body: form });
      assert.equal(uploadResponse.status, 200);
      const upload = await uploadResponse.json();
      const listed = await requestJson(customer, `/api/projects/${customerProjectId}/files`);
      assert.ok(listed.body.files.some((file) => file.id === upload.file.id));
      const download = await customer.request(`/api/files/${upload.file.id}/download`);
      assert.equal(download.status, 200);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    });

    const ops = new Session(baseUrl);
    await t.test("staff OTP, dashboard, queue, assignment, approvals, and revision issue", async () => {
      await login(ops, "/api/ops/auth", "staff@amjtradedirect.com.au");
      const summary = await requestJson(ops, "/api/ops/summary");
      assert.ok(summary.body.submissions >= 1);
      const queue = await requestJson(ops, "/api/ops/queues/submissions");
      assert.ok(queue.body.submissions.some((project) => project.id === "p_submitted"));
      await requestJson(ops, "/api/ops/projects/p_submitted/assign", { method: "POST", json: {} });
      const approval = await requestJson(ops, "/api/ops/projects/p_submitted/submit-for-approval", { method: "POST", json: {} });
      assert.equal(approval.body.statusInternal, "approval_pending");
      // Cannot issue while approvals are still pending (approval-bypass guard).
      await requestJson(ops, "/api/ops/projects/p_submitted/issue-revision", { method: "POST", json: {} }, 409);
      const pending = await requestJson(ops, "/api/ops/approvals");
      assert.ok(pending.body.approvals.length >= 1);
      for (const step of pending.body.approvals.filter((item) => item.project_id === "p_submitted")) {
        await requestJson(ops, `/api/ops/approvals/${step.id}/approve`, { method: "POST", json: { comment: "Regression approval" } });
      }
      const issued = await requestJson(ops, "/api/ops/projects/p_submitted/issue-revision", { method: "POST", json: {} });
      assert.equal(issued.body.revisionNo, 1);
    });

    const sarah = new Session(baseUrl);
    let newOrder;
    await t.test("customer revision retrieval and concurrent acceptance", async () => {
      await login(sarah, "/api/auth", "sarah@northsidebuild.com.au");
      const revisions = await requestJson(sarah, "/api/projects/p_submitted/revisions");
      const revisionId = revisions.body.revisions[0].id;
      const attempts = await Promise.all(Array.from({ length: 10 }, () => sarah.request(`/api/revisions/${revisionId}/accept`, { method: "POST" })));
      const statuses = attempts.map((response) => response.status);
      assert.equal(statuses.filter((status) => status === 200).length, 1);
      assert.equal(statuses.filter((status) => status === 409).length, 9);
      const winner = attempts[statuses.indexOf(200)];
      newOrder = (await winner.json()).order;
      const orders = await requestJson(sarah, "/api/orders");
      assert.equal(orders.body.orders.filter((order) => order.id === newOrder.id).length, 1);
    });

    await t.test("complete payment, drawing, manufacturing, QA, dispatch, and delivery journey", async () => {
      const id = newOrder.id;
      let result = await requestJson(ops, `/api/ops/orders/${id}/pay`, { method: "POST", json: { kind: "deposit", reference: "REG-DEP" } });
      assert.equal(result.body.order.stage, "deposit_paid");
      result = await requestJson(ops, `/api/ops/orders/${id}/advance`, { method: "POST", json: { action: "issue-drawings" } });
      assert.equal(result.body.order.stage, "drawings_shared");
      result = await requestJson(sarah, `/api/orders/${id}/confirm-drawings`, { method: "POST", json: {} });
      assert.equal(result.body.order.stage, "drawings_signed_off");
      for (const [action, stage] of [["start-manufacturing", "manufacturing"], ["share-qa", "qa_photos_shared"], ["invoice-balance", "balance_invoiced"]]) {
        result = await requestJson(ops, `/api/ops/orders/${id}/advance`, { method: "POST", json: { action } });
        assert.equal(result.body.order.stage, stage);
      }
      result = await requestJson(ops, `/api/ops/orders/${id}/pay`, { method: "POST", json: { kind: "balance", reference: "REG-BAL" } });
      assert.equal(result.body.order.stage, "balance_paid");
      result = await requestJson(sarah, `/api/orders/${id}/confirm-qa`, { method: "POST", json: {} });
      assert.equal(result.body.order.stage, "customer_confirmed");
      for (const [action, stage] of [["dispatch", "dispatched"], ["deliver", "delivered"], ["close", "after_sales"]]) {
        result = await requestJson(ops, `/api/ops/orders/${id}/advance`, { method: "POST", json: { action } });
        assert.equal(result.body.order.stage, stage);
      }
    });

    await t.test("guest order tracking grant and read-only record", async () => {
      const request = await requestJson(anonymous, "/api/guest/track/request", { method: "POST", json: { email: "sarah@northsidebuild.com.au", ref: newOrder.orderNo } });
      assert.match(request.body.devCode, /^\d{6}$/);
      const grant = await requestJson(anonymous, "/api/guest/track/verify", { method: "POST", json: { email: "sarah@northsidebuild.com.au", ref: newOrder.orderNo, code: request.body.devCode } });
      const record = await requestJson(anonymous, `/api/guest/records/${grant.body.token}`);
      assert.equal(record.body.order.id, newOrder.id);
    });

    await t.test("customer and ops SPA fallback plus real static assets", async () => {
      const customerShell = await customer.request("/catalogue/deep-link");
      assert.equal(customerShell.status, 200);
      const customerHtml = await customerShell.text();
      assert.match(customerHtml, /<div id="root"><\/div>/);
      const assetPath = customerHtml.match(/(?:src|href)="(\/assets\/[^"]+)"/)?.[1];
      assert.ok(assetPath);
      assert.equal((await customer.request(assetPath)).status, 200);
      assert.equal((await customer.request("/assets/not-present.js")).status, 404);
      const opsShell = await new Promise((resolve, reject) => {
        const request = httpRequest({
          hostname: "127.0.0.1", port, path: "/orders/deep-link",
          headers: { Host: `ops.localhost:${port}` },
        }, (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => { body += chunk; });
          response.on("end", () => resolve({ status: response.statusCode, body }));
        });
        request.on("error", reject);
        request.end();
      });
      assert.equal(opsShell.status, 200);
      assert.match(opsShell.body, /<title>AMJ Ops Console<\/title>/);
    });

    await t.test("estimator cannot delegate an approval to self", async () => {
      await requestJson(ops, "/api/ops/lines/ql_1", { method: "PATCH", json: { qty: 10 } });
      await requestJson(ops, "/api/ops/projects/p_draft/assign", { method: "POST", json: {} });
      await requestJson(ops, "/api/ops/projects/p_draft/submit-for-approval", { method: "POST", json: {} });
      const pending = await requestJson(ops, "/api/ops/approvals");
      const step = pending.body.approvals.find((item) => item.project_id === "p_draft");
      assert.ok(step);
      const estimator = new Session(baseUrl);
      const estimatorLogin = await login(estimator, "/api/ops/auth", "estimator@amjtradedirect.com.au");
      await requestJson(ops, `/api/ops/staff/${estimatorLogin.body.user.id}`, { method: "PATCH", json: { role: "estimator" } });
      const delegated = await estimator.request(`/api/ops/approvals/${step.id}/delegate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "estimator" }) });
      const approved = await estimator.request(`/api/ops/approvals/${step.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      assert.deepEqual([delegated.status, approved.status], [403, 403]);
    });

    await t.test("unauthenticated legacy staff seam is forbidden", async () => {
      const response = await fetch(`${baseUrl}/api/projects/p_draft/issue-revision`, { method: "POST" });
      assert.equal(response.status, 403);
    });
  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
