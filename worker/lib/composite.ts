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
//      because computePrice, revision_line, order_line and every customer view
//      read `qty` directly. The safety condition is a single writer — this
//      module — so it can never desync. Covered by a test.
//   4. The parent is never priced directly. Its line_total is Σ(segments), or
//      NULL if any segment is unpriced. Modifiers therefore apply PER FRAME,
//      which is the correct reading: "width > 1200mm ⇒ +10%" is a fact about a
//      manufactured frame, not about a hole in a wall.
import type { Env } from "../types";
import { priceItem } from "./lines";
import { uuid } from "./util";

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

export interface SegmentSpec {
  widthMm: number;
  heightMm: number;
  productSlug: string;
  qtyPerParent?: number;
  options?: Record<string, string>;
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

/** Recompute everything DERIVED about a parent from its segments. The single
 *  writer of segment.qty and of parent.line_total / status. */
export async function recomputeComposite(env: Env, parentId: string): Promise<void> {
  const parent = await env.DB
    .prepare("SELECT id, project_id, qty, dims_json, line_kind, composite_axis FROM quote_line WHERE id=?")
    .bind(parentId).first<ParentRow>();
  if (!parent) return;

  const { results: segments } = await env.DB.prepare(
    `SELECT id, qty_per_parent, line_total, status FROM quote_line
      WHERE parent_line_id=? ORDER BY segment_seq`,
  ).bind(parentId).all<{ id: string; qty_per_parent: number; line_total: number | null; status: string }>();

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

  stmts.push(env.DB.prepare(
    "UPDATE quote_line SET line_total=?, status=?, line_kind='composite_parent', updated_at=datetime('now') WHERE id=?",
  ).bind(total, total == null ? "incomplete" : worst, parentId));

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
    .prepare("SELECT id, project_id, qty, dims_json, line_kind, composite_axis FROM quote_line WHERE id=? AND parent_line_id IS NULL")
    .bind(args.parentId).first<ParentRow>();
  if (!parent) return { ok: false, errors: ["That opening no longer exists."] };

  let dims: { width?: string; height?: string } = {};
  try { dims = JSON.parse(parent.dims_json || "{}"); } catch { /* treated as absent below */ }
  const opening = { widthMm: parseInt(String(dims.width ?? "")) || 0, heightMm: parseInt(String(dims.height ?? "")) || 0 };
  if (!opening.widthMm || !opening.heightMm) {
    return { ok: false, errors: ["The opening has no size, so it cannot be planned as units yet."] };
  }

  const check = validateSplit(opening, args.segments, axis, policy);
  if (!check.ok) return { ok: false, errors: check.errors };

  // Price each segment through THE engine — same rates, same surcharges, same
  // modifiers as any other line. Per frame, which is the whole point.
  const totals = await Promise.all(args.segments.map((s) => priceItem(env, {
    productSlug: s.productSlug,
    width: String(s.widthMm), height: String(s.heightMm),
    options: s.options ?? {},
    qty: Math.max(1, parent.qty) * Math.max(1, s.qtyPerParent ?? 1),
  })));

  const stmts = [
    env.DB.prepare("DELETE FROM quote_line WHERE parent_line_id=?").bind(parent.id),
    ...args.segments.map((s, i) => env.DB.prepare(
      `INSERT INTO quote_line
         (id, project_id, parent_line_id, segment_seq, qty_per_parent, line_kind,
          external_ref, room_label, product_slug, options_json, dims_json,
          measured_by, qty, line_total, status, position, origin)
       VALUES (?, ?, ?, ?, ?, 'segment', NULL, NULL, ?, ?, ?, '', ?, ?, ?, ?, 'ai')`,
    ).bind(
      uuid(), parent.project_id, parent.id, i, Math.max(1, s.qtyPerParent ?? 1),
      s.productSlug, JSON.stringify(s.options ?? {}),
      JSON.stringify({ width: String(s.widthMm), height: String(s.heightMm) }),
      Math.max(1, parent.qty) * Math.max(1, s.qtyPerParent ?? 1),
      totals[i], totals[i] == null ? "incomplete" : "ready", i,
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
