// T1 of ops2's Metadata tab (design docs/runs/ops2-parse-metadata/02-design.md)
// — the READ seam, over a real Worker and a real local D1. Pattern lifted
// from why-rationale-api.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  Session, demoEmail, freePort, login, makeRunDir, removeRunDir, requestJson, run,
  staffEmail, start, stop, viteCli, waitForUrl, wranglerCli, wranglerLocalAuthEnv,
} from "./helpers.mjs";

/** A `DrawingReport` (worker/lib/drawing/contract.ts), written exactly as
 *  enrich.ts persists it to `ai_runs.drawing_report_json`. */
const STEPS = {
  inventory: { pages: 3, fonts: 2, images: 1, attachments: 0 },
  strategy: "text_vector",
  text: { pagesRead: 3 },
  selectPages: { selected: [{ pageNo: 2, tier: "primary", reason: "elevation" }], of: 3 },
  elevationRegions: [{ pageNo: 2, labels: ["North"] }],
  renderCrop: { pagesRendered: 1, cropsMade: 2 },
  read: { attempted: 2, returned: 2, declined: 0, retriedWithThreshold: 0 },
  placements: { fromText: 2, fromModelFallback: 0, unplaced: 0 },
  northAssumed: false,
};
const reportJson = (files) => JSON.stringify({ files });

const port_ = () => {};

