// File scanning seam. Uploads are scanned BEFORE their bytes are persisted, so a
// file that never returns a `clean` verdict never becomes downloadable and never
// reaches the parser.
//
// Verdicts:
//   clean    — safe to persist and serve.
//   infected — actively dangerous; bytes are discarded, never stored.
//   unknown  — the scanner could not reach a verdict (unavailable, timeout, or a
//              format it does not understand). Fail CLOSED: the upload is
//              rejected rather than stored in a state that looks scanned.
export type ScanVerdict = "clean" | "infected" | "unknown";

export interface ScanInput {
  bytes: Uint8Array;
  filename: string;
  /** Client-declared content type — untrusted; scanners re-derive from bytes. */
  contentType: string;
}

export interface ScanResult {
  verdict: ScanVerdict;
  /** Scanner id, recorded on the file row for audit ('structural', 'remote', …). */
  engine: string;
  /** Machine-readable reason, e.g. 'pdf_javascript'. Never raw provider output. */
  reason?: string;
  /** Short human-facing detail. Safe to log; never echoed to the uploader raw. */
  detail?: string;
}

export interface FileScanner {
  id: string;
  scan(input: ScanInput, env: unknown): Promise<ScanResult>;
}
