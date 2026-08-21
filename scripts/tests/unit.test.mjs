// Pure-logic unit tests — pricing, schedule codes, option groups, and the
// Worker's pure helpers (cookies, tokens, email/auth utils, order transitions,
// approval RBAC, staff allowlist, catalogue normalization). No server needed;
// TS is bundled once with esbuild (same approach as catalogue.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("unit");
const outfile = join(runDir, "unit-bundle.mjs");
await build({
  stdin: {
    contents: `
      export { lineBlocksSubmission, reviewSeverity, severityOf, REVIEW_SEVERITY, suggestCode, hasDuplicateCode, normCode, optionGroupsFor, defaultOptions, fmt, mm, productLabel, acrossMismatch, compositeAcrossFault, missingRequiredOptions, unitMissingRequiredOptions, productColours } from ${p("src/data/configurator.ts")};
      export { hydrateQuoteItems } from ${p("src/data/api.ts")};
      export { quoteSummary } from ${p("src/data/quoteSummary.ts")};
      export { taxBreakdown, gstAdjust } from ${p("src/data/gst.ts")};
      export { getProductBySlug, products, getCategories, getFamiliesByCategory, categories, colorbondColourOptions, hydrateCatalogue, optionTypeOrder } from ${p("src/data/catalogue.ts")};
      export { toCatalogueData, CATALOGUE_QUERY } from ${p("src/data/catalogueQuery.ts")};
      export { parseCookies, newToken, claimCookie, CLAIM_COOKIE } from ${p("worker/lib/util.ts")};
      export { normEmail, isEmail, sixDigit, sha256hex, userDto } from ${p("worker/lib/auth.ts")};
      export { normalizePhone, enquiryReference, validateEnquiry } from ${p("worker/lib/enquiry.ts")};
      export { isValidAuPhone, normalizePhone as normalizePhoneShared } from ${p("src/data/phone.ts")};
      export { abnValid, normalizeAbn, formatAbn } from ${p("src/data/abn.ts")};
      export { abnValid as abnValidViaReferrals } from ${p("worker/lib/referrals.ts")};
      export { normalizeBusinessName, businessNameCandidates, nameMatches, emailDomainPlausible, FREE_MAIL_DOMAINS } from ${p("worker/lib/trade-match.ts")};
      export { AU_STATES, DETAIL_LIMITS, detailsPatchProblems, submitMissing } from ${p("src/data/accountDetails.ts")};
      export { availableActions, ACTION_LABEL, TRANSITIONS, STAGES, STAGE_LABEL, DEPOSIT_PERCENT, depositOf, balanceOf } from ${p("worker/lib/orders.ts")};
      export { editedFieldsAfterSave } from ${p("worker/lib/lines.ts")};
      export { pricingOptionSlugsFromOptions } from ${p("worker/lib/estimator/estimate.ts")};
      export { staffDomains, isStaffEmail } from ${p("worker/lib/staff.ts")};
      export { rowStateFor, unitLabel } from ${p("src/components/quote-project/rowState.ts")};
      export { normalisePostcode, sumOpeningAreaM2, zoneIsPriced, resolveZone, deliveryCost } from ${p("worker/lib/delivery.ts")};
      export { ISSUABLE_FROM, ISSUE_BLOCKING_LINE_STATUSES, issuableNow } from ${p("worker/lib/issue.ts")};
      export { OPS2_BASE, isUnderOps2, ops2RouterBase, withBase } from ${p("src/data/ops2Routing.ts")};
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

test("colour is PRODUCT-AWARE: its own range when it names one, the palette when it does not", () => {
  // Owner: a product that configures no colours may be made in any of them; a
  // product that configures some may be made in THOSE only. Colour used to be
  // global by construction — every product's own entries were discarded and the
  // shared palette spliced in, so the question could not even be asked.
  const product = M.getProductBySlug(slug);
  const own = product.options.filter((o) => o.typeSlug === "colour");
  assert.ok(own.length > 0, "this fixture names its own range");
  assert.deepEqual(M.productColours(product).map((o) => o.name), own.map((o) => o.name),
    "its own range, not the palette");
  const colour = M.optionGroupsFor(product).find((g) => g.typeSlug === "colour");
  assert.equal(colour.choices.length, own.length, "the picker offers exactly what is configured");

  // Configuring none falls back to every colour there is.
  const bare = { ...product, options: product.options.filter((o) => o.typeSlug !== "colour") };
  assert.deepEqual(M.productColours(bare).map((o) => o.name),
    M.colorbondColourOptions.map((o) => o.name), "the full palette is the fallback");
  assert.ok(M.colorbondColourOptions.length >= 20);

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

test("option groups sort by optionTypeOrder, replacing the old hardcoded TYPE_ORDER", () => {
  const product = productWith([
    { typeSlug: "hardware", typeName: "Hardware", name: "H", availability: "standard" },
    { typeSlug: "flyscreen", typeName: "Flyscreen", name: "F", availability: "standard" },
    { typeSlug: "installation", typeName: "Installation", name: "I", availability: "standard" },
  ]);
  // Default (built-in fallback) order — colour, hardware, flyscreen,
  // installation, same sequence the retired TYPE_ORDER constant held.
  assert.deepEqual(M.optionGroupsFor(product).map((g) => g.typeSlug),
    ["colour", "hardware", "flyscreen", "installation"]);

  try {
    // Ops reorders in Studio: Installation now leads, Colour falls to last —
    // and an unranked type (flyscreen, left out here) sorts after every
    // ranked one, then alphabetically among its own kind.
    M.hydrateCatalogue({ optionTypeOrder: { installation: "a000", hardware: "a001", colour: "a002" } });
    assert.deepEqual(M.optionGroupsFor(product).map((g) => g.typeSlug),
      ["installation", "hardware", "colour", "flyscreen"]);
  } finally {
    // Restore — this module-level state leaks across tests otherwise.
    M.hydrateCatalogue({ optionTypeOrder: { colour: "a000", hardware: "a001", flyscreen: "a002", installation: "a003" } });
  }
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
    {
      id: "u1", email: "e@x.com", name: "N", phone: null, company: "Acme", abn: "12345678901", priceGstMode: "ex",
      // The account address (migration 0053) — served only on customer surfaces,
      // to the account owner. Null-safe, so a pre-0053 row reads as absent
      // rather than undefined.
      addressLine1: null, addressLine2: null, addressSuburb: null, addressState: null, addressPostcode: null,
      type: "internal", role: "admin", createdAt: "2026-01-02 03:04:05",
    });
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

// T-A27 — there is one deposit percentage in this codebase and it is 50 (0043
// deleted pricing_policy.deposit_percent; this is what every reader now uses).
test("T-A27: there is one deposit percentage in this codebase and it is 50", () => {
  assert.equal(M.DEPOSIT_PERCENT, 50);
});

// T-A28 — deposit and balance are computed once, over goods plus delivery.
// `delivery` is 0 in every call site until C8 wires a real figure through, but
// the function already takes it as its own argument rather than a pre-summed
// total, which is the shape D10 actually describes.
test("T-A28: deposit and balance are computed once, over goods plus delivery", () => {
  assert.equal(M.depositOf(10000, 640), 5320);
  assert.equal(M.balanceOf(10000, 640), 5320);
  assert.equal(M.depositOf(10000, 0), 5000);
  assert.equal(M.depositOf(10000), 5000); // delivery defaults to 0
});

// T-A29 — deposit and balance add up to the total, to the cent, for every
// (goods, delivery) pair on the $10 grid (the grid every line total and every
// delivery charge — T-A7 — is already on).
test("T-A29: deposit and balance add up to the total, to the cent", () => {
  for (let goods = 0; goods <= 20000; goods += 730) {
    for (let delivery = 0; delivery <= 900; delivery += 170) {
      const total = Math.round(goods / 10) * 10 + Math.round(delivery / 10) * 10;
      const g = Math.round(goods / 10) * 10, d = Math.round(delivery / 10) * 10;
      assert.equal(M.depositOf(g, d) + M.balanceOf(g, d), total);
    }
  }
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
  assert.equal(prod.orderRank, undefined);
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

// ── Category order is a drag-and-drop rank, and Windows comes first ──────────
// Alphabetical put Doors ahead of Windows everywhere the catalogue is grouped —
// the two-field product picker most visibly, where a builder adding a window
// scrolled past every door first (owner). Sanity now carries orderRank, the
// @sanity/orderable-document-list rank Studio's "Categories" list writes (see
// sanity.config.ts) — it replaced the hand-typed `order` field, which is kept
// only as a fallback for a category that predates the migration.
test("toCatalogueData orders categories by orderRank, then name", () => {
  const raw = {
    categories: [
      { id: "d", slug: "doors", name: "Doors", orderRank: "a1", shortDescription: "", description: "" },
      { id: "w", slug: "windows", name: "Windows", orderRank: "a0", shortDescription: "", description: "" },
    ],
    families: [], products: [], colours: [], pages: [],
  };
  assert.deepEqual(M.toCatalogueData(raw).categories.map((c) => c.name), ["Windows", "Doors"]);

  // A category with no orderRank yet (never dragged, or a stale cached
  // payload) sorts AFTER every ranked category — never in front of
  // Windows/Doors — and falls back to alphabetical among its own kind. A new
  // category someone forgets to rank must not silently displace Windows. The
  // legacy hand-typed `order` field this used to also fall back to is gone —
  // every category and the built-in fallback catalogue already carry a rank.
  const withUnranked = {
    ...raw,
    categories: [
      { id: "z", slug: "louvres", name: "Louvres", shortDescription: "", description: "" },
      ...raw.categories,
      { id: "a", slug: "awnings", name: "Awnings", shortDescription: "", description: "" },
    ],
  };
  assert.deepEqual(M.toCatalogueData(withUnranked).categories.map((c) => c.name),
    ["Windows", "Doors", "Awnings", "Louvres"]);
});

test("the catalogue query asks Sanity for that same order", () => {
  // Belt and braces: the client sorts too, but a query that stops ordering by
  // orderRank would make every category tie and quietly revert to whatever
  // order the server happens to return.
  assert.match(M.CATALOGUE_QUERY, /"categories":\s*\*\[_type=="category"\]\|order\(orderRank asc\)/);
});

// ── GST display preference + rounding rule (owner spec, 2026-08-14) ─────────
// Stored money is GST-INCLUSIVE. An account may read it ex-GST, but the GST
// figure, the grand total and anything the customer pays never move.
//
// The rule is the ATO TAXABLE SUPPLY rule at LINE granularity: GST on each
// supply, rounded, then summed. The alternative (1/11 of the invoice total) is
// equally legal and gives 2033.64 on these numbers — the requirement is to pick
// one and never mix them, which is what these tests hold.
const OFQ = { lineTotalsInc: [14370], deliveryInc: 8000, totalInc: 22370 };

test("taxBreakdown: GST is the SAME figure in ex and inc mode — one sale, one GST", () => {
  // The regression this exists for: the first version used the taxable-supply
  // rule for ex and the total-invoice rule for inc, so the same quote reported
  // 2033.63 or 2033.64 depending on a DISPLAY PREFERENCE.
  const ex = M.taxBreakdown("ex", OFQ);
  const inc = M.taxBreakdown("inc", OFQ);
  assert.equal(ex.gst, inc.gst, "a display preference cannot change the tax on a sale");
  assert.equal(ex.gst, 2033.63, "taxable supply rule: 1306.36 on goods + 727.27 on freight");
  assert.equal(ex.totalInc, inc.totalInc);
});

test("taxBreakdown: ex-GST shows every row net, and the column sums to the total", () => {
  const t = M.taxBreakdown("ex", OFQ);
  assert.equal(t.goods, 13063.64);
  assert.equal(t.delivery, 7272.73);
  assert.equal(t.gstLabel, "GST 10%");
  assert.equal(t.suffix, "ex GST");
  assert.equal(Math.round((t.goods + t.delivery + t.gst) * 100) / 100, 22370,
    "a customer adding the visible column must land on the contractual total");
});

test("taxBreakdown: inc-GST shows every row gross and states the GST contained", () => {
  const t = M.taxBreakdown("inc", OFQ);
  assert.equal(t.goods, 14370);
  assert.equal(t.delivery, 8000);
  assert.equal(t.gstLabel, "Includes GST of", "ATO wording — not added, already there");
  assert.equal(t.suffix, "inc GST");
});

test("taxBreakdown: GST is worked out PER LINE, not on the pre-summed goods", () => {
  // Two 5c lines: per line each nets to 0.05 (0.0454 rounds up), so goods ex is
  // 0.10 and the GST on them is 0. Rounding the 0.10 aggregate instead gives
  // 0.09 and a cent of GST — a different, also-legal answer. This asserts WHICH
  // one we do, because the line prices on screen have to sum to the subtotal
  // printed under them.
  const t = M.taxBreakdown("ex", { lineTotalsInc: [0.05, 0.05], deliveryInc: 0, totalInc: 0.1 });
  assert.equal(t.goods, 0.1, "sum of per-line net amounts");
  assert.notEqual(t.goods, 0.09, "not the net of the summed amount");
});

test("taxBreakdown: a zero delivery contributes no GST and stays zero in both modes", () => {
  const ex = M.taxBreakdown("ex", { lineTotalsInc: [1000], deliveryInc: 0, totalInc: 1000 });
  assert.equal(ex.delivery, 0, "$0 delivery is a settled figure, not a missing one");
  assert.equal(ex.gst, 90.91, "GST on the goods alone");
  assert.equal(M.taxBreakdown("inc", { lineTotalsInc: [1000], deliveryInc: 0, totalInc: 1000 }).delivery, 0);
});

test("the built-in fallback catalogue is already Windows-first", () => {
  // A browser that never reaches Sanity still gets the intended order.
  assert.deepEqual(M.categories.map((c) => c.name), ["Windows", "Doors"]);
  assert.equal(M.categories[0].orderRank, "a0");
});

// ═══════════════════════════════════════════════════════════════════════════
// Delivery pricing — the pure rate engine (design doc docs/shipping-costs-
// design.md §5/§10.1, commit C4). worker/lib/delivery.ts has zero callers
// elsewhere in the app as of this commit; these are the tests that make the
// arithmetic and the postcode resolution trustworthy before anything depends
// on them for money.
// ═══════════════════════════════════════════════════════════════════════════

// 45 / 180 / 900 is a SHAPE, not the owner's rates — it puts the break-even at
// exactly 4 m² and the cap at exactly 20 m², so a failure names the band it broke.
const VIC_METRO = { id: "vic-metro", ratePerSqm: 45, minCharge: 180, maxCharge: 900, isFallback: 0 };
const VIC_REGIONAL = { id: "vic-regional", ratePerSqm: 70, minCharge: 260, maxCharge: 1400, isFallback: 0 };
const TAS = { id: "tas", ratePerSqm: 100, minCharge: 560, maxCharge: 2100, isFallback: 0 };
const TAS_REMOTE = { id: "tas-remote", ratePerSqm: 180, minCharge: 900, maxCharge: 4000, isFallback: 0 };
const UNMAPPED = { id: "unmapped", ratePerSqm: 220, minCharge: 980, maxCharge: 4200, isFallback: 1 };
const ZONES = [VIC_METRO, VIC_REGIONAL, TAS, TAS_REMOTE, UNMAPPED];
const RANGES = [
  { zoneId: "vic-metro", from: 3000, to: 3207 }, { zoneId: "vic-regional", from: 3211, to: 3996 },
  { zoneId: "tas", from: 7000, to: 7999 }, { zoneId: "tas-remote", from: 7255, to: 7256 },
];

// ── The rate curve ────────────────────────────────────────────────────────────

test("T-A1: zero area is charged the zone minimum, because a minimum charge is a floor", () => {
  assert.equal(M.deliveryCost(0, VIC_METRO), 180);
});

test("T-A2: one 600 x 600 window still costs the zone minimum", () => {
  // area 0.36; cost 180 (16.20 raw, floored). This is the test that proves the
  // floor is a floor -- with a base it would cost 180 + 16.20.
  assert.equal(M.deliveryCost(0.36, VIC_METRO), 180);
});

test("T-A3: an area under the break-even is charged the minimum, not the arithmetic", () => {
  assert.equal(M.deliveryCost(3, VIC_METRO), 180); // 135 raw
});

test("T-A4: the minimum and the linear band meet without a step at the break-even", () => {
  assert.equal(M.deliveryCost(4, VIC_METRO), 180);
  assert.equal(M.deliveryCost(4.5, VIC_METRO), 200); // 202.50 -> 200
});

test("T-A5: between the floor and the cap the charge is area x rate, rounded to the $10 grid", () => {
  assert.equal(M.deliveryCost(10, VIC_METRO), 450);
  assert.equal(M.deliveryCost(19, VIC_METRO), 860); // 855 -> 860
  assert.equal(M.deliveryCost(4.32, VIC_METRO), 190); // 194.40 -> 190
});

test("T-A6: the area landing exactly on the cap is charged the cap", () => {
  assert.equal(M.deliveryCost(20, VIC_METRO), 900);
});

test("T-A7: clamping happens before rounding, so the answer is always on the $10 grid", () => {
  assert.equal(M.deliveryCost(19.999, VIC_METRO), 900);
  for (let x = 0; x <= 40; x += 0.37) {
    assert.equal(M.deliveryCost(x, VIC_METRO) % 10, 0, `deliveryCost(${x}) on the $10 grid`);
  }
});

test("T-A8: ten times the glass does not cost ten times the delivery -- the cap holds", () => {
  assert.equal(M.deliveryCost(60, VIC_METRO), 900);
  assert.equal(M.deliveryCost(200, VIC_METRO), 900);
});

test("T-A9: a zone whose rate is zero still charges its minimum", () => {
  assert.equal(M.deliveryCost(10, { ...VIC_METRO, ratePerSqm: 0 }), 180);
});

test("T-A10: a maximum below the minimum is a typo, and the LOWER number wins", () => {
  // Unreachable in D1 (schema CHECK); defined here so a hand-built zone can
  // never produce an unbounded charge.
  assert.equal(M.deliveryCost(1, { ...VIC_METRO, minCharge: 900, maxCharge: 400 }), 400);
});

test("T-A11: more glass never costs less to deliver", () => {
  let prev = -Infinity;
  for (let x = 0; x <= 80; x += 0.17) {
    const cost = M.deliveryCost(x, VIC_METRO);
    assert.ok(Number.isFinite(cost), `finite at ${x}`);
    assert.ok(cost >= prev, `monotonic at ${x} (${cost} >= ${prev})`);
    assert.ok(cost <= VIC_METRO.maxCharge, `never above the cap at ${x}`);
    prev = cost;
  }
});

test("T-A12: a negative or non-finite area is refused rather than credited", () => {
  assert.equal(M.deliveryCost(-5, VIC_METRO), 0);
  assert.equal(M.deliveryCost(NaN, VIC_METRO), 0);
  assert.equal(M.deliveryCost(Infinity, VIC_METRO), 0);
  assert.equal(M.deliveryCost(-Infinity, VIC_METRO), 0);
});

// ── The postcode ──────────────────────────────────────────────────────────────

test("T-A13: a four-digit postcode maps to its zone", () => {
  assert.equal(M.normalisePostcode("3000"), "3000");
  const r = M.resolveZone("3000", ZONES, RANGES);
  assert.equal(r.zone.id, "vic-metro");
  assert.equal(r.basis, "postcode_zone");
});

test("T-A14: 0800 is a postcode, not the number 800 -- the leading zero survives, and a number is not a postcode", () => {
  assert.equal(M.normalisePostcode("0800"), "0800");
  assert.equal(M.normalisePostcode(800), null);
  assert.equal(M.normalisePostcode(3000), null);
});

test("T-A15: range bounds are inclusive at both ends", () => {
  assert.equal(M.resolveZone("3207", ZONES, RANGES).zone.id, "vic-metro");
  assert.equal(M.resolveZone("3211", ZONES, RANGES).zone.id, "vic-regional");
  // 3208 is the gap -- falls to the fallback, not the nearer neighbour.
  assert.equal(M.resolveZone("3208", ZONES, RANGES).zone.id, "unmapped");
});

test("T-A16: surrounding whitespace is not a malformed postcode", () => {
  assert.equal(M.normalisePostcode(" 3000 "), "3000");
  assert.equal(M.normalisePostcode("\t3000\n"), "3000");
});

test("T-A17: anything that is not exactly four ASCII digits is refused", () => {
  const arabicIndicFour = String.fromCharCode(0x0663, 0x0660, 0x0660, 0x0660); // deliberate: \p{Nd} but not \d
  for (const bad of ["300", "30000", "3o00", "3 00", "VIC 3000", "", "3000.0", "+3000", arabicIndicFour, null, undefined, {}, [], true, 3000]) {
    assert.equal(M.normalisePostcode(bad), null, `rejects ${JSON.stringify(bad)}`);
  }
});

test("T-A18: a postcode inside no configured range still gets a zone -- never nothing", () => {
  for (const pc of ["9999", "0000", "3208"]) {
    const r = M.resolveZone(pc, ZONES, RANGES);
    assert.ok(r.zone, `${pc} resolves to a zone`);
    assert.ok(r.zone.isFallback, `${pc} resolves to the fallback`);
    assert.equal(r.basis, "fallback_zone");
  }
});

test("T-A19: overlapping ranges resolve to the narrower one, not to whichever was written first", () => {
  assert.equal(M.resolveZone("7256", ZONES, RANGES).zone.id, "tas-remote");
  assert.equal(M.resolveZone("7100", ZONES, RANGES).zone.id, "tas");
  const reversed = [...RANGES].reverse();
  assert.equal(M.resolveZone("7256", ZONES, reversed).zone.id, "tas-remote");
  assert.equal(M.resolveZone("7100", ZONES, reversed).zone.id, "tas");
});

test("T-A20: an unpriced zone is not free delivery -- it falls to the fallback", () => {
  const unpriced = ZONES.map((z) => (z.id === "tas" ? { ...z, minCharge: null, ratePerSqm: null, maxCharge: null } : z));
  assert.equal(M.resolveZone("7100", unpriced, RANGES).zone.id, "unmapped");
});

test("T-A21: an inactive zone falls back rather than continuing to price", () => {
  const inactive = ZONES.map((z) => (z.id === "tas" ? { ...z, active: 0 } : z));
  assert.equal(M.resolveZone("7100", inactive, RANGES).zone.id, "unmapped");
});

// ── The area basis ────────────────────────────────────────────────────────────

test("T-A22: millimetres in, square metres out, from string dims and numeric dims alike", () => {
  const fromStrings = M.sumOpeningAreaM2([{ dims_json: JSON.stringify({ width: "1200", height: "900" }), qty: 1 }]);
  const fromNumbers = M.sumOpeningAreaM2([{ dims_json: JSON.stringify({ width: 1200, height: 900 }), qty: 1 }]);
  assert.equal(fromStrings.areaM2, 1.08);
  assert.equal(fromNumbers.areaM2, 1.08);
});

test("T-A23: a composite opening is measured once -- its units are frames of one hole, not extra deliveries", () => {
  // Parent 3600x2400; two 1800x2400 segments. Only the PARENT is summed.
  const parentOnly = M.sumOpeningAreaM2([{ dims_json: JSON.stringify({ width: 3600, height: 2400 }), qty: 1 }]);
  assert.equal(parentOnly.areaM2, 8.64);
  assert.notEqual(parentOnly.areaM2, 17.28); // the exact number the double-count bug produces
});

test("T-A24: the area basis is parents-only, exactly as every money total in this system is", () => {
  // sumOpeningAreaM2 itself has no notion of "parent" -- callers (loadProjectAreaM2)
  // filter to parent_line_id IS NULL in SQL. This asserts the arithmetic is a
  // plain sum with no special-casing that would need reconciling with that rule.
  const rows = [
    { dims_json: JSON.stringify({ width: 1000, height: 1000 }), qty: 1 },
    { dims_json: JSON.stringify({ width: 2000, height: 1000 }), qty: 1 },
  ];
  assert.equal(M.sumOpeningAreaM2(rows).areaM2, 1 + 2);
});

test("T-A25: an opening ordered three times ships three frames, and qty 0 is clamped to 1", () => {
  assert.equal(M.sumOpeningAreaM2([{ dims_json: JSON.stringify({ width: 2400, height: 1800 }), qty: 3 }]).areaM2, 12.96);
  assert.equal(M.sumOpeningAreaM2([{ dims_json: JSON.stringify({ width: 2400, height: 1800 }), qty: 0 }]).areaM2, 4.32);
});

test("T-A26: a line with no readable dimensions contributes nothing and does not poison the total with NaN", () => {
  const rows = [
    { dims_json: "not json", qty: 1 },
    { dims_json: JSON.stringify({ width: "", height: "" }), qty: 1 },
    { dims_json: JSON.stringify({ width: "abc", height: "def" }), qty: 1 },
    { dims_json: JSON.stringify({ width: 1200, height: 900 }), qty: 1 },
  ];
  const r = M.sumOpeningAreaM2(rows);
  assert.ok(Number.isFinite(r.areaM2));
  assert.equal(r.areaM2, 1.08);
  assert.equal(r.unmeasuredLines, 3);
});

// ── The deposit ───────────────────────────────────────────────────────────────
// T-A27/T-A28/T-A29 already live above, alongside DEPOSIT_PERCENT (C1) -- the
// deposit exists before delivery does, and stays where it was added rather
// than being duplicated here for section-numbering's sake.

// ── The builder guard ─────────────────────────────────────────────────────────

test("T-A30: the customer's running estimate has no delivery term, and cannot grow one", () => {
  // quoteSummary's total is Sigma linePriceTotal(it) over quote.items. A
  // delivery-shaped extra key on an item, or on the state passed alongside
  // items/files, must not be picked up by anything that totals it -- D8 is a
  // promise about THIS function, since it is what the sticky builder bar and
  // the submit gate both read.
  const items = [
    { id: 1, code: "W1", lineTotal: 500, status: "Ready", options: {} },
    { id: 2, code: "W2", lineTotal: 640, status: "Ready", options: {} },
  ];
  const summary = M.quoteSummary({
    items, files: [],
    // A delivery-shaped extra key on the state itself -- must be ignored too.
    deliveryTotal: 999999, delivery: { amount: 999999 },
  });
  assert.equal(summary.total, 500 + 640);
});

// AU phone validation — ONE implementation, shared by the Worker and the browser
// (registration Phase 1, spec §7.2 / AC-20 / AC-21). Service numbers are valid
// contact phones by owner ruling Q2.
test("isValidAuPhone: accepted AU shapes, rejected junk", () => {
  for (const good of [
    "0412 345 678", "+61 412 345 678", "(03) 9000 0000", "1300 123 456", "13 12 34",
    "1800 123 456", "0412345678", "61412345678",
  ]) {
    assert.equal(M.isValidAuPhone(good), true, `${good} must be accepted`);
  }
  for (const bad of [
    "12345", "abc", "0000000000", "04123456789", "", null, undefined,
    "0112345678", "1400123456", "131234567",
  ]) {
    assert.equal(M.isValidAuPhone(bad), false, `${JSON.stringify(bad)} must be rejected`);
  }
});

// Spec §7.2: exactly ONE "normalise an AU phone" implementation. The enquiry
// route's export must BE the shared one, not a second copy that agrees today.
test("one AU phone normaliser: worker/lib/enquiry re-exports src/data/phone", () => {
  assert.equal(M.normalizePhone, M.normalizePhoneShared);
});

// Phase-2 design §7.4 / step (a)1: ONE home for ABN validity — src/data/abn.ts.
// The browser's client-side format check (AC-P2-7/16) and the Worker's checksum
// must be the same function, so worker/lib/referrals.ts re-exports it rather
// than keeping the copy that lived there through Phase 1.
test("abnValid / normalizeAbn / formatAbn: one ABN validator, two callers", () => {
  // The move is a re-export, not a second copy that agrees today.
  assert.equal(M.abnValid, M.abnValidViaReferrals, "worker/lib/referrals must re-export src/data/abn's abnValid");

  // Real, checksum-valid ABNs (the seeded fixture plus two from the ABR register).
  for (const good of ["33629698013", "33 629 698 013", "51824753556", "53004085616"]) {
    assert.equal(M.abnValid(good), true, `${good} must pass the ATO checksum`);
  }
  // A transposed digit is the realistic error the checksum exists to catch.
  for (const bad of ["33629698031", "12345678901", "1234567890", "123456789012", "", null, undefined, "abcdefghijk", "3362969801x"]) {
    assert.equal(M.abnValid(bad), false, `${JSON.stringify(bad)} must be rejected`);
  }

  // Normalisation strips whitespace only — it never invents or truncates digits.
  assert.equal(M.normalizeAbn(" 33 629 698 013 "), "33629698013");
  assert.equal(M.normalizeAbn("33 629\t698\n013"), "33629698013");
  assert.equal(M.normalizeAbn(null), "");
  // Non-ASCII digit lookalikes are simply not digits (AB-P2-13).
  assert.equal(M.abnValid("３３６２９６９８０１３"), false);

  // Display formatting: 2-3-3-3, and anything that is not 11 digits comes back untouched.
  assert.equal(M.formatAbn("33629698013"), "33 629 698 013");
  assert.equal(M.formatAbn("33 629 698 013"), "33 629 698 013");
  assert.equal(M.formatAbn("123"), "123");
  assert.equal(M.formatAbn(null), "");
});

// Phase-2 design §5.1 — criterion 2 of the auto-pass triple. The cost asymmetry
// is deliberate and it is what this table pins: a false NEGATIVE costs ops
// minutes (the application queues, a human looks), a false POSITIVE is one third
// of an auto-pass whose residual risk the owner accepted (AB-P2-9). So the
// "must queue" rows are as load-bearing as the "must pass" ones.
test("nameMatches: the fuzzy business-name match (AC-P2-22, E-P2-20)", () => {
  const abr = ["SMITH BROTHERS PTY LTD", "SMITH BROS CONSTRUCTIONS"];

  // Normalisation: case, punctuation, legal form, ampersand, P/L, leading THE.
  assert.equal(M.normalizeBusinessName("The Smith Brothers Pty. Ltd."), "SMITH BROTHERS");
  assert.equal(M.normalizeBusinessName("Smith & Sons P/L"), "SMITH AND SONS");
  assert.equal(M.normalizeBusinessName("smith-brothers (constructions)"), "SMITH BROTHERS CONSTRUCTIONS");
  // E-P2-20's named case: BROS canonicalises to BROTHERS.
  assert.equal(M.normalizeBusinessName("Smith Bros"), "SMITH BROTHERS");

  // "X T/A Y" gives two candidates, each matched independently.
  assert.deepEqual(M.businessNameCandidates("Motro Holdings T/A Motro Constructions"),
    ["Motro Holdings", "Motro Constructions"]);
  assert.deepEqual(M.businessNameCandidates("Motro Holdings trading as Motro Constructions"),
    ["Motro Holdings", "Motro Constructions"]);
  assert.deepEqual(M.businessNameCandidates("Siari Build"), ["Siari Build"]);

  // PASSES: exact in any case/punctuation, legal-form drift, BROS, reorder,
  // 2+-token containment, one realistic typo, and the T/A split.
  for (const submitted of [
    "Smith Brothers Pty Ltd", "SMITH BROTHERS", "smith brothers pty. ltd.",
    "Smith Bros", "The Smith Brothers", "Brothers Smith",
    "Smith Brothers Constructions", "Smith Brotherz",
    "Jones Holdings T/A Smith Brothers",
  ]) {
    assert.equal(M.nameMatches(submitted, abr).pass, true, `${submitted} must match`);
  }
  assert.equal(M.nameMatches("Smith Bros", abr).matched, "SMITH BROTHERS PTY LTD");

  // QUEUES (never rejects): acronyms, a bare surname against a multi-word entity,
  // an unrelated business, a single shared token, and an empty submission.
  //
  // "Smith Brothres" is in this list on purpose and it is worth knowing why: at
  // Dice ≥ 0.85 a single SUBSTITUTION passes (0.92 above) but a single
  // TRANSPOSITION does not — swapping two characters breaks three bigrams and
  // scores 0.77 on a 14-character name. Design §5.1 lists "a single realistic
  // typo" as a pass, which is true of substitutions and not of transpositions.
  // The threshold is kept as designed: the failure direction is a queue entry,
  // which costs ops a minute, and loosening a matcher to catch transpositions
  // widens the auto-pass surface instead.
  for (const submitted of ["SB", "Smith", "Northside Building", "Brothers", "Smith Brothres", "", "   "]) {
    assert.equal(M.nameMatches(submitted, abr).pass, false, `${JSON.stringify(submitted)} must queue`);
  }
  // No usable ABR names at all (outage / not found) can never be a match.
  assert.equal(M.nameMatches("Smith Brothers", []).pass, false);
  assert.equal(M.nameMatches("Smith Brothers", [null, undefined, ""]).pass, false);
});

// Phase-2 design §5.2 — criterion 3. The free-mailbox floor is the one part of
// the triple that is absolute: D2 says a gmail address can NEVER satisfy this,
// however well the name scores. Everything else is fuzzy and queues on failure.
test("emailDomainPlausible: criterion 3, and the free-mailbox floor (AC-P2-23)", () => {
  const names = ["Northside Building Pty Ltd", "NORTHSIDE BUILD"];

  for (const free of ["sam@gmail.com", "SAM@Gmail.com", "sam@hotmail.com.au", "sam@bigpond.net.au",
                      "sam@outlook.com", "sam@yahoo.com.au", "sam@icloud.com", "sam@proton.me"]) {
    const r = M.emailDomainPlausible(free, names);
    assert.equal(r.pass, false, `${free} must fail criterion 3`);
    assert.equal(r.freeMailbox, true, `${free} must be recognised as a free mailbox`);
  }
  assert.equal(M.FREE_MAIL_DOMAINS.has("gmail.com"), true);
  assert.equal(M.FREE_MAIL_DOMAINS.has("northsidebuild.com.au"), false);

  // Business domains: the public suffix comes off, then containment either way.
  assert.equal(M.emailDomainPlausible("sarah@northsidebuild.com.au", names).pass, true);
  assert.equal(M.emailDomainPlausible("doni@siaribuild.com.au", ["Siari Build"]).pass, true);
  assert.equal(M.emailDomainPlausible("a@northside-building.com.au", names).pass, true);
  assert.equal(M.emailDomainPlausible("a@northsidebuilding.com", names).pass, true);
  assert.equal(M.emailDomainPlausible("sarah@northsidebuild.com.au", names).domain, "northsidebuild.com.au");
  // A domain is an abbreviation by nature, and the register spells abbreviations
  // out: smithbros.com.au belongs to SMITH BROTHERS PTY LTD, whose trading name
  // is "SMITH BROS". The name matcher canonicalises BROS → BROTHERS (E-P2-20),
  // which is right for criterion 2 and would silently break criterion 3 — so the
  // domain is compared against BOTH the expanded and the unexpanded forms.
  assert.equal(M.emailDomainPlausible("sam@smithbros.com.au", ["Smith Brothers Pty Ltd", "SMITH BROS"]).pass, true);
  assert.equal(M.emailDomainPlausible("sarah@northsidebuild.com.au", names).freeMailbox, false);

  // QUEUES: acronyms are deliberately NOT matched (three-letter collisions are
  // everywhere), an unrelated business domain fails, and a sub-4-character core
  // can never reach containment on its own.
  assert.equal(M.emailDomainPlausible("sam@sbc.com.au", ["Smith Building Co"]).pass, false);
  assert.equal(M.emailDomainPlausible("sam@totallyunrelated.com.au", names).pass, false);
  assert.equal(M.emailDomainPlausible("sam@nsb.com.au", names).pass, false);
  // Malformed input is a fail, never a throw.
  assert.equal(M.emailDomainPlausible("not-an-email", names).pass, false);
  assert.equal(M.emailDomainPlausible("", names).pass, false);
  assert.equal(M.emailDomainPlausible("sam@northsidebuild.com.au", []).pass, false);
});

// What blocks SUBMISSION (spec §4.3 / AC-17 / AC-23). A stored-but-invalid phone
// counts as missing on purpose: a legacy row with junk in it must be corrected at
// the gate, not submitted around.
const completeDetails = {
  name: "Sam Taylor", phone: "0412 345 678",
  addressLine1: "12 Bridge Street", addressLine2: null,
  addressSuburb: "Preston", addressState: "VIC", addressPostcode: "3072",
};
test("submitMissing: the required set, and what counts as absent", () => {
  assert.deepEqual(M.submitMissing(completeDetails), []);
  assert.deepEqual(M.submitMissing({ ...completeDetails, addressLine2: "Unit 4" }), [],
    "unit/level is optional");
  assert.deepEqual(M.submitMissing({
    name: null, phone: null, addressLine1: null, addressLine2: null,
    addressSuburb: null, addressState: null, addressPostcode: null,
  }), ["name", "phone", "addressLine1", "addressSuburb", "addressState", "addressPostcode"]);
  assert.deepEqual(M.submitMissing({ ...completeDetails, name: "   " }), ["name"], "whitespace is not a name");
  assert.deepEqual(M.submitMissing({ ...completeDetails, phone: "12345" }), ["phone"], "stored-invalid phone blocks");
  assert.deepEqual(M.submitMissing({ ...completeDetails, addressState: "XXX" }), ["addressState"]);
  assert.deepEqual(M.submitMissing({ ...completeDetails, addressPostcode: "307" }), ["addressPostcode"]);
  assert.deepEqual(M.AU_STATES.slice(), ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"]);
});

// What a PATCH may store (AB-13 / E12 / AC-22 / AC-23 server floor). Clearing a
// field is legal here; refusing an over-limit or malformed one is not optional.
test("detailsPatchProblems: refuses over-limit and malformed, allows clearing", () => {
  assert.deepEqual(M.detailsPatchProblems({}), [], "an empty patch has nothing wrong with it");
  assert.deepEqual(M.detailsPatchProblems({
    name: "Sam Taylor", phone: "1300 123 456", addressLine1: "12 Bridge St",
    addressSuburb: "Preston", addressState: "vic", addressPostcode: "3072",
  }), [], "a lowercase state is accepted and uppercased on write");
  assert.deepEqual(M.detailsPatchProblems({ name: "", phone: "", addressSuburb: "" }), [],
    "clearing a field is legal at the profile layer");
  assert.deepEqual(M.detailsPatchProblems({ phone: "12345" }), ["phone"]);
  assert.deepEqual(M.detailsPatchProblems({ addressState: "XX" }), ["addressState"]);
  assert.deepEqual(M.detailsPatchProblems({ addressPostcode: "30721" }), ["addressPostcode"]);
  assert.deepEqual(M.detailsPatchProblems({ name: "x".repeat(M.DETAIL_LIMITS.name + 1) }), ["name"]);
  assert.deepEqual(M.detailsPatchProblems({ addressLine1: "x".repeat(100_000) }), ["addressLine1"],
    "nothing unbounded reaches D1");
  assert.deepEqual(
    M.detailsPatchProblems({ phone: "nope", addressPostcode: "abcd" }).sort(),
    ["addressPostcode", "phone"], "every bad field is named, not just the first");
});

// A value is measured as it will be STORED, which is trimmed. Checking the raw
// length first made "3072 " an over-limit postcode — a value the customer cannot
// see anything wrong with, refused for a space they cannot see either.
test("detailsPatchProblems: the limit applies to the trimmed value, not the keystrokes", () => {
  assert.deepEqual(M.detailsPatchProblems({ addressPostcode: "3072 " }), []);
  assert.deepEqual(M.detailsPatchProblems({ addressState: "  VIC  " }), []);
  assert.deepEqual(M.detailsPatchProblems({ name: `  ${"x".repeat(M.DETAIL_LIMITS.name)}  ` }), []);
  // …and a genuinely over-limit value is still refused once trimmed.
  assert.deepEqual(M.detailsPatchProblems({ name: `  ${"x".repeat(M.DETAIL_LIMITS.name + 1)}  ` }), ["name"]);
});

// ─── The trade application's `source` is declared in three places ────────────
// The Worker's union, the route's runtime allowlist, and the client's argument
// type must agree. They drifted the moment a fourth source (`login`) was added:
// the Worker and the route learned about it, the client did not, and the call
// still WORKED — the server accepts the value, so only the type was wrong.
//
// `typecheck:gate` is fatal-only by design and TS2322 is not on its list, so
// nothing failed. The mismatch was found by an external reviewer, which is a
// poor substitute for a test that costs nothing to run.
test("the trade application source list agrees across worker, route and client", async () => {
  const read = async (p) => readFile(join(projectRoot, p), "utf8");
  const listFrom = (text, pattern) => {
    const m = text.match(pattern);
    assert.ok(m, `could not find the source list via ${pattern}`);
    return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]).sort();
  };

  const worker = listFrom(await read("worker/lib/trade.ts"),
    /export type TradeSource =([^;]+);/);
  const route = listFrom(await read("worker/routes/trade.ts"),
    /const SOURCES: readonly TradeSource\[\] = \[([^\]]+)\]/);
  const client = listFrom(await read("src/data/api.ts"),
    /source: ("trade_page"[^;]+);/);

  assert.deepEqual(route, worker, "the route's allowlist must match TradeSource");
  assert.deepEqual(client, worker, "the client's argument type must match TradeSource");
});

// ops2 coexists with the legacy console under a path prefix
// (`docs/adr/0002-ops2-path-routing-not-hash.md` on `design/ops2-planning` —
// NOT this branch's 0002; see docs/adr/0009 for the map): the
// Worker picks the shell by prefix, and the router picks its base by prefix,
// and if those two disagree by one character a deep link serves the ops2 bundle
// and then 404s inside it. One rule, one file, both callers — this pins the
// boundary cases, which is where a `startsWith` written twice goes wrong.
test("the ops2 path prefix is a boundary, not a substring", () => {
  assert.equal(M.OPS2_BASE, "/ops2");

  for (const path of ["/ops2", "/ops2/", "/ops2/record/p_1", "/ops2/a/deep/link"]) {
    assert.equal(M.isUnderOps2(path), true, `${path} is ops2`);
    assert.equal(M.ops2RouterBase(path), "/ops2", `${path} mounts the router at /ops2`);
  }

  // Merely CONTAINING the prefix is not being under it. "/ops2extra" is the one
  // a naive startsWith hands to ops2 by accident; the rest are here so a later
  // "simplification" back to that has something to fail against.
  for (const path of ["/", "/ops2extra", "/ops2-archive", "/nested/ops2", "/orders/o_1", "/OPS2"]) {
    assert.equal(M.isUnderOps2(path), false, `${path} is not ops2`);
    assert.equal(M.ops2RouterBase(path), "/", `${path} mounts the router at the root`);
  }
});

// The OTHER half of that boundary, and the direction that bites during
// coexistence rather than after it.
test("a browser-facing ops2 path carries the base exactly once", () => {
  // ops2's router mounts at a basename, so every path the ROUTER handles is
  // basename-relative and React Router puts the base back on. An `href` is not
  // handled by the router — the browser resolves it against the document — so
  // it has to carry the base itself. Get that wrong and, while ops2 lives under
  // /ops2, href="/projects" requests /projects on the ops host, where
  // opsShellFor() serves the LEGACY console: primary click fine, middle-click,
  // Ctrl-click, "open in new tab" and "copy link address" all silently out.
  for (const [path, href] of [
    ["/projects", "/ops2/projects"],
    ["/attention", "/ops2/attention"],
    ["/projects/record/OF-Q-10482", "/ops2/projects/record/OF-Q-10482"],
    ["/", "/ops2/"],
  ]) {
    assert.equal(M.withBase("/ops2", path), href);
  }

  // IDEMPOTENT, and that is a requirement rather than a nicety. The tab bar's
  // anchors are corrected in place by a MutationObserver (Ionic's IonTabButton
  // uses one `href` prop as both its routing key and its anchor), so the
  // function reads its own output on the very next mutation. Written without
  // this it prefixed forever — /ops2/ops2/projects, then again, and the page
  // hung. Seven browser tests timed out before the cause was obvious.
  assert.equal(M.withBase("/ops2", "/ops2/projects"), "/ops2/projects");
  assert.equal(M.withBase("/ops2", M.withBase("/ops2", "/projects")), "/ops2/projects");
  assert.equal(M.withBase("/ops2", "/ops2"), "/ops2");

  // A base of "/" is the post-switch-over state, and then this is the identity
  // — the property that lets one bundle be correct in every rollout state.
  for (const path of ["/", "/projects", "/ops2/projects"]) {
    assert.equal(M.withBase("/", path), path);
  }

  // And the same boundary rule as isUnderOps2: containing the prefix is not
  // being under it, so these get the base added rather than left alone.
  assert.equal(M.withBase("/ops2", "/ops2extra"), "/ops2/ops2extra");
});

// The ops2 scaffold reads no catalogue — deliberately, so that "did ops2 load?"
// is never a question about Sanity. Dropping hydrateFromSanity() from the client
// only removed half of that: the Worker awaited the catalogue one layer ABOVE
// shell selection, so with Sanity configured and slow the very shell people open
// to check that routing and Access work was the thing that looked broken.
//
// Driven in-process against a fetch that never settles, which is the honest
// shape of the failure rather than a stopwatch: a failed load is NOT cached
// (worker/lib/catalogue.ts), so in production every ops2 request pays the 3s
// timeout, not merely the first one in an isolate.
//
// The Worker is bundled separately from the shared bundle at the top of this
// file so that an import-time break in any route cannot take the pure tests
// down with it.
test("the ops2 shell does not wait for a catalogue it never reads", async () => {
  const outfile = join(runDir, "worker-bundle.mjs");
  await build({
    stdin: {
      contents: `export { default as worker } from ${p("worker/index.ts")};`,
      resolveDir: projectRoot, sourcefile: "worker-entry.ts", loader: "ts",
    },
    bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  });
  const { worker } = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);

  const env = {
    APP_ENV: "development",
    SANITY_PROJECT_ID: "stub-project",   // configured, so hydration is attempted
    ASSETS: {
      fetch: async (u) => new Response(`shell:${new URL(u).pathname}`,
        { headers: { "content-type": "text/html" } }),
    },
  };
  const ctx = { waitUntil() {}, passThroughOnException() {} };

  const realFetch = globalThis.fetch;
  globalThis.fetch = () => new Promise(() => {});   // a Sanity that never answers
  const within = async (path, ms) => {
    let timer;
    const settled = await Promise.race([
      worker.fetch(new Request(`http://ops.localhost${path}`), env, ctx),
      new Promise((r) => { timer = setTimeout(() => r("WAITED"), ms); }),
    ]);
    clearTimeout(timer);
    return settled === "WAITED" ? "WAITED" : settled.text();
  };
  try {
    // Run the ops2 requests FIRST: an implementation that awaits hydration here
    // also parks the never-settling load in the module cache, and then every
    // assertion after it passes for the wrong reason.
    assert.equal(await within("/ops2", 500), "shell:/ops2.html");
    assert.equal(await within("/ops2/record/p_1", 500), "shell:/ops2.html");

    // Nothing else moved in front of hydration. The API serves live catalogue
    // content and the legacy console reads it too — both must still wait, or
    // this has quietly changed what they are served rather than when.
    assert.equal(await within("/api/locations", 500), "WAITED", "the API still waits for the catalogue");
    assert.equal(await within("/orders/o_1", 500), "WAITED", "the legacy ops shell still waits for the catalogue");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("`issuableNow` is the issue gate's own answer, so a list cannot promise what the gate refuses", () => {
  // WHY THIS EXISTS. ops2's Projects queue shows a "Ready to issue" stat and
  // filter, and the first version derived it client-side from what the list DTO
  // happened to carry: ours, in pricing, no unresolved lines. That agreed with
  // `issueQuote` on two of its four conditions.
  //
  // It missed a project with NO LINES (nothing unresolved because nothing
  // exists — refused as `not_ready`) and every project whose DELIVERY IS
  // UNSETTLED (refused as `delivery_unset`, guard 8). Both would have been
  // counted, filtered to, and opened by a reviewer looking for work that could
  // go out — and the refusal only arrives after the trip. On the queue whose
  // entire job is directing attention, a stat that sends you somewhere you
  // cannot act is worse than no stat.
  //
  // So the predicate lives HERE, beside ISSUABLE_FROM and the guards it mirrors,
  // and the list reports its answer rather than re-deriving one.
  const ready = {
    statusInternal: "estimator_assigned", lineCount: 3, blocking: 0, deliverySettled: true,
  };
  assert.equal(M.issuableNow(ready), true);

  // Each guard, one at a time.
  assert.equal(M.issuableNow({ ...ready, statusInternal: "issued" }), false, "already issued");
  assert.equal(M.issuableNow({ ...ready, lineCount: 0 }), false,
    "an empty quote is refused as not_ready, and has nothing blocking to give it away");
  assert.equal(M.issuableNow({ ...ready, blocking: 1 }), false, "a line without a total, or flagged");
  assert.equal(M.issuableNow({ ...ready, deliverySettled: false }), false,
    "guard 8: NULL delivery is the absence of an answer, not a zero");

  // ZERO DELIVERY IS SETTLED. A trade customer arranging their own freight is
  // priced at 0 and that is an answer — the distinction migrations/0044 and
  // guard 8 both turn on, and the one a truthiness test would destroy.
  assert.equal(M.issuableNow({ ...ready, deliverySettled: true }), true);

  // Every state the gate admits, admitted here too — a status added to one and
  // not the other is a queue that disagrees with the button it points at.
  for (const status of M.ISSUABLE_FROM) {
    assert.equal(M.issuableNow({ ...ready, statusInternal: status }), true, status);
  }

  // BLOCKING IS NOT "UNRESOLVED", AND THE DIFFERENCE IS FOUR LINE STATUSES.
  // `quote_line.status` admits incomplete / ready / technical_review /
  // policy_exception / unavailable / superseded / ordered (migrations/0001), and
  // `issueQuote` blocks on exactly two of them plus a NULL total. The first
  // version fed this predicate the list's `unresolved` count, which is every
  // status that is not `ready` — so a priced line carrying `policy_exception`
  // was reported as not issuable while the button would have issued it. A stat
  // claiming to be the gate's answer has to be the gate's answer in both
  // directions, or the claim is the defect.
  assert.deepEqual([...M.ISSUE_BLOCKING_LINE_STATUSES], ["technical_review", "incomplete"]);
});

test("the issue gate's blocking statuses are written once, and both readers build from them", async () => {
  // The predicate above only agrees with `issueQuote` while the two are reading
  // the same list, and the second reader is SQL in another file. A status added
  // to the guard and not to the query is a queue that quietly disagrees with
  // the button it points at — the kind of drift no type checks and no test of
  // either side alone would notice.
  const read = async (rel) => readFile(join(projectRoot, rel), "utf8");
  const issue = await read("worker/lib/issue.ts");
  assert.match(issue, /ISSUE_BLOCKING_LINE_STATUSES[\s\S]{0,40}\.includes\(/,
    "issueQuote's own guard must read the shared list, not a literal");

  const ops = await read("worker/routes/ops.ts");
  const subselect = ops.match(/AS blocking[\s\S]{0,40}/);
  assert.ok(subselect, "the projects list must count blocking lines");
  assert.match(ops, /ISSUE_BLOCKING_LINE_STATUSES/,
    "…and must build that count from the shared list rather than repeating the statuses in SQL");
});
