// Pure-logic unit tests — pricing, schedule codes, option groups, and the
// Worker's pure helpers (cookies, tokens, email/auth utils, order transitions,
// approval RBAC, staff allowlist, catalogue normalization). No server needed;
// TS is bundled once with esbuild (same approach as catalogue.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("unit");
const outfile = join(runDir, "unit-bundle.mjs");
await build({
  stdin: {
    contents: `
      export { lineBlocksSubmission, reviewSeverity, severityOf, REVIEW_SEVERITY, suggestCode, hasDuplicateCode, normCode, optionGroupsFor, defaultOptions, fmt, mm, productLabel, acrossMismatch, compositeAcrossFault, missingRequiredOptions, unitMissingRequiredOptions } from ${p("src/data/configurator.ts")};
      export { hydrateQuoteItems } from ${p("src/data/api.ts")};
      export { getProductBySlug, products, getCategories, getFamiliesByCategory, categories } from ${p("src/data/catalogue.ts")};
      export { toCatalogueData, CATALOGUE_QUERY } from ${p("src/data/catalogueQuery.ts")};
      export { parseCookies, newToken, claimCookie, CLAIM_COOKIE } from ${p("worker/lib/util.ts")};
      export { normEmail, isEmail, sixDigit, sha256hex, userDto } from ${p("worker/lib/auth.ts")};
      export { normalizePhone, enquiryReference, validateEnquiry } from ${p("worker/lib/enquiry.ts")};
      export { availableActions, ACTION_LABEL, TRANSITIONS, STAGES, STAGE_LABEL, DEPOSIT_PERCENT } from ${p("worker/lib/orders.ts")};
      export { editedFieldsAfterSave } from ${p("worker/lib/lines.ts")};
      export { pricingOptionSlugsFromOptions } from ${p("worker/lib/estimator/estimate.ts")};
      export { staffDomains, isStaffEmail } from ${p("worker/lib/staff.ts")};
      export { rowStateFor, unitLabel } from ${p("src/components/quote-project/rowState.ts")};
    `,
    resolveDir: projectRoot,
    sourcefile: "unit-entry.ts",
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  sourcemap: "inline", // let c8 map coverage back to the TS sources
});
const M = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
// Keep the sourcemapped bundle when collecting coverage so c8 can remap to TS.
test.after(async () => { if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir); });

