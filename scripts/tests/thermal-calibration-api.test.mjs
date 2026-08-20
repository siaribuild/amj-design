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
  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
