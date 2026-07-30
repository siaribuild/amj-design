// /api/debug — ADMIN / DEBUG ONLY. Read-only inspection of the resolved thermal
// envelope values that fed product selection, per opening, keyed by quote number.
//
// SECURITY: gated by a single shared secret (THERMAL_DEBUG_KEY), NOT by a login,
// so it is convenient for internal debugging without an ops account. It is
// disabled (404) unless the secret is configured, and the key is required and
// constant-time compared so quote numbers can't be enumerated. The payload is
// deliberately non-personal: opening refs, room labels, dimensions, required
// U-value/SHGC, extraction basis and the selected product's performance — never
// customer name/email/phone/address/postcode or uploaded filenames.
import { Hono } from "hono";
import type { Env } from "../types";

export const debug = new Hono<{ Bindings: Env }>();

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const obj = (s: string | null | undefined): Record<string, unknown> => {
  try { const v = s ? JSON.parse(s) : {}; return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  catch { return {}; }
};
const arr = (s: string | null | undefined): unknown[] => {
  try { const v = s ? JSON.parse(s) : []; return Array.isArray(v) ? v : []; } catch { return []; }
};
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

// GET /api/debug/thermal?key=... — recent AI parses (most recent first) so a
// draft can be found by its quote number BEFORE it is ever submitted. Registered
// drafts appear as soon as their AI run starts; anonymous quotes never parse and
// so never appear.
debug.get("/thermal", async (c) => {
  const expected = (c.env.THERMAL_DEBUG_KEY ?? "").trim();
  if (!expected || !safeEqual((c.req.query("key") ?? "").trim(), expected)) return c.json({ error: "not_found" }, 404);
  const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query("limit") ?? "50", 10) || 50));
  const { results } = await c.env.DB.prepare(
    `SELECT r.status AS run_status, r.source_generation, r.started_at, r.completed_at,
            p.public_ref, p.title, p.status_customer,
            (SELECT count(*) FROM opening_instance o WHERE o.project_id = p.id) AS openings
       FROM ai_runs r JOIN project p ON p.id = r.project_id
      ORDER BY r.started_at DESC LIMIT ?`,
  ).bind(limit).all<any>();
  return c.json({
    parses: (results ?? []).map((r) => ({
      quote: r.public_ref,               // ← use this with /api/debug/thermal/<quote>
      title: str(r.title),
      projectStatus: str(r.status_customer),   // draft = not yet submitted
      runStatus: str(r.run_status),            // running | completed | partial | failed
      generation: num(r.source_generation),
      openings: num(r.openings) ?? 0,
      startedAt: str(r.started_at),
      completedAt: str(r.completed_at),
    })),
  });
});

