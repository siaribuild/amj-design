// energy_report_extractor (spec §6.2) — reads energy-report / NatHERS text into
// per-opening or per-type performance constraints. Output is UNTRUSTED and fully
// validated/clamped by `validate` (never a guessed default: unreadable ⇒ null).
import { type Skill, numOrNull, strCap } from "./types";

export interface EnergyConstraint {
  ref: string | null;            // opening ref or type this applies to
  maxUValue: number | null;
  minShgc: number | null;
  maxShgc: number | null;
  glazingNote: string | null;
}

const ROW_SCHEMA = {
  type: "object",
  properties: {
    constraints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: { type: ["string", "null"] },
          maxUValue: { type: ["number", "null"] },
          minShgc: { type: ["number", "null"] },
          maxShgc: { type: ["number", "null"] },
          glazingNote: { type: ["string", "null"] },
        },
        required: ["ref"],
      },
    },
  },
  required: ["constraints"],
} as const;

const MAX_ROWS = 300;

export const energyReportExtractor: Skill<{ text: string }, EnergyConstraint[]> = {
  id: "energy_report_extractor",
  model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  responseSchema: ROW_SCHEMA,
  buildPrompt: ({ text }) =>
    "Extract the per-opening or per-type ENERGY performance constraints from this " +
    "Australian energy/NatHERS report. For each, give the opening/type ref and any " +
    "maximum whole-window U-value (Uw), minimum and maximum SHGC. If a value is not " +
    "stated, use null — never guess. Return JSON only.\n\n" + text.slice(0, 12000),
  validate(raw) {
    const payload: any = typeof raw === "string" ? safeJson(raw) : raw;
    const rows = Array.isArray(payload?.constraints) ? payload.constraints.slice(0, MAX_ROWS) : null;
    if (!rows) return null;
    return rows.map((r: any): EnergyConstraint => ({
      ref: strCap(r?.ref, 40),
      // Whole-window Uw plausibly 0.5–10; SHGC 0–1.
      maxUValue: numOrNull(r?.maxUValue, 0.5, 10),
      minShgc: numOrNull(r?.minShgc, 0, 1),
      maxShgc: numOrNull(r?.maxShgc, 0, 1),
      glazingNote: strCap(r?.glazingNote, 200),
    })).filter((c) => c.ref || c.maxUValue != null || c.minShgc != null || c.maxShgc != null);
  },
};

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
