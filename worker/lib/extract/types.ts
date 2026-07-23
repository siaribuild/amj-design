// Extractor adapter contract. Every engine (deterministic on-stack, Workers AI,
// external vision) returns the SAME normalized rows, so the matcher and the parse
// job never depend on which engine ran. Selecting/adding engines is one place
// (./index.ts) — the rest of the pipeline is engine-agnostic.
import type { Env } from "../../types";
import type { RawScheduleRow } from "../../../src/data/scheduleParse";

export interface ExtractInput {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}

export interface ExtractResult {
  engine: string; // 'cf-deterministic' | 'cf-ai' | 'ext-ai'
  engineVersion?: string; // extractor + prompt/schema version, for cache/audit
  rows: RawScheduleRow[];
  pageCount: number;
  overallConfidence: number; // 0..1
  warnings: string[];
  // Cost accounting — AI tier only (deterministic leaves these undefined).
  inputTokens?: number;
  outputTokens?: number;
  costMicroUsd?: number; // integer µUSD, comparable across providers
}

export interface ScheduleExtractor {
  id: string;
  extract(input: ExtractInput, env: Env): Promise<ExtractResult>;
}
