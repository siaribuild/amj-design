// Mapping between the client's QItem shape and normalized quote_line rows,
// plus authoritative server-side pricing. Imports the SAME pure pricing
// functions the SPA uses (src/data/configurator.ts) so estimates never diverge.
import { priceConfigured, type MeasuredBy } from "../../src/data/configurator";
import { uuid } from "./util";

// The line shape exchanged with the client (QItem minus its local numeric id).
export interface ApiLine {
  code: string;
  productSlug: string;
  location: string;
  measuredBy: MeasuredBy;
  width: string;
  height: string;
  options: Record<string, string>;
  qty: number;
  status: "Ready" | "Needs review";
  lineTotal: number | null;
  /** 'manual' | 'schedule' — how the line entered the project. */
  origin?: string;
  /** Per-field {field: reason} for parsed lines that need confirmation. */
  review?: Record<string, string> | null;
}

const MEASURED = new Set(["", "frame", "opening", "unsure"]);

// A D1 quote_line row (columns we read back).
export interface LineRow {
  external_ref: string | null;
  room_label: string | null;
  product_slug: string;
  options_json: string;
  dims_json: string;
  measured_by: string;
  qty: number;
  line_total: number | null;
  status: string;
  origin?: string | null;
  review_json?: string | null;
}

export function rowToApiLine(r: LineRow): ApiLine {
  const dims = safeParse(r.dims_json);
  const review = r.review_json ? safeParse(r.review_json) : null;
  return {
    code: r.external_ref ?? "",
    productSlug: r.product_slug,
    location: r.room_label ?? "",
    measuredBy: (MEASURED.has(r.measured_by) ? r.measured_by : "") as MeasuredBy,
    width: String(dims.width ?? ""),
    height: String(dims.height ?? ""),
    options: safeParse(r.options_json) as Record<string, string>,
    qty: r.qty || 1,
    // 'ready' ⇒ Ready; incomplete/technical_review/… ⇒ Needs review.
    status: r.status === "ready" ? "Ready" : "Needs review",
    lineTotal: r.line_total,
    origin: r.origin ?? "manual",
    review: review && Object.keys(review).length ? (review as Record<string, string>) : null,
  };
}

// Normalize + price one incoming client item into an insertable row (bound params).
export function itemToInsert(projectId: string, raw: unknown, position: number) {
  const it = (raw ?? {}) as Record<string, unknown>;
  const width = String(it.width ?? "");
  const height = String(it.height ?? "");
  const options = (it.options && typeof it.options === "object" ? it.options : {}) as Record<string, string>;
  const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
  const productSlug = String(it.productSlug ?? "");
  const measured = String(it.measuredBy ?? "");

  const priced = priceConfigured({ productSlug, width, height, options, qty });
  const lineTotal = priced.ok ? priced.total : null;

  // Preserve parse provenance + unresolved review flags across autosaves. A line
  // still carrying review reasons stays 'technical_review' (Needs review) even if
  // it happens to price; clearing the last flag (client drops resolved keys) lets
  // it fall back to the normal ready/incomplete status.
  const origin = String(it.origin ?? "manual") === "schedule" ? "schedule" : "manual";
  const review = it.review && typeof it.review === "object" && Object.keys(it.review as object).length
    ? (it.review as Record<string, string>)
    : null;
  // Unpriceable ⇒ 'incomplete' (customer must resolve, blocks submission), even if
  // it also carries review flags. Priced + flagged ⇒ 'technical_review' (an AMJ
  // technician resolves it — SUBMITTABLE). Priced + clean ⇒ 'ready'.
  const status = !priced.ok ? "incomplete" : review ? "technical_review" : "ready";

  return {
    id: uuid(),
    project_id: projectId,
    external_ref: String(it.code ?? "") || null,
    room_label: String(it.location ?? "") || null,
    product_slug: productSlug,
    options_json: JSON.stringify(options),
    dims_json: JSON.stringify({ width, height }),
    measured_by: MEASURED.has(measured) ? measured : "",
    qty,
    line_total: lineTotal,
    status,
    position,
    origin,
    review_json: review ? JSON.stringify(review) : null,
  };
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
