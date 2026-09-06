import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run, resolveToken, loadWorld } from "../catalogue/apply-go-live-min.mjs";
import { plan, assertSafe, DISABLE, KEEP_PUBLISHED, alignHardware, buildDimensionRule, P, NEW_PROFILES, HW, DEFAULT_COLOUR, buildSpecs, buildKeySpecs, same } from "../catalogue/go-live-plan.mjs";
import { makeWorld, makeTransport, altered } from "./fixtures/go-live-world.mjs";

test("dry run: zero writes, correct summary line", async () => {
  const world = makeWorld();
  const { fetchImpl, requests } = makeTransport(world);
  const lines = [];
  const code = await run({ write: false, fetchImpl, log: (l) => lines.push(l), error: (l) => lines.push(l) });
  assert.equal(code, 0);
  assert.equal(requests.filter((r) => r.method === "POST").length, 0);
  assert.ok(lines.includes("21 amend target(s), 1 create target(s)"), lines.join("\n"));
});

test("write with no token: refuses before any network request", async () => {
  const world = makeWorld();
  const { fetchImpl, requests } = makeTransport(world);
  const savedToken = process.env.SANITY_WRITE_TOKEN;
  const savedHome = process.env.HOME;
  const savedProfile = process.env.USERPROFILE;
  delete process.env.SANITY_WRITE_TOKEN;
  process.env.HOME = "/nonexistent-go-live-test-home";
  process.env.USERPROFILE = "/nonexistent-go-live-test-home";
  try {
    assert.equal(resolveToken(), null);
    const code = await run({ write: true, fetchImpl, log: () => {}, error: () => {} });
    assert.equal(code, 1);
    assert.equal(requests.length, 0);
  } finally {
    if (savedToken === undefined) delete process.env.SANITY_WRITE_TOKEN;
    else process.env.SANITY_WRITE_TOKEN = savedToken;
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedProfile;
  }
});

test("assertSafe: the real plan has no violations", () => {
  const { mutations } = plan(makeWorld());
  assert.deepEqual(assertSafe(mutations), []);
});

test("assertSafe: catches a mutation key outside the allow-list (e.g. delete)", () => {
  assert.ok(assertSafe([{ delete: { id: "product-x" } }]).length > 0);
});

test("assertSafe: catches a slug set key", () => {
  assert.ok(assertSafe([{ patch: { id: "product-x", set: { slug: { current: "x" } } } }]).length > 0);
});

test("assertSafe: catches createOrReplace of a product", () => {
  assert.ok(assertSafe([{ createOrReplace: { _id: "product-x", _type: "product" } }]).length > 0);
});

test("assertSafe: catches a patch key outside {id, set} (e.g. unset)", () => {
  assert.ok(assertSafe([{ patch: { id: "product-x", set: {}, unset: ["name"] } }]).length > 0);
});

test("assertSafe: catches a target id starting with drafts.", () => {
  assert.ok(assertSafe([{ patch: { id: "drafts.product-x", set: {} } }]).length > 0);
});

test("assertSafe: catches a drafts. id on createIfNotExists/createOrReplace, not only patch", () => {
  assert.ok(assertSafe([{ createIfNotExists: { _id: "drafts.glz-x", _type: "option" } }]).length > 0);
  assert.ok(assertSafe([{ createOrReplace: { _id: "drafts.thermal-x", _type: "thermalProfile" } }]).length > 0);
});

test("plan(): an existing NEW_PROFILES doc with an unexpected slug is a problem, never renamed", () => {
  const world = makeWorld();
  const target = NEW_PROFILES[0];
  world.fullProfiles = world.fullProfiles.map((p) =>
    p._id === target._id ? { ...p, slug: { _type: "slug", current: "some-other-slug" } } : p
  );
  const { mutations, problems } = plan(world);
  assert.ok(problems.some((p) => p.includes(target._id)), problems.join("\n"));
  assert.ok(!mutations.some((m) => m.createOrReplace?._id === target._id), "must not carry a rename");
});

