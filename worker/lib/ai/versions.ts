// Version registry for the LLM building-modelling pipeline (LLM strategy §21.3,
// §23): every draft must be reproducible from pipeline + prompt + model + rule +
// catalogue versions, so those identifiers live in ONE place and are stamped on
// every ai_runs / ai_stage_runs row. Bump PIPELINE_VERSION whenever a change
// alters what a stage would produce for the same input.
import type { Env } from "../../types";

export const PIPELINE_VERSION = "2026-07-25.1";
export const BUILDING_MODEL_SCHEMA_VERSION = "building-model/1.0";

// §13.1/§13.2 model routing. SINGLE-MODEL POLICY (owner decision 2026-07-25):
// everything runs on the primary model; the escalation model is configured but
// SHADOW-ONLY — triggers are logged for frequency analysis, and the Pro call is
// made only when AI_ESCALATION_MODE='on' (an explicit, reversible opt-in once the
// shadow data shows escalation would be frequent/useful enough to pay for).
export const DEFAULT_PRIMARY_MODEL = "google/gemini-3.6-flash";
export const DEFAULT_ESCALATION_MODEL = "google/gemini-3.1-pro";

export const primaryModel = (env: Env): string =>
  (env.AI_PRIMARY_MODEL || "").trim() || DEFAULT_PRIMARY_MODEL;

export const escalationModel = (env: Env): string =>
  (env.AI_ESCALATION_MODEL || "").trim() || DEFAULT_ESCALATION_MODEL;

/** True only when the owner has explicitly turned real escalation on. */
export const escalationEnabled = (env: Env): boolean =>
  (env.AI_ESCALATION_MODE || "").trim().toLowerCase() === "on";

// §13.4 determinism settings for extraction calls: near-zero temperature, strict
// JSON schema, bounded output. Applied by the skill runner to every call.
export const EXTRACTION_TEMPERATURE = 0.1;
export const EXTRACTION_MAX_TOKENS = 8192;
