// Scanner selection + the single entry point the upload/rescan paths call.
//
// SCAN_ENGINE: 'structural' (default, on-stack) | 'remote' | 'both'.
//
// 'remote' and 'both' are now the SAME path, deliberately: structural first — it
// is free, and it is the only thing enforcing the type allowlist — then AV for
// known-malware coverage. 'remote' is kept as an accepted spelling because it
// reads like the obvious value for "use the AV service", and the one thing it
// must not mean is "skip the allowlist". Both names are retained rather than
// rejecting one, so an existing deployment cannot break on a rename.
//
// Every path fails CLOSED: an 'unknown' verdict is never treated as clean, and an
// unrecognised SCAN_ENGINE is itself an 'unknown' rather than a silent default.
import type { Env } from "../../types";
import type { ScanInput, ScanResult } from "./types";
import { structuralScanner } from "./structural";
import { remoteScanner } from "./remote";

export type { ScanInput, ScanResult, ScanVerdict } from "./types";
export { sniffType } from "./structural";

const ENGINES = ["structural", "remote", "both"] as const;

export async function scanFile(env: Env, input: ScanInput): Promise<ScanResult> {
  const engine = (env.SCAN_ENGINE || "structural").toLowerCase();

  // An unrecognised value is a MISCONFIGURATION, not a hint. This used to fall
  // through to structural-only and say nothing, so a typo ('clamav', 'av') read
  // as a working AV deployment. In a module whose contract is "every path fails
  // CLOSED", the selector itself has to fail closed too.
  if (!(ENGINES as readonly string[]).includes(engine)) {
    return {
      verdict: "unknown", engine: "none", reason: "scanner_misconfigured",
      detail: `SCAN_ENGINE '${engine}' is not one of ${ENGINES.join(", ")}`,
    };
  }

  // The structural type allowlist runs under 'remote' too. It used to be skipped
  // entirely, so an operator acting on "deploy a vetted AV service" by setting
  // 'remote' rather than 'both' newly permitted .exe, ZIP and macro containers to
  // be stored on an AV verdict alone — tightening the configuration would have
  // LOOSENED the control. AV coverage is additive here, never a substitute.
  const structural = await structuralScanner.scan(input, env);
  if (engine === "structural") return structural;
  // A structural rejection is final; otherwise AV has to agree too.
  if (structural.verdict !== "clean") return structural;
  return remoteScanner.scan(input, env);
}

/** Maps a verdict onto the file_asset.virus_status CHECK constraint. */
export const statusForVerdict = (v: ScanResult["verdict"]): "clean" | "infected" | "pending" =>
  v === "clean" ? "clean" : v === "infected" ? "infected" : "pending";
