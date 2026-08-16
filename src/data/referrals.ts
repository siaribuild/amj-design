// Referral program — the shapes every customer-facing surface is allowed to see.
//
// ⚠️ THIS FILE IS WHERE AC-75 STOPS BEING A RULE AND BECOMES A SHAPE.
//
// Every registered account already gets a standing discount for being registered,
// and the business has decided that figure is never shown. A referred tradie is
// told their referral percentage and nothing else — because a combined total
// discloses the standing discount by subtraction exactly as effectively as
// printing it would.
//
// So the guard is not a comment asking people to remember. It is these types:
//
//   1. Exactly ONE percentage field exists across every customer shape here —
//      `referralPercent` (and `discountPercent`/`ratePercent` as PROGRAM facts).
//      There is no field a combined figure could be assigned to without someone
//      adding one, which is a visible act in review rather than an oversight.
//   2. `DiscountResolution`, `accountDiscountPercent` and the referral snapshot
//      internals appear NOWHERE in this file. They are worker-side types. The
//      composition of the two discounts stays server-side, in the price snapshot,
//      where ops can see it and a customer response cannot reach it.
//   3. Program figures are program facts, not account facts, and live only in
//      `ReferralProgramPublic`.
//
// Anyone adding a field here should assume the reviewer will ask which of those
// three rules it tests.

/** The offer, as advertised. Public: a logged-out visitor reads this.
 *
 *  EVERY FIGURE IN EVERY PIECE OF COPY COMES FROM HERE. Nothing on the landing
 *  page, the marketing placements, the account section or the emails may type a
 *  number into a string — the owner kept the rate configurable precisely so it
 *  could be changed without a deploy, and a typed figure would make the site
 *  advertise one number while the engine applied another. */
export interface ReferralProgramPublic {
  /** Off means joining is paused, not that the program ended. The page stays up
   *  and keeps its figures; only a banner is added. */
  active: boolean;
  /** The referred tradie's first-order discount. */
  discountPercent: number;
  /** The referrer's commission, on ex-GST goods excluding delivery. */
  ratePercent: number;
  minOrderAmount: number;
  windowMonths: number;
  /** null ⇒ render no cap clause at all, rather than "no cap" or "$0". */
  capAmount: number | null;
  /** 0 ⇒ render no threshold language at all. Same reasoning as the cap. */
  minPayoutBalance: number;
  /** Stated wherever the offer is made: ACL s 32(2) makes it a promise to meet. */
  payoutTimeframeDays: number;
  /** The two sides are separately switchable — discount-only and commission-only
   *  are both legitimate configurations, not misconfigurations. */
  referrerRewardActive: boolean;
  referredDiscountActive: boolean;
}

/** How far along someone you referred is. Deliberately short: a referrer needs to
 *  know whether this is happening and when they get paid, and nothing further.
 *  "Quoting" was cut — that a mate is shopping is neither the referrer's business
 *  nor connected to their money. */
export type ReferralStatus =
  | "signed_up" | "ordered" | "paid_in_full" | "expired" | "not_eligible";

/** One person you referred.
 *
 *  `displayName` is a business name, else a masked email. Never a phone number,
 *  an address, a project, or what they bought. */
export interface ReferralSummary {
  id: string;
  displayName: string;
  joinedAt: string;
  status: ReferralStatus;
}

export type EarningStatus = "pending" | "confirmed" | "void" | "paid";

export interface EarningRow {
  id: string;
  referralId: string;
  amount: number;
  status: EarningStatus;
  /** The instant it became payable — what the stated payment window runs from. */
  confirmedAt: string | null;
  /** When we have promised to have paid it by, resolved server-side.
   *
   *  Not derived in the browser, deliberately: this is the date the business
   *  commits to under ACL s 32(2), which requires the window to be met and not
   *  merely stated. Its arithmetic lives in one place. null until payable. */
  dueAt: string | null;
}

/** The state of being payable, as its owner sees it.
 *
 *  Masked, always. The unmasked values exist in exactly one place a human can
 *  read them — the ops payouts run — and nowhere else, including here. */
export interface PayoutState {
  /** The ABN itself. A public business identifier, and the person reading it is
   *  its owner — so unlike the bank fields there is nothing here to mask. */
  abn: string | null;
  abnPresent: boolean;
  abnValid: boolean;
  bsbMasked: string | null;
  accountMasked: string | null;
  accountName: string | null;
  /** Set when details cannot be removed: confirmed money is waiting on them. */
  clearBlocked: null | { amount: number };
  /** ADR-8c residue — money held because the details were cleared. Re-adding
   *  them releases it on the next sweep. */
  heldPendingDetails: null | { amount: number };
  /** Only when a minimum payout balance is switched on, which it is not by
   *  default. Money is never held silently. */
  heldUnderThreshold: null | { balance: number; threshold: number };
}

