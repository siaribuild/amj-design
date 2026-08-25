// Composite openings — one opening built as two or more units joined on site.
//
// WHO MAY DO WHAT (the owner's constraint, enforced here rather than in the UI):
//   • the AI proposal path and ops may CREATE a split
//   • the customer may not. They see it, and they may question it.
// Nothing in this module takes a customer as an actor; the routes that call it
// are staff- or pipeline-scoped.
//
// INVARIANTS
//   1. The parent IS the customer's line. Its id, external_ref (W12), room and
//      opening dimensions never change when it becomes a composite.
//   2. Segments are quote_line rows with parent_line_id set. They carry no
//      external_ref — one opening, one architect tag.
//   3. `qty` on a segment is DERIVED: parent.qty × qty_per_parent, materialised
//      because computePrice, order_line and every customer view
//      read `qty` directly. The safety condition is a single writer — this
//      module — so it can never desync. Covered by a test.
//   4. The parent is never priced directly. Its line_total is Σ(segments), or
//      NULL if any segment is unpriced. Modifiers therefore apply PER FRAME,
//      which is the correct reading: "width > 1200mm ⇒ +10%" is a fact about a
//      manufactured frame, not about a hole in a wall.
import type { Env } from "../types";
import { priceItem } from "./lines";
import { uuid } from "./util";
import { captureOne, fetchFigureCatalogue, figuresJson, resolveFigures, storedOptions, storedPickOf, type LineFigures } from "./figures";
import { ensureCatalogue } from "./catalogue";
import { getProductBySlug } from "../../src/data/catalogue";
import type { UnitRequirementBasis } from "../../src/data/rationale";
import { fitsAlongside, systemsBuildableTogether } from "../../src/data/frameSystem";

/**
 * Why this product cannot join this opening, or null when it can.
 *
 * A composite is coupled frames, so they have to be the same extrusion platform:
 * differing depths clash at the mullion and read as a mistake to anyone standing
 * in front of the finished job. Nothing checked that, and a unit's product could
 * be set to anything with a slug.
 *
 * Returns a MESSAGE rather than a boolean because both callers need the words:
 * the customer route refuses with it, and ops saves anyway and stamps it as a
 * review reason. Same rule, same sentence, one place to change it.
 *
 * Null for an untagged product — its own or a sibling's. Unknown never blocks;
 * the catalogue is tagged by hand and an absent fact must not cost an edit.
 */
export async function compatibilityConflict(env: Env, args: {
  parentId: string; segmentId: string; productSlug: string;
}): Promise<string | null> {
  await ensureCatalogue(env);
  const product = getProductBySlug(args.productSlug);
  const candidate = product?.frameSystem ?? null;
  if (!candidate) return null;
  const { results } = await env.DB.prepare(
    "SELECT product_slug FROM quote_line WHERE parent_line_id=? AND id<>?",
  ).bind(args.parentId, args.segmentId).all<{ product_slug: string }>();
  const siblings = (results ?? []).map((r) => getProductBySlug(r.product_slug)?.frameSystem ?? null);
  if (fitsAlongside(candidate, siblings)) return null;
  const clash = siblings.find((s) => s && !systemsBuildableTogether(candidate, s));
  const named = (s: { slug: string; name: string | null } | null | undefined) => s?.name || s?.slug || "another system";
  return `${product?.name ?? args.productSlug} is a ${named(candidate)} frame and the other units of this opening `
    + `are ${named(clash)}. Frames of different depth do not couple, so they cannot be joined in one opening.`;
}

export interface CompositePolicy {
  toleranceMm: number;
  defaultJoinerMm: number;
  maxSegments: number;
}