test("plan(): create target referencing an unknown family/category is a problem", () => {
  const world = makeWorld();
  world.families = [];
  world.categories = [];
  const { problems } = plan(world);
  assert.ok(problems.some((p) => p.includes("family-awning-window")), problems.join("\n"));
  assert.ok(problems.some((p) => p.includes("category-windows")), problems.join("\n"));
});

test("disable patch sets exactly {disabled: true}", () => {
  const { mutations } = plan(makeWorld());
  const slug = DISABLE[0];
  const m = mutations.find((m) => m.patch?.id === `product-${slug}`);
  assert.deepEqual(m.patch.set, { disabled: true });
});

test("sheet product patch re-enables: a disabled fixture product gets disabled:false in its set", () => {
  const world = makeWorld();
  const slug = P.find((p) => !p.create).slug;
  world.products.get(slug).disabled = true;
  const { mutations } = plan(world);
  const m = mutations.find((m) => m.patch?.id === `product-${slug}`);
  assert.ok(m, "expected a patch mutation for this product");
  assert.equal(m.patch.set.disabled, false);
});

test("withdrawn set is the complement of the sheet: an off-list product not on P or DISABLE is disabled", () => {
  const world = makeWorld();
  world.products.set("off-list-product", { _id: "product-off-list-product", _rev: "rev-1", slug: { current: "off-list-product" }, disabled: false });
  const { mutations } = plan(world);
  const m = mutations.find((m) => m.patch?.id === "product-off-list-product");
  assert.ok(m, "expected a disable patch for an off-list product");
  assert.equal(m.patch.set.disabled, true);
});

test("same() ignores key order in nested objects", () => {
  assert.equal(same({ _type: "reference", _ref: "x" }, { _ref: "x", _type: "reference" }), true);
});

test("create target that exists under a different _id is a named problem, no mutation", () => {
  const world = makeWorld();
  const slug = "amj150st-awning-window";
  world.products.set(slug, { _id: "xyz", slug: { current: slug }, disabled: false });
  const { mutations, problems } = plan(world);
  assert.ok(problems.some((p) => p.includes(slug) && p.includes("xyz")), problems.join("\n"));
  assert.ok(!mutations.some((m) => m.patch?.id === `product-${slug}` || m.patch?.id === "xyz" || m.createIfNotExists?._id === `product-${slug}`));
});

test("patches carry ifRevisionID matching the fetched document's _rev", () => {
  const { mutations } = plan(makeWorld());
  const patches = mutations.filter((m) => m.patch);
  assert.ok(patches.length > 0, "expected at least one patch mutation");
  for (const m of patches) assert.equal(m.patch.ifRevisionID, "rev-1", JSON.stringify(m));
});

test("a document with no _rev in the world is a named problem, not an unguarded patch", () => {
  const world = makeWorld();
  const slug = DISABLE[0];
  world.products.set(slug, { _id: `product-${slug}`, slug: { current: slug }, disabled: false });
  const { mutations, problems } = plan(world);
  assert.ok(problems.some((p) => p.includes(slug) && p.includes("_rev")), problems.join("\n"));
  assert.ok(!mutations.some((m) => m.patch?.id === `product-${slug}`));
});

test("no set anywhere in the plan carries a slug key", () => {
  const { mutations } = plan(makeWorld());
  for (const m of mutations) {
    if (m.patch?.set) assert.ok(!("slug" in m.patch.set), JSON.stringify(m));
  }
});

test("product with null options and no hardware column: no options key in its patch set", () => {
  const world = makeWorld();
  const slug = "amj72t-fixed-window";
  const p = world.products.get(slug);
  p.options = null;
  const { mutations } = plan(world);
  const m = mutations.find((m) => m.patch?.id === p._id);
  assert.ok(m, "expected a patch mutation for this product");
  assert.ok(!("options" in m.patch.set), JSON.stringify(m.patch.set));
});

