// Referral program — everything except the "is a discount live right now?"
// question, which is its own leaf module (referral-discount.ts) so pricing can
// ask it without closing an import cycle.
//
// Routes stay thin: the rules live here.
import type { Env } from "../types";
import { uuid } from "./util";

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
  // A code already issued is PERMANENT and survives the program being switched
  // off — it may have been read out over a phone months ago. Only new issuance
  // pauses, which is why this check sits after the early return and not before it.
  if (user.referral_code) return user.referral_code;
  const program = await env.DB
    .prepare("SELECT active FROM referral_program WHERE id = 'default'")
    .first<{ active: number }>();
  if (!program?.active) return null;
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

/** Everything recording a referral is allowed to know.
 *
 *  ⚠️ THERE IS NO PARAMETER HERE FOR THE REFERRED PERSON'S DETAILS, AND THERE
 *  MUST NEVER BE ONE. The referred tradie always self-identifies — they follow a
 *  link or type a code while signed in as themselves. A referrer handing us a
 *  mate's name, phone or email would be AMJ "providing a benefit to collect
 *  personal information about another individual from someone else", which is
 *  Privacy Act s 6D(4)(d) on its face; if it fires, the business loses the small
 *  business exemption for EVERY record it holds, not just referral data. */
export interface RecordReferralInput {
  /** The signed-in account being referred. Identified by us, never supplied. */
  referredUser: { id: string };
  code: string;
  source: "link" | "manual";
}

/** Record the relationship, freezing the program's terms onto it (M10).
 *
 *  The snapshot is the point: changing a rate in ops must never move what someone
 *  was already promised, in either direction. Every figure that governs this
 *  referral is copied here at the moment it is made, so nothing downstream reads
 *  the live config to decide what is owed. */
export async function recordReferral(
  env: Env,
  input: RecordReferralInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = input.code.trim().toUpperCase();
  const referrer = await env.DB
    .prepare("SELECT * FROM user WHERE referral_code = ?")
    .bind(code)
    .first<{ id: string; type: string | null } & PayoutDetails>();
  // ONE ANSWER FOR THREE SITUATIONS, deliberately (ADR-8b): the code was never
  // issued, it belongs to a staff account, or its owner has removed their bank
  // details since. A distinct "that referrer cannot be paid right now" would tell
  // a third party something about someone else's banking status, and it would let
  // a stranger sort real codes from invented ones by the shape of the refusal.
  if (!referrer || referrer.type === "internal" || !payoutComplete(referrer)) {
    return { ok: false, error: "invalid_code" };
  }
  // A11. The table has a CHECK for this too, but a constraint violation is a 500:
  // the rule has to be ANSWERED so the screen can say which rule was hit.
  if (referrer.id === input.referredUser.id) return { ok: false, error: "own_code" };
  // A9 — one referral per account, permanently. First recorded wins: a second code
  // is refused rather than overwriting a relationship already promised to someone.
  const already = await env.DB
    .prepare("SELECT id FROM referral WHERE referred_user_id = ?")
    .bind(input.referredUser.id)
    .first<{ id: string }>();
  if (already) return { ok: false, error: "already_referred" };
  // A5 — MANUAL ONLY. The link path records at signup, before an order can exist,
  // so this gate belongs to typed codes alone. Without it a customer could enter a
  // mate's code years in, long after whatever introduction supposedly caused the
  // sale, and claim a commission for it.
  if (input.source === "manual") {
    const ordered = await env.DB
      .prepare(`SELECT o.id FROM "order" o JOIN project p ON p.id = o.project_id WHERE p.owner_user_id = ?`)
      .bind(input.referredUser.id)
      .first<{ id: string }>();
    if (ordered) return { ok: false, error: "has_order" };
  }

  // A13 — two logins for one business is not a referral. Digits only, because
  // people write an ABN with spaces.
  //
  // Narrower than it looks, and deliberately so: it can only fire when BOTH sides
  // have an ABN, and the referred side usually has none at signup. It does not
  // PREVENT self-referral — the ABR confirms one person may legitimately hold
  // several ABNs across different structures — it removes the laziest version.
  // What contains the rest is that no price leaves this business unreviewed.
  const digits = (abn: string | null | undefined) => String(abn ?? "").replace(/\D/g, "");
  const referred = await env.DB
    .prepare("SELECT abn FROM user WHERE id = ?")
    .bind(input.referredUser.id)
    .first<{ abn: string | null }>();
  if (digits(referred?.abn) && digits(referred?.abn) === digits(referrer.abn)) {
    // Unspecific on purpose: naming the ABN match would tell someone probing the
    // rules exactly which check to route around next time.
    return { ok: false, error: "not_eligible" };
  }

  const program = await env.DB
    .prepare("SELECT * FROM referral_program WHERE id = 'default'")
    .first<{
      active: number; rate_percent: number; cap_amount: number | null; min_order_amount: number;
      discount_percent: number; window_months: number;
    }>();
  // Off stops NEW attribution and nothing else. Whether an existing discount or a
  // promised commission still stands is decided elsewhere, by paths that never
  // read this flag — see referral-discount.ts.
  if (!program?.active) return { ok: false, error: "program_off" };

  await env.DB
    .prepare(
      `INSERT INTO referral
         (id, referrer_user_id, referred_user_id, code, source,
          rate_percent, cap_amount, min_order_amount, discount_percent, window_months, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`,
    )
    .bind(
      uuid(), referrer.id, input.referredUser.id, code, input.source,
      program!.rate_percent, program!.cap_amount, program!.min_order_amount,
      program!.discount_percent, program!.window_months, `+${program!.window_months} months`,
    )
    .run();
  return { ok: true };
}

