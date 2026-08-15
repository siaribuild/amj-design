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
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

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
