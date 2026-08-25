// Phase 3b of ops2 "Why this product": the READ seam, over a real Worker and a
// real local D1 (boot copied from why-capture-api.test.mjs, itself from
// thermal-calibration-api/delivery/api-edge).
//
// What only this suite can answer: what the SERVER sends. Every deliberate
// absence on this surface — excluded candidates, withheld products, money — is
// enforced at DTO construction, so the evidence has to be the raw response body
// and not a rendered screen. The fixtures below therefore carry each forbidden
// thing in the STORED row, so an assertion that it is absent from the body is
// an assertion something was removed rather than an assertion nothing existed.
//
// The harness runs with SANITY_PROJECT_ID empty. That is not a limitation here,
// it is WHY-AC-18: this surface must issue no catalogue or estimator call at
// all, so a completely unreachable catalogue changes nothing about what it says.
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  Session, freePort, login, makeRunDir, removeRunDir, requestJson, run,
  staffEmail, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";

/** The requirement every candidate in the fixture was judged against. */
const REQUIREMENT = {
  maxUValue: 3.9, minShgc: null, maxShgc: 0.44,
  basis: "default_envelope", absent: false,
};

/** A stored `CandidateOutcome` (src/data/recommendation.ts), written exactly as
 *  `persist.ts` writes it. Every field is present, including the ones this
 *  surface must never forward. */
const outcomeJson = (o) => JSON.stringify({
  productSlug: o.slug,
  sanityProductId: `sp-${o.slug}`,
  variantId: o.variantId ?? null,
  catalogueRevision: "rev-1",
  form: o.form ?? "single",
  ...(o.units ? { units: o.units } : {}),
  tier: o.tier,
  rank: o.rank ?? null,
  selected: !!o.selected,
  competing: o.competing ?? true,
  exclusions: o.exclusions ?? [],
  requirement: o.requirement ?? REQUIREMENT,
  thermal: {
    uValue: o.uValue ?? null, shgc: o.shgc ?? null,
    deviation: { uValue: null, minShgc: null, maxShgc: null },
    worstAxis: null, normalisedDeviation: null, absoluteMiss: null,
  },
  fit: {
    fits: o.fits ?? true, widthMm: 1200, heightMm: 900, limit: null,
    breached: o.breached ?? [],
  },
  // MONEY IS IN THE STORED ROW. D18 is "no money anywhere" on the surface, and
  // a criterion asserting its absence proves nothing unless the source has it.
  price: {
    total: o.price ?? 500, currency: "AUD", ok: true,
    deltaToSelected: o.delta ?? 0,
  },
  learned: null,
});

/** The run's own `SelectionOutcome`. It carries `withheldIncomplete`, which the
 *  body must never repeat (X-AC-5, D18). */
const selectionJson = (o = {}) => JSON.stringify({
  version: "ladder-v2",
  openingRef: "W05",
  requirement: o.requirement ?? REQUIREMENT,
  tolerance: o.tolerance ?? 0.08,
  competingTier: o.competingTier ?? "meets",
  selectedProductSlug: o.selectedProductSlug ?? "amj80-series-awning-window",
  status: "ready",
  withheldIncomplete: [{ slug: "amj150-series-sliding-door", gaps: ["pricing", "dimension_rules"] }],
});

/** The variant the recommendation actually named, stored where `persist.ts`
 *  stores it. Its `glazingOptionSlug` is the recorded glass identity — the
 *  attribution comparison's third term (§7.0), and a STORED fact. */
const variantSnapshot = (o) => JSON.stringify({
  variantId: o.variantId,
  glazingOptionSlug: o.glazing,
  glazingClass: "double_lowe",
  uValue: o.uValue ?? null, shgc: o.shgc ?? null,
  frameType: "aluminium", frameTechnology: "conventional", published: true,
});

const OPTIONS = (glazing) => JSON.stringify({
  colour: "Dover White", hardware: "AMJ Standard Chain Winder",
  flyscreen: "None", installation: "Sub Sill & Head", glazing,
});

/** A body carrying anything this surface must never send. Exercised against a
 *  body that DOES leak before it is trusted to report a clean one. */
