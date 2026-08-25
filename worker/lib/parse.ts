// Schedule-parse job orchestration, persistence and quota accounting.
//
// Synchronous by design (Phase 1): the deterministic extractor reads a digital
// PDF in well under a request budget, so the /parse route runs the whole pipeline
// inline and returns the created lines. The pipeline is factored behind the
// extractor interface + this module so it can move to a Cloudflare Workflow later
// with no change to routes, matcher or schema.
import type { Env } from "../types";
import { uuid } from "./util";
import { logEvent } from "./activity";
import { extractSchedule } from "./extract";
import { matchSchedule, type ParsedLine } from "../../src/data/scheduleMatch";
import { createCachedPriceResolver } from "./estimator/pricing";
import type { Product } from "../../src/data/catalogue";
import { priceItem } from "./lines";
import { captureFigures, fetchFigureCatalogue, pickMoved } from "./figures";
import type { ProjectRow } from "./access";

export interface ParseFile { id: string; r2_key: string; filename: string; size: number | null; content_type?: string; virus_status?: string }

// "upsert" (default since the multi-file UX rework) matches parsed lines to
// existing draft lines by schedule tag: known tags refresh, new tags add,
// vanished tags reconcile — the Replace/Add prompt is dead (spec §1).
// "replace"/"append" survive only as explicit legacy modes.
export type ParseMode = "replace" | "append" | "upsert";

export interface ParseOutcome {
  jobId: string;
  status: "completed" | "needs_review" | "failed";
  engine: string;
  itemCount: number;
  needsReviewCount: number;
  /** Upsert digest (multi-file UX spec §3): what this parse actually did to the
   *  draft — feeds the change-digest banner. All zero for legacy modes. */
  added: number;
  updated: number;
  removed: number;
  /** Edited lines whose tag vanished — kept + flagged, never silently deleted. */
  keptForReview: number;
  /** Tags where a MANUAL line collides with a parsed schedule row and the
   *  customer hasn't decided Link/Keep-separate yet (spec §1b). The customer's
   *  line stands; the card asks once. */
  collisions: string[];
  /** Per-line field changes this parse made (spec §3 provenance): feeds the
   *  Updated pill + strike-through old→new rows. Session-scoped by design —
   *  the pill decays on next visit; the values themselves are the durable record. */
  changes: { tag: string; field: "size" | "qty" | "product"; from: string; to: string }[];
  error?: string;
  /** Internal cleanup hand-off. Routes remove these R2 objects only after the
   * corresponding D1 file rows were atomically removed with the parsed lines. */
  deletedScheduleKeys?: string[];
}

// ── Quota ──────────────────────────────────────────────────────────────────
// 10/month anonymous, 100/month registered — counted since the LATER of the
// month start and the subject's most recent order ("reset on purchase"). Derived
// from job rows; no counter to drift. Anonymous subjects have no orders.
export const ANON_PARSE_LIMIT = 10;
export const REGISTERED_PARSE_LIMIT = 100;

export interface QuotaInfo { used: number; limit: number; remaining: number; resetsOn: string }

function startOfMonthUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01 00:00:00`;
}
function startOfNextMonthISO(): string {
  const d = new Date();
  const y = d.getUTCMonth() === 11 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  const m = d.getUTCMonth() === 11 ? 1 : d.getUTCMonth() + 2;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export async function parseQuota(env: Env, subject: string, userId: string | null): Promise<QuotaInfo> {
  const limit = userId ? REGISTERED_PARSE_LIMIT : ANON_PARSE_LIMIT;
  let since = startOfMonthUTC();
  if (userId) {
    const last = await env.DB
      .prepare(`SELECT MAX(o.created_at) AS t FROM "order" o JOIN project p ON p.id = o.project_id WHERE p.owner_user_id = ?`)
      .bind(userId).first<{ t: string | null }>();
    if (last?.t && last.t > since) since = last.t; // purchase resets the window
  }
  const row = await env.DB
    .prepare("SELECT count(*) AS n FROM schedule_parse_job WHERE subject = ? AND created_at >= ? AND status != 'failed'")
    .bind(subject, since).first<{ n: number }>();
  const used = row?.n ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used), resetsOn: startOfNextMonthISO() };
}

// ── Content hash (dedupe / cache key) ────────────────────────────────────────
export async function sha256hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Quota subject (NEVER the raw claim cookie) ───────────────────────────────
// The anonymous claim_token is a bearer credential; storing it in plaintext would
// turn a DB read into session takeover. So the quota subject is an HMAC (or salted
// hash) of the identity, never the token itself. Registered users key on their
// (non-bearer) user id.
async function keyedHash(env: Env, value: string): Promise<string> {
  const enc = new TextEncoder();
  const secret = env.PARSE_SUBJECT_SECRET;
  if (secret) {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  }
  return (await sha256hex(enc.encode(`amj-parse-subject:${value}`))).slice(0, 32);
}

export async function deriveSubject(env: Env, id: { userId: string | null; claimToken: string | null; ip: string }): Promise<string> {
  if (id.userId) return `u:${id.userId}`;               // DB id, not a bearer credential
  if (id.claimToken) return `a:${await keyedHash(env, id.claimToken)}`;
  return `ip:${await keyedHash(env, id.ip)}`;
}

// ── Existing draft state (for replace/append + 1-file enforcement) ───────────
export async function draftScheduleState(env: Env, projectId: string): Promise<{ lineCount: number; scheduleFiles: ParseFile[] }> {
  const lc = await env.DB
    .prepare("SELECT count(*) AS n FROM quote_line WHERE project_id = ? AND parent_line_id IS NULL")
    .bind(projectId).first<{ n: number }>();
  const { results } = await env.DB
    .prepare("SELECT id, r2_key, filename, size FROM file_asset WHERE project_id = ? AND kind = 'schedule' ORDER BY created_at DESC")
    .bind(projectId).all<ParseFile>();
  return { lineCount: lc?.n ?? 0, scheduleFiles: results ?? [] };
}

// ── The pipeline ─────────────────────────────────────────────────────────────
// Cloudflare bills up to 1,000 D1 queries per Worker invocation, and every
// statement in a batch counts individually. Each imported row emits two inserts
// (quote_line + parse_line); with the replace-delete and the two trailing job/
// project updates that is 2·N + 3. Cap N well under the ceiling so a large parse
// fails cleanly instead of exceeding the budget mid-apply.
const MAX_IMPORT_ROWS = 480;

export async function runScheduleParse(
  env: Env,
  opts: {
    project: ProjectRow; file: ParseFile; subject: string; userId: string | null;
    mode: ParseMode; previousScheduleFiles?: ParseFile[];
  },
): Promise<ParseOutcome> {
  const { project, file, subject, mode } = opts;
  const jobId = uuid();
  await env.DB.prepare(
    "INSERT INTO schedule_parse_job (id, project_id, file_asset_id, subject, status) VALUES (?,?,?,?,'extracting')",
  ).bind(jobId, project.id, file.id, subject).run();

  const fail = async (code: string): Promise<ParseOutcome> => {
    await env.DB.prepare("UPDATE schedule_parse_job SET status='failed', error=?, completed_at=datetime('now') WHERE id=?").bind(code, jobId).run();
    return { jobId, status: "failed", engine: "cf-deterministic", itemCount: 0, needsReviewCount: 0, added: 0, updated: 0, removed: 0, keptForReview: 0, collisions: [], changes: [], error: code };
  };

  // Only a scanner-cleared file is ever fed to the extractor. Uploads are scanned
  // inline before they persist, so this guards the legacy/rescan paths.
  if (file.virus_status && file.virus_status !== "clean") return fail("file_not_scanned");

  // Load bytes from R2 once — hashed here (dedupe/observability) and reused for
  // extraction, so the route no longer needs a second GET.
  const obj = await env.FILES.get(file.r2_key);
  if (!obj) return fail("file_missing");
  const bytes = new Uint8Array(await obj.arrayBuffer());
  const contentHash = await sha256hex(bytes).catch(() => null);
  if (contentHash) {
    await env.DB.prepare("UPDATE schedule_parse_job SET content_hash=? WHERE id=?").bind(contentHash, jobId).run();
  }

  // Extract.
  let extract;
  try {
    extract = await extractSchedule({ bytes, contentType: file.content_type || obj.httpMetadata?.contentType || "application/pdf", filename: file.filename }, env);
  } catch (e) {
    return fail(`extract_error:${String(e)}`.slice(0, 200));
  }
  if (!extract.rows.length) {
    const w = extract.warnings;
    const code = w.includes("not_a_pdf") ? "not_a_pdf"
      : w.includes("encrypted_pdf") ? "encrypted_pdf"
      : w.includes("too_many_pages") ? "too_many_pages"
      : w.includes("no_text_layer") ? "no_text_layer"
      : "no_rows_found";
    return fail(code);
  }

  await env.DB.prepare(
    "UPDATE schedule_parse_job SET status='matching', engine=?, engine_version=?, page_count=?, input_tokens=?, output_tokens=?, estimated_cost_microusd=? WHERE id=?",
  ).bind(extract.engine, extract.engineVersion ?? null, extract.pageCount || null, extract.inputTokens ?? null, extract.outputTokens ?? null, extract.costMicroUsd ?? null, jobId).run();

  // Match → estimator lines (faithful + flagged).
  //
  // THE PRICER IS INJECTED HERE (D6). `matchSchedule` is pure and synchronous
  // and has no pricing engine of its own — pricing's single home is D1's
  // `computePrice` — so the Worker builds the resolver once per parse job and
  // hands it a synchronous closure. Without it the matcher falls back to the
  // series-bias order, which is what the browser gets and is correct there.
  //
  // Built with a NULL user on purpose: there is no account on this path, and a
  // uniform account discount cannot reorder a list anyway, so comparing base
  // rate-card totals gives every visitor the same order (AD11).
  const priceFromCache = await createCachedPriceResolver(env, null);
  const priceOf = (product: Product, widthMm: number, heightMm: number): number | null => {
    try {
      const snapshot = priceFromCache({
        family: product.slug, widthMm, heightMm, qty: 1, optionSlugs: [],
      });
      return snapshot.ok && snapshot.total > 0 ? snapshot.total : null;
    } catch {
      // A product this rate card cannot price is not a cheap product; it simply
      // does not compete, and the bias order still answers.
      return null;
    }
  };
  const lines: ParsedLine[] = matchSchedule(extract.rows, { priceOf });

  // Hard row cap: a single apply must stay within the D1 per-invocation budget.
  // Fail cleanly rather than exceed it mid-batch after paying for extraction.
  if (lines.length > MAX_IMPORT_ROWS) return fail("too_many_items");

  // Extraction is deliberately outside the write transaction. Re-read the cart
  // epoch immediately before applying the result, then claim it with a
  // request-unique token in the same batch as every line mutation. If submission,
  // clear, autosave, or another parse wins first, all guarded statements are
  // no-ops and the stale extraction is recorded as failed rather than applied.
  const mutationState = await env.DB.prepare(
    `SELECT quote_edit_version FROM project
      WHERE id=? AND status_customer='draft' AND quote_mutation_token IS NULL`,
  ).bind(project.id).first<{ quote_edit_version: number }>();
  if (!mutationState) return fail("project_changed");
  const nextQuoteVersion = mutationState.quote_edit_version + 1;
  const mutationToken = uuid();
  const mutationGuard = `EXISTS (
    SELECT 1 FROM project
     WHERE id=? AND status_customer='draft' AND quote_edit_version=?
       AND quote_mutation_token=?
  )`;

  // Apply mode (multi-file UX spec §1): "upsert" (default) matches by schedule
  // tag; "replace" clears prior draft lines; "append" keeps them (legacy modes).
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE project SET quote_edit_version=?, quote_mutation_token=?,
          updated_at=datetime('now')
        WHERE id=? AND status_customer='draft' AND quote_edit_version=?
          AND quote_mutation_token IS NULL
          AND EXISTS (
            SELECT 1 FROM file_asset
             WHERE id=? AND project_id=?
          )`,
    ).bind(
      nextQuoteVersion, mutationToken, project.id,
      mutationState.quote_edit_version, file.id, project.id,
    ),
  ];
  if (mode === "replace") {
    stmts.push(env.DB.prepare(
      `DELETE FROM quote_line
        WHERE project_id=? AND ${mutationGuard}`,
    ).bind(project.id, project.id, nextQuoteVersion, mutationToken));
  }

  // Existing draft state for the upsert: schedule-origin rows are matchable by
  // tag; MANUAL rows are untouchable (a document run never creates, deletes or
  // writes a manual line — spec §1b). A manual line whose code collides with a
  // parsed tag stands as-is; the parsed row is skipped (the Link/Keep-separate
  // card arrives with the digest UI).
  interface DraftRow { id: string; external_ref: string | null; origin: string | null; edited_fields: string | null; position: number; collision_choice: string | null; product_slug: string | null; dims_json: string | null; qty: number | null; options_json: string | null; performance_figures_json: string | null }
  const draftRows = mode === "upsert"
    ? ((await env.DB.prepare("SELECT id, external_ref, origin, edited_fields, position, collision_choice, product_slug, dims_json, qty, options_json, performance_figures_json FROM quote_line WHERE project_id = ? AND parent_line_id IS NULL").bind(project.id).all<DraftRow>()).results ?? [])
    : [];
  const byTag = new Map<string, DraftRow>();
  const manualTags = new Map<string, DraftRow>();
  for (const r of draftRows) {
    if (!r.external_ref) continue;
    if ((r.origin ?? "manual") === "schedule") { if (!byTag.has(r.external_ref)) byTag.set(r.external_ref, r); }
    else if (!manualTags.has(r.external_ref)) manualTags.set(r.external_ref, r);
  }

  const posRow = mode === "replace"
    ? { n: 0 }
    : await env.DB.prepare("SELECT COALESCE(MAX(position),-1)+1 AS n FROM quote_line WHERE project_id = ? AND parent_line_id IS NULL").bind(project.id).first<{ n: number }>();
  let position = posRow?.n ?? 0;

  let needsReview = 0;
  let added = 0, updated = 0, removed = 0, keptForReview = 0;
  const collisions: string[] = [];
  const changes: ParseOutcome["changes"] = [];
  const MAX_CHANGES = 100; // provenance display, not an audit log
  // Record what an update ACTUALLY changed on a matched line (spec §3: the
  // digest and pills must reflect real differences, not mere row touches).
  const recordChanges = (tag: string, old: DraftRow, l: ParsedLine, locked: string[]) => {
    if (changes.length >= MAX_CHANGES) return;
    let oldDims: { width?: unknown; height?: unknown } = {};
    try { oldDims = JSON.parse(old.dims_json || "{}"); } catch { /* unreadable ⇒ no dim diff */ }
    const dim = (v: unknown) => String(v ?? "").trim();
    if (!locked.includes("dims_json") && (dim(oldDims.width) !== dim(l.width) || dim(oldDims.height) !== dim(l.height))) {
      changes.push({ tag, field: "size", from: `${dim(oldDims.height) || "?"}×${dim(oldDims.width) || "?"}mm`, to: `${dim(l.height) || "?"}×${dim(l.width) || "?"}mm` });
    }
    if (!locked.includes("qty") && (old.qty ?? 1) !== l.qty) {
      changes.push({ tag, field: "qty", from: String(old.qty ?? 1), to: String(l.qty) });
    }
    if (!locked.includes("product_slug") && (old.product_slug ?? "") !== l.productSlug && l.productSlug) {
      changes.push({ tag, field: "product", from: old.product_slug ?? "—", to: l.productSlug });
    }
  };
  const seenTags = new Set<string>();
  const created: { line: ParsedLine; qlId: string; plId: string; idx: number }[] = [];
  // Priced up front: the loop below builds statements synchronously, and with a
  // single engine pricing is now a D1 round-trip.
  const lineTotals = await Promise.all(lines.map((l) => priceItem(env, l)));
  // ONE catalogue consultation for the whole import, never one per line
  // (SNAP-AC-7) — the loop below is synchronous, so the figures are resolved up
  // front exactly as the prices are. §1.4: the slug set is built from MOVED
  // picks only, so an identical re-upload carries every matched row's record
  // forward and asks the catalogue nothing (the existing "no changes"
  // discipline, extended to figures).
  const pickOf = (l: ParsedLine) => ({ productSlug: l.productSlug, variantId: null, options: l.options });
  const storedOf = (l: ParsedLine) => {
    const match = mode === "upsert" && l.code ? byTag.get(l.code) : undefined;
    if (!match) return null;
    let glazing: string | null = null;
    try { glazing = String((JSON.parse(match.options_json || "{}") as Record<string, unknown>).glazing ?? "") || null; }
    catch { /* unreadable options ⇒ no glass on record */ }
    return {
      productSlug: match.product_slug,
      variantId: null,
      glazing,
      figuresJson: match.performance_figures_json,
    };
  };
  const figureCatalogue = await fetchFigureCatalogue(
    env, lines.flatMap((l) => (pickMoved(pickOf(l), storedOf(l)) ? [l.productSlug] : [])));
  const figuresFor = (l: ParsedLine) => captureFigures(figureCatalogue, pickOf(l), storedOf(l));
  lines.forEach((l, idx) => {
    const priced = { ok: lineTotals[idx] != null };
    const hasReview = !!l.review && Object.keys(l.review).length > 0;
    // Unpriceable ⇒ 'incomplete' (customer-blocking); priced+flagged ⇒
    // 'technical_review' (we resolve, submittable); priced+clean ⇒ 'ready'.
    const status = !priced.ok ? "incomplete" : hasReview ? "technical_review" : "ready";
    const lineTotal = lineTotals[idx];
    const plId = uuid();
    let qlId: string;

    const match = mode === "upsert" && l.code ? byTag.get(l.code) : undefined;
    const manualClash = mode === "upsert" && l.code && !match ? manualTags.get(l.code) : undefined;
    if (manualClash) {
      // Manual-line collision: the customer's line stands; the parsed row is
      // skipped. Undecided ⇒ surface the Link/Keep-separate card ONCE;
      // 'separate' ⇒ permanently quiet; 'linked' never reaches here (the line
      // becomes schedule-origin on linking, so it matches above).
      if (!manualClash.collision_choice) collisions.push(l.code as string);
      return;
    }
    if (l.code) seenTags.add(l.code);

    if (match) {
      qlId = match.id;
      const changesBefore = changes.length;
      // HUMAN-EDIT GUARD (0019): fields a customer changed are never overwritten
      // by a re-parse — and when any priced-relevant field is locked, the row's
      // price/status stand too (repricing from parsed values would betray the guard).
      let locked: string[] = [];
      try { const v = JSON.parse(match.edited_fields || "[]"); if (Array.isArray(v)) locked = v; } catch { /* no locks */ }
      const keep = (f: string, v: unknown) => (locked.includes(f) ? null : v);
      recordChanges(l.code as string, match, l, locked);
      // An identical re-upload must read as "no changes", not "N updated" — a
      // matched row counts as updated ONLY when a real difference was recorded
      // (this also keeps the wrong-project Remove offer from false-firing).
      if (changes.length > changesBefore) updated++;
      if (locked.length === 0) {
        if (hasReview) needsReview++;
        stmts.push(env.DB.prepare(
          `UPDATE quote_line SET room_label=?, product_slug=?, options_json=?,
             dims_json=?, qty=?, line_total=?, status=?, review_json=?,
             performance_figures_json=?
            WHERE id=? AND ${mutationGuard}`,
        ).bind(l.location || null, l.productSlug, JSON.stringify(l.options),
          JSON.stringify({ width: l.width, height: l.height }), l.qty, lineTotal, status,
          l.review ? JSON.stringify(l.review) : null, figuresFor(l), qlId,
          project.id, nextQuoteVersion, mutationToken));
      } else {
        stmts.push(env.DB.prepare(
          // The figures follow the PRODUCT's own lock, on the same keep()
          // discipline: kept when product_slug is kept, refreshed when it moves.
          // Re-resolving them under a locked product would describe a product
          // this row is not carrying.
          `UPDATE quote_line SET room_label = COALESCE(?, room_label),
             product_slug = COALESCE(?, product_slug), options_json = COALESCE(?, options_json),
             dims_json = COALESCE(?, dims_json), qty = COALESCE(?, qty),
             performance_figures_json = COALESCE(?, performance_figures_json)
            WHERE id=? AND ${mutationGuard}`,
        ).bind(l.location || null, keep("product_slug", l.productSlug),
          keep("options_json", JSON.stringify(l.options)),
          keep("dims_json", JSON.stringify({ width: l.width, height: l.height })),
          keep("qty", l.qty), keep("product_slug", figuresFor(l)),
          qlId, project.id, nextQuoteVersion, mutationToken));
      }
    } else {
      if (hasReview) needsReview++;
      added++;
      qlId = uuid();
      stmts.push(env.DB.prepare(
        `INSERT INTO quote_line (id, project_id, external_ref, room_label, product_slug, options_json, dims_json, qty, line_total, status, position, origin, review_json, performance_figures_json)
         SELECT ?,?,?,?,?,?,?,?,?,?,?, 'schedule', ?,?
          WHERE ${mutationGuard}`,
      ).bind(
        qlId, project.id, l.code || null, l.location || null, l.productSlug,
        JSON.stringify(l.options), JSON.stringify({ width: l.width, height: l.height }),
        l.qty, lineTotal, status, position++, l.review ? JSON.stringify(l.review) : null,
        figuresFor(l),
        project.id, nextQuoteVersion, mutationToken,
      ));
    }
    stmts.push(env.DB.prepare(
      `INSERT INTO parse_line (id, job_id, page, source_index, raw_json, mapped_product_slug, mapped_dims_json, mapped_options_json, mapped_qty, external_ref, issues_json, quote_line_id)
       SELECT ?,?,?,?,?,?,?,?,?,?,?,?
        WHERE ${mutationGuard}`,
    ).bind(
      plId, jobId, null, idx, JSON.stringify(extract.rows[idx] ?? {}), l.productSlug || null,
      JSON.stringify({ width: l.width, height: l.height }), JSON.stringify(l.options), l.qty, l.code || null,
      l.review ? JSON.stringify(l.review) : null, qlId,
      project.id, nextQuoteVersion, mutationToken,
    ));
    created.push({ line: l, qlId, plId, idx });
  });

  // Reconciliation (spec §1, "revision supersede"): a schedule-origin line whose
  // tag no longer appears in the new parse is stale. Unedited ⇒ removed;
  // customer-edited ⇒ kept but flagged for review — never silently deleted.
  if (mode === "upsert") {
    for (const r of draftRows) {
      if ((r.origin ?? "manual") !== "schedule" || !r.external_ref || seenTags.has(r.external_ref)) continue;
      const edited = (() => { try { const v = JSON.parse(r.edited_fields || "[]"); return Array.isArray(v) && v.length > 0; } catch { return false; } })();
      if (edited) {
        stmts.push(env.DB.prepare(
          `UPDATE quote_line SET status='technical_review',
             review_json = json_patch(COALESCE(review_json,'{}'), '{"noLongerInDocuments":true}')
            WHERE id=? AND ${mutationGuard}`,
        ).bind(r.id, project.id, nextQuoteVersion, mutationToken));
        needsReview++;
        keptForReview++;
      } else {
        stmts.push(env.DB.prepare(
          `DELETE FROM quote_line WHERE id=? AND ${mutationGuard}`,
        ).bind(r.id, project.id, nextQuoteVersion, mutationToken));
        removed++;
      }
    }
  }

  const replacedScheduleFiles = (opts.previousScheduleFiles ?? [])
    .filter((existingFile) => existingFile.id !== file.id);
  for (const existingFile of replacedScheduleFiles) {
    stmts.push(env.DB.prepare(
      `DELETE FROM file_asset
        WHERE id=? AND project_id=? AND kind='schedule' AND ${mutationGuard}`,
    ).bind(
      existingFile.id, project.id, project.id, nextQuoteVersion, mutationToken,
    ));
  }
  stmts.push(env.DB.prepare(
    `UPDATE file_asset SET kind='schedule'
      WHERE id=? AND project_id=? AND ${mutationGuard}`,
  ).bind(file.id, project.id, project.id, nextQuoteVersion, mutationToken));

  const releaseIndex = stmts.length;
  stmts.push(env.DB.prepare(
    `UPDATE project SET quote_mutation_token=NULL, updated_at=datetime('now')
      WHERE id=? AND status_customer='draft' AND quote_edit_version=?
        AND quote_mutation_token=?`,
  ).bind(project.id, nextQuoteVersion, mutationToken));
  stmts.push(env.DB.prepare(
    `UPDATE schedule_parse_job
        SET status=?, item_count=?, confidence=?, completed_at=datetime('now')
      WHERE id=? AND EXISTS (
        SELECT 1 FROM project
         WHERE id=? AND status_customer='draft' AND quote_edit_version=?
           AND quote_mutation_token IS NULL
      )`,
  ).bind(
    needsReview ? "needs_review" : "completed", lines.length,
    extract.overallConfidence, jobId, project.id, nextQuoteVersion,
  ));

  const committed = await env.DB.batch(stmts);
  if (Number(committed[0]?.meta?.changes ?? 0) !== 1 ||
      Number(committed[releaseIndex]?.meta?.changes ?? 0) !== 1) {
    return fail("project_changed");
  }
  await logEvent(env, { actor: opts.userId ?? "customer", entityType: "project", entityId: project.id, action: `schedule parsed (${lines.length} items, ${needsReview} to review) via ${extract.engine}` });

  return {
    jobId,
    status: needsReview ? "needs_review" : "completed",
    engine: extract.engine,
    itemCount: lines.length,
    needsReviewCount: needsReview,
    added, updated, removed, keptForReview, collisions, changes,
    deletedScheduleKeys: replacedScheduleFiles.map((existingFile) => existingFile.r2_key),
  };
}

export interface JobDto { id: string; status: string; engine: string | null; itemCount: number | null; confidence: number | null; error: string | null; createdAt: string; completedAt: string | null }

export async function getJob(env: Env, projectId: string, jobId: string): Promise<JobDto | null> {
  const r = await env.DB.prepare(
    "SELECT id, status, engine, item_count, confidence, error, created_at, completed_at FROM schedule_parse_job WHERE id = ? AND project_id = ?",
  ).bind(jobId, projectId).first<any>();
  if (!r) return null;
  return { id: r.id, status: r.status, engine: r.engine, itemCount: r.item_count, confidence: r.confidence, error: r.error, createdAt: r.created_at, completedAt: r.completed_at };
}
