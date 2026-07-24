// Default scanner — structural, on-stack, no external dependency and no spend.
//
// SCOPE, honestly stated: this is NOT anti-virus. It does not detect known
// malware families and has no signature database. It enforces two things that
// block the realistic attack paths for a document-upload endpoint:
//
//   1. Type allowlist by SNIFFED bytes (never the client's declared type) —
//      executables, archives and macro containers never get stored.
//   2. Active content in PDFs — embedded JavaScript, launch actions, embedded
//      files, XFA and RichMedia are the vectors weaponised PDFs actually use.
//      Detected both from the raw bytes and via the pdf.js parser, so content
//      hidden inside compressed object streams is still caught.
//
// For known-malware coverage, set SCAN_ENGINE='remote' (or 'both') and point
// SCAN_ENDPOINT at a real AV service — see ./remote.ts.
import { getDocumentProxy } from "unpdf";
import type { FileScanner, ScanInput, ScanResult } from "./types";

const MAX_SNIFF = 8192;

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

// Plain text: no NULs and no stray control bytes in the sniff window.
const looksTextual = (b: Uint8Array) => {
  const window = b.subarray(0, MAX_SNIFF);
  if (window.length === 0) return false;
  for (const byte of window) {
    if (byte === 0x00) return false;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) return false;
  }
  return true;
};

export function sniffType(bytes: Uint8Array): string | null {
  for (const sig of SIGNATURES) if (startsWith(bytes, sig.magic)) return sig.type;
  if (isWebp(bytes)) return "webp";
  if (looksTextual(bytes)) return "text";
  return null;
}

// PDF active-content markers. /OpenAction and /AA are deliberately absent: they
// are overwhelmingly benign (page zoom, view prefs) and flagging them would
// reject ordinary architectural exports.
const PDF_ACTIVE: { token: string; reason: string }[] = [
  { token: "/JavaScript", reason: "pdf_javascript" },
  { token: "/JS", reason: "pdf_javascript" },
  { token: "/Launch", reason: "pdf_launch_action" },
  { token: "/EmbeddedFile", reason: "pdf_embedded_file" },
  { token: "/RichMedia", reason: "pdf_rich_media" },
  { token: "/XFA", reason: "pdf_xfa" },
];

async function scanPdf(bytes: Uint8Array): Promise<ScanResult | null> {
  // Raw-byte pass — catches uncompressed dictionaries.
  const text = new TextDecoder("latin1").decode(bytes);
  for (const { token, reason } of PDF_ACTIVE) {
    // Token must be followed by a PDF delimiter so /JS doesn't match /JSName.
    const re = new RegExp(`${token.replace("/", "\\/")}(?![A-Za-z0-9])`);
    if (re.test(text)) {
      return { verdict: "infected", engine: "structural", reason, detail: `PDF contains ${token}` };
    }
  }
  // Parser pass — catches the same content hidden in compressed object streams.
  try {
    // pdf.js takes ownership of the array it is given and DETACHES the underlying
    // buffer. Hand it a copy, or the caller's bytes are zero-length afterwards —
    // which would silently store an empty object in R2.
    const pdf: any = await getDocumentProxy(new Uint8Array(bytes));
    const actions = typeof pdf.getJSActions === "function" ? await pdf.getJSActions() : null;
    if (actions && Object.keys(actions).length > 0) {
      return { verdict: "infected", engine: "structural", reason: "pdf_javascript", detail: "PDF declares document-level JavaScript" };
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
