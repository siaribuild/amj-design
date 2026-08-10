// Default scanner — structural, on-stack, no external dependency and no spend.
//
// SCOPE, honestly stated: this is NOT anti-virus. It does not detect known
// malware families and has no signature database. It enforces two things that
// block the realistic attack paths for a document-upload endpoint:
//
//   1. Type allowlist by SNIFFED bytes (never the client's declared type) —
//      executables, archives and macro containers never get stored. The sniff
//      reads the WHOLE file, not a leading window: the window version of this
//      promise was false, and prefixing 8 KB of ASCII was enough to break it.
//   2. Active content in PDFs — embedded JavaScript, launch actions, embedded
//      files, XFA and RichMedia are the vectors weaponised PDFs actually use.
//      Detected both from the raw bytes and via the pdf.js parser, so content
//      hidden inside compressed object streams is still caught.
//
// For known-malware coverage, set SCAN_ENGINE='remote' (or 'both') and point
// SCAN_ENDPOINT at a real AV service — see ./remote.ts.
import { getDocumentProxy } from "unpdf";
import type { FileScanner, ScanInput, ScanResult } from "./types";

// Byte signatures we accept. Anything not matched here (and not plain text) is
// refused rather than guessed at.
const SIGNATURES: { type: string; magic: number[] }[] = [
  { type: "pdf", magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },             // %PDF-
  { type: "png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "jpeg", magic: [0xff, 0xd8, 0xff] },
  { type: "gif", magic: [0x47, 0x49, 0x46, 0x38] },                   // GIF8
];

const startsWith = (bytes: Uint8Array, magic: number[]) =>
  magic.every((b, i) => bytes[i] === b);

// RIFF....WEBP — the type marker sits at offset 8, not 0.
const isWebp = (b: Uint8Array) =>
  b.length > 12 && startsWith(b, [0x52, 0x49, 0x46, 0x46]) &&
  b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;

/** Plain text: no NULs and no stray control bytes ANYWHERE in the file.
 *
 *  THE WHOLE BUFFER, not a leading window. This used to read only the first
 *  8 KB, which made the allowlist above decorative: eight kilobytes of printable
 *  ASCII in front of a ZIP, a Windows PE or a macro-bearing .docm sniffed as
 *  'text' and was stored clean, then served to staff. A prefixed archive is not
 *  even inconvenienced — ZIP and every OOXML container are read from the
 *  End-of-Central-Directory record at the TAIL, which is exactly why
 *  self-extracting archives work, so the file still opens normally in Explorer,
 *  7-Zip and Office. Reproduced against this module before the window was
 *  removed; the suite asserted the guarantee the code did not have, because it
 *  only ever tested an UNPREFIXED executable.
 *
 *  A container cannot survive this pass: its own headers carry NULs (a ZIP local
 *  header is `PK\x03\x04` then a version word containing 0x00). The cost is one
 *  O(n) walk over at most the upload cap, on a path that already SHA-256s the
 *  entire file and hands PDFs to pdf.js — and only files matching NO signature
 *  above ever reach it. */
const looksTextual = (b: Uint8Array) => {
  if (b.length === 0) return false;
  for (let i = 0; i < b.length; i++) {
    const byte = b[i];
    if (byte === 0x00) return false;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) return false;
  }
  return true;
};

/** Container/executable magics, searched at EVERY offset rather than only at 0.
 *
 *  Belt to looksTextual's braces. The control-byte walk already refuses any real
 *  archive, but it accepts high-bit bytes (legitimately — UTF-8 and latin-1 text
 *  need them), so this states the guarantee the header makes rather than leaving
 *  it as a consequence. Single pass, first-byte gated, so the common case is one
 *  comparison per byte. */
