// Document ingestion (LLM strategy §7). For each clean uploaded file: sniff the
// real type (magic bytes, never the filename alone), assess photo quality with
// the measurable subset (§7.3 — dimensions/size from headers; blur/skew need
// pixel decode and are honestly reported as not assessed on-stack, NOT hidden
// behind a fake confidence), convert to Markdown via Workers AI toMarkdown()
// (§7.2 — search/classification/table text, never the only plan-reading path),
// classify the document, and archive derivatives under the §7.1 R2 layout.
//
// The original object is NEVER modified (§7.1) — derivatives live beside it.
import { extractText, getDocumentProxy } from "unpdf";
import type { Env } from "../../types";

// Matches the deterministic extractor's bound, for the same reason: cap the work
// before any processing. Kept equal on purpose — if one tier will read a
// document, the other must too.
//
// 100, not 30: a 31-page energy report was refused by one page. Measured on that
// file — 4.7MB, 31 pages — the text layer extracts in ~597ms (~19ms/page), so 30
// sat nowhere near a real constraint; 100 pages is ~2s, well inside the 60s CPU
// bound. NOTE: over the cap a PDF is still refused outright (pdf_too_many_pages),
// not truncated — raising the number is the whole change here.
const MAX_PDF_PAGES = 100;

export type DocKind = "pdf" | "png" | "jpeg" | "webp" | "other";
export type DocType = "schedule" | "energy_report" | "plans" | "supporting" | "unsupported";
export type ExtractionRole = "schedule" | "energy_report" | "plans";
export type RolePages = Record<ExtractionRole, number[]>;

// ── Pure: magic-byte sniffing ────────────────────────────────────────────────
export function sniffDocKind(bytes: Uint8Array): DocKind {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf"; // %PDF
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp"; // RIFF....WEBP
  return "other";
}

// ── Pure: image dimensions from headers (no pixel decode) ────────────────────
export function imageDimensions(bytes: Uint8Array, kind: DocKind): { width: number; height: number } | null {
  try {
    if (kind === "png" && bytes.length >= 24) {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: dv.getUint32(16), height: dv.getUint32(20) }; // IHDR
    }
    if (kind === "jpeg") {
      // Walk JPEG segments to the first SOF marker (C0–CF except C4/C8/CC).
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) { i++; continue; }
        const marker = bytes[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          const dv = new DataView(bytes.buffer, bytes.byteOffset + i, 10);
          return { height: dv.getUint16(5), width: dv.getUint16(7) };
        }
        const len = (bytes[i + 2] << 8) | bytes[i + 3];
        i += 2 + len;
      }
    }
  } catch { /* malformed header ⇒ unknown */ }
  return null;
}

// ── Pure: §7.3 quality assessment (measurable subset, honest about the rest) ─
export interface QualityAssessment {
  issues: string[];
  /** True when the photo is too poor to extract from at all. */
  reject: boolean;
}
export const MIN_IMAGE_DIM = 700;      // below this, schedule text is unreadable
export const MIN_IMAGE_BYTES = 20_000; // heavier compression than any legible photo

export function assessImageQuality(dims: { width: number; height: number } | null, byteLength: number): QualityAssessment {
  const issues: string[] = [];
  if (!dims) issues.push("dimensions_unreadable");
  else if (Math.min(dims.width, dims.height) < MIN_IMAGE_DIM) issues.push("resolution_too_low");
  if (byteLength < MIN_IMAGE_BYTES) issues.push("file_suspiciously_small");
  // Blur/skew/glare need pixel decode — not available on-stack. Declared, not faked.
  issues.push("visual_quality_not_assessed");
  return { issues, reject: issues.includes("resolution_too_low") || issues.includes("dimensions_unreadable") && byteLength < MIN_IMAGE_BYTES };
}

// ── Pure: rough PDF page count (byte scan; exact count arrives with rendering) ─
export function pdfPageCount(bytes: Uint8Array): number {
  const text = new TextDecoder("latin1").decode(bytes);
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 1;
}

