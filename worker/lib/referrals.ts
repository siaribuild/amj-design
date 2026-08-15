// Referral program — everything except the "is a discount live right now?"
// question, which is its own leaf module (referral-discount.ts) so pricing can
// ask it without closing an import cycle.
//
// Routes stay thin: the rules live here.
import type { Env } from "../types";

/** The account row this module needs to answer "may this user hold a code?". */
export interface ReferrerRow extends PayoutDetails {
  id: string;
  referral_code?: string | null;
}

/** The user's referral code, or null when they may not hold one.
 *
 *  WITHHELD, never issued-inactive (ADR-8a). While the details are missing there
 *  is no code to click, read out or set a cookie from, so the window in which a
 *  referral could be recorded against a referrer who cannot be paid does not
 *  exist rather than being guarded against somewhere else.
 *
 *  Only the ISSUE moment sits behind the gate. Once issued the code is permanent:
 *  a tradie who has already read it out to a mate on a job site must never find
 *  it changed underneath them. */
export async function ensureReferralCode(
  env: Env,
  user: ReferrerRow,
  generate: () => string = generateReferralCode,
): Promise<string | null> {
  if (!payoutComplete(user)) return null;
  if (user.referral_code) return user.referral_code;
  for (let attempt = 0; attempt < CODE_ISSUE_ATTEMPTS; attempt += 1) {
    const drawn = generate();
    // NOT EXISTS rather than letting the UNIQUE index throw. Matching on D1's
    // error text would couple this to a message we do not own, and a reworded
    // message would turn a handled collision back into a 500 without a test
    // noticing. Declining to take is the same outcome with none of that.
    await env.DB
      .prepare(
        `UPDATE user SET referral_code = ? WHERE id = ? AND referral_code IS NULL
           AND NOT EXISTS (SELECT 1 FROM user WHERE referral_code = ?)`,
      )
      .bind(drawn, user.id, drawn)
      .run();
    // Read back rather than return what was just drawn. If a concurrent request
    // issued a code first, the WHERE clause matched nothing and THAT code is the
    // permanent one — and it may already have been read out over the phone. A
    // null read-back means the row did not take: the draw collided, so redraw.
    const row = await env.DB.prepare("SELECT referral_code FROM user WHERE id = ?")
      .bind(user.id).first<{ referral_code: string | null }>();
    if (row?.referral_code) return row.referral_code;
  }
  // NOT null. null already means "this user may not hold a code" — the D18 gate's
  // answer — and reusing it here would tell a tradie who HAS completed their bank
  // details that they are not in the program, with nothing on the account screen
  // able to tell the two apart. Five collisions is a broken generator, not bad
  // luck, so it fails where someone will see it.
  throw new Error(`could not issue a referral code after ${CODE_ISSUE_ATTEMPTS} attempts`);
}

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

/** No O, 0, I or 1. Half these introductions happen on a job site — B reads the
 *  code out, A types it in later — and those are exactly the pairs that get
 *  transcribed wrongly. Dropping them costs a little of a space that is already
 *  vastly larger than the number of tradies in Australia. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Redraws before giving up. Five collisions in a ~8.9 × 10⁸ space is not bad
 *  luck — it is the generator or the alphabet being broken — so the loop is a
 *  bound on a real fault, not a retry budget for an expected one. */
const CODE_ISSUE_ATTEMPTS = 5;

/** A fresh XXX-XXX code, drawn at random rather than issued from a counter: a
 *  sequential code would let anyone holding one guess the next. ~8.9 × 10⁸
 *  possibilities, so a collision is rare — and the caller retries against the
 *  UNIQUE index rather than trusting that it cannot happen. */
export function generateReferralCode(): string {
  const pick = () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  const block = () => `${pick()}${pick()}${pick()}`;
  return `${block()}-${block()}`;
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