export async function loadCompositePolicy(env: Env): Promise<CompositePolicy> {
  const row = await env.DB
    .prepare("SELECT tolerance_mm, default_joiner_mm, max_segments FROM composite_policy WHERE id='default'")
    .first<{ tolerance_mm: number; default_joiner_mm: number; max_segments: number }>();
  // No silent fallback to invented numbers: the row is seeded by migration 0028
  // and its absence is a deployment fault worth surfacing.
  if (!row) throw new Error("composite_policy row 'default' missing");
  return { toleranceMm: row.tolerance_mm, defaultJoinerMm: row.default_joiner_mm, maxSegments: row.max_segments };
}

// SCAFFOLD WS5 (thermal rework): a segment (composite lite) carries its OWN
// resolved band + basis so its glass is picked to meet that band, not copied from
// the parent. Persisted via migration 0036 (segment_requirements_json etc.).
// Fill: add `resolvedBand?` + `requirementBasis?` here and thread through
// splitLine/addSegment/updateSegment + the estimator glass selection. Plan §5/WS5.
export interface SegmentSpec {
  widthMm: number;
  heightMm: number;
  productSlug: string;
  qtyPerParent?: number;
  /** Uncoerced, as stored: `options_json` may hold non-string values. */
  options?: Record<string, unknown>;
  selectedVariantId?: string | null;
  resolvedBand?: { maxUValue: number | null; minShgc: number | null; maxShgc: number | null; shgcTarget?: number | null } | null;
  /** THE SHARED UNION, not `string`. `string | null` is what let two
   *  vocabularies into one column and a third into its reader — see
   *  `src/data/rationale.ts`. A new spelling is now a compile error. */
  requirementBasis?: UnitRequirementBasis | null;
  thermalReview?: boolean;
  /** The machine's frozen account of what it chose for THIS unit. A unit never
   *  gets an ai_proposal_line — that table requires an opening_instance and a
   *  unit has none — so this is the only per-unit record of the proposal that
   *  exists. Written once, here; no human path updates it (updateSegment's SET
   *  clause omits the column), so it stays the machine's answer. */
  configurationSnapshot?: Record<string, unknown> | null;
}

export interface SplitValidation {
  ok: boolean;
  errors: string[];
  coverageDeltaMm: number;
}

/** Geometry check, independent of D1 so it is unit-testable and so the route and
 *  any future planner validate against exactly the same rules.
 *
 *  Coverage is REPORTED, not vetoed: coupled frames carry real mullion and jamb
 *  allowances and the reviewer is the engineering authority. Beyond tolerance it
 *  becomes a warning on the parent, never a hard block. */
export function validateSplit(
  opening: { widthMm: number; heightMm: number },
  segments: SegmentSpec[],
  axis: "vertical" | "horizontal",
  policy: CompositePolicy,
): SplitValidation {
  const errors: string[] = [];
  if (segments.length < 2) errors.push("A composite needs at least 2 units.");
  if (segments.length > policy.maxSegments) errors.push(`A composite may have at most ${policy.maxSegments} units.`);

  for (const [i, s] of segments.entries()) {
    const n = i + 1;
    if (!s.productSlug) errors.push(`Unit ${n} has no product selected.`);
    if (!(s.widthMm > 0)) errors.push(`Unit ${n} needs a width.`);
    if (!(s.heightMm > 0)) errors.push(`Unit ${n} needs a height.`);
    if ((s.qtyPerParent ?? 1) < 1) errors.push(`Unit ${n} must appear at least once.`);
  }

  // Along the split axis the segments partition the opening; across it they each
  // span the full opening, so a mismatch there is an error rather than coverage.
  const along = axis === "vertical" ? "widthMm" : "heightMm";
  const across = axis === "vertical" ? "heightMm" : "widthMm";
  const spanned = segments.reduce((sum, s) => sum + s[along] * (s.qtyPerParent ?? 1), 0);
  const coverageDeltaMm = spanned - opening[along];
  for (const [i, s] of segments.entries()) {
    if (s[across] > 0 && s[across] !== opening[across]) {
      errors.push(`Unit ${i + 1} is ${s[across]}mm across; the opening is ${opening[across]}mm.`);
    }
  }
  return { ok: errors.length === 0, errors, coverageDeltaMm };
}

