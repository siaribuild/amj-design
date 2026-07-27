import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import {
  Session, freePort, login, makeRunDir, removeRunDir, requestJson,
  run, seedUserCount, staffEmail, start, stop, viteCli, waitForUrl, wranglerCli,
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
    await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "apertly-db", "--local", "--persist-to", state], { env: wranglerEnv });
    const migrationRerun = await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "apertly-db", "--local", "--persist-to", state], { env: wranglerEnv });
    assert.match(migrationRerun.stdout + migrationRerun.stderr, /No migrations to apply/i);
    await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--file", "scripts/db/seed.sql"], { env: wranglerEnv });
    const dbCheck = await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command", "SELECT (SELECT count(*) FROM user) AS users, (SELECT count(*) FROM project) AS projects, (SELECT count(*) FROM quote_line) AS quote_lines, (SELECT count(*) FROM quote_revision) AS revisions, (SELECT count(*) FROM [order]) AS orders, (SELECT count(*) FROM payment) AS payments, (SELECT count(*) FROM approval_rule) AS approval_rules; PRAGMA foreign_key_check;"], { env: wranglerEnv });
    const statements = JSON.parse(dbCheck.stdout);
    assert.deepEqual(statements[0].results[0], {
      users: seedUserCount, projects: 3, quote_lines: 4, revisions: 1,
      orders: 1, payments: 2, approval_rules: 2,
    });
    assert.deepEqual(statements[1].results, []);

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    server = start(process.execPath, [
      wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
      "--persist-to", state, "--assets", assets, "--log-level", "warn",
      // Local/test env: dev OTP codes on, Cloudflare Access off (staff session
      // fallback), and Sanity off so pricing/catalogue are the deterministic
      // built-in data. Production values live in wrangler.jsonc (cf:deploy).
      "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:", "--var", "SANITY_PROJECT_ID:", "--var", "AI_EXTRACTION_MODE:manual",
    ], { env: wranglerEnv });
    await waitForUrl(`${baseUrl}/api/health`, server);
    // Structural assertions the API deliberately does not expose (segments are
    // nested inside their parent, never listed) are checked straight in D1.
    const sql = async (command) => {
      const r = await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command", command], { env: wranglerEnv });
      return JSON.parse(r.stdout)[0].results;
    };

    const anonymous = new Session(baseUrl);
    await t.test("health, routing, and unauthenticated access boundaries", async () => {
      const health = await requestJson(anonymous, "/api/health");
      assert.equal(health.body.ok, true);
      assert.deepEqual(health.body.bindings, { db: true, files: true, kv: true });
      await requestJson(anonymous, "/api/not-a-route", {}, 404);
      await requestJson(anonymous, "/api/ops/summary", {}, 403);
      await requestJson(anonymous, "/api/orders/o_1", {}, 404);
      await requestJson(anonymous, "/api/auth/verify", { method: "POST", json: { email: "bad", code: "1" } }, 400);
      const neutral = await requestJson(anonymous, "/api/guest/track/request", { method: "POST", json: { email: "nobody@example.com", ref: "OF-00000" } });
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
      // PARITY CANARY. 1200×900 sliding window, all four options standard:
      // perimeter 4.2m × $45 + area 1.08m² × $300 = $513 → $510 on the $10 grid.
      // This number is what the retired client-side engine produced, so it pins
      // the unified D1 engine to the same answer. It caught a real regression on
      // the first run: the D1 surcharge table is keyed by option alone, so every
      // STANDARD choice was billed and this came back $710. Standard options are
      // included in the base rate and must contribute no surcharge slug.
      assert.equal(saved.body.items[0].lineTotal, 510);
      await login(customer, "/api/auth", "regression@example.com");
      const claimed = await requestJson(customer, "/api/projects/current");
      assert.equal(claimed.body.project.id, customerProjectId);
      assert.equal(claimed.body.items.length, 1);
    });

    // The single-engine guarantee, stated as behaviour rather than structure.
    await t.test("one pricing engine: conditional modifiers apply to every line", async () => {
      const s = new Session(baseUrl);
      const line = (w) => ({
        code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
        measuredBy: "opening", width: String(w), height: "900", qty: 1,
        options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
        lineTotal: 1,
      });

      // 1300 wide crosses the seeded "width > 1200mm ⇒ +10%" modifier.
      // Base: perimeter 4.4m × $45 + area 1.17m² × $300 = $549 → ×1.10 = $603.9
      // → $600 on the $10 grid. Under the retired client engine this line came
      // back $550: that engine had no modifier concept at all, so the owner's
      // own pricing rule silently did not apply to manual or schedule lines.
      const wide = await requestJson(s, "/api/projects/current/lines", {
        method: "PUT", json: { title: "Modifier check", items: [line(1300)] },
      });
      assert.equal(wide.body.items[0].lineTotal, 600, "wide-frame modifier must apply to a manual line");

      // 1200 is NOT over the threshold — the rule is exclusive, not inclusive.
      const narrow = await requestJson(s, "/api/projects/current/lines", {
        method: "PUT", json: { items: [{ ...line(1200), serverId: wide.body.items[0].id }] },
      });
      assert.equal(narrow.body.items[0].lineTotal, 510, "at exactly 1200 the modifier must not fire");
    });

    await t.test("one draft per customer: a second anon draft merges its lines on sign-in", async () => {
      const line = (code) => ({
        code, location: "Site", productSlug: "amj80-series-sliding-window",
        measuredBy: "opening", width: "1200", height: "900", qty: 1,
        options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
        lineTotal: 1,
      });
      // A first anonymous draft is claimed on sign-in (the plain path).
      const a = new Session(baseUrl);
      await requestJson(a, "/api/projects/current/lines", { method: "PUT", json: { title: "First draft", items: [line("W01")] } });
      await login(a, "/api/auth", "onedraft@example.com");
      assert.equal((await requestJson(a, "/api/projects/current")).body.items.length, 1);

      // A SEPARATE anonymous session composes a second draft, then the SAME user
      // signs in — the two would collide, so the new lines merge into the one draft.
      const b = new Session(baseUrl);
      await requestJson(b, "/api/projects/current/lines", { method: "PUT", json: { title: "Second draft", items: [line("D01")] } });
      await login(b, "/api/auth", "onedraft@example.com");

      const merged = await requestJson(b, "/api/projects/current");
      assert.equal(merged.body.items.length, 2, "second draft's lines merged into the single draft");
      assert.deepEqual(merged.body.items.map((i) => i.code).sort(), ["D01", "W01"]);
      // Exactly one draft remains for the customer.
      const drafts = (await requestJson(b, "/api/projects")).body.projects.filter((p) => p.status_customer === "draft");
      assert.equal(drafts.length, 1, "no orphaned second draft");
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
      await login(ops, "/api/ops/auth", staffEmail);
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
      // Sequential order numbering continues from the seeded OF-58001.
      assert.equal(newOrder.orderNo, "OF-58002");
      const orders = await requestJson(sarah, "/api/orders");
      const mine = orders.body.orders.find((order) => order.id === newOrder.id);
      assert.ok(mine, "accepted order listed once");
      assert.equal(orders.body.orders.filter((order) => order.id === newOrder.id).length, 1);
      // Account-area context rides on the customer order DTO.
      assert.equal(mine.projectTitle, "Fitzroy townhouses");
      assert.match(mine.projectRef ?? "", /^OF-Q-\d+$/);
      assert.equal(mine.revisionNo, 1);
      assert.equal(mine.lineCount, 2);
      // A stale client cannot request changes on an already-accepted revision.
      const revsAfter = await requestJson(sarah, "/api/projects/p_submitted/revisions");
      await requestJson(sarah, `/api/revisions/${revsAfter.body.revisions[0].id}/request-changes`, { method: "POST", json: { message: "too late" } }, 409);
    });

    await t.test("accept and request-changes race has exactly one workflow winner", async () => {
      await run(process.execPath, [
        wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state,
        "--command",
        `INSERT INTO project
           (id, owner_user_id, title, public_ref, status_customer, status_internal)
         VALUES
           ('p_accept_change_race','u_sarah','Race quote','OF-Q-19991','quote_issued','issued');
         INSERT INTO quote_revision
           (id, project_id, revision_no, snapshot_status, totals_json)
         VALUES
           ('rev_accept_change_race','p_accept_change_race',1,'issued','{"total":1250}');
         INSERT INTO revision_line
           (id, revision_id, external_ref, product_snapshot_json, dims_json,
            options_json, qty, line_total)
         VALUES
           ('rl_accept_change_race','rev_accept_change_race','W01',
            '{"slug":"amj80-series-awning-window"}','{"width":900,"height":1200}',
            '{}',1,1250);
         UPDATE project SET current_revision_id='rev_accept_change_race'
          WHERE id='p_accept_change_race';`,
      ], { env: wranglerEnv });

      const [accept, changes] = await Promise.all([
        sarah.request("/api/revisions/rev_accept_change_race/accept", { method: "POST" }),
        sarah.request("/api/revisions/rev_accept_change_race/request-changes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Please reconsider the glass specification" }),
        }),
      ]);
      assert.deepEqual([accept.status, changes.status].sort(), [200, 409]);

      const check = await run(process.execPath, [
        wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state,
        "--json", "--command",
        `SELECT p.status_customer, p.status_internal, r.snapshot_status,
                (SELECT count(*) FROM "order"
                  WHERE accepted_revision_id=r.id) AS orders
           FROM project p
           JOIN quote_revision r ON r.project_id=p.id
          WHERE p.id='p_accept_change_race';`,
      ], { env: wranglerEnv });
      const row = JSON.parse(check.stdout)[0].results[0];
      if (accept.status === 200) {
        assert.deepEqual(row, {
          status_customer: "closed", status_internal: "issued",
          snapshot_status: "accepted", orders: 1,
        });
      } else {
        assert.deepEqual(row, {
          status_customer: "under_review", status_internal: "estimator_assigned",
          snapshot_status: "issued", orders: 0,
        });
      }
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
      await requestJson(anonymous, "/api/guest/track/verify", { method: "POST", json: { email: "sarah@northsidebuild.com.au", ref: newOrder.orderNo, code: request.body.devCode } });
      const record = await requestJson(anonymous, "/api/guest/record");
      assert.equal(record.body.kind, "order");
      assert.equal(record.body.id, newOrder.id);
      // The record itself comes from the ORDINARY customer endpoint — one view,
      // one payload, for guests and signed-in customers alike.
      const full = await requestJson(anonymous, `/api/orders/${newOrder.id}`);
      assert.equal(full.body.order.id, newOrder.id);
      assert.ok(full.body.order.lines.length > 0);
    });

    // Regression: the submission email hands the customer their QUOTE reference
    // (OF-Q-) and tells them to track with it, but tracking only ever looked up
    // "order".order_no — which does not exist until an issued quote is accepted
    // — and matched the email against user.email, which is NULL for an anonymous
    // submitter. Both failures were silent: the lookup found nothing, the
    // anti-enumeration response still advanced the UI to the code screen, and no
    // email was ever sent.
    await t.test("anonymous quote is trackable by its OF-Q reference", async () => {
      const guest = new Session(baseUrl);
      const email = "anon.tracker@example.com";
      const saved = await requestJson(guest, "/api/projects/current/lines", {
        method: "PUT",
        json: {
          title: "Guest tracking project",
          items: [{
            code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
            measuredBy: "opening", width: "1200", height: "900", qty: 1,
            options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
            lineTotal: 1,
          }],
        },
      });
      const projectId = saved.body.project.id;
      const ref = saved.body.project.ref;
      assert.match(ref, /^OF-Q-\d+$/);

      await requestJson(guest, `/api/projects/${projectId}/submit`, {
        method: "POST",
        json: { contact: { name: "Anon Tester", email, phone: "0400 000 000", suburb: "Rowville" } },
      });

      // A code must actually be issued — the reported symptom was silence here.
      const req = await requestJson(guest, "/api/guest/track/request", { method: "POST", json: { email, ref } });
      assert.match(req.body.devCode, /^\d{6}$/, "no tracking code issued for a submitted quote");

      await requestJson(guest, "/api/guest/track/verify", { method: "POST", json: { email, ref, code: req.body.devCode } });
      // The guest endpoint says only WHICH record the session covers.
      const rec = await requestJson(guest, "/api/guest/record");
      assert.equal(rec.body.kind, "project");
      assert.equal(rec.body.id, projectId);
      assert.equal(rec.body.status, "submitted");

      // The record itself comes from the ORDINARY customer endpoint, so a guest
      // and a signed-in customer are served the same payload by the same code —
      // there is no second view or DTO to drift.
      const full = await requestJson(guest, `/api/projects/${projectId}`);
      assert.equal(full.body.items.length, 1);
      assert.equal(full.body.items[0].code, "W01");
      assert.ok(full.body.items[0].lineTotal > 0);
      assert.ok(Array.isArray(full.body.files));

      // A wrong email must still not resolve the reference.
      const wrong = await requestJson(guest, "/api/guest/track/request", { method: "POST", json: { email: "someone.else@example.com", ref } });
      assert.equal(wrong.body.devCode, undefined);

      // The claim cookie is enough for a CART and nothing more. `guest` still
      // holds the claim cookie for this project (it built the draft), but the
      // project is submitted now — a durable year-long device cookie must not by
      // itself authorise acting on a committed record. Proving control of the
      // email address is the bar, which is what this session has now done.
      const cookieOnly = new Session(baseUrl);
      cookieOnly.cookies = new Map(guest.cookies);
      cookieOnly.cookies.delete("apertly_guest");
      await requestJson(cookieOnly, `/api/projects/${projectId}/revisions`, {}, 404);
      // …and with the verified guest session, the same request resolves.
      await requestJson(guest, `/api/projects/${projectId}/revisions`);

      // Signing out drops the session, so a shared machine keeps nothing.
      await requestJson(guest, "/api/guest/signout", { method: "POST" });
      await requestJson(guest, "/api/guest/record", {}, 404);
    });

    // A composite is ONE opening built as several joined units. The customer
    // authored one line and must keep seeing one line: their tag, their count,
    // one price. Getting this wrong reads to them as double-charging.
    await t.test("composite: one opening, segments nested, nothing double-counted", async () => {
      // Self-contained: a fresh project, submitted, so it is in a state a
      // reviewer may act on regardless of what earlier tests did.
      const cust = new Session(baseUrl);
      const made = await requestJson(cust, "/api/projects/current/lines", {
        method: "PUT",
        json: {
          title: "Composite project",
          items: [{
            code: "W12", location: "Living", productSlug: "amj80-series-sliding-window",
            measuredBy: "opening", width: "1200", height: "900", qty: 1,
            options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
            lineTotal: 1,
          }],
        },
      });
      const projectId = made.body.project.id;
      const parentId = made.body.items[0].id;
      const openingTotal = made.body.items[0].lineTotal;
      await requestJson(cust, `/api/projects/${projectId}/submit`, {
        method: "POST",
        json: { contact: { name: "Composite Tester", email: "composite@example.com", phone: "0400 000 000", suburb: "Rowville" } },
      });

      const split = await requestJson(ops, `/api/ops/lines/${parentId}/split`, {
        method: "POST",
        json: {
          axis: "vertical",
          segments: [
            { widthMm: 600, heightMm: 900, productSlug: "amj80-series-sliding-window", qtyPerParent: 1 },
            { widthMm: 600, heightMm: 900, productSlug: "amj80-series-sliding-window", qtyPerParent: 1 },
          ],
        },
      });
      assert.equal(split.body.ok, true);

      // The reviewer's list still shows ONE line for W12 — segments are nested,
      // never loose beside their opening.
      const seen = await requestJson(ops, `/api/ops/projects/${projectId}`);
      assert.equal(seen.body.lines.length, 1, "a split must never add items to the quote");
      const w12 = seen.body.lines[0];
      assert.equal(w12.code, "W12", "their tag is untouched");
      // The parent total is the server's sum of its units, priced per frame
      // through the one engine — not the old whole-opening figure.
      const segs = await sql(`SELECT line_total, qty_per_parent FROM quote_line WHERE parent_line_id='${parentId}' ORDER BY segment_seq`);
      assert.equal(segs.length, 2, "two units exist, owned by their parent");
      assert.equal(w12.lineTotal, segs.reduce((n, x) => n + x.line_total, 0), "the opening total IS the sum of its units");
      assert.notEqual(w12.lineTotal, openingTotal);

      // A geometry that cannot be built is refused, naming the offending unit.
      const bad = await requestJson(ops, `/api/ops/lines/${parentId}/split`, {
        method: "POST",
        json: { segments: [{ widthMm: 600, heightMm: 500, productSlug: "amj80-series-sliding-window" },
                           { widthMm: 600, heightMm: 900, productSlug: "amj80-series-sliding-window" }] },
      }, 400);
      assert.ok(bad.body.errors.some((e) => /Unit 1 is 500mm across/.test(e)));

      // Merging restores the fit warning: the reason for splitting is still true,
      // so an unbuildable single unit must never come back as Ready.
      await requestJson(ops, `/api/ops/lines/${parentId}/merge`, { method: "POST" });
      const merged = await requestJson(ops, `/api/ops/projects/${projectId}`);
      assert.equal(merged.body.lines.length, 1);
      assert.equal((await sql(`SELECT id FROM quote_line WHERE parent_line_id='${parentId}'`)).length, 0, "units are gone after a merge");
      assert.ok(merged.body.lines[0].review?.fit, "merging restores the fit warning");
    });

    // Social scrapers fetch the raw HTML once and never run JS, so the shell's
    // head has to be right on the FIRST response — the client's injection is too
    // late for them.
    await t.test("crawler surfaces: server-rendered head, sitemap and robots", async () => {
      const html = await (await customer.request("/")).text();
      assert.ok(!/content="noindex/.test(html), "no site-wide robots meta may block indexing");
      assert.ok(html.includes("og:title"), "og:title is present without running any JS");
      assert.ok(html.includes("og:url"), "og:url is present");
      assert.ok(!html.includes("OpenFrame Website"), "the build-time placeholder title must be replaced");

      // A product URL gets that product own title, not the home page one.
      const prodHtml = await (await customer.request("/products/amj80-series-sliding-window")).text();
      assert.ok(prodHtml.includes("AMJ80 Series Sliding Window"), "product head is rendered server-side");

      const sitemap = await customer.request("/sitemap.xml");
      assert.equal(sitemap.status, 200);
      const xml = await sitemap.text();
      assert.ok(xml.includes("<urlset"));
      assert.ok(xml.includes("how-it-works"));
      assert.ok(xml.includes("products/amj80-series-sliding-window"), "products are listed individually");

      const robots = await customer.request("/robots.txt");
      assert.equal(robots.status, 200);
      // APP_ENV is development here, so it must REFUSE crawling: a non-production
      // deployment getting indexed is the failure mode this guards.
      assert.ok((await robots.text()).includes("Disallow"));
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
      assert.match(opsShell.body, /<title>OpenFrame Ops Console<\/title>/);
    });

    await t.test("estimator cannot delegate an approval to self", async () => {
      await requestJson(ops, "/api/ops/projects/p_draft/assign", { method: "POST", json: {} });
      await requestJson(ops, "/api/ops/lines/ql_1", { method: "PATCH", json: { qty: 10 } });
      await requestJson(ops, "/api/ops/projects/p_draft/submit-for-approval", { method: "POST", json: {} });
      const pending = await requestJson(ops, "/api/ops/approvals");
      const step = pending.body.approvals.find((item) => item.project_id === "p_draft");
      assert.ok(step);
      const estimator = new Session(baseUrl);
      const estimatorLogin = await login(estimator, "/api/ops/auth", "estimator@openframe.com.au");
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
