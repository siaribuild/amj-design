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
import { readFile } from "node:fs/promises";
import {
  Session, completeAccount, freePort, login, makeRunDir, projectRoot, removeRunDir,
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
  const wranglerEnv = { CLOUDFLARE_API_TOKEN: "wrangler-local-dev-not-a-real-credential", WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") };
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

    // THE SUBMISSION GATE (registration Phase 1). A quote can only be submitted
    // by a signed-in customer whose account carries a name, phone and address —
    // the server checks it, so every fixture that submits needs a real account.
    // One address per fixture, because one draft per customer means two fixtures
    // sharing an address would merge into each other's project.
    //
    // The sign-in is skipped when the session already holds one: re-issuing a
    // code for the same address inside the cooldown returns no dev code, and the
    // failure would read like a broken auth flow rather than a rate limit.
    const readyToSubmit = async (session, email) => {
      if (!session.cookies.has("apertly_session")) await login(session, "/api/auth", email);
      await completeAccount(session);
    };
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
      await readyToSubmit(s, "no-postcode@example.com");
      const refused = await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: {} },
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
        await readyToSubmit(s, "bad-postcode@example.com");
        const r = await requestJson(s, `/api/projects/${id}/submit`, {
          method: "POST", json: { delivery: { postcode: bad } },
        }, 400);
        assert.equal(r.body.error, "invalid_postcode", `"${bad}" -> invalid_postcode`);
      }
    });

    await t.test("T-B3: a valid postcode is stored digits-intact, and the free-text suburb is left alone", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Good postcode", items: [aLine()] } });
      const id = saved.body.project.id;
      await readyToSubmit(s, "good-postcode@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST",
        json: { delivery: { postcode: "0800", suburb: "Darwin NT" } },
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
      await readyToSubmit(s, "live-estimate@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
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
      await readyToSubmit(s, "fallback-estimate@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "9999" } },
      });
      const record = await requestJson(staff, `/api/ops/projects/${id}`);
      assert.ok(record.body.delivery.estimate > 0);
      assert.equal(record.body.delivery.basis, "fallback_zone");
      assert.equal(record.body.delivery.zoneId, "unmapped");
    });

    // Not a doc-numbered T-B case — E13's own shape (design doc line 871) was
    // never actually asserted from the customer's side of the fence, only the
    // staff one above. Added alongside the account-area estimated-shipping
    // card, which is the first thing that reads `conservative` at all.
    await t.test("the customer's own GET carries postcode/amount/indicative/conservative for the estimate card (§8.4)", async () => {
      // Registered, not anonymous — ownedProject's claim-cookie path only
      // works while isCart(p) (status_customer === 'draft'), same reason
      // T-B18/T-B19 log in before submit rather than after.
      const mapped = new Session(baseUrl);
      await login(mapped, "/api/auth", "mapped-estimate-card@example.com");
      const mappedSaved = await requestJson(mapped, "/api/projects/current/lines", { method: "PUT", json: { title: "Mapped estimate card", items: [aLine()] } });
      const mappedId = mappedSaved.body.project.id;
      await readyToSubmit(mapped, "mapped-estimate-card@example.com");
      await requestJson(mapped, `/api/projects/${mappedId}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      const mappedRecord = await requestJson(mapped, `/api/projects/${mappedId}`);
      assert.equal(mappedRecord.body.delivery.postcode, "3072");
      assert.ok(mappedRecord.body.delivery.amount > 0, "a real figure");
      assert.equal(mappedRecord.body.delivery.indicative, true, "not yet issued");
      assert.equal(mappedRecord.body.delivery.conservative, false, "a real postcode match, not the fallback");

      // Unmapped: falls to the fallback zone — "conservative", never null (D9).
      const unmapped = new Session(baseUrl);
      await login(unmapped, "/api/auth", "unmapped-estimate-card@example.com");
      const unmappedSaved = await requestJson(unmapped, "/api/projects/current/lines", { method: "PUT", json: { title: "Unmapped estimate card", items: [aLine()] } });
      const unmappedId = unmappedSaved.body.project.id;
      await readyToSubmit(unmapped, "unmapped-estimate-card@example.com");
      await requestJson(unmapped, `/api/projects/${unmappedId}/submit`, {
        method: "POST", json: { delivery: { postcode: "9999" } },
      });
      const unmappedRecord = await requestJson(unmapped, `/api/projects/${unmappedId}`);
      assert.ok(unmappedRecord.body.delivery.amount > 0, "never null once the fallback is priced (D9)");
      assert.equal(unmappedRecord.body.delivery.conservative, true, "fell through to the fallback zone");

      // Staff-settled: a human figure is never "conservative" — that word
      // names an auto-estimate that fell through to the fallback zone, not a
      // number someone typed in, and settling skips the live resolution
      // entirely (worker/routes/projects.ts).
      await requestJson(staff, `/api/ops/projects/${mappedId}/delivery`, { method: "PUT", json: { amount: 777 } });
      const settledRecord = await requestJson(mapped, `/api/projects/${mappedId}`);
      assert.equal(settledRecord.body.delivery.amount, 777, "the settled figure, not the live table");
      assert.equal(settledRecord.body.delivery.conservative, false);
    });

    await t.test("T-B8: the account discount moves goods and never delivery", async () => {
      const guest = new Session(baseUrl);
      const guestSaved = await requestJson(guest, "/api/projects/current/lines", { method: "PUT", json: { title: "Discount vs delivery (guest)", items: [aLine()] } });
      const guestId = guestSaved.body.project.id;
      const guestGoods = guestSaved.body.items[0].lineTotal;
      await readyToSubmit(guest, "discount-vs-delivery-guest@example.com");
      await requestJson(guest, `/api/projects/${guestId}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      const guestRecord = await requestJson(staff, `/api/ops/projects/${guestId}`);

      const member = new Session(baseUrl);
      await login(member, "/api/auth", "discount-vs-delivery-member@example.com");
      // A discount is now something an account is GIVEN, not something it is
      // born with: since registration Phase 1 both accounts above are created at
      // 0%, so the contrast this test is about has to be set up rather than
      // assumed. Written straight to D1 because no endpoint may write it.
      await sql("UPDATE user SET discount_percent = 5 WHERE email = 'discount-vs-delivery-member@example.com'");
      const memberSaved = await requestJson(member, "/api/projects/current/lines", { method: "PUT", json: { title: "Discount vs delivery (member)", items: [aLine()] } });
      const memberId = memberSaved.body.project.id;
      const memberGoods = memberSaved.body.items[0].lineTotal;
      await readyToSubmit(member, "discount-vs-delivery-member@example.com");
      await requestJson(member, `/api/projects/${memberId}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
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
      await readyToSubmit(s, "staleness-check@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
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
      await readyToSubmit(s, "override-check@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
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
      await readyToSubmit(s, "audit-check@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
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
      await readyToSubmit(s, "locked-check@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 250 } });
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-quote`, { method: "POST" });
      assert.ok(issued.body.total >= 0, "the quote issued");
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 300 } }, 409);
    });

    // ── The gate (C7) ─────────────────────────────────────────────────────────

    await t.test("T-B14: a quote cannot be issued until delivery is settled", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Gate check", items: [aLine()] } });
      const id = saved.body.project.id;
      await readyToSubmit(s, "gate-check@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/start-pricing`, { method: "POST" });

      const record = await requestJson(staff, `/api/ops/projects/${id}`);
      const issueAction = record.body.actions.find((a) => a.id === "issue-quote");
      assert.ok(issueAction, "the action is present, not hidden");
      assert.match(issueAction.blockedReason ?? "", /delivery/i);

      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-quote`, { method: "POST" }, 409);
      assert.equal(issued.body.error, "delivery_unset");
      const rows = await sql(`SELECT status_internal, issued_at FROM project WHERE id='${id}'`);
      assert.notEqual(rows[0].status_internal, "issued", "the project never reached issued");
      assert.equal(rows[0].issued_at, null, "nothing was stamped as issued");
    });

    await t.test("T-B15: the second issue endpoint is gated too", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Second gate check", items: [aLine()] } });
      const id = saved.body.project.id;
      await readyToSubmit(s, "second-gate@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      // On 'submitted' -- in ISSUABLE_FROM -- actionsFor renders no issue
      // button at all (only estimator_assigned/technical_review_required
      // do): the server guard is the whole mechanism on this status.
      const record = await requestJson(staff, `/api/ops/projects/${id}`);
      assert.equal(record.body.actions.find((a) => a.id === "issue-quote"), undefined);

      const issued = await requestJson(staff, `/api/projects/${id}/issue-quote`, { method: "POST" }, 409);
      assert.equal(issued.body.error, "delivery_unset");
    });

    await t.test("T-B16: an explicit zero is settled -- a trade customer is not an unfinished quote", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Zero settle check", items: [aLine()] } });
      const id = saved.body.project.id;
      await readyToSubmit(s, "zero-settle@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/start-pricing`, { method: "POST" });
      const settled = await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 0 } });
      assert.equal(settled.body.delivery.settled, true);

      const record = await requestJson(staff, `/api/ops/projects/${id}`);
      const issueAction = record.body.actions.find((a) => a.id === "issue-quote");
      assert.equal(issueAction.blockedReason, undefined);

      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-quote`, { method: "POST" });
      assert.equal(issued.body.delivery, 0, "a settled zero issues, and issues AS zero");
    });

    await t.test("T-B17: un-setting re-arms the gate", async () => {
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Re-arm check", items: [aLine()] } });
      const id = saved.body.project.id;
      await readyToSubmit(s, "re-arm-check@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/start-pricing`, { method: "POST" });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 300 } });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: null } });
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-quote`, { method: "POST" }, 409);
      assert.equal(issued.body.error, "delivery_unset");
    });

    await t.test("T-B18: requesting changes re-arms the gate before the quote can be re-issued", async () => {
      const s = new Session(baseUrl);
      // Registered, not anonymous: worker/lib/access.ts's ownedProject accepts
      // the claim cookie only while isCart(p) (status_customer === 'draft'),
      // so an anonymous session cannot request-changes on its OWN quote once
      // it has been submitted and issued — it would 404 regardless of this
      // feature. request-changes needs the customer to act on an issued
      // quote, so this test needs an owner login, same as T-B19.
      await login(s, "/api/auth", "request-changes-rearm@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Request changes re-arm", items: [aLine()] } });
      const id = saved.body.project.id;
      await readyToSubmit(s, "request-changes-rearm@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/start-pricing`, { method: "POST" });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      await requestJson(staff, `/api/ops/projects/${id}/issue-quote`, { method: "POST" });

      const changes = await requestJson(s, `/api/projects/${id}/request-changes`, { method: "POST", json: { message: "Please swap the colour." } });
      assert.equal(changes.body.ok, true);

      const rows = await sql(`SELECT delivery_amount FROM project WHERE id='${id}'`);
      assert.equal(rows[0].delivery_amount, null, "without a change, the gate would arm only once per project ever");
      const record = await requestJson(staff, `/api/ops/projects/${id}`);
      assert.match(record.body.actions.find((a) => a.id === "issue-quote")?.blockedReason ?? "", /delivery/i);
    });

    await t.test("T-B19: replying to a clarification re-arms the gate", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "clarification-rearm@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Clarification re-arm", items: [aLine()] } });
      const id = saved.body.project.id;
      await readyToSubmit(s, "clarification-rearm@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
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
      // Registered, not anonymous: the claim cookie stops granting access once
      // the project leaves 'draft' (see T-B18), and this test reads the issued
      // quote back through the CUSTOMER endpoint.
      await login(s, "/api/auth", "freeze-check@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Freeze check", items: [aLine()] } });
      const id = saved.body.project.id;
      const goodsAmount = saved.body.items[0].lineTotal;
      await readyToSubmit(s, "freeze-check@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-quote`, { method: "POST" });
      assert.equal(issued.body.total, goodsAmount + 640);
      assert.equal(issued.body.goods, goodsAmount);
      assert.equal(issued.body.delivery, 640);

      // The figure is frozen by the STATE, not by a snapshot copy: delivery is
      // not editable while status_internal='issued' (T-B13), so project.
      // delivery_amount IS the issued figure, and the customer read recomputes
      // the same total from it every time.
      const rows = await sql(`SELECT delivery_amount, delivery_postcode, status_internal, issued_at FROM project WHERE id='${id}'`);
      assert.equal(rows[0].delivery_amount, 640);
      assert.equal(rows[0].delivery_postcode, "3072");
      assert.equal(rows[0].status_internal, "issued");
      assert.ok(rows[0].issued_at, "issuing stamps when it happened");
      const quote = await requestJson(s, `/api/projects/${id}/quote`);
      assert.equal(quote.body.total, goodsAmount + 640);
      assert.equal(quote.body.goods, goodsAmount);
      assert.equal(quote.body.delivery, 640);
      assert.equal(quote.body.deliveryPostcode, "3072");
    });

    await t.test("T-B21: re-issuing after a change request carries the NEW delivery figure", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "reissue-freeze@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Reissue freeze", items: [aLine()] } });
      const id = saved.body.project.id;
      await readyToSubmit(s, "reissue-freeze@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      const r1 = await requestJson(staff, `/api/ops/projects/${id}/issue-quote`, { method: "POST" });
      assert.equal(r1.body.delivery, 640);

      // There is no superseded copy to keep a stale 640 alive (owner: "a quote
      // is a quote"). The re-arm clears the figure, the new one replaces it,
      // and the customer sees exactly one quote — the current one.
      await requestJson(s, `/api/projects/${id}/request-changes`, { method: "POST", json: { message: "Please add a note." } });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 700 } });
      const r2 = await requestJson(staff, `/api/ops/projects/${id}/issue-quote`, { method: "POST" });
      assert.equal(r2.body.delivery, 700);

      const quote = await requestJson(s, `/api/projects/${id}/quote`);
      assert.equal(quote.body.live, true);
      assert.equal(quote.body.delivery, 700, "the live quote carries the re-issued figure, not the first one");
    });

    await t.test("T-B22: editing the rate table does not move a quote that is already issued", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "issued-frozen-rate@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Issued frozen rate", items: [aLine()] } });
      const id = saved.body.project.id;
      await readyToSubmit(s, "issued-frozen-rate@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      await requestJson(staff, `/api/ops/projects/${id}/issue-quote`, { method: "POST" });

      const before = await requestJson(staff, "/api/ops/pricing/delivery-zones");
      const vicMetro = before.body.zones.find((z) => z.id === "vic-metro");
      await requestJson(staff, "/api/ops/pricing/delivery-zones/vic-metro", {
        method: "PUT", json: { ratePerSqm: vicMetro.ratePerSqm * 4, expectedVersion: vicMetro.version },
      });

      // The CUSTOMER read path — where a lazy implementation would recompute.
      // It reads the SETTLED figure (project.delivery_amount), never the live
      // rate table, which is what keeps an issued quote still.
      const quote = await requestJson(s, `/api/projects/${id}/quote`);
      assert.equal(quote.body.delivery, 640, "frozen despite the rate move");

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
      await readyToSubmit(s, "order-critical@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-quote`, { method: "POST" });
      const accepted = await requestJson(s, `/api/projects/${id}/accept`, { method: "POST" });
      const orderId = accepted.body.order.id;

      // PARENTS ONLY: a composite's units are order_line rows too now (0047),
      // and summing them beside their parent would double-count. This fixture
      // has no composite, but the guard states the rule the sum depends on.
      const lineSum = await sql(`SELECT COALESCE(SUM(line_total),0) AS s FROM order_line WHERE order_id='${orderId}' AND parent_line_id IS NULL`);
      assert.equal(Number(lineSum[0].s), goodsAmount, "SUM(order_line) === goods");
      const orderRow = await sql(`SELECT total, delivery_total FROM "order" WHERE id='${orderId}'`);
      assert.equal(orderRow[0].delivery_total, 640, "\"order\".delivery_total === 640");
      assert.equal(orderRow[0].total, goodsAmount + 640, "\"order\".total === goods + 640");
      // The issued quote and the order agree — the figure the customer accepted
      // is the figure that became the contract.
      assert.equal(orderRow[0].total, issued.body.total, "\"order\".total === the issued total");
      assert.equal(accepted.body.order.total, orderRow[0].total, "the DTO's order.total agrees with the row");
    });

    await t.test("T-B24: the deposit is half of goods plus delivery", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "deposit-half@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Deposit half", items: [aLine()] } });
      const id = saved.body.project.id;
      const goodsAmount = saved.body.items[0].lineTotal;
      await readyToSubmit(s, "deposit-half@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-quote`, { method: "POST" });
      const accepted = await requestJson(s, `/api/projects/${id}/accept`, { method: "POST" });
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
      await readyToSubmit(s, "deposit-balance-cent@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 180 } }); // a real minimum-charge figure
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-quote`, { method: "POST" });
      const accepted = await requestJson(s, `/api/projects/${id}/accept`, { method: "POST" });
      const deposit = accepted.body.order.payments.find((p) => p.kind === "deposit");
      const balance = accepted.body.order.payments.find((p) => p.kind === "balance");

      assert.equal(deposit.amount + balance.amount, accepted.body.order.total);
      assert.equal(deposit.percent, 50);
      assert.equal(balance.percent, 50);
    });

    await t.test("T-B26: delivery is never a line -- not a quote_line, not an order_line", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "never-a-line@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "Never a line", items: [aLine()] } });
      const id = saved.body.project.id;
      await readyToSubmit(s, "never-a-line@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-quote`, { method: "POST" });
      const accepted = await requestJson(s, `/api/projects/${id}/accept`, { method: "POST" });
      const orderId = accepted.body.order.id;

      const quoteLineCount = await sql(`SELECT count(*) AS n FROM quote_line WHERE project_id='${id}' AND parent_line_id IS NULL`);
      const orderLineCount = await sql(`SELECT count(*) AS n FROM order_line WHERE order_id='${orderId}' AND parent_line_id IS NULL`);
      assert.equal(Number(quoteLineCount[0].n), 1);
      assert.equal(Number(orderLineCount[0].n), 1);

      const deliveryLikeSlugs = await sql(
        `SELECT count(*) AS n FROM quote_line WHERE project_id='${id}' AND (product_slug LIKE '%deliver%' OR product_slug LIKE '%freight%')`,
      );
      assert.equal(Number(deliveryLikeSlugs[0].n), 0);
      const kinds = await sql(`SELECT DISTINCT line_kind FROM quote_line WHERE project_id='${id}'`);
      assert.deepEqual(kinds.map((k) => k.line_kind), ["simple"]);
    });

    // T-B27 ("a project quoted before this feature still works") lived here and
    // is gone. It hand-built a pre-C8 quote_revision row — one-key totals_json,
    // delivery_total defaulted to 0 — to prove the read path tolerated it. Both
    // the table and the compatibility question are gone: revisions were removed
    // (docs/quote-revisions-removal-plan.md) and nothing is live to migrate, so
    // the only thing this test could still assert is that a fixture it creates
    // itself round-trips. The behaviour that mattered — a settled zero issuing
    // and accepting as zero — is T-B16 and T-B24.

    await t.test("T-B28: delivery is GST-inclusive everywhere and is never grossed up on the way to a screen", async () => {
      const s = new Session(baseUrl);
      await login(s, "/api/auth", "gst-everywhere@example.com");
      const saved = await requestJson(s, "/api/projects/current/lines", { method: "PUT", json: { title: "GST everywhere", items: [aLine()] } });
      const id = saved.body.project.id;
      await readyToSubmit(s, "gst-everywhere@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 640 } });
      const opsBefore = await requestJson(staff, `/api/ops/projects/${id}`);
      assert.equal(opsBefore.body.delivery.amount, 640);
      const issued = await requestJson(staff, `/api/ops/projects/${id}/issue-quote`, { method: "POST" });
      assert.equal(issued.body.delivery, 640);
      const quote = await requestJson(s, `/api/projects/${id}/quote`);
      assert.equal(quote.body.delivery, 640);
      const accepted = await requestJson(s, `/api/projects/${id}/accept`, { method: "POST" });
      assert.equal(accepted.body.order.delivery, 640);
    });

    // ── The delivery ADDRESS (ops2-delivery-price, D10/D14/D15) ─────────────
    // The destination was two columns and is now a postal address. These test
    // the widened PUT: present-fields-only, validate-then-write, and the two
    // groups (amount vs address) never touching each other's columns.

    /** A submitted project with a postcode, ready for staff to work on. */
    const submitted = async (label) => {
      const slug = label.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      const s = new Session(baseUrl);
      const saved = await requestJson(s, "/api/projects/current/lines", {
        method: "PUT", json: { title: label, items: [aLine()] },
      });
      const id = saved.body.project.id;
      await readyToSubmit(s, slug + "@example.com");
      await requestJson(s, `/api/projects/${id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      return { s, id };
    };
    const row = async (id) => (await sql(
      `SELECT delivery_line1, delivery_line2, delivery_suburb, delivery_state,
              delivery_postcode, delivery_amount, delivery_note, delivery_settled_at,
              delivery_settle_json
         FROM project WHERE id='${id}'`))[0];

    await t.test("T-B39: the three address columns exist and are NULL on a row that predates them", async () => {
      const { id } = await submitted("Address columns");
      const before = await row(id);
      assert.equal(before.delivery_line1, null);
      assert.equal(before.delivery_line2, null);
      assert.equal(before.delivery_state, null);
      // The migration is additive; nothing it did may have reached a child table.
      const counts = await sql("SELECT (SELECT COUNT(*) FROM quote_line) AS lines, (SELECT COUNT(*) FROM project) AS projects");
      assert.ok(counts[0].projects > 0 && counts[0].lines > 0, "rows survived the migration");
    });

    await t.test("T-B40: an address-only save writes the destination and leaves the amount group byte-untouched", async () => {
      const { id } = await submitted("Address only");
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, {
        method: "PUT", json: { amount: 640, note: "settled first" },
      });
      const before = await row(id);
      const saved = await requestJson(staff, `/api/ops/projects/${id}/delivery`, {
        method: "PUT",
        json: { line1: "  12 Wattle St  ", line2: "Unit 3", suburb: "  Richmond  ", state: "VIC", postcode: "3121" },
      });
      const after = await row(id);
      assert.equal(after.delivery_line1, "12 Wattle St", "trimmed");
      assert.equal(after.delivery_suburb, "Richmond", "trimmed");
      assert.equal(after.delivery_state, "VIC");
      assert.equal(after.delivery_postcode, "3121");
      // The amount group is a DIFFERENT group and this body did not mention it.
      assert.equal(after.delivery_amount, before.delivery_amount);
      assert.equal(after.delivery_note, before.delivery_note, "D5: an address save never clears the note");
      assert.equal(after.delivery_settled_at, before.delivery_settled_at);
      assert.equal(after.delivery_settle_json, before.delivery_settle_json);
      assert.equal(saved.body.delivery.line1, "12 Wattle St", "and the DTO carries it back");
      assert.equal(saved.body.delivery.state, "VIC");
    });

    await t.test("T-B41: an amount-only save leaves all five destination columns byte-untouched", async () => {
      const { id } = await submitted("Amount only");
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, {
        method: "PUT", json: { line1: "9 Smith Rd", suburb: "Preston", state: "VIC", postcode: "3072" },
      });
      const before = await row(id);
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 450 } });
      const after = await row(id);
      assert.equal(after.delivery_amount, 450);
      for (const col of ["delivery_line1", "delivery_line2", "delivery_suburb", "delivery_state", "delivery_postcode"]) {
        assert.equal(after[col], before[col], `${col} untouched by an amount save`);
      }
    });

    await t.test("T-B42: line2 is the one clearable field; line1 and suburb are replace-only", async () => {
      const { id } = await submitted("Clearable line2");
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, {
        method: "PUT", json: { line1: "1 High St", line2: "Level 4", suburb: "Kew", state: "VIC" },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { line2: "" } });
      assert.equal((await row(id)).delivery_line2, null, "an emptied line2 stores NULL");
      // D14: the others cannot be blanked from this endpoint.
      const before = await row(id);
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { line1: "   " } }, 400);
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { suburb: "" } }, 400);
      assert.deepEqual(await row(id), before, "a refused body writes nothing at all");
    });

    await t.test("T-B43: the whole body is validated before anything is written", async () => {
      const { id } = await submitted("Validate first");
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, {
        method: "PUT", json: { line1: "2 Park Ave", suburb: "Carlton", state: "VIC" },
      });
      const before = await row(id);
      const bad = [
        { line1: "x".repeat(121) },
        { suburb: "y".repeat(81) },
        { state: "Victoria" },
        { state: "XX" },
        { postcode: "abc" },
        { postcode: "312" },
        { amount: -1 },
        { amount: "250" },            // a numeric STRING is not a number
        { amount: 1e12 },
        // A good field beside a bad one must not sneak through.
        { line1: "3 Valid St", state: "XX" },
      ];
      for (const json of bad) {
        await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json }, 400);
        assert.deepEqual(await row(id), before, `${JSON.stringify(json)} wrote nothing`);
      }
    });

    await t.test("T-B44: unknown keys are ignored; a body with no known key is refused", async () => {
      const { id } = await submitted("Unknown keys");
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, {
        method: "PUT", json: { suburb: "Fitzroy", project_id: "someone-else", account_id: "x", phase: "issued" },
      });
      assert.equal((await row(id)).delivery_suburb, "Fitzroy", "the known key applied");
      const before = await row(id);
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { nonsense: 1 } }, 400);
      assert.deepEqual(await row(id), before);
    });

    await t.test("T-B45: the address audit event records field NAMES, never the values", async () => {
      const { id } = await submitted("Address audit");
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, {
        method: "PUT", json: { line1: "77 Secret Lane", suburb: "Toorak", state: "VIC" },
      });
      const rows = await sql(`SELECT action FROM audit_event WHERE entity_id='${id}'`);
      const joined = rows.map((r) => r.action).join(" | ");
      assert.match(joined, /address/i, "the change is recorded");
      assert.equal(/77 Secret Lane|Toorak/.test(joined), false, "but never the address itself");
    });

    await t.test("T-B46: the zone still resolves from the postcode alone — state is never an input", async () => {
      const { id } = await submitted("State not a zone input");
      // A state that contradicts the postcode must not move the zone.
      const saved = await requestJson(staff, `/api/ops/projects/${id}/delivery`, {
        method: "PUT", json: { postcode: "3072", state: "WA" },
      });
      const byPostcodeOnly = await requestJson(staff, `/api/ops/projects/${id}`);
      assert.equal(saved.body.delivery.zoneId, byPostcodeOnly.body.delivery.zoneId);
      assert.equal(saved.body.delivery.state, "WA", "stored, and irrelevant to pricing");
    });

    await t.test("T-B47: address writes obey the same auth and phase gates as the figure", async () => {
      const { s, id } = await submitted("Address gates");
      const body = { method: "PUT", json: { suburb: "Nowhere" } };
      await requestJson(anon, `/api/ops/projects/${id}/delivery`, body, 403);
      await requestJson(s, `/api/ops/projects/${id}/delivery`, body, 403);
      assert.equal((await row(id)).delivery_suburb, null, "nothing written by a refused caller");
      await requestJson(staff, "/api/ops/projects/unknown-id/delivery", body, 404);
    });

    await t.test("T-B49: the phase gate is in the WRITE, not only in the check before it", async () => {
      // TOCTOU. The handler SELECTs status_internal, decides the project is
      // editable, and then UPDATEs. A quote issued in between would be written
      // to anyway: an issued job silently acquiring a new destination after the
      // customer has the document. The gate therefore has to be part of the
      // UPDATE's own predicate, so a row that stopped being editable matches
      // nothing and the request answers 409 instead of succeeding quietly.
      //
      // The race itself is not reproducible from out here; what IS testable is
      // that the statement carries the guard rather than `WHERE id = ?` alone.
      const handler = await readFile(join(projectRoot, "worker", "routes", "ops.ts"), "utf8");
      const put = handler.slice(handler.indexOf('ops.put("/projects/:id/delivery"'));
      const update = put.slice(put.indexOf("UPDATE project SET"), put.indexOf("UPDATE project SET") + 400);
      assert.match(update, /status_internal/, "the UPDATE re-checks the phase it was gated on");
      assert.match(put, /meta\??\.changes/, "and a write that matched nothing is not reported as success");
    });

    await t.test("T-B48: an address is stored and returned literally, never interpreted", async () => {
      const { id } = await submitted("Literal address");
      const saved = await requestJson(staff, `/api/ops/projects/${id}/delivery`, {
        method: "PUT", json: { line1: "<script>alert(1)</script>", suburb: "Kew" },
      });
      assert.equal(saved.body.delivery.line1, "<script>alert(1)</script>");
      assert.equal((await row(id)).delivery_line1, "<script>alert(1)</script>");
    });

  } finally {
    if (server) await stop(server);
    await removeRunDir(runDir);
  }
});