const mentionsMoney = (body) => {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return /\$|"price"|"total"|"currency"|"AUD"|deltaToSelected|GST/i.test(raw);
};
const mentionsWithheld = (body) => {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return /withheld|amj150-series-sliding-door|dimension_rules/i.test(raw);
};
const mentionsExclusion = (body) => {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return /"excluded"|exclusions|"constraint"|maxWidthMm/i.test(raw);
};

test("the leak predicates can see a leak", () => {
  assert.equal(mentionsMoney({ rows: [{ price: { total: 500 } }] }), true);
  assert.equal(mentionsWithheld({ withheldIncomplete: [] }), true);
  assert.equal(mentionsExclusion({ exclusions: [{ constraint: "dimensions" }] }), true);
  const clean = { kind: "recommendation", recommended: { productSlug: "amj80-series-awning-window", tier: "meets" } };
  assert.equal(mentionsMoney(clean), false);
  assert.equal(mentionsWithheld(clean), false);
  assert.equal(mentionsExclusion(clean), false);
});

test("the rationale read, over a real Worker and D1", { timeout: 300_000 }, async (t) => {
  const runDir = await makeRunDir("why-rationale-api");
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

    // ── The fixture: one opening, one run, seven recorded candidates ────────
    await sql(`INSERT INTO project (id, organisation_id, owner_user_id, title, status_customer, status_internal, public_ref)
               VALUES ('p_rat','org_demo','u_demo','Rationale audit','submitted','submitted','OF-Q-20001')`);
    await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, selected_variant_id, options_json, dims_json, qty, line_total, status, position, origin, performance_figures_json)
               VALUES ('ql_rat','p_rat','W05','Bed 2','amj80-series-awning-window','v-dg-lowe','${OPTIONS("double-lowe")}','{"width":"1200","height":"900"}',1,640,'ready',0,'ai','{"uValue":3.72,"shgc":0.41}')`);
    await sql(`INSERT INTO opening_instance (id, project_id, external_ref, room, family, operation_type, width_mm, height_mm, quote_line_id, status)
               VALUES ('op_rat','p_rat','W05','Bed 2','window','awning',1200,900,'ql_rat','ready')`);
    await sql(`INSERT INTO selection_run (id, opening_id, project_id, catalogue_revision, rule_version, ranker_version, selection_json, status, created_at)
               VALUES ('sr_rat','op_rat','p_rat','rev-1','rules-1','ladder-v2','${selectionJson()}','completed', datetime('now','-1 hours'))`);

    const candidate = async (id, o) => {
      await sql(`INSERT INTO candidate_result
                   (id, selection_run_id, sanity_product_id, catalogue_rev, hard_rule_passed, rank, selected, selected_variant_id, performance_snapshot_json, price_snapshot_json, outcome_json)
                 VALUES ('${id}','${o.runId ?? "sr_rat"}','sp-${o.slug}','rev-1',${o.tier === "excluded" ? 0 : 1},
                   ${o.rank ?? "NULL"}, ${o.selected ? 1 : 0}, ${o.variantId ? `'${o.variantId}'` : "NULL"},
                   ${o.variantId ? `'${variantSnapshot(o)}'` : "NULL"},
                   '{"ok":true,"total":${o.price ?? 500},"currency":"AUD"}',
                   '${outcomeJson(o)}')`);
    };

    await candidate("cr_1", {
      slug: "amj80-series-awning-window", variantId: "v-dg-lowe", glazing: "double-lowe",
      tier: "meets", rank: 1, selected: true, uValue: 3.72, shgc: 0.41, price: 640, delta: 0,
    });
    await candidate("cr_2", {
      slug: "amj100l-series-awning-window", variantId: "v-b", glazing: "double-clear",
      tier: "meets", rank: 2, uValue: 3.8, shgc: 0.4, price: 705, delta: 65,
    });
    await candidate("cr_3", {
      slug: "amj100t-awning-window", variantId: "v-c", glazing: "double-clear",
      tier: "within_tolerance", rank: 3, uValue: 4.05, shgc: 0.42, price: 690, delta: 50,
    });
    // WHY-AC-19: recorded, and no longer in the catalogue.
    await candidate("cr_4", {
      slug: "amj-discontinued-awning", variantId: "v-d", glazing: "double-clear",
      tier: "misses", rank: 4, uValue: 4.6, shgc: 0.44, price: 610, delta: -30,
    });
    await candidate("cr_5", {
      slug: "amj150-series-awning-window", variantId: "v-e", glazing: "single-clear",
      tier: "thermal_unknown", rank: 5, uValue: null, shgc: null, price: 590, delta: -50,
    });
    // The fifth runner-up: recorded, ranked, and beyond D18's cap of four.
    await candidate("cr_6", {
      slug: "amj65t-casement-windowoutward-opening", variantId: "v-f", glazing: "double-clear",
      tier: "does_not_fit", rank: 6, fits: false, breached: ["width"], uValue: 3.1, shgc: 0.5, price: 880, delta: 240,
    });
    // R9: excluded, with its reason, stored — and never forwarded.
    await candidate("cr_x", {
      slug: "amj80-series-casement-window", tier: "excluded", rank: null,
      exclusions: [{ constraint: "dimensions", detail: { maxWidthMm: 1000 } }],
      fits: false, breached: ["width"], price: 400, delta: -240,
    });

    // ── An OLDER run on the same opening (D19: the most recent only) ────────
    await sql(`INSERT INTO selection_run (id, opening_id, project_id, catalogue_revision, rule_version, ranker_version, selection_json, status, created_at)
               VALUES ('sr_old','op_rat','p_rat','rev-0','rules-0','ladder-v1','${selectionJson({ tolerance: 0.05, selectedProductSlug: "amj150-series-sliding-door" })}','completed', datetime('now','-9 days'))`);
    await candidate("cr_old", {
      runId: "sr_old", slug: "amj150-series-sliding-door", variantId: "v-old", glazing: "single-clear",
      tier: "meets", rank: 1, selected: true, uValue: 5.1, shgc: 0.6,
    });

    // ── The other three kinds, each on its own line ─────────────────────────
    /** A plain parent line. `figures` null leaves the COLUMN null, which is a
     *  different fact from a present-and-null (spec §9.0). */
    const bareLine = async (id, ref, figures = null) => {
      await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, options_json, dims_json, qty, line_total, status, position, performance_figures_json)
                 VALUES ('${id}','p_rat','${ref}','Room','amj80-series-sliding-window','${OPTIONS("double-clear")}','{"width":"1200","height":"900"}',1,500,'ready',0,${figures ? `'${figures}'` : "NULL"})`);
    };
    // R13/D6: nobody's estimator ever looked at this opening.
    await bareLine("ql_human", "W10", '{"uValue":4.1,"shgc":0.55}');
    // The pre-capture line: the column itself is NULL (spec §9.0, row 1).
    await bareLine("ql_nofig", "W11");

    // WHY-AC-10: a run whose candidate rows predate outcome_json (0055).
    await bareLine("ql_pre55", "W12");
    await sql(`INSERT INTO opening_instance (id, project_id, external_ref, width_mm, height_mm, quote_line_id, status)
               VALUES ('op_pre55','p_rat','W12',1200,900,'ql_pre55','ready')`);
    await sql(`INSERT INTO selection_run (id, opening_id, project_id, ranker_version, status)
               VALUES ('sr_pre55','op_pre55','p_rat','ladder-v0','completed')`);
    await sql(`INSERT INTO candidate_result (id, selection_run_id, sanity_product_id, catalogue_rev, hard_rule_passed, rank, selected)
               VALUES ('cr_p1','sr_pre55','sp-old','rev-0',1,1,1), ('cr_p2','sr_pre55','sp-old2','rev-0',1,2,0)`);

    // WHY-AC-9's second meaning, shape A: candidates recorded, none selected
    // (`persist.ts:143` — winner null, every row selected=0).
    await bareLine("ql_none", "W13", '{"uValue":null,"shgc":null}');
    await sql(`INSERT INTO opening_instance (id, project_id, external_ref, width_mm, height_mm, quote_line_id, status)
               VALUES ('op_none','p_rat','W13',1200,900,'ql_none','unavailable')`);
    await sql(`INSERT INTO selection_run (id, opening_id, project_id, ranker_version, selection_json, status)
               VALUES ('sr_none','op_none','p_rat','ladder-v2','${selectionJson({ competingTier: null })}','completed')`);
    await candidate("cr_n1", { runId: "sr_none", slug: "amj80-series-sliding-window", tier: "excluded", rank: null, exclusions: [{ constraint: "dimensions", detail: { maxWidthMm: 900 } }] });

    // Shape B of the SAME fact: everything was withheld, so the run persisted
    // with ZERO candidate rows. This is the vacuous-`every()` trap — an empty
    // set satisfies "every outcome_json is null", and the obvious spelling of
    // the pre-0055 test reports an earlier model for a run completed today.
    await bareLine("ql_zero", "W14", '{"uValue":null,"shgc":null}');
    await sql(`INSERT INTO opening_instance (id, project_id, external_ref, width_mm, height_mm, quote_line_id, status)
               VALUES ('op_zero','p_rat','W14',1200,900,'ql_zero','catalogue_data_incomplete')`);
    await sql(`INSERT INTO selection_run (id, opening_id, project_id, ranker_version, selection_json, status)
               VALUES ('sr_zero','op_zero','p_rat','ladder-v2','${selectionJson({ competingTier: null })}','completed')`);

    // ── WHY-AC-29's fixture: AI-originated, since overridden ────────────────
    // It resolves its opening through `ai_proposal_line_id` — the disjunction's
    // OTHER arm — and it carries `origin='ai'` with the proposal line set, so an
    // implementation that reads either of them calls this line platform-made.
    await sql(`INSERT INTO ai_runs (id, project_id, pipeline_version, status) VALUES ('air_1','p_rat','v1','completed')`);
    await sql(`INSERT INTO ai_proposal (id, project_id, ai_run_id, source_generation, source_manifest_hash, pipeline_version, status)
               VALUES ('ap_1','p_rat','air_1',1,'hash-1','v1','published')`);
    await sql(`INSERT INTO ai_proposal_line (id, proposal_id, project_id, opening_id, quote_line_id, external_ref, dimensions_json, product_slug, performance_variant_id, configuration_json, ranking_context_json, recommendation_basis, confidence_band)
               VALUES ('apl_1','ap_1','p_rat','op_rat',NULL,'W05','{"width":1200,"height":900}','amj80-series-awning-window','v-dg-lowe','{}','{}','ladder','high')`);
    await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, selected_variant_id, options_json, dims_json, qty, line_total, status, position, origin, ai_proposal_line_id, performance_figures_json)
               VALUES ('ql_over','p_rat','W05','Bed 2','amj100l-series-awning-window','v-b','${OPTIONS("double-lowe")}','{"width":"1200","height":"900"}',1,705,'ready',5,'ai','apl_1','{"uValue":3.8,"shgc":0.4}')`);

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    server = start(process.execPath, [
      wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
      "--persist-to", state, "--assets", assets, "--log-level", "warn",
      "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:",
      "--var", "SANITY_PROJECT_ID:", "--var", "AI_EXTRACTION_MODE:manual",
    ], { env: wranglerEnv });
    await waitForUrl(`${baseUrl}/api/health`, server);

    const ops = new Session(baseUrl);
    await login(ops, "/api/ops/auth", staffEmail);
    const rationale = (projectId, lineId, expected = 200) =>
      requestJson(ops, `/api/ops/projects/${projectId}/lines/${lineId}/rationale`, {}, expected);

    await t.test("WHY-AC-1/12/13 the most recent run's chosen product, then the next four by rank", async () => {
      const { body } = await rationale("p_rat", "ql_rat");
      assert.equal(body.kind, "recommendation");

      assert.equal(body.recommended.productSlug, "amj80-series-awning-window");
      assert.equal(body.recommended.productName, "AMJ80 Series Awning Window");
      assert.equal(body.recommended.tier, "meets");
      assert.deepEqual(body.recommended.figures, { uValue: 3.72, shgc: 0.41 });

      assert.deepEqual(
        body.alternatives.map((a) => a.productSlug),
        ["amj100l-series-awning-window", "amj100t-awning-window", "amj-discontinued-awning", "amj150-series-awning-window"],
        "the next FOUR by ascending rank — rank 6 is recorded and is not sent (D18: five rows)",
      );
      assert.equal(body.alternatives.length, 4);

      // WHY-AC-19: recorded facts survive the product leaving the catalogue.
      const gone = body.alternatives[2];
      assert.equal(gone.productName, "amj-discontinued-awning", "the slug stands in, and the row is neither blank nor dropped");
      assert.deepEqual(gone.figures, { uValue: 4.6, shgc: 0.44 });
    });

    await t.test("WHY-AC-6/25 the requirement and the tolerance come from the stored run", async () => {
      const { body } = await rationale("p_rat", "ql_rat");
      assert.deepEqual(body.requirement, {
        maxUValue: 3.9, minShgc: null, maxShgc: 0.44, basis: "default_envelope", absent: false,
      });
      assert.equal(body.tolerance, 0.08, "0.08 as stored — the skin renders 8%, and nothing here is hardcoded 0.05");
      assert.equal(body.competingTier, "meets");
    });

    await t.test("WHY-AC-4 'This one' is the LINE's own captured record", async () => {
      const { body } = await rationale("p_rat", "ql_rat");
      assert.deepEqual(body.current.figures, { uValue: 3.72, shgc: 0.41 });
      assert.equal(body.current.productSlug, "amj80-series-awning-window");
      assert.equal(body.current.productName, "AMJ80 Series Awning Window");
      // D16: the contract has no variant id to caption the figures with. The
      // absence is the mechanism — a skin cannot attribute figures to an id it
      // was never given.
      assert.equal("variantId" in body.current, false, "no variantId on `current`, anywhere in the contract");
    });

    await t.test("WHY-AC-14/15/16 + X-AC-5 nothing excluded, nothing withheld, no money", async () => {
      const { response } = await rationale("p_rat", "ql_rat");
      const raw = await (await ops.request("/api/ops/projects/p_rat/lines/ql_rat/rationale")).text();
      assert.equal(response.status, 200);
      assert.equal(mentionsExclusion(raw), false, "R9: no excluded candidate, no count of them, no reason text");
      assert.equal(mentionsWithheld(raw), false, "D18: the run's withheldIncomplete list is never forwarded");
      assert.equal(mentionsMoney(raw), false, "D18: no price, no delta, no currency symbol");
    });

    await t.test("D19 an opening estimated twice answers from the MOST RECENT run only", async () => {
      const { body } = await rationale("p_rat", "ql_rat");
      assert.equal(body.recommended.productSlug, "amj80-series-awning-window",
        "the run from an hour ago, not the one from nine days ago");
      assert.equal(body.tolerance, 0.08, "and its tolerance, not the older run's 0.05");
      const slugs = [body.recommended, ...body.alternatives].map((r) => r.productSlug);
      assert.equal(slugs.includes("amj150-series-sliding-door"), false,
        "the older run's candidates are neither listed nor merged in");
    });

    await t.test("WHY-AC-8/9 §9.0 the three states of a line nobody's estimator evaluated", async () => {
      const withFigures = await rationale("p_rat", "ql_human");
      assert.equal(withFigures.body.kind, "human");
      assert.deepEqual(withFigures.body.current.figures, { uValue: 4.1, shgc: 0.55 });
      assert.equal(withFigures.body.units, null, "a simple line has no units block");

      // Saved before the capture existed: the COLUMN is null, and that is a
      // different fact from a captured absence. Nothing fills it (D19).
      const preCapture = await rationale("p_rat", "ql_nofig");
      assert.equal(preCapture.body.kind, "human");
      assert.equal(preCapture.body.current.figures, null,
        "state 1 of §9.0 survives the trip: never captured, told apart from captured-and-nothing");
      assert.equal(preCapture.body.current.productSlug, "amj80-series-sliding-window",
        "and the product still stands — the gap is the figures, not the line");
    });

    await t.test("WHY-AC-10 a run that predates outcome_json says so, and reconstructs nothing", async () => {
      const { body } = await rationale("p_rat", "ql_pre55");
      assert.equal(body.kind, "unrecorded");
      assert.deepEqual(Object.keys(body), ["kind"],
        "nothing is rebuilt from the deleted model's columns — rank and selected are in those rows and stay there");
    });

    await t.test("WHY-AC-9 second meaning: a run that selected NOTHING is not a run with no reasoning", async () => {
      for (const [lineId, shape] of [
        ["ql_none", "candidates recorded, none selected"],
        // THE VACUOUS-`every()` TRAP. Zero rows satisfies "every outcome_json is
        // null", so the obvious pre-0055 test reports an earlier model here.
        ["ql_zero", "everything withheld, so zero candidate rows"],
      ]) {
        const { body } = await rationale("p_rat", lineId);
        assert.equal(body.kind, "unresolved", `${shape}: evaluated, nothing chosen`);
        assert.notEqual(body.kind, "unrecorded", `${shape} is not "an earlier model"`);
        assert.deepEqual(body.current.figures, { uValue: null, shgc: null },
          "the figures are present-and-null in BOTH cases — the KIND is what tells the two absences apart, never the figures");
      }
    });

    // ── R24 / WHY-AC-28-31: attribution, one variable at a time ─────────────
    await t.test("WHY-AC-29 an AI-originated line a person has overridden reads as person-chosen", async () => {
      const origin = await sql("SELECT origin, ai_proposal_line_id AS apl FROM quote_line WHERE id='ql_over'");
      assert.equal(origin[0].origin, "ai", "the fixture's origin says 'ai' — an override never moves it");
      assert.equal(origin[0].apl, "apl_1", "and its proposal line is still attached");

      const { body } = await rationale("p_rat", "ql_over");
      assert.equal(body.kind, "recommendation");
      assert.equal(body.recommended.productSlug, "amj80-series-awning-window", "the platform's pick, unchanged");
      assert.equal(body.current.productSlug, "amj100l-series-awning-window", "and what is on the line now");
      assert.equal(body.selectionChanged, true,
        "derived by comparing the picks — an implementation reading `origin` or `ai_proposal_line_id` answers 'platform' here");
    });

    await t.test("WHY-AC-22/28/30 the glass alone moves it, and moving it back unwinds nothing", async () => {
      const unchanged = await rationale("p_rat", "ql_rat");
      assert.equal(unchanged.body.selectionChanged, false, "the line still carries what was recommended");

      // ONE VARIABLE: the glass, and nothing else. The row deliberately KEEPS
      // the estimator's `selected_variant_id` (D16), so a product+variant
      // comparison would call this line platform-made.
      await sql(`UPDATE quote_line SET options_json='${OPTIONS("single-clear")}' WHERE id='ql_rat'`);
      const glazed = await rationale("p_rat", "ql_rat");
      assert.equal(glazed.body.selectionChanged, true, "R12: glazing differing is a change");
      const stale = await sql("SELECT selected_variant_id AS v FROM quote_line WHERE id='ql_rat'");
      assert.equal(stale[0].v, "v-dg-lowe",
        "and the row still names the estimator's variant — which is exactly why the comparison must not use it as the answer");
      assert.equal(glazed.body.recommended.productSlug, "amj80-series-awning-window",
        "WHY-AC-22: the platform's own recommendation is shown unchanged beside it");

      // WHY-AC-30: put it back. The comparison runs again; there is no state to
      // unwind because nothing was ever stored.
      await sql(`UPDATE quote_line SET options_json='${OPTIONS("double-lowe")}' WHERE id='ql_rat'`);
      const restored = await rationale("p_rat", "ql_rat");
      assert.equal(restored.body.selectionChanged, false, "it reads as platform-made once more, by the same comparison");
    });

    await t.test("WHY-AC-23 the frame alone moves it too", async () => {
      await sql(`UPDATE quote_line SET product_slug='amj100t-awning-window' WHERE id='ql_rat'`);
      const { body } = await rationale("p_rat", "ql_rat");
      assert.equal(body.selectionChanged, true);
      assert.equal(body.current.productName, "AMJ100T Awning Window", "'This one' follows the line");
      await sql(`UPDATE quote_line SET product_slug='amj80-series-awning-window' WHERE id='ql_rat'`);
      assert.equal((await rationale("p_rat", "ql_rat")).body.selectionChanged, false);
    });

    await t.test("WHY-AC-31 nothing on this path writes origin or ai_proposal_line_id", async () => {
      const before = await sql("SELECT origin, ai_proposal_line_id AS apl, product_slug AS p FROM quote_line WHERE id='ql_over'");
      await rationale("p_rat", "ql_over");
      await rationale("p_rat", "ql_rat");
      const after = await sql("SELECT origin, ai_proposal_line_id AS apl, product_slug AS p FROM quote_line WHERE id='ql_over'");
      assert.deepEqual(after, before, "reading a rationale changed no stored value");
    });
  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
