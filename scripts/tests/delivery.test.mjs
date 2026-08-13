// Delivery pricing — the Australian domestic delivery leg (design doc
// docs/shipping-costs-design.md). One Worker, one migrated-and-seeded local
// D1, many t.test subtests, sequential (--test-concurrency=1: it boots a
// Worker and a local D1, same reason api.test.mjs/api-edge.test.mjs run this
// way).
//
// Grows commit by commit alongside the feature: this file starts with the
// zone-table tests (T-B29 through T-B33, commit C3) and gains the postcode,
// estimate, staff-figure, gate and money tests as each of C5-C8 lands.
//
// Boot copied from api-edge.test.mjs:1-34; the `sql` helper (structural
// assertions the API deliberately does not expose) from api.test.mjs:45-48.
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  Session, freePort, login, makeRunDir, removeRunDir,
  requestJson, run, staffEmail, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";

// PARTIAL overlap only — mirrors worker/routes/ops-pricing.ts's own check, so
// this test's idea of "overlap" cannot silently diverge from the server's.
function rangesPartiallyOverlap(a, b) {
  if (a.from > b.to || b.from > a.to) return false;
  const aContainsB = a.from <= b.from && b.to <= a.to;
  const bContainsA = b.from <= a.from && a.to <= b.to;
  return !aContainsB && !bContainsA;
}

