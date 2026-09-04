// Tester's OWN abuse probe for ops2-why-price-deltas (AC-13..18).
// Not a test file: outside Probity scope, run by hand, reports rather than asserts.
import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  Session, freePort, login, makeRunDir, run, staffEmail, stop, waitForUrl, viteCli, wranglerCli,
} from "./tests/helpers.mjs";

const results = [];
const record = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} :: ${detail}`);
};

const REQUIREMENT = { maxUValue: 3.9, minShgc: null, maxShgc: 0.44, basis: "default_envelope", absent: false };
const outcomeJson = (o) => JSON.stringify({
  productSlug: o.slug, sanityProductId: `sp-${o.slug}`, variantId: o.variantId ?? null,
  catalogueRevision: "rev-1", form: "single", tier: o.tier, rank: o.rank ?? null,
  selected: !!o.selected, competing: true, exclusions: o.exclusions ?? [], requirement: REQUIREMENT,
  thermal: {
    uValue: o.uValue ?? null, shgc: o.shgc ?? null,
    deviation: { uValue: null, minShgc: null, maxShgc: null },
    worstAxis: null, normalisedDeviation: null, absoluteMiss: null,
  },
  fit: { fits: true, widthMm: 1200, heightMm: 900, limit: null, breached: [] },
  ...(o.noPrice ? {} : { price: { total: o.price ?? 500, currency: "AUD", ok: true, deltaToSelected: o.delta ?? 0 } }),
  learned: o.learned ?? null,
});
const selectionJson = () => JSON.stringify({
  version: "ladder-v2", openingRef: "W05", requirement: REQUIREMENT, tolerance: 0.08,
  competingTier: "meets", selectedProductSlug: "amj80-series-awning-window", status: "ready",
  withheldIncomplete: [{ slug: "amj150-series-sliding-door", gaps: ["pricing"] }],
});
const variantSnapshot = (o) => JSON.stringify({
  variantId: o.variantId, glazingOptionSlug: "double-lowe", glazingClass: "double_lowe",
  uValue: o.uValue ?? null, shgc: o.shgc ?? null, frameType: "aluminium",
  frameTechnology: "conventional", published: true,
});
const OPTIONS = JSON.stringify({
  colour: "Dover White", hardware: "AMJ Standard Chain Winder", flyscreen: "None",
  installation: "Sub Sill & Head", glazing: "double-lowe",
});

const runDir = await makeRunDir("probe-why-abuse");
const assets = join(runDir, "assets");
const state = join(runDir, "state");
const wranglerEnv = {
  CLOUDFLARE_API_TOKEN: "wrangler-local-dev-not-a-real-credential",
  WRANGLER_LOG_PATH: join(runDir, "wrangler.log"),
  XDG_CONFIG_HOME: join(runDir, "config"),
};
let server;
let workerLog = "";
try {
  await run(process.execPath, [viteCli, "build", "--outDir", assets, "--emptyOutDir"]);
  await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "apertly-db", "--local", "--persist-to", state], { env: wranglerEnv });
  await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--file", "scripts/db/seed.sql"], { env: wranglerEnv });
  const sql = async (command) => {
    const r = await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command", command], { env: wranglerEnv });
    return JSON.parse(r.stdout)[0].results;
  };

  const candidate = async (id, o) => {
    await sql(`INSERT INTO candidate_result
        (id, selection_run_id, sanity_product_id, catalogue_rev, hard_rule_passed, rank, selected, selected_variant_id, performance_snapshot_json, price_snapshot_json, outcome_json)
      VALUES ('${id}','${o.runId}','sp-${o.slug}','rev-1',1, ${o.rank ?? "NULL"}, ${o.selected ? 1 : 0},
        ${o.variantId ? `'${o.variantId}'` : "NULL"}, ${o.variantId ? `'${variantSnapshot(o)}'` : "NULL"},
        '{"ok":true,"total":${o.price ?? 500},"currency":"AUD"}', '${outcomeJson(o)}')`);
  };

  // Project A: the ops-owned fixture carrying the four delta states.
  await sql(`INSERT INTO project (id, organisation_id, owner_user_id, title, status_customer, status_internal, public_ref)
             VALUES ('p_pa','org_demo','u_demo','Probe A','submitted','submitted','OF-Q-90001')`);
  await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, selected_variant_id, options_json, dims_json, qty, line_total, status, position, origin, performance_figures_json)
             VALUES ('ql_pa','p_pa','W05','Bed 2','amj80-series-awning-window','v-dg-lowe','${OPTIONS}','{"width":"1200","height":"900"}',1,700,'ready',0,'ai','{"uValue":3.72,"shgc":0.41}')`);
  await sql(`INSERT INTO opening_instance (id, project_id, external_ref, width_mm, height_mm, quote_line_id, status)
             VALUES ('op_pa','p_pa','W05',1200,900,'ql_pa','ready')`);
  await sql(`INSERT INTO selection_run (id, opening_id, project_id, catalogue_revision, rule_version, ranker_version, selection_json, status, created_at)
             VALUES ('sr_pa','op_pa','p_pa','rev-1','rules-1','ladder-v2','${selectionJson()}','completed', datetime('now','-1 hours'))`);
  await candidate("cr_pa1", { runId: "sr_pa", slug: "amj80-series-awning-window", variantId: "v-dg-lowe", tier: "meets", rank: 1, selected: true, uValue: 3.72, shgc: 0.41, price: 700, delta: 0 });
  await candidate("cr_pa2", {
    runId: "sr_pa", slug: "amj100l-series-awning-window", variantId: "v-b", tier: "meets", rank: 2,
    uValue: 3.8, shgc: 0.4, price: 800, delta: 100,
    exclusions: [{ constraint: "dimensions", detail: { maxWidthMm: 1000 } }],
    learned: { retrievalKey: "rk_probe", observations: 3, support: 2, wouldPrefer: true, applied: false },
  });
  await candidate("cr_pa3", { runId: "sr_pa", slug: "amj100t-awning-window", variantId: "v-c", tier: "within_tolerance", rank: 3, uValue: 4.05, shgc: 0.42, price: 500, delta: -200 });
  await candidate("cr_pa4", { runId: "sr_pa", slug: "amj150-series-awning-window", variantId: "v-e", tier: "thermal_unknown", rank: 4, uValue: null, shgc: null, noPrice: true });

  // AC-6: a WHOLE legacy record, no price object on ANY outcome.
  await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, selected_variant_id, options_json, dims_json, qty, line_total, status, position, performance_figures_json)
             VALUES ('ql_legacy','p_pa','W06','Bed 3','amj80-series-awning-window','v-dg-lowe','${OPTIONS}','{"width":"1200","height":"900"}',1,700,'ready',1,'{"uValue":3.72,"shgc":0.41}')`);
  await sql(`INSERT INTO opening_instance (id, project_id, external_ref, width_mm, height_mm, quote_line_id, status)
             VALUES ('op_legacy','p_pa','W06',1200,900,'ql_legacy','ready')`);
  await sql(`INSERT INTO selection_run (id, opening_id, project_id, catalogue_revision, rule_version, ranker_version, selection_json, status, created_at)
             VALUES ('sr_legacy','op_legacy','p_pa','rev-1','rules-1','ladder-v2','${selectionJson()}','completed', datetime('now','-2 hours'))`);
  await candidate("cr_lg1", { runId: "sr_legacy", slug: "amj80-series-awning-window", variantId: "v-dg-lowe", tier: "meets", rank: 1, selected: true, uValue: 3.72, shgc: 0.41, noPrice: true });
  await candidate("cr_lg2", { runId: "sr_legacy", slug: "amj100l-series-awning-window", variantId: "v-b", tier: "meets", rank: 2, uValue: 3.8, shgc: 0.4, noPrice: true });
  await candidate("cr_lg3", { runId: "sr_legacy", slug: "amj100t-awning-window", variantId: "v-c", tier: "misses", rank: 3, uValue: 4.4, shgc: 0.5, noPrice: true });

  // Project B: a DIFFERENT organisation's project, for the cross-account attempt.
  await sql(`INSERT INTO project (id, organisation_id, owner_user_id, title, status_customer, status_internal, public_ref)
             VALUES ('p_pb','org_north','u_sarah','Probe B','submitted','submitted','OF-Q-90002')`);
  await sql(`INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, options_json, dims_json, qty, line_total, status, position, performance_figures_json)
             VALUES ('ql_pb','p_pb','W01','Bed 1','amj80-series-awning-window','${OPTIONS}','{"width":"1200","height":"900"}',1,700,'ready',0,'{"uValue":3.72,"shgc":0.41}')`);

  // A signed-in MANUFACTURER partner (AC-14).
  await sql(`INSERT INTO user (id, email, name, type, role, last_verified_at)
             VALUES ('u_mfrp','probefab@openframe.com.au','Probe Fabrication','internal','manufacturer', datetime('now'))`);

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  // helpers.start() discards stdio; AC-18 needs the worker's own output, so spawn directly.
  const child = spawn(process.execPath, [
    wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
    "--persist-to", state, "--assets", assets, "--log-level", "warn",
    "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:",
    "--var", "SANITY_PROJECT_ID:", "--var", "AI_EXTRACTION_MODE:manual",
  ], { cwd: process.cwd(), env: { ...process.env, ...wranglerEnv }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (b) => { workerLog += b.toString(); });
  child.stderr.on("data", (b) => { workerLog += b.toString(); });
  server = { child, output: () => workerLog.slice(-4000) };
  await waitForUrl(`${baseUrl}/api/health`, server);

  const path = (p, l) => `/api/ops/projects/${p}/lines/${l}/rationale`;
  const leaks = (raw) => ({
    name: /amj80|amj100|amj150|awning window/i.test(raw),
    thermal: /uValue|shgc|3\.72|0\.41/i.test(raw),
    money: /deltaToSelected|"total"|"price"|currency|AUD|\$|\d{3,}/i.test(raw),
  });
  const describe = (l) => `nameLeak=${l.name} thermalLeak=${l.thermal} moneyLeak=${l.money}`;

  // AC-15 unauthenticated.
  {
    const r = await new Session(baseUrl).request(path("p_pa", "ql_pa"));
    const raw = await r.text();
    const l = leaks(raw);
    record("AC-15 unauthenticated", (r.status === 401 || r.status === 403) && !l.name && !l.thermal && !l.money,
      `status=${r.status} body=${JSON.stringify(raw)} ${describe(l)}`);
  }

  // AC-14 signed-in manufacturer partner.
  {
    const partner = new Session(baseUrl);
    await login(partner, "/api/ops/auth", "probefab@openframe.com.au");
    const me = await partner.request("/api/ops/me");
    const meBody = await me.text();
    record("AC-14 partner session is genuinely signed in", me.status === 200,
      `GET /api/ops/me status=${me.status} body=${meBody.slice(0, 200)}`);
    const r = await partner.request(path("p_pa", "ql_pa"));
    const raw = await r.text();
    const l = leaks(raw);
    record("AC-14 manufacturer refused", r.status === 403 && !l.name && !l.thermal && !l.money,
      `status=${r.status} body=${JSON.stringify(raw)} ${describe(l)}`);
  }

  // AC-17 a signed-in CUSTOMER, on her own project and on someone else's.
  {
    const cust = new Session(baseUrl);
    await login(cust, "/api/auth", "sarah@northsidebuild.com.au");
    const own = await cust.request(path("p_pb", "ql_pb"));
    const ownRaw = await own.text();
    record("AC-17 customer refused on her OWN project", own.status === 401 || own.status === 403,
      `status=${own.status} body=${JSON.stringify(ownRaw)}`);
    const other = await cust.request(path("p_pa", "ql_pa"));
    const otherRaw = await other.text();
    const l = leaks(otherRaw);
    record("AC-17 customer refused cross-account", (other.status === 401 || other.status === 403) && !l.name && !l.thermal && !l.money,
      `status=${other.status} body=${JSON.stringify(otherRaw)} ${describe(l)}`);
  }

  // The staff session everything below runs as.
  const ops = new Session(baseUrl);
  await login(ops, "/api/ops/auth", staffEmail);

  // AC-13 the stored delta reaches the wire unchanged.
  {
    const r = await ops.request(path("p_pa", "ql_pa"));
    const body = await r.json();
    const got = [body.recommended?.deltaToSelected, ...(body.alternatives ?? []).map((a) => a.deltaToSelected)];
    record("AC-13 stored deltas pass through verbatim", JSON.stringify(got) === JSON.stringify([0, 100, -200, null]),
      `stored [0,100,-200,null] -> wire ${JSON.stringify(got)}`);
    const raw = JSON.stringify(body);
    record("AC-11 allow-list holds", !/exclusions|learned|retrievalKey|"total"|"currency"|AUD|"price"/i.test(raw),
      `forbidden keys absent=${!/exclusions|learned|retrievalKey|"total"|"currency"|AUD|"price"/i.test(raw)}; deltaToSelected present=${/deltaToSelected/.test(raw)}`);
  }

  // AC-6 a whole legacy record.
  {
    const r = await ops.request(path("p_pa", "ql_legacy"));
    const body = await r.json();
    const got = [body.recommended?.deltaToSelected, ...(body.alternatives ?? []).map((a) => a.deltaToSelected)];
    record("AC-6 legacy record, no price object anywhere",
      r.status === 200 && body.kind === "recommendation" && got.length === 3 && got.every((d) => d === null),
      `status=${r.status} kind=${body.kind} deltas=${JSON.stringify(got)} figures=${JSON.stringify(body.recommended?.figures)} tolerance=${body.tolerance}`);
  }

  // AC-16 tampered / cross-project ids.
  const tampered = [
    ["line from another project", path("p_pa", "ql_pb")],
    ["project of another org with own line", path("p_pb", "ql_pa")],
    ["unknown line", path("p_pa", "ql_nope")],
    ["unknown project", path("p_nope", "ql_pa")],
    ["double-quote injection", path("p_pa", encodeURIComponent('ql_pa" OR 1=1 --'))],
    ["single-quote injection", path("p_pa", encodeURIComponent("ql_pa' OR '1'='1"))],
    ["LIKE wildcard", path("p_pa", encodeURIComponent("%"))],
    ["path traversal", path("p_pa", encodeURIComponent("../../p_pa/lines/ql_pa"))],
  ];
  for (const [label, p] of tampered) {
    const r = await ops.request(p);
    const raw = await r.text();
    const l = leaks(raw);
    record(`AC-16 ${label}`, r.status === 404 && !l.name && !l.thermal && !l.money,
      `status=${r.status} body=${JSON.stringify(raw.slice(0, 160))} ${describe(l)}`);
  }

  // Write methods on a read surface.
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    const r = await ops.request(path("p_pa", "ql_pa"), { method, json: { deltaToSelected: 999999 } });
    record(`read-only ${method}`, r.status === 404 || r.status === 405, `status=${r.status}`);
  }
  {
    const r = await ops.request(path("p_pa", "ql_pa"));
    const body = await r.json();
    const after = body.alternatives.map((a) => a.deltaToSelected);
    record("read-only: deltas unchanged after write attempts",
      JSON.stringify(after) === JSON.stringify([100, -200, null]), `deltas=${JSON.stringify(after)}`);
  }

  // AC-18 no manufacturer price / cost / uplift in log output.
  {
    const money = /uplift|manufacturer_price|cost|deltaToSelected|"total"|\$\s?\d/i.exec(workerLog);
    record("AC-18 worker log carries no money", money === null,
      money
        ? `matched ${JSON.stringify(money[0])} in: ${JSON.stringify(workerLog.slice(Math.max(0, money.index - 120), money.index + 120))}`
        : `${workerLog.length} bytes of worker output scanned, no match`);
  }
} finally {
  if (server) await stop(server);
  console.log(`\n--- probe summary: ${results.filter((r) => r.ok).length}/${results.length} pass ---`);
  for (const r of results.filter((r) => !r.ok)) console.log(`FAILED ${r.id}: ${r.detail}`);
  console.log(`runDir: ${runDir}`);
}