// ── Pure: §7.4 document classification (coarse, keyword-scored) ──────────────
export function classifyDocument(markdown: string | null, filename: string): DocType {
  const hay = `${filename}\n${(markdown ?? "").slice(0, 20000)}`.toLowerCase();
  const score = (terms: string[]) => terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
  const energy = score(["nathers", "energy rating", "star rating", "shgc", "u-value", "uw ", "heating load", "cooling load", "energy report", "energy assessment"]);
  const schedule = score(["window schedule", "door schedule", "schedule", "awning", "sliding", "fixed", "qty", "width", "height"]);
  const plans = score(["floor plan", "elevation", "site plan", "section", "scale 1:", "north point", "ground floor", "first floor"]);
  if (energy >= 2 && energy >= schedule && energy >= plans) return "energy_report";
  if (plans >= 2 && plans > schedule) return "plans";
  if (schedule >= 2) return "schedule";
  return "supporting";
}

/** Does this page carry at least three DISTINCT opening tags — W1, D3, W04a?
 *
 *  Bounded on purpose, because `hay` is text out of a customer's PDF and every
 *  other signal in classifyPageRoles is a constant-memory RegExp.test.
 *  `new Set(hay.match(/…/g))` is not: it builds an array holding one string per
 *  match before the Set dedupes, so a page decompressing to a megabyte of
 *  "w1 w1 w1 …" — comfortably inside the upload cap — retained 22 MB on a
 *  128 MB Worker. Measured, not supposed.
 *
 *  Two bounds, and they close different holes. Iterating lazily and stopping at
 *  the third distinct tag means nothing accumulates. Capping the matches EXAMINED means
 *  a flood of one repeated tag cannot spend the CPU either: the pattern can only
 *  produce a few thousand distinct strings, so not having found three within
 *  this many is a page saying something other than "I am a tagged floor plan",
 *  and a real one carries a few dozen tags in total. A page that trips the cap
 *  can still route on a corroborating signal — it loses this one test, not its
 *  chance to be a plan. */
const MAX_TAG_MATCHES_SCANNED = 500;
function hasDistinctOpeningTags(hay: string): boolean {
  const seen = new Set<string>();
  let scanned = 0;
  for (const m of hay.matchAll(/\b[wd]\s?\d{1,2}[a-z]?\b/g)) {
    seen.add(m[0]);
    if (seen.size >= 3) return true;
    if (++scanned >= MAX_TAG_MATCHES_SCANNED) return false;
  }
  return false;
}

/**
 * Classify PDF pages independently. Architectural sets routinely contain floor
 * plans, elevations and a window schedule in one file; a single file-level
 * label must not make the schedule page invisible to extraction.
 *
 * These are routing hints, not extracted business facts. A page may have more
 * than one role, and low-signal pages remain unassigned rather than guessed.
 */