test("delivery pricing — zones, postcodes, and the money", { timeout: 180_000 }, async (t) => {
  const runDir = await makeRunDir("delivery");
  const assets = join(runDir, "assets");
  const state = join(runDir, "state");
  const wranglerEnv = { WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") };
  let server;
  try {
    await run(process.execPath, [viteCli, "build", "--outDir", assets, "--emptyOutDir"]);
    await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "apertly-db", "--local", "--persist-to", state], { env: wranglerEnv });
    await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--file", "scripts/db/seed.sql"], { env: wranglerEnv });
    const sql = async (command) => {
      const r = await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command", command], { env: wranglerEnv });
      return JSON.parse(r.stdout)[0].results;
    };

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    server = start(process.execPath, [
      wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
      "--persist-to", state, "--assets", assets, "--log-level", "warn",
      "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:", "--var", "SANITY_PROJECT_ID:", "--var", "AI_EXTRACTION_MODE:manual",
    ], { env: wranglerEnv });
    await waitForUrl(`${baseUrl}/api/health`, server);

    const staff = new Session(baseUrl);
    await login(staff, "/api/ops/auth", staffEmail); // admin
    const anon = new Session(baseUrl);

    // ── The zone table (C3) ─────────────────────────────────────────────────

    await t.test("T-B29: a delivery zone is created, priced, renamed and deleted", async () => {
      const id = `e2e-zone-${Date.now()}`;
      const created = await requestJson(staff, "/api/ops/pricing/delivery-zones", { method: "POST", json: { id, label: "Test zone" } });
      assert.equal(created.body.ok, true);

      await requestJson(staff, "/api/ops/pricing/delivery-zones", { method: "POST", json: { id, label: "Duplicate" } }, 409);

      const list1 = await requestJson(staff, "/api/ops/pricing/delivery-zones");
      assert.equal(list1.body.canEdit, true);
      const row = list1.body.zones.find((z) => z.id === id);
      assert.ok(row, "the new zone is in the list");
      assert.equal(row.minCharge, null);

      const saved = await requestJson(staff, "/api/ops/pricing/delivery-zones/" + id, {
        method: "PUT", json: { label: "Renamed test zone", minCharge: 200, ratePerSqm: 40, maxCharge: 900, expectedVersion: row.version },
      });
      assert.equal(saved.body.ok, true);
      assert.notEqual(saved.body.version, row.version);

      await requestJson(staff, "/api/ops/pricing/delivery-zones/" + id, {
        method: "PUT", json: { minCharge: 250, expectedVersion: row.version }, // stale on purpose
      }, 409);

      await requestJson(staff, "/api/ops/pricing/delivery-zones/" + id, { method: "DELETE" });
      await requestJson(staff, "/api/ops/pricing/delivery-zones/" + id, { method: "DELETE" }, 404);

      await requestJson(staff, "/api/ops/pricing/delivery-zones/unmapped", { method: "DELETE" }, 400);

      await requestJson(anon, "/api/ops/pricing/delivery-zones", {}, 403);
    });

    await t.test("T-B30: a rate that pays the customer is refused, and so is a cap under a floor", async () => {
      const id = `e2e-zone-neg-${Date.now()}`;
      await requestJson(staff, "/api/ops/pricing/delivery-zones", { method: "POST", json: { id, label: "Negatives" } });
      await requestJson(staff, "/api/ops/pricing/delivery-zones/" + id, { method: "PUT", json: { ratePerSqm: -1 } }, 400);
      await requestJson(staff, "/api/ops/pricing/delivery-zones/" + id, { method: "PUT", json: { minCharge: -1 } }, 400);
      await requestJson(staff, "/api/ops/pricing/delivery-zones/" + id, { method: "PUT", json: { maxCharge: -1 } }, 400);
      await requestJson(staff, "/api/ops/pricing/delivery-zones/" + id, { method: "PUT", json: { minCharge: 900, maxCharge: 400 } }, 400);
      await requestJson(staff, "/api/ops/pricing/delivery-zones/" + id, { method: "DELETE" });
    });

    await t.test("T-B31: a postcode range runs forwards, inside the allocated space", async () => {
      const id = `e2e-zone-range-${Date.now()}`;
      await requestJson(staff, "/api/ops/pricing/delivery-zones", { method: "POST", json: { id, label: "Ranges" } });
      const path = "/api/ops/pricing/delivery-zones/" + id + "/ranges";
      await requestJson(staff, path, { method: "POST", json: { pcFrom: "abc", pcTo: 9500 } }, 400);
      await requestJson(staff, path, { method: "POST", json: { pcFrom: 100, pcTo: 9500 } }, 400);
      await requestJson(staff, path, { method: "POST", json: { pcFrom: 9000, pcTo: 10000 } }, 400);
      await requestJson(staff, path, { method: "POST", json: { pcFrom: 3999, pcTo: 3000 } }, 400);
      await requestJson(staff, "/api/ops/pricing/delivery-zones/" + id, { method: "DELETE" });
    });

    await t.test("T-B32: a partially overlapping range is refused; a fully contained one is not", async () => {
      const id = `e2e-zone-overlap-${Date.now()}`;
      await requestJson(staff, "/api/ops/pricing/delivery-zones", { method: "POST", json: { id, label: "Overlap" } });
      const path = "/api/ops/pricing/delivery-zones/" + id + "/ranges";
      // 3000-3207 (Melbourne metro) is in the seed. Partial overlap refused:
      await requestJson(staff, path, { method: "POST", json: { pcFrom: 3100, pcTo: 3300 } }, 409);
      // Fully contained inside it: fine.
      await requestJson(staff, path, { method: "POST", json: { pcFrom: 3050, pcTo: 3060 } });
      await requestJson(staff, "/api/ops/pricing/delivery-zones/" + id, { method: "DELETE" });
    });

    await t.test("T-B33: the seeded table covers the country and names exactly one fallback", async () => {
      const zoneRows = await sql("SELECT id, is_fallback, active FROM delivery_zone");
      const active = zoneRows.filter((z) => z.active === 1);
      assert.ok(active.length >= 12, `at least 12 active zones (got ${active.length})`);
      assert.equal(zoneRows.filter((z) => z.is_fallback === 1).length, 1, "exactly one fallback");
      assert.equal(zoneRows.find((z) => z.is_fallback === 1)?.id, "unmapped");

      const rangeRows = await sql("SELECT id, zone_id, pc_from AS pcFrom, pc_to AS pcTo FROM delivery_postcode_range");
      for (let i = 0; i < rangeRows.length; i++) {
        for (let j = i + 1; j < rangeRows.length; j++) {
          const overlap = rangesPartiallyOverlap(
            { from: rangeRows[i].pcFrom, to: rangeRows[i].pcTo },
            { from: rangeRows[j].pcFrom, to: rangeRows[j].pcTo },
          );
          assert.equal(overlap, false, `no partial overlap between range ${rangeRows[i].id} (zone ${rangeRows[i].zone_id}) and ${rangeRows[j].id} (zone ${rangeRows[j].zone_id})`);
        }
      }

      // No capital city falls through to the fallback — narrowest-range
      // resolution, same algorithm as the migration's own documented query,
      // done in-process against the rows already fetched above rather than
      // one `wrangler d1 execute` subprocess per postcode (each spawn costs
      // seconds, and eight of them blew this subtest's slice of the 180s
      // parent timeout on the very first run).
      const activeZoneIds = new Set(zoneRows.filter((z) => z.active === 1).map((z) => z.id));
      const narrowestMatch = (n) => rangeRows
        .filter((r) => n >= r.pcFrom && n <= r.pcTo && activeZoneIds.has(r.zone_id))
        .sort((a, b) => (a.pcTo - a.pcFrom) - (b.pcTo - b.pcFrom) || a.zone_id.localeCompare(b.zone_id))[0];

      const capitals = ["3000", "2000", "4000", "5000", "6000", "7000", "0800", "2600"];
      for (const pc of capitals) {
        const n = Number(pc);
        const match = narrowestMatch(n);
        assert.ok(match, `${pc} resolves to a zone`);
        assert.notEqual(match.zone_id, "unmapped", `${pc} is a capital-city postcode, not the fallback`);
      }
    });
  } finally {
    if (server) await stop(server);
    await removeRunDir(runDir);
  }
});