// Characterization test: plan() line 467 already pushes
// `profile ${id}: expected exactly one row...` whenever target.length !== 1,
// so a zero-match fixture passes immediately (no red phase needed).
test("one-row-published: zero-match fixture yields problem naming the profile", () => {
  const world = makeWorld();
  const [profileId] = Object.keys(KEEP_PUBLISHED);
  const pr = world.profiles.find((p) => p._id === profileId);
  pr.rows[0].glazing = "glz-nomatch";
  pr.rows[0].wersWindowId = "NOMATCH";
  const { problems } = plan(world);
  assert.ok(problems.some((p) => p.includes(profileId)), problems.join("\n"));
});

// Characterization test: plan() line 467's target.length !== 1 branch also
// fires on a two-match fixture (found 2), naming the profile.
test("one-row-published: two-match fixture yields problem naming the profile", () => {
  const world = makeWorld();
  const [profileId] = Object.keys(KEEP_PUBLISHED);
  const pr = world.profiles.find((p) => p._id === profileId);
  pr.rows[1].glazing = pr.rows[0].glazing;
  pr.rows[1].wersWindowId = pr.rows[0].wersWindowId;
  const { problems } = plan(world);
  assert.ok(problems.some((p) => p.includes(profileId) && p.includes("found 2")), problems.join("\n"));
});

// Characterization test: plan() line 468 pushes "no Uw/SHGC" when the kept
// row's uValue or shgc is null, regardless of the row otherwise matching.
test("one-row-published: kept row missing uValue yields problem naming the profile", () => {
  const world = makeWorld();
  const [profileId] = Object.keys(KEEP_PUBLISHED);
  const pr = world.profiles.find((p) => p._id === profileId);
  pr.rows[0].uValue = null;
  const { problems } = plan(world);
  assert.ok(problems.some((p) => p.includes(profileId) && p.includes("Uw/SHGC")), problems.join("\n"));
});

// Characterization test: apply-go-live-min.mjs line 110-113 returns 1 and
// logs each problem, before assertSafe or any write, whenever plan has problems.
test("run(): a plan with problems exits non-zero before any POST", async () => {
  const world = makeWorld();
  const { fetchImpl, requests } = makeTransport(world);
  const errors = [];
  const planImpl = () => ({ mutations: [], report: [], problems: ["profile x: broken"], summary: { amend: 0, create: 0 } });
  const code = await run({ write: false, fetchImpl, log: () => {}, error: (l) => errors.push(l), planImpl });
  assert.equal(code, 1);
  assert.ok(errors.some((l) => l.includes("profile x: broken")), errors.join("\n"));
  assert.equal(requests.filter((r) => r.method === "POST").length, 0);
});

// Characterization test: alignHardware line 426 sets availability:"standard"
// on the option matching hardwareId (column H).
test("alignHardware: sets column-H hardware to standard", () => {
  const options = [{ _key: "a", _type: "productOption", option: { _ref: "option-hardware-x" }, availability: "optional" }];
  const out = alignHardware(options, "option-hardware-x");
  assert.equal(out[0].availability, "standard");
});

// Characterization test: alignHardware line 427 demotes a different
// previously-standard hardware option to "optional".
test("alignHardware: demotes previous standard hardware to optional", () => {
  const options = [
    { _key: "a", _type: "productOption", option: { _ref: "option-hardware-old" }, availability: "standard" },
    { _key: "b", _type: "productOption", option: { _ref: "option-hardware-new" }, availability: "optional" },
  ];
  const out = alignHardware(options, "option-hardware-new");
  assert.equal(out.find((o) => o.option._ref === "option-hardware-old").availability, "optional");
  assert.equal(out.find((o) => o.option._ref === "option-hardware-new").availability, "standard");
});

