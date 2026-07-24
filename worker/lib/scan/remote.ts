// Optional external AV scanner. Enable with SCAN_ENGINE='remote' (AV only) or
// 'both' (structural checks first, then AV). Requires SCAN_ENDPOINT; SCAN_AUTH is
// sent as a bearer token when set.
//
// The endpoint receives a multipart POST (field name `file`) and must answer with
// either JSON or plain text. Recognised shapes:
//   {"infected": true|false}            — preferred
//   {"status": "clean"|"infected"}
//   {"result": "OK"|"FOUND"}
//   plain text containing "FOUND" / "OK"  — clamav-rest style
// Anything else, a non-2xx, or a timeout is 'unknown', which fails closed.
import type { Env } from "../../types";
import type { FileScanner, ScanInput, ScanResult } from "./types";

const TIMEOUT_MS = 20_000;

export const remoteScanner: FileScanner = {
  id: "remote",
  async scan(input: ScanInput, env: unknown): Promise<ScanResult> {
    const e = env as Env;
    const endpoint = e.SCAN_ENDPOINT;
    if (!endpoint) {
      return { verdict: "unknown", engine: this.id, reason: "scanner_not_configured", detail: "SCAN_ENDPOINT is not set" };
    }

    const form = new FormData();
    form.append("file", new Blob([input.bytes as BlobPart], { type: input.contentType || "application/octet-stream" }), input.filename);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: form,
        headers: e.SCAN_AUTH ? { Authorization: `Bearer ${e.SCAN_AUTH}` } : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        return { verdict: "unknown", engine: this.id, reason: "scanner_error", detail: `Scanner returned ${res.status}` };
      }
      const body = (await res.text()).slice(0, 4096);
      const verdict = interpret(body);
      if (verdict === "infected") {
        return { verdict: "infected", engine: this.id, reason: "av_signature", detail: "Scanner reported a signature match" };
      }
      if (verdict === "clean") return { verdict: "clean", engine: this.id, reason: "av_clean" };
      return { verdict: "unknown", engine: this.id, reason: "scanner_unparsable", detail: "Scanner response not understood" };
    } catch {
      // Timeout, DNS, TLS — never surface the raw error to the uploader.
      return { verdict: "unknown", engine: this.id, reason: "scanner_unreachable", detail: "Scanner did not respond" };
    }
  },
};

function interpret(body: string): "clean" | "infected" | "unknown" {
  const trimmed = body.trim();
  try {
    const json = JSON.parse(trimmed);
    if (typeof json?.infected === "boolean") return json.infected ? "infected" : "clean";
    const status = String(json?.status ?? json?.result ?? "").toLowerCase();
    if (status === "infected" || status === "found") return "infected";
    if (status === "clean" || status === "ok") return "clean";
    return "unknown";
  } catch {
    // Plain-text (clamav-rest and friends).
    if (/\bFOUND\b/i.test(trimmed)) return "infected";
    if (/\bOK\b/i.test(trimmed)) return "clean";
    return "unknown";
  }
}
