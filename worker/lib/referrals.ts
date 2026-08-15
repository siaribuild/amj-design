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

/** The four fields a payout needs, as stored on the user row. */
export interface PayoutDetails {
  abn?: string | null;
  payout_bsb?: string | null;
  payout_account_number?: string | null;
  payout_account_name?: string | null;
}

/** THE payability predicate (D18). One place; no caller re-derives it.
 *
 *  A user cannot hold a referral code until ABN, BSB, account number and account
 *  name are all stored. Completing those details is how you ENTER the program —
 *  not how you unblock a payment later. Moving the gate to the front means
 *  commission can never be earned by someone the business cannot pay, so a
 *  dormant balance never starts the twelve-month unclaimed-money clock.
 *
 *  ⚠️ IT READS FOUR FIELDS AND NOTHING ELSE — in particular, never the referrer's
 *  own order history. "You have to be a customer to refer" is the ACL s 49
 *  referral-selling fact pattern: strict liability, penalties to $100m. That is
 *  why this takes a plain user row rather than an Env: with no database handle it
 *  is structurally incapable of asking whether the referrer has ever ordered, and
 *  a later edit cannot quietly make it so. Payability and purchase are two
 *  different facts and must stay un-conflatable. */
export function payoutComplete(user: PayoutDetails | null | undefined): boolean {
  if (!user) return false;
  const stored = (value: string | null | undefined) => String(value ?? "").trim().length > 0;
  return abnValid(user.abn)
    && stored(user.payout_bsb)
    && stored(user.payout_account_number)
    && stored(user.payout_account_name);
}