// Characterization test: alignHardware line 429 appends a new standard row
// when hardwareId is absent from the list — length only grows, never shrinks.
test("alignHardware: appends when hardwareId absent, list never shrinks", () => {
  const options = [{ _key: "a", _type: "productOption", option: { _ref: "option-hardware-old" }, availability: "standard" }];
  const out = alignHardware(options, "option-hardware-new");
  assert.equal(out.length, 2);
  assert.ok(out.some((o) => o.option._ref === "option-hardware-new" && o.availability === "standard"));
});

// Characterization test: alignHardware line 425's `if (!isHardware(...)) continue`
// skips non-hardware options (isHardware requires an "option-hardware-" ref prefix, line 417).
test("alignHardware: leaves non-hardware options untouched", () => {
  const colour = { _key: "c", _type: "productOption", option: { _ref: "option-colour-red" }, availability: "standard" };
  const out = alignHardware([colour], "option-hardware-new");
  assert.deepEqual(out.find((o) => o._key === "c"), colour);
});

// Characterization test: buildDimensionRule line 412 always overwrites the
// four bound fields from p.dim, regardless of what existing carried.
test("buildDimensionRule: replaces bounds from p.dim", () => {
  const p = { dim: [700, 2100, 800, 2200] };
  const existing = { _type: "object", ruleVersion: "v1", minWidthMm: 1, maxWidthMm: 2, minHeightMm: 3, maxHeightMm: 4 };
  const rule = buildDimensionRule(p, existing);
  assert.deepEqual(
    { minWidthMm: rule.minWidthMm, maxWidthMm: rule.maxWidthMm, minHeightMm: rule.minHeightMm, maxHeightMm: rule.maxHeightMm },
    { minWidthMm: 700, maxWidthMm: 2100, minHeightMm: 800, maxHeightMm: 2200 },
  );
});

// Characterization test: buildDimensionRule line 412's `{ ...(existing ?? ...) }`
// spread carries any other field on existing (e.g. a foreign key) through untouched.
test("buildDimensionRule: carries an unrelated foreign key on existing through", () => {
  const p = { dim: [700, 2100, 800, 2200] };
  const existing = { _type: "object", ruleVersion: "v1", someRef: { _type: "reference", _ref: "other-doc" } };
  const rule = buildDimensionRule(p, existing);
  assert.deepEqual(rule.someRef, { _type: "reference", _ref: "other-doc" });
});

// Characterization test: buildDimensionRule line 414 recomputes maxAreaM2 only
// when existing already carried it as a number; otherwise it stays absent.
test("buildDimensionRule: recomputes maxAreaM2 only when existing had one", () => {
  const p = { dim: [700, 2000, 800, 2500] };
  const withArea = buildDimensionRule(p, { maxAreaM2: 1.23 });
  assert.equal(withArea.maxAreaM2, Math.round((2000 * 2500) / 10_000) / 100);
  const withoutArea = buildDimensionRule(p, {});
  assert.equal("maxAreaM2" in withoutArea, false);
});

// Characterization test: real P data (Grep confirmed) — the sliding/bi-fold/
// casement door entries carry minHeight 1900 (amj80t-casement-door is the
// known exception at 1500, excluded), and the AMJ80 slider's maxHeight is 2400.
test("P data: door minima are 1900, AMJ80 slider maxHeight is 2400", () => {
  const doors1900 = ["amj80-series-sliding-door", "amj100l-series-sliding-door", "amj150-series-sliding-door", "amj100t-series-casement-door", "amj100t-series-sliding-door", "amj68-series-bi-fold-door"];
  for (const slug of doors1900) assert.equal(P.find((p) => p.slug === slug).dim[2], 1900, slug);
  assert.equal(P.find((p) => p.slug === "amj80-series-sliding-door").dim[3], 2400);
});

// Characterization test: go-live-plan.mjs has no "delete" mutation builder
// anywhere in its source (Grep confirmed zero matches) — the real plan()
// output must never carry a delete key.
test("nothing-deleted: no mutation in the full plan carries a delete key", () => {
  const { mutations } = plan(makeWorld());
  for (const m of mutations) assert.ok(!("delete" in m), JSON.stringify(m));
});

