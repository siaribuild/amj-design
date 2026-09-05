import { StageCallError } from "../../ai/stage";

/** What one stage call cost, as the stage layer reports it. */
export interface StageUsage {
  modelCalls: number;
  cached: boolean;
  inputTokens: number;
  outputTokens: number;
  warnings: string[];
}

/** How a call reports what it cost. */
export type UsageReport = (spent: StageUsage) => void | Promise<void>;

/** What a run spent, as its stage calls reported it. */
export interface RunSpend {
  modelCalls: number;
  cachedTurns: number;
  inputTokens: number;
  outputTokens: number;
  warnings: string[];
  failureKind: string | null;
}

/** One counter for everything a document's run spends, wherever it is spent:
 * the caller's Phase A looks and this engine's phases report to the same one,
 * so the report is not two totals added by hand. A dep that reports nothing
 * is one call, which is what it was before anyone counted. */
export function spendCounter() {
  const spent: RunSpend = { modelCalls: 0, cachedTurns: 0, inputTokens: 0, outputTokens: 0, warnings: [], failureKind: null };
  const counted = <T>(call: (usage: UsageReport) => Promise<T>): Promise<T> => {
    let reported = false;
    const usage = (u: StageUsage) => {
      reported = true;
      spent.modelCalls += u.modelCalls;
      if (u.cached) spent.cachedTurns += 1;
      spent.inputTokens += u.inputTokens;
      spent.outputTokens += u.outputTokens;
      for (const warning of u.warnings) if (warning !== "stage_replayed" && !spent.warnings.includes(warning)) spent.warnings.push(warning);
    };
    return call(usage)
      // A provider failure keeps its kind: an outage and a bad read are
      // different problems, and the report is where operations tells them apart.
      .catch((error: unknown) => {
        if (error instanceof StageCallError) {
          spent.failureKind = error.failureKind;
          for (const warning of error.warnings) if (!spent.warnings.includes(warning)) spent.warnings.push(warning);
        }
        throw error;
      })
      .finally(() => { if (!reported) spent.modelCalls += 1; });
  };
  return { spent, counted };
}
