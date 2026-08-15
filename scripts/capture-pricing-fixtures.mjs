// Capture the AC-49a golden pricing corpus (referral program, ticket T0).
//
//   node scripts/capture-pricing-fixtures.mjs
//
// Runs the pure engine — worker/lib/estimator/pricing.ts computePrice — over an
// explicit spread of rate cards, options, quantities and account states, and
// writes what it returns to scripts/tests/fixtures/pricing-golden/cases.json.
// scripts/tests/pricing-golden.test.mjs replays the corpus and asserts every
// figure is unchanged.
//
// WHY IT MUST RUN BEFORE pricing.ts IS EDITED. This is a characterisation
// capture: the fixtures have no independent authority, they are simply "what the
// engine did". Captured from an already-edited engine they would characterise
// the edit and prove nothing about the baseline. The corpus therefore lands in
// its own commit, ahead of the referral change, and the suite asserts that
// ordering against git history.
//
// EVERY INPUT IS EXPLICIT — no D1, no seed, no catalogue. A corpus that reads
// the database would move when the seed moves, and a moving baseline is not a
// baseline. The rate cards below are shaped like the real ones; two are
// synthetic, chosen so the arithmetic lands exactly on and exactly off a $10
// rounding boundary.
//
// RE-CAPTURE IS REFUSED once the corpus exists. Overwriting it is how a genuine
// AC-49 regression would get "fixed" — the numbers would simply be re-recorded
// and the suite would go green on the new behaviour. Pass --recapture only when
// the corpus is being deliberately rebuilt on an unmodified engine.
import { build } from "esbuild";
import { mkdtemp, mkdir, rm, writeFile, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRICING_REL = "worker/lib/estimator/pricing.ts";
const OUT_DIR = join(projectRoot, "scripts", "tests", "fixtures", "pricing-golden");
const OUT_FILE = join(OUT_DIR, "cases.json");

// ── Rate cards ────────────────────────────────────────────────────────────────
// Shaped like `pricing_rate_card` rows (0031: one card per PRODUCT slug).
const RATES = {
  sliding:  { id: "amj80-series-sliding-window", perimRate: 55, areaRate: 320, minCharge: 480,  version: "rc-2026-01" },
  fixed:    { id: "amj100t-fixed-window",        perimRate: 48, areaRate: 295, minCharge: 420,  version: "rc-2026-01" },
  door:     { id: "amj200-hinged-door",          perimRate: 90, areaRate: 410, minCharge: 1300, version: "rc-2026-02" },
  // Synthetic. 1000 × 1000 ⇒ perimeter 4.00 m and area 1.00 m², so the subtotal
  // is exactly $1,300.00 and a 5% account discount puts the pre-round figure
  // exactly on the $10 half-way mark. That is where an accidental reordering of
  // discount and round10() becomes visible.
  boundary: { id: "synthetic-rounding-boundary", perimRate: 200, areaRate: 500, minCharge: 0, version: "rc-synthetic" },
  // Same, moved off the boundary: the subtotal lands mid-band, where the same
  // mistake would hide. Both cases are required — one without the other proves
  // half of the property.
  midBand:  { id: "synthetic-rounding-mid-band", perimRate: 200, areaRate: 462, minCharge: 0, version: "rc-synthetic" },
};

const POLICY = { gstMode: "inc", version: "v1" };

// Per-product conditional rules (`pricing_modifier`): one percent, one fixed,
// applied in seq order after the minimum charge and before the discount.
const MODIFIERS = [
  { id: "mod-wide-frame", seq: 1, label: "wide frame", whenField: "width", whenOp: ">",  whenValue: 1200, thenType: "percent", thenValue: 10 },
  { id: "mod-large-area", seq: 2, label: "large area", whenField: "area",  whenOp: ">=", whenValue: 3,    thenType: "fixed",   thenValue: 250 },
];

const HANDLE = { value: 85, basis: "per_unit" };
const GLASS  = { value: 180, basis: "per_sqm" };

// The account states, as the discount percentages that reach computePrice.
// loadAccountDiscount resolves these server-side; the corpus pins the arithmetic
// they produce, not the resolution.
const ANONYMOUS = 0;   // no owner_user_id
const REGISTERED = 5;  // migrations/0032_account_discount.sql default
const STAFF = 0;       // type='internal'

const CASES = [
  {
    id: "anonymous-no-account",
    why: "an anonymous project prices at 0% — the discount is a reason to register",
    covers: ["anonymous"],
    parts: [{ label: "line", rate: RATES.sliding, policy: POLICY, input: {
      family: RATES.sliding.id, widthMm: 1200, heightMm: 900, qty: 1,
      optionSurcharges: [HANDLE], modifiers: [], discountPercent: ANONYMOUS,
    } }],
  },
  {
    id: "registered-default-five-percent",
    why: "the same line for a registered account carries the standing 5% — the figure the referral composes with",
    covers: ["registered-default"],
    parts: [{ label: "line", rate: RATES.sliding, policy: POLICY, input: {
      family: RATES.sliding.id, widthMm: 1200, heightMm: 900, qty: 1,
      optionSurcharges: [HANDLE], modifiers: [], discountPercent: REGISTERED,
    } }],
  },
  {
    id: "internal-staff-account",
    why: "a staff account prices at 0% and can never be referred",
    covers: ["staff"],
    parts: [{ label: "line", rate: RATES.fixed, policy: POLICY, input: {
      family: RATES.fixed.id, widthMm: 1750, heightMm: 700, qty: 1,
      optionSurcharges: [], modifiers: [], discountPercent: STAFF,
    } }],
  },
  {
    id: "min-charge-drives-the-price",
    why: "a small opening is priced by min_charge, not the rate — the discount must apply after it",
    covers: ["min-charge"],
    parts: [{ label: "line", rate: RATES.door, policy: POLICY, input: {
      family: RATES.door.id, widthMm: 400, heightMm: 400, qty: 1,
      optionSurcharges: [], modifiers: [], discountPercent: REGISTERED,
    } }],
  },
  {
    id: "modifiers-both-fire",
    why: "percent then fixed, in seq order, before the discount",
    covers: ["modifier-fired"],
    parts: [{ label: "line", rate: RATES.sliding, policy: POLICY, input: {
      family: RATES.sliding.id, widthMm: 1600, heightMm: 2100, qty: 1,
      optionSurcharges: [HANDLE], modifiers: MODIFIERS, discountPercent: REGISTERED,
    } }],
  },
  {
    id: "modifiers-do-not-fire",
    why: "the same rules on a small opening contribute nothing — appliedModifiers stays empty",
    covers: ["modifier-not-fired"],
    parts: [{ label: "line", rate: RATES.sliding, policy: POLICY, input: {
      family: RATES.sliding.id, widthMm: 900, heightMm: 900, qty: 1,
      optionSurcharges: [HANDLE], modifiers: MODIFIERS, discountPercent: REGISTERED,
    } }],
  },
  {
    id: "rounding-boundary",
    why: "$1,300.00 less 5% sits exactly on the $10 half-way mark — the discount is applied immediately before round10()",
    covers: ["rounding-boundary"],
    parts: [{ label: "line", rate: RATES.boundary, policy: POLICY, input: {
      family: RATES.boundary.id, widthMm: 1000, heightMm: 1000, qty: 1,
      optionSurcharges: [], modifiers: [], discountPercent: REGISTERED,
    } }],
  },
  {
    id: "rounding-mid-band",
    why: "the same shape off the boundary, where an order-of-operations slip would hide",
    covers: ["rounding-mid-band"],
    parts: [{ label: "line", rate: RATES.midBand, policy: POLICY, input: {
      family: RATES.midBand.id, widthMm: 1000, heightMm: 1000, qty: 1,
      optionSurcharges: [], modifiers: [], discountPercent: REGISTERED,
    } }],
  },
  {
    id: "quantity-multiplies-after-rounding",
    why: "× qty happens after round10(), so four units are four rounded units and not one rounded four",
    covers: ["qty-gt-1"],
    parts: [{ label: "line", rate: RATES.sliding, policy: POLICY, input: {
      family: RATES.sliding.id, widthMm: 1200, heightMm: 900, qty: 4,
      optionSurcharges: [HANDLE], modifiers: [], discountPercent: REGISTERED,
    } }],
  },
  {
    id: "surcharges-mixed-basis",
    why: "per_unit is flat, per_sqm scales with the glazed area, both inside the discounted subtotal",
    covers: ["qty-gt-1"],
    parts: [{ label: "line", rate: RATES.fixed, policy: POLICY, input: {
      family: RATES.fixed.id, widthMm: 2400, heightMm: 1200, qty: 2,
      optionSurcharges: [HANDLE, GLASS], modifiers: [], discountPercent: REGISTERED,
    } }],
  },
  {
    id: "composite-parent-two-segments",
    why: "a 3500mm opening built as two 1750mm frames: the parent is never priced, its total IS the sum of the segments, and the wide-frame rule applies per frame",
    covers: ["composite", "modifier-fired"],
    parts: [
      { label: "segment-1", rate: RATES.fixed, policy: POLICY, input: {
        family: RATES.fixed.id, widthMm: 1750, heightMm: 700, qty: 1,
        optionSurcharges: [], modifiers: MODIFIERS, discountPercent: REGISTERED,
      } },
      { label: "segment-2", rate: RATES.fixed, policy: POLICY, input: {
        family: RATES.fixed.id, widthMm: 1750, heightMm: 700, qty: 1,
        optionSurcharges: [], modifiers: MODIFIERS, discountPercent: REGISTERED,
      } },
    ],
  },
  {
    id: "discount-clamped-above-one-hundred",
    why: "the existing 0–100 clamp — the referral composition must live inside it, never beside it",
    covers: [],
    parts: [{ label: "line", rate: RATES.sliding, policy: POLICY, input: {
      family: RATES.sliding.id, widthMm: 1200, heightMm: 900, qty: 1,
      optionSurcharges: [HANDLE], modifiers: [], discountPercent: 150,
    } }],
  },
  {
    id: "discount-clamped-below-zero",
    why: "a negative discount is a surcharge by another name and is clamped to nothing",
    covers: [],
    parts: [{ label: "line", rate: RATES.sliding, policy: POLICY, input: {
      family: RATES.sliding.id, widthMm: 1200, heightMm: 900, qty: 1,
      optionSurcharges: [HANDLE], modifiers: [], discountPercent: -20,
    } }],
  },
  {
    id: "zero-dimension-is-not-priced",
    why: "ok=false still returns a snapshot, and the discount does not turn it into money",
    covers: [],
    parts: [{ label: "line", rate: RATES.sliding, policy: POLICY, input: {
      family: RATES.sliding.id, widthMm: 0, heightMm: 900, qty: 1,
      optionSurcharges: [HANDLE], modifiers: MODIFIERS, discountPercent: REGISTERED,
    } }],
  },
  {
    id: "explain-trace-non-referred",
    why: "the ops price-explain trace, whole — including the 'account discount 5%' label that must not change for a non-referred line",
    covers: [],
    parts: [{ label: "line", rate: RATES.sliding, policy: POLICY, input: {
      family: RATES.sliding.id, widthMm: 1600, heightMm: 900, qty: 1,
      optionSurcharges: [HANDLE], modifiers: MODIFIERS, discountPercent: REGISTERED, explain: true,
    } }],
  },
];

async function main() {
  const recapture = process.argv.includes("--recapture");
  const exists = await access(OUT_FILE).then(() => true, () => false);
  if (exists && !recapture) {
    console.error(
      `Refusing to overwrite ${OUT_FILE}.\n` +
      "The corpus is a captured baseline: re-recording it is how an AC-49 regression\n" +
      "gets silently blessed. If the engine really is unmodified and the corpus is\n" +
      "being rebuilt deliberately, pass --recapture.",
    );
    process.exitCode = 1;
    return;
  }

  const runDir = await mkdtemp(join(tmpdir(), "capture-pricing-"));
  const outfile = join(runDir, "pricing.mjs");
  try {
    await build({
      stdin: {
        contents: `export { computePrice } from ${JSON.stringify(join(projectRoot, PRICING_REL))};`,
        resolveDir: projectRoot,
        sourcefile: "capture-entry.ts",
        loader: "ts",
      },
      bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
    });
    const { computePrice } = await import(pathToFileURL(outfile).href);

    const cases = CASES.map((testCase) => {
      let compositeTotal = 0;
      const parts = testCase.parts.map((part) => {
        const { computedAt, ...comparable } = computePrice(part.rate, part.policy, part.input);
        compositeTotal += comparable.total;
        return { ...part, expected: JSON.parse(JSON.stringify(comparable)) };
      });
      return {
        ...testCase,
        parts,
        ...(testCase.parts.length > 1 ? { expectedCompositeTotal: compositeTotal } : {}),
      };
    });

    let commit = null;
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: projectRoot });
      commit = stdout.trim();
    } catch { /* provenance is asserted from git history, not from this field */ }

    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(OUT_FILE, `${JSON.stringify({
      // Informational. The load-bearing provenance check is the suite's git
      // assertion that the commit adding this file did not also touch pricing.ts.
      capturedAt: new Date().toISOString(),
      capturedFromCommit: commit,
      capturedFrom: PRICING_REL,
      note: "AC-49a characterisation corpus. Regenerate only on an unmodified engine (--recapture).",
      cases,
    }, null, 2)}\n`);
    console.log(`Captured ${cases.length} cases (${cases.reduce((n, c) => n + c.parts.length, 0)} priced lines) → ${OUT_FILE}`);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}

await main();
