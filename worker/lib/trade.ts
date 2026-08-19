// THE trade-verification engine (registration Phase 2, design §6).
//
// Application creation, the auto-pass triple, the duplicate rule, the grant and
// its arithmetic all live behind the functions in this file. Routes are thin
// translators: no route writes a trade fact directly, so a privileged path can
// never quietly become the way around a gate.
//
// Trade-ness is DERIVED, never stored (ADR-0002). The account row holds the live
// facts — abn, company, discount_percent — and `trade_application`
// holds every verification fact. "Currently verified" is "has a standing grant
// row", which is why a verified account can also have an application pending
// (E-P2-6) and why an ops edit to `user.abn` can never mint a verified ABN.
import type { Env } from "../types";
import { withinCap, type UserRow } from "./auth";
import { abnValid, normalizeAbn } from "../../src/data/abn";
import { emailDomainPlausible, nameMatches } from "./trade-match";
import { lookupAbn } from "./abr";
import { logEvent } from "./activity";
import { notify } from "./email";
import { uuid } from "./util";

/** The business-account default rate — THE one named place in the code.
 *
 *  Migration 0032's column DEFAULT of 5 is dead weight kept deliberately (moving
 *  it means rebuilding `user`), and 0054's grandfather literal is asserted equal
 *  to this constant by the trade-verification suite (AC-P2-28/51). */
export const TRADE_DISCOUNT_DEFAULT = 5;

/** ASSUMED: P2-ARCH-1 — technical values, tunable. Both are spent BEFORE any
 *  ABR call, so the endpoint cannot become a free ABN-checking oracle however
 *  the caller pays for it (AB-P2-6). */
const MAX_APPLICATIONS_PER_ACCOUNT = 5;
const MAX_APPLICATIONS_PER_IP = 20;
const RATE_WINDOW_SECONDS = 3600;

/** ASSUMED: P2-ARCH-4 — 200 matches the ops PATCH `company` cap. */
const MAX_BUSINESS_NAME = 200;
/** A raw ABN longer than this is not a typo, it is a payload (AB-P2-13). */
const MAX_RAW_ABN = 32;

/** The four outcome emails (spec §7).
 *
 *  THE KEY MUST NOT CONTAIN A DOT. Templates are fetched from the PUBLIC Sanity
 *  dataset by `_id`, and anonymous reads only see dot-free ids — a key like
 *  `trade.approved` would resolve to nothing, forever, silently, and the
 *  fallback would send while the authored copy sat there dead. The EVENT name
 *  is a different string with a different consumer and keeps the house's dotted
 *  namespacing.
 *
 *  `body` is a function because notify() only runs applyPlaceholders when a
 *  Sanity template EXISTS: the inline fallback has to arrive already rendered,
 *  or a customer receives a literal [business]. */
export const TRADE_EMAILS = {
  trade_ack: {
    eventType: "trade.application.queued",
    subject: "We're checking your trade account details",
    body: (vars: { business?: string | null }) =>
      `Thanks — we've got your ABN and business details for ${vars.business || "your business"}. `
      + "We're checking them and we'll be in touch. Your account works as normal in the meantime.",
  },
  trade_approved: {
    eventType: "trade.application.approved",
    subject: "Your trade account is active",
    body: (_vars: { business?: string | null }) =>
      "Your trade account is active.\n\n"
      + "Trade pricing applies from now on — when you're signed in, the prices you see are "
      + "already your prices.\n\n"
      + "Anything already with us for review will be priced by our team.",
  },
  trade_rejected: {
    eventType: "trade.application.rejected",
    subject: "About your trade account application",
    body: (_vars: { business?: string | null }) =>
      "We weren't able to set up a trade account from the details you sent. Your account still "
      + "works exactly as before — you can price jobs, submit them and track them — and you're "
      + "welcome to apply again with updated details, or reply to this email and we'll help.",
  },
  trade_revoked: {
    eventType: "trade.revoked",
    subject: "A change to your trade account",
    body: (_vars: { business?: string | null }) =>
      "Trade pricing no longer applies to your account, so the prices you see from now on are our "
      + "standard prices. If you think that's a mistake, reply to this email and we'll sort it out.",
  },
};

export type TradeEmailKey = keyof typeof TRADE_EMAILS;

/** Send one outcome email through the existing notify() path.
 *
 *  A send failure never fails the decision: notify records the notification row
 *  as `failed` and the grant is already committed. An email that did not go out
 *  is a thing to chase, not a reason to un-verify somebody. */
