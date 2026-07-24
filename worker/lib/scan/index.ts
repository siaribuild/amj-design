// Scanner selection + the single entry point the upload/rescan paths call.
//
// SCAN_ENGINE: 'structural' (default, on-stack) | 'remote' (external AV only) |
// 'both' (structural first — it is free and catches type/active-content issues —
// then AV for known-malware coverage).
//
// Every path fails CLOSED: an 'unknown' verdict is never treated as clean.
import type { Env } from "../../types";
import type { ScanInput, ScanResult } from "./types";
import { structuralScanner } from "./structural";
import { remoteScanner } from "./remote";

export type { ScanInput, ScanResult, ScanVerdict } from "./types";
export { sniffType } from "./structural";

export async function scanFile(env: Env, input: ScanInput): Promise<ScanResult> {
  const engine = (env.SCAN_ENGINE || "structural").toLowerCase();

  if (engine === "remote") return remoteScanner.scan(input, env);

  const structural = await structuralScanner.scan(input, env);
  if (engine !== "both") return structural;
  // 'both': a structural rejection is final; otherwise AV has to agree too.
  if (structural.verdict !== "clean") return structural;
  return remoteScanner.scan(input, env);
}

/** Maps a verdict onto the file_asset.virus_status CHECK constraint. */
export const statusForVerdict = (v: ScanResult["verdict"]): "clean" | "infected" | "pending" =>
  v === "clean" ? "clean" : v === "infected" ? "infected" : "pending";
