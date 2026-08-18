import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import {
  Session, completeAccount, freePort, login, makeRunDir, removeRunDir, requestJson,
  run, seedUserCount, staffEmail, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";

// 300s, raised from 180s (2026-08-14). This file boots a Worker and a local D1
// and then runs twenty end-to-end journeys through them; the composite test
// alone takes 50-65s and that variance is wider than the headroom 180s left.
// Measured runs were landing at 169s, 177s and 180s+ — i.e. passing or failing
// on machine load rather than on anything the code did. Raised rather than
// trimmed: every assertion in here is earning its place, and a suite that fails
// half the time teaches people to re-run it instead of read it.
test("local Worker, D1, KV, R2, auth, quote, and order journeys", { timeout: 300_000 }, async (t) => {
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
    const dbCheck = await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command", "SELECT (SELECT count(*) FROM user) AS users, (SELECT count(*) FROM project) AS projects, (SELECT count(*) FROM quote_line) AS quote_lines, (SELECT count(*) FROM [order]) AS orders, (SELECT count(*) FROM payment) AS payments; PRAGMA foreign_key_check;"], { env: wranglerEnv });
    const statements = JSON.parse(dbCheck.stdout);
    assert.deepEqual(statements[0].results[0], {
      users: seedUserCount, projects: 3, quote_lines: 4,
      orders: 1, payments: 2,
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
            width: "1200", height: "900", qty: 1,
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
        width: String(w), height: "900", qty: 1,
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
        width: "1200", height: "900", qty: 1,
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
    await t.test("staff OTP, dashboard, queue, start pricing, and quote issue", async () => {
      await login(ops, "/api/ops/auth", staffEmail);
      const summary = await requestJson(ops, "/api/ops/summary");
      assert.ok(summary.body.submissions >= 1);
      const queue = await requestJson(ops, "/api/ops/queues/submissions");
      assert.ok(queue.body.submissions.some((project) => project.id === "p_submitted"));
      await requestJson(ops, "/api/ops/projects/p_submitted/start-pricing", { method: "POST", json: {} });
      // Seeded fixture project — delivery_amount is NULL (seed.sql predates
      // 0044) and the issue gate (C7) refuses to issue on that.
      await requestJson(ops, "/api/ops/projects/p_submitted/delivery", { method: "PUT", json: { amount: 0 } });
      // No approval step: a priced quote issues directly (0033). The guard that
      // remains is the one that always mattered — every line priced and resolved.
      const issued = await requestJson(ops, "/api/ops/projects/p_submitted/issue-quote", { method: "POST", json: {} });
      assert.equal(issued.body.goods, 4550);
    });

    const sarah = new Session(baseUrl);
    let newOrder;
    await t.test("customer quote retrieval and concurrent acceptance", async () => {
      await login(sarah, "/api/auth", "sarah@northsidebuild.com.au");
      const quote = await requestJson(sarah, "/api/projects/p_submitted/quote");
      assert.equal(quote.body.live, true);
      const attempts = await Promise.all(Array.from({ length: 10 }, () => sarah.request("/api/projects/p_submitted/accept", { method: "POST" })));
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
      assert.equal(mine.lineCount, 2);
      // The contract lists the openings in the order the customer authored them
      // — the same order as the quote they accepted. Sorting by anything else
      // (a UUID, a code) silently reorders a document someone has already signed.
      const orderView = await requestJson(sarah, `/api/orders/${newOrder.id}`);
      assert.deepEqual(
        (orderView.body.order.lines ?? []).map((l) => l.code),
        quote.body.lines.map((l) => l.code),
        "the contract keeps the quote's line order",
      );
      // …and the STAFF read of the same contract agrees. It is a second query
      // over the same rows, so it can drift from the customer's on its own —
      // a staffer reading line 2 down the phone must be reading the line the
      // customer is looking at.
      const opsContract = await requestJson(ops, "/api/ops/projects/p_submitted");
      assert.deepEqual(
        (opsContract.body.orderLines ?? []).map((l) => l.code),
        quote.body.lines.map((l) => l.code),
        "the ops contract view keeps the quote's line order too",
      );
      // A stale client cannot request changes on an already-accepted quote.
      await requestJson(sarah, "/api/projects/p_submitted/request-changes", { method: "POST", json: { message: "too late" } }, 409);
    });

    await t.test("an order placed before the snapshot columns existed still shows its sizes", async () => {
      // Every order_line written before 0047 has NULL dims_json/options_json:
      // those columns did not exist, and the geometry lived inside
      // product_snapshot_json instead (issueRevision wrote `dims` and `options`
      // into the snapshot, and acceptance copied that blob onto the order).
      // The reader this replaced merged the snapshot UNDER the columns for
      // exactly that reason. Reading the columns alone renders every existing
      // order with blank sizes and no specification — the customer's own record
      // of what they bought, silently emptied by a migration.
      const line = (await sql(`SELECT id FROM order_line WHERE order_id='${newOrder.id}' AND parent_line_id IS NULL LIMIT 1`))[0];
      const legacySnapshot = JSON.stringify({
        productSlug: "amj80-series-sliding-window",
        productName: "AMJ80 Series Sliding Window",
        dims: { width: "1500", height: "1200" },
        options: { colour: "Monument" },
      }).replace(/'/g, "''");
      await sql(
        `UPDATE order_line SET dims_json=NULL, options_json=NULL, product_snapshot_json='${legacySnapshot}' WHERE id='${line.id}'`,
      );
      const view = await requestJson(sarah, `/api/orders/${newOrder.id}`);
      const legacy = (view.body.order.lines ?? []).find((l) => l.id === line.id);
      assert.ok(legacy, "the legacy line is still returned");
      assert.equal(legacy.width, "1500", "width falls back to the frozen snapshot");
      assert.equal(legacy.height, "1200", "height falls back to the frozen snapshot");
      assert.equal(legacy.options.colour, "Monument", "so does the specification");
    });

    await t.test("accept and request-changes race has exactly one workflow winner", async () => {
      await run(process.execPath, [
        wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state,
        "--command",
        `INSERT INTO project
           (id, owner_user_id, title, public_ref, status_customer, status_internal, delivery_amount)
         VALUES
           ('p_accept_change_race','u_sarah','Race quote','OF-Q-19991','quote_issued','issued',0);
         INSERT INTO quote_line
           (id, project_id, external_ref, product_slug, dims_json, options_json, qty, line_total, status, position)
         VALUES
           ('ql_accept_change_race','p_accept_change_race','W01',
            'amj80-series-awning-window','{"width":"900","height":"1200"}',
            '{}',1,1250,'ready',0);`,
      ], { env: wranglerEnv });

      const [accept, changes] = await Promise.all([
        sarah.request("/api/projects/p_accept_change_race/accept", { method: "POST" }),
        sarah.request("/api/projects/p_accept_change_race/request-changes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Please reconsider the glass specification" }),
        }),
      ]);
      assert.deepEqual([accept.status, changes.status].sort(), [200, 409]);

      const check = await run(process.execPath, [
        wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state,
        "--json", "--command",
        `SELECT p.status_customer, p.status_internal,
                (SELECT count(*) FROM "order" WHERE project_id=p.id) AS orders
           FROM project p
          WHERE p.id='p_accept_change_race';`,
      ], { env: wranglerEnv });
      const row = JSON.parse(check.stdout)[0].results[0];
      if (accept.status === 200) {
        assert.deepEqual(row, {
          status_customer: "closed", status_internal: "issued", orders: 1,
        });
      } else {
        assert.deepEqual(row, {
          status_customer: "under_review", status_internal: "estimator_assigned", orders: 0,
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
    // Since registration Phase 1 the submitter is always an account holder (the
    // anonymous submit path is gone), but the legacy guest-tracking flow is
    // untouched and must keep working — a person who signed in once, submitted,
    // and later came back on a device with no session still tracks by reference
    // and email (A1/D10, AC-37).
    await t.test("a submitted quote is trackable by its OF-Q reference", async () => {
      const guest = new Session(baseUrl);
      const email = "anon.tracker@example.com";
      const saved = await requestJson(guest, "/api/projects/current/lines", {
        method: "PUT",
        json: {
          title: "Guest tracking project",
          items: [{
            code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
            width: "1200", height: "900", qty: 1,
            options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
            lineTotal: 1,
          }],
        },
      });
      const projectId = saved.body.project.id;
      const ref = saved.body.project.ref;
      assert.match(ref, /^OF-Q-\d+$/);

      // The claim cookie as it stood BEFORE sign-in, kept for the authorisation
      // assertion further down.
      const claimOnlyCookies = new Map(guest.cookies);

      // The gate: sign in (which claims the draft), complete the account, submit.
      await login(guest, "/api/auth", email);
      await completeAccount(guest, { name: "Anon Tester" });
      await requestJson(guest, `/api/projects/${projectId}/submit`, {
        method: "POST",
        json: { delivery: { suburb: "Rowville", postcode: "3178" } },
      });
      // …and then this device forgets the session, which is the situation the
      // guest-tracking flow exists for.
      await requestJson(guest, "/api/auth/logout", { method: "POST" });

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
      cookieOnly.cookies = claimOnlyCookies;
      cookieOnly.cookies.delete("apertly_guest");
      await requestJson(cookieOnly, `/api/projects/${projectId}/quote`, {}, 404);
      // …and with the verified guest session, the same request resolves. (This
      // project is submitted, not issued, so the body says live:false — the
      // point here is the 200 vs the 404, which is the authorisation boundary.)
      const guestQuote = await requestJson(guest, `/api/projects/${projectId}/quote`);
      assert.equal(guestQuote.body.live, false);

      // Signing out drops the session, so a shared machine keeps nothing.
      // Navigating away and back must NOT demand the code again: the credential
      // is an httpOnly cookie that lives until the browser closes, so a fresh
      // page load resolves the same session. (The UI resumes from this call.)
      const resumed = await requestJson(guest, "/api/guest/record");
      assert.equal(resumed.body.id, projectId, "the session resumes without re-verifying");

      await requestJson(guest, "/api/guest/signout", { method: "POST" });
      await requestJson(guest, "/api/guest/record", {}, 404);
    });

    // A composite is ONE opening built as several joined units. The customer
    // authored one line and must keep seeing one line: their tag, their count,
    // one price. Getting this wrong reads to them as double-charging.
    await t.test("composite: one opening, segments nested, nothing double-counted", async () => {
      // Self-contained: a fresh project, submitted, so it is in a state a
      // reviewer may act on regardless of what earlier tests did. Registered,
      // not anonymous: the claim cookie stops granting access once the project
      // leaves 'draft' (worker/lib/access.ts), and this test follows the
      // opening all the way through acceptance.
      const cust = new Session(baseUrl);
      await login(cust, "/api/auth", "composite-journey@example.com");
      const made = await requestJson(cust, "/api/projects/current/lines", {
        method: "PUT",
        json: {
          title: "Composite project",
          items: [{
            code: "W12", location: "Living", productSlug: "amj80-series-sliding-window",
            width: "1200", height: "900", qty: 1,
            options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
            lineTotal: 1,
          }],
        },
      });
      const projectId = made.body.project.id;
      const parentId = made.body.items[0].id;
      const openingTotal = made.body.items[0].lineTotal;
      await completeAccount(cust, { name: "Composite Tester" });
      await requestJson(cust, `/api/projects/${projectId}/submit`, {
        method: "POST",
        json: { delivery: { suburb: "Rowville", postcode: "3178" } },
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

      // Every unit INHERITS the opening's spec. Creating them with no options was
      // discarding the customer's colour and hardware — and, because most option
      // rows carry a surcharge, re-pricing the units as bare product.
      const specs = await sql(`SELECT options_json FROM quote_line WHERE parent_line_id='${parentId}' ORDER BY segment_seq`);
      const openingSpec = (await sql(`SELECT options_json FROM quote_line WHERE id='${parentId}'`))[0].options_json;
      for (const s of specs) {
        assert.equal(s.options_json, openingSpec, "a unit is built to the opening's spec, not to a blank one");
      }

      // PRICE THE UNITS, NOT THE OPENING (0046). A parent's total is Σ(segments)
      // — composite.ts's single-writer invariant — so an override written to the
      // parent would be erased by the next recomputeComposite. Refused loudly
      // rather than accepted and quietly undone later.
      await requestJson(ops, `/api/ops/lines/${parentId}/price`, { method: "PUT", json: { total: 999 } }, 409);
      const priceUnits = await sql(`SELECT id FROM quote_line WHERE parent_line_id='${parentId}' ORDER BY segment_seq`);
      const pricedUnit = await requestJson(ops, `/api/ops/lines/${priceUnits[0].id}/price`,
        { method: "PUT", json: { total: 500 } });
      assert.equal(pricedUnit.body.ok, true, "a UNIT takes an override");
      // …and the opening follows its units, still exactly their sum.
      const afterUnitPrice = await requestJson(ops, `/api/ops/projects/${projectId}`);
      const segsAfter = await sql(`SELECT line_total FROM quote_line WHERE parent_line_id='${parentId}'`);
      assert.equal(afterUnitPrice.body.lines[0].lineTotal, segsAfter.reduce((n, x) => n + x.line_total, 0),
        "the opening total is STILL the sum of its units after one was adjusted");
      // Restore, so the assertions below still read the engine's own figures.
      await requestJson(ops, `/api/ops/lines/${priceUnits[0].id}/price`, { method: "PUT", json: { total: null } });

      // Splitting again is REFUSED. splitLine deletes every unit and recreates
      // it, which destroys per-unit products and specs that a reviewer set by
      // hand; changing a composite goes through the per-unit endpoints instead.
      await requestJson(ops, `/api/ops/lines/${parentId}/split`, {
        method: "POST",
        json: { segments: [{ widthMm: 600, heightMm: 900, productSlug: "amj80-series-sliding-window" },
                           { widthMm: 600, heightMm: 900, productSlug: "amj80-series-sliding-window" }] },
      }, 409);

      // One unit changes; its siblings and their spec survive untouched, and the
      // opening's total follows the units rather than being priced on its own.
      const before = await sql(`SELECT id, product_slug, line_total FROM quote_line WHERE parent_line_id='${parentId}' ORDER BY segment_seq`);
      await requestJson(ops, `/api/ops/segments/${before[1].id}`, {
        method: "PATCH", json: { productSlug: "amj80-series-awning-window" },
      });
      const after = await sql(`SELECT id, product_slug, line_total FROM quote_line WHERE parent_line_id='${parentId}' ORDER BY segment_seq`);
      assert.equal(after[0].product_slug, before[0].product_slug, "the other unit is untouched");
      assert.equal(after[1].product_slug, "amj80-series-awning-window", "the edited unit changed");
      const reread = await requestJson(ops, `/api/ops/projects/${projectId}`);
      assert.equal(
        reread.body.lines[0].lineTotal,
        after.reduce((n, x) => n + x.line_total, 0),
        "the opening total still IS the sum of its units after a per-unit edit",
      );

      // The opening's own inputs must not price it as a single frame. This used
      // to overwrite the sum of the units with a whole-opening figure.
      const sumBefore = after.reduce((n, x) => n + x.line_total, 0);
      await requestJson(ops, `/api/ops/lines/${parentId}`, { method: "PATCH", json: { qty: 2 } });
      const parentAfterQty = await sql(`SELECT line_total FROM quote_line WHERE id='${parentId}'`);
      const segsAfterQty = await sql(`SELECT qty, line_total FROM quote_line WHERE parent_line_id='${parentId}'`);
      assert.equal(
        parentAfterQty[0].line_total,
        segsAfterQty.reduce((n, x) => n + x.line_total, 0),
        "a composite parent is never priced directly",
      );
      assert.notEqual(sumBefore, null);
      for (const s of segsAfterQty) assert.equal(s.qty, 2, "unit qty is re-derived from the opening's");

      // Units cannot be reached through the openings endpoint — it writes qty
      // directly and never re-derives the parent.
      await requestJson(ops, `/api/ops/lines/${after[0].id}`, { method: "PATCH", json: { qty: 9 } }, 404);

      // A composite cannot be whittled below two units; that is a merge.
      await requestJson(ops, `/api/ops/segments/${after[1].id}`, { method: "DELETE" }, 400);

      // A CUSTOMER can edit units only through the dedicated draft-owner API.
      //
      // The generic line-save endpoint deliberately excludes nested segments.
      // Draft-owner segment changes go through the same recomputing domain
      // operations as Ops, so a customer edit cannot leave the parent stale.
      const unitIds = (await sql(`SELECT id FROM quote_line WHERE parent_line_id='${parentId}'`)).map((r) => r.id);
      await sql(`UPDATE project SET status_customer='draft' WHERE id='${projectId}'`);
      await requestJson(cust, `/api/projects/current/segments/${unitIds[1]}`, {
        method: "PATCH", json: { productSlug: "amj100t-fixed-window", alongMm: 650, options: {} },
      });
      let customerView = await requestJson(cust, "/api/projects/current");
      assert.equal(customerView.body.items.length, 1, "units remain nested under one parent opening");
      assert.equal(customerView.body.items[0].segments[1].productSlug, "amj100t-fixed-window");
      assert.equal(customerView.body.items[0].segments[1].width, "650");
      assert.ok(customerView.body.items[0].review.customerCompositeChanged);

      // A UNIT CARRIES A NOTE, on both paths, in the same column an opening's
      // note uses (owner: "a child record is carrying exactly the same
      // information as a childless parent, except that it has a linked parent
      // — so reuse whatever is used there"). No migration: room_label already
      // existed on segment rows, bound as a literal NULL by both INSERT paths.
      assert.equal(customerView.body.items[0].segments[1].note, "", "a unit starts with no note");
      await requestJson(cust, `/api/projects/current/segments/${unitIds[1]}`, {
        method: "PATCH", json: { note: "left leaf, obscure glass" },
      });
      customerView = await requestJson(cust, "/api/projects/current");
      assert.equal(customerView.body.items[0].segments[1].note, "left leaf, obscure glass");
      assert.equal(customerView.body.items[0].segments[0].note, "", "its sibling is untouched");
      // Absent ⇒ unchanged; blank ⇒ cleared. Clearing a note is an edit.
      await requestJson(cust, `/api/projects/current/segments/${unitIds[1]}`, {
        method: "PATCH", json: { alongMm: 655 },
      });
      customerView = await requestJson(cust, "/api/projects/current");
      assert.equal(customerView.body.items[0].segments[1].note, "left leaf, obscure glass",
        "an unrelated edit does not drop the note");
      // …and ops sees the same field, and can write it.
      const opsUnitView = await requestJson(ops, `/api/ops/projects/${projectId}`);
      assert.equal(opsUnitView.body.lines[0].segments[1].note, "left leaf, obscure glass");

      // ACROSS the split is settable from OPS as well as from the customer.
      // The route had no such parameter at any layer while the console rendered
      // the field editable and captioned it as locked, so a reviewer's
      // correction was accepted, saved, and silently discarded.
      const acrossBefore = await sql(`SELECT dims_json FROM quote_line WHERE id='${unitIds[1]}'`);
      assert.equal(JSON.parse(acrossBefore[0].dims_json).height, "900");
      await requestJson(ops, `/api/ops/segments/${unitIds[1]}`, {
        method: "PATCH", json: { acrossMm: 910 },
      });
      const acrossAfter = await sql(`SELECT dims_json FROM quote_line WHERE id='${unitIds[1]}'`);
      assert.equal(JSON.parse(acrossAfter[0].dims_json).height, "910", "ops can repair an across mismatch");
      assert.equal(JSON.parse(acrossAfter[0].dims_json).width, "655", "and the along axis is untouched");
      // Put it back, so the assertions below still describe a well-formed split.
      await requestJson(ops, `/api/ops/segments/${unitIds[1]}`, { method: "PATCH", json: { acrossMm: 900 } });

      // The customer cannot change how MANY units an opening has (owner,
      // 2026-08-04). They can neither create a composite nor merge one back, so
      // being able to add and remove units was the same power by another route —
      // a two-unit opening could become four. Both endpoints are gone, and 404
      // is asserted rather than assumed: a removed route that silently still
      // answers is the failure this guards.
      await requestJson(cust, `/api/projects/current/lines/${parentId}/segments`, {
        method: "POST", json: { productSlug: "amj100t-fixed-window", options: {}, alongMm: 650 },
      }, 404);
      await requestJson(cust, `/api/projects/current/segments/${unitIds[1]}`, { method: "DELETE" }, 404);
      const afterBlockedCount = await requestJson(cust, "/api/projects/current");
      assert.equal(afterBlockedCount.body.items[0].segments.length, 2, "the unit count is not the customer's to change");

      // Editing a unit remains theirs, and still only through the dedicated
      // operation — a stranger's session gets nothing.
      await requestJson(new Session(baseUrl), `/api/projects/current/segments/${unitIds[0]}`, {
        method: "PATCH", json: { alongMm: 500 },
      }, 404);

      // The broad parent snapshot still cannot mutate a unit. Dedicated unit
      // operations are the only path, so parent recomputation cannot be skipped.
      await requestJson(cust, "/api/projects/current/lines", {
        method: "PUT",
        json: { items: [], removedIds: unitIds },
      });
      assert.equal(
        (await sql(`SELECT id FROM quote_line WHERE parent_line_id='${parentId}'`)).length,
        unitIds.length,
        "a customer save must not delete the units of a composite",
      );
      await sql(`UPDATE project SET status_customer='under_review' WHERE id='${projectId}'`);

      // Merging restores the fit warning: the reason for splitting is still true,
      // so an unbuildable single unit must never come back as Ready.
      await requestJson(ops, `/api/ops/lines/${parentId}/merge`, { method: "POST" });

      // A geometry that cannot be built is refused, naming the offending unit.
      // Attempted on the merged (simple) line, since a composite is refused first.
      const bad = await requestJson(ops, `/api/ops/lines/${parentId}/split`, {
        method: "POST",
        json: { segments: [{ widthMm: 600, heightMm: 500, productSlug: "amj80-series-sliding-window" },
                           { widthMm: 600, heightMm: 900, productSlug: "amj80-series-sliding-window" }] },
      }, 400);
      assert.ok(bad.body.errors.some((e) => /Unit 1 is 500mm across/.test(e)));
      const merged = await requestJson(ops, `/api/ops/projects/${projectId}`);
      assert.equal(merged.body.lines.length, 1);
      assert.equal((await sql(`SELECT id FROM quote_line WHERE parent_line_id='${parentId}'`)).length, 0, "units are gone after a merge");
      assert.ok(merged.body.lines[0].review?.fit, "merging restores the fit warning");

      // ISSUING charges the opening ONCE. Last, because issuing moves the project
      // out of the states line edits are accepted in.
      //
      // The revision query had no parent guard, so it summed the composite parent
      // AND every unit inside it: a project ops priced at $9,800 issued at
      // $16,400, with the units on the customer's quote as extra lines carrying no
      // item code. That is the double-charge CompositePanel writes "included"
      // instead of an amount to prevent, arriving through the snapshot rather
      // than through the screen.
      await requestJson(ops, `/api/ops/lines/${parentId}/split`, {
        method: "POST",
        json: { axis: "vertical", segments: [
          { widthMm: 600, heightMm: 900, productSlug: "amj80-series-sliding-window", qtyPerParent: 1 },
          { widthMm: 600, heightMm: 900, productSlug: "amj80-series-sliding-window", qtyPerParent: 1 },
        ] },
      });
      // Give the opening an AI proposal that matches it EXACTLY — same product,
      // same size, same quantity — so sameCoreConfiguration is true and the only
      // thing standing between this outcome and an "approved" ranking lesson is
      // the composite guard itself. Without that guard this fixture trains the
      // ranker to believe an oversized single unit was the right answer.
      const aiSeed = await sql(`SELECT product_slug, dims_json, qty, line_total FROM quote_line WHERE id='${parentId}'`);
      const { product_slug: aiSlug, dims_json: aiDims, qty: aiQty } = aiSeed[0];
      const dims = JSON.parse(aiDims);
      // Single-line SQL: wrangler's --command does not accept embedded newlines.
      await sql(`INSERT INTO ai_runs (id, project_id, pipeline_version) VALUES ('run_c1','${projectId}','test')`);
      await sql(`INSERT INTO building_models (id, project_id, ai_run_id, schema_version, model_json, confidence_json) VALUES ('bm_c1','${projectId}','run_c1','building-model/1.0','{}','{}')`);
      await sql(`INSERT INTO ai_proposal (id, project_id, ai_run_id, source_generation, source_manifest_hash, pipeline_version) VALUES ('prop_c1','${projectId}','run_c1',1,'hash','test')`);
      await sql(`INSERT INTO opening_instance (id, project_id) VALUES ('open_c1','${projectId}')`);
      // ranking_context_json — NOT dimensions_json — is what the outcome capture
      // reads the proposed size and quantity from, so it is what decides whether
      // sameCoreConfiguration holds.
      const ctx = `{"dimensions":{"widthMm":${Number(dims.width)},"heightMm":${Number(dims.height)}},"quantity":${aiQty},"family":"sliding-window","operationType":"sliding"}`;
      await sql(`INSERT INTO ai_proposal_line (id, proposal_id, project_id, opening_id, quote_line_id, quantity, dimensions_json, ranking_context_json, product_id, product_slug, catalogue_revision, configuration_json, price_snapshot_json, recommendation_basis, confidence_band, review_required, applied_to_cart, created_at) VALUES ('apl_c1','prop_c1','${projectId}','open_c1','${parentId}',${aiQty},'{"widthMm":${Number(dims.width)},"heightMm":${Number(dims.height)}}','${ctx}','prod','${aiSlug}','rev1','{"options":{}}','{"total":${aiSeed[0].line_total}}','test','high',0,1,datetime('now'))`);
      await sql(`UPDATE quote_line SET ai_proposal_line_id='apl_c1' WHERE id='${parentId}'`);

      const opsView = await requestJson(ops, `/api/ops/projects/${projectId}`);
      assert.equal(opsView.body.lines[0].segments.length, 2, "the composite is back for the issue check");
      const opsTotal = opsView.body.lines.reduce((n, l) => n + (l.lineTotal ?? 0), 0);
      // The issue gate (C7) requires delivery to be settled before a quote can
      // be issued at all.
      await requestJson(ops, `/api/ops/projects/${projectId}/delivery`, { method: "PUT", json: { amount: 0 } });
      const issued = await requestJson(ops, `/api/ops/projects/${projectId}/issue-quote`, { method: "POST" });
      // issued.body.total is now goods + delivery (C8) — this test targets
      // GOODS, not the header total, so it does not assert that delivery
      // does not exist. See T-B23 (scripts/tests/delivery.test.mjs) for the
      // goods+delivery correctness this test does not need to re-cover.
      assert.equal(issued.body.goods, opsTotal, "the issued goods total is the total the reviewer approved");
      // There is no separate issued snapshot any more (docs/quote-revisions-
      // removal-plan.md) — the issued lines ARE the parent quote_line rows.
      const issuedLines = await sql(
        `SELECT external_ref, line_total FROM quote_line WHERE project_id='${projectId}' AND parent_line_id IS NULL`,
      );
      assert.equal(issuedLines.length, opsView.body.lines.length, "one issued line per opening, never per unit");
      assert.ok(issuedLines.every((l) => l.external_ref), "no issued line is missing its item code");

      // The LEARNING signal must not read a composite as an endorsement.
      //
      // A split changes none of the fields sameCoreConfiguration compares — the
      // opening keeps the product the AI chose and its size never moves — so
      // "no single unit is made this wide, build it as two" scored as
      // core-configuration-unchanged and trained the ranker as an approved
      // lesson saying the oversized single unit was right. It stays `pending`
      // for a human now, and carries a reason code naming the cause.
      await requestJson(ops, "/api/ops/learning-outbox/drain", { method: "POST" });
      const outcomes = await sql(
        `SELECT quality_state, recommendation_eligible, reason_code
           FROM recommendation_outcome
          WHERE quote_line_id='${parentId}'`,
      );
      for (const o of outcomes) {
        assert.equal(o.recommendation_eligible, 0, "a composite is never an auto-approved recommendation");
        assert.equal(o.quality_state, "pending", "a composite outcome waits for a human");
        assert.equal(o.reason_code, "HUMAN_BUILT_AS_COMPOSITE", "the cause is named, not bucketed as unspecified");
      }
      const examples = await sql(
        `SELECT project_id, eligible_for_retrieval, eligible_for_training, quality_state
           FROM learning_examples
          WHERE project_id='${projectId}'`,
      );
      assert.equal(examples.length, 1, "issuance creates one immutable AI-vs-human learning example");
      assert.equal(examples[0].eligible_for_retrieval, 0, "an unadjudicated adjustment cannot enter retrieval");
      assert.equal(examples[0].eligible_for_training, 0, "per-quote issuance never trains model weights");
      assert.equal(examples[0].quality_state, "pending");

      const review = await requestJson(ops, `/api/ops/projects/${projectId}/recommendation-outcomes`);
      assert.ok(review.body.reasonOptions.some((reason) => reason.code === "MANUFACTURING_REVIEW"));
      const pendingOutcome = review.body.outcomes.find((outcome) => outcome.quality_state === "pending");
      await requestJson(ops, `/api/ops/recommendation-outcomes/${pendingOutcome.id}`, {
        method: "PATCH",
        json: { action: "approve", reasonCode: "MANUFACTURING_REVIEW" },
      });
      const governed = await sql(
        `SELECT eligible_for_retrieval, quality_state FROM learning_examples
          WHERE project_id='${projectId}'`,
      );
      assert.equal(governed[0].eligible_for_retrieval, 0,
        "a manufacturing-only correction remains outside product/thermal retrieval");
      assert.equal(governed[0].quality_state, "rejected",
        "a fully classified but non-learnable project example is closed, not left pending");

      // …AND THE UNITS SURVIVE ACCEPTANCE. The order is the one freeze that
      // legally matters, and production has to see what it makes: an opening
      // built as two joined units, not the pre-split parent frame. order_line
      // carries the units since 0047, so the customer's order view serves the
      // SAME nested shape the quote does — one wire shape, one list component
      // at every stage (docs/quote-revisions-removal-plan.md step 6).
      // Read the quote BEFORE accepting — afterwards it is no longer live.
      const quoteSeen = (await requestJson(cust, `/api/projects/${projectId}/quote`)).body;
      const accepted = await requestJson(cust, `/api/projects/${projectId}/accept`, { method: "POST" });
      // The order VIEW is the read path that has to carry them — the accept
      // response stays lean, and the list DTO never pays for a per-order line
      // query it does not render.
      const orderView = await requestJson(cust, `/api/orders/${accepted.body.order.id}`);
      const orderLines = orderView.body.order.lines ?? [];
      // The contract lists the openings in the order the customer authored them
      // — the same order as the quote they accepted. Sorting by anything else
      // (a UUID, a code) reorders a document someone has already signed.
      assert.deepEqual(
        orderLines.map((l) => l.code),
        (quoteSeen.lines ?? []).map((l) => l.code),
        "the contract keeps the quote's line order",
      );
      // …and names the same destination. "Delivery to your site" beside a quote
      // that said "Delivery to 3070" is the shared panel drifting apart again.
      assert.equal(orderView.body.order.deliveryPostcode, quoteSeen.deliveryPostcode,
        "the order names the destination the quote named");
      assert.equal(orderLines.length, 1, "one order line per opening, never one per unit");
      const opening = orderLines[0];
      assert.equal(opening.code, "W12", "the opening keeps the architect's tag");
      assert.equal(opening.location, "Living", "and its room");
      // Against the reviewer's own last view, not a literal — this opening's
      // quantity was edited during the test, and the contract must carry what
      // was approved rather than what was first authored.
      assert.equal(opening.qty, opsView.body.lines[0].qty, "the contracted quantity is the approved one");
      assert.equal(opening.segments?.length, 2, "the units survive into the contract");
      // Display-only, exactly as on the quote: the parent's lineTotal is the
      // authoritative figure and a client must never sum the units.
      assert.equal(opening.lineTotal, opsTotal, "the opening carries the contracted price");
      assert.ok(opening.segments.every((u) => u.productSlug), "each unit names the product it is built from");
      assert.ok(opening.segments.every((u) => u.width && u.height), "each unit carries its own size");
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
      const prod = await customer.request("/products/amj80-series-sliding-window");
      assert.equal(prod.status, 200, "a real page is a 200");
      const prodHtml = await prod.text();
      assert.ok(prodHtml.includes("AMJ80 Series Sliding Window"), "product head is rendered server-side");

      // ── A page that does not exist says so, with the status to match ────────
      // These used to answer 200 with the home page: a soft 404. Every mistyped
      // or stale URL became a duplicate of the front page, indexable, and the
      // visitor was never told the link was wrong. Unknown product slugs were
      // worse — they served products[0], a real product under someone else's URL.
      for (const [path, why] of [
        ["/nonsense", "an unknown path"],
        ["/products/does-not-exist", "an unknown product slug"],
        ["/resources/does-not-exist", "an unknown post slug"],
      ]) {
        const res = await customer.request(path);
        assert.equal(res.status, 404, `${why} answers 404`);
        const body = await res.text();
        // Still the SPA shell — the client renders a branded 404 page. Status and
        // body are allowed to disagree in this direction, and must.
        assert.ok(body.includes("og:title"), `${why} still serves the app shell`);
        assert.ok(/content="noindex"/.test(body), `${why} is not offered for indexing`);
      }

      const sitemap = await customer.request("/sitemap.xml");
      assert.equal(sitemap.status, 200);
      const xml = await sitemap.text();
      // The namespace must be sitemapS.org — a one-letter slip makes the whole
      // document invalid to every crawler that validates it.
      assert.ok(xml.includes("http://www.sitemaps.org/schemas/sitemap/0.9"), "correct sitemap namespace");
      assert.ok(xml.includes("how-it-works"));
      assert.ok(xml.includes("products/amj80-series-sliding-window"), "products are listed individually");

      const robots = await customer.request("/robots.txt");
      assert.equal(robots.status, 200);
      // APP_ENV is development here, so it must REFUSE crawling: a non-production
      // deployment getting indexed is the failure mode this guards.
      assert.ok((await robots.text()).includes("Disallow"));
    });

    await t.test("customer and ops SPA fallback plus real static assets", async () => {
      // A REAL client route with no file behind it — that is what "SPA fallback"
      // has to prove. It used to use /catalogue/deep-link, an address the router
      // does not know; that passed only because every unknown path answered 200
      // with the home page. Now an unknown path is a 404 (asserted in the crawler
      // test above), so the fallback has to be shown on a route that exists.
      const customerShell = await customer.request("/projects");
      assert.equal(customerShell.status, 200, "a real client route is served the shell, not an asset 404");
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

    await t.test("security headers are on every exit path", async () => {
      // The repository had three security headers, all on private file downloads.
      // Shells, assets and API responses carried none. These assert the policy is
      // attached where it was missing, not that a particular directive is correct.
      const must = ["x-content-type-options", "referrer-policy", "x-frame-options", "permissions-policy"];
      const check = (res, what) => {
        for (const h of must) assert.ok(res.headers.get(h), `${what}: missing ${h}`);
        assert.equal(res.headers.get("x-frame-options"), "DENY", `${what}: framable`);
      };

      const shell = await customer.request("/projects");
      check(shell, "customer shell");
      // HTML gets the full policy. It ships Report-Only first on purpose — a CSP
      // that silently blanks the map is worse than none — so accept either name,
      // and assert the directives that actually matter for this app.
      const csp = shell.headers.get("content-security-policy")
        ?? shell.headers.get("content-security-policy-report-only");
      assert.ok(csp, "customer shell: no CSP at all");
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /object-src 'none'/);
      // script-src is strict: no unsafe-inline, no unsafe-eval. style-src keeps
      // unsafe-inline (MUI/emotion inject at runtime) and that is documented.
      const scriptSrc = csp.split(";").map((s) => s.trim()).find((s) => s.startsWith("script-src"));
      assert.ok(scriptSrc && !scriptSrc.includes("unsafe-inline") && !scriptSrc.includes("unsafe-eval"),
        `script-src must stay strict, got: ${scriptSrc}`);
      // The origins the app genuinely loads must be present, or the enforcing
      // flip will break the contact map, the imagery and the captcha.
      for (const origin of ["https://cdn.sanity.io", "https://images.unsplash.com",
        "https://*.basemaps.cartocdn.com", "https://challenges.cloudflare.com", "https://fonts.gstatic.com"]) {
        assert.ok(csp.includes(origin), `CSP is missing ${origin}`);
      }

      check(await customer.request("/api/health"), "API json");
      const asset = (await customer.request("/projects").then((r) => r.text()))
        .match(/(?:src|href)="(\/assets\/[^"]+)"/)?.[1];
      assert.ok(asset, "no hashed asset in the shell to check");
      check(await customer.request(asset), "static asset");

      // No HSTS over plain http, whatever APP_ENV says — it would pin the browser
      // to https://localhost and break the next dev run.
      assert.equal(shell.headers.get("strict-transport-security"), null, "HSTS must not be set over http");

      // A 301 carries no body; building the new Response wrong here throws rather
      // than merely dropping a header, so this path needs its own assertion.
      const redirect = await customer.request("/products/", { redirect: "manual" });
      assert.equal(redirect.status, 301);
      assert.ok(redirect.headers.get("x-content-type-options"), "redirect lost the policy");
    });

    // "estimator cannot delegate an approval to self" lived here. Delegation, the
    // approval step and the estimator role are all gone (0033), so the behaviour it
    // guarded no longer exists to be guarded.

    await t.test("unauthenticated legacy staff seam is forbidden", async () => {
      const response = await fetch(`${baseUrl}/api/projects/p_draft/issue-quote`, { method: "POST" });
      assert.equal(response.status, 403);
    });

    await t.test("thermal audit: every stored line appears, with or without a target", async () => {
      // Staff only — the audit exposes what the machine decided and why, which is
      // an internal surface.
      const anon = await fetch(`${baseUrl}/api/ops/projects/p_draft/thermal`);
      assert.equal(anon.status, 403, "an unauthenticated caller cannot read the audit");

      const projectId = "p_thermal_audit";
      await sql(`INSERT INTO project (id, title, status_customer) VALUES ('${projectId}','Thermal audit fixture','draft')`);
      // (1) An AI line WITH a target its glass cannot meet.
      await sql(`INSERT INTO quote_line (id, project_id, external_ref, product_slug, options_json, dims_json, qty, line_total, status, position, origin) VALUES ('ql_miss','${projectId}','W1','amj100t-series-awning-window','{}','{"width":"850","height":"1800"}',1,730,'technical_review',0,'ai')`);
      await sql(`INSERT INTO opening_instance (id, project_id, quote_line_id, external_ref, family, operation_type, width_mm, height_mm, requirements_json, requirement_basis, status) VALUES ('open_miss','${projectId}','ql_miss','W1','windows','awning',850,1800,'{"maxUValue":2.27,"minShgc":0.37,"maxShgc":0.41}','explicit_energy_report','commercial_only_estimate')`);
      await sql(`INSERT INTO ai_runs (id, project_id, pipeline_version) VALUES ('run_ta','${projectId}','test')`);
      await sql(`INSERT INTO ai_proposal (id, project_id, ai_run_id, source_generation, source_manifest_hash, pipeline_version) VALUES ('prop_ta','${projectId}','run_ta',1,'h','test')`);
      await sql(`INSERT INTO ai_proposal_line (id, proposal_id, project_id, opening_id, quote_line_id, quantity, dimensions_json, ranking_context_json, product_id, product_slug, catalogue_revision, configuration_json, performance_json, price_snapshot_json, recommendation_basis, confidence_band, review_required, applied_to_cart, created_at) VALUES ('apl_miss','prop_ta','${projectId}','open_miss','ql_miss',1,'{}','{}','prod','amj100t-series-awning-window','rev1','{}','{"uw":3.6,"shgc":0.42,"source":"certified","certified":true}','{"total":730}','energy_report','medium',1,1,datetime('now'))`);
      await sql(`UPDATE quote_line SET ai_proposal_line_id='apl_miss' WHERE id='ql_miss'`);
      // (2) A schedule-only line: no opening_instance, so no target was ever derived.
      await sql(`INSERT INTO quote_line (id, project_id, external_ref, product_slug, options_json, dims_json, qty, line_total, status, position, origin) VALUES ('ql_none','${projectId}','W2','amj80-series-awning-window','{}','{"width":"900","height":"1200"}',1,500,'ready',1,'schedule')`);

      const audit = await requestJson(ops, `/api/ops/projects/${projectId}/thermal`);
      const byRef = Object.fromEntries(audit.body.rows.map((r) => [r.ref, r]));

      const missed = byRef.W1;
      assert.equal(missed.verdict, "missed", "3.6 against a 2.27 cap is a miss, not a pass");
      assert.equal(missed.target.maxUValue, 2.27, "the parsed target is reported as parsed");
      assert.equal(missed.target.basis, "explicit_energy_report");
      assert.equal(missed.proposed.uw, 3.6, "the proposed glass's own performance sits beside the target");
      // The SIZE of the miss is what distinguishes a rounding argument from a redesign.
      assert.equal(missed.miss.uw, 1.33, "Uw overshoot is reported, not just the fact of it");
      assert.equal(missed.miss.shgc, 0.01, "the SHGC overshoot is reported on its own axis");

      const noTarget = byRef.W2;
      assert.equal(noTarget.verdict, "no_target", "a line that never went through derivation says so");
      assert.equal(noTarget.target, null);
      assert.ok(audit.body.rows.length >= 2, "a schedule-only line is listed, never silently omitted");
      assert.equal(audit.body.rows.filter((r) => r.verdict === "missed").length, 1);
      assert.equal(audit.body.rows.filter((r) => r.verdict === "no_target").length, 1);
      // Every quote_line writer stores dimensions as STRINGS. A number-only
      // coercion blanked the size of every unit and every schedule line in
      // production while numeric fixtures kept the tests green.
      assert.equal(missed.widthMm, 850, "a string dimension is still a dimension");
      assert.equal(missed.heightMm, 1800);
    });

    await t.test("thermal audit: a composite groups its units, and each unit is judged", async () => {
      const projectId = "p_thermal_composite";
      await sql(`INSERT INTO project (id, title, status_customer) VALUES ('${projectId}','Composite audit fixture','draft')`);
      await sql(`INSERT INTO ai_runs (id, project_id, pipeline_version) VALUES ('run_tc','${projectId}','test')`);
      // W7 — the report NAMED its two components, so each unit has its own code and
      // its own target. W9 — we split it ourselves, so it has neither.
      const model = JSON.stringify({
        openings: [{
          externalRef: "W7",
          thermalComponents: [
            // A real building model carries each component's own parsed band —
            // this is where a unit's frozen target comes from.
            { ref: "W7A", operationType: "awning", widthMm: 905, heightMm: 854,
              requirement: { basis: "explicit_energy_report", maxUValue: 2.27, shgcMin: 0.37, shgcMax: 0.41 } },
            { ref: "W7B", operationType: "sliding", widthMm: 905, heightMm: 854,
              requirement: { basis: "explicit_energy_report", maxUValue: 1.69, shgcMin: 0.5, shgcMax: 0.56 } },
          ],
        }],
      }).replace(/'/g, "''");
      await sql(`INSERT INTO building_models (id, project_id, ai_run_id, schema_version, model_json, confidence_json) VALUES ('bm_tc','${projectId}','run_tc','building-model/1.1','${model}','{}')`);

      await sql(`INSERT INTO quote_line (id, project_id, external_ref, product_slug, options_json, dims_json, qty, line_total, status, position, origin, line_kind) VALUES ('ql_p7','${projectId}','W7','amj80-series-awning-window','{}','{"width":"1810","height":"854"}',1,900,'ready',0,'ai','composite_parent')`);
      await sql(`INSERT INTO opening_instance (id, project_id, quote_line_id, external_ref, family, operation_type, width_mm, height_mm, requirements_json, requirement_basis, status) VALUES ('op_p7','${projectId}','ql_p7','W7','windows','awning',1810,854,'{"maxUValue":1.69,"minShgc":null,"maxShgc":null}','explicit_energy_report','ready')`);
      await sql(`INSERT INTO quote_line (id, project_id, product_slug, options_json, dims_json, qty, line_total, status, position, origin, line_kind, parent_line_id, segment_seq, segment_requirements_json, segment_requirement_basis) VALUES ('ql_s7a','${projectId}','amj80-series-awning-window','{}','{"width":"905","height":"854"}',1,450,'ready',1,'ai','segment','ql_p7',0,'{"maxUValue":2.27,"minShgc":0.37,"maxShgc":0.41}','explicit_energy_report')`);
      await sql(`INSERT INTO quote_line (id, project_id, product_slug, options_json, dims_json, qty, line_total, status, position, origin, line_kind, parent_line_id, segment_seq, segment_requirements_json, segment_requirement_basis) VALUES ('ql_s7b','${projectId}','amj80-series-sliding-window','{}','{"width":"905","height":"854"}',1,450,'ready',2,'ai','segment','ql_p7',1,'{"maxUValue":1.69,"minShgc":0.5,"maxShgc":0.56}','explicit_energy_report')`);

      // W9 — a split WE made for dimensional reasons: the unit inherits the
      // opening's band and has no code of its own in any document.
      await sql(`INSERT INTO quote_line (id, project_id, external_ref, product_slug, options_json, dims_json, qty, line_total, status, position, origin, line_kind) VALUES ('ql_p9','${projectId}','W9','amj80-series-awning-window','{}','{"width":"1600","height":"900"}',1,800,'ready',3,'ai','composite_parent')`);
      await sql(`INSERT INTO opening_instance (id, project_id, quote_line_id, external_ref, family, operation_type, width_mm, height_mm, requirements_json, requirement_basis, status) VALUES ('op_p9','${projectId}','ql_p9','W9','windows','awning',1600,900,'{"maxUValue":2.2,"minShgc":null,"maxShgc":null}','explicit_energy_report','ready')`);
      await sql(`INSERT INTO quote_line (id, project_id, product_slug, options_json, dims_json, qty, line_total, status, position, origin, line_kind, parent_line_id, segment_seq, segment_requirements_json, segment_requirement_basis) VALUES ('ql_s9','${projectId}','amj80-series-awning-window','{}','{"width":"800","height":"900"}',1,400,'ready',4,'ai','segment','ql_p9',0,'{"maxUValue":2.2,"minShgc":null,"maxShgc":null}','default_even')`);

      const audit = await requestJson(ops, `/api/ops/projects/${projectId}/thermal`);
      const byRef = Object.fromEntries(audit.body.rows.map((r) => [r.ref, r]));

      // The parent groups; it never proposes. Its product is the pre-split unit
      // that is not being built, so a verdict on it would judge the wrong window.
      const parent = byRef.W7;
      assert.equal(parent.verdict, "header", "a composite parent carries no pass/fail");
      assert.equal(parent.proposed, null, "the superseded pre-split product is not shown as a proposal");
      assert.equal(parent.unitCount, 2);
      assert.equal(parent.target.maxUValue, 1.69, "the opening's own target still shows on the header");

      // Units take the code the ENERGY REPORT gave them, matched on operation.
      assert.ok(byRef.W7A, "a unit the report named keeps that name");
      assert.ok(byRef.W7B, "and so does its sibling");
      assert.equal(byRef.W7A.operation, "awning");
      assert.equal(byRef.W7A.target.maxUValue, 2.27, "each unit is judged against ITS OWN target");
      assert.equal(byRef.W7B.target.maxUValue, 1.69, "which differs between the two halves");
      assert.equal(byRef.W7A.targetInherited, false, "a report-named unit did not inherit");

      // A unit we split ourselves is LETTERED, the way a schedule writes the
      // units of one opening. The basis column already says whether a document
      // named it, so the label does not also need to withhold a letter — and a
      // dot-number is not a code anybody uses.
      const ours = byRef["W9A"];
      assert.ok(ours, "a unit the report never named is still lettered");
      assert.equal(ours.targetInherited, true, "and its target is marked as inherited from the opening");
      assert.equal(ours.target.maxUValue, 2.2, "inheriting means the opening's number, unchanged");
      // This fixture writes no configuration snapshot either, so there genuinely
      // is no recorded proposal for the unit and the row says exactly that.
      assert.equal(ours.verdict, "no_record", "a unit with no recorded proposal claims nothing");

      // A unit the estimator DID record is judged like any other line. Its
      // proposal lives on the line's own configuration snapshot, because a unit
      // can never have an ai_proposal_line — that table requires an
      // opening_instance and a unit has none. Reading only the proposal table
      // showed a blank beside a unit whose product was plainly on the row.
      await sql(`UPDATE quote_line SET configuration_snapshot_json='{"productSlug":"amj80-series-awning-window","variantId":"glz-lowe-y","uw":2.9,"shgc":0.31,"source":"certified"}' WHERE id='ql_s9'`);
      const judged = await requestJson(ops, `/api/ops/projects/${projectId}/thermal`);
      const unit = judged.body.rows.find((r) => r.ref === "W9A");
      assert.equal(unit.proposed.productSlug, "amj80-series-awning-window", "the unit reports what was chosen for it");
      assert.equal(unit.proposed.uw, 2.9);
      assert.equal(unit.verdict, "missed", "2.9 against the opening's 2.2 is a miss, and is now stated");
      assert.equal(unit.miss.uw, 0.7);
    });

    await t.test("thermal audit: a human edit never becomes the machine's proposal", async () => {
      // THE FALSE PASS. A human swaps the product; the line keeps pointing at the
      // machine's proposal row. Reading the product from the LINE and the numbers
      // from the PROPOSAL renders a window that never existed — the new product
      // wearing the old one's Uw — and calls it compliant. The audit must show the
      // frozen proposal, and mark that the line has since moved.
      const projectId = "p_thermal_edit";
      await sql(`INSERT INTO project (id, title, status_customer) VALUES ('${projectId}','Edited line fixture','draft')`);
      await sql(`INSERT INTO ai_runs (id, project_id, pipeline_version) VALUES ('run_te','${projectId}','test')`);
      await sql(`INSERT INTO ai_proposal (id, project_id, ai_run_id, source_generation, source_manifest_hash, pipeline_version) VALUES ('prop_te','${projectId}','run_te',1,'h','test')`);
      await sql(`INSERT INTO quote_line (id, project_id, external_ref, product_slug, options_json, dims_json, qty, line_total, status, position, origin) VALUES ('ql_e','${projectId}','W1','amj80-series-awning-window','{}','{"width":"900","height":"1200"}',1,500,'ready',0,'ai')`);
      await sql(`INSERT INTO opening_instance (id, project_id, quote_line_id, external_ref, family, operation_type, width_mm, height_mm, requirements_json, requirement_basis, status) VALUES ('op_e','${projectId}','ql_e','W1','windows','awning',900,1200,'{"maxUValue":2.27,"minShgc":null,"maxShgc":null}','explicit_energy_report','ready')`);
      // The machine proposed the 80-series with glass that MEETS 2.27.
      await sql(`INSERT INTO ai_proposal_line (id, proposal_id, project_id, opening_id, quote_line_id, quantity, dimensions_json, ranking_context_json, product_id, product_slug, performance_variant_id, catalogue_revision, configuration_json, performance_json, price_snapshot_json, recommendation_basis, confidence_band, review_required, applied_to_cart, created_at) VALUES ('apl_e','prop_te','${projectId}','op_e','ql_e',1,'{}','{}','p','amj80-series-awning-window','glz-lowe-x','r1','{}','{"uw":2.1,"shgc":0.39,"source":"certified","certified":true}','{"total":500}','energy_report','high',0,1,datetime('now'))`);
      await sql(`UPDATE quote_line SET ai_proposal_line_id='apl_e' WHERE id='ql_e'`);

      // Now the human swaps the PRODUCT, exactly as the customer editor does:
      // product changes, glass is dropped, the proposal pointer is deliberately kept.
      await sql(`UPDATE quote_line SET product_slug='amj100t-series-awning-window', selected_variant_id=NULL, edited_fields='["product_slug"]' WHERE id='ql_e'`);

      const audit = await requestJson(ops, `/api/ops/projects/${projectId}/thermal`);
      const row = audit.body.rows.find((r) => r.ref === "W1");

      assert.equal(row.proposed.productSlug, "amj80-series-awning-window",
        "the audit reports the product the MACHINE chose, not the one a human later typed");
      assert.equal(row.proposed.variantId, "glz-lowe-x",
        "and the machine's glass, which the edit NULLed on the line");
      assert.equal(row.proposed.uw, 2.1, "paired with the performance of that same product");
      assert.equal(row.verdict, "met", "the machine's proposal did meet the band, and still reads as such");

      // The human decision is authoritative and is simply not this surface's
      // subject. Nothing about the edit is reported, annotated or judged.
      assert.equal(row.current, undefined, "the audit says nothing about what a person did");
    });
  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
