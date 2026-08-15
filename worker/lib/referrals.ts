// Referral program — everything except the "is a discount live right now?"
// question, which is its own leaf module (referral-discount.ts) so pricing can
// ask it without closing an import cycle.
//
// Routes stay thin: the rules live here.

/** The ATO's published ABN checksum: weighted digits, one subtracted from the
 *  first, sum divisible by 89. */
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

/** Is this an ABN?
 *
 *  The checksum, and nothing else. v1 makes no ABN Lookup call: the checksum
 *  catches a transposed digit — the realistic error — without putting a network
 *  round trip in front of a tradie who is trying to join the program. */
export function abnValid(abn: string | null | undefined): boolean {
  // Humans write an ABN with spaces, and every form in this system should let
  // them. Normalising here means no caller has to remember to.
  const digits = String(abn ?? "").replace(/\s/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const sum = ABN_WEIGHTS.reduce((total, weight, index) => {
    const digit = Number(digits[index]) - (index === 0 ? 1 : 0);
    return total + digit * weight;
  }, 0);
  return sum % 89 === 0;
}