async function sendTradeEmail(
  env: Env, key: TradeEmailKey, recipient: string,
  vars: { business?: string | null },
): Promise<void> {
  const template = TRADE_EMAILS[key];
  await notify(env, {
    recipient,
    eventType: template.eventType,
    templateKey: key,
    // `business` is the ONLY variable, and it is passed only where a business
    // name is guaranteed. There is deliberately no `name`: applyPlaceholders
    // collapses a provided null to "", and an account whose holder never typed
    // a name would have been greeted "Hi ," (owner ruling, 2026-08-19).
    vars: { business: vars.business ?? "" },
    email: { to: recipient, subject: template.subject, text: template.body(vars), templateKey: key },
  });
}

export type TradeQueueReason =
  | "abn_inactive" | "abn_not_found" | "name_mismatch"
  | "email_domain" | "duplicate_abn" | "abr_unavailable"
  /** This account held trade pricing and a person took it away. Re-applying is
   *  allowed; doing so unseen is not (security review SEC-2). */
  | "previously_revoked";

export type ApplyResult =
  | { ok: true; status: "verified" | "under_review" }
  | {
      ok: false;
      error: "invalid_abn" | "invalid_business_name"
           | "forbidden" | "application_pending" | "rate_limited";
    };

export type TradeSource = "trade_page" | "profile" | "submit_gate";

interface ApplicationRow {
  id: string;
  user_id: string;
  abn: string | null;
  business_name: string | null;
  status: string;
  decided_via: string | null;
  decided_at: string | null;
  created_at: string | null;
}

/** The application whose approval currently makes this account verified. */
export function standingGrant(env: Env, userId: string) {
  return env.DB.prepare(
    `SELECT * FROM trade_application
      WHERE user_id = ? AND status = 'approved' AND revoked_at IS NULL AND superseded_at IS NULL
      LIMIT 1`,
  ).bind(userId).first<ApplicationRow>();
}

const pendingApplication = (env: Env, userId: string) =>
  env.DB.prepare("SELECT * FROM trade_application WHERE user_id = ? AND status = 'pending' LIMIT 1")
    .bind(userId).first<ApplicationRow>();

/** What the account holder is allowed to know about their own trade-ness.
 *
 *  DERIVED on every read — never stored, never cached, never in a session
 *  (ADR-0002). `verified` and `pending` can be true together: a verified account
 *  re-applying with a new ABN is both, which is precisely why no single status
 *  column could ever have expressed this (E-P2-6).
 *
 *  Note what is NOT here: `discount_percent`, the queue reasons, the ABR
 *  snapshot, and any hint that another account holds this ABN. This struct is
 *  served to the customer, and P2-A7 is the reason each of those is absent
 *  rather than filtered. */
export interface TradeState {
  verified: boolean;
  verifiedSince: string | null;
  provenance: "auto" | "ops" | "grandfathered" | null;
  abn: string | null;
  pending: { abn: string; businessName: string; createdAt: string } | null;
  /** Outline only — date and outcome (AC-P2-13). No reason, no actor, no ABN. */
  history: { at: string; outcome: "approved" | "rejected" | "revoked" }[];
}

export async function tradeStateOf(env: Env, user: UserRow): Promise<TradeState> {
  const [standing, pending, decided] = await Promise.all([
    standingGrant(env, user.id),
    pendingApplication(env, user.id),
    env.DB.prepare(
      `SELECT status, decided_at, revoked_at, created_at FROM trade_application
        WHERE user_id = ? AND status <> 'pending' ORDER BY created_at`,
    ).bind(user.id).all<{ status: string; decided_at: string | null; revoked_at: string | null; created_at: string | null }>(),
  ]);

  const history: TradeState["history"] = [];
  for (const row of decided.results ?? []) {
    const at = row.decided_at ?? row.created_at ?? "";
    if (row.status === "approved") history.push({ at, outcome: "approved" });
    if (row.status === "rejected") history.push({ at, outcome: "rejected" });
    // An approved-then-revoked application is TWO events, so the timeline reads
    // in true order rather than collapsing a reversal into its cause.
    if (row.revoked_at) history.push({ at: row.revoked_at, outcome: "revoked" });
  }
  history.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  const via = standing?.decided_via;
  return {
    verified: !!standing,
    verifiedSince: standing?.decided_at ?? null,
    provenance: via === "auto" || via === "ops" || via === "grandfathered" ? via : null,
    abn: user.abn ?? null,
    pending: pending
      ? { abn: pending.abn ?? "", businessName: pending.business_name ?? "", createdAt: pending.created_at ?? "" }
      : null,
    history,
  };
}