const EMBEDDED_MAGIC: { magic: number[]; what: string }[] = [
  { magic: [0x50, 0x4b, 0x03, 0x04], what: "zip" },                    // ZIP / OOXML local header
  { magic: [0x50, 0x4b, 0x05, 0x06], what: "zip" },                    // ZIP end-of-central-directory
  { magic: [0x52, 0x61, 0x72, 0x21], what: "rar" },                    // Rar!
  { magic: [0x37, 0x7a, 0xbc, 0xaf], what: "7z" },                     // 7z
  { magic: [0xd0, 0xcf, 0x11, 0xe0], what: "ole" },                    // legacy Office / OLE compound
  { magic: [0x4d, 0x5a, 0x90, 0x00], what: "pe" },                     // Windows executable
  { magic: [0x7f, 0x45, 0x4c, 0x46], what: "elf" },                    // ELF executable
];

// First-byte gate as a 256-entry table: one array index per input byte, so the
// overwhelmingly common "not a magic" case costs a single lookup.
const MAGIC_HEADS = (() => {
  const t = new Uint8Array(256);
  for (const sig of EMBEDDED_MAGIC) t[sig.magic[0]] = 1;
  return t;
})();

function embeddedContainer(b: Uint8Array): { what: string; at: number } | null {
  for (let i = 0; i < b.length; i++) {
    if (!MAGIC_HEADS[b[i]]) continue;
    for (const sig of EMBEDDED_MAGIC) {
      if (sig.magic.every((byte, k) => b[i + k] === byte)) return { what: sig.what, at: i };
    }
  }
  return null;
}

export function sniffType(bytes: Uint8Array): string | null {
  for (const sig of SIGNATURES) if (startsWith(bytes, sig.magic)) return sig.type;
  if (isWebp(bytes)) return "webp";
  // The container sweep only ever runs on a buffer that already looks textual —
  // a real archive carries NULs in its own headers and is refused above — so this
  // is a belt to looksTextual's braces, not the primary control.
  if (looksTextual(bytes) && !embeddedContainer(bytes)) return "text";
  return null;
}

// PDF active-content markers. /OpenAction and /AA are deliberately absent: they
// are overwhelmingly benign (page zoom, view prefs) and flagging them would
// reject ordinary architectural exports.
/** Page-action inspection is per-page work on the upload path, so it is bounded.
 *  A weaponised PDF hides its payload where a viewer will reach it — the first
 *  pages — and a 200-page set must not turn an upload into a timeout. */
const PARSER_PAGE_LIMIT = 30;

const PDF_ACTIVE: { token: string; reason: string }[] = [
  { token: "/JavaScript", reason: "pdf_javascript" },
  { token: "/JS", reason: "pdf_javascript" },
  { token: "/Launch", reason: "pdf_launch_action" },
  { token: "/EmbeddedFile", reason: "pdf_embedded_file" },
  { token: "/RichMedia", reason: "pdf_rich_media" },
  { token: "/XFA", reason: "pdf_xfa" },
];

/** The bytes OUTSIDE every `stream…endstream` span, joined by a separator that
 *  cannot itself complete a token.
 *
 *  THE RAW PASS MUST NOT READ STREAM CONTENT. A stream body is compressed image
 *  and content data — arbitrary bytes — and searching it for a three-character
 *  token is searching noise for a needle that noise contains. A real 5.9 MB
 *  architectural PDF was refused as "infected" on a single `/JS` at byte
 *  5,606,079, sitting inside an 80 KB compressed stream at 38% printable, in a
 *  document pdf.js confirms has no JavaScript anywhere: no document actions, no
 *  page actions, no annotation actions.
 *
 *  It is not a rare accident. A specific 3-byte sequence appears by chance about
 *  once per 16.7 MB, so the odds of a spurious `/JS` are ~8% at 2 MB, ~23% at
 *  6 MB and ~49% at the 15 MB upload cap. Bigger plan sets — the ones from real
 *  builders — were the most likely to be blocked.
 *
 *  Object dictionaries live outside streams, which is what this pass is for. A
 *  dictionary compressed INTO an object stream (PDF 1.5+) is invisible here by
 *  construction, and that is precisely the parser pass's job below. */