/** An even split proposal — the starting point a reviewer corrects, never a
 *  silently applied answer. Remainder goes to the LAST segment so the widths sum
 *  exactly; no segment is quietly rounded away. */
export function proposeEvenSplit(openingWidthMm: number, count: number, joinerMm: number): number[] {
  const usable = openingWidthMm - joinerMm * (count - 1);
  const base = Math.floor(usable / count);
  const widths = Array.from({ length: count }, () => base);
  widths[count - 1] = usable - base * (count - 1);
  return widths;
}

interface ParentRow {
  id: string; project_id: string; qty: number; dims_json: string;
  line_kind: string; composite_axis: string | null;
}

/** The opening's size, from the parent's dims. Returns zeros when unparseable —
 *  callers treat that as "cannot be planned as units yet". */
function openingOf(parent: { dims_json: string }): { widthMm: number; heightMm: number } {
  let dims: { width?: string; height?: string } = {};
  try { dims = JSON.parse(parent.dims_json || "{}"); } catch { /* absent */ }
  return {
    widthMm: parseInt(String(dims.width ?? "")) || 0,
    heightMm: parseInt(String(dims.height ?? "")) || 0,
  };
}

/** Recompute everything DERIVED about a parent from its segments. The single
 *  writer of segment.qty, and of parent.line_total / status / coverage_delta_mm. */
export async function recomputeComposite(env: Env, parentId: string): Promise<void> {
  const parent = await env.DB
    .prepare("SELECT id, project_id, qty, dims_json, line_kind, composite_axis FROM quote_line WHERE id=?")
    .bind(parentId).first<ParentRow>();
  if (!parent) return;

  const { results: segments } = await env.DB.prepare(
    `SELECT id, qty_per_parent, line_total, status, dims_json FROM quote_line
      WHERE parent_line_id=? ORDER BY segment_seq`,
  ).bind(parentId).all<{
    id: string; qty_per_parent: number; line_total: number | null; status: string; dims_json: string;
  }>();

  const opening = openingOf(parent);
  const axis = parent.composite_axis === "horizontal" ? "horizontal" : "vertical";

  if (!segments.length) {
    // Last segment removed ⇒ the parent is a plain line again. It must NOT come
    // back as `ready`: the reason it was split (no unit is made this wide) is
    // still true, so the fit warning has to be restored by the caller.
    await env.DB.prepare(
      "UPDATE quote_line SET line_kind='simple', composite_axis=NULL, coverage_delta_mm=NULL, composite_origin=NULL, updated_at=datetime('now') WHERE id=?",
    ).bind(parentId).run();
    return;
  }

  // qty is materialised, with this as the only writer.
  const stmts = segments.map((s) => env.DB
    .prepare("UPDATE quote_line SET qty=?, updated_at=datetime('now') WHERE id=?")
    .bind(Math.max(1, parent.qty) * Math.max(1, s.qty_per_parent), s.id));

  const anyUnpriced = segments.some((s) => s.line_total == null);
  const total = anyUnpriced ? null : segments.reduce((sum, s) => sum + (s.line_total ?? 0), 0);
  const worst = segments.some((s) => s.status === "incomplete")
    ? "incomplete"
    : segments.some((s) => s.status === "technical_review") ? "technical_review" : "ready";

  // Coverage is DERIVED here too, not only at split time. Once a reviewer can
  // resize one unit — or add and remove units — a delta computed once at split
  // is a number describing a plan that no longer exists, and it is the number the
  // fit warning is drawn from.
  const along = axis === "vertical" ? "width" : "height";
  const spanned = segments.reduce((sum, s) => {
    let d: Record<string, unknown> = {};
    try { d = JSON.parse(s.dims_json || "{}"); } catch { /* absent ⇒ contributes 0 */ }
    return sum + (parseInt(String(d[along] ?? "")) || 0) * Math.max(1, s.qty_per_parent);
  }, 0);
  const openingAlong = axis === "vertical" ? opening.widthMm : opening.heightMm;
  const coverage = openingAlong > 0 ? spanned - openingAlong : null;

  stmts.push(env.DB.prepare(
    `UPDATE quote_line SET line_total=?, status=?, line_kind='composite_parent',
       coverage_delta_mm=?, updated_at=datetime('now') WHERE id=?`,
  ).bind(total, total == null ? "incomplete" : worst, coverage, parentId));

  await env.DB.batch(stmts);
}

