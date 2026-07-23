// Workers AI extractor (ACCURACY seam — off by default; enabled per config once
// Workers AI is provisioned). Two on-stack strategies, cheapest first:
//   1. env.AI.toMarkdown(): structure-aware text for tricky/tagged PDFs, then the
//      SAME deterministic parser (no LLM spend).
//   2. If that yields nothing, an instruction LLM structures the text into rows
//      via a strict JSON schema (never invents values; unreadable → null).
//
// Selected only when PARSE_ENGINE='ai' (or by escalation) AND env.AI is bound, so
// the default deterministic path never depends on this file. An external vision
// model (e.g. Claude) would implement the SAME ScheduleExtractor interface and be
// reached through AI Gateway; this file is where that provider swap lives.
import type { Env } from "../../types";
import { parseScheduleText } from "../../../src/data/scheduleParse";
import type { RawScheduleRow, ScheduleSection } from "../../../src/data/scheduleParse";
import type { ExtractInput, ExtractResult, ScheduleExtractor } from "./types";

const EXTRACT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const ROW_SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section: { type: "string", enum: ["window", "door"] },
          itemNo: { type: "string" },
          heightMm: { type: ["number", "null"] },
          widthMm: { type: ["number", "null"] },
          headHtMm: { type: ["number", "null"] },
          glazing: { type: ["string", "null"] },
          doubleGlaze: { type: ["boolean", "null"] },
          material: { type: ["string", "null"] },
          typeText: { type: ["string", "null"] },
          comments: { type: ["string", "null"] },
        },
        required: ["section", "itemNo"],
      },
    },
  },
  required: ["rows"],
} as const;

// Bump when the prompt/schema/model changes — part of the cache key and audit.
const EXTRACT_VERSION = "cf-ai/llama-3.3-70b/v1";
const MAX_ROWS = 500;          // hard cap on model output size
const MIN_MM = 50, MAX_MM = 20000; // plausible opening dimensions

export const aiExtractor: ScheduleExtractor = {
  id: "cf-ai",
  async extract(input: ExtractInput, env: Env): Promise<ExtractResult> {
    if (!env.AI) throw new Error("ai_unavailable");
    const warnings: string[] = [];
    let inputTokens = 0, outputTokens = 0;

    // Strategy 1 — toMarkdown, then the deterministic parser (no LLM).
    let md = "";
    try {
      const blob = new Blob([input.bytes], { type: input.contentType || "application/pdf" });
      const res: any = await (env.AI as any).toMarkdown([{ name: input.filename, blob }]);
      const doc = Array.isArray(res) ? res[0] : res;
      md = doc?.data ?? doc?.markdown ?? "";
      inputTokens += Number(doc?.tokens ?? 0);
    } catch {
      warnings.push("tomarkdown_failed"); // never surface raw provider errors
    }
    if (md) {
      const parsed = parseScheduleText([md]);
      if (parsed.rows.length) {
        return { engine: this.id, engineVersion: EXTRACT_VERSION, rows: parsed.rows, pageCount: 0, overallConfidence: 0.85, warnings, inputTokens };
      }
    }

    // Strategy 2 — LLM structuring (guarded; never throws past here). The model's
    // output is UNTRUSTED: JSON Mode does not guarantee schema conformance, so every
    // field is validated/clamped at runtime (size cap, numeric range, string length,
    // enum) before it can become a line.
    try {
      const prompt =
        "Extract the WINDOW and EXTERNAL DOOR schedule tables from the text below into JSON. " +
        "Use the exact column values; if a cell is unreadable use null — never guess. " +
        "heightMm/widthMm are integers in millimetres. section is 'window' or 'door'.\n\n" +
        (md || new TextDecoder().decode(input.bytes).slice(0, 12000));
      const out: any = await (env.AI as any).run(EXTRACT_MODEL, {
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_schema", json_schema: ROW_SCHEMA },
      });
      inputTokens += Number(out?.usage?.prompt_tokens ?? 0);
      outputTokens += Number(out?.usage?.completion_tokens ?? 0);
      const payload = typeof out?.response === "string" ? JSON.parse(out.response) : out?.response ?? out;
      const rawRows = Array.isArray(payload?.rows) ? payload.rows.slice(0, MAX_ROWS) : [];
      if (Array.isArray(payload?.rows) && payload.rows.length > MAX_ROWS) warnings.push("row_cap_hit");
      const rows: RawScheduleRow[] = rawRows.map((r: any) => ({
        section: (r?.section === "door" ? "door" : "window") as ScheduleSection,
        itemNo: strCap(r?.itemNo, 12) ?? "",
        heightMm: mmOrNull(r?.heightMm), widthMm: mmOrNull(r?.widthMm), headHtMm: mmOrNull(r?.headHtMm),
        glazing: strCap(r?.glazing, 40), doubleGlaze: typeof r?.doubleGlaze === "boolean" ? r.doubleGlaze : null,
        material: strCap(r?.material, 40), typeText: strCap(r?.typeText, 60), comments: strCap(r?.comments, 300),
        raw: JSON.stringify(r).slice(0, 2000),
      }));
      return { engine: this.id, engineVersion: EXTRACT_VERSION, rows, pageCount: 0, overallConfidence: rows.length ? 0.75 : 0, warnings, inputTokens, outputTokens };
    } catch {
      warnings.push("ai_extract_failed");
      return { engine: this.id, engineVersion: EXTRACT_VERSION, rows: [], pageCount: 0, overallConfidence: 0, warnings, inputTokens, outputTokens };
    }
  },
};

// A dimension only survives if it's a finite integer in a plausible mm range —
// otherwise null (a flagged gap the human resolves), never a fabricated number.
const mmOrNull = (v: unknown): number | null => {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= MIN_MM && n <= MAX_MM ? n : null;
};
const strCap = (v: unknown, n: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