// Characterization test: NEW_PROFILES rows built via the `derived()` helper
// (go-live-plan.mjs line 66-67) carry certificationRef "DERIVED — ...", no
// wersWindowId (row() only sets it when passed, derived() never passes it),
// and the owning P entry's notes name the derivation (lines 191/236/248/328/340).
test("field: derived rows carry DERIVED certificationRef, no wersWindowId, and the owning P notes say so", () => {
  let sawDerived = false;
  for (const profile of NEW_PROFILES) {
    for (const row of profile.rows) {
      if (!row.certificationRef?.startsWith("DERIVED")) continue;
      sawDerived = true;
      assert.equal(row.wersWindowId, undefined, profile.slug.current);
      const owner = P.find((p) => p.profile === `thermal-${profile.slug.current}`);
      assert.ok(owner, `no P entry uses profile thermal-${profile.slug.current}`);
      assert.ok(owner.notes?.toLowerCase().includes("derived"), owner.slug);
    }
  }
  assert.ok(sawDerived);
});

// Characterization test: real P data — every entry with uw:null (Grep
// confirmed 9 such entries) has no "Uw" mentioned in its marketing paragraphs.
test("field: no Uw claim in paragraphs when uw is null", () => {
  const withNullUw = P.filter((p) => p.uw === null);
  assert.ok(withNullUw.length > 0);
  for (const p of withNullUw) assert.ok(!p.paragraphs.join(" ").includes("Uw"), p.slug);
});

// Characterization test: P entry at line 133-135 names the AMJ80ST awning
// window and points at the thermally-broken profile; "amj80-awning" (the
// wrong, non-broken id) is confirmed absent anywhere in the file (Grep).
test("field: amj80-series-awning-window uses the thermally-broken profile and AMJ80ST name", () => {
  const p = P.find((p) => p.slug === "amj80-series-awning-window");
  assert.equal(p.profile, "thermal-amj80t-thermally-broken-awning-window");
  assert.equal(p.name, "AMJ80ST Awning Window");
  for (const entry of P) assert.ok(!entry.profile.includes("amj80-awning"), entry.slug);
});

// Characterization test: amj80t-casement-door P entry (Grep confirmed lines
// 154-157) is thermally broken with DG12 glass — the constant DG12
// (line 7) is the "5+12A+5mm clear double tempered glass" string.
test("field: amj80t-casement-door is thermally broken with 5+12+5 glass", () => {
  const p = P.find((p) => p.slug === "amj80t-casement-door");
  assert.equal(p.tb, true);
  assert.match(p.glass, /5\+12A\+5/);
});

// Characterization test: buildSpecs (go-live-plan.mjs line 377-389) has an
// unconditional ["Grade", p.grade] row and buildKeySpecs (line 390-401) an
// unconditional ["Grade", p.grade] chip — neither is gated behind a ternary.
test("field: specs and keySpecs both carry a Grade entry", () => {
  const p = P[0];
  const names = { family: "F", category: "C", hardware: null };
  assert.ok(buildSpecs(p, names).some((r) => r.label === "Grade" && r.value === p.grade));
  assert.ok(buildKeySpecs(p).some((r) => r.label === "Grade" && r.value === p.grade));
});

// Characterization test: colour default logic (go-live-plan.mjs line 534-538)
// patches any colour option whose isDefault disagrees with (_id === DEFAULT_COLOUR)
// — a wrongly-defaulted colour gets demoted to false, never removed.
test("field: Night Sky is the only isDefault colour, no colour removed", () => {
  const world = makeWorld();
  const wrong = { _id: "option-colour-wrong", _rev: "rev-1", name: "Wrong", isDefault: true, type: "colour" };
  world.options = [...world.options, wrong];
  const { mutations } = plan(world);
  assert.equal(mutations.find((m) => m.patch?.id === DEFAULT_COLOUR), undefined);
  const wrongPatch = mutations.find((m) => m.patch?.id === wrong._id);
  assert.equal(wrongPatch.patch.set.isDefault, false);
});

