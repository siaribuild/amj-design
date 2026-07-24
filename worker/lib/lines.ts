// Mapping between the client's QItem shape and normalized quote_line rows,
// plus authoritative server-side pricing. Imports the SAME pure pricing
// functions the SPA uses (src/data/configurator.ts) so estimates never diverge.
import { priceConfigured, type MeasuredBy } from "../../src/data/configurator";
import { uuid } from "./util";

// The line shape exchanged with the client. `id` is the STABLE server line id —
// the client round-trips it as `serverId` so a save upserts (never delete+recreate)
// and the parse_line → quote_line provenance link survives autosave and submit.
export interface ApiLine {
  id: string;
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
  id: string;
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
    id: r.id,
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

// The mutable columns of a quote_line, normalized + server-priced from one client
// item. Shared by the INSERT (new line) and UPDATE (existing line) paths so the
// pricing/status rules can't diverge between them. `origin` is included but treated
// as server-owned by the caller: set on INSERT, never overwritten on UPDATE.
export function itemFields(raw: unknown) {
  const it = (raw ?? {}) as Record<string, unknown>;
  const width = String(it.width ?? "");
  const height = String(it.height ?? "");
  const options = (it.options && typeof it.options === "object" ? it.options : {}) as Record<string, string>;
  const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
  const productSlug = String(it.productSlug ?? "");
  const measured = String(it.measuredBy ?? "");

  const priced = priceConfigured({ productSlug, width, height, options, qty });
  const lineTotal = priced.ok ? priced.total : null;

  // A line still carrying review reasons stays 'technical_review' (Needs review)
  // even if it happens to price; clearing the last flag (client drops resolved
  // keys) lets it fall back to ready/incomplete.
  const origin = String(it.origin ?? "manual") === "schedule" ? "schedule" : "manual";
  const review = it.review && typeof it.review === "object" && Object.keys(it.review as object).length
    ? (it.review as Record<string, string>)
    : null;
  // Unpriceable ⇒ 'incomplete' (customer must resolve, blocks submission), even if
  // it also carries review flags. Priced + flagged ⇒ 'technical_review' (an AMJ
  // technician resolves it — SUBMITTABLE). Priced + clean ⇒ 'ready'.
  const status = !priced.ok ? "incomplete" : review ? "technical_review" : "ready";

  return {
    external_ref: String(it.code ?? "") || null,
    room_label: String(it.location ?? "") || null,
    product_slug: productSlug,
    options_json: JSON.stringify(options),
    dims_json: JSON.stringify({ width, height }),
    measured_by: MEASURED.has(measured) ? measured : "",
    qty,
    line_total: lineTotal,
    status,
    origin,
    review_json: review ? JSON.stringify(review) : null,
  };
}

// A brand-new line: the shared fields plus a fresh server id and position.
export function itemToInsert(projectId: string, raw: unknown, position: number) {
  return { id: uuid(), project_id: projectId, position, ...itemFields(raw) };
}

// The client round-trips the server line id as `serverId`. Returns it only when it
// is a non-empty string, so an unknown/absent value falls through to INSERT.
export function incomingServerId(raw: unknown): string | null {
  const v = (raw as Record<string, unknown>)?.serverId;
  return typeof v === "string" && v.length ? v : null;
}

// ── Human-edit provenance (0019, multi-file UX spec §1b) ─────────────────────
// Deep, key-order-insensitive comparison — a plain string compare of stored vs
// re-serialized JSON would false-flag every autosave as "edited" and freeze all
// future re-parses out of the guard.
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}
const jsonEq = (a: string | null | undefined, b: string | null | undefined): boolean => {
  try { return stable(JSON.parse(a || "null")) === stable(JSON.parse(b || "null")); } catch { return a === b; }
};

export interface EditableSnapshot { product_slug: string | null; options_json: string | null; dims_json: string | null; qty: number | null; edited_fields: string | null }

/** The union of previously-edited groups and whatever this save actually changed
 *  on a schedule-origin line. Returns the JSON to store (null when nothing has
 *  ever been edited — keeps rows clean for the importer's fast path). */
export function editedFieldsAfterSave(stored: EditableSnapshot, incoming: ReturnType<typeof itemFields>): string | null {
  let prior: string[] = [];
  try { const v = JSON.parse(stored.edited_fields || "[]"); if (Array.isArray(v)) prior = v.filter((x) => typeof x === "string"); } catch { /* none */ }
  const now = new Set(prior);
  if ((stored.product_slug ?? "") !== incoming.product_slug) now.add("product_slug");
  if (!jsonEq(stored.options_json, incoming.options_json)) now.add("options_json");
  if (!jsonEq(stored.dims_json, incoming.dims_json)) now.add("dims_json");
  if ((stored.qty ?? null) !== incoming.qty) now.add("qty");
  return now.size ? JSON.stringify([...now]) : null;
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
