// Narrow-skill framework for the AI extraction tier (spec §9). One skill = one
// strict JSON schema + a prompt + a RUNTIME VALIDATOR. Model output is untrusted
// (JSON mode does not guarantee schema conformance), so every field is validated
// and clamped by `validate` before it can become data — the same discipline as
// the delivered worker/lib/extract/ai.ts. Skills are inert until run through the
// gateway; the deterministic path never touches them.

export interface Skill<TInput, TOutput> {
  id: string;
  model: string;
  /** JSON schema handed to the model (response_format). Advisory, not trusted. */
  responseSchema: Record<string, unknown>;
  buildPrompt(input: TInput): string;
  /** Validate + clamp raw model JSON into trusted output, or null if unusable. */
  validate(raw: unknown): TOutput | null;
}

export interface SkillRun<TOutput> {
  ok: boolean;
  data: TOutput | null;
  warnings: string[];
  modelId: string;
  /** sha-256 of the raw model output (audit — spec §14), not the content itself. */
  outputHash: string | null;
  inputTokens: number;
  outputTokens: number;
}

// Shared clamps for untrusted numeric/string fields.
export const numOrNull = (v: unknown, min: number, max: number): number | null => {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v >= min && v <= max ? Math.round(v * 100) / 100 : null;
};
export const strCap = (v: unknown, n: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null;
