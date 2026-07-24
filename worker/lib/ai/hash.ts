// Tiny, dependency-free hashing for the AI tier (idempotency keys + output-hash
// audit). Deliberately NOT imported from lib/parse.ts — that module drags the
// whole schedule-parse pipeline (extractors, matcher, configurator) into any
// bundle that only needs a digest.
export async function sha256hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const enc = new TextEncoder();
export const sha256hexText = (s: string): Promise<string> => sha256hex(enc.encode(s));
