// The ONE home of ABN validity (registration Phase 2, design §7.4).
//
// This lives in src/data/ rather than worker/lib/ for the same reason
// src/data/phone.ts does: the browser gates the field before a round trip and
// the Worker re-runs the same check server-side, and the only way those two can
// never drift is for them to be the same function. `worker/lib/referrals.ts`
// re-exports `abnValid` from here — its callers (payoutComplete, payoutMissing,
// the referral suites) are unchanged.
//
// Nothing here calls the ABN Lookup register. This module answers "is this a
// well-formed ABN" — a format question, answerable offline, in a browser, with
// no credential. Whether the number is real and active is `worker/lib/abr.ts`'s
// question and it is a different one.

/** The ATO's published ABN checksum weights: weighted digits, one subtracted
 *  from the first, sum divisible by 89. */
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

/** Digits only. Humans write an ABN with spaces and every form in this system
 *  should let them, so normalising here means no caller has to remember to.
 *
 *  Whitespace ONLY is stripped — not letters, not punctuation. A value with a
 *  stray character stays malformed and fails `abnValid`, rather than being
 *  quietly rescued into a different number than the person typed. */
export function normalizeAbn(abn: string | null | undefined): string {
  return String(abn ?? "").replace(/\s/g, "");
}

/** Is this an ABN?
 *
 *  The checksum, and nothing else: it catches a transposed digit — the realistic
 *  error — without putting a network round trip in front of someone filling in a
 *  form. `\d` is ASCII-only in this regex, so full-width and other Unicode digit
 *  lookalikes are simply not digits (AB-P2-13). */
export function abnValid(abn: string | null | undefined): boolean {
  const digits = normalizeAbn(abn);
  if (!/^[0-9]{11}$/.test(digits)) return false;
  const sum = ABN_WEIGHTS.reduce((total, weight, index) => {
    const digit = Number(digits[index]) - (index === 0 ? 1 : 0);
    return total + digit * weight;
  }, 0);
  return sum % 89 === 0;
}

/** Display form: 2-3-3-3, the way the register prints it.
 *
 *  Anything that is not 11 digits comes back as given — a formatter must never
 *  be the thing that decides a stored value is wrong. */
export function formatAbn(abn: string | null | undefined): string {
  const digits = normalizeAbn(abn);
  if (!/^[0-9]{11}$/.test(digits)) return String(abn ?? "");
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
}
