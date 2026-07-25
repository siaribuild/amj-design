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
