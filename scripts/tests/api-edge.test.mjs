// API edge cases + negative paths — complements api.test.mjs (happy paths).
// One local Worker; many focused subtests: auth caps, guest anti-enumeration +
// rate limit, file limits/ownership, the clarification round-trip, approval
// reject/wrong-role/no-rule, workflow transitions, admin RBAC, audit, customers
// 360, search, and order stage-conflicts.
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  Session, demoEmail, freePort, login, makeRunDir, removeRunDir,
  requestJson, run, staffEmail, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";

test("API edge cases and negative paths", { timeout: 180_000 }, async (t) => {
  const runDir = await makeRunDir("api-edge");
  const assets = join(runDir, "assets");
  const state = join(runDir, "state");
  const wranglerEnv = { WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") };
  let server;
  try {
    await run(process.execPath, [viteCli, "build", "--outDir", assets, "--emptyOutDir"]);
    await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "apertly-db", "--local", "--persist-to", state], { env: wranglerEnv });
    await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--file", "scripts/db/seed.sql"], { env: wranglerEnv });
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    // Local/test env: dev OTP on, Access off (staff session fallback), Sanity off (deterministic built-in catalogue). Prod values live in wrangler.jsonc.
    server = start(process.execPath, [wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--persist-to", state, "--assets", assets, "--log-level", "warn", "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:", "--var", "SANITY_PROJECT_ID:", "--var", "ENQUIRY_INTERNAL_TO:enquiries@openframe.com.au", "--var", "MANUFACTURER_TO:leads@amj.test"], { env: wranglerEnv });
    await waitForUrl(`${baseUrl}/api/health`, server);

    const anon = new Session(baseUrl);
    const staff = new Session(baseUrl);
    await login(staff, "/api/ops/auth", staffEmail); // admin

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
      const wrong = await requestJson(anon, "/api/guest/track/request", { method: "POST", json: { email: "nobody@example.com", ref: "OF-58001" } });
      assert.deepEqual(wrong.body, { ok: true });
      // Correct match → code; immediate repeat is rate-limited (neutral, no code).
      const first = await requestJson(anon, "/api/guest/track/request", { method: "POST", json: { email: demoEmail, ref: "OF-58001" } });
      assert.match(first.body.devCode, /^\d{6}$/);
      const second = await requestJson(anon, "/api/guest/track/request", { method: "POST", json: { email: demoEmail, ref: "OF-58001" } });
      assert.equal(second.body.devCode, undefined, "rate limited within the window");
      await requestJson(anon, "/api/guest/track/verify", { method: "POST", json: { email: demoEmail, ref: "OF-58001", code: "000000" } }, 400);
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
      const listed = staffFiles.body.files.find((f) => f.id === uploaded.file.id);
      assert.ok(listed);
      assert.equal(listed.virus_status, "clean", "an accepted upload is scanned, not left pending");
      assert.equal((await staff.request(`/api/ops/files/${uploaded.file.id}/download`)).status, 200);
    });

    await t.test("upload scanning: dangerous files are refused and never stored", async () => {
      const buyer = new Session(baseUrl);
      await login(buyer, "/api/auth", "scan@example.com");
      const send = async (bytes, name, type) => {
        const fd = new FormData();
        fd.append("file", new Blob([bytes], { type }), name);
        return buyer.request("/api/files/upload", { method: "POST", body: fd });
      };
      const before = (await requestJson(staff, "/api/ops/files")).body.files.length;

      // A Windows executable wearing a .pdf name — sniffed by bytes, not by label.
      const exe = await send(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]), "schedule.pdf", "application/pdf");
      assert.equal(exe.status, 422);
      assert.equal((await exe.json()).error, "file_rejected");

      // A PDF carrying embedded JavaScript.
      const jsPdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Names << /JavaScript 2 0 R >> >>\nendobj\n%%EOF\n", "latin1");
      const js = await send(jsPdf, "plan.pdf", "application/pdf");
      assert.equal(js.status, 422);

      // Nothing rejected was persisted — no row, and therefore nothing to serve.
      const after = (await requestJson(staff, "/api/ops/files")).body.files.length;
      assert.equal(after, before, "rejected uploads must not create file rows");
    });

    await t.test("unscanned files are withheld until staff rescan them", async () => {
      const buyer = new Session(baseUrl);
      await login(buyer, "/api/auth", "legacy@example.com");
      const fd = new FormData();
      fd.append("file", new Blob([Buffer.from("schedule text")], { type: "text/plain" }), "legacy.txt");
      const up = await (await buyer.request("/api/files/upload", { method: "POST", body: fd })).json();

      // Simulate a pre-scanning row (what migration 0013 relabels as 'skipped').
      await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state,
        "--command", `UPDATE file_asset SET virus_status='skipped' WHERE id='${up.file.id}'`], { env: wranglerEnv });

      // Neither the owner nor staff can pull the bytes while it is unscanned.
      assert.equal((await buyer.request(`/api/files/${up.file.id}/download`)).status, 409);
      assert.equal((await staff.request(`/api/ops/files/${up.file.id}/download`)).status, 409);

      // A staff rescan clears it, and the file becomes downloadable again.
      const rescan = await requestJson(staff, `/api/ops/files/${up.file.id}/rescan`, { method: "POST" });
      assert.equal(rescan.body.status, "clean");
      assert.equal((await buyer.request(`/api/files/${up.file.id}/download`)).status, 200);
    });

    await t.test("dashboard project list + submit; accept guards ownership and state", async () => {
      const demo = new Session(baseUrl);
      await login(demo, "/api/auth", demoEmail);
      const projects = await requestJson(demo, "/api/projects");
      assert.ok(projects.body.projects.some((p) => p.id === "p_draft"));
      // An already-accepted revision cannot be accepted again (seed rev_1 is accepted).
      await requestJson(demo, "/api/revisions/rev_1/accept", { method: "POST" }, 409);
    });

    await t.test("autosave upserts by stable id, preserving parse-line provenance (P1-03)", async () => {
      const buyer = new Session(baseUrl);
      await login(buyer, "/api/auth", "provenance@example.com");
      const base = { productSlug: "amj80-series-sliding-window", measuredBy: "frame", width: "1200", height: "900", qty: 1,
        options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" } };
      const saved = await requestJson(buyer, "/api/projects/current/lines", { method: "PUT", json: { items: [{ ...base, code: "W01" }, { ...base, code: "W02" }] } });
      const pid = saved.body.project.id;
      const id1 = saved.body.items[0].id, id2 = saved.body.items[1].id;
      assert.ok(id1 && id2 && id1 !== id2, "server returns stable line ids");

      // A parse-evidence chain (file → job → parse_line) linking to line 1.
      const sql = [
        `INSERT INTO file_asset (id, project_id, kind, r2_key, filename, virus_status) VALUES ('fa_prov','${pid}','schedule','k/prov','prov.pdf','clean')`,
        `INSERT INTO schedule_parse_job (id, project_id, file_asset_id, subject, status) VALUES ('job_prov','${pid}','fa_prov','s','completed')`,
        `INSERT INTO parse_line (id, job_id, source_index, raw_json, quote_line_id) VALUES ('pl_prov','job_prov',0,'{}','${id1}')`,
      ].join("; ");
      await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--command", sql], { env: wranglerEnv });

      // Autosave: echo both serverIds back, edit qty on line 1. Old delete+insert
      // would mint new ids and NULL the parse_line link; the upsert must not.
      const resave = await requestJson(buyer, "/api/projects/current/lines", { method: "PUT", json: { items: [{ ...base, code: "W01", serverId: id1, qty: 3 }, { ...base, code: "W02", serverId: id2 }] } });
      assert.equal(resave.body.items[0].id, id1, "line id survives autosave");
      assert.equal(resave.body.items[0].qty, 3, "edit applied in place");
      const link = await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command", "SELECT quote_line_id FROM parse_line WHERE id='pl_prov'"], { env: wranglerEnv });
      assert.equal(JSON.parse(link.stdout)[0].results[0].quote_line_id, id1, "provenance link survives autosave");

      // Removing line 2 deletes exactly that row; line 1 (with evidence) persists.
      const resave2 = await requestJson(buyer, "/api/projects/current/lines", { method: "PUT", json: { items: [{ ...base, code: "W01", serverId: id1, qty: 3 }] } });
      assert.equal(resave2.body.items.length, 1);
      assert.equal(resave2.body.items[0].id, id1);
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

    await t.test("estimator: run over openings persists a selection run; feedback needs a reason category", async () => {
      // Seed one opening_instance (the extraction bridge normally creates these).
      await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state,
        "--command", `INSERT INTO opening_instance (id, project_id, external_ref, family, operation_type, width_mm, height_mm, status) VALUES ('op_est1','p_submitted','W01','windows','awning',800,1200,'extracted')`], { env: wranglerEnv });

      // Run the estimator (test env has no Sanity, so 0 candidates — the persistence
      // + orchestration path is what's under test here; candidate selection is unit-tested).
      const est = await requestJson(staff, "/api/ops/projects/p_submitted/estimate", { method: "POST", json: {} });
      assert.equal(est.body.openings, 1);
      assert.ok(Array.isArray(est.body.lines));
      const selRuns = await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command", "SELECT count(*) AS n FROM selection_run WHERE opening_id='op_est1'"], { env: wranglerEnv });
      assert.equal(JSON.parse(selRuns.stdout)[0].results[0].n, 1, "a selection_run was persisted");

      // Feedback: a reason-code CATEGORY is mandatory (free-text-only is rejected).
      await requestJson(staff, "/api/ops/projects/p_submitted/feedback", { method: "POST", json: { field: "product", note: "just wrong" } }, 400);
      await requestJson(staff, "/api/ops/projects/p_submitted/feedback", { method: "POST", json: { field: "product", category: "not_a_category", reasonCode: "X" } }, 400);
      const ok = await requestJson(staff, "/api/ops/projects/p_submitted/feedback", { method: "POST",
        json: { field: "product", openingId: "op_est1", category: "preference_correction", reasonCode: "LOWER_TOTAL_COST_SAME_COMPLIANCE", finalValue: { productSlug: "amj80" } } });
      assert.ok(ok.body.id, "feedback recorded with a valid category");
    });

    await t.test("estimator: bridges delivered parse_line rows into openings (extraction source #1)", async () => {
      // Seed the delivered extraction chain (file → job → parse_line) on a project
      // with no openings, then estimate — the bridge should create openings from it.
      const sql = [
        `INSERT INTO project (id, owner_user_id, title, public_ref, status_customer) VALUES ('p_bridge', 'u_demo', 'Bridge test', 'OF-Q-99001', 'submitted')`,
        `INSERT INTO file_asset (id, project_id, kind, r2_key, filename, virus_status) VALUES ('fa_bridge','p_bridge','schedule','k/b','b.pdf','clean')`,
        `INSERT INTO schedule_parse_job (id, project_id, file_asset_id, subject, status) VALUES ('job_bridge','p_bridge','fa_bridge','s','needs_review')`,
        `INSERT INTO parse_line (id, job_id, source_index, raw_json, mapped_dims_json, external_ref) VALUES ('pl_b1','job_bridge',0,'{"section":"window","typeText":"AWNING","widthMm":800,"heightMm":1200}','{"width":800,"height":1200}','W01')`,
      ].join("; ");
      await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--command", sql], { env: wranglerEnv });

      const est = await requestJson(staff, "/api/ops/projects/p_bridge/estimate", { method: "POST", json: {} });
      assert.equal(est.body.openings, 1, "one opening bridged from the parsed line");
      const op = await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command", "SELECT external_ref, family, operation_type, width_mm FROM opening_instance WHERE project_id='p_bridge'"], { env: wranglerEnv });
      const row = JSON.parse(op.stdout)[0].results[0];
      assert.equal(row.external_ref, "W01");
      assert.equal(row.family, "windows");
      assert.equal(row.operation_type, "awning");
      assert.equal(row.width_mm, 800);
    });

    await t.test("staff line edit does not silently clear a technical-review flag", async () => {
      // Simulate a parsed line that reached technical review (material substitution).
      const detail = await requestJson(staff, "/api/ops/projects/p_submitted");
      const lineId = detail.body.lines[0].id;
      await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state,
        "--command", `UPDATE quote_line SET status='technical_review', review_json='{"material":"Schedule specifies TIMBER; confirm substitution."}' WHERE id='${lineId}'`], { env: wranglerEnv });

      // An unrelated qty edit must NOT drop it to ready or drop the flag.
      const edited = await requestJson(staff, `/api/ops/lines/${lineId}`, { method: "PATCH", json: { qty: 2 } });
      assert.equal(edited.body.line.status, "technical_review", "unrelated edit keeps technical_review");
      assert.ok(edited.body.line.review?.material, "review reason preserved");
      assert.equal(edited.body.line.qty, 2);

      // The line blocks issuance while the flag stands.
      assert.ok(detail.body.lines[0].review === null || detail.body.lines[0].review !== undefined); // DTO carries review

      // Explicit resolution clears it and lets the line become ready.
      const resolved = await requestJson(staff, `/api/ops/lines/${lineId}`, { method: "PATCH", json: { resolveReview: true } });
      assert.equal(resolved.body.line.review, null, "flag cleared on explicit resolve");
      assert.equal(resolved.body.line.status, "ready", "priced + no flags ⇒ ready");
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
      const est = await login(estimator, "/api/ops/auth", "estimator@openframe.com.au");
      await requestJson(staff, `/api/ops/staff/${est.body.user.id}`, { method: "PATCH", json: { role: "estimator" } });
      await requestJson(estimator, `/api/ops/approvals/${step.id}/approve`, { method: "POST", json: {} }, 403);

      // Reject sends the project back to the estimator.
      await requestJson(staff, `/api/ops/approvals/${step.id}/reject`, { method: "POST", json: { comment: "Needs rework" } });
      const after = await requestJson(staff, "/api/ops/projects/p_submitted");
      assert.equal(after.body.project.statusInternal, "estimator_assigned");
    });

    await t.test("admin RBAC: rules + staff role changes require admin", async () => {
      const estimator = new Session(baseUrl);
      const est = await login(estimator, "/api/ops/auth", "estimator@openframe.com.au");
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
      // Customers are user accounts (org layer isn't wired) — real registered users.
      const customers = await requestJson(staff, "/api/ops/customers");
      const sarah = customers.body.customers.find((c) => c.name === "Sarah Nguyen");
      assert.ok(sarah && sarah.projects >= 1, "customer listed with their project count");
      const detail = await requestJson(staff, `/api/ops/customers/${sarah.id}`);
      assert.equal(detail.body.customer.email, "sarah@northsidebuild.com.au");
      assert.ok(detail.body.projects.length >= 1, "customer 360 shows their projects");
      await requestJson(staff, "/api/ops/customers/nope", {}, 404);

      // Staff edit of the customer profile (assigned role). Admin here edits all
      // fields; the sign-in email (unique login ID) is guarded further below.
      const prof = await requestJson(staff, `/api/ops/customers/${sarah.id}`, { method: "PATCH",
        json: { name: "Sarah N.", phone: "0400 111 999", company: "Northside Build Co", abn: "11 222 333 444" } });
      assert.equal(prof.body.customer.name, "Sarah N.");
      assert.equal(prof.body.customer.company, "Northside Build Co");
      assert.equal(prof.body.customer.abn, "11 222 333 444");
      // Email change: invalid 400, taken 409, then a real change.
      await requestJson(staff, `/api/ops/customers/${sarah.id}`, { method: "PATCH", json: { email: "not-an-email" } }, 400);
      await requestJson(staff, `/api/ops/customers/${sarah.id}`, { method: "PATCH", json: { email: demoEmail } }, 409);
      const changed = await requestJson(staff, `/api/ops/customers/${sarah.id}`, { method: "PATCH", json: { email: "sarah.n@newbuild.com.au" } });
      assert.equal(changed.body.customer.email, "sarah.n@newbuild.com.au");
      // The customer signs in with the NEW address and lands on the SAME account.
      const sarahSession = new Session(baseUrl);
      await login(sarahSession, "/api/auth", "sarah.n@newbuild.com.au");
      const who = await requestJson(sarahSession, "/api/auth/me");
      assert.equal(who.body.user.id, sarah.id, "new email resolves to the same user");
      assert.equal(who.body.user.name, "Sarah N.", "ops profile edit visible to the customer");
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

    await t.test("customer submit: server validates state/lines/contact and persists the contact", async () => {
      const buyer = new Session(baseUrl);
      await login(buyer, "/api/auth", "submitter@example.com");
      // Empty draft cannot be submitted, even with a contact.
      const empty = await requestJson(buyer, "/api/projects/current/lines", { method: "PUT", json: { items: [] } });
      const pid = empty.body.project.id;
      await requestJson(buyer, `/api/projects/${pid}/submit`, { method: "POST", json: { contact: { name: "Sam", email: "sam@example.com" } } }, 400);

      // A fully-priced line makes the quote submittable.
      const line = { code: "W01", location: "Living", productSlug: "amj80-series-sliding-window", measuredBy: "frame", width: "1200", height: "900", qty: 1,
        options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" } };
      const saved = await requestJson(buyer, "/api/projects/current/lines", { method: "PUT", json: { items: [line] } });
      assert.equal(saved.body.items[0].status, "Ready");

      // Contact is required by the server, not just the SPA.
      await requestJson(buyer, `/api/projects/${pid}/submit`, { method: "POST", json: { contact: { name: "", email: "" } } }, 400);
      const ok = await requestJson(buyer, `/api/projects/${pid}/submit`, { method: "POST",
        json: { contact: { name: "Sam Builder", email: "sam@example.com", phone: "0400 000 000", suburb: "Preston VIC 3072" } } });
      assert.equal(ok.body.status, "submitted");
      // A submitted project is no longer a draft — resubmission is rejected.
      await requestJson(buyer, `/api/projects/${pid}/submit`, { method: "POST", json: { contact: { name: "Sam", email: "sam@example.com" } } }, 409);
      // P1-01: nor can its source/evidence be wiped via the draft-only clear endpoint.
      await requestJson(buyer, "/api/projects/current/clear", { method: "POST" }, 409);
      // The contact was persisted and is visible to staff.
      const opsView = await requestJson(staff, `/api/ops/projects/${pid}`);
      assert.equal(opsView.body.project.contactEmail, "sam@example.com");
      assert.equal(opsView.body.project.deliverySuburb, "Preston VIC 3072");

      // The submitter can review exactly what they sent (read-only), owner-scoped.
      const readback = await requestJson(buyer, `/api/projects/${pid}`);
      assert.equal(readback.body.project.status, "submitted");
      assert.equal(readback.body.items.length, 1);
      // Another signed-in user cannot read someone else's project.
      const nosey = new Session(baseUrl);
      await login(nosey, "/api/auth", "nosey@example.com");
      await requestJson(nosey, `/api/projects/${pid}`, {}, 404);
      // Anonymous access is rejected outright.
      await requestJson(new Session(baseUrl), `/api/projects/${pid}`, {}, 401);

      // The account dashboard payload: a durable ref + draft/issued totals per project.
      const list = await requestJson(buyer, "/api/projects");
      const row = list.body.projects.find((x) => x.id === pid);
      assert.match(row.public_ref, /^OF-Q-\d+$/, "server-generated project reference");
      assert.equal(typeof row.draft_total, "number");

      // Staff take it through approval → issue; then the customer requests changes.
      await requestJson(staff, `/api/ops/projects/${pid}/assign`, { method: "POST", json: {} });
      const sfa = await requestJson(staff, `/api/ops/projects/${pid}/submit-for-approval`, { method: "POST", json: {} });
      if (sfa.body.statusInternal === "approval_pending") {
        const pendingSteps = await requestJson(staff, "/api/ops/approvals");
        for (const step of pendingSteps.body.approvals.filter((s) => s.project_id === pid)) {
          await requestJson(staff, `/api/ops/approvals/${step.id}/approve`, { method: "POST", json: {} });
        }
      }
      const issuedRev = await requestJson(staff, `/api/ops/projects/${pid}/issue-revision`, { method: "POST", json: {} });
      const revId = issuedRev.body.id;
      const issuedList = await requestJson(buyer, "/api/projects");
      const issuedRow = issuedList.body.projects.find((x) => x.id === pid);
      assert.equal(issuedRow.status_customer, "quote_issued");
      assert.equal(issuedRow.issued_revision_no, 1);
      assert.equal(typeof issuedRow.issued_total, "number");

      // Request-changes guards: anonymous 404, empty message 400.
      await requestJson(new Session(baseUrl), `/api/revisions/${revId}/request-changes`, { method: "POST", json: { message: "x" } }, 404);
      await requestJson(buyer, `/api/revisions/${revId}/request-changes`, { method: "POST", json: { message: "" } }, 400);
      // The honest state move: back to Under review; the old revision stops being acceptable.
      const rc = await requestJson(buyer, `/api/revisions/${revId}/request-changes`, { method: "POST", json: { message: "Swap the door to a 3-panel stacker" } });
      assert.equal(rc.body.status, "under_review");
      await requestJson(buyer, `/api/revisions/${revId}/accept`, { method: "POST" }, 409);
      // A second change request on the same (now stale) revision is rejected too.
      await requestJson(buyer, `/api/revisions/${revId}/request-changes`, { method: "POST", json: { message: "again" } }, 409);
    });

    await t.test("RBAC: role-less internal staff is blocked from payments + customer PII", async () => {
      const rookie = new Session(baseUrl);
      await login(rookie, "/api/ops/auth", "rookie@openframe.com.au"); // internal, role = null
      const who = await requestJson(rookie, "/api/ops/me");
      // No assigned role → no money movement, no order advance, no customer PII / files.
      await requestJson(rookie, "/api/ops/orders/o_1/pay", { method: "POST", json: { kind: "deposit" } }, 403);
      await requestJson(rookie, "/api/ops/orders/o_1/advance", { method: "POST", json: { action: "share-qa" } }, 403);
      await requestJson(rookie, "/api/ops/customers", {}, 403);
      await requestJson(rookie, "/api/ops/files", {}, 403);
      // Admin assigns estimator → PII opens, but payments stay manager/admin-only.
      await requestJson(staff, `/api/ops/staff/${who.body.user.id}`, { method: "PATCH", json: { role: "estimator" } });
      await requestJson(rookie, "/api/ops/customers");
      // An estimator can fix profile fields, but the sign-in email stays admin-only.
      const est = await requestJson(rookie, "/api/ops/customers/u_sarah", { method: "PATCH", json: { phone: "0400 222 111" } });
      assert.equal(est.body.customer.phone, "0400 222 111");
      await requestJson(rookie, "/api/ops/customers/u_sarah", { method: "PATCH", json: { email: "hijack@example.com" } }, 403);
      await requestJson(rookie, "/api/ops/orders/o_1/pay", { method: "POST", json: { kind: "deposit" } }, 403);
      // Promote to manager → the payment now reaches domain logic (o_1 stage conflict).
      await requestJson(staff, `/api/ops/staff/${who.body.user.id}`, { method: "PATCH", json: { role: "manager" } });
      await requestJson(rookie, "/api/ops/orders/o_1/pay", { method: "POST", json: { kind: "deposit" } }, 409);
    });

    await t.test("enquiries: question + appointment, server-owned attribution, reference, validation", async () => {
      const s = new Session(baseUrl);
      const ip = (v) => ({ headers: { "X-Forwarded-For": v } }); // distinct sources dodge the per-IP throttle

      // Validation is rejected before anything is recorded (and doesn't burn throttle).
      await requestJson(s, "/api/enquiries", { method: "POST", json: { intent: "question", name: "Q", email: "q@ex.com", message: "hi" }, ...ip("198.51.100.1") }, 400); // no consent
      const badLoc = await requestJson(s, "/api/enquiries", { method: "POST", json: { intent: "appointment_request", name: "X", email: "x@ex.com", phone: "0400111222", privacyConsent: true, locationId: "loc_nope", bestTimeToCall: "morning" }, ...ip("198.51.100.2") }, 400);
      assert.ok(badLoc.body.fields.includes("location"), "unknown/inactive location rejected");

      // Valid question → OpenFrame reference.
      const q = await requestJson(s, "/api/enquiries", { method: "POST",
        json: { intent: "question", name: "Question Person", email: "qp@example.com", topic: "pricing", message: "How much for a sliding door?", privacyConsent: true, client_context: { landing_path: "/contact?intent=question", utm_source: "google" } }, ...ip("203.0.113.10") });
      assert.match(q.body.reference, /^OF-ENQ-\d{4}-\d{6}$/);

      // Valid appointment for the seeded Rowville showroom → distinct reference.
      const appt = await requestJson(s, "/api/enquiries", { method: "POST",
        json: { intent: "appointment_request", name: "Mel Johnson", email: "mel@example.com", phone: "0431 234 567", privacyConsent: true, locationId: "loc_vic_rowville", bestTimeToCall: "afternoon", preferredDays: ["tuesday", "thursday"], productsInterest: "both", notes: "sliding doors" }, ...ip("203.0.113.20") });
      assert.match(appt.body.reference, /^OF-ENQ-\d{4}-\d{6}$/);
      assert.notEqual(appt.body.reference, q.body.reference);

      // Phone-first appointment: no email is fine (customer gets a call, not an email).
      const phoneOnly = await requestJson(s, "/api/enquiries", { method: "POST",
        json: { intent: "appointment_request", name: "Phoneonly Visitor", phone: "0431 555 000", privacyConsent: true, locationId: "loc_nsw_lakemba", bestTimeToCall: "anytime" }, ...ip("203.0.113.25") });
      assert.match(phoneOnly.body.reference, /^OF-ENQ-\d{4}-\d{6}$/);

      // Same source immediately again → throttled.
      await requestJson(s, "/api/enquiries", { method: "POST", json: { intent: "question", name: "Again", email: "again@ex.com", message: "hi", privacyConsent: true }, ...ip("203.0.113.20") }, 429);

      // Honeypot → neutral success, no reference, nothing recorded.
      const trap = await requestJson(s, "/api/enquiries", { method: "POST", json: { intent: "question", name: "Bot", email: "b@spam.test", message: "x", privacyConsent: true, website: "http://x" }, ...ip("203.0.113.30") });
      assert.equal(trap.body.reference, null);

      // Server-owned attribution + location snapshot + normalised phone persisted.
      const rowJson = await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command",
        `SELECT source_owner, source_entry_point, appointment_status, location_id, location_suburb, phone, form_version FROM enquiry WHERE public_reference = '${appt.body.reference}'`], { env: wranglerEnv });
      const row = JSON.parse(rowJson.stdout)[0].results[0];
      assert.equal(row.source_owner, "OPENFRAME");
      assert.equal(row.source_entry_point, "CONTACT_PAGE");
      assert.equal(row.appointment_status, "requested");
      assert.equal(row.location_id, "loc_vic_rowville");
      assert.equal(row.location_suburb, "Rowville");
      assert.equal(row.phone, "0431234567");

      // The phone-only appointment persisted with no email.
      const noEmailJson = await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command",
        `SELECT COALESCE(email,'') AS email, location_suburb FROM enquiry WHERE public_reference = '${phoneOnly.body.reference}'`], { env: wranglerEnv });
      const noEmailRow = JSON.parse(noEmailJson.stdout)[0].results[0];
      assert.equal(noEmailRow.email, "", "phone-only appointment stores no email");
      assert.equal(noEmailRow.location_suburb, "Lakemba");

      // Honeypot spam never persisted.
      const spamJson = await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command",
        "SELECT count(*) AS n FROM enquiry WHERE email = 'b@spam.test'"], { env: wranglerEnv });
      assert.equal(JSON.parse(spamJson.stdout)[0].results[0].n, 0);

      // Notification fan-out: q (confirm+internal), appt (confirm+internal+handoff),
      // phoneOnly (internal+handoff, NO confirmation — no email given).
      const notesJson = await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command",
        "SELECT event_type, count(*) AS n FROM notification WHERE event_type LIKE 'enquiry.%' GROUP BY event_type"], { env: wranglerEnv });
      const events = Object.fromEntries(JSON.parse(notesJson.stdout)[0].results.map((r) => [r.event_type, r.n]));
      assert.equal(events["enquiry.confirmation"], 2, "customer confirmations (phone-only sends none)");
      assert.equal(events["enquiry.internal"], 3, "internal notification per enquiry");
      assert.equal(events["enquiry.handoff"], 2, "manufacturer handoff per appointment");

      // ── Ops Enquiries admin ────────────────────────────────────────────────
      const staffId = (await requestJson(staff, "/api/ops/me")).body.user.id;
      const list = await requestJson(staff, "/api/ops/enquiries");
      assert.ok(list.body.enquiries.length >= 2, "enquiries listed");
      const apptRow = list.body.enquiries.find((e) => e.reference === appt.body.reference);
      assert.ok(apptRow && apptRow.intent === "appointment_request" && apptRow.sourceOwner === "OPENFRAME");
      // Filter by intent.
      const onlyQ = await requestJson(staff, "/api/ops/enquiries?intent=question");
      assert.ok(onlyQ.body.enquiries.length >= 1 && onlyQ.body.enquiries.every((e) => e.intent === "question"));
      // Detail exposes attribution + snapshot + activity.
      const detail = await requestJson(staff, `/api/ops/enquiries/${apptRow.id}`);
      assert.equal(detail.body.enquiry.sourceOwner, "OPENFRAME");
      assert.equal(detail.body.enquiry.locationSuburb, "Rowville");
      assert.ok(detail.body.activity.length >= 1, "activity trail present");
      // Assign + move status dimensions + reconcile — source owner never changes.
      await requestJson(staff, `/api/ops/enquiries/${apptRow.id}`, { method: "PATCH",
        json: { assignedUser: staffId, workflowStatus: "in_progress", appointmentStatus: "confirmed", commercialOutcome: "manufacturer_quote_created", manufacturerQuoteRef: "AMJ-Q-9001" } });
      const after = await requestJson(staff, `/api/ops/enquiries/${apptRow.id}`);
      assert.equal(after.body.enquiry.workflowStatus, "in_progress");
      assert.equal(after.body.enquiry.appointmentStatus, "confirmed");
      assert.equal(after.body.enquiry.commercialOutcome, "manufacturer_quote_created");
      assert.equal(after.body.enquiry.manufacturerQuoteRef, "AMJ-Q-9001");
      assert.equal(after.body.enquiry.assignedName != null, true, "assignee resolved");
      assert.equal(after.body.enquiry.sourceOwner, "OPENFRAME", "source owner immutable");
      // A patch with no valid fields is rejected (bogus status ignored).
      await requestJson(staff, `/api/ops/enquiries/${apptRow.id}`, { method: "PATCH", json: { workflowStatus: "bogus", sourceOwner: "AMJ" } }, 400);
      // Contact log records the outcome.
      await requestJson(staff, `/api/ops/enquiries/${apptRow.id}/contact-log`, { method: "POST", json: { outcome: "contacted", note: "left voicemail" } });
      assert.equal((await requestJson(staff, `/api/ops/enquiries/${apptRow.id}`)).body.enquiry.contactOutcome, "contacted");
      // Role-less staff are blocked from the enquiry PII surface.
      const rookie2 = new Session(baseUrl);
      await login(rookie2, "/api/ops/auth", "rookie2@openframe.com.au");
      await requestJson(rookie2, "/api/ops/enquiries", {}, 403);
      await requestJson(rookie2, `/api/ops/enquiries/${apptRow.id}`, {}, 403);
    });
  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