export function classifyPageRoles(pages: string[], filename = ""): RolePages {
  const roles: RolePages = { schedule: [], energy_report: [], plans: [] };
  const add = (role: ExtractionRole, pageNo: number) => {
    if (!roles[role].includes(pageNo)) roles[role].push(pageNo);
  };
  pages.forEach((page, index) => {
    // A filename is useful for a one-page upload, but applying "window
    // schedule.pdf" to every page of a mixed set would route the whole set.
    const hay = `${pages.length === 1 ? filename : ""}\n${page}`.toLowerCase();
    const has = (pattern: RegExp) => pattern.test(hay);
    const scheduleSignals = [
      has(/\b(window|door|glazing|opening)\s+schedule\b/),
      has(/\b(mark|tag|ref(?:erence)?)\b[\s\S]{0,100}\b(width|height|size)\b/),
      has(/\bqty\b[\s\S]{0,100}\b(width|height)\b/),
      has(/\b(?:w|d|alw|ald)\s*[-_]?\d{1,3}[a-z]?\b[\s\S]{0,100}\b(?:awning|sliding|fixed|bifold|stacker)\b/),
    ].filter(Boolean).length;
    const energySignals = [
      has(/\bnathers\b/),
      has(/\benergy\s+(?:rating|assessment|report)\b/),
      has(/\b(?:u[\s-]?value|uw|shgc)\b/),
      has(/\b(?:heating|cooling)\s+load\b/),
      has(/\bstar\s+rating\b/),
    ].filter(Boolean).length;
    // PLAN SIGNALS ARE NOT EQUAL, and counting them as equal selected exactly
    // the wrong pages on every architectural set.
    //
    // Measured against a real 14-page set: all four drawing sheets — two floor
    // plans and two elevation sheets — scored ONE signal each, while the only
    // two pages scoring two were a 1:20 stair detail and an NCC compliance
    // sheet, both of which say "SECTION" and print an inline "SCALE 1:20". A
    // ">= 2" rule therefore rejected every sheet that mattered and selected the
    // two that did not, and the plan skill was handed a stair detail on every
    // architectural upload.
    //
    // The elevations lost their second signal to the title block. A CAD title
    // block emits its header LABELS as one run and their VALUES as another, so
    // the text layer reads "Sheet Date Scale ... 01/05/2025 1 : 100" and
    // /\bscale\s*1\s*:/ cannot match however many times the sheet prints 1:100.
    //
    // So: only a sheet that NAMES a drawing is a drawing sheet. A section mark,
    // a scale and a north point corroborate — a detail sheet carries two of
    // them — and may lift a plan-titled page, but never qualify one alone.
    // An elevation TITLE, never the word. "elevation" is one of the commonest
    // incidental words in a set — "see elevation for head height", "spot
    // elevation 42.15 AHD", "finished floor elevation RL 0.000", and on the
    // reference set's own stair detail, "refer to elevations for roof materials
    // and pitch". Treating the bare word as sufficient routes every one of them
    // as a drawing sheet.
    //
    // Two title forms, and both are needed: a designator (ELEVATION A, and the
    // singular plus a lone character is what keeps a cover sheet's drawing index
    // out — that reads "A5 - ELEVATIONS A6" and names no drawing), or a face
    // (NORTH / FRONT / REAR ELEVATION).
    const namesAnElevation = has(/\belevation\s+[a-z0-9](?![a-z0-9])/)
      || has(/\b(?:north|south|east|west|front|rear|side)\s+elevations?\b/);
    const namesAPlan = has(/\b(?:floor|site|roof|reflected ceiling)\s+plan\b/);
    const corroborating = has(/\bsection\b/) || has(/\bscale\s*1\s*:/)
      || has(/\bnorth\s+(?:point|arrow)\b/);
    // A cover sheet's drawing INDEX names every sheet in the set, so it matches
    // "floor plan" as readily as the floor plan does. On the reference set that
    // page is excluded only because it happens to carry no north point — and a
    // cover sheet commonly shows the site plan, which brings one. Naming three
    // different drawing types is what an index does and what a drawing does not.
    const namesManyDrawings = [
      namesAPlan,
      has(/\belevations?\b/),
      has(/\bsections?\b/),
      has(/\b(?:electrical|drainage|landscape|bracing)\b/),
    ].filter(Boolean).length >= 3;
    // A floor plan carrying opening tags is the one the plan skill actually
    // needs: it is where a W-number is joined to a room and a wall. Three tells
    // a tagged plan from a cover sheet that happens to print one.
    const pageNo = index + 1;
    if (scheduleSignals >= 2 || has(/\b(window|door|glazing|opening)\s+schedule\b/)) add("schedule", pageNo);
    if (energySignals >= 2) add("energy_report", pageNo);
    const isDrawingSheet = namesAnElevation || (namesAPlan && (corroborating || hasDistinctOpeningTags(hay)));
    if (isDrawingSheet && !namesManyDrawings) add("plans", pageNo);
  });
  return roles;
}

export function textForPages(pages: string[], pageNumbers: number[]): string | null {
  const selected = pageNumbers
    .filter((pageNo) => pageNo >= 1 && pageNo <= pages.length)
    .map((pageNo) => `<!-- page ${pageNo} -->\n${pages[pageNo - 1]}`)
    .join("\n\n");
  return selected.trim() ? selected : null;
}