/** Turn an opening into a composite. Replaces any existing segments wholesale —
 *  a re-split is a new plan, not a merge of two plans. */
export async function splitLine(env: Env, args: {
  parentId: string;
  segments: SegmentSpec[];
  axis?: "vertical" | "horizontal";
  origin: "ai" | "ops";
}): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const axis = args.axis ?? "vertical";
  const policy = await loadCompositePolicy(env);
  const parent = await env.DB
    .prepare("SELECT id, project_id, qty, dims_json, options_json, line_kind, composite_axis FROM quote_line WHERE id=? AND parent_line_id IS NULL")
    .bind(args.parentId).first<ParentRow & { options_json: string }>();
  if (!parent) return { ok: false, errors: ["That opening no longer exists."] };

  const opening = openingOf(parent);
  if (!opening.widthMm || !opening.heightMm) {
    return { ok: false, errors: ["The opening has no size, so it cannot be planned as units yet."] };
  }

  const check = validateSplit(opening, args.segments, axis, policy);
  if (!check.ok) return { ok: false, errors: check.errors };

  // Options are INHERITED when the caller does not state them.
  //
  // They used to default to {}, which silently discarded the customer's colour,
  // hardware, flyscreen and installation the moment an opening was split — and
  // since most option rows carry a surcharge, it discarded money with them: the
  // units were re-priced as bare product. The spec the customer chose is a fact
  // about the opening, so it is the correct default for every frame in it.
  //
  // An explicit object (including {}) is still honoured, so a caller that means
  // "no options" can say so, and per-unit overrides work normally.
  const inherited = storedOptions(parent.options_json);
  const segments = args.segments.map((s) => ({ ...s, options: s.options ?? inherited }));

  // Captured figures per unit. The machine's own frozen record already carries
  // them for a unit it planned (splitCandidates.ts writes uw/shgc there at the
  // moment it chose), so those units cost no catalogue read at all; only the
  // rest go to the one consultation below.
  const fromSnapshot = (s: SegmentSpec): LineFigures | null => {
    const snap = s.configurationSnapshot;
    if (!snap) return null;
    const num = (v: unknown) => (typeof v === "number" ? v : null);
    return { uValue: num(snap.uw), shgc: num(snap.shgc) };
  };
  const figureCatalogue = await fetchFigureCatalogue(
    env, segments.flatMap((s) => (fromSnapshot(s) ? [] : [s.productSlug])));
  const figuresOf = (s: SegmentSpec) => figuresJson(fromSnapshot(s) ?? resolveFigures(figureCatalogue, {
    productSlug: s.productSlug, variantId: s.selectedVariantId ?? null, options: s.options ?? {},
  }));

  // Price each segment through THE engine — same rates, same surcharges, same
  // modifiers as any other line. Per frame, which is the whole point.
  const totals = await Promise.all(segments.map((s) => priceItem(env, {
    productSlug: s.productSlug,
    width: String(s.widthMm), height: String(s.heightMm),
    options: s.options,
    qty: Math.max(1, parent.qty) * Math.max(1, s.qtyPerParent ?? 1),
  })));

  const stmts = [
    env.DB.prepare("DELETE FROM quote_line WHERE parent_line_id=?").bind(parent.id),
    ...segments.map((s, i) => env.DB.prepare(
      `INSERT INTO quote_line
         (id, project_id, parent_line_id, segment_seq, qty_per_parent, line_kind,
          external_ref, room_label, product_slug, options_json, dims_json,
          qty, line_total, status, position, origin, selected_variant_id,
          segment_requirements_json, segment_requirement_basis, segment_thermal_review,
          configuration_snapshot_json, performance_figures_json)
       VALUES (?, ?, ?, ?, ?, 'segment', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      uuid(), parent.project_id, parent.id, i, Math.max(1, s.qtyPerParent ?? 1),
      s.productSlug, JSON.stringify(s.options),
      JSON.stringify({ width: String(s.widthMm), height: String(s.heightMm) }),
      Math.max(1, parent.qty) * Math.max(1, s.qtyPerParent ?? 1),
      totals[i], totals[i] == null ? "incomplete" : "ready", i,
      // The ORIGIN of the split, not a constant. This was hardcoded 'ai', so a
      // split a person planned recorded AI-authored children — which misreports
      // provenance in the audit trail and, because the PATCH path treats
      // origin='ai' lines as AI-managed, sent segment edits down a branch that
      // needs an opening_instance row no segment has.
      args.origin, s.selectedVariantId ?? null,
      s.resolvedBand ? JSON.stringify(s.resolvedBand) : null,
      s.requirementBasis ?? null, s.thermalReview ? 1 : 0,
      s.configurationSnapshot ? JSON.stringify(s.configurationSnapshot) : null,
      figuresOf(s),
    )),
    env.DB.prepare(
      "UPDATE quote_line SET line_kind='composite_parent', composite_axis=?, coverage_delta_mm=?, composite_origin=?, updated_at=datetime('now') WHERE id=?",
    ).bind(axis, check.coverageDeltaMm, args.origin, parent.id),
  ];
  await env.DB.batch(stmts);
  await recomputeComposite(env, parent.id);
  return { ok: true };
}

/** Undo a split. The parent goes back to being one opening — and the caller must
 *  restore the `fit` warning, because the reason for splitting is still true and
 *  an unbuildable single unit must never present as Ready. */
export async function mergeComposite(env: Env, parentId: string): Promise<void> {
  await env.DB.prepare("DELETE FROM quote_line WHERE parent_line_id=?").bind(parentId).run();
  await recomputeComposite(env, parentId);
}

// ── Per-unit management ───────────────────────────────────────────────────────
// A reviewer corrects ONE unit — its product, its spec, its size — and the rest
// of the composite must survive that untouched. Before these existed the only
// way to change anything was to re-split, which DELETEs every segment and
// recreates it; that was merely annoying when a unit was nothing but a width,
// and destroys real work now that a unit carries a product and a spec.
//
// All three go through recomputeComposite, so parent total, parent status,
// coverage and derived qty stay consistent by construction. None of them accept
// `qty` — it is derived, and this module remains its only writer.

export interface SegmentRow {
  id: string; parent_line_id: string; project_id: string;
  product_slug: string; options_json: string; dims_json: string;
  qty_per_parent: number; segment_seq: number;
  /** Optional because only loadSegment selects it, and loadSegment is its only
   *  reader. The other SELECTs typed as SegmentRow predate the unit note. */
  room_label?: string | null;
  /** Same: only loadSegment selects it, for §1.4's carry-forward. */
  performance_figures_json?: string | null;
}

/** Load a segment together with the opening it belongs to. */
export async function loadSegment(env: Env, segmentId: string): Promise<
  { segment: SegmentRow; parent: ParentRow & { options_json: string } } | null
> {
  const segment = await env.DB.prepare(
    `SELECT id, parent_line_id, project_id, product_slug, options_json, dims_json,
            qty_per_parent, segment_seq, room_label, performance_figures_json
       FROM quote_line WHERE id=? AND parent_line_id IS NOT NULL`,
  ).bind(segmentId).first<SegmentRow>();
  if (!segment) return null;
  const parent = await env.DB.prepare(
    "SELECT id, project_id, qty, dims_json, options_json, line_kind, composite_axis FROM quote_line WHERE id=?",
  ).bind(segment.parent_line_id).first<ParentRow & { options_json: string }>();
  return parent ? { segment, parent } : null;
}

/** Change one unit. Only the fields named in `patch` move; everything else on
 *  the unit is left alone, which is what makes this safe to call for a one-field
 *  correction.
 *
 *  The ACROSS-axis dimension used to be unsettable: it was forced to the
 *  opening's, so a mismatch could not be typed. That looked like a safety rail
 *  and behaved like a shredder. When an opening's parsed height is corrected —
 *  2100 to 2110, say — every unit is left at the old figure and the customer's
 *  only route to fixing them is the field that was locked; worse, saving a unit
 *  for any other reason SNAPPED its height to the opening and made the
 *  disagreement disappear without anyone deciding it. Editable now, and a
 *  mismatch is reported the same way coverage is: on the unit AND on the
 *  opening, never silently reconciled. Report, do not veto — the same rule the
 *  coverage delta has always followed. */
export async function updateSegment(env: Env, args: {
  segmentId: string;
  /** Refuse a product that cannot couple with the unit's siblings.
   *
   *  The ROUTE decides this, not this function: the owner ruled that a customer
   *  is blocked and staff are warned, and the two segment routes were
   *  deliberately merged onto one domain function so pricing, coverage and
   *  derived quantity could not drift apart. A second implementation of the rule
   *  on the customer side would undo exactly that. Customer route ⇒ true; ops
   *  leaves it off and stamps the same sentence as a review reason instead. */
  enforceCompatibility?: boolean;
  patch: {
    productSlug?: string; options?: Record<string, string>;
    alongMm?: number; acrossMm?: number; qtyPerParent?: number;
    /** Free text on the unit. Stored in room_label — the same column an opening
     *  uses, because from the customer's side a unit carries exactly the same
     *  kind of information as a childless opening; the only difference is that
     *  it has a parent (owner). The column already exists on every segment row:
     *  both INSERT paths bind it as a literal NULL. */
    note?: string;
  };
}): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const loaded = await loadSegment(env, args.segmentId);
  if (!loaded) return { ok: false, errors: ["That unit no longer exists."] };
  const { segment, parent } = loaded;

  const opening = openingOf(parent);
  const axis = parent.composite_axis === "horizontal" ? "horizontal" : "vertical";
  const dims = openingOf(segment);

  const productSlug = args.patch.productSlug ?? segment.product_slug;
  // The unit's OWN options, read exactly as `storedPickOf` reads them below —
  // one reader for both halves of the comparison. It used to be
  // `parentOptions`, whose coercion turned a non-string glass into a chosen
  // one on the pick side while the stored side read it as no glass at all:
  // `pickMoved` true on an edit that touched neither product nor glass. The
  // coercion also bought nothing here — pricing already skips non-string values
  // (`lines.ts:141,164`) — while silently re-encoding a column this save was
  // never asked to change.
  const options = args.patch.options ?? storedOptions(segment.options_json);
  const qtyPerParent = Math.max(1, Math.floor(args.patch.qtyPerParent ?? segment.qty_per_parent));
  const along = args.patch.alongMm !== undefined
    ? Math.floor(args.patch.alongMm)
    : (axis === "vertical" ? dims.widthMm : dims.heightMm);
  // Falls back to what the unit ALREADY stores, not to the opening. Defaulting
  // to the opening is what silently healed a real mismatch on any unrelated
  // save; the unit keeps its own figure until someone types a new one.
  const across = args.patch.acrossMm !== undefined
    ? Math.floor(args.patch.acrossMm)
    : (axis === "vertical" ? dims.heightMm : dims.widthMm) || (axis === "vertical" ? opening.heightMm : opening.widthMm);

  const widthMm = axis === "vertical" ? along : across;
  const heightMm = axis === "vertical" ? across : along;

  if (!productSlug) return { ok: false, errors: ["This unit has no product selected."] };
  if (!(widthMm > 0)) return { ok: false, errors: ["This unit needs a width."] };
  if (!(heightMm > 0)) return { ok: false, errors: ["This unit needs a height."] };

  if (args.enforceCompatibility && productSlug !== segment.product_slug) {
    // Only on a CHANGE of product. Re-validating an unchanged slug would make an
    // opening that predates the frame systems unsavable for any other reason —
    // a customer correcting a width would be told to fix a frame pairing they
    // never chose and have no route to change.
    const conflict = await compatibilityConflict(env, {
      parentId: parent.id, segmentId: segment.id, productSlug,
    });
    if (conflict) return { ok: false, errors: [conflict] };
  }

  // Only the fields named in the patch move, so an ABSENT note keeps whatever
  // the unit already carries. Blank is a legitimate value — clearing a note is
  // an edit — so this normalises rather than reading "" as absent.
  const note = args.patch.note !== undefined
    ? args.patch.note.trim()
    : (segment.room_label ?? "");

  const qty = Math.max(1, parent.qty) * qtyPerParent;
  const total = await priceItem(env, {
    productSlug, width: String(widthMm), height: String(heightMm), options, qty,
  });

  // §1.4: a note- or size-only edit leaves the pick alone, so the unit's own
  // record is carried forward and the catalogue is not consulted at all. Only a
  // unit whose product or glass actually moved is re-resolved — the machine's
  // frozen snapshot no longer describes that one.
  const figures = await captureOne(
    env, { productSlug, variantId: null, options }, storedPickOf(segment));

  await env.DB.prepare(
    `UPDATE quote_line SET product_slug=?, options_json=?, dims_json=?, qty_per_parent=?,
       room_label=?, line_total=?, status=?, performance_figures_json=?,
       updated_at=datetime('now') WHERE id=?`,
  ).bind(
    productSlug, JSON.stringify(options),
    JSON.stringify({ width: String(widthMm), height: String(heightMm) }),
    qtyPerParent, note || null, total, total == null ? "incomplete" : "ready",
    figures, segment.id,
  ).run();

  await recomputeComposite(env, parent.id);
  return { ok: true };
}

/** Append a unit. Ops may inherit the last unit as a deliberate productivity
 * shortcut. Customer-created units are different: their product, options and
 * along-opening dimension are supplied from the editor, so clicking Add never
 * creates an accepted default configuration behind the customer's back. */
export async function addSegment(
  env: Env,
  parentId: string,
  origin: "ops" | "manual" = "ops",
  draft?: { productSlug: string; options: Record<string, string>; alongMm: number },
): Promise<
  { ok: true; id: string } | { ok: false; errors: string[] }
> {
  const policy = await loadCompositePolicy(env);
  const parent = await env.DB.prepare(
    "SELECT id, project_id, qty, dims_json, options_json, line_kind, composite_axis FROM quote_line WHERE id=? AND parent_line_id IS NULL",
  ).bind(parentId).first<ParentRow & { options_json: string }>();
  if (!parent) return { ok: false, errors: ["That opening no longer exists."] };

  const { results: existing } = await env.DB.prepare(
    `SELECT id, product_slug, options_json, dims_json, qty_per_parent, segment_seq
       FROM quote_line WHERE parent_line_id=? ORDER BY segment_seq`,
  ).bind(parentId).all<SegmentRow>();
  if (!existing.length) return { ok: false, errors: ["This opening is not planned as units."] };
  if (existing.length >= policy.maxSegments) {
    return { ok: false, errors: [`A composite may have at most ${policy.maxSegments} units.`] };
  }

  const opening = openingOf(parent);
  const axis = parent.composite_axis === "horizontal" ? "horizontal" : "vertical";
  const last = existing[existing.length - 1];
  const lastDims = openingOf(last);
  const lastAlong = axis === "vertical" ? lastDims.widthMm : lastDims.heightMm;

  const spanned = existing.reduce((sum, s) => {
    const d = openingOf(s);
    return sum + (axis === "vertical" ? d.widthMm : d.heightMm) * Math.max(1, s.qty_per_parent);
  }, 0);
  const openingAlong = axis === "vertical" ? opening.widthMm : opening.heightMm;
  const shortfall = openingAlong - spanned;
  const inheritedAlong = shortfall > 0 ? shortfall : lastAlong;
  const productSlug = origin === "manual" ? String(draft?.productSlug ?? "").trim() : last.product_slug;
  const along = origin === "manual" ? Math.round(Number(draft?.alongMm)) : inheritedAlong;
  if (!productSlug) return { ok: false, errors: ["Choose a product for the new unit."] };
  if (!(along > 0)) return { ok: false, errors: ["Enter the new unit's size along the opening."] };

  const widthMm = axis === "vertical" ? along : opening.widthMm;
  const heightMm = axis === "vertical" ? opening.heightMm : along;
  // Inheriting from the last unit copies its options FAITHFULLY: coercing them
  // would give the new unit a different glass from the sibling it was copied
  // from, and — once it has a stored row to compare against — the same split
  // reading that `updateSegment` just lost. No stored pick exists yet, so this
  // is not a live defect; it is the same construction, and "safe because the
  // other side is null" is the reasoning that failed here twice.
  const options: Record<string, unknown> = origin === "manual" ? (draft?.options ?? {}) : storedOptions(last.options_json);
  const qty = Math.max(1, parent.qty);
  const total = await priceItem(env, {
    productSlug, width: String(widthMm), height: String(heightMm), options, qty,
  });

  // A new row: nothing stored to carry, so it always resolves.
  const figures = await captureOne(env, { productSlug, variantId: null, options }, null);

  const id = uuid();
  await env.DB.prepare(
    `INSERT INTO quote_line
       (id, project_id, parent_line_id, segment_seq, qty_per_parent, line_kind,
        external_ref, room_label, product_slug, options_json, dims_json,
        qty, line_total, status, position, origin, performance_figures_json)
     VALUES (?, ?, ?, ?, 1, 'segment', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, parent.project_id, parent.id, existing.length,
    productSlug, JSON.stringify(options),
    JSON.stringify({ width: String(widthMm), height: String(heightMm) }),
    qty, total, total == null ? "incomplete" : "ready", existing.length, origin,
    figures,
  ).run();

  await recomputeComposite(env, parent.id);
  return { ok: true, id };
}

/** Remove one unit, keeping every other unit's id, product and spec.
 *
 *  Refuses to take a composite below two units. Collapsing to one is not a
 *  removal, it is `mergeComposite` — and that path deliberately restores the fit
 *  warning, because the reason the opening was split is still true. Letting this
 *  silently collapse would present an unbuildable single unit as ready. */
export async function removeSegment(env: Env, segmentId: string): Promise<
  { ok: true; parentId: string } | { ok: false; errors: string[] }
> {
  const loaded = await loadSegment(env, segmentId);
  if (!loaded) return { ok: false, errors: ["That unit no longer exists."] };
  const { segment, parent } = loaded;

  const siblings = await env.DB
    .prepare("SELECT count(*) AS n FROM quote_line WHERE parent_line_id=?")
    .bind(parent.id).first<{ n: number }>();
  if ((siblings?.n ?? 0) <= 2) {
    return { ok: false, errors: ["A composite needs at least 2 units. Merge it back to one opening instead."] };
  }

  await env.DB.prepare("DELETE FROM quote_line WHERE id=?").bind(segment.id).run();
  // Compact the sequence so positions stay 0..n-1 and the unit numbers a
  // reviewer sees never skip.
  const { results: rest } = await env.DB
    .prepare("SELECT id FROM quote_line WHERE parent_line_id=? ORDER BY segment_seq")
    .bind(parent.id).all<{ id: string }>();
  if (rest.length) {
    await env.DB.batch(rest.map((r, i) => env.DB
      .prepare("UPDATE quote_line SET segment_seq=?, position=? WHERE id=?")
      .bind(i, i, r.id)));
  }

  await recomputeComposite(env, parent.id);
  return { ok: true, parentId: parent.id };
}