/** What a referrer submits to become payable. Free text as typed. */
export interface PayoutDetailsInput {
  bsb?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
}

/** Store a referrer's payout details, and record that they changed.
 *
 *  THE LOG IS NOT OPTIONAL AND NOT A SEPARATE CALL. Both writes go out in one
 *  `batch`, so there is no path that stores banking details without the access
 *  row landing with them. ADR-4 asks for that obligation to be structural rather
 *  than a convention a future endpoint has to remember, and a second endpoint
 *  that forgot the log would have to forget the storage too.
 *
 *  Recording WHO, WHICH RECORD and WHEN — never the value. Copying the details
 *  into a log in order to protect the details is self-defeating, so `context`
 *  carries a masked fingerprint and nothing else. */
export async function savePayoutDetails(
  env: Env,
  user: { id: string },
  input: PayoutDetailsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Humans type a BSB with a hyphen and an account number with spaces. Normalise
  // once, here, so no caller and no screen has to.
  const bsb = String(input.bsb ?? "").replace(/\D/g, "");
  const accountNumber = String(input.accountNumber ?? "").replace(/\D/g, "");
  const accountName = String(input.accountName ?? "").trim();
  if (!/^\d{6}$/.test(bsb)) return { ok: false, error: "invalid_bsb" };
  if (!/^\d{5,9}$/.test(accountNumber)) return { ok: false, error: "invalid_account_number" };
  if (!accountName) return { ok: false, error: "invalid_account_name" };

  const masked = `bsb=${bsb.slice(0, 3)}-*** acct=****${accountNumber.slice(-4)}`;
  await env.DB.batch([
    env.DB
      .prepare("UPDATE user SET payout_bsb = ?, payout_account_number = ?, payout_account_name = ? WHERE id = ?")
      .bind(bsb, accountNumber, accountName, user.id),
    env.DB
      .prepare("INSERT INTO payout_details_access (id, subject_user_id, actor_user_id, action, context) VALUES (?, ?, ?, 'change', ?)")
      .bind(uuid(), user.id, user.id, masked),
  ]);
  return { ok: true };
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
/** Which halves of the gate are still outstanding, in the order a screen asks for
 *  them.
 *
 *  `complete: false` alone cannot tell the account area whether to say "add your
 *  ABN" or "you are not eligible", and under D18 this is the PRIMARY entry state
 *  for every new referrer rather than an error case. Two groups, not four fields:
 *  the three bank fields are collected together on one form, so splitting them
 *  would offer a distinction no screen can act on. */
export function payoutMissing(user: PayoutDetails | null | undefined): ("abn" | "bank_details")[] {
  const stored = (value: string | null | undefined) => String(value ?? "").trim().length > 0;
  const missing: ("abn" | "bank_details")[] = [];
  if (!abnValid(user?.abn)) missing.push("abn");
  if (!stored(user?.payout_bsb) || !stored(user?.payout_account_number) || !stored(user?.payout_account_name)) {
    missing.push("bank_details");
  }
  return missing;
}

export function payoutComplete(user: PayoutDetails | null | undefined): boolean {
  if (!user) return false;
  const stored = (value: string | null | undefined) => String(value ?? "").trim().length > 0;
  return abnValid(user.abn)
    && stored(user.payout_bsb)
    && stored(user.payout_account_number)
    && stored(user.payout_account_name);
}
