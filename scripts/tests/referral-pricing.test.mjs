// Referral program — the pricing composition (T2). Design
// docs/design/referral-program.md §5, spec §4.6.
//
// This is the ticket that can break every existing quote, which is why it is
// sequenced this early rather than with the rest of the feature: everything
// after it demos against it.
//
// The claim being tested is deliberately small. The referral discount is NOT a
// new pricing concept, a new totals row, an order column or a second money
// panel. It is one more input to the single function that already answers "what
// percentage off does this user get?", composed at the single step that already
// applies a discount, inside the clamp that already exists.
//
// Two suites live here. The first is pure arithmetic — no database, no server —
// because the composition rule is worth stating in a form that cannot be
// confused with a plumbing failure. The second boots the stack and seeds
// referral rows directly (T2 does not wait on the attribution UX from T3).
//
// scripts/tests/pricing-golden.test.mjs is NOT touched by this ticket. It is the
// captured baseline; leaving it byte-identical to its T0 commit is what makes
// AC-49d ("no existing pricing test is edited to pass") observable in the diff.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import {
  Session, freePort, login, makeRunDir, projectRoot, removeRunDir,
  requestJson, run, staffEmail, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));

// A synthetic card with round numbers: 1000 × 1000 gives a 4.00 m perimeter and
// a 1.00 m² area, so the subtotal is exactly $1,300.00 and a hand calculation
// stays a hand calculation instead of becoming a second implementation.
const RATE = { id: "t2-composition", perimRate: 200, areaRate: 500, minCharge: 0, version: "rc-t2" };
const POLICY = { gstMode: "inc", version: "v1" };
const SUBTOTAL = 1300;
const line = (extra) => ({ family: RATE.id, widthMm: 1000, heightMm: 1000, qty: 1, ...extra });
const byHand = (percent) => Math.round((SUBTOTAL * (1 - percent / 100)) / 10) * 10;

test("AC-48 — the referral discount composes additively at the one discount step", { timeout: 120_000 }, async (t) => {
  const runDir = await makeRunDir("referral-pricing");
  t.after(async () => { await removeRunDir(runDir); });
  const outfile = join(runDir, "pricing-bundle.mjs");
  await build({
    stdin: {
      contents: `export { computePrice } from ${p("worker/lib/estimator/pricing.ts")};`,
      resolveDir: projectRoot,
      sourcefile: "referral-pricing-entry.ts",
      loader: "ts",
    },
    bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  });
  const { computePrice } = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
  const price = (input) => computePrice(RATE, POLICY, line(input));

  await t.test("a referred account gets account + referral, applied once", () => {
    const snapshot = price({ discountPercent: 5, referralDiscountPercent: 2.5 });
    assert.equal(snapshot.discountPercent, 7.5, "the applied percentage is the composed one");
    assert.equal(snapshot.unit, byHand(7.5));
  });

  await t.test("AC-52 — the snapshot records the referral component separately", () => {
    // 7.5 alone cannot be decomposed: it could be 5+2.5 or 7.5+0. Reproducing a
    // stored total later, when the account's own rate may have moved, needs the
    // halves as they were at pricing time.
    assert.equal(price({ discountPercent: 5, referralDiscountPercent: 2.5 }).referralDiscountPercent, 2.5);
  });

  await t.test("AC-52 — and the account component too, so the halves add back up", () => {
    const snapshot = price({ discountPercent: 5, referralDiscountPercent: 2.5 });
    assert.equal(snapshot.accountDiscountPercent, 5, "snapshot.accountDiscountPercent must record the account half");
  });
});

// ── The resolver, through the real stack ─────────────────────────────────────
// computePrice composing two numbers proves the arithmetic. It does not prove
// that the referral percentage ever REACHES it — that is loadAccountDiscount's
// job, and it is the half that can break every existing quote, because both of
// its callers sit under every pricing surface in the app.
//
// Referral rows are seeded straight into D1: T2 deliberately does not wait on
// the attribution UX (T3), and a discount that depends on a cookie would be
// testing the wrong thing here.
const aLine = (overrides = {}) => ({
  code: "W01", location: "Referral probe", productSlug: "amj80-series-sliding-window",
  width: "1200", height: "900", qty: 1,
  options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
  lineTotal: 1,
  ...overrides,
});

