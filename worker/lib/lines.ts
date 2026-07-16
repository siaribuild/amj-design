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
}

export function rowToApiLine(r: LineRow): ApiLine {
  const dims = safeParse(r.dims_json);
  return {
    code: r.external_ref ?? "",
    productSlug: r.product_slug,
    location: r.room_label ?? "",
    measuredBy: (MEASURED.has(r.measured_by) ? r.measured_by : "") as MeasuredBy,
    width: String(dims.width ?? ""),
    height: String(dims.height ?? ""),
    options: safeParse(r.options_json),
    qty: r.qty || 1,
    status: r.status === "ready" ? "Ready" : "Needs review",
    lineTotal: r.line_total,
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
  const status = priced.ok ? "ready" : "incomplete";

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
