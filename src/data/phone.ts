// AU phone handling — ONE implementation, imported by both the Worker and the
// browser bundle (registration Phase 1, spec §7.2). The Worker is the authority
// (AC-22); the client reuses these exact functions for advisory gating, so the
// two can never drift into disagreeing about what a valid number is.
//
// `normalizePhone` moved here verbatim from worker/lib/enquiry.ts, which now
// re-exports it — the enquiry route and its unit assertions keep working against
// the same function, not a second normaliser.

// Normalise an AU phone number to a bare local form for matching (display value is
// kept separately). "+61 4xx" / "61 4xx" → "04xx"; other input keeps its digits.
export function normalizePhone(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("61") && digits.length >= 10) return "0" + digits.slice(2);
  return digits;
}

// The accepted shapes, after normalisation (owner ruling Q2 — service numbers
// ARE valid contact phones for a trade customer):
//   0[23478]XXXXXXXX  landline + mobile, 10 digits
//   1300XXXXXX / 1800XXXXXX  service numbers, 10 digits
//   13XXXX            13 xx xx, 6 digits
const AU_PHONE_SHAPES = [/^0[23478]\d{8}$/, /^1[38]00\d{6}$/, /^13\d{4}$/];

export function isValidAuPhone(raw: unknown): boolean {
  const digits = normalizePhone(raw);
  if (!digits) return false;
  return AU_PHONE_SHAPES.some((shape) => shape.test(digits));
}
