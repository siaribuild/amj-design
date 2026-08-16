// Referral program — everything except the "is a discount live right now?"
// question, which is its own leaf module (referral-discount.ts) so pricing can
// ask it without closing an import cycle.
//
// Routes stay thin: the rules live here.
import type { Env } from "../types";
import { uuid } from "./util";
import { taxBreakdown } from "../../src/data/gst";
import { STAGES } from "./orders";
import { stripReferralFromDrafts } from "./lines";
import type { ReferralOffer, ReferralProgramPublic } from "../../src/data/referrals";
import { referralDiscountState } from "./referral-discount";

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

/** Do these two ABNs identify the same business?
 *
 *  Digits only, because people write an ABN with spaces and the same number typed
 *  twice should still match. Two absent ABNs are NOT a match — an unanswered
 *  question is not evidence, and treating it as one would refuse every referral
 *  where neither side had filled the field in.
 *
 *  Asked at recording and again at confirmation, so it lives here rather than
 *  inline at either. */
function sameBusiness(a: string | null | undefined, b: string | null | undefined): boolean {
  const digits = (abn: string | null | undefined) => String(abn ?? "").replace(/\D/g, "");
  return digits(a).length > 0 && digits(a) === digits(b);
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
  // people write an ABN with spaces. Asked here AND again at confirmation: at
  // signup the referred side usually has no ABN to compare, so a check that ran
  // only once would be defeated by filling it in afterwards.
  //
  // Narrower than it looks, and deliberately so: it can only fire when BOTH sides
  // have an ABN, and the referred side usually has none at signup. It does not
  // PREVENT self-referral — the ABR confirms one person may legitimately hold
  // several ABNs across different structures — it removes the laziest version.
  // What contains the rest is that no price leaves this business unreviewed.
  const referred = await env.DB
    .prepare("SELECT abn FROM user WHERE id = ?")
    .bind(input.referredUser.id)
    .first<{ abn: string | null }>();
  if (sameBusiness(referred?.abn, referrer.abn)) {
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

/** The referred tradie's first order exists — create the earning it owes.
 *
 *  PENDING, not payable. The customer has accepted a quote, which is not the same
 *  as having paid for it; nothing becomes payable until that order is paid in
 *  full. Called from the route that creates the order rather than from inside
 *  `orders.ts`, so the order lifecycle does not have to know this feature exists.
 *
 *  Every figure that governs the money comes from the referral's own snapshot,
 *  never the live config: the rate that applies is the one the referrer was
 *  promised on the day the introduction was recorded. */
export async function onOrderCreated(env: Env, orderId: string): Promise<void> {
  const order = await env.DB
    .prepare(`SELECT o.id, o.created_at, o.project_id, p.owner_user_id
                FROM "order" o JOIN project p ON p.id = o.project_id WHERE o.id = ?`)
    .bind(orderId)
    .first<{ id: string; created_at: string; project_id: string; owner_user_id: string | null }>();
  if (!order?.owner_user_id) return;

  const referral = await env.DB
    .prepare("SELECT * FROM referral WHERE referred_user_id = ? AND status = 'recorded'")
    .bind(order.owner_user_id)
    .first<{ id: string; rate_percent: number; cap_amount: number | null; min_order_amount: number; expires_at: string }>();
  if (!referral) return;
  // Derived-expired: an order placed after the window closed earns nothing, and
  // the referral needs no stored "expired" flag to say so.
  if (order.created_at > referral.expires_at) return;

  const program = await env.DB
    .prepare("SELECT referrer_reward_active FROM referral_program WHERE id = 'default'")
    .first<{ referrer_reward_active: number }>();
  if (!program?.referrer_reward_active) return;

  // Parent lines only — a composite's segments are already counted in their
  // parent's total, the same rule every other money read here follows.
  const lines = await env.DB
    .prepare("SELECT line_total FROM order_line WHERE order_id = ? AND parent_line_id IS NULL")
    .bind(orderId)
    .all<{ line_total: number }>();
  const lineTotalsInc = (lines.results ?? []).map((line) => line.line_total);
  const goodsInc = lineTotalsInc.reduce((sum, n) => sum + n, 0);
  // THE SAME per-line taxable-supply rule the customer's own order screen renders
  // (M3). A fresh /1.1 written here would disagree with that screen by cents, and
  // the customer would be right. Delivery is excluded by construction, not by
  // subtraction: it is never passed in.
  const base = taxBreakdown("ex", { lineTotalsInc, deliveryInc: 0, totalInc: goodsInc }).goods;
  // Measured against the SNAPSHOT minimum, not today's config: the floor that
  // applies is the one the referrer was told about when the introduction was made.
  const qualifies = base >= referral.min_order_amount;

  await env.DB
    .prepare(
      `INSERT INTO referral_earning
         (id, referral_id, order_id, base_amount, rate_percent, amount, status, void_reason, voided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      uuid(), referral.id, orderId, base, referral.rate_percent,
      // Below the qualifying minimum the row is still WRITTEN, and voided — not
      // skipped. A referrer whose mate ordered under the floor should see "Not
      // eligible" with a reason rather than a referral that appears to have
      // silently evaporated, and ops needs a row to un-void when a judgement call
      // goes the other way on a near-miss.
      qualifies ? Math.round(base * referral.rate_percent) / 100 : 0,
      qualifies ? "pending" : "void",
      qualifies ? null : "below_minimum_order",
      qualifies ? null : new Date().toISOString(),
    )
    .run();

  // Their eligibility just ended — the first order exists. Any OTHER draft they
  // are holding still carries the discount in its stored total, and stored totals
  // do not notice that the world moved.
  await stripReferralFromDrafts(env, order.owner_user_id, order.project_id);
}

/** The referred order has been paid in full — the money becomes payable.
 *
 *  M8. Full payment IS the maturation, and it is a state the system already
 *  tracks, so no hold period is invented and no clawback is needed: the customer
 *  has paid us before we pay the referrer. A deposit does nothing here — the job
 *  is not done and the money is not ours yet.
 *
 *  `confirmed_at` is stamped because it is the instant the advertised payment
 *  window is measured from. ACL s 32(2) makes that window a promise that has to
 *  be met, not merely stated, and the ops queue measures against this column. */
export async function onOrderBalancePaid(env: Env, orderId: string): Promise<void> {
  // ADR-8c. Details are a precondition of joining, so the referrer WAS payable
  // when this was recorded — but they may have cleared them since, and this order
  // may be paid afterwards. Such money stays PENDING.
  //
  // Pending is not merely a label. Confirmed money is payable, and payable-but-
  // unpaid is what starts Victoria's twelve-month unclaimed-money clock.
  // Confirming money we cannot send would recreate the very state D18 was chosen
  // to make unreachable.
  //
  // The payability test is `payoutComplete` and NOT a SQL rewrite of it. Written
  // as a WHERE clause it silently becomes a different, weaker rule — four
  // non-empty columns, where payoutComplete also validates the ABN checksum — so
  // a referrer with a malformed ABN would be paid by one path and refused by the
  // other. One place per fact, even when the fact is cheap to restate.
  // DERIVED, not event-driven: no live path cancels or refunds an order today, so
  // there is no event to subscribe to. The columns are read at the one moment it
  // matters — when money would otherwise become payable. Building the guard now
  // costs a read; retrofitting it the day refunds ship would cost finding every
  // payout already made on money that came back.
  const order = await env.DB
    .prepare('SELECT stage, payment_status FROM "order" WHERE id = ?')
    .bind(orderId)
    .first<{ stage: string; payment_status: string }>();
  const reversal = order?.payment_status === "refunded"
    ? "order_refunded"
    : order?.stage === "cancelled" ? "order_cancelled" : null;
  if (reversal) {
    await env.DB
      .prepare(
        `UPDATE referral_earning
            SET status = 'void', void_reason = ?, voided_at = datetime('now')
          WHERE order_id = ? AND status = 'pending'`,
      )
      .bind(reversal, orderId)
      .run();
    return;
  }

  const parties = await env.DB
    .prepare(
      `SELECT u.*, referred.abn AS referred_abn
         FROM referral_earning e
         JOIN referral r ON r.id = e.referral_id
         JOIN user u ON u.id = r.referrer_user_id
         JOIN user referred ON referred.id = r.referred_user_id
        WHERE e.order_id = ? AND e.status = 'pending'`,
    )
    .bind(orderId)
    .first<PayoutDetails & { referred_abn: string | null }>();

  // A13's late limb. At signup the referred side usually has no ABN, so the
  // recording-time check had nothing to compare. Asked again here, because
  // otherwise the rule is defeated by filling the field in afterwards.
  if (sameBusiness(parties?.referred_abn, parties?.abn)) {
    await env.DB
      .prepare(
        `UPDATE referral_earning
            SET status = 'void', void_reason = 'same_abn', voided_at = datetime('now')
          WHERE order_id = ? AND status = 'pending'`,
      )
      .bind(orderId)
      .run();
    return;
  }

  if (!payoutComplete(parties)) return;

  await env.DB
    .prepare(
      `UPDATE referral_earning
          SET status = 'confirmed', confirmed_at = datetime('now')
        WHERE order_id = ? AND status = 'pending'`,
    )
    .bind(orderId)
    .run();
}

/** Stages at or past "paid in full", for the sweep's candidate query.
 *
 *  Derived from `STAGES` rather than typed out, so an order lifecycle that gains
 *  a stage after `balance_paid` does not silently fall out of the sweep. */
const PAID_IN_FULL_ONWARDS = STAGES.slice(STAGES.indexOf("balance_paid"));

/** Release money that was held, and only that.
 *
 *  The residue of the payability hold: a referrer cleared their bank details, the
 *  order was paid while they were unpayable, and later they put the details back.
 *  Nothing in that last request touches the earning — the order was paid long ago
 *  and the account form knows nothing about referrals — so there is no request to
 *  hang the release on. A sweep is the only honest place for it.
 *
 *  It re-uses `onOrderBalancePaid` rather than repeating its conditions, so the
 *  refund guard, the same-business re-check and the payability test cannot drift
 *  between the two paths that confirm money. */
export async function referralSweep(env: Env): Promise<void> {
  const placeholders = PAID_IN_FULL_ONWARDS.map(() => "?").join(", ");
  const { results } = await env.DB
    .prepare(
      `SELECT DISTINCT e.order_id FROM referral_earning e
         JOIN "order" o ON o.id = e.order_id
        WHERE e.status = 'pending' AND o.stage IN (${placeholders})`,
    )
    .bind(...PAID_IN_FULL_ONWARDS)
    .all<{ order_id: string }>();
  for (const row of results ?? []) await onOrderBalancePaid(env, row.order_id);
}

/** The program as every customer surface is allowed to see it.
 *
 *  One reader for every figure, so the landing page, the placements, the account
 *  section and the emails cannot drift apart from each other or from the config. */
export async function publicProgram(env: Env): Promise<ReferralProgramPublic> {
  const row = await env.DB
    .prepare("SELECT * FROM referral_program WHERE id = 'default'")
    .first<{
      active: number; discount_percent: number; rate_percent: number;
      min_order_amount: number; window_months: number; cap_amount: number | null;
      min_payout_balance: number; payout_timeframe_days: number;
      referrer_reward_active: number; referred_discount_active: number;
    }>();
  return {
    active: Boolean(row?.active),
    discountPercent: row?.discount_percent ?? 0,
    ratePercent: row?.rate_percent ?? 0,
    minOrderAmount: row?.min_order_amount ?? 0,
    windowMonths: row?.window_months ?? 0,
    // Kept NULLABLE rather than defaulted to 0: null means "render no cap clause
    // at all", where 0 would mean "capped at nothing". The screen needs to be able
    // to say nothing, and a number cannot express silence.
    capAmount: row?.cap_amount ?? null,
    minPayoutBalance: row?.min_payout_balance ?? 0,
    payoutTimeframeDays: row?.payout_timeframe_days ?? 0,
    referrerRewardActive: Boolean(row?.referrer_reward_active),
    referredDiscountActive: Boolean(row?.referred_discount_active),
  };
}

/** How a referrer is allowed to see the person they referred (AC-26).
 *
 *  Business name if they gave one, otherwise a masked email. Never the address
 *  itself, never a phone number, never what they bought. The referrer already
 *  knows who they introduced — this is for recognising the row, not for learning
 *  anything new about them. */
function displayName(company: string | null, email: string): string {
  if (company?.trim()) return company.trim();
  const [local, domain] = email.split("@");
  const shown = local.slice(0, 2);
  return `${shown}${"*".repeat(Math.max(1, local.length - shown.length))}@${domain}`;
}

/** Mask a stored number to its shape, not its value. */
const maskBsb = (bsb: string | null | undefined) =>
  bsb ? `${bsb.slice(0, 3)}-${"*".repeat(Math.max(1, bsb.length - 3))}` : null;
const maskAccount = (account: string | null | undefined) =>
  account ? `${"*".repeat(Math.max(1, account.length - 4))}${account.slice(-4)}` : null;

/** Everything the referrer's screen renders, assembled once.
 *
 *  The screen adds nothing up and derives no dates. Sums arrive summed and the
 *  payment-due date arrives resolved, because that date is a promise the business
 *  makes under ACL s 32(2) and its arithmetic belongs in one place. */
export async function referrerScreen(env: Env, user: ReferrerRow & { id: string }, origin: string) {
  const program = await publicProgram(env);
  const code = await ensureReferralCode(env, user);

  const referrals = await env.DB
    .prepare(
      `SELECT r.id, r.created_at, r.expires_at, r.status,
              u.company, u.email,
              (SELECT o.stage FROM "order" o JOIN project p ON p.id = o.project_id
                WHERE p.owner_user_id = r.referred_user_id ORDER BY o.created_at LIMIT 1) AS stage,
              (SELECT e.status FROM referral_earning e WHERE e.referral_id = r.id LIMIT 1) AS earning_status
         FROM referral r JOIN user u ON u.id = r.referred_user_id
        WHERE r.referrer_user_id = ? ORDER BY r.created_at DESC`,
    )
    .bind(user.id)
    .all<{
      id: string; created_at: string; expires_at: string; status: string;
      company: string | null; email: string; stage: string | null; earning_status: string | null;
    }>();

  const paidStages = new Set<string>(PAID_IN_FULL_ONWARDS);
  const now = new Date().toISOString();

  const { results: earningResults } = await env.DB
    .prepare(
      `SELECT e.id, e.referral_id, e.amount, e.status, e.confirmed_at
         FROM referral_earning e JOIN referral r ON r.id = e.referral_id
        WHERE r.referrer_user_id = ? ORDER BY e.created_at DESC`,
    )
    .bind(user.id)
    .all<{ id: string; referral_id: string; amount: number; status: string; confirmed_at: string | null }>();

  const sum = (status: string) => Math.round(
    (earningResults ?? []).filter((e) => e.status === status).reduce((t, e) => t + e.amount, 0) * 100,
  ) / 100;

  const held = sum("pending");
  const confirmed = sum("confirmed");
  const payable = payoutComplete(user);

  return {
    referrerGate: { complete: payable, missing: payoutMissing(user) },
    code,
    // The code a former member would get back. `code` is null for them by
    // definition — the gate is open — so the one screen whose copy names a code
    // would otherwise have none to name.
    retainedCode: code ? null : (user.referral_code ?? null),
    shareUrl: code ? `${origin}/r/${code}` : null,
    // The REFERRED side's own ability, never gated by D18: becoming a referrer
    // needs payout details, being referred does not.
    // Closed by either of the two things that end it: already referred (A9, one
    // per account permanently) or already ordered (A5, the window for a typed
    // code closes at the first order).
    canEnterCode: !(await env.DB
      .prepare(
        `SELECT 1 AS taken FROM referral WHERE referred_user_id = ?1
          UNION ALL
         SELECT 1 FROM "order" o JOIN project p ON p.id = o.project_id WHERE p.owner_user_id = ?1`,
      )
      .bind(user.id).first()),
    referrals: (referrals.results ?? []).map((r) => ({
      id: r.id,
      displayName: displayName(r.company, r.email),
      joinedAt: r.created_at,
      status: r.status !== "recorded" || r.earning_status === "void"
        ? "not_eligible"
        : r.stage && paidStages.has(r.stage) ? "paid_in_full"
        : r.stage ? "ordered"
        : r.expires_at <= now ? "expired"
        : "signed_up",
    })),
    earnings: { pending: held, confirmed, paid: sum("paid") },
    earningRows: (earningResults ?? []).map((e) => ({
      id: e.id,
      referralId: e.referral_id,
      amount: e.amount,
      status: e.status,
      confirmedAt: e.confirmed_at,
      // Resolved here, never in the browser: this is the date the business
      // promises to pay by, and ACL s 32(2) makes it a commitment to meet rather
      // than merely state.
      dueAt: e.confirmed_at
        ? new Date(new Date(e.confirmed_at + "Z").getTime() + program.payoutTimeframeDays * 86_400_000).toISOString()
        : null,
    })),
    payout: {
      abn: user.abn ?? null,
      abnPresent: Boolean(user.abn?.trim()),
      abnValid: abnValid(user.abn),
      bsbMasked: maskBsb(user.payout_bsb),
      accountMasked: maskAccount(user.payout_account_number),
      accountName: user.payout_account_name ?? null,
      // Details cannot be removed while confirmed money is waiting on them —
      // those are the details we are about to pay into.
      clearBlocked: confirmed > 0 ? { amount: confirmed } : null,
      // The ADR-8c residue: money held because the details were cleared. Re-adding
      // them releases it on the next sweep.
      heldPendingDetails: !payable && held > 0 ? { amount: held } : null,
      heldUnderThreshold: program.minPayoutBalance > 0 && confirmed > 0 && confirmed < program.minPayoutBalance
        ? { balance: confirmed, threshold: program.minPayoutBalance }
        : null,
    },
    payoutHistory: [] as { paidAt: string; amount: number; reference: string | null; referralIds: string[] }[],
    program,
  };
}

/** The referred tradie's own panel — their discount, from their side.
 *
 *  DERIVED on every read from three records that already exist: the referral, its
 *  expiry, and whether the account has ordered. No stored status, so nothing can
 *  go stale — and no sweep is needed to keep a status column honest.
 *
 *  It reads the promise, never the switch. A discount already given runs to its
 *  own date whether or not the program is still taking new joiners. */
export async function referralOffer(env: Env, userId: string): Promise<ReferralOffer | null> {
  const live = await referralDiscountState(env, userId);
  // 'none' is nobody referred them; 'void' is a relationship that never happened
  // from their side. Both mean no panel at all rather than an empty one.
  if (live.state === "none" || live.state === "void") return null;

  const referrer = await env.DB
    .prepare(
      `SELECT u.company, u.name, u.email FROM referral r
         JOIN user u ON u.id = r.referrer_user_id WHERE r.id = ?`,
    )
    .bind(live.referralId)
    .first<{ company: string | null; name: string | null; email: string }>();

  const order = live.usedOrderId
    ? await env.DB.prepare('SELECT order_no, created_at FROM "order" WHERE id = ?')
        .bind(live.usedOrderId).first<{ order_no: string; created_at: string }>()
    : null;

  return {
    state: live.state,
    // Their percentage ALONE. The standing account discount is not summed into
    // this and has no field to be summed into — see src/data/referrals.ts.
    referralPercent: live.percent || (await snapshotPercent(env, live.referralId)),
    expiresAt: live.expiresAt,
    usedOrderId: live.usedOrderId ?? null,
    usedOrderNo: order?.order_no ?? null,
    usedAt: order?.created_at ?? null,
    expiredAt: live.state === "expired" ? live.expiresAt : null,
    referrerName: referrer?.company?.trim() || referrer?.name?.trim() || "a tradie you know",
  };
}

/** The percentage as promised, for the states where it is no longer live.
 *
 *  A used or expired panel still names the figure — "your 2.5% discount was
 *  applied" — and that figure is the one from the snapshot, not today's config. */
async function snapshotPercent(env: Env, referralId: string | null): Promise<number> {
  if (!referralId) return 0;
  const row = await env.DB.prepare("SELECT discount_percent FROM referral WHERE id = ?")
    .bind(referralId).first<{ discount_percent: number }>();
  return row?.discount_percent ?? 0;
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