// Characterization test: P entries (Grep confirmed lines 111, 122, 349) patch
// amj72t-awning-window, amj72t-fixed-window and amj68-series-bi-fold-door to
// system "sys-80"; "sys-72" is confirmed absent from go-live-plan.mjs entirely.
test("field: AMJ72T pair and AMJ68 bi-fold patch frameSystem to sys-80, never sys-72", () => {
  for (const slug of ["amj72t-awning-window", "amj72t-fixed-window", "amj68-series-bi-fold-door"]) {
    assert.equal(P.find((p) => p.slug === slug).system, "sys-80", slug);
  }
  for (const p of P) assert.notEqual(p.system, "sys-72", p.slug);
});

// T4: plan() step 2 must skip createOrReplace for a NEW_PROFILES doc that
// already matches (converged) — no unconditional re-push of identical content.
test("NEW_PROFILES: converged fixture emits no createOrReplace for any of them", () => {
  const world = makeWorld();
  const { mutations } = plan(world);
  const ids = new Set(NEW_PROFILES.map((p) => p._id));
  const stray = mutations.filter((m) => m.createOrReplace && ids.has(m.createOrReplace._id));
  assert.deepEqual(stray, []);
});

// makeWorld() is deliberately pre-migration (drives the "21 amend, 1 create"
// dry-run test) — apply plan()'s own mutations to it ONCE, for a world with
// zero remaining drift, for the --verify tests below. One round is the fixed
// point a real --write run must reach: replanning the result must emit
// nothing (criterion 28).
function applyMutations(world, mutations) {
  const products = new Map(world.products);
  const options = [...world.options];
  for (const m of mutations) {
    if (m.createIfNotExists?._id?.startsWith("product-")) {
      const slug = m.createIfNotExists._id.slice("product-".length);
      products.set(slug, { ...m.createIfNotExists, slug: { current: slug } });
      continue;
    }
    if (!m.patch) continue; // NEW_PROFILES/glazing creates: already converged in makeWorld()
    const { id, set } = m.patch;
    const slug = id.startsWith("product-") ? id.slice("product-".length) : null;
    if (slug && products.has(slug)) { products.set(slug, { ...products.get(slug), ...set }); continue; }
    const oi = options.findIndex((o) => o._id === id);
    if (oi !== -1) { options[oi] = { ...options[oi], ...set }; continue; }
    throw new Error(`applyMutations: unhandled patch target ${id}`);
  }
  return { ...world, products, options };
}

function convergedWorld() {
  const world = makeWorld();
  const { mutations } = plan(world);
  const converged = applyMutations(world, mutations);
  const { mutations: remaining } = plan(converged);
  assert.deepEqual(remaining, [], "convergedWorld: did not converge in one round");
  return converged;
}

// T4: --verify replans and fails on any remaining mutation (drift), printing
// 'DRIFT <documentId>: <keys>' — patch keys via Object.keys(set), create via 'missing'.
test("run({verify:true}): converged fixture exits 0", async () => {
  const world = convergedWorld();
  const { fetchImpl } = makeTransport(world);
  const lines = [];
  const code = await run({ verify: true, fetchImpl, log: (l) => lines.push(l), error: (l) => lines.push(l) });
  assert.equal(code, 0);
  const total = P.length + DISABLE.length;
  assert.ok(lines.includes(`${total} products, ${P.length} on the sheet, 0 not as intended.`), lines.join("\n"));
});

test("run({verify:true}): altered fixture exits 1 and names the doc id and field", async () => {
  const docId = "thermal-amj80-glass-louvre";
  const world = altered(makeWorld(), docId, "frameTechnology", "wrong-value");
  const { fetchImpl } = makeTransport(world);
  const lines = [];
  const code = await run({ verify: true, fetchImpl, log: (l) => lines.push(l), error: (l) => lines.push(l) });
  assert.equal(code, 1);
  assert.ok(lines.some((l) => l.includes(`DRIFT ${docId}`) && l.includes("frameTechnology")), lines.join("\n"));
});

