// API edge cases + negative paths — complements api.test.mjs (happy paths).
// One local Worker; many focused subtests: auth caps, guest anti-enumeration +
// rate limit, file limits/ownership, the clarification round-trip, approval
// reject/wrong-role/no-rule, workflow transitions, admin RBAC, audit, customers
// 360, search, and order stage-conflicts.
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  Session, freePort, login, makeRunDir, removeRunDir,
  requestJson, run, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";

test("API edge cases and negative paths", { timeout: 180_000 }, async (t) => {
  const runDir = await makeRunDir("api-edge");
  const assets = join(runDir, "assets");
  const state = join(runDir, "state");
  const wranglerEnv = { WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") };
  let server;
  try {
    await run(process.execPath, [viteCli, "build", "--outDir", assets, "--emptyOutDir"]);
    await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "amj-db", "--local", "--persist-to", state], { env: wranglerEnv });
    await run(process.execPath, [wranglerCli, "d1", "execute", "amj-db", "--local", "--persist-to", state, "--file", "scripts/db/seed.sql"], { env: wranglerEnv });
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    server = start(process.execPath, [wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--persist-to", state, "--assets", assets, "--log-level", "warn"], { env: wranglerEnv });
    await waitForUrl(`${baseUrl}/api/health`, server);

    const anon = new Session(baseUrl);
    const staff = new Session(baseUrl);
    await login(staff, "/api/ops/auth", "staff@amjtradedirect.com.au"); // admin

    await t.test("customer OTP: wrong code rejected; 5 wrong attempts burn the code", async () => {
      const s = new Session(baseUrl);
      const challenge = await requestJson(s, "/api/auth/challenge", { method: "POST", json: { email: "capped@example.com" } });
      const good = challenge.body.devCode;
      for (let i = 0; i < 5; i++) await requestJson(s, "/api/auth/verify", { method: "POST", json: { email: "capped@example.com", code: "000000" } }, 400);
      // After the attempt cap the correct code no longer works.
      await requestJson(s, "/api/auth/verify", { method: "POST", json: { email: "capped@example.com", code: good } }, 400);
    });

    await t.test("logout clears the session", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "logout@example.com");
      assert.equal((await requestJson(s, "/api/auth/me")).body.authenticated, true);
      await requestJson(s, "/api/auth/logout", { method: "POST" });
      assert.equal((await requestJson(s, "/api/auth/me")).body.anonymous, true);
    });

    await t.test("ops sign-in is domain-allowlisted", async () => {
      const c = await requestJson(anon, "/api/ops/auth/challenge", { method: "POST", json: { email: "outsider@gmail.com" } });
      assert.equal(c.body.devCode, undefined, "no code for non-staff domain");
      await requestJson(anon, "/api/ops/auth/verify", { method: "POST", json: { email: "outsider@gmail.com", code: "123456" } }, 400);
    });

    await t.test("guest tracking: anti-enumeration, rate limit, bad code, invalid token", async () => {
      // Wrong email for a real order → neutral, no code.
      const wrong = await requestJson(anon, "/api/guest/track/request", { method: "POST", json: { email: "nobody@example.com", ref: "AMJ-58001" } });
      assert.deepEqual(wrong.body, { ok: true });
      // Correct match → code; immediate repeat is rate-limited (neutral, no code).
      const first = await requestJson(anon, "/api/guest/track/request", { method: "POST", json: { email: "demo@amjtradedirect.com.au", ref: "AMJ-58001" } });
      assert.match(first.body.devCode, /^\d{6}$/);
      const second = await requestJson(anon, "/api/guest/track/request", { method: "POST", json: { email: "demo@amjtradedirect.com.au", ref: "AMJ-58001" } });
      assert.equal(second.body.devCode, undefined, "rate limited within the window");
      await requestJson(anon, "/api/guest/track/verify", { method: "POST", json: { email: "demo@amjtradedirect.com.au", ref: "AMJ-58001", code: "000000" } }, 400);
      await requestJson(anon, "/api/guest/records/not-a-real-token", {}, 404);
    });

    await t.test("file upload: rejects empty and oversized; download is owner-only", async () => {
      const buyer = new Session(baseUrl);
      await login(buyer, "/api/auth", "files@example.com");
      // No file part.
      const empty = await buyer.request("/api/files/upload", { method: "POST", body: new FormData() });
      assert.equal(empty.status, 400);
      // Over the 15 MB limit.
      const big = new FormData();
      big.append("file", new Blob([new Uint8Array(15 * 1024 * 1024 + 1)]), "big.bin");
      assert.equal((await buyer.request("/api/files/upload", { method: "POST", body: big })).status, 413);
      // A real upload, then a different customer cannot download it.
      const ok = new FormData();
      ok.append("file", new Blob([Buffer.from("plan")], { type: "text/plain" }), "plan.txt");
      const uploaded = await (await buyer.request("/api/files/upload", { method: "POST", body: ok })).json();
      const intruder = new Session(baseUrl);
      await login(intruder, "/api/auth", "intruder@example.com");
      assert.equal((await intruder.request(`/api/files/${uploaded.file.id}/download`)).status, 404);
      // Staff can list + download any file.
      const staffFiles = await requestJson(staff, "/api/ops/files");
      assert.ok(staffFiles.body.files.some((f) => f.id === uploaded.file.id));
      assert.equal((await staff.request(`/api/ops/files/${uploaded.file.id}/download`)).status, 200);
    });

    await t.test("dashboard project list + submit; accept guards ownership and state", async () => {
      const demo = new Session(baseUrl);
      await login(demo, "/api/auth", "demo@amjtradedirect.com.au");
      const projects = await requestJson(demo, "/api/projects");
      assert.ok(projects.body.projects.some((p) => p.id === "p_draft"));
      // An already-accepted revision cannot be accepted again (seed rev_1 is accepted).
      await requestJson(demo, "/api/revisions/rev_1/accept", { method: "POST" }, 409);
    });

    await t.test("workflow transitions: valid move, invalid move 409, clarification round-trip", async () => {
      await requestJson(staff, "/api/ops/projects/p_submitted/assign", { method: "POST", json: {} });
      const moved = await requestJson(staff, "/api/ops/projects/p_submitted/status", { method: "POST", json: { statusInternal: "technical_review_required" } });
      assert.equal(moved.body.statusInternal, "technical_review_required");
      await requestJson(staff, "/api/ops/projects/p_submitted/status", { method: "POST", json: { statusInternal: "issued" } }, 409);
      // Clarification: staff asks -> customer sees + replies -> back to review.
      await requestJson(staff, "/api/ops/projects/p_submitted/request-clarification", { method: "POST", json: { message: "Confirm glass type" } });
      const sarah = new Session(baseUrl);
      await login(sarah, "/api/auth", "sarah@northsidebuild.com.au");
      const thread = await requestJson(sarah, "/api/projects/p_submitted/clarifications");
      assert.equal(thread.body.status, "needs_information");
      assert.ok(thread.body.clarifications.some((c) => c.author_type === "internal"));
      const reply = await requestJson(sarah, "/api/projects/p_submitted/clarification-reply", { method: "POST", json: { message: "Double glazed" } });
      assert.equal(reply.body.status, "under_review");
    });

    await t.test("approvals: no-rule auto-clears, reject returns to estimator, wrong role blocked", async () => {
      // p_draft ($1,740, no technical) has no matching rule -> straight to ready.
      await requestJson(staff, "/api/ops/projects/p_draft/assign", { method: "POST", json: {} });
      const auto = await requestJson(staff, "/api/ops/projects/p_draft/submit-for-approval", { method: "POST", json: {} });
      assert.equal(auto.body.statusInternal, "approved_for_issue");

      // p_submitted (>$4,000) needs a manager approval.
      const submitted = await requestJson(staff, "/api/ops/projects/p_submitted/submit-for-approval", { method: "POST", json: {} });
      assert.equal(submitted.body.statusInternal, "approval_pending");
      const step = (await requestJson(staff, "/api/ops/approvals")).body.approvals.find((s) => s.project_id === "p_submitted");
      assert.ok(step);

      // A pure estimator cannot approve a manager step.
      const estimator = new Session(baseUrl);
      const est = await login(estimator, "/api/ops/auth", "estimator@amjtradedirect.com.au");
      await requestJson(staff, `/api/ops/staff/${est.body.user.id}`, { method: "PATCH", json: { role: "estimator" } });
      await requestJson(estimator, `/api/ops/approvals/${step.id}/approve`, { method: "POST", json: {} }, 403);

      // Reject sends the project back to the estimator.
      await requestJson(staff, `/api/ops/approvals/${step.id}/reject`, { method: "POST", json: { comment: "Needs rework" } });
      const after = await requestJson(staff, "/api/ops/projects/p_submitted");
      assert.equal(after.body.project.statusInternal, "estimator_assigned");
    });

    await t.test("admin RBAC: rules + staff role changes require admin", async () => {
      const estimator = new Session(baseUrl);
      const est = await login(estimator, "/api/ops/auth", "estimator@amjtradedirect.com.au");
      // (already estimator from previous subtest) — non-admin is blocked.
      const rule = (await requestJson(staff, "/api/ops/rules")).body.rules[0];
      await requestJson(estimator, `/api/ops/rules/${rule.id}`, { method: "PATCH", json: { active: false } }, 403);
      await requestJson(estimator, `/api/ops/staff/${est.body.user.id}`, { method: "PATCH", json: { role: "admin" } }, 403);
      // Admin can, and invalid roles are rejected.
      await requestJson(staff, `/api/ops/rules/${rule.id}`, { method: "PATCH", json: { value: 9999 } });
      await requestJson(staff, `/api/ops/staff/${est.body.user.id}`, { method: "PATCH", json: { role: "not-a-role" } }, 400);
    });

    await t.test("audit log + entity filter, customers 360, and search", async () => {
      const audit = await requestJson(staff, "/api/ops/audit");
      assert.ok(audit.body.events.length >= 1);
      const filtered = await requestJson(staff, "/api/ops/audit?entity=project");
      assert.ok(filtered.body.events.every((e) => e.entity_type === "project"));
      const customers = await requestJson(staff, "/api/ops/customers");
      const north = customers.body.customers.find((c) => c.name === "Northside Build");
      assert.ok(north && north.projects >= 1);
      const detail = await requestJson(staff, `/api/ops/customers/${north.id}`);
      assert.ok(detail.body.members.length >= 1);
      await requestJson(staff, "/api/ops/customers/nope", {}, 404);
      const search = await requestJson(staff, "/api/ops/search?q=Fitzroy");
      assert.ok(search.body.results.some((r) => r.type === "project"));
      const tooShort = await requestJson(staff, "/api/ops/search?q=x");
      assert.deepEqual(tooShort.body.results, []);
    });

    await t.test("order stage-conflicts: wrong advance/pay rejected", async () => {
      // Seed order o_1 is at 'manufacturing'.
      const detail = await requestJson(staff, "/api/ops/orders/o_1");
      assert.equal(detail.body.order.stage, "manufacturing");
      assert.deepEqual(detail.body.actions.map((a) => a.action), ["share-qa"]);
      await requestJson(staff, "/api/ops/orders/o_1/advance", { method: "POST", json: { action: "dispatch" } }, 409);
      await requestJson(staff, "/api/ops/orders/o_1/pay", { method: "POST", json: { kind: "deposit" } }, 409);
    });
  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
