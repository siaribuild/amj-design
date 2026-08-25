// Phase 3a of ops2 "Why this product": the universal capture, over a real Worker
// and a real local D1 (boot copied from thermal-calibration-api.test.mjs:38-63,
// itself from delivery/api-edge).
//
// The pure half — the resolver's rules and the SNAP-AC-2 source scan — lives in
// figure-capture.test.mjs. What only this suite can answer is the one that
// matters most: THAT THE CAPTURE IS NEVER A GATE. A save that succeeds today
// must still succeed, with the same status, the same stored values, the same
// price and the same response.
//
// The harness runs with SANITY_PROJECT_ID empty, so the catalogue is genuinely
// unreachable throughout. That is not a limitation of the fixture — it IS the
// worst case (SNAP-AC-6): every resolved capture here is a stated absence, and
// every save below must still land exactly as it does today.
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  Session, completeAccount, freePort, login, makeRunDir, removeRunDir,
  requestJson, run, staffEmail, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";

/** A captured unknown: the catalogue was consulted and had no figure. Distinct
 *  from SQL NULL, which means the line predates the capture (SNAP-AC-8). */
const ABSENT = '{"uValue":null,"shgc":null}';
/** A real captured figure, used where a test must prove one SURVIVES. */
const FIGURES_2_4 = '{"uValue":2.4,"shgc":0.32}';

const aLine = (overrides = {}) => ({
  code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
  width: "1200", height: "900", qty: 1,
  options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
  lineTotal: 1,
  ...overrides,
});

/** Any figure a client could plausibly try to smuggle onto a line (X-AC-8/9). */
const CLIENT_THERMAL = {
  uValue: 0.11, shgc: 0.99, uw: 0.11,
  performanceFigures: { uValue: 0.11, shgc: 0.99 },
  performance_figures_json: '{"uValue":0.11,"shgc":0.99}',
};

const mentionsAFigure = (body) =>
  /performance_figures|"uValue"|"shgc"|"uw"/.test(typeof body === "string" ? body : JSON.stringify(body));

// SNAP-AC-15's assertions are ABSENCES, which is the easiest thing to test
// badly: a predicate that silently stops matching reports a clean response over
// every response. So it is exercised against a body that DOES leak, first.
test("the leak predicate can see a leak", () => {
  assert.equal(mentionsAFigure({ items: [{ id: "x", uValue: 2.4 }] }), true);
  assert.equal(mentionsAFigure({ items: [{ id: "x", performance_figures_json: ABSENT }] }), true);
  assert.equal(mentionsAFigure({ items: [{ id: "x", lineTotal: 510, status: "Ready" }] }), false);
});

