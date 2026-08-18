// THE trade-verification engine (registration Phase 2, design §6).
//
// Application creation, the auto-pass triple, the duplicate rule, the grant and
// its arithmetic all live behind the functions in this file. Routes are thin
// translators: no route writes a trade fact directly, so a privileged path can
// never quietly become the way around a gate.
//
// Trade-ness is DERIVED, never stored (ADR-0002). The account row holds the live
// facts — abn, company, trade_label, discount_percent — and `trade_application`
// holds every verification fact. "Currently verified" is "has a standing grant
// row", which is why a verified account can also have an application pending
// (E-P2-6) and why an ops edit to `user.abn` can never mint a verified ABN.
import type { Env } from "../types";
import { withinCap, type UserRow } from "./auth";
import { abnValid, normalizeAbn } from "../../src/data/abn";
import { emailDomainPlausible, nameMatches } from "./trade-match";
import { lookupAbn } from "./abr";
import { logEvent } from "./activity";
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

export type TradeQueueReason =
  | "abn_inactive" | "abn_not_found" | "name_mismatch"
  | "email_domain" | "duplicate_abn" | "abr_unavailable";

export type ApplyResult =
  | { ok: true; status: "verified" | "under_review" }
  | {
      ok: false;
      error: "invalid_abn" | "invalid_business_name" | "invalid_label"
           | "forbidden" | "application_pending" | "rate_limited";
    };

export type TradeSource = "trade_page" | "profile" | "submit_gate";

interface ApplicationRow {
  id: string;
  user_id: string;
  abn: string | null;
  business_name: string | null;
  trade_label: string | null;
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

/** POST /api/trade/application, decided.
 *
 *  The order below is spec §4.5's order and it is load-bearing: a field error
 *  costs no ABR call and no rate-limit spend, and the caps are spent before any
 *  ABR call rather than after one. */
export async function applyForTrade(env: Env, user: UserRow, input: {
  abn: unknown; businessName: unknown; label?: unknown;
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

  let label: string | null = null;
  if (input.label !== undefined && input.label !== null && input.label !== "") {
    if (input.label !== "builder" && input.label !== "tradie") return { ok: false, error: "invalid_label" };
    label = input.label;
  }

  // 2. Staff-ness. Checked here AND at approval, so no path can grant an
  //    internal account (AB-P2-11).
  if (user.type !== "customer") return { ok: false, error: "forbidden" };

  // 3. One open application per account (P2-A10 / E-P2-5). The partial unique
  //    index backs this against a race; this read is the polite answer.
  if (await pendingApplication(env, user.id)) return { ok: false, error: "application_pending" };

  // 4. Rate caps, BEFORE any ABR spend (AB-P2-6).
  const perAccount = await withinCap(env, `tradeapp:${user.id}`, MAX_APPLICATIONS_PER_ACCOUNT, RATE_WINDOW_SECONDS);
  const perSource = await withinCap(env, `tradeip:${input.ip}`, MAX_APPLICATIONS_PER_IP, RATE_WINDOW_SECONDS);
  if (!perAccount || !perSource) return { ok: false, error: "rate_limited" };

  // 5. The duplicate rule (D2.1). Only a STANDING grant on another account
  //    counts — revoked, rejected and superseded holders do not (E-P2-8).
  const duplicates = await env.DB.prepare(
    `SELECT user_id FROM trade_application
      WHERE abn = ?1 AND user_id <> ?2
        AND status = 'approved' AND revoked_at IS NULL AND superseded_at IS NULL`,
  ).bind(abn, user.id).all<{ user_id: string }>();
  const duplicateOf = (duplicates.results ?? []).map((r) => r.user_id);

  // 6. The register.
  const lookup = await lookupAbn(env, abn);

  // 7. Evaluate. Criteria the outage made unevaluable are recorded as such
  //    rather than guessed at.
  const abrNames = lookup.outcome === "found" ? [lookup.entityName, ...lookup.businessNames] : [];
  const nameMatch = lookup.outcome === "found" ? nameMatches(businessName, abrNames) : { pass: false, matched: null };
  const emailDomain = emailDomainPlausible(user.email, [businessName, ...abrNames]);

  const reasons: TradeQueueReason[] = [];
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
       (id, user_id, abn, business_name, trade_label, source, status, queue_reasons, abr_snapshot,
        decided_via, decided_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'))`,
  ).bind(
    id, user.id, abn, businessName, label, input.source, status,
    JSON.stringify(reasons), JSON.stringify(snapshot),
    status === "approved" ? "auto" : null,
    status === "approved" ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
  );

  try {
    if (reasons.length === 0) {
      await grant(env, { applicationId: id, applicant: user, abn, businessName, label, insert: insert("approved") });
      await logEvent(env, {
        actor: "system", entityType: "user", entityId: user.id,
        action: "trade.approved", after: { applicationId: id, via: "auto" },
      });
      return { ok: true, status: "verified" };
    }
    await insert("pending").run();
    return { ok: true, status: "under_review" };
  } catch (e) {
    // The partial unique indexes turn a concurrent double-submit into a
    // constraint violation rather than torn state. Answered as the polite
    // refusal the sequential path would have given.
    if (/UNIQUE|constraint/i.test(String(e))) return { ok: false, error: "application_pending" };
    throw e;
  }
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
  label: string | null;
  insert: D1PreparedStatement;
}): Promise<void> {
  const prior = await standingGrant(env, opts.applicant.id);
  const statements: D1PreparedStatement[] = [];
  if (prior) {
    statements.push(env.DB.prepare(
      `UPDATE trade_application SET superseded_at = datetime('now')
        WHERE user_id = ?1 AND id <> ?2
          AND status = 'approved' AND revoked_at IS NULL AND superseded_at IS NULL`,
    ).bind(opts.applicant.id, opts.applicationId));
  }
  statements.push(opts.insert);
  // COALESCE so a gate-originated NULL label never blanks a value the account
  // holder already stated. `type='customer'` on every write, so no path can put
  // a trade fact on an internal row (AC-P2-34).
  statements.push(env.DB.prepare(
    `UPDATE user SET abn = COALESCE(?1, abn), company = COALESCE(?2, company),
        trade_label = COALESCE(?3, trade_label)
      WHERE id = ?4 AND type = 'customer'`,
  ).bind(opts.abn, opts.businessName, opts.label, opts.applicant.id));
  if (!prior) {
    statements.push(env.DB.prepare(
      "UPDATE user SET discount_percent = ?1 WHERE id = ?2 AND type = 'customer'",
    ).bind(TRADE_DISCOUNT_DEFAULT, opts.applicant.id));
  }
  await env.DB.batch(statements);
}