// GET /api/debug/thermal/:ref?key=... — the per-opening thermal resolution log.
debug.get("/thermal/:ref", async (c) => {
  const expected = (c.env.THERMAL_DEBUG_KEY ?? "").trim();
  const provided = (c.req.query("key") ?? "").trim();
  // Disabled until the secret is set; a wrong/absent key is indistinguishable
  // from a missing route so nothing about the endpoint can be probed.
  if (!expected || !safeEqual(provided, expected)) return c.json({ error: "not_found" }, 404);

  const ref = c.req.param("ref").trim().toUpperCase();
  const project = await c.env.DB.prepare("SELECT id, public_ref FROM project WHERE public_ref = ?")
    .bind(ref).first<{ id: string; public_ref: string }>();
  if (!project) return c.json({ error: "not_found" }, 404);

  // The latest published AI proposal pins the generation whose openings + selections
  // are the ones the customer sees; fall back to all openings when none published.
  const proposal = await c.env.DB.prepare(
    "SELECT id, source_generation FROM ai_proposal WHERE project_id = ? AND status = 'published' ORDER BY published_at DESC LIMIT 1",
  ).bind(project.id).first<{ id: string; source_generation: number }>();

  const { results: openings } = await c.env.DB.prepare(
    `SELECT id, external_ref, room, orientation, family, operation_type, width_mm, height_mm,
            requirements_json, options_json, context_json, requirement_basis, source_generation, status
       FROM opening_instance
      WHERE project_id = ? AND (? IS NULL OR source_generation = ?)
      ORDER BY external_ref`,
  ).bind(project.id, proposal?.source_generation ?? null, proposal?.source_generation ?? null)
    .all<any>();

  // Selected-product performance per opening, from the published proposal.
  const selectedByOpening = new Map<string, any>();
  if (proposal) {
    const { results: lines } = await c.env.DB.prepare(
      `SELECT opening_id, product_slug, performance_variant_id, performance_json,
              confidence_band, missing_inputs_json, recommendation_basis, review_required
         FROM ai_proposal_line WHERE proposal_id = ?`,
    ).bind(proposal.id).all<any>();
    for (const l of lines ?? []) selectedByOpening.set(l.opening_id, l);
  }

  const out = (openings ?? []).map((o) => {
    const req = obj(o.requirements_json);
    const opts = obj(o.options_json);
    const ctx = obj(o.context_json);
    const sel = selectedByOpening.get(o.id);
    const perf = sel ? obj(sel.performance_json) : {};
    return {
      opening: o.external_ref,
      room: str(o.room),
      orientation: str(o.orientation) ?? str(ctx.orientation),
      family: str(o.family),
      operation: str(o.operation_type),
      dimensionsMm: { width: num(o.width_mm), height: num(o.height_mm) },
      required: {
        maxUValue: num(req.maxUValue),
        minShgc: num(req.minShgc),
        maxShgc: num(req.maxShgc),
        basis: str(o.requirement_basis),          // energy_report | schedule_specification | building_context | default_envelope
      },
      extracted: {
        glass: str(opts.glassDescription),
        doubleGlazed: typeof opts.doubleGlazed === "boolean" ? opts.doubleGlazed : null,
        colour: str(opts.colour),
        flyscreen: typeof opts.flyscreen === "boolean" ? opts.flyscreen : null,
        climateZone: str(ctx.climateZone) ?? num(ctx.climateZone),
        jurisdiction: str(ctx.jurisdiction),
        riskBand: str(ctx.riskBand),
        envelopeClass: str(ctx.envelopeClass),
        buildingClass: str(ctx.buildingClass),
      },
      selected: sel ? {
        productSlug: str(sel.product_slug),
        variantId: str(sel.performance_variant_id),
        uw: num(perf.uw),
        shgc: num(perf.shgc),
        certified: typeof perf.certified === "boolean" ? perf.certified : null,
        performanceSource: str(perf.source),      // certified | estimated
        confidence: str(sel.confidence_band),
        reviewRequired: sel.review_required === 1,
        missingInputs: arr(sel.missing_inputs_json).filter((v): v is string => typeof v === "string"),
      } : null,
      status: str(o.status),
    };
  });

  return c.json({
    quote: project.public_ref,
    generation: proposal?.source_generation ?? null,
    hasPublishedProposal: !!proposal,
    openings: out,
  });
});