test("the universal capture, over a real Worker and D1", { timeout: 300_000 }, async (t) => {
  const runDir = await makeRunDir("why-capture-api");
  const assets = join(runDir, "assets");
  const state = join(runDir, "state");
  const wranglerEnv = { WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") };
  let server;
  try {
    await run(process.execPath, [viteCli, "build", "--outDir", assets, "--emptyOutDir"]);
    await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "apertly-db", "--local", "--persist-to", state], { env: wranglerEnv });
    const rerun = await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "apertly-db", "--local", "--persist-to", state], { env: wranglerEnv });
    await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--file", "scripts/db/seed.sql"], { env: wranglerEnv });
    const sql = async (command) => {
      const r = await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command", command], { env: wranglerEnv });
      return JSON.parse(r.stdout)[0].results;
    };
    const figuresOf = async (lineId) => {
      const rows = await sql(`SELECT performance_figures_json AS f FROM quote_line WHERE id='${lineId}'`);
      return rows[0]?.f ?? null;
    };

    // ── SNAP-AC-10 / the migration: additive, and no backfill ───────────────
    await t.test("0058 adds one nullable column, disturbs nothing, and backfills no line", async () => {
      assert.match(rerun.stdout + rerun.stderr, /No migrations to apply/i, "the migration is idempotent");

      const columns = await sql("PRAGMA table_info(quote_line)");
      const added = columns.find((c) => c.name === "performance_figures_json");
      assert.ok(added, "the column exists");
      assert.equal(added.notnull, 0, "nullable — a line that predates the capture has no figures to state");
      assert.equal(added.dflt_value, null, "and no default, so absence is absence rather than a manufactured record");

      assert.deepEqual(await sql("PRAGMA foreign_key_check"), [], "every foreign-key link is intact");

      // The seeded lines were written before the capture existed. SNAP-AC-10 /
      // D5: no script and no migration puts a figure on them, ever.
      const seeded = await sql(
        "SELECT COUNT(*) AS n, COUNT(performance_figures_json) AS captured FROM quote_line");
      assert.ok(seeded[0].n >= 4, `the seed's lines are all still here (${seeded[0].n})`);
      assert.equal(seeded[0].captured, 0, "and not one of them was backfilled");
    });

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    server = start(process.execPath, [
      wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
      "--persist-to", state, "--assets", assets, "--log-level", "warn",
      // Sanity off: the catalogue is unreachable, which is SNAP-AC-6's case.
      "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:",
      "--var", "SANITY_PROJECT_ID:", "--var", "AI_EXTRACTION_MODE:manual",
    ], { env: wranglerEnv });
    await waitForUrl(`${baseUrl}/api/health`, server);

    const ops = new Session(baseUrl);
    await login(ops, "/api/ops/auth", staffEmail);

    // ── SNAP-AC-13 / SNAP-AC-5 / SNAP-AC-15: the customer path ──────────────
    const customer = new Session(baseUrl);
    let customerProjectId; let insertedLineId;
    await t.test("SNAP-AC-13 a customer-configured line carries figures, and the customer sees no difference", async () => {
      const saved = await requestJson(customer, "/api/projects/current/lines", {
        method: "PUT",
        json: { title: "Capture project", items: [aLine()] },
      });
      customerProjectId = saved.body.project.id;
      insertedLineId = saved.body.items[0].id;

      // The parity canary from api.test.mjs. If the capture had disturbed the
      // save path's pricing, this is the number that would move.
      assert.equal(saved.body.items[0].lineTotal, 510, "the price is the one the engine has always produced");
      assert.equal(saved.body.items[0].status, "Ready");

      assert.equal(await figuresOf(insertedLineId), ABSENT,
        "a client-configured line now carries a capture — present-and-null, because the catalogue is unreachable");

      // SNAP-AC-15: the only difference is what the row stores.
      const reopened = await requestJson(customer, "/api/projects/current");
      for (const [what, body] of [["the save", saved.body], ["the reload", reopened.body]]) {
        assert.equal(mentionsAFigure(body), false, `${what} response names no figure`);
      }
      assert.equal(reopened.body.items[0].lineTotal, 510);
    });

    await t.test("X-AC-9 a customer cannot write a thermal figure onto a line", async () => {
      // A note-only edit: the pick has not moved, so nothing is resolved and
      // nothing is written (§1.4). The body's numbers have no path in at all.
      const saved = await requestJson(customer, "/api/projects/current/lines", {
        method: "PUT",
        json: {
          title: "Capture project",
          items: [{ ...aLine(), serverId: insertedLineId, location: "Living 2", ...CLIENT_THERMAL }],
        },
      });
      assert.equal(saved.body.items[0].lineTotal, 510, "the save succeeded and priced as before");
      // NOTE the claim this does NOT make: the prior value is ABSENT and every
      // resolution here is ABSENT, so "untouched" and "rewritten identically"
      // are indistinguishable at this site. The smuggling axis is X-AC-9's
      // subject and is what the next save pins; §1.4's carry-forward is pinned
      // where a real figure is seeded (SNAP-AC-16, below).
      assert.equal(await figuresOf(insertedLineId), ABSENT,
        "the stored figures are still the server's own, whatever the body said");

      // And on a save that DOES move the pick, so a resolution really runs: the
      // stored figures are the server's, not the body's.
      const moved = await requestJson(customer, "/api/projects/current/lines", {
        method: "PUT",
        json: {
          title: "Capture project",
          items: [{
            ...aLine(), serverId: insertedLineId, location: "Living 2",
            options: { ...aLine().options, glazing: "double-lowe" }, ...CLIENT_THERMAL,
          }],
        },
      });
      assert.equal(moved.response.status, 200);
      assert.equal(await figuresOf(insertedLineId), ABSENT,
        "the body's 0.11/0.99 reached nothing — the stored figures are the server's own resolution");
    });

    // ── SNAP-AC-14: the erasure, and what replaces it ───────────────────────
    await t.test("SNAP-AC-14 a customer editing an AI-priced line records what THEY chose, never nothing", async () => {
      // Make the line read as AI-managed and give it a REAL captured figure, so
      // this can fail in both wrong directions: leaving the estimator's figure
      // behind, or clearing the column to SQL NULL beside the voided snapshot.
      await sql(`UPDATE quote_line SET origin='ai', selected_variant_id='dg-lowe',
                   configuration_snapshot_json='{"productSlug":"amj80-series-sliding-window"}',
                   pricing_snapshot_json='{"total":510}',
                   performance_figures_json='{"uValue":2.4,"shgc":0.32}'
                 WHERE id='${insertedLineId}'`);

      // A COLOUR change is a material edit — it voids the estimator's snapshot —
      // but colour is not part of the pick (§1.4): the product and the glass are
      // unchanged, so the recorded figures still describe this line exactly.
      const colour = await requestJson(customer, "/api/projects/current/lines", {
        method: "PUT",
        json: {
          title: "Capture project",
          items: [{
            ...aLine(), serverId: insertedLineId,
            // The glass stays exactly as the preceding save left it: this edit
            // changes a finish and nothing the resolver reads.
            options: { ...aLine().options, glazing: "double-lowe", colour: "Monument" },
          }],
        },
      });
      assert.equal(colour.response.status, 200, "the edit still succeeds");

      const [row] = await sql(
        `SELECT configuration_snapshot_json AS snap, performance_figures_json AS figures,
                review_json AS review, line_total AS total
           FROM quote_line WHERE id='${insertedLineId}'`);
      assert.equal(row.snap, null, "the estimator's configuration snapshot is still voided, exactly as before");
      assert.match(row.review, /customerConfigurationChanged/, "and the line is still stamped for a human to confirm");
      assert.ok(row.total > 0, "and it is still priced — the capture changed no branch here");
      assert.equal(row.figures, FIGURES_2_4,
        "and the figures stand: the customer changed a finish, not the glass, so the record still describes what this line performs at");

      // Re-arm: put the line back to an AI-priced line meeting its FIRST
      // material edit. Without this the next save lands on the reload/autosave
      // repair branch (the edited-field set is already ["options_json"], so
      // editedFieldsAfterSave returns it unchanged), which writes no product and
      // therefore no figures — pre-existing behaviour, and not what SNAP-AC-14
      // is about.
      await sql(`UPDATE quote_line SET edited_fields=NULL, origin='ai', selected_variant_id='dg-lowe',
                   configuration_snapshot_json='{"productSlug":"amj80-series-sliding-window"}',
                   performance_figures_json='${FIGURES_2_4}'
                 WHERE id='${insertedLineId}'`);

      // Now move the GLASS, which IS the pick. What replaces the snapshot is the
      // figures of what the customer chose — never the estimator's old ones, and
      // never nothing.
      const glass = await requestJson(customer, "/api/projects/current/lines", {
        method: "PUT",
        json: {
          title: "Capture project",
          items: [{
            ...aLine(), serverId: insertedLineId,
            options: { ...aLine().options, colour: "Monument", glazing: "double-clear" },
          }],
        },
      });
      assert.equal(glass.response.status, 200, "that edit succeeds too");
      assert.equal(await figuresOf(insertedLineId), ABSENT,
        "the estimator's 2.4/0.32 describes a glass this line no longer has, so it is replaced — with an honest absence, because the catalogue is down");
    });

    // ── SNAP-AC-4 / X-AC-8: the ops path ────────────────────────────────────
    await t.test("SNAP-AC-4 / X-AC-8 an ops edit still succeeds, and ignores every thermal field in the body", async () => {
      // ql_s1 is a line on which NO performance variant can be resolved — the
      // catalogue is unreachable for the whole run — which is precisely
      // SNAP-AC-4's premise.
      assert.equal(await figuresOf("ql_s1"), null, "the line starts with no capture at all");

      // Two edits that MOVE the pick to the same place, the second carrying
      // every thermal field a client could invent. The glazing is identical in
      // both, so the smuggled payload is the ONLY variable and any difference in
      // the outcome is that payload having reached something.
      const plain = await requestJson(ops, "/api/ops/lines/ql_s1", {
        method: "PATCH", json: { options: { glazing: "double-lowe" } },
      });
      assert.equal(plain.response.status, 200, "no new refusal — no configuration_not_eligible, no 409");
      const [before] = await sql("SELECT status, line_total AS total, performance_figures_json AS figures FROM quote_line WHERE id='ql_s1'");
      assert.equal(before.figures, ABSENT, "the edit captured the server's own resolution");
      assert.ok(before.total > 0, "and it is still priced");

      // Same glazing as `plain`, so this save's pick has NOT moved — which is
      // itself the point: the payload cannot write a figure on a save that
      // resolves nothing either.
      const laden = await requestJson(ops, "/api/ops/lines/ql_s1", {
        method: "PATCH", json: { options: { glazing: "double-lowe" }, ...CLIENT_THERMAL },
      });
      assert.equal(laden.response.status, 200, "still no refusal");
      assert.equal(mentionsAFigure(laden.body), false, "and the response is unchanged in shape");

      const [after] = await sql("SELECT status, line_total AS total, performance_figures_json AS figures FROM quote_line WHERE id='ql_s1'");
      assert.equal(after.status, before.status, "same status");
      assert.equal(after.total, before.total, "same price");
      assert.equal(after.figures, ABSENT,
        "and the body's 0.11/0.99 reached nothing — the stored figures are the server's own resolution");
    });

    // ── §1.4: the outage triad — the defect this phase caught before deploy ──
    //
    // As first built, every writer re-resolved on every save. A room-label edit
    // during a catalogue outage overwrote a good capture with present-and-null,
    // asserting "the catalogue has no figure for this product" on a save that
    // never successfully asked — and W3 did it to EVERY ordinary line on EVERY
    // customer autosave. Re-resolving an unmoved pick is a recompute of a
    // captured snapshot, which SNAP-AC-9 forbids outright; the outage is only
    // its loudest symptom. The catalogue is down for this whole run, so if any
    // of these three re-resolved, it would show.
    await t.test("SNAP-AC-16 an ops save that leaves the pick alone leaves the figures byte-identical", async () => {
      await sql(`UPDATE quote_line SET performance_figures_json='${FIGURES_2_4}' WHERE id='ql_s1'`);

      for (const [what, body] of [
        ["a note", { room: "Bed 1, revised again" }],
        ["a size", { width: "1600" }],
        ["a quantity", { qty: 7 }],
      ]) {
        const r = await requestJson(ops, "/api/ops/lines/ql_s1", { method: "PATCH", json: body });
        assert.equal(r.response.status, 200, `the ${what} edit succeeds`);
        assert.equal(await figuresOf("ql_s1"), FIGURES_2_4,
          `${what} is not the pick, so the capture stands — a save that never asked the catalogue cannot report what it says`);
      }

      // And the other half of the same rule: a moved pick DOES re-resolve, and
      // an honest absence is right there, because the stored figures describe a
      // glass this line no longer has.
      const moved = await requestJson(ops, "/api/ops/lines/ql_s1", {
        method: "PATCH", json: { options: { glazing: "triple-lowe" } },
      });
      assert.equal(moved.response.status, 200);
      assert.equal(await figuresOf("ql_s1"), ABSENT,
        "pinning 2.4/0.32 onto a configuration the row no longer has would be worse than an honest null");
    });

    await t.test("SNAP-AC-16 a customer autosave that moves no pick rewrites nothing, on any line", async () => {
      // This is the one that mattered most: W3 rewrote every ordinary line on
      // every project save. One autosave during an outage would have nulled a
      // whole project.
      const autosaver = new Session(baseUrl);
      await login(autosaver, "/api/auth", "autosave-capture@example.com");
      const made = await requestJson(autosaver, "/api/projects/current/lines", {
        method: "PUT",
        json: {
          title: "Autosave project",
          items: [aLine({ code: "W01" }), aLine({ code: "W02", location: "Kitchen" }), aLine({ code: "W03", location: "Bed" })],
        },
      });
      const ids = made.body.items.map((i) => i.id);
      assert.equal(ids.length, 3);

      // Two of them carry real captures; the third is left as a pre-capture
      // NULL, which must also survive untouched (SNAP-AC-10 — no opportunistic
      // backfill on touch).
      await sql(`UPDATE quote_line SET performance_figures_json='${FIGURES_2_4}' WHERE id IN ('${ids[0]}','${ids[1]}')`);
      await sql(`UPDATE quote_line SET performance_figures_json=NULL WHERE id='${ids[2]}'`);

      const autosave = await requestJson(autosaver, "/api/projects/current/lines", {
        method: "PUT",
        json: {
          title: "Autosave project",
          items: [
            { ...aLine({ code: "W01" }), serverId: ids[0], location: "Living, renamed" },
            { ...aLine({ code: "W02", location: "Kitchen" }), serverId: ids[1], width: "1300" },
            { ...aLine({ code: "W03", location: "Bed" }), serverId: ids[2] },
          ],
        },
      });
      assert.equal(autosave.response.status, 200, "the autosave succeeds");

      assert.equal(await figuresOf(ids[0]), FIGURES_2_4, "a renamed line keeps its capture");
      assert.equal(await figuresOf(ids[1]), FIGURES_2_4, "a resized line keeps its capture");
      assert.equal(await figuresOf(ids[2]), null,
        "and a line that predates the capture is still NULL — a figure fetched now for a product chosen months ago is a display-time read wearing a snapshot's clothes");
    });

    await t.test("SNAP-AC-16 restoring a proposal that matches the line leaves the figures alone", async () => {
      // The restore path is the ONE writer §4.5 was not amended for by A4, and
      // SNAP-AC-16 admits no exemption: "a save that did not move the pick".
      // Restoring a line the customer never actually changed moves nothing — so
      // during an outage it must not overwrite a good capture with "no figure
      // exists". The API does not require the line to have been edited; only the
      // browser does.
      const restorer = new Session(baseUrl);
      await login(restorer, "/api/auth", "restore-capture@example.com");
      const made = await requestJson(restorer, "/api/projects/current/lines", {
        method: "PUT", json: { title: "Restore project", items: [aLine({ code: "W01" })] },
      });
      const projectId = made.body.project.id;
      const lineId = made.body.items[0].id;

      // A published proposal whose recorded configuration IS what the line
      // already carries: same product, same options, no variant named.
      const options = JSON.stringify(aLine().options).replace(/'/g, "''");
      await sql(`UPDATE project SET ai_generation=1 WHERE id='${projectId}'`);
      await sql(`INSERT INTO ai_runs (id, project_id, pipeline_version, status)
                 VALUES ('run_r', '${projectId}', 'v1', 'completed')`);
      await sql(`INSERT INTO opening_instance (id, project_id, quote_line_id, external_ref)
                 VALUES ('oi_r', '${projectId}', '${lineId}', 'W01')`);
      await sql(`INSERT INTO ai_proposal (id, project_id, ai_run_id, source_generation,
                   source_manifest_hash, pipeline_version, status)
                 VALUES ('ap_r', '${projectId}', 'run_r', 1, 'hash', 'v1', 'published')`);
      await sql(`INSERT INTO ai_job_claim (project_id, source_generation, debounce_token, status)
                 VALUES ('${projectId}', 1, 'tok', 'completed')`);
      await sql(`INSERT INTO ai_proposal_line (id, proposal_id, project_id, opening_id, quote_line_id,
                   external_ref, quantity, dimensions_json, product_slug, performance_variant_id,
                   configuration_json, ranking_context_json, price_snapshot_json,
                   recommendation_basis, confidence_band, review_required, applied_to_cart)
                 VALUES ('apl_r', 'ap_r', '${projectId}', 'oi_r', '${lineId}', 'W01', 1,
                   '{"widthMm":1200,"heightMm":900}', 'amj80-series-sliding-window', NULL,
                   '{"productSlug":"amj80-series-sliding-window","options":${options},"dimensions":{"widthMm":1200,"heightMm":900},"quantity":1}',
                   '{}', '{"total":510}', 'thermal', 'high', 0, 1)`);
      await sql(`UPDATE quote_line SET performance_figures_json='${FIGURES_2_4}' WHERE id='${lineId}'`);

      const restored = await requestJson(
        restorer, `/api/projects/current/lines/${lineId}/restore-ai`, { method: "POST" });
      assert.equal(restored.response.status, 200, "the restore still succeeds");
      assert.equal(await figuresOf(lineId), FIGURES_2_4,
        "the proposal describes the configuration the line already had, so nothing about the pick moved and the capture stands");
    });

    await t.test("SNAP-AC-16 a non-string glazing cannot fake a moved pick", async () => {
      // REACHABILITY FIRST. itemOptions() casts the client's options object
      // without coercing its values, and itemFields serialises it verbatim — so
      // a number lands in options_json and both sides of the comparison have to
      // read it the same way. Two readings of one fact is what produced every
      // other defect in this phase.
      const oddball = new Session(baseUrl);
      await login(oddball, "/api/auth", "numeric-glazing@example.com");
      const made = await requestJson(oddball, "/api/projects/current/lines", {
        method: "PUT",
        json: {
          title: "Numeric glazing",
          items: [{ ...aLine(), options: { ...aLine().options, glazing: 5 } }],
        },
      });
      const lineId = made.body.items[0].id;
      const [row] = await sql(`SELECT options_json AS o FROM quote_line WHERE id='${lineId}'`);
      assert.match(row.o, /"glazing":5/,
        "reachable: the number is stored as a number, uncoerced, on the customer's own save path");

      // Now the rule. Nothing about the pick changes between these two saves.
      await sql(`UPDATE quote_line SET performance_figures_json='${FIGURES_2_4}' WHERE id='${lineId}'`);
      const again = await requestJson(oddball, "/api/projects/current/lines", {
        method: "PUT",
        json: {
          title: "Numeric glazing",
          items: [{
            ...aLine(), serverId: lineId, location: "Renamed",
            options: { ...aLine().options, glazing: 5 },
          }],
        },
      });
      assert.equal(again.response.status, 200, "the save still succeeds");
      assert.equal(await figuresOf(lineId), FIGURES_2_4,
        "the pick did not move, so the capture stands — the stored side and the pick side must read `glazing` through the same expression");
    });

    // ── SNAP-AC-9 / the composite parent ────────────────────────────────────
    await t.test("SNAP-AC-9 a save that chooses no product recomputes nothing; the units own the facts", async () => {
      const cust = new Session(baseUrl);
      await login(cust, "/api/auth", "split-capture@example.com");
      const made = await requestJson(cust, "/api/projects/current/lines", {
        method: "PUT",
        json: { title: "Split project", items: [aLine({ code: "W12", width: "2400", height: "900" })] },
      });
      const projectId = made.body.project.id;
      const parentId = made.body.items[0].id;
      await completeAccount(cust, { name: "Split Tester" });
      await requestJson(cust, `/api/projects/${projectId}/submit`, {
        method: "POST", json: { delivery: { suburb: "Rowville", postcode: "3178" } },
      });

      await requestJson(ops, `/api/ops/lines/${parentId}/split`, {
        method: "POST",
        json: {
          axis: "vertical",
          segments: [
            { widthMm: 1200, heightMm: 900, productSlug: "amj80-series-sliding-window", qtyPerParent: 1 },
            { widthMm: 1200, heightMm: 900, productSlug: "amj80-series-sliding-window", qtyPerParent: 1 },
          ],
        },
      });
      const units = await sql(
        `SELECT id, performance_figures_json AS figures FROM quote_line WHERE parent_line_id='${parentId}' ORDER BY segment_seq`);
      assert.equal(units.length, 2, "the split landed");
      for (const u of units) assert.equal(u.figures, ABSENT, "each unit carries its own capture");

      // Now give the parent a real figure and touch it with a save that chooses
      // no product. Nothing may recompute it.
      await sql(`UPDATE quote_line SET performance_figures_json='{"uValue":2.4,"shgc":0.32}' WHERE id='${parentId}'`);
      await requestJson(ops, `/api/ops/lines/${parentId}`, { method: "PATCH", json: { qty: 3 } });
      assert.equal(await figuresOf(parentId), '{"uValue":2.4,"shgc":0.32}',
        "the parent's record stands — the rule is vacuous on a parent, and a snapshot is never re-derived");

      // A unit edit DOES move the pick, so it re-captures. Seeded with a REAL
      // figure first: the catalogue is unreachable all run, so without a
      // distinguishable starting value an ABSENT result would be true whether
      // updateSegment re-resolved, carried forward, or never wrote the column.
      await sql(`UPDATE quote_line SET performance_figures_json='${FIGURES_2_4}' WHERE id='${units[1].id}'`);
      await requestJson(ops, `/api/ops/segments/${units[1].id}`, {
        method: "PATCH", json: { productSlug: "amj80-series-awning-window" },
      });
      assert.equal(await figuresOf(units[1].id), ABSENT,
        "a unit that was re-specified re-captures — 2.4/0.32 described the frame it no longer has");

      // And its sibling, untouched by that PATCH, keeps whatever it had.
      await sql(`UPDATE quote_line SET performance_figures_json='${FIGURES_2_4}' WHERE id='${units[0].id}'`);
      await requestJson(ops, `/api/ops/segments/${units[0].id}`, {
        method: "PATCH", json: { note: "left unit" },
      });
      assert.equal(await figuresOf(units[0].id), FIGURES_2_4,
        "a note-only unit edit moves no pick, so it fetches nothing and writes the same bytes back");
    });

    // ── SNAP-AC-11: the platform's own record is never edited ───────────────
    await t.test("SNAP-AC-11 a capture writes only to the line, never to what the platform decided", async () => {
      await sql(`INSERT INTO opening_instance (id, project_id, quote_line_id, external_ref)
                 VALUES ('oi_cap', 'p_submitted', 'ql_s2', 'D01')`);
      await sql(`INSERT INTO selection_run (id, opening_id, project_id, catalogue_revision, status)
                 VALUES ('sr_cap', 'oi_cap', 'p_submitted', 'rev-1', 'completed')`);
      await sql(`INSERT INTO candidate_result
                   (id, selection_run_id, sanity_product_id, catalogue_rev, hard_rule_passed, score, outcome_json)
                 VALUES ('cr_cap', 'sr_cap', 'prod-1', 'rev-1', 1, 0.9, '{"status":"meets"}')`);
      const digest = async () => JSON.stringify([
        await sql("SELECT id, catalogue_revision, status FROM selection_run ORDER BY id"),
        await sql("SELECT id, sanity_product_id, score, outcome_json FROM candidate_result ORDER BY id"),
      ]);
      const before = await digest();
      // Non-vacuity: the rows this asserts about actually exist.
      assert.match(before, /sr_cap/, "the platform record under test is present");
      assert.match(before, /cr_cap/);

      const patched = await requestJson(ops, "/api/ops/lines/ql_s2", {
        method: "PATCH", json: { productSlug: "amj80-series-awning-window" },
      });
      assert.equal(patched.response.status, 200);
      assert.equal(await figuresOf("ql_s2"), ABSENT, "the line captured");
      assert.equal(await digest(), before,
        "and what the platform decided is byte-for-byte what it was — no selection_run, no candidate_result, no outcome_json moved");
    });

    // ── X-AC-10: the capture never crosses a project ────────────────────────
    await t.test("X-AC-10 a save naming another project's line writes no figure to it", async () => {
      // ql_1 belongs to p_draft, owned by u_demo — not this customer's project,
      // and not in a state the ops route may edit.
      const foreign = await figuresOf("ql_1");
      assert.equal(foreign, null, "the foreign line has no capture to start with");

      await requestJson(ops, "/api/ops/lines/ql_1", { method: "PATCH", json: { qty: 9 } }, 404);
      assert.equal(await figuresOf("ql_1"), null, "the ops guard refused and wrote nothing");

      // The customer batch is guarded by project + draft + version + token; a
      // line id from another project falls through to an INSERT in the caller's
      // own project rather than reaching the foreign row.
      await requestJson(customer, "/api/projects/current/lines", {
        method: "PUT",
        json: { title: "Capture project", items: [{ ...aLine(), serverId: "ql_1", ...CLIENT_THERMAL }] },
      });
      assert.equal(await figuresOf("ql_1"), null,
        "still nothing — the customer's save could not reach a line outside their own project");
      const [owner] = await sql("SELECT project_id AS p FROM quote_line WHERE id='ql_1'");
      assert.equal(owner.p, "p_draft", "and the row still belongs to the project it always did");
    });
  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