// A real, fully-specified window line for pricing.
const slug = "amj80-series-sliding-window";
const fullOptions = { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" };

test("API hydration preserves nested composite segments", () => {
  const segments = [
    { id: "seg-a", productSlug: "amj100t-fixed-window", width: "1750", height: "700", qtyPerParent: 1, qty: 1, lineTotal: 500, options: {}, status: "Ready" },
    { id: "seg-b", productSlug: "amj100t-fixed-window", width: "1750", height: "700", qtyPerParent: 1, qty: 1, lineTotal: 500, options: {}, status: "Ready" },
  ];
  const [item] = M.hydrateQuoteItems([{
    id: "server-w2", code: "W2", productSlug: "amj100t-fixed-window", location: "Kitchen",
    width: "3500", height: "700", options: {}, qty: 1, status: "Ready", lineTotal: 1000,
    origin: "ai", aiPriced: true, review: null, segments,
  }], 9000);

  assert.equal(item.id, 9000);
  assert.equal(item.serverId, "server-w2");
  assert.deepEqual(item.segments, segments, "the API-to-UI boundary must not flatten a composite");
  assert.notEqual(item.segments, segments, "the editable client receives its own segment array");
});

test("exact pricing option IDs are canonical, complete, and exclude technical metadata", () => {
  assert.deepEqual(M.pricingOptionSlugsFromOptions({
    colour: "Dover White",
    flyscreen: true,
    glazing: "Low-E double glazing",
    performanceVariantId: "thermal-low-e",
    pricingOptionSlugs: ["schedule:special"],
  }), ["schedule:special", "colour:dover-white", "flyscreen"]);
});

test("only an explicit customer edit can submit an unpriced AI line for human repricing", () => {
  const base = { productSlug: slug, width: "1200", height: "900", options: fullOptions, qty: 1, origin: "ai", lineTotal: null };
  assert.equal(M.lineBlocksSubmission(base), true);
  assert.equal(M.lineBlocksSubmission({
    ...base,
    review: { customerConfigurationChanged: "AMJ will confirm and price this selection." },
  }), false);
});

// NOTE: the four priceConfigured unit tests that stood here are gone with the
// function. Pricing is no longer a pure browser calculation — it is one D1-backed
// engine — so it is covered end-to-end in api.test.mjs ("one pricing engine…"),
// which exercises the real rate cards, surcharges and modifiers rather than a
// second copy of the formula.

test("suggestCode: W## for windows, D## for doors, continues from highest", () => {
  assert.equal(M.suggestCode([], slug), "W01");
  assert.equal(M.suggestCode([{ code: "W01", productSlug: slug }, { code: "W02", productSlug: slug }], slug), "W03");
  assert.equal(M.suggestCode([{ code: "W05", productSlug: slug }], slug), "W06");
  const doorSlug = M.products.find((x) => x.categorySlug === "doors")?.slug;
  assert.equal(M.suggestCode([], doorSlug), "D01");
});

test("normCode + hasDuplicateCode", () => {
  assert.equal(M.normCode("  w01 "), "W01");
  const items = [{ id: 1, code: "W01" }, { id: 2, code: "w01" }, { id: 3, code: "W02" }];
  assert.equal(M.hasDuplicateCode(items, 1, "W01"), true, "case-insensitive duplicate");
  assert.equal(M.hasDuplicateCode(items, 3, "W02"), false);
  assert.equal(M.hasDuplicateCode(items, 1, ""), false, "empty is never a duplicate");
});

test("optionGroupsFor: injects shared Colorbond palette; standards preselected", () => {
  const product = M.getProductBySlug(slug);
  const groups = M.optionGroupsFor(product);
  const colour = groups.find((g) => g.typeSlug === "colour");
  assert.ok(colour, "colour group injected");
  assert.ok(colour.choices.length >= 20, "full Colorbond palette");
  assert.ok(colour.choices.every((c) => c.add === 0), "all colours included in base price");
  const defaults = M.defaultOptions(product);
  assert.ok(defaults.colour && defaults.hardware, "standards preselected");
});

// REQUIRED is derived from the catalogue, not asserted. A group is the
// customer's to answer only when we cannot answer it — which is the rule that
// stopped a re-parsed line being flagged for a colour and a flyscreen it was
// never asked to choose. Built from synthetic products so this tests the RULE:
// against the fully-specified fallback catalogue every group has a standard, so
// no product there can produce a gap.
const productWith = (opts) => ({
  slug: "probe", name: "Probe", categorySlug: "windows", familySlug: "probe",
  options: opts, thermal: [],
});

test("a group answers itself when the catalogue names a standard", () => {
  const groups = M.optionGroupsFor(productWith([
    { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" },
    { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Fibre", availability: "optional" },
    { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" },
    { typeSlug: "installation", typeName: "Installation", name: "Screw", availability: "optional" },
  ]));
  const g = (t) => groups.find((x) => x.typeSlug === t);
  // Live data for AMJ100T Awning Window, exactly: flyscreen "None" is standard
  // and installation has four options and no standard.
  assert.equal(g("flyscreen").required, false, "a standard means the customer was never asked");
  assert.equal(g("flyscreen").defaultName, "None");
  assert.equal(g("installation").required, true, "no standard IS a real decision");
  // Colour is injected from the shared palette, which carries its own default.
  assert.equal(g("colour").required, false);
});

test("a group with no choices is not an option in the first place", () => {
  // Owner: "if a product does not have a single colour option, then it is not an
  // option in the first place". Requiring it would demand something nothing can
  // satisfy, and no edit could ever clear the line.
  const groups = M.optionGroupsFor(productWith([]));
  for (const g of groups) {
    if (g.choices.length === 0) assert.equal(g.required, false, g.typeSlug);
  }
});

test("across the real catalogue, only a group with no standard is ever demanded", () => {
  // The invariant, checked against every shipped product rather than asserted
  // about the data: a group we can answer is never the customer's to answer.
  //
  // This does NOT claim the catalogue is complete — it is not.
  // amj80-series-casement-window offers flyscreens and marks none of them
  // standard, so that product genuinely asks for one. That is the rule working:
  // a real gap in the data surfacing as a real question.
  const demandedWithAStandard = [];
  for (const pr of M.products) {
    const groups = M.optionGroupsFor(pr);
    for (const g of groups) {
      const hasStandard = g.choices.some((c) => c.standard);
      assert.equal(g.required, g.choices.length > 0 && !hasStandard, `${pr.slug}/${g.typeSlug}`);
    }
    for (const label of M.missingRequiredOptions({ productSlug: pr.slug, options: {} })) {
      const g = groups.find((x) => x.label === label);
      if (g?.choices.some((c) => c.standard)) demandedWithAStandard.push(`${pr.slug}/${label}`);
    }
  }
  assert.deepEqual(demandedWithAStandard, [],
    "a group with a standard must never be demanded — that was the W6 report");
});

test("formatting helpers: fmt, mm, productLabel", () => {
  assert.equal(M.fmt(1020), "$1,020");
  assert.equal(M.fmt(0), "$0");
  assert.equal(M.mm("1200"), "1,200 mm");
  assert.equal(M.mm(""), "—");
  assert.equal(M.mm(0), "—");
  assert.equal(M.productLabel(slug), M.getProductBySlug(slug).name);
  assert.equal(M.productLabel("nope"), "Product");
});

test("util.parseCookies: pairs, decoding, malformed and empty", () => {
  assert.deepEqual(M.parseCookies("a=1; b=2"), { a: "1", b: "2" });
  assert.deepEqual(M.parseCookies(""), {});
  assert.deepEqual(M.parseCookies(null), {});
  assert.deepEqual(M.parseCookies("x=%20y"), { x: " y" });
  assert.deepEqual(M.parseCookies("novalue; c=3"), { c: "3" });
});

test("util.newToken: 64 hex chars, unique", () => {
  const a = M.newToken(), b = M.newToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test("util.claimCookie: httpOnly SameSite Max-Age; Secure only in production", () => {
  const dev = M.claimCookie("tok", { APP_ENV: "development" });
  assert.ok(dev.startsWith(`${M.CLAIM_COOKIE}=tok`));
  assert.match(dev, /HttpOnly/);
  assert.match(dev, /SameSite=Lax/);
  assert.match(dev, /Max-Age=\d+/);
  assert.doesNotMatch(dev, /Secure/);
  assert.match(M.claimCookie("tok", { APP_ENV: "production" }), /Secure/);
});

test("auth: normEmail, isEmail, sixDigit, sha256hex, userDto", async () => {
  assert.equal(M.normEmail("  Jason@Example.com "), "jason@example.com");
  for (const ok of ["a@b.co", "x.y@z.com.au"]) assert.equal(M.isEmail(ok), true, ok);
  for (const bad of ["a@b", "no-at.com", "a b@c.com", "@b.com", ""]) assert.equal(M.isEmail(bad), false, bad);
  assert.match(M.sixDigit(), /^\d{6}$/);
  assert.equal(await M.sha256hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.deepEqual(M.userDto({ id: "u1", email: "e@x.com", name: "N", phone: null, company: "Acme", abn: "12345678901", price_gst_mode: "ex", type: "internal", role: "admin", created_at: "2026-01-02 03:04:05", session_epoch: 0 }),
    { id: "u1", email: "e@x.com", name: "N", phone: null, company: "Acme", abn: "12345678901", priceGstMode: "ex", type: "internal", role: "admin", createdAt: "2026-01-02 03:04:05" });
  // Unset / legacy rows default to inc-GST display.
  assert.equal(M.userDto({ id: "u2", email: "e2@x.com", name: null, phone: null, company: null, abn: null, price_gst_mode: null, type: "customer", role: null, created_at: null, session_epoch: 0 }).priceGstMode, "inc");
});

test("orders.availableActions: correct staff options per stage", () => {
  assert.deepEqual(M.availableActions({ stage: "deposit_invoiced" }).map((a) => a.action), ["pay:deposit"]);
  assert.deepEqual(M.availableActions({ stage: "deposit_paid" }).map((a) => a.action), ["issue-drawings"]);
  assert.deepEqual(M.availableActions({ stage: "balance_invoiced" }).map((a) => a.action), ["pay:balance"]);
  assert.deepEqual(M.availableActions({ stage: "manufacturing" }).map((a) => a.action), ["share-qa"]);
  assert.deepEqual(M.availableActions({ stage: "delivered" }).map((a) => a.action), ["close"]);
  assert.deepEqual(M.availableActions({ stage: "after_sales" }).map((a) => a.action), []);
});

test("orders: TRANSITIONS graph + STAGES/labels integrity", () => {
  assert.equal(M.STAGES.length, 12);
  assert.equal(M.DEPOSIT_PERCENT, 50);
  for (const s of M.STAGES) assert.ok(M.STAGE_LABEL[s], `label for ${s}`);
  for (const [name, t] of Object.entries(M.TRANSITIONS)) {
    assert.ok(M.STAGES.includes(t.from), `${name}.from`);
    assert.ok(M.STAGES.includes(t.to), `${name}.to`);
    assert.ok(["customer", "staff"].includes(t.side), `${name}.side`);
    assert.ok(M.ACTION_LABEL[name], `label for ${name}`);
  }
  assert.ok(M.ACTION_LABEL["pay:deposit"] && M.ACTION_LABEL["pay:balance"]);
});

// canApprove is gone with the approval engine (0033): access is flat, and there
// is no approval step for a role to gate.

test("staff.staffDomains + isStaffEmail allowlist", () => {
  assert.deepEqual(M.staffDomains({}), ["openframe.com.au"]);
  assert.deepEqual(M.staffDomains({ STAFF_EMAIL_DOMAINS: "a.com, B.COM " }), ["a.com", "b.com"]);
  const env = {};
  assert.equal(M.isStaffEmail(env, "sam@openframe.com.au"), true);
  assert.equal(M.isStaffEmail(env, "SAM@openframe.com.au".toLowerCase()), true);
  assert.equal(M.isStaffEmail(env, "sam@gmail.com"), false);
  assert.equal(M.isStaffEmail(env, "no-domain"), false);
});

test("catalogueQuery.toCatalogueData: full null coercion + colour mapping", () => {
  const out = M.toCatalogueData({
    categories: null, families: undefined,
    products: [{ id: "x", slug: "x" }],
    colours: [{ name: "C", availability: null }],
  });
  const prod = out.products[0];
  assert.equal(prod.name, "");
  assert.deepEqual(prod.gallery, []);
  assert.deepEqual(prod.keySpecs, []);
  assert.equal(prod.featuredOrder, 0);
  assert.equal(prod.minWidth, null);
  assert.deepEqual(out.categories, []);
  assert.equal(out.colours[0].typeSlug, "colour");
  assert.equal(out.colours[0].availability, "optional");
});

test("enquiry: phone normalise, reference, branch validation", () => {
  assert.equal(M.normalizePhone("+61 431 234 567"), "0431234567");
  assert.equal(M.normalizePhone("(03) 9000 0000"), "0390000000");
  assert.equal(M.normalizePhone("61390000000"), "0390000000");
  assert.equal(M.normalizePhone(""), "");
  assert.equal(M.enquiryReference(2026, 1023), "OF-ENQ-2026-001023");

  const okQ = { intent: "question", name: "A", email: "a@b.co", privacyConsent: true, message: "hi" };
  assert.deepEqual(M.validateEnquiry(okQ, false), []);
  assert.ok(M.validateEnquiry({ ...okQ, message: "" }, false).includes("message"));
  assert.ok(M.validateEnquiry({ ...okQ, email: "" }, false).includes("email"), "questions require an email");
  assert.ok(M.validateEnquiry({ ...okQ, privacyConsent: false }, false).includes("consent"));

  const okA = { intent: "appointment_request", name: "A", email: "a@b.co", privacyConsent: true, locationId: "loc_x", phone: "0400000000", bestTimeToCall: "anytime" };
  assert.deepEqual(M.validateEnquiry(okA, true), []);
  assert.ok(M.validateEnquiry(okA, false).includes("location"), "inactive location rejected");
  assert.ok(M.validateEnquiry({ ...okA, phone: "" }, true).includes("phone"), "phone required for appointments");
  // Appointments are phone-first: email is OPTIONAL, best time is optional…
  assert.deepEqual(M.validateEnquiry({ ...okA, email: "" }, true), [], "appointment valid without email");
  assert.deepEqual(M.validateEnquiry({ ...okA, bestTimeToCall: "" }, true), [], "best time optional");
  // …but a provided email must still be valid.
  assert.ok(M.validateEnquiry({ ...okA, email: "not-an-email" }, true).includes("email"), "invalid email rejected even when optional");
});

test("catalogueQuery.toCatalogueData: showroom locations normalise", () => {
  const out = M.toCatalogueData({
    locations: [
      { id: "loc_a", stateCode: "VIC", suburb: "Rowville", lat: -37.9, lng: 145.2 },
      { id: null }, // dropped: no id
    ],
  });
  assert.equal(out.locations.length, 1);
  const l = out.locations[0];
  assert.equal(l.displayName, "Rowville, VIC", "displayName derived when blank");
  assert.equal(l.appointmentAvailable, true, "defaults true");
  assert.equal(l.status, "active", "defaults active");
  assert.equal(l.historicalAliases, undefined);
});

// ── Human-edit provenance (0019, multi-file UX spec §1b) ─────────────────────
test("editedFieldsAfterSave: an unchanged autosave round-trip marks NOTHING as edited", () => {
  const incoming = { product_slug: "amj80-series-awning-window", options_json: JSON.stringify({ colour: "black" }), dims_json: JSON.stringify({ width: "900", height: "1200" }), qty: 2 };
  const stored = { product_slug: incoming.product_slug, options_json: '{"colour":"black"}', dims_json: '{"height":"1200","width":"900"}', qty: 2, edited_fields: null };
  // Note the stored JSON has DIFFERENT key order — must still compare equal.
  assert.equal(M.editedFieldsAfterSave(stored, incoming), null, "key-order differences never false-flag an edit");
});

test("editedFieldsAfterSave: numeric AI dims and string customer dims are the SAME dimension", () => {
  // The bug this pins: proposal.ts wrote widthMm/heightMm straight into
  // dims_json as NUMBERS while every customer save writes STRINGS. A
  // type-sensitive compare called that an edit on the first autosave after a
  // proposal, and for an ai-managed line "edited" is the branch that nulls
  // line_total and sends it to technical review — so opening an AI-quoted
  // project silently wiped every price on it. 19 lines in production.
  const incoming = { product_slug: "amj100t-awning-window", options_json: "{}", dims_json: JSON.stringify({ width: "2050", height: "2100" }), qty: 1 };
  const stored = { product_slug: incoming.product_slug, options_json: "{}", dims_json: '{"width":2050,"height":2100}', qty: 1, edited_fields: null };
  assert.equal(M.editedFieldsAfterSave(stored, incoming), null, "2050 and \"2050\" are one dimension, not an edit");

  // …and a genuine change is still caught across the same type boundary.
  const moved = { ...incoming, dims_json: JSON.stringify({ width: "2060", height: "2100" }) };
  assert.deepEqual(JSON.parse(M.editedFieldsAfterSave(stored, moved)), ["dims_json"]);
});

test("editedFieldsAfterSave: a real change flags exactly its field group and unions with prior edits", () => {
  const incoming = { product_slug: "amj80-series-awning-window", options_json: JSON.stringify({ colour: "black" }), dims_json: JSON.stringify({ width: "950", height: "1200" }), qty: 2 };
  const stored = { product_slug: incoming.product_slug, options_json: '{"colour":"black"}', dims_json: '{"width":"900","height":"1200"}', qty: 2, edited_fields: '["qty"]' };
  const out = JSON.parse(M.editedFieldsAfterSave(stored, incoming));
  assert.deepEqual(out.sort(), ["dims_json", "qty"].sort(), "width change adds dims_json; prior qty edit survives");
});

// ── Review severity: the ONE registry that decides what blocks ────────────────
test("severity registry: only critical missing input is an error; mismatches are warnings", () => {
  for (const k of ["dims", "qty", "options", "product"]) {
    assert.equal(M.severityOf(k), "error", `${k} must block`);
  }
  for (const k of ["fit", "substitute", "material", "glazing", "thermalRecommendation", "noLongerInDocuments"]) {
    assert.equal(M.severityOf(k), "warning", `${k} must not block`);
  }
  // An UNRECOGNISED key must never silently block every customer's submission.
  assert.equal(M.severityOf("some_future_key"), "warning");
});

test("reviewSeverity: error outranks warning; empty/absent is null", () => {
  assert.equal(M.reviewSeverity(null), null);
  assert.equal(M.reviewSeverity({}), null);
  assert.equal(M.reviewSeverity({ fit: "composite" }), "warning");
  assert.equal(M.reviewSeverity({ dims: "unreadable" }), "error");
  assert.equal(M.reviewSeverity({ fit: "composite", dims: "unreadable" }), "error", "error wins");
});

test("lineBlocksSubmission derives from severity: errors block, warnings never do", () => {
  const priceable = {
    productSlug: "amj80-series-sliding-window", width: "1200", height: "900",
    options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
    qty: 1,
  };
  // A fully priced line with a WARNING stays submittable.
  assert.equal(M.lineBlocksSubmission({ ...priceable, review: { fit: "composite" } }), false);
  // The same line with an ERROR blocks, even though it prices.
  assert.equal(M.lineBlocksSubmission({ ...priceable, review: { qty: "unreadable" } }), true);
  // Unpriceable with no explanation blocks; unpriceable WITH a warning does not.
  const unpriceable = { ...priceable, productSlug: "" };
  assert.equal(M.lineBlocksSubmission(unpriceable), true);
  assert.equal(M.lineBlocksSubmission({ ...unpriceable, review: { fit: "composite" } }), false);
  // AI lines: an error blocks regardless of price.
  assert.equal(M.lineBlocksSubmission({ ...priceable, origin: "ai", lineTotal: 900, review: { dims: "unreadable" } }), true);
  assert.equal(M.lineBlocksSubmission({ ...priceable, origin: "ai", lineTotal: null, review: { customerConfigurationChanged: "edited" } }), false);
});

// ── Composite reconciliation: the units must add up to the opening ────────────
const composite = (over, delta) => ({
  id: 1, code: "W1", productSlug: "amj80-series-awning-window", location: "",
  width: "2050", height: "2100", options: {}, qty: 1, status: "Ready",
  lineTotal: 1200, review: null, compositeAxis: "vertical",
  coverageDeltaMm: delta, coverageOutOfTolerance: over,
  segments: [
    { id: "s1", productSlug: "amj80-series-awning-window", width: "1025", height: "2100", qtyPerParent: 1, qty: 1, lineTotal: 600, options: fullOptions, status: "Ready" },
    { id: "s2", productSlug: "amj80-series-awning-window", width: "1025", height: "2100", qtyPerParent: 1, qty: 1, lineTotal: 600, options: fullOptions, status: "Ready" },
  ],
});

test("rowStateFor: a composite whose units add up is an ATTRIBUTE, not a warning", () => {
  const state = M.rowStateFor(composite(false, 0), []);
  assert.equal(state.kind, "composite", "a well-formed split must never badge");
  assert.equal(state.units, 2);
});

test("rowStateFor: units that no longer sum to the opening ask for confirmation", () => {
  // The reconciliation the owner cares about: the dimensions set or parsed
  // initially, against the sum of the children. Manual splitting and adding or
  // removing units can break it, and until now nothing said so.
  const state = M.rowStateFor(composite(true, -180), []);
  assert.equal(state.kind, "confirm-layout");
  assert.equal(state.deltaMm, -180, "the shortfall is carried, so the panel can state it");
});

test("rowStateFor: a blocked composite is a BLOCKER first — the only state it can act on", () => {
  const item = { ...composite(true, -180), lineTotal: null };
  assert.equal(M.rowStateFor(item, []).kind, "needs-input");
});

// The owner's own test case, end to end. W1 2050x2100 split into 700 and 1350,
// both 2100 high. Correct the opening to 2060x2110 — a parsing correction — and
// three things must agree that were three separate readings of the same numbers:
// the units say so, the OPENING says so (it is all that is visible when the
// group is collapsed), and the sticky bar stops calling the project ready.
const w1 = (openingW, openingH) => ({
  id: 9, code: "W1", productSlug: "amj80-series-awning-window", location: "",
  width: String(openingW), height: String(openingH), options: {}, qty: 1, status: "Ready",
  lineTotal: 1200, review: null, compositeAxis: "vertical",
  coverageDeltaMm: 2050 - openingW, coverageOutOfTolerance: false,
  segments: [
    { id: "a", productSlug: "amj80-series-awning-window", width: "700", height: "2100", qtyPerParent: 1, qty: 1, lineTotal: 500, options: fullOptions, status: "Ready" },
    { id: "b", productSlug: "amj80-series-awning-window", width: "1350", height: "2100", qtyPerParent: 1, qty: 1, lineTotal: 700, options: fullOptions, status: "Ready" },
  ],
});

test("a unit that is the wrong height for its opening flags the OPENING too", () => {
  const ok = w1(2050, 2100);
  assert.equal(M.compositeAcrossFault(ok), false, "a well-formed split never flags");
  assert.equal(M.lineBlocksSubmission(ok), false);
  assert.equal(M.rowStateFor(ok, []).kind, "composite");

  // The correction: the opening grows, the units do not follow.
  const bad = w1(2060, 2110);
  assert.equal(M.acrossMismatch("2110", "2100"), true, "the unit rows' own test");
  assert.equal(M.compositeAcrossFault(bad), true, "and the opening's");
  assert.equal(M.lineBlocksSubmission(bad), true, "and the sticky bar's");
  const state = M.rowStateFor(bad, []);
  assert.equal(state.kind, "needs-input", "the parent is red, not merely its children");
  assert.equal(state.reason, "A unit is a different height to this opening");
  // The CHIP matches what the unit one row below says. It was hardcoded
  // "Incomplete", so one fault read as two different words depending on which
  // row you looked at — and the opening is not incomplete, it is inconsistent.
  assert.equal(state.label, "Check sizes");
});

test("across is measured on the axis the split runs along", () => {
  // Horizontal split: the units stack, so they must match the opening's WIDTH.
  const horiz = { ...w1(2050, 2100), compositeAxis: "horizontal" };
  assert.equal(M.compositeAcrossFault(horiz), true, "700 wide in a 2050 opening");
  assert.equal(M.rowStateFor(horiz, []).reason, "A unit is a different width to this opening");
});

test("an unsized unit is incomplete, never a mismatch — zero means unknown", () => {
  const partial = w1(2060, 2110);
  partial.segments = [{ ...partial.segments[0], height: "" }, partial.segments[1]];
  assert.equal(M.acrossMismatch("2110", ""), false);
  // The SECOND unit still mismatches, so the opening is still flagged.
  assert.equal(M.compositeAcrossFault(partial), true);
  partial.segments = [{ ...partial.segments[0], height: "" }];
  assert.equal(M.compositeAcrossFault(partial), false, "nothing measurable, nothing asserted");
});

// ── A required option with nothing chosen ─────────────────────────────────────
// W3 arrived with no colour: the product's colour group is required but nothing
// in the catalogue supplied a default. It PRICES cleanly — an unchosen option
// contributes no surcharge — so priced-ness waved it through, the editor showed
// an amber line and saved anyway, the list row said nothing, and the bar counted
// the project ready. Three readings of one fact again.
const GAP_SLUG = "amj80-series-casement-window";   // offers flyscreens, marks none standard
const noFlyscreen = () => ({
  id: 3, code: "W3", productSlug: GAP_SLUG, location: "",
  width: "1200", height: "900", qty: 1, status: "Ready", lineTotal: 800, review: null,
  options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", installation: "Sub Sill & Head" },
});

test("a required option with nothing chosen blocks, and the row names it", () => {
  const bad = noFlyscreen();
  assert.deepEqual(M.missingRequiredOptions(bad), ["Flyscreen"]);
  assert.equal(M.lineBlocksSubmission(bad), true, "it must reach the sticky bar");
  const state = M.rowStateFor(bad, []);
  assert.equal(state.kind, "needs-input");
  assert.equal(state.reason, "Choose flyscreen", "the row names the option, not the fact that one is missing");
  assert.equal(state.label, "Incomplete", "a missing choice IS incompleteness");

  const good = { ...bad, options: { ...bad.options, flyscreen: "None" } };
  assert.deepEqual(M.missingRequiredOptions(good), []);
  assert.equal(M.lineBlocksSubmission(good), false);
  assert.equal(M.rowStateFor(good, []).kind, "none");
});

test("a UNIT with an unchosen required option blocks through its opening", () => {
  // A unit IS an item (owner): a real frame that gets made and delivered, which
  // shares an opening with its siblings instead of having one to itself. So a
  // gap here is exactly as blocking as one on a childless opening — and it was
  // invisible, because a unit prices cleanly without its colour and nothing
  // walked into the segments to look.
  const seg = (options) => ({ id: "s", productSlug: GAP_SLUG, width: "1025", height: "2100", qtyPerParent: 1, qty: 1, lineTotal: 600, options, status: "Ready" });
  const parent = (segs) => ({
    id: 7, code: "W7", productSlug: slug, location: "", width: "2050", height: "2100",
    options: {}, qty: 1, status: "Ready", lineTotal: 1200, review: null,
    compositeAxis: "vertical", coverageDeltaMm: 0, coverageOutOfTolerance: false, segments: segs,
  });

  const clean = parent([seg(fullOptions), seg(fullOptions)]);
  assert.deepEqual(M.missingRequiredOptions(clean), [], "units carrying their options never flag");
  assert.equal(M.lineBlocksSubmission(clean), false);
  assert.equal(M.rowStateFor(clean, []).kind, "composite");

  // The parent itself has options:{} in both cases — it is never asked, because
  // a composite parent is not a frame and holds none of its own.
  const gap = { ...fullOptions };
  delete gap.flyscreen;
  const bad = parent([seg(fullOptions), seg(gap)]);
  assert.deepEqual(M.missingRequiredOptions(bad), ["Flyscreen"], "the OPENING carries its unit’s gap");
  assert.equal(M.lineBlocksSubmission(bad), true, "and it reaches the bar");
  assert.equal(M.rowStateFor(bad, []).reason, "Choose flyscreen");
  // The unit says which one.
  assert.deepEqual(M.unitMissingRequiredOptions(seg(gap)), ["Flyscreen"]);
  assert.deepEqual(M.unitMissingRequiredOptions(seg(fullOptions)), []);
});

test("an unknown product asserts nothing", () => {
  // A product the catalogue does not know has no groups to be missing. The
  // no-product case is already blocked by its own branch.
  assert.deepEqual(M.missingRequiredOptions({ productSlug: "nope", options: {} }), []);
  // No shipped product currently has TWO groups without a standard, so the
  // multi-gap sentence is exercised through the synthetic product above rather
  // than asserted against data that would silently stop covering it.
});

test("unitLabel: children are W1A, W1B … and spreadsheet-style past Z", () => {
  assert.equal(M.unitLabel("W1", 0), "W1A");
  assert.equal(M.unitLabel("W1", 1), "W1B");
  assert.equal(M.unitLabel("W1", 26), "W1AA");
  assert.equal(M.unitLabel("", 0), "Unit 1", "an untagged opening still labels its units");
});

// ── Category order is ops-managed, and Windows comes first ───────────────────
// Alphabetical put Doors ahead of Windows everywhere the catalogue is grouped —
// the two-field product picker most visibly, where a builder adding a window
// scrolled past every door first (owner). Sanity now carries a display order.
test("toCatalogueData orders categories by the ops-set order, then by name", () => {
  const raw = {
    categories: [
      { id: "d", slug: "doors", name: "Doors", order: 2, shortDescription: "", description: "" },
      { id: "w", slug: "windows", name: "Windows", order: 1, shortDescription: "", description: "" },
    ],
    families: [], products: [], colours: [], pages: [],
  };
  assert.deepEqual(M.toCatalogueData(raw).categories.map((c) => c.name), ["Windows", "Doors"]);

  // An unordered category sorts AFTER every ordered one — never to the front —
  // and alphabetically among its own kind. A new category someone forgets to
  // order must not silently displace Windows.
  const withNew = {
    ...raw,
    categories: [
      { id: "z", slug: "louvres", name: "Louvres", shortDescription: "", description: "" },
      ...raw.categories,
      { id: "a", slug: "awnings", name: "Awnings", shortDescription: "", description: "" },
    ],
  };
  assert.deepEqual(M.toCatalogueData(withNew).categories.map((c) => c.name),
    ["Windows", "Doors", "Awnings", "Louvres"]);
});

test("the catalogue query asks Sanity for that same order", () => {
  // Belt and braces: the client sorts too, but a query that stops projecting
  // `order` would make every category tie at 999 and quietly revert to
  // alphabetical on the server side.
  assert.match(M.CATALOGUE_QUERY, /order\(coalesce\(order, 999\) asc, name asc\)/);
  assert.match(M.CATALOGUE_QUERY, /"categories"[\s\S]{0,400}?\border\b/);
});

test("the built-in fallback catalogue is already Windows-first", () => {
  // A browser that never reaches Sanity still gets the intended order.
  assert.deepEqual(M.categories.map((c) => c.name), ["Windows", "Doors"]);
  assert.equal(M.categories[0].order, 1);
});
