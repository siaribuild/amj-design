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
  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