test("the metadata read, over a real Worker and D1", { timeout: 300_000 }, async (t) => {
  const runDir = await makeRunDir("meta-api");
  const assets = join(runDir, "assets");
  const state = join(runDir, "state");
  const wranglerLogPath = join(runDir, "wrangler.log");
  const wranglerEnv = { ...wranglerLocalAuthEnv, WRANGLER_LOG_PATH: wranglerLogPath, XDG_CONFIG_HOME: join(runDir, "config") };
  let server;
  try {
    await run(process.execPath, [viteCli, "build", "--outDir", assets, "--emptyOutDir"]);
    await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "apertly-db", "--local", "--persist-to", state], { env: wranglerEnv });
    await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--file", "scripts/db/seed.sql"], { env: wranglerEnv });
    const sql = async (command) => {
      const r = await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command", command], { env: wranglerEnv });
      return JSON.parse(r.stdout)[0].results;
    };

    // ── The fixture ──────────────────────────────────────────────────────
    await sql(`INSERT INTO project (id, organisation_id, owner_user_id, title, status_customer, status_internal, public_ref)
               VALUES ('p_meta','org_demo','u_demo','Metadata audit','submitted','submitted','OF-Q-30001')`);
    await sql(`INSERT INTO project (id, organisation_id, owner_user_id, title, status_customer, status_internal, public_ref)
               VALUES ('p_issued','org_demo','u_demo','Issued audit','submitted','issued','OF-Q-30002')`);
    // A project with NO ai_runs row at all — the true "no run ever reported" case.
    await sql(`INSERT INTO project (id, organisation_id, owner_user_id, title, status_customer, status_internal, public_ref)
               VALUES ('p_norun','org_demo','u_demo','No run audit','submitted','submitted','OF-Q-30003')`);
    await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, dims_json, qty, line_total, status, position, origin)
               VALUES ('ql_norun','p_norun','W08','Hall','amj80-series-awning-window','{"width":"1200","height":"900"}',1,640,'ready',0,'schedule')`);

    // A parsed opening — will carry a real reading.
    await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, dims_json, qty, line_total, status, position, origin)
               VALUES ('ql_w05','p_meta','W05','Bed 2','amj80-series-awning-window','{"width":"1200","height":"900"}',1,640,'ready',0,'schedule')`);
    // A parsed opening with a run, but no reading row for it (AC-7's other side).
    await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, dims_json, qty, line_total, status, position, origin)
               VALUES ('ql_w06','p_meta','W06','Bed 3','amj80-series-awning-window','{"width":"1200","height":"900"}',1,640,'ready',1,'schedule')`);
    // A manual line — AC-5.
    await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, dims_json, qty, line_total, status, position, origin)
               VALUES ('ql_manual','p_meta','W07','Study','amj80-series-awning-window','{"width":"1200","height":"900"}',1,640,'ready',2,'manual')`);
    // A schedule line under the ISSUED project — AC-6.
    await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, dims_json, qty, line_total, status, position, origin)
               VALUES ('ql_issued','p_issued','W05','Bed 2','amj80-series-awning-window','{"width":"1200","height":"900"}',1,640,'ready',0,'schedule')`);

    await sql(`INSERT INTO file_asset (id, project_id, kind, filename, r2_key) VALUES ('fa_1','p_meta','plan','floor-plan-L1.pdf','crops/plan1.pdf')`);

    // An OLDER run — must not answer (AC-19).
    await sql(`INSERT INTO ai_runs (id, project_id, pipeline_version, status, started_at, drawing_report_json)
               VALUES ('air_old','p_meta','v1','completed', datetime('now','-9 days'), '${reportJson([
                 { fileId: "fa_old", steps: STEPS, perOpening: [{ tag: "W05", outcome: "read" }], wallMs: 999, modelCalls: 9 },
               ])}')`);
    // The LATEST run — two files, so AC-18 must pick the CONTAINING file, not an aggregate.
    await sql(`INSERT INTO ai_runs (id, project_id, pipeline_version, status, started_at, drawing_report_json)
               VALUES ('air_new','p_meta','v1','completed', datetime('now','-1 hours'), '${reportJson([
                 { fileId: "fa_other", steps: STEPS, perOpening: [{ tag: "W99", outcome: "read" }], wallMs: 111, modelCalls: 1 },
                 { fileId: "fa_1", steps: { ...STEPS, failedPhase: "render" }, perOpening: [
                   { tag: "W05", outcome: "read" }, { tag: "W06", outcome: "not_read" },
                 ], wallMs: 4200, modelCalls: 3 },
               ])}')`);

    // The reading row for W05, on the LATEST run, with everything set — the
    // happy-path fixture: real content, a gap_note to split, a region to render.
    await sql(`INSERT INTO drawing_reading (
                 id, project_id, ai_run_id, source_file_id, external_ref,
                 split_state, split_json, orientation_state, orientation,
                 elevation_state, elevation, room_state, room_label,
                 gap_code, gap_note, crop_key, page_no, sheet_ref, region_json,
                 confidence, flags_json
               ) VALUES (
                 'dr_w05','p_meta','air_new','fa_1','W05',
                 'value','{"axis":"vertical","units":[{"role":"operable","ratio":0.6,"operation":"awning","derivedWidthMm":720}]}',
                 'value','N',
                 'not_stated',NULL,'value','Bed 2',
                 'frame_ambiguous','schedule says awning | drawing shows casement',NULL,2,'A-101','[0.1,0.2,0.5,0.6]',
                 'low','["scheduleDrawingMismatch","northAssumed"]'
               )`);
    // Also on the OLDER run, deliberately DIFFERENT content — proves AC-19
    // reads only the latest run's reading, never merges or falls back.
    await sql(`INSERT INTO drawing_reading (
                 id, project_id, ai_run_id, source_file_id, external_ref,
                 split_state, orientation_state, orientation, elevation_state, room_state,
                 crop_key
               ) VALUES ('dr_old_w05','p_meta','air_old',NULL,'W05','not_read','value','S','not_read','not_read','crop/old.png')`);

    // T2 fixtures: a reading whose crop survives in R2, and one whose row
    // still names a crop_key that R2 no longer has (AC-27 — purged between
    // parse and view).
    await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, dims_json, qty, line_total, status, position, origin)
               VALUES ('ql_crop','p_meta','W10','Kitchen','amj80-series-awning-window','{"width":"1200","height":"900"}',1,640,'ready',5,'schedule')`);
    await sql(`INSERT INTO drawing_reading (id, project_id, ai_run_id, source_file_id, external_ref, split_state, orientation_state, elevation_state, room_state, crop_key)
               VALUES ('dr_crop','p_meta','air_new','fa_1','W10','not_read','not_read','not_read','not_read','crops/w10.png')`);
    await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, dims_json, qty, line_total, status, position, origin)
               VALUES ('ql_purged','p_meta','W11','Laundry','amj80-series-awning-window','{"width":"1200","height":"900"}',1,640,'ready',6,'schedule')`);
    await sql(`INSERT INTO drawing_reading (id, project_id, ai_run_id, source_file_id, external_ref, split_state, orientation_state, elevation_state, room_state, crop_key)
               VALUES ('dr_purged','p_meta','air_new','fa_1','W11','not_read','not_read','not_read','not_read','crops/purged.png')`);
    // Shared by both AC-22 blocks (the /meta ladder and the /meta/crop ladder).
    await sql(`INSERT INTO user (id, email, name, type, role, last_verified_at)
               VALUES ('u_mfr_meta','fabmeta@openframe.com.au','AMJ Fabrication','internal','manufacturer', datetime('now'))`);
    const cropBytes = Buffer.from("fake-png-bytes-for-w10");
    const cropPath = join(runDir, "crop.bin");
    await writeFile(cropPath, cropBytes);
    await run(process.execPath, [
      wranglerCli, "r2", "object", "put", "apertly-files/crops/w10.png",
      "--local", "--persist-to", state, "--file", cropPath, "--content-type", "application/octet-stream",
    ], { env: wranglerEnv });

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    server = start(process.execPath, [
      wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
      "--persist-to", state, "--assets", assets, "--log-level", "warn",
      "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:",
      "--var", "SANITY_PROJECT_ID:", "--var", "AI_EXTRACTION_MODE:manual",
    ], { env: wranglerEnv });
    await waitForUrl(`${baseUrl}/api/health`, server);

    const ops = new Session(baseUrl);
    await login(ops, "/api/ops/auth", staffEmail);
    const meta = (projectId, lineId, expected = 200) =>
      requestJson(ops, `/api/ops/projects/${projectId}/lines/${lineId}/meta`, {}, expected);

    await t.test("AC-18/19 the latest run's reading, and the CONTAINING file, not an aggregate", async () => {
      const { body } = await meta("p_meta", "ql_w05");
      assert.equal(body.hasCrop, false, "this reading's crop_key is NULL");
      assert.ok(body.reading, "a real reading row exists");
      assert.deepEqual(body.reading.heading, { state: "value", value: "N" }, "the LATEST run's orientation, not the older run's 'S'");
      assert.equal(body.reading.elevation.state, "not_stated");
      assert.equal(body.reading.elevation.value, null);
      assert.deepEqual(body.reading.room, { state: "value", value: "Bed 2" });
      assert.equal(body.reading.confidence, "low");
      assert.deepEqual(body.reading.flags, ["scheduleDrawingMismatch", "northAssumed"]);
      // TOP LEVEL, not on the reading. A gap code explains why there is no
      // crop, and the case that needs it most is a declined opening where
      // `reading` is null - so it cannot live inside `reading`. This row is a
      // real reading that also carries a gap code, and both must hold.
      assert.equal(body.gapCode, "frame_ambiguous");
      // AC-15: split server-side, trimmed, never re-split on the client.
      assert.deepEqual(body.reasoningParts, ["schedule says awning", "drawing shows casement"]);
      assert.deepEqual(body.reading.split, {
        state: "value", axis: "vertical",
        units: [{ role: "operable", ratio: 0.6, operation: "awning", derivedWidthMm: 720 }],
      });
      assert.deepEqual(body.reading.source, {
        fileId: "fa_1", filename: "floor-plan-L1.pdf", pageNo: 2, sheetRef: "A-101", region: "0.1,0.2,0.4,0.4",
      });

      assert.equal(body.run.startedAt.length > 0, true);
      assert.equal(body.run.outcome, "read", "W05's own outcome in fa_1's perOpening — not fa_other's W99");
      assert.deepEqual(body.run.document, {
        fileId: "fa_1", steps: STEPS, failedPhase: "render", wallMs: 4200, modelCalls: 3,
      }, "the CONTAINING file (fa_1), never fa_other — and never an aggregate of both");
    });

    await t.test("AC-7 a parsed opening the drawing run reported on, but never wrote a reading row for", async () => {
      const { body } = await meta("p_meta", "ql_w06");
      assert.equal(body.hasCrop, false);
      assert.equal(body.reading, null, "no reading row for W06 — the tab still exists, the expansion says so");
      assert.equal(body.run.outcome, "not_read", "fa_1's perOpening still names W06");
      assert.equal(body.run.document.fileId, "fa_1");
    });

    await t.test("AC-29 the allow-list has no crop key, no R2 path, no forbidden field", async () => {
      const raw = await (await ops.request("/api/ops/projects/p_meta/lines/ql_w05/meta")).text();
      assert.equal(/crop_key|crop\/|r2_key|cropKey/i.test(raw), false, "the crop KEY never leaves the worker");
      assert.equal(/payout|contact|price|"total"|GST/i.test(raw), false);
      // `gapCode` is a DELIBERATE addition to the allow-list, not a leak: a
      // declined opening has no `reading` to carry it, and the Image panel must
      // still name the recorded reason (AC-10). It is a short enum value
      // (`model_declined`, `render_failed`, ...), never drawing text.
      assert.deepEqual(Object.keys(JSON.parse(raw)).sort(),
        ["gapCode", "hasCrop", "reading", "reasoningParts", "run"]);
    });

    await t.test("AC-30 no gap_note text or crop key in the worker's own log", async () => {
      await meta("p_meta", "ql_w05");
      const log = await readFile(wranglerLogPath, "utf8").catch(() => "");
      assert.equal(log.includes("drawing shows casement"), false, "no reasoning text logged");
      assert.equal(log.includes("crop/old.png"), false, "no crop key logged");
    });

    await t.test("AC-5 a manual line has no metadata address", async () => {
      const response = await ops.request("/api/ops/projects/p_meta/lines/ql_manual/meta");
      assert.equal(response.status, 404);
      assert.deepEqual(JSON.parse(await response.text()), { error: "not_found" });
    });

    await t.test("AC-6 the tab dies with the crops: an issued project 404s", async () => {
      const response = await ops.request("/api/ops/projects/p_issued/lines/ql_issued/meta");
      assert.equal(response.status, 404);
    });

    await t.test("AC-25 a cross-project probe and a nonexistent line are one sentence", async () => {
      const other = await ops.request("/api/ops/projects/p_issued/lines/ql_w05/meta");
      const missing = await ops.request("/api/ops/projects/p_meta/lines/ql_nothing_at_all/meta");
      assert.equal(other.status, 404);
      assert.equal(await other.clone().text(), await missing.text(),
        "byte-identical: a probe cannot learn from the difference whether a line exists");
    });

    // ── T2: GET .../meta/crop ───────────────────────────────────────────────
    await t.test("crop: success streams the bytes with the locked-down headers", async () => {
      const response = await ops.request("/api/ops/projects/p_meta/lines/ql_crop/meta/crop");
      assert.equal(response.status, 200);
      assert.equal(Buffer.from(await response.arrayBuffer()).toString(), cropBytes.toString());
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    });

    await t.test("crop: AC-28/30 the audit row names the staff member and the project, never the crop key", async () => {
      const [{ id: staffId }] = await sql(`SELECT id FROM user WHERE email = '${staffEmail}'`);
      const [event] = await sql(
        `SELECT actor, entity_type, entity_id, action FROM audit_event
          WHERE entity_type = 'project' AND entity_id = 'p_meta' AND action LIKE 'viewed parse crop%'
          ORDER BY occurred_at DESC LIMIT 1`,
      );
      assert.equal(event.actor, staffId);
      assert.equal(event.action, "viewed parse crop for W10");
      assert.equal(event.action.includes("crops/w10.png"), false, "the crop KEY never lands in the log line");
    });

    await t.test("crop: AC-27 purged between parse and view → 404 with no stack detail", async () => {
      const response = await ops.request("/api/ops/projects/p_meta/lines/ql_purged/meta/crop");
      assert.equal(response.status, 404);
      assert.deepEqual(JSON.parse(await response.text()), { error: "not_found" });
    });

    await t.test("crop: AC-25 cross-project probe and a nonexistent line are one sentence", async () => {
      const other = await ops.request("/api/ops/projects/p_issued/lines/ql_crop/meta/crop");
      const missing = await ops.request("/api/ops/projects/p_meta/lines/ql_nothing_at_all/meta/crop");
      assert.equal(other.status, 404);
      assert.equal(await other.clone().text(), await missing.text());
    });

    await t.test("crop: AC-24 an unauthenticated request is refused", async () => {
      const response = await new Session(baseUrl).request("/api/ops/projects/p_meta/lines/ql_crop/meta/crop");
      assert.equal(response.status, 403);
      assert.deepEqual(JSON.parse(await response.text()), { error: "forbidden" });
    });

    await t.test("crop: AC-23 a signed-in customer is refused identically to no session", async () => {
      const customer = new Session(baseUrl);
      await login(customer, "/api/auth", "sarah@northsidebuild.com.au");
      const response = await customer.request("/api/ops/projects/p_meta/lines/ql_crop/meta/crop");
      assert.equal(response.status, 403);
      const anon = await new Session(baseUrl).request("/api/ops/projects/p_meta/lines/ql_crop/meta/crop");
      assert.equal(await response.clone().text(), await anon.text());
    });

    await t.test("crop: AC-22 a manufacturer partner is refused", async () => {
      const partner = new Session(baseUrl);
      await login(partner, "/api/ops/auth", "fabmeta@openframe.com.au");
      const response = await partner.request("/api/ops/projects/p_meta/lines/ql_crop/meta/crop");
      assert.equal(response.status, 403);
      assert.equal(await response.text(), JSON.stringify({ error: "forbidden" }));
    });

    // AC-26 EXECUTED rather than inferred from the route's shape: every place a
    // caller could smuggle an R2 key — query string, request header, and the
    // line id itself — aimed at the line whose own object was purged, so a
    // route that honoured a supplied key would betray itself as a 200 carrying
    // another line's bytes.
    await t.test("crop: AC-26 a supplied crop key is ignored; the key is resolved server-side", async () => {
      for (const path of [
        "/api/ops/projects/p_meta/lines/ql_purged/meta/crop?key=crops/w10.png",
        "/api/ops/projects/p_meta/lines/ql_purged/meta/crop?cropKey=crops/w10.png",
        "/api/ops/projects/p_meta/lines/ql_purged/meta/crop?path=crops/w10.png",
        "/api/ops/projects/p_meta/lines/ql_purged/meta/crop?k=crops%2Fw10.png",
      ]) {
        const response = await ops.request(path);
        assert.equal(response.status, 404, `${path} must not serve another line's object`);
        assert.deepEqual(JSON.parse(await response.text()), { error: "not_found" });
      }
      const header = await ops.request("/api/ops/projects/p_meta/lines/ql_purged/meta/crop", {
        headers: { "X-Crop-Key": "crops/w10.png" },
      });
      assert.equal(header.status, 404);
      // A key in the line-id position is a line id like any other: no such line.
      const asLineId = await ops.request("/api/ops/projects/p_meta/lines/crops%2Fw10.png/meta/crop");
      assert.equal(asLineId.status, 404);
      // The line's OWN crop still resolves while a foreign key rides along, so
      // the refusals above are the key being ignored, not the route being broken.
      const own = await ops.request("/api/ops/projects/p_meta/lines/ql_crop/meta/crop?key=crops/purged.png");
      assert.equal(own.status, 200);
      assert.equal(Buffer.from(await own.arrayBuffer()).toString(), cropBytes.toString());
    });

    await t.test("no run ever reported → run is null, and the tab still opens", async () => {
      const { body } = await meta("p_norun", "ql_norun");
      assert.equal(body.run, null);
      assert.equal(body.reading, null);
      assert.equal(body.hasCrop, false);
    });

    await t.test("AC-19 a newer run with no report never promotes an older run's stale reading (finding)", async () => {
      await sql(`INSERT INTO project (id, organisation_id, owner_user_id, title, status_customer, status_internal, public_ref)
                 VALUES ('p_gap','org_demo','u_demo','Gap audit','submitted','submitted','OF-Q-30004')`);
      await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, dims_json, qty, line_total, status, position, origin)
                 VALUES ('ql_gap','p_gap','W20','Rumpus','amj80-series-awning-window','{"width":"1200","height":"900"}',1,640,'ready',0,'schedule')`);
      await sql(`INSERT INTO ai_runs (id, project_id, pipeline_version, status, started_at, drawing_report_json)
                 VALUES ('air_gap_old','p_gap','v1','completed', datetime('now','-9 days'), '${reportJson([
                   { fileId: "fa_gap", steps: STEPS, perOpening: [{ tag: "W20", outcome: "read" }], wallMs: 500, modelCalls: 2 },
                 ])}')`);
      await sql(`INSERT INTO drawing_reading (id, project_id, ai_run_id, source_file_id, external_ref, split_state, orientation_state, elevation_state, room_state, crop_key)
                 VALUES ('dr_gap_old','p_gap','air_gap_old',NULL,'W20','not_read','not_read','not_read','not_read','crop/gap-old.png')`);
      // A NEWER run that produced no report — must win latest-run over the older, reported run (AC-19: latest means latest).
      await sql(`INSERT INTO ai_runs (id, project_id, pipeline_version, status, started_at, drawing_report_json)
                 VALUES ('air_gap_new','p_gap','v1','failed', datetime('now','-1 hours'), NULL)`);

      const { body } = await meta("p_gap", "ql_gap");
      assert.equal(body.reading, null, "no reading tied to the newer, report-less run — the older run's reading must not leak through");
      assert.equal(body.hasCrop, false);
      assert.ok(body.run, "a run row exists — just with no report");
      assert.equal(body.run.outcome, null);
      assert.equal(body.run.document, null);
    });

    await t.test("AC-18 with two files both claiming this opening's tag, the run document ties to the reading's own file, never the array-first one (finding)", async () => {
      await sql(`INSERT INTO project (id, organisation_id, owner_user_id, title, status_customer, status_internal, public_ref)
                 VALUES ('p_tie','org_demo','u_demo','Tie-break audit','submitted','submitted','OF-Q-30005')`);
      await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, dims_json, qty, line_total, status, position, origin)
                 VALUES ('ql_tie','p_tie','W30','Ensuite','amj80-series-awning-window','{"width":"1200","height":"900"}',1,640,'ready',0,'schedule')`);
      await sql(`INSERT INTO file_asset (id, project_id, kind, filename, r2_key) VALUES ('fa_tie_a','p_tie','plan','plan-a.pdf','crops/plan-a.pdf')`);
      await sql(`INSERT INTO file_asset (id, project_id, kind, filename, r2_key) VALUES ('fa_tie_b','p_tie','plan','plan-b.pdf','crops/plan-b.pdf')`);
      // fa_tie_b is listed FIRST and also claims tag W30 — the array-first file
      // is deliberately NOT the reading's own file, so a naive first-match
      // documentOf would pick the wrong document.
      await sql(`INSERT INTO ai_runs (id, project_id, pipeline_version, status, started_at, drawing_report_json)
                 VALUES ('air_tie','p_tie','v1','completed', datetime('now','-1 hours'), '${reportJson([
                   { fileId: "fa_tie_b", steps: STEPS, perOpening: [{ tag: "W30", outcome: "read" }], wallMs: 111, modelCalls: 1 },
                   { fileId: "fa_tie_a", steps: STEPS, perOpening: [{ tag: "W30", outcome: "read" }], wallMs: 222, modelCalls: 2 },
                 ])}')`);
      await sql(`INSERT INTO drawing_reading (id, project_id, ai_run_id, source_file_id, external_ref, split_state, orientation_state, elevation_state, room_state, crop_key)
                 VALUES ('dr_tie','p_tie','air_tie','fa_tie_a','W30','not_read','not_read','not_read','not_read',NULL)`);

      const { body } = await meta("p_tie", "ql_tie");
      assert.equal(body.reading.source.fileId, "fa_tie_a");
      assert.equal(body.run.document.fileId, "fa_tie_a",
        "the run document must tie to the reading's own source_file_id, never the array-first file that also claims the tag");
    });

    await t.test("a run exists project-wide but never reported on THIS opening", async () => {
      // W99 is the only tag in fa_other's perOpening on the latest run — a
      // line whose own opening was never covered still gets the run's own
      // startedAt (it answers, project-scoped), with outcome/document null.
      await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, dims_json, qty, line_total, status, position, origin)
                 VALUES ('ql_w09','p_meta','W09','Porch','amj80-series-awning-window','{"width":"1200","height":"900"}',1,640,'ready',4,'schedule')`);
      const { body } = await meta("p_meta", "ql_w09");
      assert.equal(body.run.outcome, null);
      assert.equal(body.run.document, null);
      assert.equal(body.run.startedAt.length > 0, true);
      assert.equal(body.reading, null);
    });

    // ── The auth ladder (AC-22/23/24) ───────────────────────────────────────
    await t.test("AC-24 an unauthenticated request is refused", async () => {
      const response = await new Session(baseUrl).request("/api/ops/projects/p_meta/lines/ql_w05/meta");
      assert.equal(response.status, 403);
      assert.deepEqual(JSON.parse(await response.text()), { error: "forbidden" });
    });

    await t.test("AC-23 a signed-in customer is refused identically to no session", async () => {
      const customer = new Session(baseUrl);
      await login(customer, "/api/auth", "sarah@northsidebuild.com.au");
      const response = await customer.request("/api/ops/projects/p_meta/lines/ql_w05/meta");
      assert.equal(response.status, 403);
      const anon = await new Session(baseUrl).request("/api/ops/projects/p_meta/lines/ql_w05/meta");
      assert.equal(await response.clone().text(), await anon.text());
    });


    // F2 - THE OWNING ACCOUNT, which is the case AC-23 actually turns on.
    // The test above signs in a customer who does not own p_meta, so it
    // proves only that a stranger is refused. The interesting principal is
    // the one whose project this IS: demoEmail is u_demo, and u_demo is
    // p_meta's owner_user_id. Parse readings are staff evidence about a
    // drawing, not something the customer who uploaded it may read back.
    await t.test("AC-23 the OWNING customer account is refused too", async () => {
      const owner = new Session(baseUrl);
      await login(owner, "/api/auth", demoEmail);
      for (const path of [
        "/api/ops/projects/p_meta/lines/ql_w05/meta",
        "/api/ops/projects/p_meta/lines/ql_w05/meta/crop",
      ]) {
        const response = await owner.request(path);
        assert.equal(response.status, 403, path);
        const anon = await new Session(baseUrl).request(path);
        assert.equal(await response.clone().text(), await anon.text(),
          path + ": the owner is refused in the same words as a stranger");
      }
    });

    await t.test("AC-22 a manufacturer partner is refused", async () => {
      const partner = new Session(baseUrl);
      await login(partner, "/api/ops/auth", "fabmeta@openframe.com.au");
      const response = await partner.request("/api/ops/projects/p_meta/lines/ql_w05/meta");
      assert.equal(response.status, 403);
      assert.equal(await response.text(), JSON.stringify({ error: "forbidden" }));
    });
  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
