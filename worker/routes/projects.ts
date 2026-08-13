// /api/projects — the customer project workspace.
//
// The anonymous "current" project is resolved via the httpOnly claim cookie (or
// the session for signed-in users). The project row is created lazily on the
// first save, not on every visit, so idle traffic leaves no junk.
import { Hono } from "hono";
import type { Env } from "../types";
import { itemToInsert, itemFields, incomingServerId, editedFieldsAfterSave, rowToApiLine, type ApiSegment, type LineRow, type EditableSnapshot } from "../lib/lines";
import { ownedProject, resolveCurrentProject, resolveOrCreateCurrentProject, type ProjectRow } from "../lib/access";
import { resolveUser } from "../lib/auth";
import { uuid, normNote } from "../lib/util";
import { loadCompositePolicy, recomputeComposite, updateSegment } from "../lib/composite";
import { logEvent } from "../lib/activity";
import { depositOf } from "../lib/orders";
import { deliveryCost, loadProjectAreaM2, loadZonesAndRanges, resolveZone, zoneIsPriced, type DeliveryZone } from "../lib/delivery";

export const projects = new Hono<{ Bindings: Env }>();

const safeParse = (value: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

// GET /api/projects — the signed-in customer's projects (for the dashboard).
// Carries everything the account area needs to derive gates + list rows in one
// call: ref, draft estimate, and the latest issued revision's number + total.
projects.get("/", async (c) => {
  const user = await resolveUser(c.env, c.req.raw);
  if (!user) return c.json({ projects: [] });
  const { results } = await c.env.DB.prepare(`
    SELECT p.id, p.public_ref, p.title, p.status_customer, p.updated_at, p.created_at,
           p.delivery_postcode, p.delivery_amount,
           -- PARENTS ONLY. A composite's segments belong to their parent line,
           -- which already aggregates them; counting or summing them alongside
           -- it would double the customer's item count and total.
           (SELECT count(*) FROM quote_line WHERE project_id = p.id AND revision_id IS NULL AND parent_line_id IS NULL) AS item_count,
           (SELECT COALESCE(SUM(line_total), 0) FROM quote_line WHERE project_id = p.id AND revision_id IS NULL AND parent_line_id IS NULL) AS draft_total,
           (SELECT id FROM quote_revision WHERE project_id = p.id AND snapshot_status = 'issued' ORDER BY revision_no DESC LIMIT 1) AS issued_revision_id,
           (SELECT revision_no FROM quote_revision WHERE project_id = p.id AND snapshot_status = 'issued' ORDER BY revision_no DESC LIMIT 1) AS issued_revision_no,
           (SELECT totals_json FROM quote_revision WHERE project_id = p.id AND snapshot_status = 'issued' ORDER BY revision_no DESC LIMIT 1) AS issued_totals_json
      FROM project p
     WHERE p.owner_user_id = ?
     ORDER BY p.updated_at DESC`).bind(user.id).all<Record<string, unknown>>();
  // Loaded once for the whole list, not once per row — the zone table rarely
  // changes and this is a dashboard read, not a pricing decision.
  const { zones, ranges } = await loadZonesAndRanges(c.env);
  const rows = await Promise.all(results.map(async (r) => {
    let issuedTotal: number | null = null;
    try { const t = JSON.parse(String(r.issued_totals_json ?? "")); if (typeof t?.total === "number") issuedTotal = t.total; } catch { /* unpriced */ }
    const { issued_totals_json: _drop, delivery_postcode, delivery_amount, ...rest } = r;
    // One deposit percentage (0043) — computed here, not by accountModel.tsx's
    // dashboard rows, which used to do their own Math.round(total / 2).
    const issuedDeposit = issuedTotal == null ? null : depositOf(issuedTotal);
    // E13 — confirmed figure if settled, else the LIVE estimate (never a
    // stored, staling number — design doc §5.5), so a dashboard row shows a
    // real figure even before a staffer has looked at it.
    let deliveryAmount = (delivery_amount as number | null) ?? null;
    if (deliveryAmount == null) {
      const resolution = resolveZone((delivery_postcode as string | null) ?? null, zones, ranges);
      if (resolution.zone && zoneIsPriced(resolution.zone)) {
        const zone = resolution.zone as DeliveryZone & { minCharge: number; ratePerSqm: number; maxCharge: number };
        const area = await loadProjectAreaM2(c.env, String(r.id));
        deliveryAmount = deliveryCost(area.areaM2, zone);
      }
    }
    return { ...rest, issued_total: issuedTotal, issued_deposit: issuedDeposit, delivery_amount: deliveryAmount };
  }));
  return c.json({ projects: rows });
});

const projectDto = (p: ProjectRow) => ({
  id: p.id,
  ref: p.public_ref,
  title: p.title ?? "My Project",
  status: p.status_customer,
  createdAt: p.created_at,
});

export async function loadLines(env: Env, projectId: string) {
  const { results } = await env.DB.prepare(
    // PARENTS ONLY: segments render INSIDE their parent card, never as separate
    // items in the customer's list. The count they see is the count they authored.
    "SELECT * FROM quote_line WHERE project_id = ? AND revision_id IS NULL AND parent_line_id IS NULL ORDER BY position",
  ).bind(projectId).all<LineRow>();
  const items = results.map(rowToApiLine);

  // Attach segments to the parents that have them. One extra query, only when a
  // composite actually exists — the common project pays nothing for this.
  const parentIds = results.filter((r) => r.line_kind === "composite_parent").map((r) => r.id);
  if (!parentIds.length) return items;

  const placeholders = parentIds.map(() => "?").join(",");
  const { results: segRows } = await env.DB.prepare(
    `SELECT id, parent_line_id, segment_seq, qty_per_parent, product_slug, dims_json, options_json, qty, line_total, status, room_label
       FROM quote_line WHERE parent_line_id IN (${placeholders}) ORDER BY segment_seq`,
  ).bind(...parentIds).all<{
    id: string; parent_line_id: string; segment_seq: number; qty_per_parent: number;
    product_slug: string; dims_json: string; options_json: string; qty: number; line_total: number | null; status: string;
    room_label: string | null;
  }>();

  // The TOLERANCE stays on the server. It is ops pricing/policy data, and the
  // browser only needs the verdict — so the line carries "these units do not add
  // up to this opening", not the number it would take to decide that for itself.
  const policy = await loadCompositePolicy(env);

  const byParent = new Map<string, ApiSegment[]>();
  for (const s of segRows) {
    const dims = safeParse(s.dims_json);
    const list = byParent.get(s.parent_line_id) ?? [];
    list.push({
      id: s.id,
      productSlug: s.product_slug,
      width: String(dims.width ?? ""),
      height: String(dims.height ?? ""),
      qtyPerParent: s.qty_per_parent,
      qty: s.qty,
      // Segment prices are DISPLAY-ONLY and the client must never sum them: the
      // parent's line_total is the authoritative figure.
      lineTotal: s.line_total,
      options: safeParse(s.options_json) as Record<string, string>,
      status: s.status === "ready" ? "Ready" : "Needs review",
      note: s.room_label ?? "",
    });
    byParent.set(s.parent_line_id, list);
  }
  return items.map((it) => (byParent.has(it.id)
    ? {
      ...it,
      segments: byParent.get(it.id),
      coverageOutOfTolerance: Math.abs(it.coverageDeltaMm ?? 0) > policy.toleranceMm,
    }
    : it));
}

// Source files attached to a project (the uploaded schedule). The bytes stay in
// R2; this surfaces the metadata the estimator + account/ops views render.
export async function loadProjectFiles(env: Env, projectId: string) {
  const { results } = await env.DB.prepare(
    "SELECT id, filename, kind, size, doc_type, doc_type_source FROM file_asset WHERE project_id = ? ORDER BY created_at DESC",
  ).bind(projectId).all<{
    id: string; filename: string; kind: string; size: number | null;
    doc_type: string | null; doc_type_source: string | null;
  }>();
  return results ?? [];
}

// GET /api/projects/current — the current project + its draft lines + files (no writes).
projects.get("/current", async (c) => {
  const { project } = await resolveCurrentProject(c.env, c.req.raw);
  if (!project) return c.json({ project: null, items: [], files: [] });
  return c.json({ project: projectDto(project), items: await loadLines(c.env, project.id), files: await loadProjectFiles(c.env, project.id) });
});

// POST /api/projects/current/price-preview — price ONE candidate line without
// saving it, so the composer can show a live figure while the customer types.
//
// This exists because the browser no longer prices anything: the rate model is
// commercial data and lives in D1. Scoped to a caller who already has a project
// (session or claim cookie) so it is not an open price-probing endpoint — the
// rate card would otherwise be reconstructable by sweeping dimensions.
projects.post("/current/price-preview", async (c) => {
  const { project } = await resolveCurrentProject(c.env, c.req.raw);
  if (!project) return c.json({ ok: false, total: null }, 403);
  const body = await c.req.json().catch(() => ({}));
  // The preview must price with the SAME account discount the save will apply,
  // or a registered customer sees one number while typing and another once saved.
  const f = await itemFields(c.env, body, project.owner_user_id);
  return c.json({ ok: f.line_total != null, total: f.line_total });
});

async function currentDraftSegment(env: Env, req: Request, segmentId: string): Promise<{
  id: string; parent_line_id: string; project_id: string;
} | null> {
  const { project } = await resolveCurrentProject(env, req);
  if (!project || project.status_customer !== "draft") return null;
  return env.DB.prepare(
    `SELECT segment.id, segment.parent_line_id, segment.project_id
       FROM quote_line segment
       JOIN quote_line parent ON parent.id=segment.parent_line_id
      WHERE segment.id=? AND segment.project_id=? AND segment.revision_id IS NULL
        AND parent.line_kind='composite_parent' AND parent.parent_line_id IS NULL`,
  ).bind(segmentId, project.id).first<{ id: string; parent_line_id: string; project_id: string }>();
}

async function markCustomerCompositeEdit(env: Env, projectId: string, parentId: string, segmentId?: string) {
  if (segmentId) {
    await env.DB.prepare(
      `UPDATE quote_line SET status=CASE WHEN line_total IS NULL THEN 'incomplete' ELSE 'technical_review' END
        WHERE id=? AND project_id=? AND parent_line_id=?`,
    ).bind(segmentId, projectId, parentId).run();
    await recomputeComposite(env, parentId);
  }
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE quote_line SET
         review_json=json_patch(COALESCE(review_json,'{}'), ?),
         status=CASE WHEN line_total IS NULL THEN 'incomplete' ELSE 'technical_review' END,
         updated_at=datetime('now')
       WHERE id=? AND project_id=? AND parent_line_id IS NULL`,
    ).bind(JSON.stringify({
      customerCompositeChanged: "Composite units were edited in the estimator; confirm the unit layout, glazing and energy-report compliance during technical review.",
    }), parentId, projectId),
    env.DB.prepare(
      `UPDATE project SET quote_edit_version=quote_edit_version+1, updated_at=datetime('now')
        WHERE id=? AND status_customer='draft'`,
    ).bind(projectId),
  ]);
}

// Draft-owner composite editing — ONE route, and deliberately only one.
//
// WHETHER an opening is split is a manufacturing constraint (no frame is made
// that wide), so it is not the customer's decision: there is no customer route
// wrapping splitLine, and none wrapping mergeComposite either. HOW the units are
// arranged is theirs, so they may change a unit's product, its options and its
// size along the split axis.
//
// Adding and removing units used to be here too, and that was the hole: the unit
// COUNT is the split decision, so a customer who could not make a composite could
// still turn a two-unit one into four, or four into two. Both routes are gone.
// (Owner, 2026-08-04. The capability comes back properly — split, merge and the
// coverage validation to go with them — as a platform feature, ops first and
// customers after.)
//
// What remains is an ownership wrapper around the same domain function Ops uses,
// so pricing, coverage and quantity derivation cannot drift between the two.
projects.patch("/current/segments/:id", async (c) => {
  const segment = await currentDraftSegment(c.env, c.req.raw, c.req.param("id"));
  if (!segment) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const patch: {
    productSlug?: string; options?: Record<string, string>;
    alongMm?: number; acrossMm?: number; note?: string;
  } = {};
  if (body?.productSlug !== undefined) patch.productSlug = String(body.productSlug);
  if (body?.options && typeof body.options === "object" && !Array.isArray(body.options)) {
    patch.options = Object.fromEntries(
      Object.entries(body.options as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")]),
    );
  }
  if (body?.alongMm !== undefined) patch.alongMm = Number(body.alongMm) || 0;
  // The across dimension is the customer's now, not forced to the opening. A
  // mismatch is reported on the unit and on the opening rather than prevented.
  if (body?.acrossMm !== undefined) patch.acrossMm = Number(body.acrossMm) || 0;
  // A unit carries a note of its own (owner). Same field, same meaning, same
  // column as an opening's — the only thing a unit has that a childless opening
  // does not is a parent.
  if (body?.note !== undefined) patch.note = normNote(body.note);
  // The customer is BLOCKED from putting an incompatible frame beside its
  // siblings; staff are warned and may proceed (owner, 2026-08-08). The rule
  // itself lives in updateSegment so the two routes cannot drift; only the
  // policy is stated here. The picker offers compatible products only, so
  // reaching this refusal means the request did not come from the editor.
  const result = await updateSegment(c.env, { segmentId: segment.id, patch, enforceCompatibility: true });
  if ("errors" in result) return c.json({ error: "invalid_segment", errors: result.errors }, 400);
  await markCustomerCompositeEdit(c.env, segment.project_id, segment.parent_line_id, segment.id);
  await logEvent(c.env, {
    entityType: "project", entityId: segment.project_id, action: "customer.line.unit.edit",
    after: { lineId: segment.parent_line_id, unitId: segment.id, fields: Object.keys(patch) },
  });
  return c.json({ ok: true });
});





// GET /api/projects/:id — a specific owned project + its draft lines (read-only).
// Scoped to the signed-in owner so a customer can review exactly what they
// submitted (e.g. while it's under review, before any revision is issued).
projects.get("/:id", async (c) => {
  // ownedProject, not owner-only: the same customer reaching their record through
  // an emailed code rather than an account must see the same thing. It already
  // encodes the draft-vs-committed rule, so this needs no separate policy.
  const project = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!project) return c.json({ error: "not_found" }, 404);
  // ownedProject reads SELECT * — these two columns are present on the row at
  // runtime even though ProjectRow's own type (worker/lib/access.ts) does not
  // declare them.
  const raw = project as unknown as { delivery_postcode: string | null; delivery_amount: number | null };
  let deliveryAmount = raw.delivery_amount ?? null;
  // A settled figure is a human's number, never "conservative" — that word
  // names an auto-estimate that fell through to the fallback zone, which is
  // exactly the case a settled amount skips by returning early here.
  let conservative = false;
  if (deliveryAmount == null) {
    const [{ zones, ranges }, area] = await Promise.all([
      loadZonesAndRanges(c.env),
      loadProjectAreaM2(c.env, project.id),
    ]);
    const resolution = resolveZone(raw.delivery_postcode ?? null, zones, ranges);
    if (resolution.zone && zoneIsPriced(resolution.zone)) {
      deliveryAmount = deliveryCost(area.areaM2, resolution.zone as DeliveryZone & { minCharge: number; ratePerSqm: number; maxCharge: number });
      // Same test the E9 preview route uses (worker/routes/quote.ts) — the
      // "we've allowed generously" copy (§8.4) is for a postcode that missed
      // its own zone and landed on the fallback, not every unsettled estimate.
      conservative = resolution.basis !== "postcode_zone";
    }
  }
  return c.json({
    project: projectDto(project),
    items: await loadLines(c.env, project.id),
    files: await loadProjectFiles(c.env, project.id),
    // E13 — the pending/issued copy split (design doc §8.4) reads `indicative`
    // rather than inferring it from status strings in three places.
    delivery: {
      postcode: raw.delivery_postcode ?? null,
      amount: deliveryAmount,
      indicative: !["quote_issued", "accepted"].includes(project.status_customer),
      conservative,
    },
  });
});

// PUT /api/projects/current/lines — replace the draft line set (snapshot save).
// Creates the project (and sets the claim cookie) on first save.
projects.put("/current/lines", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const items: unknown[] = Array.isArray(body?.items) ? body.items : [];
  const removedIds = new Set(
    Array.isArray(body?.removedIds)
      ? body.removedIds.filter((id: unknown): id is string => typeof id === "string" && id.length <= 100)
      : [],
  );
  // A title is optional per-save: sent when the user (re)names the project. When
  // omitted (a line-only save), the existing title is left untouched.
  const hasTitle = typeof body?.title === "string";
  const title = hasTitle ? (body.title.trim().slice(0, 120) || "My Project") : "My Project";

  const { project, cookie } = await resolveOrCreateCurrentProject(c.env, c.req.raw, title);
  const projectState = await c.env.DB.prepare(
    "SELECT status_customer, quote_edit_version FROM project WHERE id=?",
  ).bind(project.id).first<{ status_customer: string; quote_edit_version: number }>();
  if (!projectState || projectState.status_customer !== "draft") {
    return c.json({ error: "project_changed_reload_required" }, 409);
  }
  const nextQuoteVersion = projectState.quote_edit_version + 1;
  const mutationToken = uuid();

  // Upsert by stable server id rather than delete-all + insert-all. A line the
  // client already knows (serverId) is UPDATEd in place, so its id — and the
  // parse_line.quote_line_id provenance link pointing at it — survives every
  // autosave and the pre-submit save. Only genuinely removed lines are deleted.
  type StoredRow = EditableSnapshot & {
    id: string; origin: string | null; ai_proposal_line_id: string | null;
    pricing_snapshot_json: string | null; configuration_snapshot_json: string | null;
    selected_variant_id: string | null; line_total: number | null; line_kind: string | null;
  };
  // parent_line_id IS NULL — OPENINGS only, matching the read route, which
  // returns segments nested inside their parent rather than as items.
  //
  // Without it every segment was addressable by this endpoint, and the customer
  // already knows their ids because the read route sends them. Two ways that
  // bites: a segment id in `removedIds` DELETEs the unit (segments are never in
  // `keptIds`, since the client never sends them back as items), and a matching
  // item id UPDATEs one — writing qty directly and clearing its pricing snapshot.
  // Neither path calls recomputeComposite, so the opening is left claiming a
  // total for units that no longer exist or no longer cost that.
  //
  // It is not reachable today only because composites exist solely on projects
  // already past `draft`, which this route requires — an invariant that holds by
  // accident of ops being the only creator, and that the AI proposal path breaks
  // the moment it proposes a split, because parsing happens ON a draft project.
  // A guard is the fix; relying on the ordering of unrelated features is not.
  const storedRows = ((await c.env.DB.prepare(
    `SELECT id, origin, edited_fields, product_slug, options_json, dims_json, qty,
            ai_proposal_line_id, pricing_snapshot_json, configuration_snapshot_json,
            selected_variant_id, line_total, line_kind
       FROM quote_line WHERE project_id = ? AND revision_id IS NULL AND parent_line_id IS NULL`,
  ).bind(project.id).all<StoredRow>()).results ?? []);
  const existing = new Map(storedRows.map((r) => [r.id, r]));
  const resolved = items.map((raw, i) => {
    const sid = incomingServerId(raw);
    return { raw, i, id: sid && existing.has(sid) ? sid : null };
  });
  const keptIds = new Set(resolved.filter((r) => r.id).map((r) => r.id as string));

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `UPDATE project SET quote_edit_version=?, quote_mutation_token=?,
          updated_at=datetime('now')
        WHERE id=? AND status_customer='draft' AND quote_edit_version=?
          AND quote_mutation_token IS NULL`,
    ).bind(nextQuoteVersion, mutationToken, project.id, projectState.quote_edit_version),
  ];
  // Delete only the draft lines the client dropped (origin is never resurrected).
  for (const id of existing.keys()) {
    if (!keptIds.has(id) && removedIds.has(id)) {
      stmts.push(c.env.DB.prepare(
        // The parent guard is repeated at the WRITE, not only on the set of ids
        // this route will consider. A unit is never the customer's to delete —
        // deleting one silently leaves its opening priced for units it no longer
        // has — and that should not depend on a SELECT twenty lines away
        // continuing to filter them out.
        `DELETE FROM quote_line WHERE id=? AND project_id=? AND parent_line_id IS NULL AND EXISTS (
           SELECT 1 FROM project WHERE id=? AND status_customer='draft'
             AND quote_edit_version=? AND quote_mutation_token=?
         )`,
      ).bind(id, project.id, project.id, nextQuoteVersion, mutationToken));
    }
  }
  // Composite parents whose derived fields must be rebuilt once the batch lands.
  const recomputeParents: string[] = [];
  for (const { raw, i, id } of resolved) {
    const f = await itemFields(c.env, raw, project.owner_user_id);
    if (id) {
      // UPDATE preserves the row's id AND its server-owned origin (not from client).
      // Schedule-origin rows also record WHICH field groups the human changed
      // (0019) — the tag-upsert importer never overwrites an edited field.
      const stored = existing.get(id)!;
      const edited = stored.origin === "schedule" || stored.origin === "ai"
        ? editedFieldsAfterSave(stored, f)
        : stored.edited_fields;
      // A COMPOSITE PARENT IS NOT AN ORDINARY LINE, and this route used to treat
      // it as one. Two things went wrong every time a customer resized one:
      //
      //   * line_total was overwritten with priceItem() of the parent's OWN
      //     product slug — a single frame's price standing in for the sum of the
      //     units, silently.
      //   * coverage_delta_mm was left untouched. It is derived from the opening
      //     and the units' sizes, so after a resize it described a plan that no
      //     longer existed — which is why changing W1 from 2050 to 2060 flagged
      //     both children (the browser compares live) and left the parent clean.
      //
      // Only the fields the customer actually owns on an opening are written
      // here — its reference, its note and its size. Everything derived comes
      // back from recomputeComposite after the batch commits, which is already
      // the single writer of parent total, status and coverage everywhere else.
      if (stored.line_kind === "composite_parent") {
        recomputeParents.push(id);
        stmts.push(c.env.DB.prepare(
          `UPDATE quote_line SET external_ref=?, room_label=?, dims_json=?, position=?,
             review_json=?, edited_fields=?, edit_version=edit_version+1,
             updated_at=datetime('now')
           WHERE id=? AND project_id=? AND revision_id IS NULL AND parent_line_id IS NULL
             AND EXISTS (
               SELECT 1 FROM project WHERE id=? AND status_customer='draft'
                 AND quote_edit_version=? AND quote_mutation_token=?
             )`,
        ).bind(
          f.external_ref, f.room_label, f.dims_json, i, f.review_json, edited,
          id, project.id, project.id, nextQuoteVersion, mutationToken,
        ));
        continue;
      }
      const aiManaged = stored.origin === "ai" || !!stored.ai_proposal_line_id;
      if (aiManaged && edited === stored.edited_fields) {
        // A reload followed by autosave must not replace the AI configuration's
        // private server price with a second opinion — hence external_ref and
        // room_label only, and COALESCE rather than an assignment below.
        //
        // The COALESCE is a REPAIR, and it can only ever fill a NULL. Lines
        // edited before the fix below were left permanently unpriced: the
        // material-edit branch nulled line_total, and every autosave after that
        // landed HERE, where nothing repriced them. They healed only if the
        // customer happened to edit a different field group. Restricted to rows
        // that have actually been edited, so an AI line the AI itself could not
        // price keeps its honest NULL rather than being quietly papered over
        // with a deterministic figure.
        const heal = stored.line_total == null && stored.edited_fields != null;
        stmts.push(c.env.DB.prepare(
          `UPDATE quote_line SET external_ref=?, room_label=?,
             line_total=COALESCE(line_total, ?),
             status=CASE WHEN line_total IS NULL AND ? IS NOT NULL
                         THEN 'technical_review' ELSE status END,
             position=?, edit_version=edit_version+1, updated_at=datetime('now')
           WHERE id=? AND project_id=? AND revision_id IS NULL AND parent_line_id IS NULL
             AND EXISTS (
               SELECT 1 FROM project WHERE id=? AND status_customer='draft'
                 AND quote_edit_version=? AND quote_mutation_token=?
             )`,
        ).bind(
          f.external_ref, f.room_label,
          heal ? f.line_total : null, heal ? f.line_total : null,
          i, id, project.id, project.id, nextQuoteVersion, mutationToken,
        ));
        continue;
      }
      if (aiManaged) {
        // A customer may change an AI suggestion, but cannot clear server-owned
        // technical review state from the browser, and a material edit voids the
        // exact configuration snapshot the AI priced — variant, pricing snapshot
        // and configuration snapshot all go with it.
        //
        // It USED TO void the price as well, and that was the bug: the line read
        // "$-,--" from the moment the customer touched it, the project estimate
        // silently under-counted by that amount, and because
        // `customerConfigurationChanged` is a WARNING the row carried no badge to
        // say why. Nothing the customer could do brought it back. Proven in
        // production: one project's W1–W11 all priced, W12 — the only line edited
        // — NULL with edited_fields ["options_json"].
        //
        // f.line_total is not "the browser's estimate": itemFields() computed it
        // server-side through priceItem → priceLine, the same engine and the same
        // rate cards every manual and schedule line goes through. Once the
        // customer has changed the configuration the line IS an ordinary
        // configured line, and that engine is exactly the right pricer for it.
        // The technical_review status and the review reason both stay, so staff
        // still confirm it; they now confirm a priced line instead of a blank.
        stmts.push(c.env.DB.prepare(
          `UPDATE quote_line SET external_ref=?, room_label=?, product_slug=?,
             options_json=?, dims_json=?, qty=?, line_total=?,
             status=?, position=?,
             review_json=json_patch(COALESCE(review_json,'{}'), ?),
             edited_fields=?,
             recommendation_basis=NULL, recommendation_confidence=NULL,
             pricing_snapshot_json=NULL, configuration_snapshot_json=NULL,
             selected_variant_id=?,
             edit_version=edit_version+1, updated_at=datetime('now')
           WHERE id=? AND project_id=? AND revision_id IS NULL AND parent_line_id IS NULL
             AND EXISTS (
               SELECT 1 FROM project WHERE id=? AND status_customer='draft'
                 AND quote_edit_version=? AND quote_mutation_token=?
             )`,
        ).bind(
          f.external_ref, f.room_label, f.product_slug, f.options_json, f.dims_json,
          f.qty, f.line_total,
          // An edit that leaves the line unpriceable — no product, no size — is
          // the customer's to fix and must still block submission, which
          // 'technical_review' would not: customerConfigurationChanged is a
          // warning, and a warning excuses an absent price.
          f.line_total == null ? "incomplete" : "technical_review",
          i,
          JSON.stringify({
            customerConfigurationChanged: "You changed an AI-priced configuration; we will confirm its thermal suitability and price.",
          }),
          edited,
          stored.product_slug === f.product_slug ? stored.selected_variant_id : null,
          id, project.id, project.id, nextQuoteVersion, mutationToken,
        ));
        continue;
      }
      stmts.push(c.env.DB.prepare(
        `UPDATE quote_line SET external_ref=?, room_label=?, product_slug=?, options_json=?, dims_json=?, qty=?, line_total=?, status=?, position=?, review_json=?, edited_fields=?, edit_version=edit_version+1, updated_at=datetime('now')
         WHERE id=? AND project_id=? AND revision_id IS NULL AND parent_line_id IS NULL
           AND EXISTS (
             SELECT 1 FROM project WHERE id=? AND status_customer='draft'
               AND quote_edit_version=? AND quote_mutation_token=?
           )`,
      ).bind(f.external_ref, f.room_label, f.product_slug, f.options_json, f.dims_json, f.qty, f.line_total, f.status, i, f.review_json, edited, id, project.id, project.id, nextQuoteVersion, mutationToken));
    } else {
      const r = await itemToInsert(c.env, project.id, raw, i, project.owner_user_id);
      stmts.push(c.env.DB.prepare(
        `INSERT INTO quote_line
           (id, project_id, external_ref, room_label, product_slug, options_json, dims_json, qty, line_total, status, position, origin, review_json)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM project WHERE id=? AND status_customer='draft'
               AND quote_edit_version=? AND quote_mutation_token=?
           )`,
      ).bind(r.id, r.project_id, r.external_ref, r.room_label, r.product_slug, r.options_json, r.dims_json, r.qty, r.line_total, r.status, r.position, r.origin, r.review_json, project.id, nextQuoteVersion, mutationToken));
    }
  }
  stmts.push(hasTitle
    ? c.env.DB.prepare(
      `UPDATE project SET title=?, quote_mutation_token=NULL, updated_at=datetime('now')
        WHERE id=? AND status_customer='draft' AND quote_edit_version=?
          AND quote_mutation_token=?`,
    ).bind(title, project.id, nextQuoteVersion, mutationToken)
    : c.env.DB.prepare(
      `UPDATE project SET quote_mutation_token=NULL, updated_at=datetime('now')
        WHERE id=? AND status_customer='draft' AND quote_edit_version=?
          AND quote_mutation_token=?`,
    ).bind(project.id, nextQuoteVersion, mutationToken));
  const committed = await c.env.DB.batch(stmts);
  if (Number(committed[0]?.meta?.changes ?? 0) !== 1 ||
      Number(committed[committed.length - 1]?.meta?.changes ?? 0) !== 1) {
    return c.json({ error: "project_changed_reload_required" }, 409);
  }

  // AFTER the batch, so it reads the opening the customer just saved rather than
  // the one it is replacing. Sequential and small: a project has few composites,
  // and each one's units are already loaded by id.
  for (const parentId of recomputeParents) await recomputeComposite(c.env, parentId);

  if (cookie) c.header("Set-Cookie", cookie);
  return c.json({ project: projectDto(project), items: await loadLines(c.env, project.id) });
});

// Restore the current published AI proposal after a customer experiments with a
// material configuration change. The immutable proposal is the only trusted
// source for its private exact price and performance configuration.
projects.post("/current/lines/:id/restore-ai", async (c) => {
  const { project } = await resolveCurrentProject(c.env, c.req.raw);
  if (!project || project.status_customer !== "draft") {
    return c.json({ error: "not_found" }, 404);
  }
  const restoreState = await c.env.DB.prepare(
    "SELECT quote_edit_version FROM project WHERE id=? AND status_customer='draft'",
  ).bind(project.id).first<{ quote_edit_version: number }>();
  if (!restoreState) return c.json({ error: "project_changed_reload_required" }, 409);
  const proposal = await c.env.DB.prepare(
    `SELECT pl.product_slug, pl.performance_variant_id, pl.configuration_json,
            pl.price_snapshot_json, pl.recommendation_basis, pl.confidence_band,
            pl.review_required, pl.id AS proposal_line_id, q.edit_version
       FROM quote_line q
       JOIN ai_proposal_line pl ON pl.quote_line_id=q.id
       JOIN ai_proposal p ON p.id=pl.proposal_id
       JOIN project project_state ON project_state.id=q.project_id
      WHERE q.id=? AND q.project_id=? AND q.revision_id IS NULL
        AND p.status='published'
        AND p.source_generation=project_state.ai_generation
        AND EXISTS (
          SELECT 1 FROM ai_job_claim j
           WHERE j.project_id=project_state.id
             AND j.source_generation=project_state.ai_generation
             AND j.status='completed'
        )
        AND pl.product_slug IS NOT NULL AND pl.price_snapshot_json IS NOT NULL`,
  ).bind(c.req.param("id"), project.id).first<{
    product_slug: string; performance_variant_id: string | null;
    configuration_json: string; price_snapshot_json: string;
    recommendation_basis: string; confidence_band: string;
    review_required: number; proposal_line_id: string; edit_version: number;
  }>();
  if (!proposal) return c.json({ error: "restorable_ai_proposal_not_found" }, 409);
  const configuration = safeParse(proposal.configuration_json);
  const price = safeParse(proposal.price_snapshot_json);
  const dimensions = configuration.dimensions && typeof configuration.dimensions === "object"
    ? configuration.dimensions as Record<string, unknown> : {};
  const options = configuration.options && typeof configuration.options === "object" &&
    !Array.isArray(configuration.options)
    ? configuration.options as Record<string, unknown> : {};
  const total = Number(price.total);
  if (!Number.isFinite(total)) return c.json({ error: "invalid_ai_price_snapshot" }, 409);
  const review = proposal.review_required
    ? { thermalRecommendation: "We will confirm this AI-recommended thermal configuration during technical review." }
    : null;
  const restored = await c.env.DB.batch([
    c.env.DB.prepare(
    `UPDATE quote_line SET product_slug=?, options_json=?, dims_json=?, qty=?,
       line_total=?, status=?, review_json=?, edited_fields=NULL,
       ai_proposal_line_id=?,
       selected_variant_id=?, configuration_snapshot_json=?,
       pricing_snapshot_json=?, recommendation_basis=?,
       recommendation_confidence=?, edit_version=edit_version+1,
       updated_at=datetime('now')
     WHERE id=? AND project_id=? AND revision_id IS NULL AND parent_line_id IS NULL
       AND edit_version=?
       AND EXISTS (
         SELECT 1 FROM project restore_project
          WHERE restore_project.id=quote_line.project_id
            AND restore_project.status_customer='draft'
            AND restore_project.quote_edit_version=?
       )
       AND EXISTS (
         SELECT 1 FROM ai_proposal_line current_line
         JOIN ai_proposal current_proposal ON current_proposal.id=current_line.proposal_id
         JOIN project current_project ON current_project.id=quote_line.project_id
        WHERE current_line.id=?
          AND current_proposal.status='published'
          AND current_proposal.source_generation=current_project.ai_generation
       )`,
    ).bind(
    proposal.product_slug, JSON.stringify(options),
    JSON.stringify({ width: dimensions.widthMm ?? "", height: dimensions.heightMm ?? "" }),
    Math.max(1, Math.floor(Number(configuration.quantity) || 1)),
    total, proposal.review_required ? "technical_review" : "ready",
    review ? JSON.stringify(review) : null,
    proposal.proposal_line_id,
    proposal.performance_variant_id, proposal.configuration_json,
    proposal.price_snapshot_json, proposal.recommendation_basis,
    proposal.confidence_band, c.req.param("id"), project.id,
    proposal.edit_version, restoreState.quote_edit_version, proposal.proposal_line_id,
    ),
    c.env.DB.prepare(
      `UPDATE project SET quote_edit_version=quote_edit_version+1, updated_at=datetime('now')
        WHERE id=? AND status_customer='draft' AND quote_edit_version=?`,
    ).bind(project.id, restoreState.quote_edit_version),
  ]);
  if (Number(restored[0]?.meta?.changes ?? 0) !== 1 ||
      Number(restored[1]?.meta?.changes ?? 0) !== 1) {
    return c.json({ error: "ai_proposal_changed" }, 409);
  }
  return c.json({ project: projectDto(project), items: await loadLines(c.env, project.id) });
});
