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
      export { priceConfigured, lineBlocksSubmission, suggestCode, hasDuplicateCode, normCode, optionGroupsFor, defaultOptions, fmt, mm, productLabel } from ${p("src/data/configurator.ts")};
      export { getProductBySlug, products, getCategories, getFamiliesByCategory } from ${p("src/data/catalogue.ts")};
      export { toCatalogueData } from ${p("src/data/catalogueQuery.ts")};
      export { parseCookies, newToken, claimCookie, CLAIM_COOKIE } from ${p("worker/lib/util.ts")};
      export { normEmail, isEmail, sixDigit, sha256hex, userDto } from ${p("worker/lib/auth.ts")};
      export { normalizePhone, enquiryReference, validateEnquiry } from ${p("worker/lib/enquiry.ts")};
      export { availableActions, ACTION_LABEL, TRANSITIONS, STAGES, STAGE_LABEL, DEPOSIT_PERCENT } from ${p("worker/lib/orders.ts")};
      export { canApprove } from ${p("worker/lib/approvals.ts")};
      export { itemFields, editedFieldsAfterSave } from ${p("worker/lib/lines.ts")};
      export { pricingOptionSlugsFromOptions } from ${p("worker/lib/estimator/estimate.ts")};
      export { staffDomains, isStaffEmail } from ${p("worker/lib/staff.ts")};
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

test("priceConfigured: complete line prices, rounds to $10, multiplies by qty", () => {
  const one = M.priceConfigured({ productSlug: slug, width: "1200", height: "900", options: fullOptions, qty: 1 });
  assert.equal(one.ok, true);
  assert.deepEqual(one.missing, []);
  assert.equal(one.unit % 10, 0, "unit rounds to nearest $10");
  assert.ok(one.unit > 0);
  const four = M.priceConfigured({ productSlug: slug, width: "1200", height: "900", options: fullOptions, qty: 4 });
  assert.equal(four.total, one.unit * 4);
});

test("priceConfigured: perimeter+area model — bigger window costs more", () => {
  const small = M.priceConfigured({ productSlug: slug, width: "800", height: "600", options: fullOptions, qty: 1 });
  const big = M.priceConfigured({ productSlug: slug, width: "1800", height: "1400", options: fullOptions, qty: 1 });
  assert.ok(big.unit > small.unit);
});

test("priceConfigured: missing dimensions/product flagged, not priced", () => {
  assert.deepEqual(M.priceConfigured({ productSlug: slug, width: "", height: "900", options: fullOptions, qty: 1 }).missing.includes("width"), true);
  assert.equal(M.priceConfigured({ productSlug: slug, width: "1200", height: "", options: fullOptions, qty: 1 }).ok, false);
  const noProduct = M.priceConfigured({ productSlug: "does-not-exist", width: "1200", height: "900", options: {}, qty: 1 });
  assert.equal(noProduct.ok, false);
  assert.equal(noProduct.unit, 0);
  assert.ok(noProduct.missing.includes("product"));
});

test("priceConfigured: missing required option (hardware) blocks pricing", () => {
  const r = M.priceConfigured({ productSlug: slug, width: "1200", height: "900", options: { colour: "Dover White" }, qty: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.missing.some((m) => m.includes("hardware")));
});

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

test("optionGroupsFor: injects shared Colorbond palette; colour+hardware required", () => {
  const product = M.getProductBySlug(slug);
  const groups = M.optionGroupsFor(product);
  const colour = groups.find((g) => g.typeSlug === "colour");
  assert.ok(colour, "colour group injected");
  assert.ok(colour.choices.length >= 20, "full Colorbond palette");
  assert.ok(colour.choices.every((c) => c.add === 0), "all colours included in base price");
  assert.equal(groups.find((g) => g.typeSlug === "hardware")?.required, true);
  const defaults = M.defaultOptions(product);
  assert.ok(defaults.colour && defaults.hardware, "standards preselected");
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

test("approvals.canApprove: admin wildcard, exact role, mismatch", () => {
  assert.equal(M.canApprove({ role: "admin" }, "manager"), true);
  assert.equal(M.canApprove({ role: "manager" }, "manager"), true);
  assert.equal(M.canApprove({ role: "estimator" }, "manager"), false);
  assert.equal(M.canApprove({ role: null }, "manager"), false);
});

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
  const incoming = M.itemFields({ productSlug: "amj80-series-awning-window", width: "900", height: "1200", options: { colour: "black" }, qty: 2, origin: "schedule" });
  const stored = { product_slug: incoming.product_slug, options_json: '{"colour":"black"}', dims_json: '{"height":"1200","width":"900"}', qty: 2, edited_fields: null };
  // Note the stored JSON has DIFFERENT key order — must still compare equal.
  assert.equal(M.editedFieldsAfterSave(stored, incoming), null, "key-order differences never false-flag an edit");
});

test("editedFieldsAfterSave: a real change flags exactly its field group and unions with prior edits", () => {
  const incoming = M.itemFields({ productSlug: "amj80-series-awning-window", width: "950", height: "1200", options: { colour: "black" }, qty: 2, origin: "schedule" });
  const stored = { product_slug: incoming.product_slug, options_json: '{"colour":"black"}', dims_json: '{"width":"900","height":"1200"}', qty: 2, edited_fields: '["qty"]' };
  const out = JSON.parse(M.editedFieldsAfterSave(stored, incoming));
  assert.deepEqual(out.sort(), ["dims_json", "qty"].sort(), "width change adds dims_json; prior qty edit survives");
});