test("run({verify:true}): one bad row on the sheet fails verify and is counted", async () => {
  const world = convergedWorld();
  const badSlug = P.find((p) => !p.create).slug;
  world.products.set(badSlug, { ...world.products.get(badSlug), disabled: true });
  const { fetchImpl } = makeTransport(world);
  const lines = [];
  const code = await run({ verify: true, fetchImpl, log: (l) => lines.push(l), error: (l) => lines.push(l) });
  assert.equal(code, 1);
  const total = P.length + DISABLE.length;
  assert.ok(lines.includes(`${total} products, ${P.length} on the sheet, 1 not as intended.`), lines.join("\n"));
});

test("run({verify:true}): a missing sheet product is a verify failure that names it", async () => {
  const world = convergedWorld();
  const missingSlug = P.find((p) => !p.create).slug;
  world.products.delete(missingSlug);
  const { fetchImpl } = makeTransport(world);
  const lines = [];
  const code = await run({ verify: true, fetchImpl, log: (l) => lines.push(l), error: (l) => lines.push(l) });
  assert.equal(code, 1);
  assert.ok(lines.some((l) => l.includes(missingSlug)), lines.join("\n"));
});

// T5: rate-cards.sql is read-only in this suite (file never written to) —
// scan its text for the go-live-min safety criteria: 22 upserts (production
// already holds 4 of these ids, so a bare INSERT would collide), each
// starting a new card at v1 and bumping an existing one, glass excluded from
// the area rate reset to 0.
const RATE_CARDS_SQL_PATH = fileURLToPath(new URL("../../docs/runs/catalogue-go-live-min/rate-cards.sql", import.meta.url));
const rateCardsSql = readFileSync(RATE_CARDS_SQL_PATH, "utf8");
const rateCardsNoComments = rateCardsSql.replace(/--.*$/gm, "");
const rateCardsStatements = rateCardsNoComments.split(";").map((s) => s.trim()).filter(Boolean);

test("rate-cards.sql: no DELETE/DROP/ALTER/CREATE TABLE token once comments are stripped", () => {
  assert.doesNotMatch(rateCardsNoComments, /\b(DELETE|DROP|ALTER|CREATE TABLE)\b/i);
});

test("rate-cards.sql: exactly 22 upserts on pricing_rate_card, ids = the 22 sheet slugs", () => {
  assert.equal(rateCardsStatements.length, 22, rateCardsStatements.length);
  const sheetSlugs = new Set(P.map((p) => p.slug));
  assert.equal(sheetSlugs.size, 22, sheetSlugs.size);
  for (const stmt of rateCardsStatements) {
    assert.match(stmt, /^INSERT INTO pricing_rate_card\b/i, stmt);
    assert.match(stmt, /ON CONFLICT\(id\) DO UPDATE\b/i, stmt);
    const id = stmt.match(/VALUES\s*\('([^']+)'/i)?.[1];
    assert.ok(id && sheetSlugs.has(id), stmt);
  }
});

test("rate-cards.sql: every statement starts the card at 'v1' and bumps an existing card's version on conflict", () => {
  const VERSION_BUMP = `'v' || (CAST(substr(pricing_rate_card.version, 2) AS INTEGER) + 1)`;
  for (const stmt of rateCardsStatements) {
    const values = stmt.match(/VALUES\s*(\([^()]*\))/i)?.[1];
    assert.ok(values && /'v1'/.test(values), stmt);
    assert.ok(stmt.includes(VERSION_BUMP), stmt);
    assert.ok(stmt.includes("updated_at = datetime('now')"), stmt);
  }
});

