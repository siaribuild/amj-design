// Unit tests for the email-template renderer + safe-fallback loader
// (worker/lib/emailTemplates.ts). The wiring guarantee is: render from Sanity
// when a template exists, otherwise fall back to the built-in copy — a CMS blip
// must never block a transactional email.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const runDir = await makeRunDir("email-templates");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { applyPlaceholders, loadEmailTemplate } from ${JSON.stringify(join(projectRoot, "worker/lib/emailTemplates.ts"))};
      export { TRADE_EMAILS } from ${JSON.stringify(join(projectRoot, "worker/lib/trade.ts"))};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { applyPlaceholders, loadEmailTemplate, TRADE_EMAILS } = await import(pathToFileURL(outfile).href);

test("applyPlaceholders substitutes known tokens and leaves unknown ones intact", () => {
  const out = applyPlaceholders("Hi [name], your code is [code].", { name: "Sam", code: 123 });
  assert.equal(out, "Hi Sam, your code is 123.");
  // An unknown token is an editor mistake worth SEEING — not silently blanked.
  assert.equal(applyPlaceholders("ref [ref] / [mystery]", { ref: "OF-Q-1" }), "ref OF-Q-1 / [mystery]");
});

test("a provided null/undefined value collapses to empty (optional lines disappear)", () => {
  // [scheduleNote] is the conditional-line case: present-but-empty ⇒ nothing shown.
  assert.equal(applyPlaceholders("done.[scheduleNote]\n\nnext", { scheduleNote: "" }), "done.\n\nnext");
  assert.equal(applyPlaceholders("a[x]b", { x: null }), "ab");
  assert.equal(applyPlaceholders("a[x]b", { x: undefined }), "ab");
});

test("a repeated token is replaced everywhere; a token with no value is left intact", () => {
  assert.equal(applyPlaceholders("[ref] … reference [ref]", { ref: "R1" }), "R1 … reference R1");
  // Any [word] is a token by syntax; when the caller supplies no value it stays
  // verbatim rather than becoming blank (so a stray bracket is visible, not lost).
  assert.equal(applyPlaceholders("array[0] stays", {}), "array[0] stays");
});

test("loadEmailTemplate returns null (⇒ built-in fallback) when Sanity is not configured", async () => {
  // No project id ⇒ no network call, immediate fallback. This is the guarantee
  // that a sign-in OTP is never gated on the CMS.
  assert.equal(await loadEmailTemplate({}, "signin_code"), null);
  assert.equal(await loadEmailTemplate({ SANITY_PROJECT_ID: "" }, "signin_code"), null);
});

// ── Registration Phase 2: the four trade-verification emails ────────────────
//
// Two properties are being pinned here and they fail in different ways.
//
// The KEY is a deployment trap: templates are fetched from the PUBLIC Sanity
// dataset by _id, and anonymous reads only see dot-free ids. A key like
// "trade.approved" would resolve to nothing, forever, silently — the fallback
// would send and nobody would ever notice the authored copy was dead.
//
// The COPY is a business rule: no Phase-2 email may carry a discount
// percentage, a pair of figures one could be derived from, a promised
// turnaround, or any hint that another account holds the same ABN
// (AC-P2-43…46, AC-P2-61…64). Asserted mechanically because "we read them and
// they looked fine" is how the next one gets through.
test("the four Phase-2 email templates: dot-free keys, and copy that promises nothing", () => {
  assert.deepEqual(Object.keys(TRADE_EMAILS).sort(),
    ["trade_ack", "trade_approved", "trade_rejected", "trade_revoked"]);

  for (const [key, template] of Object.entries(TRADE_EMAILS)) {
    // AC-P2-62: snake_case, and NO DOT.
    assert.match(key, /^[a-z][a-z0-9_]*$/, `${key} must be dot-free snake_case`);
    assert.ok(!key.includes("."), `${key} must not contain a dot`);
    // The EVENT name may contain dots — that is the house style, and it is a
    // different string with a different consumer.
    assert.match(template.eventType, /^trade\./, `${key}'s event type is dot-namespaced`);

    const rendered = `${template.subject}\n${template.body({ business: "Harbour Edge Joinery" })}`;
    // AC-P2-43/61/64: no percentage, and no figure at all — a bare number is
    // how a percentage gets derived by subtraction.
    assert.ok(!rendered.includes("%"), `${key} must contain no percentage`);
    assert.equal(/\d/.test(rendered), false, `${key} must contain no figure: ${rendered}`);
    // AC-P2-45: no timeframe. Owner ruling Q2 — a promise nobody made.
    for (const timeframe of ["business day", "business days", "within", "hours", "24", "48",
                             "usually", "typically", "shortly", "soon"]) {
      assert.ok(!rendered.toLowerCase().includes(timeframe), `${key} must name no timeframe (${timeframe})`);
    }
    // AC-P2-44: never a word about anyone else's account.
    for (const disclosure of ["another account", "someone else", "already registered",
                              "already verified", "another business"]) {
      assert.ok(!rendered.toLowerCase().includes(disclosure), `${key} must not mention another holder`);
    }
    // Owner ruling 2026-08-19: NO COMPARATIVE. "Trade pricing" is the NAME of
    // the thing, not a deduction from something else, and the possessive line
    // ("the prices you see are already your prices") does the explaining.
    for (const comparative of ["better price", "cheaper", "you save", "discount",
                               "less than", "lower price"]) {
      assert.ok(!rendered.toLowerCase().includes(comparative),
        `${key} must not compare prices (${comparative})`);
    }
    // ...and NO GREETING. `business` is the only body variable, used only where
    // a business name is guaranteed — an account whose holder never typed a
    // name would otherwise have been greeted "Hi ,".
    assert.equal(/^\s*(hi|hello|dear|hey)\b/i.test(template.body({ business: "X" })), false,
      `${key} must not open with a greeting`);
    assert.equal(/\[name\]|\bname\b/i.test(template.body({})), false,
      `${key} must not reference a name at all`);
  }

  // The fallback is rendered AT THE CALL SITE, because notify() only runs
  // applyPlaceholders when a Sanity template exists. A fallback still carrying
  // a literal [business] would ship a bracket to a customer.
  const ack = TRADE_EMAILS.trade_ack.body({ business: "Harbour Edge Joinery" });
  assert.ok(ack.includes("Harbour Edge Joinery"), "the fallback substitutes its own values");
  assert.equal(/\[[a-zA-Z]+\]/.test(ack), false, "and leaves no unresolved placeholder");
  // A missing business name must not leave a dangling bracket either.
  assert.equal(/\[[a-zA-Z]+\]/.test(TRADE_EMAILS.trade_ack.body({})), false);
});

test.after(async () => { if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir); });
