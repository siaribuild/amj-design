// Engine selection + escalation. Deterministic on-stack extraction is the DEFAULT
// (cost-efficient, no external dependency). When Workers AI is bound and either
// PARSE_ENGINE='ai' or the deterministic pass came back empty/low-confidence, the
// AI adapter is tried as an accuracy fallback. One place decides; the pipeline
// stays engine-agnostic.
import type { Env } from "../../types";
import type { ExtractInput, ExtractResult } from "./types";
import { deterministicExtractor } from "./deterministic";
import { aiExtractor } from "./ai";

const AI_MIN_CONFIDENCE = 0.5;

export async function extractSchedule(input: ExtractInput, env: Env): Promise<ExtractResult> {
  const forceAi = (env.PARSE_ENGINE ?? "").toLowerCase() === "ai";

  if (forceAi && env.AI) {
    try { return await aiExtractor.extract(input, env); }
    catch { /* fall through to deterministic */ }
  }

  const det = await deterministicExtractor.extract(input, env);

  // Escalate to AI when the cheap pass is unconvincing and AI is available.
  const weak = det.rows.length === 0 || det.overallConfidence < AI_MIN_CONFIDENCE;
  if (weak && env.AI && (env.PARSE_ENGINE ?? "auto").toLowerCase() !== "deterministic") {
    try {
      const ai = await aiExtractor.extract(input, env);
      if (ai.rows.length) return ai;
    } catch { /* keep deterministic result */ }
  }
  return det;
}

export type { ExtractResult, ExtractInput } from "./types";