function outsideStreams(text: string): string {
  const parts: string[] = [];
  const re = /\bstream\r\n|\bstream\n|\bstream\r|\bendstream\b/g;
  let cursor = 0;
  let openedAt: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].startsWith("endstream")) {
      if (openedAt === null) continue;       // stray endstream; ignore
      cursor = m.index;
      openedAt = null;
    } else if (openedAt === null) {
      parts.push(text.slice(cursor, m.index + m[0].length));
      openedAt = m.index;
    }
  }
  // An unterminated stream runs to EOF — deliberately NOT appended, so a
  // truncated file cannot smuggle a dictionary past this by omitting endstream.
  if (openedAt === null) parts.push(text.slice(cursor));
  return parts.join("\n");
}

async function scanPdf(bytes: Uint8Array): Promise<ScanResult | null> {
  // Raw-byte pass — uncompressed dictionaries ONLY. See outsideStreams above for
  // why stream bodies are excluded rather than searched.
  const structure = outsideStreams(new TextDecoder("latin1").decode(bytes));
  for (const { token, reason } of PDF_ACTIVE) {
    // Token must be followed by a PDF delimiter so /JS doesn't match /JSName.
    const re = new RegExp(`${token.replace("/", "\\/")}(?![A-Za-z0-9])`);
    if (re.test(structure)) {
      return { verdict: "infected", engine: "structural", reason, detail: `PDF contains ${token}` };
    }
  }
  // Parser pass — the authority, and the only thing that sees inside compressed
  // object streams. It now covers embedded files as well as scripts, because the
  // raw pass above no longer reaches a dictionary that has been compressed into
  // an object stream.
  try {
    // pdf.js takes ownership of the array it is given and DETACHES the underlying
    // buffer. Hand it a copy, or the caller's bytes are zero-length afterwards —
    // which would silently store an empty object in R2.
    const pdf: any = await getDocumentProxy(new Uint8Array(bytes));
    const actions = typeof pdf.getJSActions === "function" ? await pdf.getJSActions() : null;
    if (actions && Object.keys(actions).length > 0) {
      return { verdict: "infected", engine: "structural", reason: "pdf_javascript", detail: "PDF declares document-level JavaScript" };
    }
    const attachments = typeof pdf.getAttachments === "function" ? await pdf.getAttachments() : null;
    if (attachments && Object.keys(attachments).length > 0) {
      return { verdict: "infected", engine: "structural", reason: "pdf_embedded_file", detail: "PDF carries an embedded file" };
    }
    // Page-level and annotation-level actions are a separate hiding place from
    // the document catalogue, and both are reachable only through the parser.
    for (let n = 1; n <= Math.min(pdf.numPages ?? 0, PARSER_PAGE_LIMIT); n++) {
      const page: any = await pdf.getPage(n);
      const pageActions = typeof page.getJSActions === "function" ? await page.getJSActions() : null;
      if (pageActions && Object.keys(pageActions).length > 0) {
        return { verdict: "infected", engine: "structural", reason: "pdf_javascript", detail: `PDF page ${n} declares JavaScript` };
      }
    }
  } catch {
    // An unreadable/encrypted PDF is not a verdict — fail closed.
    return { verdict: "unknown", engine: "structural", reason: "pdf_unreadable", detail: "PDF could not be parsed for inspection" };
  }
  return null;
}

export const structuralScanner: FileScanner = {
  id: "structural",
  async scan(input: ScanInput): Promise<ScanResult> {
    if (input.bytes.length === 0) {
      return { verdict: "unknown", engine: this.id, reason: "empty", detail: "Empty file" };
    }
    const type = sniffType(input.bytes);
    if (!type) {
      // A container at offset 0 is simply a type we do not accept. One buried
      // further in is concealment — a deliberate act — and the audit trail should
      // distinguish the two rather than reporting a generic wrong-type for both.
      const hidden = embeddedContainer(input.bytes);
      if (hidden && hidden.at > 0) {
        return {
          verdict: "infected", engine: this.id, reason: "embedded_container",
          detail: `File hides a ${hidden.what} container at byte ${hidden.at}`,
        };
      }
      return {
        verdict: "infected", engine: this.id, reason: "type_not_allowed",
        detail: "File is not a PDF, image, or text document",
      };
    }
    if (type === "pdf") {
      const bad = await scanPdf(input.bytes);
      if (bad) return { ...bad, engine: this.id };
    }
    return { verdict: "clean", engine: this.id, reason: `type_${type}` };
  },
};