/** One transfer, as its recipient sees it.
 *
 *  NO BANKING. The payout row carries a frozen copy of the account it went to —
 *  that copy is the accountant's record and belongs to the ops payout run, not
 *  here (AC-29). Its owner reads a date, an amount and the bank reference, which
 *  is what they need to match it against their statement.
 *
 *  A `failed` payment stays in this list rather than disappearing: "we tried to
 *  pay you and it came back" is the thing someone rings up about, and a history
 *  that quietly drops it answers nothing. */
export interface PayoutRecord {
  paidAt: string;
  amount: number;
  reference: string | null;
  /** `paid` stands; `failed` bounced and the money went back into the queue. */
  status: "paid" | "failed";
  referralIds: string[];
}

/** The referrer's screen, whole. */
export interface ReferrerScreen {
  /** D18: which halves of the gate are outstanding, so the screen can say "add
   *  your ABN" rather than "you are not eligible". */
  referrerGate: { complete: boolean; missing: ("abn" | "bank_details")[] };
  /** null until the gate passes — the code is withheld, never issued inactive. */
  code: string | null;
  /** The code a former member would get back if they rejoin. DISPLAY ONLY.
   *
   *  A former member's `code` is null by definition, so the one screen whose copy
   *  names their code would otherwise have none to name. Never treat this as an
   *  active code — it is a promise about the past, not a shareable link. */
  retainedCode: string | null;
  shareUrl: string | null;
  /** The REFERRED side's ability to type a code. Never gated by D18: becoming a
   *  referrer needs payout details, being referred does not. */
  canEnterCode: boolean;
  referrals: ReferralSummary[];
  earnings: { pending: number; confirmed: number; paid: number };
  earningRows: EarningRow[];
  payout: PayoutState;
  payoutHistory: PayoutRecord[];
  program: ReferralProgramPublic;
}

/** The referred tradie's own panel. Their discount, from their side.
 *
 *  Derived on every read from three records that already exist — the referral, its
 *  expiry, and whether the account has ordered. No stored status to go stale. */
export interface ReferralOffer {
  state: "available" | "used" | "expired";
  /** The referral percentage ALONE. Never summed with anything. */
  referralPercent: number;
  expiresAt: string | null;
  /** The link target for "see that order". Routing on the display number would
   *  couple a URL to a label. */
  usedOrderId?: string | null;
  usedOrderNo?: string | null;
  usedAt?: string | null;
  expiredAt?: string | null;
  referrerName: string;
}

// ── Reading it ───────────────────────────────────────────────────────────────
// The fetch lives here rather than in components, per the house rule that logic
// belongs where it can be tested. Components receive data, never a promise.

async function json<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) throw new Error(path + ": " + response.status);
  return response.json() as Promise<T>;
}

/** The offer as advertised. PUBLIC — the landing page calls this logged out. */
export const getReferralProgram = () =>
  json<{ program: ReferralProgramPublic }>("/api/referral/program").then((r) => r.program);

/** The referrer's whole screen. */
export const getReferrerScreen = () => json<ReferrerScreen>("/api/account/referrals");

/** The referred tradie's own discount panel. null when nobody referred them. */
export const getReferralOffer = () =>
  json<{ offer: ReferralOffer | null }>("/api/account/referral-offer").then((r) => r.offer);

/** Claim a code. Resolves to the API's reason for refusing, or null when it worked.
 *
 *  RETURNS the reason rather than throwing it. Each of the six refusals maps to a
 *  different sentence a tradie reads, and a thrown Error would collapse them into
 *  one "something went wrong" — but "that's your own code" and "a code can only be
 *  added before your first order" are different problems with different fixes. */
export async function claimReferralCode(code: string): Promise<string | null> {
  const response = await fetch("/api/account/referrals/claim", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (response.ok) return null;
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error ?? "invalid_code";
}

/** Join, or change where the money goes. Answers with the gate as it now stands.
 *
 *  Completing these details IS joining, so the response says whether the gate is
 *  now open. Re-fetching to find out would let the screen render a half-joined
 *  moment — a state the model deliberately does not have. */
export async function savePayoutDetails(details: {
  bsb: string; accountNumber: string; accountName: string;
}): Promise<{ referrerGate: ReferrerScreen["referrerGate"]; error?: string }> {
  const response = await fetch("/api/account/payout-details", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(details),
  });
  return response.json();
}

/** Leave — which is to say, remove the account we would pay into.
 *
 *  The refusal carries the amount that caused it, because §5.5's message names
 *  the figure: "$124 is confirmed and hasn't gone out yet." A bare failure would
 *  leave the screen unable to say why, on the one screen where why is the whole
 *  message — the number is what tells someone this resolves itself shortly rather
 *  than being a wall. */
export async function leaveProgram(): Promise<
  { ok: true; referrerGate: ReferrerScreen["referrerGate"] } | { ok: false; error: string; amount: number }
> {
  const response = await fetch("/api/account/payout-details", {
    method: "DELETE",
    credentials: "same-origin",
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (response.ok) return { ok: true, referrerGate: body.referrerGate as ReferrerScreen["referrerGate"] };
  return { ok: false, error: String(body.error ?? "failed"), amount: Number(body.amount ?? 0) };
}