// GET /api/debug/ai-probe?key=…&samples=N — TEMPORARY capability probe (remove
// after use). Both research passes established that whether Cloudflare's binding
// forwards Gemini 3.x thinking controls is UNDOCUMENTED, and this codebase has
// already taken an HTTP 400 (7003) from an unaccepted field — so the thinking
// cap cannot ship on faith. This settles it empirically against the real binding
// + gateway: it fires the SAME synthetic (non-customer) schedule through several
// generationConfig shapes and reports, per shape, whether it was accepted, the
// wall time, and whether usageMetadata.thoughtsTokenCount comes back.
//
// The prompt is a hand-written fake schedule — no customer data, no R2, no DB
// writes. Cost is a few cents. Gated by the same THERMAL_DEBUG_KEY as above.
debug.get("/ai-probe", async (c) => {
  const expected = (c.env.THERMAL_DEBUG_KEY ?? "").trim();
  if (!expected || !safeEqual((c.req.query("key") ?? "").trim(), expected)) return c.json({ error: "not_found" }, 404);
  if (!c.env.AI) return c.json({ error: "ai_unbound" }, 409);

  const samples = Math.min(5, Math.max(1, Number.parseInt(c.req.query("samples") ?? "3", 10) || 3));
  const model = (c.env.AI_PRIMARY_MODEL || "").trim() || "google/gemini-3.6-flash";
  const gatewayOpts = c.env.AI_GATEWAY_ID ? { gateway: { id: c.env.AI_GATEWAY_ID, collectLog: false } } : undefined;

  // A synthetic schedule with the same *shape* as a real one (so thinking load
  // is comparable) but entirely invented — no customer content.
  const fakeSchedule = [
    "WINDOW SCHEDULE",
    "REF  W(mm) H(mm)  TYPE     GLAZING        U-VALUE  SHGC",
    ...Array.from({ length: 15 }, (_, i) =>
      `W${String(i + 1).padStart(2, "0")}  ${900 + i * 40} ${1200 + i * 30}  ${["AWNING", "SLIDING", "FIXED"][i % 3]}  DOUBLE CLEAR  ${(2.6 + (i % 4) * 0.2).toFixed(1)}     ${(0.4 + (i % 3) * 0.05).toFixed(2)}`),
  ].join("\n");
  const prompt = `Extract every row of this window schedule as JSON: {"lines":[{"tag","widthMm","heightMm","type","uValue","shgc"}]}. Return JSON only.\n\n${fakeSchedule}`;
  const parts = [{ text: prompt }];

  // The request shapes to test. Each is the working baseline body plus one
  // candidate thinking control, in every spelling the docs disagree on. A 7003
  // (or any 4xx) on a shape means the binding rejects that field.
  const base = { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 32768 } };
  const shapes: { name: string; body: unknown }[] = [
    { name: "baseline", body: base },
    { name: "genCfg.thinkingLevel=low", body: { contents: base.contents, generationConfig: { ...base.generationConfig, thinkingLevel: "low" } } },
    { name: "genCfg.thinkingConfig.thinkingLevel=low", body: { contents: base.contents, generationConfig: { ...base.generationConfig, thinkingConfig: { thinkingLevel: "low" } } } },
    { name: "genCfg.thinkingConfig.thinkingBudget=128", body: { contents: base.contents, generationConfig: { ...base.generationConfig, thinkingConfig: { thinkingBudget: 128 } } } },
    { name: "genCfg.thinking_config.thinking_level=low", body: { contents: base.contents, generationConfig: { ...base.generationConfig, thinking_config: { thinking_level: "low" } } } },
  ];

  const results: unknown[] = [];
  for (const shape of shapes) {
    const runs: unknown[] = [];
    for (let i = 0; i < samples; i++) {
      const startedAt = Date.now();
      try {
        const out: any = await (c.env.AI as any).run(model, shape.body, gatewayOpts);
        const u = out?.usageMetadata ?? {};
        runs.push({
          ok: true, ms: Date.now() - startedAt,
          promptTokens: num(u.promptTokenCount), answerTokens: num(u.candidatesTokenCount),
          thoughtTokens: num(u.thoughtsTokenCount),           // ← the field that may not come back on 3.x
          finishReason: str(out?.candidates?.[0]?.finishReason),
        });
      } catch (e) {
        runs.push({ ok: false, ms: Date.now() - startedAt, error: String(e instanceof Error ? `${e.name}: ${e.message}` : e).slice(0, 200) });
      }
    }
    const oks = runs.filter((r: any) => r.ok);
    results.push({
      shape: shape.name,
      accepted: oks.length > 0,                               // false ⇒ binding rejects this field (probable 7003)
      msSamples: runs.map((r: any) => r.ms),
      runs,
    });
  }
  return c.json({ model, gateway: !!gatewayOpts, samples, note: "temporary capability probe — remove after use", results });
});
