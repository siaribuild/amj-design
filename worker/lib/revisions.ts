// Issue an immutable quote revision: snapshot the current draft lines into
// revision_line and move the project to "quote issued". Shared by the customer
// staff-seam and the ops console.
import type { Env } from "../types";
import { uuid } from "./util";
import { getProductBySlug } from "../../src/data/catalogue";

function safeParse(s: string): Record<string, unknown> {
  try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

export async function issueRevision(env: Env, projectId: string): Promise<{ id: string; revisionNo: number; total: number } | null> {
  const project = await env.DB.prepare("SELECT id FROM project WHERE id = ?").bind(projectId).first<{ id: string }>();
  if (!project) return null;

  const { results: lines } = await env.DB
    .prepare("SELECT external_ref, room_label, product_slug, options_json, dims_json, qty, line_total FROM quote_line WHERE project_id = ? AND revision_id IS NULL ORDER BY position")
    .bind(projectId)
    .all<{ external_ref: string | null; room_label: string | null; product_slug: string; options_json: string; dims_json: string; qty: number; line_total: number | null }>();

  const maxRow = await env.DB.prepare("SELECT COALESCE(MAX(revision_no), 0) AS n FROM quote_revision WHERE project_id = ?").bind(projectId).first<{ n: number }>();
  const revisionNo = (maxRow?.n ?? 0) + 1;
  const revisionId = uuid();
  const total = lines.reduce((s, l) => s + (l.line_total || 0), 0);

  const stmts = [
    env.DB.prepare("INSERT INTO quote_revision (id, project_id, revision_no, snapshot_status, totals_json) VALUES (?, ?, ?, 'issued', ?)")
      .bind(revisionId, projectId, revisionNo, JSON.stringify({ total })),
    ...lines.map((l) => {
      const p = getProductBySlug(l.product_slug);
      const snapshot = JSON.stringify({
        productSlug: l.product_slug,
        productName: p?.name ?? l.product_slug,
        options: safeParse(l.options_json),
        dims: safeParse(l.dims_json),
      });
      return env.DB.prepare(
        "INSERT INTO revision_line (id, revision_id, external_ref, room_label, product_snapshot_json, dims_json, options_json, qty, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(uuid(), revisionId, l.external_ref, l.room_label, snapshot, l.dims_json, l.options_json, l.qty, l.line_total ?? 0);
    }),
    env.DB.prepare("UPDATE project SET status_customer = 'quote_issued', status_internal = 'issued', updated_at = datetime('now') WHERE id = ?").bind(projectId),
  ];
  await env.DB.batch(stmts);
  return { id: revisionId, revisionNo, total };
}