/** One row of the ops review queue — a staff surface, never customer-served. */
export interface OpsTradeApplication {
  id: string;
  applicant: { id: string; name: string | null; email: string };
  abn: string | null;
  businessName: string | null;
  source: string;
  queueReasons: string[];
  abrSnapshot: unknown;
  createdAt: string | null;
  /** Any account CURRENTLY verified on the same ABN, resolved live rather than
   *  frozen: D2.1 lets a human knowingly allow two holders, and they cannot
   *  decide that blind — nor should they see a holder whose grant has since
   *  ended (AC-P2-36). Ops-only; a customer never learns any of this. */
  duplicateHolders: { id: string; name: string | null; email: string }[];
}

/** Applications awaiting a decision — PENDING ONLY (AC-P2-35).
 *
 *  Everything a human needs in order to decide is here, so that deciding is not
 *  a research task: the frozen ABR evidence and every reason it queued. */
export async function pendingApplications(env: Env): Promise<OpsTradeApplication[]> {
  const rows = await env.DB.prepare(
    `SELECT t.id, t.user_id, t.abn, t.business_name, t.source,
            t.queue_reasons, t.abr_snapshot, t.created_at,
            u.name AS applicant_name, u.email AS applicant_email
       FROM trade_application t JOIN user u ON u.id = t.user_id
      WHERE t.status = 'pending'
      ORDER BY t.created_at`,
  ).all<{
    id: string; user_id: string; abn: string | null; business_name: string | null;
    source: string; queue_reasons: string | null;
    abr_snapshot: string | null; created_at: string | null;
    applicant_name: string | null; applicant_email: string;
  }>();

  const parse = <T>(raw: string | null, fallback: T): T => {
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  };

  const pending = rows.results ?? [];

  // Resolved live in ONE query for the whole queue rather than per row: the
  // snapshot's duplicateOf is what was true at lookup time, and a holder
  // revoked since then must stop being shown as one.
  const abns = [...new Set(pending.map((r) => r.abn).filter((a): a is string => !!a))];
  const holders = new Map<string, { id: string; name: string | null; email: string }[]>();
  if (abns.length) {
    const placeholders = abns.map(() => "?").join(",");
    const found = await env.DB.prepare(
      `SELECT t.abn, u.id, u.name, u.email
         FROM trade_application t JOIN user u ON u.id = t.user_id
        WHERE t.abn IN (${placeholders})
          AND t.status = 'approved' AND t.revoked_at IS NULL AND t.superseded_at IS NULL`,
    ).bind(...abns).all<{ abn: string; id: string; name: string | null; email: string }>();
    for (const row of found.results ?? []) {
      const list = holders.get(row.abn) ?? [];
      list.push({ id: row.id, name: row.name, email: row.email });
      holders.set(row.abn, list);
    }
  }

  return pending.map((row) => ({
    id: row.id,
    applicant: { id: row.user_id, name: row.applicant_name, email: row.applicant_email },
    abn: row.abn,
    businessName: row.business_name,
    source: row.source,
    queueReasons: parse<string[]>(row.queue_reasons, []),
    abrSnapshot: parse<unknown>(row.abr_snapshot, null),
    createdAt: row.created_at,
    duplicateHolders: (row.abn ? holders.get(row.abn) ?? [] : []).filter((h) => h.id !== row.user_id),
  }));
}

/** One line of a customer's verification history, for the ops record. */
export interface OpsTradeHistoryEntry {
  at: string;
  abn: string | null;
  businessName: string | null;
  outcome: "approved" | "rejected" | "pending" | "revoked";
  reasons: string[];
  decidedVia: string | null;
  decidedBy: { id: string; name: string | null } | null;
  decisionReason: string | null;
}

/** Every application this account has ever made, in the order things happened.
 *
 *  An approved-then-revoked application yields TWO entries, because the timeline
 *  should say what happened rather than only how it ended. Grandfathered rows
 *  read `decidedVia: "grandfathered"`, and a NULL abn stays NULL — the record
 *  says "no ABN on file" rather than inventing one (AC-P2-40 / E-P2-9). */