test("rate-cards.sql: every statement resets glass_excluded_from_area_rate to 0 on both insert and conflict", () => {
  for (const stmt of rateCardsStatements) {
    const [values, doUpdate] = stmt.split(/ON CONFLICT/i);
    assert.match(values, /glass_excluded_from_area_rate\)\s*VALUES\s*\([^)]*,\s*0\)/i, stmt);
    assert.match(doUpdate, /glass_excluded_from_area_rate = 0\b/i, stmt);
  }
});

test("rate-cards.sql: 354.64 present, 322.40 (the ÷1.1 mistake) absent", () => {
  assert.ok(rateCardsSql.includes("354.64"));
  assert.ok(!rateCardsSql.includes("322.40"));
});

// FIX-3 item 2: loadWorld must drop draft entries before they reach the plan
// — a draft frameSystem sharing a published slug must never win the
// systemId map (Map dedup keeps the last entry for a repeated slug key).
test("loadWorld drops drafts: a draft frameSystem never wins over its published twin", async () => {
  const world = makeWorld();
  world.systems = [...world.systems, { _id: "drafts.frameSystem-sys-80", slug: "sys-80" }];
  const { fetchImpl } = makeTransport(world);
  const loaded = await loadWorld({ fetchImpl, token: null });
  assert.ok(!loaded.systems.some((s) => s._id.startsWith("drafts.")), JSON.stringify(loaded.systems));
  const { mutations, problems } = plan(loaded);
  assert.deepEqual(problems, []);
  const awning = mutations.find((m) => m.patch?.id === "product-amj72t-awning-window");
  assert.equal(awning.patch.set.frameSystem._ref, "system-80");
});

// FIX-3 item 3: a fetched product with no slug must not throw building the
// slug map, and must not silently vanish — it becomes a named problem.
test("loadWorld: a product with no slug becomes a named problem, not a crash or a silent drop", async () => {
  const world = makeWorld();
  const { fetchImpl } = makeTransport(world);
  const patchedFetch = async (url, init) => {
    const res = await fetchImpl(url, init);
    const isProductQuery = (init?.method ?? "GET") !== "POST" && (new URL(url).searchParams.get("query") ?? "").includes("familyName");
    if (!isProductQuery) return res;
    const body = await res.json();
    body.result = [...body.result, { _id: "product-no-slug", slug: null, familyName: "x", categoryName: "y" }];
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
  const loaded = await loadWorld({ fetchImpl: patchedFetch, token: null });
  const { problems } = plan(loaded);
  assert.ok(problems.some((p) => p.includes("product-no-slug")), JSON.stringify(problems));
});

test("source scan: apply-go-live-min.mjs and go-live-plan.mjs never mention child_process or wrangler", () => {
  const applySrc = readFileSync(fileURLToPath(new URL("../catalogue/apply-go-live-min.mjs", import.meta.url)), "utf8");
  const planSrc = readFileSync(fileURLToPath(new URL("../catalogue/go-live-plan.mjs", import.meta.url)), "utf8");
  for (const src of [applySrc, planSrc]) {
    assert.ok(!src.includes("child_process"), src.slice(0, 40));
    assert.ok(!src.includes("wrangler"), src.slice(0, 40));
  }
});

test("write: an unsafe plan aborts before any POST", async () => {
  const world = makeWorld();
  const { fetchImpl, requests } = makeTransport(world);
  const savedToken = process.env.SANITY_WRITE_TOKEN;
  process.env.SANITY_WRITE_TOKEN = "fake-token";
  try {
    const planImpl = () => ({ mutations: [{ delete: { id: "product-x" } }], report: [], problems: [], summary: { amend: 0, create: 0 } });
    const code = await run({ write: true, fetchImpl, log: () => {}, error: () => {}, planImpl });
    assert.equal(code, 1);
    assert.equal(requests.filter((r) => r.method === "POST").length, 0);
  } finally {
    if (savedToken === undefined) delete process.env.SANITY_WRITE_TOKEN;
    else process.env.SANITY_WRITE_TOKEN = savedToken;
  }
});
