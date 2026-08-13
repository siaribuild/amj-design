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

// A real, fully-specified window line (parity with api.test.mjs's fixture) —
// used to give a project SOME area, since a submission needs at least one
// line or a clean uploaded file (worker/routes/quote.ts's empty_quote gate).
const aLine = (overrides = {}) => ({
  code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
  width: "1200", height: "900", qty: 1,
  options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
  lineTotal: 1,
  ...overrides,
});

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

    // ── The postcode reaches the server (C5) ────────────────────────────────

    await t.test("T-B1: a submission with no delivery postcode is refused, and the project stays a draft", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "No postcode", items: [aLine()] } });
      const id = saved.body.project.id;
      const refused = await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "No Postcode", email: "no-postcode@example.com" } },
      }, 400);
      assert.equal(refused.body.error, "missing_postcode");
      const current = await requestJson(s, "/api/projects/current");
      assert.equal(current.body.project.status, "draft");
    });

    await t.test("T-B2: a postcode that is not four digits is refused, distinctly from a missing one", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Bad postcode", items: [aLine()] } });
      const id = saved.body.project.id;
      for (const bad of ["300", "30000", "3o00", "VIC 3000"]) {
        const r = await requestJson(s, `/api/projects/${id}/submit`, {
          method: "POST", json: { contact: { name: "Bad Postcode", email: "bad-postcode@example.com", postcode: bad } },
        }, 400);
        assert.equal(r.body.error, "invalid_postcode", `"${bad}" -> invalid_postcode`);
      }
    });

    await t.test("T-B3: a valid postcode is stored digits-intact, and the free-text suburb is left alone", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Good postcode", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST",
        json: { contact: { name: "Good Postcode", email: "good-postcode@example.com", postcode: "0800", suburb: "Darwin NT" } },
      });
      const rows = await sql(`SELECT delivery_postcode, delivery_suburb FROM project WHERE id='${id}'`);
      assert.equal(rows[0].delivery_postcode, "0800");
      assert.equal(rows[0].delivery_suburb, "Darwin NT");
    });

    // ── The estimate (C5) ────────────────────────────────────────────────────
    // Setup: the seeded zones have NULL rates, so pricing two of them (vic-metro,
    // unmapped) is the first act — also the first proof E3 works end to end.

    await t.test("setup: price vic-metro and unmapped for the estimate tests below", async () => {
      const zones = await requestJson(staff, "/api/ops/pricing/delivery-zones");
      const vicMetro = zones.body.zones.find((z) => z.id === "vic-metro");
      const unmapped = zones.body.zones.find((z) => z.id === "unmapped");
      await requestJson(staff, "/api/ops/pricing/delivery-zones/vic-metro", {
        method: "PUT", json: { ratePerSqm: 45, minCharge: 180, maxCharge: 900, expectedVersion: vicMetro.version },
      });
      await requestJson(staff, "/api/ops/pricing/delivery-zones/unmapped", {
        method: "PUT", json: { ratePerSqm: 220, minCharge: 980, maxCharge: 4200, expectedVersion: unmapped.version },
      });
    });

    await t.test("T-B4: the submit-screen preview prices a postcode without committing anything", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Preview check", items: [aLine()] } });
      const id = saved.body.project.id;
      const preview = await requestJson(s, `/api/projects/${id}/delivery-estimate`, { method: "POST", json: { postcode: "3072" } });
      assert.equal(preview.body.ok, true);
      assert.ok(preview.body.amount > 0, "a real figure, not zero");
      const rows = await sql(`SELECT delivery_postcode FROM project WHERE id='${id}'`);
      assert.equal(rows[0].delivery_postcode, null, "the preview commits nothing");
      await requestJson(s, `/api/projects/${id}/delivery-estimate`, { method: "POST", json: { postcode: "30" } }, 400);
    });

    await t.test("T-B5: the preview endpoint refuses a project the caller does not own", async () => {
      const owner = new Session(baseUrl);
      const saved = await requestJson(owner, "/api/projects/current/lines", { method: "PUT", json: { title: "Owned", items: [aLine()] } });
      const id = saved.body.project.id;
      const stranger = new Session(baseUrl);
      await requestJson(stranger, `/api/projects/${id}/delivery-estimate`, { method: "POST", json: { postcode: "3072" } }, 404);
    });

    await t.test("T-B6: submitting records the postcode; the ops record prices it live", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Live estimate", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Live Estimate", email: "live-estimate@example.com", postcode: "3072" } },
      });
      const record = await requestJson(staff, `/api/ops/projects/${id}`);
      assert.ok(record.body.delivery.estimate > 0, "a real figure");
      assert.equal(record.body.delivery.zoneId, "vic-metro");
      assert.equal(record.body.delivery.amount, null, "unsettled");
      assert.equal(record.body.delivery.settled, false);
    });

    await t.test("T-B7: a postcode we do not price still gets a number, and admits it is a fallback", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Fallback estimate", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Fallback Estimate", email: "fallback-estimate@example.com", postcode: "9999" } },
      });
      const record = await requestJson(staff, `/api/ops/projects/${id}`);
      assert.ok(record.body.delivery.estimate > 0);
      assert.equal(record.body.delivery.basis, "fallback_zone");
      assert.equal(record.body.delivery.zoneId, "unmapped");
    });

    await t.test("T-B8: the account discount moves goods and never delivery", async () => {
      const guest = new Session(baseUrl);
      const guestSaved = await requestJson(guest, "/api/projects/current/lines", { method: "PUT", json: { title: "Discount vs delivery (guest)", items: [aLine()] } });
      const guestId = guestSaved.body.project.id;
      const guestGoods = guestSaved.body.items[0].lineTotal;
      await requestJson(guest, `/api/projects/${guestId}/submit`, {
        method: "POST", json: { contact: { name: "Guest", email: "discount-vs-delivery-guest@example.com", postcode: "3072" } },
      });
      const guestRecord = await requestJson(staff, `/api/ops/projects/${guestId}`);

      const member = new Session(baseUrl);
      await login(member, "/api/auth", "discount-vs-delivery-member@example.com");
      const memberSaved = await requestJson(member, "/api/projects/current/lines", { method: "PUT", json: { title: "Discount vs delivery (member)", items: [aLine()] } });
      const memberId = memberSaved.body.project.id;
      const memberGoods = memberSaved.body.items[0].lineTotal;
      await requestJson(member, `/api/projects/${memberId}/submit`, {
        method: "POST", json: { contact: { name: "Member", email: "discount-vs-delivery-member@example.com", postcode: "3072" } },
      });
      const memberRecord = await requestJson(staff, `/api/ops/projects/${memberId}`);

      assert.notEqual(memberGoods, guestGoods, "the account discount moves goods");
      assert.equal(memberRecord.body.delivery.estimate, guestRecord.body.delivery.estimate, "delivery is byte-identical either way");
    });

    // T-B9's design-doc phrasing drives it "through split", reasoning that
    // split is the one mutation of several that does NOT bump
    // quote_edit_version. Verified against this codebase's own composite
    // invariant (worker/lib/composite.ts: a parent's dims_json is the
    // opening's own size and never changes when it becomes a composite) that
    // a split cannot actually move the area basis — loadProjectAreaM2 reads
    // parents only, so the number split is meant to move never would. A rate
    // edit is the mutation that genuinely demonstrates "computed live on every
    // read" (§5.5) without touching quote_edit_version at all, so this test
    // is driven through that instead.
    await t.test("T-B9: a rate edit moves the live estimate and never the settled figure", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Staleness check", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Staleness Check", email: "staleness-check@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });

      const before = await requestJson(staff, "/api/ops/pricing/delivery-zones");
      const vicMetro = before.body.zones.find((z) => z.id === "vic-metro");
      await requestJson(staff, "/api/ops/pricing/delivery-zones/vic-metro", {
        method: "PUT", json: { ratePerSqm: vicMetro.ratePerSqm * 4, expectedVersion: vicMetro.version },
      });

      const record = await requestJson(staff, `/api/ops/projects/${id}`);
      assert.notEqual(record.body.delivery.estimate, record.body.delivery.settledEstimate, "the live table moved");
      assert.equal(record.body.delivery.amount, 640, "the settled figure did not");

      // Restore, so later tests in this file see vic-metro's original rate.
      const after = await requestJson(staff, "/api/ops/pricing/delivery-zones");
      const now = after.body.zones.find((z) => z.id === "vic-metro");
      await requestJson(staff, "/api/ops/pricing/delivery-zones/vic-metro", {
        method: "PUT", json: { ratePerSqm: 45, expectedVersion: now.version },
      });
    });

    // ── The staff figure (C6) ────────────────────────────────────────────────

    await t.test("T-B10: staff replace the machine estimate with the real number, and both survive", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Override check", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Override Check", email: "override-check@example.com", postcode: "3072" } },
      });
      const before = await requestJson(staff, `/api/ops/projects/${id}`);
      const preEstimate = before.body.delivery.estimate;

      const settled = await requestJson(staff, `/api/ops/projects/${id}/delivery`, {
        method: "PUT", json: { amount: 640, note: "Two 2.4 m stackers" },
      });
      assert.equal(settled.body.delivery.amount, 640);
      assert.equal(settled.body.delivery.settled, true);
      assert.equal(settled.body.delivery.settledEstimate, preEstimate);
    });

    await t.test("T-B11: the override is logged with both numbers", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Audit check", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Audit Check", email: "audit-check@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 340 } });
      const rows = await sql(`SELECT action FROM audit_event WHERE entity_id='${id}' AND action LIKE '%delivery%'`);
      assert.equal(rows.length, 1, "exactly one delivery audit row");
      assert.match(rows[0].action, /340/);
      assert.match(rows[0].action, /\$\d/, "the machine estimate is quoted too");
    });

    await t.test("T-B12: a negative delivery charge is a typo that pays the customer", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Negative check", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: -50 } }, 400);
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: "lots" } }, 400);
      await requestJson(anon, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 100 } }, 403);
    });

    await t.test("T-B13: delivery cannot be edited once the quote is issued", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Locked check", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Locked Check", email: "locked-check@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 250 } });
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-revision`, { method: "POST" });
      assert.ok(issued.body.revisionNo >= 1, "the revision issued");
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 300 } }, 409);
    });

    // ── The gate (C7) ─────────────────────────────────────────────────────────

    await t.test("T-B14: a quote cannot be issued until delivery is settled", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Gate check", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Gate Check", email: "gate-check@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/start-pricing`, { method: "POST" });

      const record = await requestJson(staff, `/api/ops/projects/${id}`);
      const issueAction = record.body.actions.find((a) => a.id === "issue-revision");
      assert.ok(issueAction, "the action is present, not hidden");
      assert.match(issueAction.blockedReason ?? "", /delivery/i);

      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-revision`, { method: "POST" }, 409);
      assert.equal(issued.body.error, "delivery_unset");
      const rows = await sql(`SELECT count(*) AS n FROM quote_revision WHERE project_id='${id}'`);
      assert.equal(Number(rows[0].n), 0, "zero revisions exist");
    });

    await t.test("T-B15: the second issue endpoint is gated too", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Second gate check", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Second Gate", email: "second-gate@example.com", postcode: "3072" } },
      });
      // On 'submitted' -- in ISSUABLE_FROM -- actionsFor renders no issue
      // button at all (only estimator_assigned/technical_review_required
      // do): the server guard is the whole mechanism on this status.
      const record = await requestJson(staff, `/api/ops/projects/${id}`);
      assert.equal(record.body.actions.find((a) => a.id === "issue-revision"), undefined);

      const issued = await requestJson(staff, `/api/projects/${id}/issue-revision`, { method: "POST" }, 409);
      assert.equal(issued.body.error, "delivery_unset");
    });

    await t.test("T-B16: an explicit zero is settled -- a trade customer is not an unfinished quote", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Zero settle check", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Zero Settle", email: "zero-settle@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/start-pricing`, { method: "POST" });
      const settled = await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 0 } });
      assert.equal(settled.body.delivery.settled, true);

      const record = await requestJson(staff, `/api/ops/projects/${id}`);
      const issueAction = record.body.actions.find((a) => a.id === "issue-revision");
      assert.equal(issueAction.blockedReason, undefined);

      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-revision`, { method: "POST" });
      assert.ok(issued.body.revisionNo >= 1);
    });

    await t.test("T-B17: un-setting re-arms the gate", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Re-arm check", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Re-arm Check", email: "re-arm-check@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/start-pricing`, { method: "POST" });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 300 } });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: null } });
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-revision`, { method: "POST" }, 409);
      assert.equal(issued.body.error, "delivery_unset");
    });

    await t.test("T-B18: requesting changes re-arms the gate for the next revision", async () => {
      const s = new Session(baseUrl);
      // Registered, not anonymous: worker/lib/access.ts's ownedProject accepts
      // the claim cookie only while isCart(p) (status_customer === 'draft'),
      // so an anonymous session cannot request-changes on its OWN quote once
      // it has been submitted and issued — it would 404 regardless of this
      // feature. request-changes needs the customer to act on an issued
      // revision, so this test needs an owner login, same as T-B19.
      await login(s, "/api/auth", "request-changes-rearm@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Request changes re-arm", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Request Changes", email: "request-changes-rearm@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/start-pricing`, { method: "POST" });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-revision`, { method: "POST" });
      const revisionId = issued.body.id;

      const changes = await requestJson(s, `/api/revisions/${revisionId}/request-changes`, { method: "POST", json: { message: "Please swap the colour." } });
      assert.equal(changes.body.ok, true);

      const rows = await sql(`SELECT delivery_amount FROM project WHERE id='${id}'`);
      assert.equal(rows[0].delivery_amount, null, "without a change, the gate would arm only once per project ever");
      const record = await requestJson(staff, `/api/ops/projects/${id}`);
      assert.match(record.body.actions.find((a) => a.id === "issue-revision")?.blockedReason ?? "", /delivery/i);
    });

    await t.test("T-B19: replying to a clarification re-arms the gate", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "clarification-rearm@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Clarification re-arm", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Clarification Rearm", email: "clarification-rearm@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 250 } });
      await requestJson(staff, `/api/ops/projects/${id}/request-clarification`, { method: "POST", json: { message: "What colour frame?" } });

      const reply = await requestJson(s, `/api/projects/${id}/clarification-reply`, { method: "POST", json: { message: "Dover White." } });
      assert.equal(reply.body.ok, true);

      const rows = await sql(`SELECT delivery_amount FROM project WHERE id='${id}'`);
      assert.equal(rows[0].delivery_amount, null);
    });

    // ── The freeze (C8) ──────────────────────────────────────────────────────

    await t.test("T-B20: issuing freezes the figure and the basis it was priced from", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Freeze check", items: [aLine()] } });
      const id = saved.body.project.id;
      const goodsAmount = saved.body.items[0].lineTotal;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Freeze Check", email: "freeze-check@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-revision`, { method: "POST" });
      assert.equal(issued.body.total, goodsAmount + 640);
      assert.equal(issued.body.goods, goodsAmount);
      assert.equal(issued.body.delivery, 640);

      const rows = await sql(`SELECT delivery_total, totals_json FROM quote_revision WHERE id='${issued.body.id}'`);
      assert.equal(rows[0].delivery_total, 640);
      const totals = JSON.parse(rows[0].totals_json);
      assert.deepEqual(totals, {
        total: goodsAmount + 640, goods: goodsAmount, delivery: 640,
        deliveryPostcode: "3072", deliveryZoneId: "vic-metro", deliveryAreaM2: 1.08,
      });
    });

    await t.test("T-B21: re-issuing freezes the current figure; the superseded revision keeps its own", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "reissue-freeze@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Reissue freeze", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Reissue Freeze", email: "reissue-freeze@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      const r1 = await requestJson(staff, `/api/ops/projects/${id}/issue-revision`, { method: "POST" });

      await requestJson(s, `/api/revisions/${r1.body.id}/request-changes`, { method: "POST", json: { message: "Please add a note." } });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 700 } });
      const r2 = await requestJson(staff, `/api/ops/projects/${id}/issue-revision`, { method: "POST" });

      const rows = await sql(`SELECT id, snapshot_status, delivery_total FROM quote_revision WHERE project_id='${id}' ORDER BY revision_no`);
      const rev1 = rows.find((r) => r.id === r1.body.id);
      const rev2 = rows.find((r) => r.id === r2.body.id);
      assert.equal(rev1.snapshot_status, "superseded");
      assert.equal(rev1.delivery_total, 640);
      assert.equal(rev2.snapshot_status, "issued");
      assert.equal(rev2.delivery_total, 700);
    });

    await t.test("T-B22: editing the rate table does not move a quote that is already issued", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "issued-frozen-rate@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Issued frozen rate", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Issued Frozen Rate", email: "issued-frozen-rate@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-revision`, { method: "POST" });

      const before = await requestJson(staff, "/api/ops/pricing/delivery-zones");
      const vicMetro = before.body.zones.find((z) => z.id === "vic-metro");
      await requestJson(staff, "/api/ops/pricing/delivery-zones/vic-metro", {
        method: "PUT", json: { ratePerSqm: vicMetro.ratePerSqm * 4, expectedVersion: vicMetro.version },
      });

      // The CUSTOMER read path — where a lazy implementation would recompute.
      const revisions = await requestJson(s, `/api/projects/${id}/revisions`);
      const current = revisions.body.revisions.find((r) => r.id === issued.body.id);
      assert.equal(current.delivery, 640, "frozen despite the rate move");

      const after = await requestJson(staff, "/api/ops/pricing/delivery-zones");
      const now = after.body.zones.find((z) => z.id === "vic-metro");
      await requestJson(staff, "/api/ops/pricing/delivery-zones/vic-metro", { method: "PUT", json: { ratePerSqm: 45, expectedVersion: now.version } });
    });

    // ── The order — the seam this feature dies at (C8) ──────────────────────

    await t.test("T-B23: THE CRITICAL ONE -- the order total includes delivery", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "order-critical@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Order critical", items: [aLine()] } });
      const id = saved.body.project.id;
      const goodsAmount = saved.body.items[0].lineTotal;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Order Critical", email: "order-critical@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-revision`, { method: "POST" });
      const accepted = await requestJson(s, `/api/revisions/${issued.body.id}/accept`, { method: "POST" });
      const orderId = accepted.body.order.id;

      const lineSum = await sql(`SELECT COALESCE(SUM(line_total),0) AS s FROM order_line WHERE order_id='${orderId}'`);
      assert.equal(Number(lineSum[0].s), goodsAmount, "SUM(order_line) === goods");
      const orderRow = await sql(`SELECT total, delivery_total FROM "order" WHERE id='${orderId}'`);
      assert.equal(orderRow[0].delivery_total, 640, "\"order\".delivery_total === 640");
      assert.equal(orderRow[0].total, goodsAmount + 640, "\"order\".total === goods + 640");
      const revRow = await sql(`SELECT totals_json FROM quote_revision WHERE id='${issued.body.id}'`);
      assert.equal(orderRow[0].total, JSON.parse(revRow[0].totals_json).total, "\"order\".total === totals_json.total");
      assert.equal(accepted.body.order.total, orderRow[0].total, "the DTO's order.total agrees with the row");
    });

    await t.test("T-B24: the deposit is half of goods plus delivery", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "deposit-half@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Deposit half", items: [aLine()] } });
      const id = saved.body.project.id;
      const goodsAmount = saved.body.items[0].lineTotal;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Deposit Half", email: "deposit-half@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-revision`, { method: "POST" });
      const accepted = await requestJson(s, `/api/revisions/${issued.body.id}/accept`, { method: "POST" });
      const deposit = accepted.body.order.payments.find((p) => p.kind === "deposit");

      assert.equal(deposit.percent, 50);
      assert.equal(deposit.amount, Math.round((goodsAmount + 640) * 0.5));
      assert.notEqual(deposit.amount, Math.round(goodsAmount * 0.5), "not half of goods alone");
      assert.notEqual(deposit.amount, Math.round((goodsAmount + 640) * 0.4), "not 40% of the right total");
    });

    await t.test("T-B25: deposit and balance add up to the order total, to the cent", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "deposit-balance-cent@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Deposit balance cent", items: [aLine({ width: "600", height: "600" })] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Deposit Balance Cent", email: "deposit-balance-cent@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 180 } }); // a real minimum-charge figure
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-revision`, { method: "POST" });
      const accepted = await requestJson(s, `/api/revisions/${issued.body.id}/accept`, { method: "POST" });
      const deposit = accepted.body.order.payments.find((p) => p.kind === "deposit");
      const balance = accepted.body.order.payments.find((p) => p.kind === "balance");

      assert.equal(deposit.amount + balance.amount, accepted.body.order.total);
      assert.equal(deposit.percent, 50);
      assert.equal(balance.percent, 50);
    });

    await t.test("T-B26: delivery is never a line -- not a quote_line, not a revision_line, not an order_line", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "never-a-line@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Never a line", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Never A Line", email: "never-a-line@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-revision`, { method: "POST" });
      const accepted = await requestJson(s, `/api/revisions/${issued.body.id}/accept`, { method: "POST" });
      const orderId = accepted.body.order.id;

      const quoteLineCount = await sql(`SELECT count(*) AS n FROM quote_line WHERE project_id='${id}' AND revision_id IS NULL AND parent_line_id IS NULL`);
      const revLineCount = await sql(`SELECT count(*) AS n FROM revision_line WHERE revision_id='${issued.body.id}'`);
      const orderLineCount = await sql(`SELECT count(*) AS n FROM order_line WHERE order_id='${orderId}'`);
      assert.equal(Number(quoteLineCount[0].n), 1);
      assert.equal(Number(revLineCount[0].n), 1);
      assert.equal(Number(orderLineCount[0].n), 1);

      const deliveryLikeSlugs = await sql(
        `SELECT count(*) AS n FROM quote_line WHERE project_id='${id}' AND (product_slug LIKE '%deliver%' OR product_slug LIKE '%freight%')`,
      );
      assert.equal(Number(deliveryLikeSlugs[0].n), 0);
      const kinds = await sql(`SELECT DISTINCT line_kind FROM quote_line WHERE project_id='${id}'`);
      assert.deepEqual(kinds.map((k) => k.line_kind), ["simple"]);
    });

    await t.test("T-B27: a project quoted before this feature still works", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "pre-feature-quote@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Pre-feature quote", items: [aLine()] } });
      const id = saved.body.project.id;
      const revisionId = "rev-pre-feature-test";
      // Simulates a revision issued before C8: one-key totals_json, delivery_total
      // defaulted to 0 by the migration.
      await sql(`INSERT INTO quote_revision (id, project_id, revision_no, snapshot_status, totals_json, issued_at)
                 VALUES ('${revisionId}', '${id}', 1, 'issued', '{"total":10000}', datetime('now'))`);
      await sql(`INSERT INTO revision_line (id, revision_id, external_ref, product_snapshot_json, dims_json, qty, line_total)
                 VALUES ('revline-pre-feature', '${revisionId}', 'W01', '{}', '{}', 1, 10000)`);
      await sql(`UPDATE project SET status_customer='quote_issued', status_internal='issued', current_revision_id='${revisionId}' WHERE id='${id}'`);

      const accepted = await requestJson(s, `/api/revisions/${revisionId}/accept`, { method: "POST" });
      assert.equal(accepted.body.order.total, 10000);
      const deposit = accepted.body.order.payments.find((p) => p.kind === "deposit");
      assert.equal(deposit.amount, 5000);

      const revisions = await requestJson(s, `/api/projects/${id}/revisions`);
      const rev = revisions.body.revisions.find((r) => r.id === revisionId);
      assert.equal(rev.goods, 10000);
      assert.equal(rev.delivery, 0);
    });

    await t.test("T-B28: delivery is GST-inclusive everywhere and is never grossed up on the way to a screen", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "gst-everywhere@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "GST everywhere", items: [aLine()] } });
      const id = saved.body.project.id;
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "GST Everywhere", email: "gst-everywhere@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      const opsBefore = await requestJson(staff, `/api/ops/projects/${id}`);
      assert.equal(opsBefore.body.delivery.amount, 640);
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-revision`, { method: "POST" });
      const revisions = await requestJson(s, `/api/projects/${id}/revisions`);
      assert.equal(revisions.body.revisions.find((r) => r.id === issued.body.id).delivery, 640);
      const accepted = await requestJson(s, `/api/revisions/${issued.body.id}/accept`, { method: "POST" });
      assert.equal(accepted.body.order.delivery, 640);
    });
  } finally {
    if (server) await stop(server);
    await removeRunDir(runDir);
  }
});
