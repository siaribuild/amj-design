// Phase 6 — the learning loop (spec §12). Reviewer corrections are the training
// substrate, but ONLY 'preference_correction' rows on the 'product' field may ever
// train the ranker (every other category routes to extraction / catalogue-data /
// rule layers instead). This module reads those rows, aggregates a per-(context,
// product) acceptance signal, and exposes a bounded 0..1 score the ranker consumes
// through its CAPPED 0.10 'historical' weight — so learned preference can only
// nudge, never override, a hard fact.
//
// Deterministic + inspectable: the same corpus always yields the same model, and
// every candidate's historical component is persisted in score_components_json.
// It improves with every issued quote, because every reviewer correction adds a
// row that shifts the next estimate.
import type { Env } from "../../types";
import type { CatalogueCandidate, OpeningInput } from "./types";

export const LEARNING_VERSION = "v1";

// A coarse context key so sparse early data still generalises: family + operation
// (e.g. "windows|awning"). Finer buckets (size/energy) would fragment the corpus
// before it has signal; the ranker's other components already carry geometry.
export function contextKey(family: string | null | undefined, operation: string | null | undefined): string {
  return `${(family || "any").toLowerCase()}|${(operation || "any").toLowerCase()}`;
}

interface Counts { accepts: number; rejects: number }
const empty = (): Counts => ({ accepts: 0, rejects: 0 });

// Laplace-smoothed acceptance in 0..1; no evidence ⇒ 0.5 (neutral midpoint) so an
// un-seen product sits between reviewer-preferred (>0.5) and reviewer-rejected
// (<0.5) products, never advantaged or penalised by absence of data.
function smoothed(c: Counts): number {
  return (c.accepts + 1) / (c.accepts + c.rejects + 2);
}

// A product id may be stored as a bare string or wrapped in the value payload the
// UI sends ({ productId } / { candidateId } / …). Accept any of those shapes.
function productIdOf(json: string | null | undefined): string | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    if (typeof v === "string") return v || null;
    if (v && typeof v === "object") return v.productId ?? v.sanityProductId ?? v.candidateId ?? v.id ?? null;
  } catch { /* ignore malformed payloads */ }
  return null;
}

export interface HistoricalRow {
  opening_family: string | null;
  opening_operation: string | null;
  initial_value_json: string | null; // system proposal (overridden ⇒ a reject signal)
  final_value_json: string | null;   // reviewer's choice (⇒ an accept signal)
}

export interface HistoricalModel {
  version: string;
  /** How many accept signals informed this model (0 ⇒ fully neutral). */
  observations: number;
  /** Learned acceptance for a candidate in an opening's context, 0..1. */
  scoreFor(candidate: CatalogueCandidate, opening: OpeningInput): number;
}

// Pure aggregation — no I/O, so it is deterministically unit-testable. Blends a
// context-specific rate with a product-global rate (hierarchical back-off): with
// little context evidence the global rate dominates; as context evidence grows it
// takes over. K is the context-evidence count at which the two weigh equally.
export function aggregateHistorical(rows: HistoricalRow[], K = 4): HistoricalModel {
  const ctx = new Map<string, Counts>();     // "family|op::product" → counts
  const global = new Map<string, Counts>();  // "product" → counts
  let observations = 0;

  const bump = (map: Map<string, Counts>, key: string, which: "accepts" | "rejects") => {
    const c = map.get(key) ?? empty();
    c[which] += 1;
    map.set(key, c);
  };

  for (const r of rows ?? []) {
    const k = contextKey(r.opening_family, r.opening_operation);
    const chosen = productIdOf(r.final_value_json);     // reviewer preferred this
    const rejected = productIdOf(r.initial_value_json); // system proposed this, reviewer overrode
    if (chosen) {
      observations++;
      bump(ctx, `${k}::${chosen}`, "accepts");
      bump(global, chosen, "accepts");
    }
    if (rejected && rejected !== chosen) {
      bump(ctx, `${k}::${rejected}`, "rejects");
      bump(global, rejected, "rejects");
    }
  }

  return {
    version: LEARNING_VERSION,
    observations,
    scoreFor(candidate, opening) {
      const pid = candidate.sanityProductId;
      const k = contextKey(opening.family, opening.operationType);
      const cCtx = ctx.get(`${k}::${pid}`) ?? empty();
      const cGlobal = global.get(pid) ?? empty();
      const nCtx = cCtx.accepts + cCtx.rejects;
      if (nCtx + cGlobal.accepts + cGlobal.rejects === 0) return 0.5; // no evidence ⇒ neutral
      const wCtx = nCtx / (nCtx + K);
      return wCtx * smoothed(cCtx) + (1 - wCtx) * smoothed(cGlobal);
    },
  };
}

// Load the learned model from D1. Reads ONLY the feedback that may train the
// ranker (preference_correction on 'product'); joins the opening for its context.
export async function buildHistoricalModel(env: Env): Promise<HistoricalModel> {
  const { results } = await env.DB.prepare(
    `SELECT o.family AS opening_family, o.operation_type AS opening_operation,
            f.initial_value_json, f.final_value_json
       FROM review_feedback f
       LEFT JOIN opening_instance o ON o.id = f.opening_id
      WHERE f.category = 'preference_correction' AND f.field = 'product'`,
  ).all<HistoricalRow>();
  return aggregateHistorical(results ?? []);
}
