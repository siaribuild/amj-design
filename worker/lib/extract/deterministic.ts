// Deterministic, on-stack extractor (DEFAULT — no external calls, no model spend).
// Reads a digital PDF's text layer with unpdf (a Workers-compatible pdf.js build)
// and runs the pure header-driven schedule parser. Handles vector/text PDFs like
// the standard circulated architectural plans; scanned/image PDFs (no text layer)
// return no rows → the caller can escalate to the AI adapter when configured.
import { extractText, getDocumentProxy } from "unpdf";
import type { Env } from "../../types";
import { parseScheduleText } from "../../../src/data/scheduleParse";
import type { ExtractInput, ExtractResult, ScheduleExtractor } from "./types";

const MAX_PAGES = 30; // bound parser complexity before any processing

export const deterministicExtractor: ScheduleExtractor = {
  id: "cf-deterministic",
  async extract(input: ExtractInput, _env: Env): Promise<ExtractResult> {
    // Cheap structural validation BEFORE parsing — magic bytes, then page bound /
    // encryption via the loader. Never expose raw loader errors to the caller.
    const magic = new TextDecoder("latin1").decode(input.bytes.slice(0, 5));
    if (!magic.startsWith("%PDF-")) {
      return { engine: this.id, rows: [], pageCount: 0, overallConfidence: 0, warnings: ["not_a_pdf"] };
    }

    let pages: string[] = [];
    let pageCount = 0;
    try {
      // Copy: pdf.js detaches the buffer it is handed, and the AI tier may still
      // need input.bytes after this extractor has run (PARSE_ENGINE='auto').
      const pdf = await getDocumentProxy(new Uint8Array(input.bytes));
      pageCount = pdf.numPages;
      if (pageCount > MAX_PAGES) {
        return { engine: this.id, rows: [], pageCount, overallConfidence: 0, warnings: ["too_many_pages"] };
      }
      const { text } = await extractText(pdf, { mergePages: false });
      pages = Array.isArray(text) ? text : [String(text)];
    } catch (e) {
      const s = String(e);
      const encrypted = /password|encrypt/i.test(s) || (e as { name?: string })?.name === "PasswordException";
      return { engine: this.id, rows: [], pageCount, overallConfidence: 0, warnings: [encrypted ? "encrypted_pdf" : "pdf_read_failed"] };
    }

    const textLen = pages.join("").replace(/\s+/g, "").length;
    const parsed = parseScheduleText(pages);
    const warnings = [...parsed.warnings];
    // A digital PDF with almost no text is likely a scan → signal for escalation.
    if (textLen < 40) warnings.push("no_text_layer");

    const conf = parsed.rows.length ? Math.max(0.5, 1 - warnings.length * 0.15) : 0;
    return { engine: this.id, rows: parsed.rows, pageCount, overallConfidence: conf, warnings };
  },
};
