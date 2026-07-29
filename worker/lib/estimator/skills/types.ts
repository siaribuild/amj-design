// Narrow-skill framework for the AI extraction tier (LLM strategy §8.1, §14.2).
// One skill = one narrow task + a strict JSON schema + a versioned prompt + a
// RUNTIME VALIDATOR. Model output is untrusted (JSON mode does not guarantee
// schema conformance), so every field is validated and clamped by `validate`
// before it can become data — the same discipline as the delivered
// worker/lib/extract/ai.ts. Skills are inert until run through the gateway; the
// deterministic path never touches them.
//
// Skills do NOT choose their own model (single-model policy §13): the runner
// resolves the primary model from env, and the stage layer supplies an override
// only when real escalation is enabled.

export interface Skill<TInput, TOutput> {
  id: string;
  /** Versioned prompt identity (§21.3) — folded into the stage idempotency hash,
   *  so editing a prompt re-runs the stage instead of serving a stale hit. Bump
   *  on ANY change to buildPrompt or responseSchema. */
  promptVersion: string;
  /** JSON schema handed to the model (response_format). Advisory, not trusted. */
  responseSchema: Record<string, unknown>;
  buildPrompt(input: TInput): string;
  /** Optional multimodal content builder (§7.2: schedule photos go to the model
   *  as images). Returns message-content parts (text + image parts); when absent
   *  the runner sends buildPrompt's string. The gateway normalizes part shape for
   *  the provider. */
  buildContent?(input: TInput): unknown;
  /** Validate + clamp raw model JSON into trusted output, or null if unusable. */
  validate(raw: unknown): TOutput | null;
}

export interface SkillRun<TOutput> {
  ok: boolean;
  data: TOutput | null;
  warnings: string[];
  modelId: string;
  promptVersion: string;
  /** sha-256 of the raw model output (audit — §21.1), not the content itself. */
  outputHash: string | null;
  /** The raw model output, present ONLY when validation rejected it. The one
   *  case where the text is needed for diagnosis is the one case the accepted-
   *  output archive never held. Truncated by the writer, never logged. */
  rejectedRaw?: string;
  /** True when the §22.3 single repair pass produced the accepted output. */
  repaired: boolean;
  inputTokens: number;
  outputTokens: number;
  /** Machine-readable failure class for queue retry policy and diagnostics. */
  failureKind: SkillFailureKind | null;
}

export type SkillFailureKind =
  | "transient_rate_limit"
  | "transient_provider"
  | "permanent_request"
  | "provider_unavailable"
  | "invalid_output";

// Shared clamps for untrusted numeric/string fields.
export const numOrNull = (v: unknown, min: number, max: number): number | null => {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v >= min && v <= max ? Math.round(v * 100) / 100 : null;
};
export const strCap = (v: unknown, n: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null;