test("T2 — the referral discount reaches the price through loadAccountDiscount", { timeout: 600_000 }, async (t) => {
  const runDir = await makeRunDir("referral-resolver");
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
      return JSON.parse(r.stdout.slice(r.stdout.indexOf("[")))[0].results;
    };

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    server = start(process.execPath, [
      wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
      "--persist-to", state, "--assets", assets, "--log-level", "warn",
      "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:", "--var", "SANITY_PROJECT_ID:", "--var", "AI_EXTRACTION_MODE:manual",
    ], { env: wranglerEnv });
    await waitForUrl(`${baseUrl}/api/health`, server);

    // PUT /api/projects/current/lines is "THE pricing entry point" (lines.ts) —
    // the save path every customer edit funnels through.
    const saveLine = async (session, overrides) => {
      const saved = await requestJson(session, "/api/projects/current/lines", {
        method: "PUT", json: { title: "Referral probe", items: [aLine(overrides)] },
      });
      return saved.body.items[0].lineTotal;
    };
    const userIdFor = async (email) => (await sql(`SELECT id FROM user WHERE email='${email}'`))[0].id;
    const seedReferral = async (referredUserId, overrides = {}) => {
      const o = { status: "recorded", discountPercent: 2.5, expiresAt: "datetime('now','+12 months')", ...overrides };
      await sql(
        `INSERT INTO referral (id, referrer_user_id, referred_user_id, code, source, status,
           rate_percent, min_order_amount, discount_percent, window_months, expires_at)
         VALUES ('ref_${referredUserId}', 'u_demo', '${referredUserId}', 'ABC-DEF', 'manual', '${o.status}',
           1, 2000, ${o.discountPercent}, 12, ${o.expiresAt})`,
      );
    };

    await t.test("a referred tradie's line prices with the referral discount composed on top", async () => {
      // Two accounts rather than one account priced twice: a line saved a second
      // time with identical content is not necessarily re-priced, so re-saving
      // would compare a fresh price against a stored one and prove nothing.
      const anonTotal = await saveLine(new Session(baseUrl));

      const control = new Session(baseUrl);
      await login(control, "/api/auth", "referred.control@example.com");
      const nonReferred = await saveLine(control);
      assert.ok(nonReferred < anonTotal, "the standing account discount applies to a registered account");

      const referred = new Session(baseUrl);
      await login(referred, "/api/auth", "referred.pricing@example.com");
      const referredUserId = await userIdFor("referred.pricing@example.com");
      await seedReferral(referredUserId);
      // Guard the guard: a silently failed INSERT would make this test pass for
      // the wrong reason the moment the implementation lands.
      const seeded = await sql(`SELECT status, discount_percent FROM referral WHERE referred_user_id='${referredUserId}'`);
      assert.equal(seeded.length, 1, "the referral row seeded");
      assert.equal(seeded[0].discount_percent, 2.5);

      const referredTotal = await saveLine(referred);
      assert.ok(
        referredTotal < nonReferred,
        `loadAccountDiscount must carry the referral percent into the price: referred ${referredTotal} is not below non-referred ${nonReferred}`,
      );
      // 5% + 2.5% off the unrounded subtotal, then the $10 grid.
      assert.ok(
        Math.abs(referredTotal - anonTotal * 0.925) <= 10,
        `${referredTotal} should be within the $10 grid of 7.5% off ${anonTotal}`,
      );
    });

    await t.test("AC-49b — a non-referred account prices identically whatever the program is doing", async () => {
      // The criterion the whole feature lives or dies on, at the resolver. Every
      // existing account has no referral row, and loadAccountDiscount must return
      // their user.discount_percent and nothing else — with the program On, with
      // it Off, and with the referred side switched off.
      //
      // A fresh account per state, because a line saved again with identical
      // content is not necessarily re-priced.
      const states = [
        ["the program is On", "UPDATE referral_program SET active=1, referred_discount_active=1 WHERE id='default'"],
        ["the program is Off", "UPDATE referral_program SET active=0 WHERE id='default'"],
        ["the referred side is switched off", "UPDATE referral_program SET active=1, referred_discount_active=0 WHERE id='default'"],
      ];
      const totals = [];
      for (const [label, change] of states) {
        await sql(change);
        const session = new Session(baseUrl);
        await login(session, "/api/auth", `nonreferred.${totals.length}@example.com`);
        totals.push([label, await saveLine(session)]);
      }
      // Restore, so a later subtest inherits a running program.
      await sql("UPDATE referral_program SET active=1, referred_discount_active=1 WHERE id='default'");

      const [, baseline] = totals[0];
      for (const [label, total] of totals) {
        assert.equal(total, baseline, `a non-referred line moved when ${label} — AC-49b`);
      }
    });

    await t.test("an expired referral grants no discount", async () => {
      const control = new Session(baseUrl);
      await login(control, "/api/auth", "elig.control@example.com");
      const nonReferred = await saveLine(control);

      const expired = new Session(baseUrl);
      await login(expired, "/api/auth", "elig.expired@example.com");
      await seedReferral(await userIdFor("elig.expired@example.com"), { expiresAt: "datetime('now','-1 day')" });
      assert.equal(await saveLine(expired), nonReferred, "a referral past its expires_at must price like no referral at all");
    });

    await t.test("issuing a quote freezes the referral percentage onto the project", async () => {
      // The issued-quote badge cannot be derived from the per-line pricing
      // snapshot: a customer edit nulls pricing_snapshot_json, so a badge read
      // from it would vanish the moment the customer touched the line. So the
      // percentage is stamped at the existing freeze moment — the same instant
      // delivery freezes — and it is a LABEL, never a price: nothing recomputes
      // a total from it, which is why AC-54 is untouched.
      const staff = new Session(baseUrl);
      await login(staff, "/api/ops/auth", staffEmail);

      const referred = new Session(baseUrl);
      await login(referred, "/api/auth", "issue.referred@example.com");
      await seedReferral(await userIdFor("issue.referred@example.com"));
      const saved = await requestJson(referred, "/api/projects/current/lines", {
        method: "PUT", json: { title: "Issue stamp", items: [aLine()] },
      });
      const id = saved.body.project.id;
      await requestJson(referred, `/api/projects/${id}/submit`, {
        method: "POST", json: { contact: { name: "Issue Stamp", email: "issue.referred@example.com", postcode: "3072" } },
      });
      await requestJson(staff, `/api/ops/projects/${id}/delivery`, { method: "PUT", json: { amount: 250 } });
      await requestJson(staff, `/api/ops/projects/${id}/issue-quote`, { method: "POST" });

      const rows = await sql(`SELECT referral_percent_at_issue FROM project WHERE id='${id}'`);
      assert.equal(
        rows[0].referral_percent_at_issue, 2.5,
        "issueQuote must stamp project.referral_percent_at_issue with the live referral percentage",
      );
    });
  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