// ── §7.1 derivative keys ─────────────────────────────────────────────────────
const safeSeg = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
/**
 * Delete every AI-derived object for a project: markdown derivatives, and the
 * crops cut from its drawings.
 *
 * A REGISTERED CUSTOMER'S DRAFT LIVES UNTIL THEY CLEAR IT — there is no expiry,
 * and `expired` is never written by anything — so clearing IS the retention event
 * for everything derived from that draft, exactly as issuing or voiding is for a
 * quote.
 *
 * Clearing used to delete each uploaded file's own R2 object and its markdown,
 * and nothing else, on the reasoning that "unreachable R2 objects are lifecycle
 * cleanup". There is no lifecycle rule. So a customer who asked for their draft
 * to be cleared had the source plan deleted while crops cut from that same
 * drawing stayed in R2 indefinitely — fragments of the document, outliving the
 * document.
 *
 * Prefix-swept rather than keyed off D1: an orphan is exactly the thing D1 no
 * longer knows about, and this is the one moment it can still be found by where
 * it lives.
 */
export async function deleteProjectDerived(
  env: Env,
  projectId: string,
  /** `all` for a cleared draft — its owner threw the whole thing away. `crops`
   *  for an ISSUED quote, whose source documents are deliberately kept
   *  (orders.ts:404) and whose markdown derivative is not an image: the owner's
   *  rule is that the IMAGES are not needed once a quote is issued. */
  scope: "all" | "crops" = "all",
): Promise<void> {
  // `crops` must NOT be runs/ — that is the stage replay archive (stage.ts:28),
  // which an issued quote keeps. The two prefixes are deliberately disjoint.
  const prefix = scope === "crops"
    ? `projects/${safeSeg(projectId)}/crops/`
    : `projects/${safeSeg(projectId)}/`;
  let cursor: string | undefined;
  let swept = 0;
  do {
    const page = await env.FILES.list({ prefix, cursor }).catch(() => null);
    if (!page) {
      // Best-effort is right — this must never fail an issue or a clear — but
      // stopping silently leaves customer drawing fragments behind with nobody
      // aware. The caller cannot act on it, so the log is the only place it can
      // surface, and a retention control that fails quietly is not one.
      console.warn(`retention: sweep of ${prefix} stopped after ${swept} objects; some remain`);
      return;
    }
    const keys = page.objects.map((o) => o.key);
    if (keys.length) {
      await env.FILES.delete(keys).catch(() => {
        console.warn(`retention: ${keys.length} objects under ${prefix} could not be deleted`);
      });
      swept += keys.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export const derivedKeys = (projectId: string, fileId: string) => ({
  markdown: `projects/${safeSeg(projectId)}/derived/${safeSeg(fileId)}/markdown.md`,
});

// ── toMarkdown (best-effort; §7.2) ───────────────────────────────────────────
// Returns the markdown AND why it is missing when it is. The reason used to be
// swallowed by a bare `catch { return null }`, so a PDF with a perfectly good
// text layer failed the run as "IMAGE_UNREADABLE" with no stage warning and
// nothing in ai_runs to say whether the binding was absent, the call threw, or
// the document genuinely had no text. Three very different faults, one silence.
type MarkdownResult = { markdown: string | null; reason: string | null };
type PdfTextResult = MarkdownResult & { pages: string[] };
const MARKDOWN_CONVERSION_DEADLINE_MS = 12_000;

// The PDF text layer, read with the SAME unpdf build the deterministic extractor
// uses. That extractor consumes the circulated architectural plan sets happily,
// so any PDF it can read must also be readable here: two tiers that disagree
// about whether a document is legible is not a tier, it is a coin toss.
//
// This is the primary path for text PDFs: it is fast, page-addressable and avoids
// paying for a second interpretation before the actual extraction skill runs.
// toMarkdown remains the bounded fallback for image-only/scanned PDFs.
async function pdfTextLayer(bytes: Uint8Array): Promise<PdfTextResult> {
  try {
    // Copy: pdf.js detaches the buffer it is handed, and the caller may still
    // need these bytes afterwards.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > MAX_PDF_PAGES) return { markdown: null, reason: "pdf_too_many_pages", pages: [] };
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [String(text)]).map((page) => String(page));
    // Page breaks kept: the schedule prompt and the parser both use them.
    const joined = pages.map((p, i) => `\n\n<!-- page ${i + 1} -->\n\n${p}`).join("");
    if (joined.replace(/\s+/g, "").length < 40) return { markdown: null, reason: "pdf_no_text_layer", pages };
    return { markdown: joined, reason: null, pages };
  } catch (e) {
    const s = String(e);
    const encrypted = /password|encrypt/i.test(s) || (e as { name?: string })?.name === "PasswordException";
    return { markdown: null, reason: encrypted ? "pdf_encrypted" : `pdf_read_failed:${s.slice(0, 120)}`, pages: [] };
  }
}

async function toMarkdownSafe(env: Env, filename: string, bytes: Uint8Array): Promise<MarkdownResult> {
  const ai: any = env.AI;
  if (!ai?.toMarkdown) return { markdown: null, reason: "markdown_binding_unavailable" };
  try {
    const res = await ai.toMarkdown([{ name: filename, blob: new Blob([bytes as unknown as BlobPart]) }]);
    const doc = Array.isArray(res) ? res[0] : res;
    const md = doc?.data ?? doc?.markdown ?? null;
    if (typeof md === "string" && md.trim()) return { markdown: md, reason: null };
    // A shape we did not expect is not the same as an empty document; say which.
    return {
      markdown: null,
      reason: md == null ? "markdown_empty" : `markdown_unexpected_shape:${typeof md}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return { markdown: null, reason: `markdown_call_failed:${msg.slice(0, 160)}` };
  }
}

async function toMarkdownBounded(env: Env, filename: string, bytes: Uint8Array): Promise<MarkdownResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      toMarkdownSafe(env, filename, bytes),
      new Promise<MarkdownResult>((resolve) => {
        timer = setTimeout(() => resolve({
          markdown: null,
          reason: "markdown_conversion_timed_out",
        }), MARKDOWN_CONVERSION_DEADLINE_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface IngestedDoc {
  fileId: string;
  filename: string;
  checksum: string | null;
  kind: DocKind;
  docType: DocType;
  /** A file may contribute to more than one extraction skill. */
  roles: ExtractionRole[];
  /** One-based page hints. Empty when the source is not page-addressable. */
  rolePages: RolePages;
  /** Page-scoped text for each role; avoids feeding an entire plan set to every skill. */
  roleText: Partial<Record<ExtractionRole, string>>;
  pageCount: number | null;
  markdown: string | null;
  /** data: URL for image uploads (Mode A photos) — the multimodal input. */
  imageDataUrl: string | null;
  qualityIssues: string[];
  rejected: boolean;
}

const MAX_IMAGE_BYTES = 6_000_000; // keep the data-URL within request budgets

interface FileRow { id: string; r2_key: string; filename: string; checksum: string | null; size: number | null; virus_status: string; doc_type: string | null; doc_type_source: string }

// Ingest every scan-clean project upload; archives the markdown derivative.
export async function ingestProjectFiles(env: Env, projectId: string): Promise<IngestedDoc[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, r2_key, filename, checksum, size, virus_status, doc_type, doc_type_source FROM file_asset
      WHERE project_id = ? AND kind IN ('upload','plan','schedule') AND virus_status = 'clean'
      ORDER BY created_at`,
  ).bind(projectId).all<FileRow>();

  const docs: IngestedDoc[] = [];
  for (const f of results ?? []) {
    const obj = await env.FILES.get(f.r2_key).catch(() => null);
    if (!obj) continue;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const kind = sniffDocKind(bytes);
    const doc: IngestedDoc = {
      fileId: f.id, filename: f.filename, checksum: f.checksum, kind,
      docType: "unsupported", roles: [], rolePages: { schedule: [], energy_report: [], plans: [] },
      roleText: {}, pageCount: null, markdown: null, imageDataUrl: null,
      qualityIssues: [], rejected: false,
    };
    if (kind === "other") { doc.qualityIssues = ["unsupported_format"]; doc.rejected = true; docs.push(doc); continue; }

    let pdfText: PdfTextResult | null = null;
    if (kind === "pdf") {
      doc.pageCount = pdfPageCount(bytes);
      // Always read the text layer once, even when toMarkdown succeeds. It gives
      // us stable page boundaries for mixed-document routing; toMarkdown remains
      // the richer whole-document representation.
      pdfText = await pdfTextLayer(bytes);
      if (pdfText.pages.length) doc.pageCount = pdfText.pages.length;
      doc.rolePages = classifyPageRoles(pdfText.pages, f.filename);
      for (const role of ["schedule", "energy_report", "plans"] as const) {
        const selected = textForPages(pdfText.pages, doc.rolePages[role]);
        if (selected) doc.roleText[role] = selected;
      }
    }
    else {
      const dims = imageDimensions(bytes, kind);
      const q = assessImageQuality(dims, bytes.length);
      doc.qualityIssues = q.issues;
      doc.rejected = q.reject;
      doc.pageCount = 1;
      if (!q.reject && bytes.length <= MAX_IMAGE_BYTES) {
        const mime = kind === "png" ? "image/png" : kind === "webp" ? "image/webp" : "image/jpeg";
        doc.imageDataUrl = `data:${mime};base64,${b64(bytes)}`;
      } else if (bytes.length > MAX_IMAGE_BYTES) {
        doc.qualityIssues.push("image_too_large_for_model");
      }
    }

    // A PDF text layer is already the page-addressable input the extraction
    // skills need. Sending the same vector PDF through Workers AI Markdown as
    // well doubled conversion work before extraction even began.
    //
    // Markdown conversion is reserved for scanned PDFs with no usable text
    // layer. Standalone images go directly to the multimodal schedule skill:
    // performing OCR first was a second paid interpretation of the same photo.
    let md: MarkdownResult;
    if (kind === "pdf" && pdfText?.markdown) {
      md = pdfText;
    } else if (kind === "pdf") {
      md = await toMarkdownBounded(env, f.filename, bytes);
      if (!md.markdown && pdfText?.reason) {
        doc.qualityIssues = [...doc.qualityIssues, pdfText.reason];
      }
    } else {
      md = { markdown: null, reason: null };
    }
    // Carry the conversion reason onto the doc: pipeline.ts folds qualityIssues
    // into the durable run summary.
    if (md.reason) doc.qualityIssues = [...doc.qualityIssues, md.reason];
    doc.markdown = md.markdown;
    if (kind === "pdf" && !doc.markdown && doc.qualityIssues.includes("pdf_no_text_layer")) {
      // Workers AI Markdown conversion does not rasterise PDF pages for vision.
      // Make the supported fallback explicit instead of presenting a scanned
      // schedule as a generic extraction failure.
      doc.qualityIssues.push("scanned_pdf_requires_image_upload");
    }
    if (doc.markdown) {
      await env.FILES.put(derivedKeys(projectId, f.id).markdown, doc.markdown).catch(() => { /* derivative archive is best-effort */ });
    }
    // A user's explicit type correction is AUTHORITATIVE (doc_type_source='user');
    // the classifier only decides for 'auto' rows, and writes its verdict back so
    // the customer file rail can show what the system detected.
    if (f.doc_type_source === "user" && f.doc_type) {
      doc.docType = f.doc_type as DocType;
    } else {
      doc.docType = classifyDocument(doc.markdown, f.filename);
      // A clear standalone image is an explicit schedule-photo workflow. Route
      // it as such without paying for a separate OCR/classification request.
      if (kind !== "pdf" && doc.imageDataUrl && doc.docType === "supporting") {
        doc.docType = "schedule";
      }
      await env.DB.prepare("UPDATE file_asset SET doc_type = ? WHERE id = ? AND doc_type_source = 'auto'")
        .bind(doc.docType, f.id).run().catch(() => { /* display metadata, never a blocker */ });
    }
    const roles = new Set<ExtractionRole>();
    if (doc.docType === "schedule" || doc.docType === "energy_report" || doc.docType === "plans") roles.add(doc.docType);
    for (const role of ["schedule", "energy_report", "plans"] as const) {
      if (doc.rolePages[role].length) roles.add(role);
    }
    // Every standalone image gets a schedule attempt even when OCR/classification
    // is weak: a customer photo of a schedule is a first-class conversion path.
    // For a PDF plan set, page routing must provide positive schedule evidence.
    if (doc.docType === "supporting" && kind !== "pdf") roles.add("schedule");
    doc.roles = [...roles];
    if (kind === "pdf" && doc.roles.includes("plans")) {
      // The current Worker has neither a Browser Rendering binding nor a
      // Worker-compatible canvas implementation. Do not pretend a text-layer
      // pass saw geometry; surface the limitation until a renderer is provisioned.
      doc.qualityIssues.push("pdf_visual_rendering_unavailable");
    }
    docs.push(doc);
  }
  return docs;
}

function b64(bytes: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}
