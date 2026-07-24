// Document ingestion (LLM strategy §7). For each clean uploaded file: sniff the
// real type (magic bytes, never the filename alone), assess photo quality with
// the measurable subset (§7.3 — dimensions/size from headers; blur/skew need
// pixel decode and are honestly reported as not assessed on-stack, NOT hidden
// behind a fake confidence), convert to Markdown via Workers AI toMarkdown()
// (§7.2 — search/classification/table text, never the only plan-reading path),
// classify the document, and archive derivatives under the §7.1 R2 layout.
//
// The original object is NEVER modified (§7.1) — derivatives live beside it.
import type { Env } from "../../types";

export type DocKind = "pdf" | "png" | "jpeg" | "webp" | "other";
export type DocType = "schedule" | "energy_report" | "plans" | "supporting" | "unsupported";

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

// ── §7.1 derivative keys ─────────────────────────────────────────────────────
const safeSeg = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
export const derivedKeys = (projectId: string, fileId: string) => ({
  markdown: `projects/${safeSeg(projectId)}/derived/${safeSeg(fileId)}/markdown.md`,
});

// ── toMarkdown (best-effort; §7.2) ───────────────────────────────────────────
async function toMarkdownSafe(env: Env, filename: string, bytes: Uint8Array): Promise<string | null> {
  try {
    const ai: any = env.AI;
    if (!ai?.toMarkdown) return null;
    const res = await ai.toMarkdown([{ name: filename, blob: new Blob([bytes as unknown as BlobPart]) }]);
    const doc = Array.isArray(res) ? res[0] : res;
    const md = doc?.data ?? doc?.markdown ?? null;
    return typeof md === "string" && md.trim() ? md : null;
  } catch { return null; }
}

export interface IngestedDoc {
  fileId: string;
  filename: string;
  checksum: string | null;
  kind: DocKind;
  docType: DocType;
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
      WHERE project_id = ? AND kind IN ('upload','plan','schedule') AND virus_status IN ('clean','skipped')
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
      docType: "unsupported", pageCount: null, markdown: null, imageDataUrl: null,
      qualityIssues: [], rejected: false,
    };
    if (kind === "other") { doc.qualityIssues = ["unsupported_format"]; doc.rejected = true; docs.push(doc); continue; }

    if (kind === "pdf") doc.pageCount = pdfPageCount(bytes);
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

    doc.markdown = await toMarkdownSafe(env, f.filename, bytes);
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
      await env.DB.prepare("UPDATE file_asset SET doc_type = ? WHERE id = ? AND doc_type_source = 'auto'")
        .bind(doc.docType, f.id).run().catch(() => { /* display metadata, never a blocker */ });
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
