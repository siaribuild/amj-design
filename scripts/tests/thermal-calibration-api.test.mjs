// The thermal calibration endpoint, and the dial, over a real Worker and a real
// local D1 (boot copied from delivery.test.mjs:41-63, itself from api-edge).
//
// What only this suite can answer: that the migration applied without touching
// anything, that the owner can turn the dial with a DB write and no deploy, that
// staff can read the calibration and nobody else can, and — the one that has to
// be executed rather than reasoned about — that no HTTP verb anywhere can move
// the default band.
//
// TB-18 binds this file as it binds every other: nothing here asserts what the
// default Uw ought to be. The dial is written and then read back, and the
// assertion is that the two agree.
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  Session, completeAccount, freePort, login, makeRunDir, removeRunDir,
  requestJson, run, staffEmail, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";

const aLine = (overrides = {}) => ({
  code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
  width: "1200", height: "900", qty: 1,
  options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
  lineTotal: 1,
  ...overrides,
});

const CALIBRATION = "/api/ops/thermal/calibration";
// Two paths are probed for write verbs: the route that exists, and the route a
// future writer would most plausibly be added at.
const WRITE_TARGETS = [CALIBRATION, "/api/ops/thermal/default-band"];

test("thermal calibration endpoint, the dial, and the migration", { timeout: 240_000 }, async (t) => {
  const runDir = await makeRunDir("thermal-calibration-api");
  const assets = join(runDir, "assets");
  const state = join(runDir, "state");
  const wranglerEnv = { CLOUDFLARE_API_TOKEN: "wrangler-local-dev-not-a-real-credential", WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") };
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

    // ── TB-14: the migration adds a table and disturbs nothing ──────────────
    // A table rebuild once fired ON DELETE CASCADE in production and silently
    // deleted 20 order_line and 4 payment rows. This migration is additive, and
    // this is where that is verified rather than asserted.
    await t.test("TB-14: 0057 creates one new table, alters nothing, and leaves every FK intact", async () => {
      assert.match(rerun.stdout + rerun.stderr, /No migrations to apply/i, "the migration is idempotent");

      const [{ sql: openingRequirements }] = await sql(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='opening_requirements'");
      const bases = [...openingRequirements.matchAll(/'(explicit_energy_report|plan_derived|default_envelope|human_override)'/g)]
        .map((m) => m[1]);
      assert.deepEqual(bases.sort(),
        ["default_envelope", "explicit_energy_report", "human_override", "plan_derived"],
        "still exactly four bases — a fifth would mean rebuilding a self-referencing cascade parent");
      assert.match(openingRequirements, /parent_opening_id\s+TEXT REFERENCES opening_requirements\(id\) ON DELETE CASCADE/,
        "and the cascade edge that makes a rebuild dangerous is still there, untouched");

      // The tables a rebuild would have endangered are present and unaltered.
      for (const table of ["opening_requirements", "opening_instance", "building_models", "candidate_result"]) {
        const rows = await sql(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='${table}'`);
        assert.equal(rows[0].n, 1, `${table} still exists`);
      }
      assert.deepEqual(await sql("PRAGMA foreign_key_check"), [], "every pre-existing foreign-key link is intact");

      // The new table: a ledger, and empty. No seed row was frozen into an
      // append-only file — the value is the owner's to set.
      const [{ n }] = await sql("SELECT COUNT(*) AS n FROM thermal_default_band");
      assert.equal(n, 0);
      const [{ sql: ledger }] = await sql("SELECT sql FROM sqlite_master WHERE name='thermal_default_band'");
      assert.equal(/REFERENCES/i.test(ledger), false, "no FK edge in either direction, so no cascade can reach it");
      assert.equal(/observed_report_maximum/.test(ledger), false,
        "the withdrawn derivation method is not even expressible");
    });

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    server = start(process.execPath, [
      wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
      "--persist-to", state, "--assets", assets, "--log-level", "warn",
      // Sanity off: axis 3 must report an empty catalogue rather than fail.
      "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:", "--var", "SANITY_PROJECT_ID:", "--var", "AI_EXTRACTION_MODE:manual",
    ], { env: wranglerEnv });
    await waitForUrl(`${baseUrl}/api/health`, server);

    const staff = new Session(baseUrl);
    await login(staff, "/api/ops/auth", staffEmail);
    const anonymous = new Session(baseUrl);

    // ── TB-28: staff can read all three axes ────────────────────────────────
    await t.test("TB-28: an authenticated staff session reads demand, assertion and deliverability", async () => {
      const { body } = await requestJson(staff, CALIBRATION);

      // Axis 1 — what reports have demanded.
      assert.deepEqual(Object.keys(body.basisCounts).sort(),
        ["default_envelope", "explicit_energy_report", "human_override", "plan_derived"]);
      for (const key of ["openings", "distinctProjects", "minUValue", "maxUValue", "meanUValue"]) {
        assert.ok(key in body.reportRows, `reportRows.${key}`);
      }
      assert.equal(typeof body.sampleAdequate, "boolean");

      // Axis 2 — what the default asserts, and on whose authority. With an empty
      // ledger this is the seed, and it says so in words.
      assert.equal(body.activeDefault.version, "seed:1");
      assert.match(body.activeDefault.source, /no citable source/i);
      assert.equal(body.activeDefault.interim, true);

      // Axis 3 — what the catalogue can deliver, per derived candidate cap.
      assert.ok(body.candidateCaps.length > 0);
      for (const candidate of body.candidateCaps) {
        for (const key of ["cap", "origins", "publishedRowsMeeting", "publishedRowsTotal",
          "unpublishedRowsMeeting", "productsWithPublishedRowMeeting", "productsTotal", "deltaVsActive"]) {
          assert.ok(key in candidate, `candidateCaps[].${key}`);
        }
      }
      assert.equal(body.candidateCaps.filter((c) => c.deltaVsActive === null).length, 1,
        "exactly one cap is the active one, and it costs nothing against itself");
      assert.equal(typeof body.catalogueRevision, "string");
      // Nothing recommends a value, at any sample size.
      assert.equal(/recommend/i.test(JSON.stringify(body)), false);
    });
    // ── AB-1 / AB-2: nobody but staff ───────────────────────────────────────
    await t.test("AB-1/AB-2: a customer and an anonymous visitor are both refused, with no figures", async () => {
      const customer = new Session(baseUrl);
      await login(customer, "/api/auth", "thermal.customer@example.com");
      await completeAccount(customer);

      for (const [who, session] of [["customer", customer], ["anonymous", anonymous]]) {
        const response = await session.request(CALIBRATION);
        assert.ok([401, 403, 404].includes(response.status), `${who} got ${response.status}`);
        const text = await response.text();
        // Not merely "no numbers" — no axis FIELD leaks either, so the refusal
        // cannot be read for the shape of what it is hiding.
        for (const field of ["basisCounts", "reportRows", "candidateCaps", "activeDefault",
          "maxUValue", "publishedRowsMeeting", "seed:1"]) {
          assert.equal(text.includes(field), false, `${who} saw ${field}`);
        }
      }
    });
    // ── AB-6: the aggregate that crosses accounts carries no identifier ─────
    // The calibration is deliberately unscoped — a cross-account aggregate is
    // what it is for — so the guard is not a scoping filter but the payload.
    await t.test("AB-6: the served body carries counts and statistics only", async () => {
      const { body } = await requestJson(staff, CALIBRATION);
      const keys = [];
      const walk = (node, path) => {
        if (Array.isArray(node)) return node.forEach((v) => walk(v, `${path}[]`));
        if (!node || typeof node !== "object") return;
        for (const [k, v] of Object.entries(node)) { keys.push(`${path}.${k}`); walk(v, `${path}.${k}`); }
      };
      walk(body, "");
      const identifying = keys.filter((k) =>
        /project|account|customer|user|owner|email|file|externalRef|productId|sanity|_id|slug/i.test(k));
      assert.deepEqual(identifying, [".reportRows.distinctProjects"],
        "the only project-shaped field is a COUNT of projects, which is the opposite of naming one");
      // Unpublished evidence — the owner's forward product intentions — appears
      // as a count and nothing else. And the seeded corpus's own identifiers
      // must be absent from a body computed over it.
      for (const value of ["prj_", "@example.com", "@openframe", "amj80-series"]) {
        assert.equal(JSON.stringify(body).includes(value), false, `the body leaked ${value}`);
      }
      assert.ok(body.candidateCaps.every((c) => typeof c.unpublishedRowsMeeting === "number"));
    });

    // ── AB-3: nothing can turn the dial over HTTP ───────────────────────────
    await t.test("AB-3: no HTTP verb, on any session, can write the default band", async () => {
      const before = await sql("SELECT COUNT(*) AS n FROM thermal_default_band");
      for (const [who, session] of [["staff", staff], ["anonymous", anonymous]]) {
        for (const path of WRITE_TARGETS) {
          for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
            const response = await session.request(path, {
              method, headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ maxUValue: 9, method: "manual", source: "x", setBy: "x" }),
            });
            assert.ok([401, 403, 404, 405].includes(response.status),
              `${who} ${method} ${path} answered ${response.status} — a write surface exists that should not`);
          }
        }
      }
      assert.deepEqual(await sql("SELECT COUNT(*) AS n FROM thermal_default_band"), before,
        "the ledger is exactly as it was: setting the dial is a privileged DB act, not an endpoint");
    });
    // ── TB-17, DB leg: the owner turns the dial without a deploy ────────────
    await t.test("TB-17: a row inserted straight into the ledger becomes active on the next read", async () => {
      const seeded = await requestJson(staff, CALIBRATION);
      assert.equal(seeded.body.activeDefault.version, "seed:1");

      // The privileged DB act — no code change, no deploy, no restart.
      await sql(`INSERT INTO thermal_default_band (max_u_value, method, source, derived_at, set_by, interim)
                 VALUES (2.7, 'abcb_glazing_calculator', 'ABCB Glazing Calculator, Melbourne CZ6 detached', '2026-08-20', 'owner', 0)`);

      const turned = await requestJson(staff, CALIBRATION);
      assert.equal(turned.body.activeDefault.maxUValue, 2.7, "the read reflects the row, not the seed");
      assert.match(turned.body.activeDefault.version, /^row:\d+$/);
      assert.equal(turned.body.activeDefault.method, "abcb_glazing_calculator");
      assert.equal(turned.body.activeDefault.interim, false);
      // …and the candidate list moves with it: the active cap is now the row's.
      const active = turned.body.candidateCaps.find((c) => c.deltaVsActive === null);
      assert.equal(active.cap, 2.7);
      assert.ok(active.origins.includes("active_default"));

      // A ledger supersedes; it never mutates.
      await sql(`INSERT INTO thermal_default_band (max_u_value, method, source, derived_at, set_by, interim)
                 VALUES (3.2, 'manual', 'owner decision', '2026-08-20', 'owner', 1)`);
      const both = await sql("SELECT id, max_u_value FROM thermal_default_band ORDER BY id");
      assert.deepEqual(both.map((r) => r.max_u_value), [2.7, 3.2], "history is intact; the newest wins");
      const superseded = await requestJson(staff, CALIBRATION);
      assert.equal(superseded.body.activeDefault.maxUValue, 3.2);
    });
    // ── AB-5: a customer cannot read another customer's requirement ─────────
    await t.test("AB-5: customer A is refused customer B's project, and sees no band in the refusal", async () => {
      const a = new Session(baseUrl);
      await login(a, "/api/auth", "thermal.a@example.com");
      await completeAccount(a, { addressLine1: "1 A Street" });
      const b = new Session(baseUrl);
      await login(b, "/api/auth", "thermal.b@example.com");
      await completeAccount(b, { addressLine1: "2 B Street" });

      await requestJson(b, "/api/projects/current/lines", { method: "PUT", json: { title: "B's job", items: [aLine()] } });
      const { body: bProject } = await requestJson(b, "/api/projects/current");
      const bProjectId = bProject.project.id;
      assert.ok(bProjectId);

      const response = await a.request(`/api/projects/${bProjectId}`);
      assert.ok([403, 404].includes(response.status), `A got ${response.status} for B's project`);
      const text = await response.text();
      for (const field of ["requirement_basis", "thermalRequirement", "maxUValue", "derivation", "plan_derived"]) {
        assert.equal(text.includes(field), false, `the refusal leaked ${field}`);
      }
      // …and B still reads their own, which is what makes the refusal a scoping
      // rule rather than a broken route.
      await requestJson(b, `/api/projects/${bProjectId}`);
    });
    // ── The demand axis counts REPORTS, not extraction runs ─────────────────
    // Every pipeline pass writes a fresh building model with a fresh set of
    // `opening_requirements` rows — the table is insert-only by design, so a
    // reprocessed project accumulates one row per opening PER RUN. Counting the
    // table raw made axis 1 a record of retry and upload history: measured in
    // production at 255 rows against 34 distinct (project, opening) pairs, a
    // 7.5x inflation on the one instrument the owner reads before moving the
    // default cap. An inflated instrument is worse than none, because it looks
    // authoritative.
    //
    // The property under test is not a number: it is that a second extraction
    // run over the same project moves nothing.
    await t.test("a second extraction run of the same project does not move the demand axis", async () => {
      const owner = new Session(baseUrl);
      await login(owner, "/api/auth", "thermal.rerun@example.com");
      await completeAccount(owner, { addressLine1: "3 Rerun Road" });
      await requestJson(owner, "/api/projects/current/lines",
        { method: "PUT", json: { title: "Reprocessed job", items: [aLine()] } });
      const { body: project } = await requestJson(owner, "/api/projects/current");
      const projectId = project.project.id;
      assert.ok(projectId);

      await sql(`INSERT INTO ai_runs (id, project_id, pipeline_version, status)
                 VALUES ('run_rerun', '${projectId}', 'test', 'completed')`);
      // One pass of the pipeline: a new building model, and the same two
      // openings the one energy report demanded, filed under it.
      const extractionRun = async (modelId, createdAt) => {
        await sql(`INSERT INTO building_models
                     (id, project_id, ai_run_id, schema_version, status, model_json, confidence_json, created_at)
                   VALUES ('${modelId}', '${projectId}', 'run_rerun', 'building-model/1.0', 'draft', '{}', '{}', '${createdAt}')`);
        for (const [ref, maxU] of [["W01", 2.2], ["W02", 2.6]]) {
          await sql(`INSERT INTO opening_requirements
                       (id, project_id, building_model_id, external_ref, requirement_basis,
                        max_u_value, confidence_json, requirement_json)
                     VALUES ('${modelId}_${ref}', '${projectId}', '${modelId}', '${ref}',
                             'explicit_energy_report', ${maxU}, '{}', '{}')`);
        }
      };

      await extractionRun("bm_rerun_1", "2026-08-20 09:00:00");
      const { body: first } = await requestJson(staff, CALIBRATION);
      assert.equal(first.reportRows.openings, 2, "one report, two openings");
      assert.equal(first.basisCounts.explicit_energy_report, 2);

      // The SAME documents, extracted again — a retry, a re-upload, a reprocess.
      // The rows double; the demand does not.
      await extractionRun("bm_rerun_2", "2026-08-20 10:00:00");
      const [{ n: rowsInTable }] = await sql(
        "SELECT COUNT(*) AS n FROM opening_requirements WHERE requirement_basis = 'explicit_energy_report'");
      assert.equal(rowsInTable, 4, "the table really did accumulate a second run's rows");

      const { body: second } = await requestJson(staff, CALIBRATION);
      assert.deepEqual(second.reportRows, first.reportRows,
        "openings, distinct projects and the U-value statistics all read the same demand");
      assert.deepEqual(second.basisCounts, first.basisCounts,
        "the basis counts share the source, so they need the same deduplication");
    });
    // ── …and the other direction, which is the dangerous one ────────────────
    // Deduplicating to the newest building model assumed the newest model is a
    // complete reading. It is not. When the energy-report skill fails, the
    // report block is skipped entirely, `applyDefaultEnvelope` computes a band
    // for every opening, a model IS persisted, and the run finishes `partial`
    // (worker/lib/ai/pipeline.ts:678, :1001). A model also survives a run that
    // dies AFTER it is written — the batch commits at :897, `runProjectEstimate`
    // runs at :987 — and a crashed worker leaves the run at `running` forever.
    //
    // So a newest-model rule silently DELETES real report demand and leaves a
    // smaller, confident-looking number, on the one instrument whose purpose is
    // telling the owner what real reports demanded. Over-counting was visible
    // and suspicious; this would not be.
    //
    // `ai_runs.status` is the signal, and it is the only honest one available:
    // `building_models.status` is written 'draft' and never updated by anything
    // in the tree, so completeness cannot be read off the model, and inferring
    // it from the model's CONTENTS is what makes a deleted report look like a
    // failure. Three properties, because they only pin the contract together.
    await t.test("a partial reprocessing run does not delete report-derived demand", async () => {
      const owner = new Session(baseUrl);
      await login(owner, "/api/auth", "thermal.partial@example.com");
      await completeAccount(owner, { addressLine1: "4 Partial Place" });
      await requestJson(owner, "/api/projects/current/lines",
        { method: "PUT", json: { title: "Partially reprocessed job", items: [aLine()] } });
      const { body: project } = await requestJson(owner, "/api/projects/current");
      const projectId = project.project.id;

      /** One pipeline pass: a run of a given status, the model it persisted, and
       *  the requirement rows that model carried. */
      const extractionRun = async (id, { projectId: forProject, status, createdAt, rows }) => {
        await sql(`INSERT INTO ai_runs (id, project_id, pipeline_version, status)
                   VALUES ('run_${id}', '${forProject}', 'test', '${status}')`);
        await sql(`INSERT INTO building_models
                     (id, project_id, ai_run_id, schema_version, status, model_json, confidence_json, created_at)
                   VALUES ('bm_${id}', '${forProject}', 'run_${id}', 'building-model/1.0', 'draft', '{}', '{}', '${createdAt}')`);
        for (const [ref, basis, maxU] of rows) {
          await sql(`INSERT INTO opening_requirements
                       (id, project_id, building_model_id, external_ref, requirement_basis,
                        max_u_value, confidence_json, requirement_json)
                     VALUES ('bm_${id}_${ref}', '${forProject}', 'bm_${id}', '${ref}', '${basis}', ${maxU}, '{}', '{}')`);
        }
      };
      const REPORTED = [["W01", "explicit_energy_report", 2.1], ["W02", "explicit_energy_report", 2.3]];
      const COMPUTED = [["W01", "default_envelope", 3.4], ["W02", "default_envelope", 3.4]];

      // A good run: the report was read, and two openings demanded a band.
      await extractionRun("ok", { projectId, status: "completed", createdAt: "2026-08-20 11:00:00", rows: REPORTED });
      const { body: afterGoodRun } = await requestJson(staff, CALIBRATION);

      // The same project, reprocessed — and this time the energy-report skill
      // failed. The schedule still parsed, the envelope stage still computed a
      // default band for every opening, and the model was persisted anyway.
      await extractionRun("degraded", { projectId, status: "partial", createdAt: "2026-08-20 12:00:00", rows: COMPUTED });
      const { body: afterPartialRun } = await requestJson(staff, CALIBRATION);
      assert.deepEqual(afterPartialRun.reportRows, afterGoodRun.reportRows,
        "a run that could not READ the report has no opinion about what the report demanded");
      assert.equal(afterPartialRun.basisCounts.explicit_energy_report,
        afterGoodRun.basisCounts.explicit_energy_report,
        "and the basis counts, which share the source, keep the same evidence");

      // Deliberate: a project that has NEVER completed a run still counts. It
      // has no better reading available, and dropping it would take it out of
      // the evidence floor without saying so — the same silent deletion by
      // another route.
      const newcomer = new Session(baseUrl);
      await login(newcomer, "/api/auth", "thermal.neverclean@example.com");
      await completeAccount(newcomer, { addressLine1: "5 Newcomer Way" });
      await requestJson(newcomer, "/api/projects/current/lines",
        { method: "PUT", json: { title: "Never cleanly processed", items: [aLine()] } });
      const { body: second } = await requestJson(newcomer, "/api/projects/current");
      await extractionRun("onlypartial", {
        projectId: second.project.id, status: "partial", createdAt: "2026-08-20 13:00:00",
        rows: [["W09", "explicit_energy_report", 2.0]],
      });
      const { body: afterNewcomer } = await requestJson(staff, CALIBRATION);
      assert.equal(afterNewcomer.reportRows.openings, afterPartialRun.reportRows.openings + 1,
        "its one reported opening is counted — a best-available reading, not nothing");
      assert.equal(afterNewcomer.reportRows.distinctProjects, afterPartialRun.reportRows.distinctProjects + 1,
        "and it appears in the evidence floor rather than silently dropping out");

      // …and staleness is NOT pinned forever. When the customer deletes the
      // energy report and reprocesses, that run COMPLETES — no skill failed,
      // there was simply nothing to read — so it becomes the current reading and
      // the demand legitimately goes away. This is the case a contents-based
      // rule gets wrong, and it is why the signal is the run's status.
      await extractionRun("reportremoved", {
        projectId, status: "completed", createdAt: "2026-08-20 14:00:00", rows: COMPUTED,
      });
      const { body: afterRemoval } = await requestJson(staff, CALIBRATION);
      assert.equal(afterRemoval.reportRows.openings, afterNewcomer.reportRows.openings - 2,
        "a completed run that sees no report retires the demand it used to carry");
    });
  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
