// Version registry for the LLM building-modelling pipeline (LLM strategy §21.3,
// §23): every draft must be reproducible from pipeline + prompt + model + rule +
// catalogue versions, so those identifiers live in ONE place and are stamped on
// every ai_runs / ai_stage_runs row. Bump PIPELINE_VERSION whenever a change
// alters what a stage would produce for the same input.
import type { Env } from "../../types";

// 2026-07-29.1: the provider request shape changed (Google-native), and the
// response schema now travels IN THE PROMPT because no schema parameter is
// accepted. That changes what every skill actually asks for, so the idempotency
// key must change with it — otherwise a stage cached under the old prompt would
// replay against the new contract.
// 2026-07-30.1: first-class photo ingestion, explicit scanned-PDF fallback,
// live progress milestones, provisional thermal catalogue readiness, and
// Cloudflare-authoritative provider-rate reporting.
// 2026-07-31.1: non-blocking thermal contract — coherence-guarded requirement
// resolution (no impossible min>max band), per-opening orientation-aware computed
// default band, and graded (non-veto) thermal ranking. Changes what selection
// produces for the same input, so the stage idempotency key must move with it.
// 2026-07-31.2: schedule extractor emits a structured `split` from the free-text
// comment (promptVersion v3) and the pipeline proposes a review-flagged composite
// split. Bump so the stage idempotency key moves with the new contract.
// 2026-08-02.1: energy-report component rows stay separate, report geometry and
// operation win over plan values, and reconciliation warnings reach review.
// 2026-08-20.1: the thermal band is COMPUTED rather than constant — composed
// from named, versioned rule contributions over a declared input contract, with
// its derivation recorded and the Uw cap read from the owner's dial. The
// envelope stage now produces a different output for the same input (a band that
// varies with orientation, a basis that can be plan_derived, and a derivation
// that did not exist before), so the stage idempotency key must move with it.
// No skill promptVersion changes: extraction is untouched.
// 2026-08-31.1: plan rooms persist independently of drawing-read confidence,
// and drawing-agent v8 batches set results and automatically tightens locator
// crops. The same documents can therefore produce different room/composition
// output and must not replay an older pipeline archive.
// 2026-08-31.2: adds the separately selectable full-document drawing agent.
// Its free PDF harvest, persistent set context, evidence-backed crop loop and
// room-correction precedence can produce different output for the same input;
// the legacy auto_drawings path remains available unchanged.
// 2026-09-03.1: full-document v19 adds page-role and identity recovery,
// mandatory per-opening close-up verification, drawing-only composition,
// bounded per-batch correction and stable provider diagnostics. The same plan
// can produce materially different readings, so older stage archives must not
// replay into this pipeline.
// 2026-09-04.1: provider-call budgeting scales mandatory close-up capacity with
// the opening count while preserving discovery turns for larger schedules.
// 2026-09-04.2: close-up verification has an independently hash-bound model /
// reasoning profile and runs in four failure-isolated concurrent batches.
export const PIPELINE_VERSION = "2026-09-04.2";
// 1.2: OpeningV1.wallOrientationSource and EnergyRequirementV1.derivation. Both
// additive — validateBuildingModelShape is unchanged and a 1.1 model still reads.
export const BUILDING_MODEL_SCHEMA_VERSION = "building-model/1.2";

// §13 model routing. Extraction uses the primary model; mandatory close-up
// verification may use its own model; escalation remains shadow-only unless
// AI_ESCALATION_MODE='on'.
export const DEFAULT_PRIMARY_MODEL = "google/gemini-3.6-flash";
export const DEFAULT_ESCALATION_MODEL = "google/gemini-3.1-pro";

export const primaryModel = (env: Env): string =>
  (env.AI_PRIMARY_MODEL || "").trim() || DEFAULT_PRIMARY_MODEL;

export const verificationModel = (env: Env): string =>
  (env.AI_VERIFY_MODEL || "").trim() || primaryModel(env);

export const verificationReasoningEffort = (env: Env): string =>
  (env.AI_VERIFY_REASONING_EFFORT || "").trim().toLowerCase() || thinkingLevel(env);

export const escalationModel = (env: Env): string =>
  (env.AI_ESCALATION_MODEL || "").trim() || DEFAULT_ESCALATION_MODEL;

/** True only when the owner has explicitly turned real escalation on. */
export const escalationEnabled = (env: Env): boolean =>
  (env.AI_ESCALATION_MODE || "").trim().toLowerCase() === "on";

/** Auto-extraction on upload (owner decision 2026-07-25): ON unless explicitly
 *  set to 'manual' (tests / emergency kill-switch) or the AI binding is absent.
 *  The gateway's spend cap + rate limit bound the worst case. */
export const autoExtractionEnabled = (env: Env): boolean =>
  !!env.AI && (env.AI_EXTRACTION_MODE || "auto").trim().toLowerCase() !== "manual";

// §13.4 determinism settings for extraction calls: near-zero temperature, strict
// JSON schema, bounded output. Applied by the skill runner to every call.
export const EXTRACTION_TEMPERATURE = 0.1;
// Thinking level for extraction skills. 'medium' is the model's own default and
// the QUALITY-first choice (owner decision 2026-07-30): reasoning about ambiguous
// schedule rows and product matches is the value of the AI tier, so it is not
// traded away for latency — instead the deadlines were raised to fit it (see
// AI_JOB_DEADLINE_MS / MODEL_CALL_DEADLINE_MS). 'low' is available for latency-
// sensitive tuning once quality at each level is measured, not before.
//
// Only 'low' and the 'medium'-equivalent baseline are PROVEN accepted by the
// binding (capability probe 2026-07-30); 'minimal'/'high' are documented enum
// siblings but unverified through Cloudflare — verify before defaulting to them.
export const DEFAULT_THINKING_LEVEL = "medium";
export const thinkingLevel = (env: Env): string =>
  (env.AI_THINKING_LEVEL || "").trim().toLowerCase() || DEFAULT_THINKING_LEVEL;
// Gemini 3.x spends THINKING tokens from this same budget, so the ceiling is
// not the text length: a plan-context reply stopped mid-object having reported
// only 1,165 output tokens against the old 8,192. Raised so a long schedule or a
// 14-page plan set cannot be cut off. It is a ceiling, not a target — typical
// replies are a fraction of it and are billed on what they actually use.
export const EXTRACTION_MAX_TOKENS = 32768;