export async function applicationHistory(env: Env, customerId: string): Promise<OpsTradeHistoryEntry[]> {
  const rows = await env.DB.prepare(
    `SELECT t.abn, t.business_name, t.status, t.queue_reasons, t.decided_via, t.decided_by,
            t.decided_at, t.decision_reason, t.revoked_at, t.revoked_by, t.revoke_reason, t.created_at,
            d.name AS decided_by_name, r.name AS revoked_by_name
       FROM trade_application t
       LEFT JOIN user d ON d.id = t.decided_by
       LEFT JOIN user r ON r.id = t.revoked_by
      WHERE t.user_id = ?
      ORDER BY t.created_at, t.rowid`,
  ).bind(customerId).all<Record<string, string | null>>();

  const entries: OpsTradeHistoryEntry[] = [];
  for (const row of rows.results ?? []) {
    let reasons: string[] = [];
    try { reasons = row.queue_reasons ? JSON.parse(row.queue_reasons) as string[] : []; } catch { reasons = []; }
    entries.push({
      at: row.decided_at ?? row.created_at ?? "",
      abn: row.abn,
      businessName: row.business_name,
      outcome: row.status === "approved" ? "approved" : row.status === "rejected" ? "rejected" : "pending",
      reasons,
      decidedVia: row.decided_via,
      decidedBy: row.decided_by ? { id: row.decided_by, name: row.decided_by_name } : null,
      decisionReason: row.decision_reason,
    });
    if (row.revoked_at) {
      entries.push({
        at: row.revoked_at,
        abn: row.abn,
        businessName: row.business_name,
        outcome: "revoked",
        reasons: [],
        decidedVia: "ops",
        decidedBy: row.revoked_by ? { id: row.revoked_by, name: row.revoked_by_name } : null,
        decisionReason: row.revoke_reason,
      });
    }
  }
  return entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** The P2-A4 lock: may this profile/payout write set `user.abn` to these digits?
 *
 *  Two paths write `user.abn` and they have different powers (spec §4.7). The
 *  verification flow writes it AND grants; the profile / referral payout form
 *  writes it for payout purposes and grants nothing. This is the one rule that
 *  keeps the second from undoing the first: an approved trade ABN can never be
 *  swapped out through the payout form (AB-P2-12).
 *
 *  EQUAL DIGITS ALWAYS PASS. A verified tradie joining the referral program with
 *  their own pre-filled ABN is the common case, and refusing it would be a bug
 *  wearing a security badge (E-P2-19).
 *
 *  A PENDING application is compared against its own frozen ABN rather than
 *  against `user.abn`, because a pending application has not written that column
 *  and there would be nothing to compare with. */
export async function abnWriteAllowed(env: Env, user: UserRow, digits: string): Promise<boolean> {
  const standing = await standingGrant(env, user.id);
  if (standing) return digits === normalizeAbn(user.abn);
  const pending = await pendingApplication(env, user.id);
  if (pending) return digits === normalizeAbn(pending.abn);
  // A private account may still make itself payable here — today's behaviour,
  // unchanged (owner ruling Q7).
  return true;
}

/** POST /api/trade/application, decided.
 *
 *  The order below is spec §4.5's order and it is load-bearing: a field error
 *  costs no ABR call and no rate-limit spend, and the caps are spent before any
 *  ABR call rather than after one. */
export async function applyForTrade(env: Env, user: UserRow, input: {
  abn: unknown; businessName: unknown;
  source: TradeSource; ip: string;
}): Promise<ApplyResult> {
  // 1. Format and checksum. This is a FIELD ERROR, exactly like a malformed
  //    phone — no row, no ABR call, no rate-limit spend, nothing to reject
  //    because nothing was created yet (AC-P2-7).
  const rawAbn = typeof input.abn === "string" || typeof input.abn === "number" ? String(input.abn) : "";
  if (!rawAbn || rawAbn.length > MAX_RAW_ABN) return { ok: false, error: "invalid_abn" };
  const abn = normalizeAbn(rawAbn);
  if (!abnValid(abn)) return { ok: false, error: "invalid_abn" };

  const rawName = typeof input.businessName === "string" ? input.businessName : "";
  const businessName = rawName.trim();
  if (!businessName || businessName.length > MAX_BUSINESS_NAME) return { ok: false, error: "invalid_business_name" };

  // 2. Staff-ness. Checked here AND at approval, so no path can grant an
  //    internal account (AB-P2-11).
  if (user.type !== "customer") return { ok: false, error: "forbidden" };

  // 3. ALREADY GRANTED ON THIS EXACT ABN — nothing to decide (N-2).
  //
  //    This is not a new application, it is the same fact arriving twice: a
  //    double-click, a retried request, a second tab. Deciding it again would
  //    write a second approval row and a second audit event, and would re-send
  //    "your trade account is active" for something that has not changed.
  //
  //    The partial unique index already guarantees only ONE standing grant
  //    survives, so nothing was ever commercially wrong — the damage was purely
  //    that the customer heard about it twice and the ledger recorded a decision
  //    nobody made. Answered as the truth: the account is verified.
  const standing = await standingGrant(env, user.id);
  if (standing && normalizeAbn(standing.abn) === abn) return { ok: true, status: "verified" };

  // 4. One open application per account (P2-A10 / E-P2-5). The partial unique
  //    index backs this against a race; this read is the polite answer.
  if (await pendingApplication(env, user.id)) return { ok: false, error: "application_pending" };

  // 5. Rate caps, BEFORE any ABR spend (AB-P2-6).
  const perAccount = await withinCap(env, `tradeapp:${user.id}`, MAX_APPLICATIONS_PER_ACCOUNT, RATE_WINDOW_SECONDS);
  const perSource = await withinCap(env, `tradeip:${input.ip}`, MAX_APPLICATIONS_PER_IP, RATE_WINDOW_SECONDS);
  if (!perAccount || !perSource) return { ok: false, error: "rate_limited" };

  // 6. The duplicate rule (D2.1). Only a STANDING grant on another account
  //    counts — revoked, rejected and superseded holders do not (E-P2-8).
  const revokedBefore = await env.DB.prepare(
    `SELECT 1 AS hit FROM trade_application
      WHERE user_id = ?1 AND status = 'approved' AND revoked_at IS NOT NULL LIMIT 1`,
  ).bind(user.id).first<{ hit: number }>();
  const everRevoked = !!revokedBefore;

  const duplicates = await env.DB.prepare(
    `SELECT user_id FROM trade_application
      WHERE abn = ?1 AND user_id <> ?2
        AND status = 'approved' AND revoked_at IS NULL AND superseded_at IS NULL`,
  ).bind(abn, user.id).all<{ user_id: string }>();
  const duplicateOf = (duplicates.results ?? []).map((r) => r.user_id);

  // 7. The register.
  const lookup = await lookupAbn(env, abn);

  // 8. Evaluate. Criteria the outage made unevaluable are recorded as such
  //    rather than guessed at.
  const abrNames = lookup.outcome === "found" ? [lookup.entityName, ...lookup.businessNames] : [];
  const nameMatch = lookup.outcome === "found" ? nameMatches(businessName, abrNames) : { pass: false, matched: null };
  // CRITERION 3 IS JUDGED ON THE REGISTER'S NAMES ONLY — never on the submitted
  // one (security review SEC-1, HIGH).
  //
  // The submitted name is the CLAIM UNDER TEST. Including it here made the claim
  // its own evidence: an applicant put their own domain word inside the business
  // name they typed and satisfied the domain check themselves. Criterion 2 did
  // not stop it either, because containment passes when the ABR name is the
  // smaller set, so padding was free there too. The ABN and the registered name
  // are public facts, and the duplicate rule only fires for a business already
  // verified here — so one request granted trade pricing on a stranger's ABN,
  // and because it auto-passed no pending row existed for ops to see.
  //
  // A legitimate applicant loses nothing: criterion 2 already requires the
  // submitted name to resemble a register name, so a real business's domain is
  // compared against a string it genuinely matches.
  const emailDomain = emailDomainPlausible(user.email, abrNames);

  const reasons: TradeQueueReason[] = [];
  // A REVOCATION IS NOT SELF-REVERSIBLE (security review SEC-2).
  //
  // `revokeTrade` clears the grant and the rate, but nothing here used to
  // consult `revoked_at` for THIS account — so replaying the original request
  // auto-passed again and put the rate straight back, unseen. One-action revoke
  // is the compensating control for the auto-pass residual (AB-P2-9), and a
  // control the subject can undo by resending their last request is not one.
  //
  // Account-wide rather than per-ABN, because that is what "revoked" means to
  // the person who clicked it. This is a QUEUE REASON, not a refusal: the
  // account may still apply, and a genuine mistake is still recoverable — it
  // simply cannot happen without a human seeing it (AC-P2-13 keeps
  // re-application after a REJECTION untouched and automatic).
  if (everRevoked) reasons.push("previously_revoked");
  if (lookup.outcome === "unavailable") reasons.push("abr_unavailable");
  else if (lookup.outcome === "not_found") reasons.push("abn_not_found");
  else if (!lookup.abnActive) reasons.push("abn_inactive");
  if (lookup.outcome === "found" && !nameMatch.pass) reasons.push("name_mismatch");
  if (!emailDomain.pass) reasons.push("email_domain");
  if (duplicateOf.length) reasons.push("duplicate_abn");

  // The frozen evidence (AC-P2-26, E-P2-11). Written once, never updated: a
  // later email change must not rewrite the basis of a past decision, which is
  // why the evaluated email is copied in here rather than read back later.
  const snapshot = {
    queriedAt: lookup.queriedAt,
    outcome: lookup.outcome,
    abnStatusEffectiveFrom: lookup.outcome === "found" ? lookup.abnStatusEffectiveFrom : null,
    entityName: lookup.outcome === "found" ? lookup.entityName : null,
    entityTypeName: lookup.outcome === "found" ? lookup.entityTypeName : null,
    businessNames: lookup.outcome === "found" ? lookup.businessNames : [],
    evaluated: {
      email: user.email,
      abnActive: lookup.outcome === "found" ? lookup.abnActive : null,
      nameMatch: lookup.outcome === "found" ? nameMatch : null,
      emailDomain,
      duplicateOf,
    },
  };

  const id = uuid();
  const insert = (status: "approved" | "pending") => env.DB.prepare(
    `INSERT INTO trade_application
       (id, user_id, abn, business_name, source, status, queue_reasons, abr_snapshot,
        decided_via, decided_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))`,
  ).bind(
    id, user.id, abn, businessName, input.source, status,
    JSON.stringify(reasons), JSON.stringify(snapshot),
    status === "approved" ? "auto" : null,
    status === "approved" ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
  );

  try {
    if (reasons.length === 0) {
      await grant(env, {
        applicationId: id, applicant: user, abn, businessName,
        insert: insert("approved"), mode: "create",
      });
      await logEvent(env, {
        actor: "system", entityType: "user", entityId: user.id,
        action: "trade.approved", after: { applicationId: id, via: "auto" },
      });
      // An auto-pass is told it is active and nothing else: the applicant was
      // never under review, so acknowledging a review would be a small lie.
      await sendTradeEmail(env, "trade_approved", user.email, { business: businessName });
      return { ok: true, status: "verified" };
    }
    await insert("pending").run();
    await sendTradeEmail(env, "trade_ack", user.email, { business: businessName });
    return { ok: true, status: "under_review" };
  } catch (e) {
    // The partial unique indexes turn a concurrent double-submit into a
    // constraint violation rather than torn state. Answered as the polite
    // refusal the sequential path would have given.
    if (/UNIQUE|constraint/i.test(String(e))) return { ok: false, error: "application_pending" };
    throw e;
  }
}

/** Ops approves a queued application (AC-P2-37).
 *
 *  The claim is a GUARDED UPDATE, not a read-then-write: `AND status='pending'`
 *  in the WHERE clause is the authorization of the state transition itself, so
 *  two staff members clicking approve at the same moment produce exactly one
 *  decision and one grant. `changes = 0` means somebody already decided it.
 *
 *  NOBODY APPROVES THEIR OWN APPLICATION. Structurally impossible today —
 *  applicants are customers, deciders are internal, and an internal account is
 *  refused at both ends — but the check is one line and survives any future
 *  loosening of either fact. */
export async function approveApplication(
  env: Env, applicationId: string, actor: UserRow, note?: string,
): Promise<{ ok: true } | { ok: false; error: "not_found" | "already_decided" | "forbidden" }> {
  const application = await env.DB.prepare("SELECT * FROM trade_application WHERE id = ?")
    .bind(applicationId).first<ApplicationRow & { business_name: string | null }>();
  if (!application) return { ok: false, error: "not_found" };
  if (application.status !== "pending") return { ok: false, error: "already_decided" };
  if (application.user_id === actor.id) return { ok: false, error: "forbidden" };

  const applicant = await env.DB.prepare("SELECT * FROM user WHERE id = ?")
    .bind(application.user_id).first<UserRow>();
  // AB-P2-11, the second of two independent checks: staff-ness is its own axis
  // and no path may put a customer discount on an internal account.
  if (!applicant || applicant.type !== "customer") return { ok: false, error: "forbidden" };

  const claim = env.DB.prepare(
    `UPDATE trade_application
        SET status = 'approved', decided_via = 'ops', decided_by = ?1,
            decided_at = datetime('now'), decision_reason = ?2
      WHERE id = ?3 AND status = 'pending'`,
  ).bind(actor.id, note?.trim() || null, applicationId);

  const changes = await grant(env, {
    applicationId, applicant,
    abn: application.abn, businessName: application.business_name,
    insert: claim, mode: "claim",
  });
  if (!changes) return { ok: false, error: "already_decided" };

  await logEvent(env, {
    actor: actor.id, entityType: "user", entityId: applicant.id,
    action: "trade.approved", after: { applicationId, via: "ops" },
  });
  await sendTradeEmail(env, "trade_approved", applicant.email, { business: application.business_name });
  return { ok: true };
}

/** Ops rejects a queued application (AC-P2-38).
 *
 *  The mirror of approve in shape and NOT in effect: a rejection touches no
 *  `user` row at all. It does not change the rate, it does not clear the stored
 *  ABN, and — P2-A11 — it does not revoke an existing verification. A verified
 *  account whose NEW application is rejected stays verified until somebody
 *  explicitly revokes it, which is a different act with a different button. */
export async function rejectApplication(
  env: Env, applicationId: string, actor: UserRow, reason: string,
): Promise<{ ok: true } | { ok: false; error: "not_found" | "already_decided" | "invalid_reason" }> {
  const trimmed = String(reason ?? "").trim();
  // Required, and checked before anything is read: a rejection someone has to
  // guess at is not a decision.
  if (!trimmed) return { ok: false, error: "invalid_reason" };

  const application = await env.DB.prepare("SELECT * FROM trade_application WHERE id = ?")
    .bind(applicationId).first<ApplicationRow>();
  if (!application) return { ok: false, error: "not_found" };
  if (application.status !== "pending") return { ok: false, error: "already_decided" };

  const claim = await env.DB.prepare(
    `UPDATE trade_application
        SET status = 'rejected', decided_via = 'ops', decided_by = ?1,
            decided_at = datetime('now'), decision_reason = ?2
      WHERE id = ?3 AND status = 'pending'`,
  ).bind(actor.id, trimmed, applicationId).run();
  if (Number(claim.meta?.changes ?? 0) === 0) return { ok: false, error: "already_decided" };

  await logEvent(env, {
    actor: actor.id, entityType: "user", entityId: application.user_id,
    action: "trade.rejected", after: { applicationId },
  });
  // The REASON never travels to the customer. A duplicate rejection must not
  // disclose that somebody else holds that ABN (AC-P2-44), and one general body
  // is what keeps that true without a per-reason branch to get wrong.
  const applicant = await env.DB.prepare("SELECT email FROM user WHERE id = ?")
    .bind(application.user_id).first<{ email: string }>();
  if (applicant) await sendTradeEmail(env, "trade_rejected", applicant.email, {});
  return { ok: true };
}

/** Ops revokes an account's trade status (AC-P2-30).
 *
 *  Acts on the ACCOUNT, not on an application id: "stop this customer paying
 *  trade prices" is the thing a person means, and making them find the right
 *  application first would be an invitation to revoke the wrong one.
 *
 *  The ABN and business name stay on the account. Verified-ness is derived from
 *  the standing grant, so ending the grant is the whole of the revocation — the
 *  account simply carries on as a private one. And because pricing reads
 *  `discount_percent` per request, the customer's very next preview is retail
 *  with nothing to invalidate: no session, no token, no cached flag (AB-P2-15). */
export async function revokeTrade(
  env: Env, customerId: string, actor: UserRow, reason: string,
): Promise<{ ok: true } | { ok: false; error: "not_found" | "not_verified" | "invalid_reason" }> {
  const trimmed = String(reason ?? "").trim();
  if (!trimmed) return { ok: false, error: "invalid_reason" };

  const customer = await env.DB.prepare("SELECT * FROM user WHERE id = ?").bind(customerId).first<UserRow>();
  if (!customer || customer.type !== "customer") return { ok: false, error: "not_found" };

  const claim = await env.DB.prepare(
    `UPDATE trade_application
        SET revoked_at = datetime('now'), revoked_by = ?1, revoke_reason = ?2
      WHERE user_id = ?3 AND status = 'approved' AND revoked_at IS NULL AND superseded_at IS NULL`,
  ).bind(actor.id, trimmed, customerId).run();
  if (Number(claim.meta?.changes ?? 0) === 0) return { ok: false, error: "not_verified" };

  await env.DB.prepare("UPDATE user SET discount_percent = 0 WHERE id = ?").bind(customerId).run();
  await logEvent(env, {
    actor: actor.id, entityType: "user", entityId: customerId,
    action: "trade.revoked", after: { reason: trimmed },
  });
  // Owner ruling Q1: they are told. Their prices are about to change, and a
  // silent revocation reads as a bug.
  await sendTradeEmail(env, "trade_revoked", customer.email, {});
  return { ok: true };
}

/** The grant, in one atomic batch — the only writer of trade facts onto `user`.
 *
 *  `insert` is the statement that creates or claims the approving application,
 *  so the supersede-then-approve pair cannot leave two standing grants even for
 *  an instant (the partial unique index would refuse the second anyway).
 *
 *  THE RATE RULE, stated once: `discount_percent` is written ONLY on a
 *  not-verified → verified transition. A re-verification, or an approval on an
 *  account ops has already negotiated a rate for, leaves it alone (AC-P2-29,
 *  P2-A5). */
async function grant(env: Env, opts: {
  applicationId: string;
  applicant: UserRow;
  abn: string | null;
  businessName: string | null;
  insert: D1PreparedStatement;
  /** What `insert` actually DOES, and the supersede guard depends on it.
   *
   *  `"claim"` — ops approving: the row already exists as `pending` and the
   *  statement flips it to approved.
   *  `"create"` — an auto-pass: the row does not exist yet and the statement
   *  INSERTs it, already approved, inside this same batch.
   *
   *  This was the F-0 bug. The guard below asked whether the application was
   *  `pending`, which is only ever true for a claim — so on every auto-pass by
   *  an already-verified account the prior grant was silently not superseded,
   *  the new approved row collided with `trade_application_one_standing`, and
   *  the constraint error surfaced to the customer as `application_pending`
   *  while `/api/auth/me` reported no pending application at all. */
  mode: "claim" | "create";
}): Promise<number> {
  const prior = await standingGrant(env, opts.applicant.id);
  const statements: D1PreparedStatement[] = [];
  let claimIndex = 0;
  if (prior) {
    // The subquery is what makes a lost race harmless. Without it, two staff
    // members approving a re-application at the same instant would have the
    // loser supersede the winner's brand-new grant and leave the account
    // unverified — the one ordering in this batch that is not idempotent.
    //
    // The condition has to describe the state THIS application is in before the
    // batch claims or creates it, and those differ: a claim expects a pending
    // row, a create expects no row at all. Asking only the first question is
    // what made every auto-pass re-application fail (F-0).
    const stillOurs = opts.mode === "claim"
      ? "EXISTS (SELECT 1 FROM trade_application WHERE id = ?2 AND status = 'pending')"
      : "NOT EXISTS (SELECT 1 FROM trade_application WHERE id = ?2)";
    statements.push(env.DB.prepare(
      `UPDATE trade_application SET superseded_at = datetime('now')
        WHERE user_id = ?1 AND id <> ?2
          AND status = 'approved' AND revoked_at IS NULL AND superseded_at IS NULL
          AND ${stillOurs}`,
    ).bind(opts.applicant.id, opts.applicationId));
    claimIndex = 1;
  }
  statements.push(opts.insert);
  // COALESCE so a NULL never blanks a value the account already holds.
  // `type='customer'` on every write, so no path can put a trade fact on an
  // internal row (AC-P2-34).
  statements.push(env.DB.prepare(
    `UPDATE user SET abn = COALESCE(?1, abn), company = COALESCE(?2, company)
      WHERE id = ?3 AND type = 'customer'`,
  ).bind(opts.abn, opts.businessName, opts.applicant.id));
  if (!prior) {
    statements.push(env.DB.prepare(
      "UPDATE user SET discount_percent = ?1 WHERE id = ?2 AND type = 'customer'",
    ).bind(TRADE_DISCOUNT_DEFAULT, opts.applicant.id));
  }
  const results = await env.DB.batch(statements);
  // How many rows the CLAIM touched. Zero means somebody else decided this
  // application between the read above and this batch (AB-P2-14).
  return Number(results[claimIndex]?.meta?.changes ?? 0);
}
