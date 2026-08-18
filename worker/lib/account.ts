// The SINGLE write path for an account's own contact fields (registration
// Phase 1, design §5.3).
//
// Everything that makes the abuse cases structural rather than filtered lives
// here:
//  - the ALLOWLIST. Keys outside it are never read, so `discountPercent`,
//    `type`, `role`, `referral_code`, `id` and `email` cannot be mass-assigned
//    (AB-10) — there is nothing to strip, because nothing looks at them.
//  - NO SUBJECT ID in the signature. The UPDATE is bound to the session user's
//    id and there is no parameter that could carry someone else's (AB-11).
//  - REFUSAL, not clipping. An over-limit or malformed value is named and
//    rejected; a silently truncated address corrupts a delivery-adjacent fact
//    (AB-13 / E12).
//
// Email is deliberately absent from the allowlist: `user.email` UNIQUE is
// case-sensitive and it is the sign-in identity, so the strongest form of "every
// write path normalises first" is a write path that cannot touch it at all.
import type { Env } from "../types";
import type { UserRow } from "./auth";
import {
  detailsPatchProblems,
  type AccountDetails, type DetailField,
} from "../../src/data/accountDetails";
import { normalizeAbn } from "../../src/data/abn";
import { abnWriteAllowed } from "./trade";

/** A user row in the client-facing key set the validators and the browser speak. */
export function detailsOf(u: UserRow): AccountDetails {
  return {
    name: u.name ?? null,
    phone: u.phone ?? null,
    addressLine1: u.address_line1 ?? null,
    addressLine2: u.address_line2 ?? null,
    addressSuburb: u.address_suburb ?? null,
    addressState: u.address_state ?? null,
    addressPostcode: u.address_postcode ?? null,
  };
}

// The detail fields validated by src/data/accountDetails, plus the three
// pre-existing profile fields, which keep today's semantics exactly.
const DETAIL_KEYS: readonly DetailField[] = [
  "name", "phone", "addressLine1", "addressLine2", "addressSuburb", "addressState", "addressPostcode",
];

export type AccountUpdateResult =
  | { ok: true; user: UserRow }
  | { ok: false; error: "invalid_fields"; fields: DetailField[] }
  /** Registration Phase 2, P2-A4: this account's ABN is verified or under
   *  review, and this path — the payout writer — may not change it. */
  | { ok: false; error: "abn_locked" };

export async function updateAccountDetails(
  env: Env, user: UserRow, body: unknown,
): Promise<AccountUpdateResult> {
  const patch = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const supplied: Partial<Record<DetailField, string>> = {};
  for (const field of DETAIL_KEYS) {
    if (patch[field] !== undefined) supplied[field] = String(patch[field]);
  }
  const fields = detailsPatchProblems(supplied);
  if (fields.length) return { ok: false, error: "invalid_fields", fields };

  const value = (field: DetailField, current: string | null): string | null => {
    if (supplied[field] === undefined) return current;
    const trimmed = supplied[field]!.trim();
    if (!trimmed) return null;
    return field === "addressState" ? trimmed.toUpperCase() : trimmed;
  };

  // Pre-existing fields, unchanged semantics. Their lack of length limits is
  // pre-existing too and out of this phase's changed-field set (Phase 2 owns ABN).
  const company = patch.company !== undefined ? String(patch.company).trim() : user.company;
  const abn = patch.abn !== undefined ? String(patch.abn).trim() : user.abn;
  // P2-A4: this is the PAYOUT writer of user.abn, and it grants nothing. Once
  // the verification flow has written an ABN — or is in the middle of checking
  // one — this path may no longer change it. Asked of the engine rather than
  // answered here, so "what counts as verified" keeps exactly one definition.
  if (patch.abn !== undefined && !(await abnWriteAllowed(env, user, normalizeAbn(abn)))) {
    return { ok: false, error: "abn_locked" };
  }
  // Only 'ex' opts out; anything else (incl. unset/invalid) means inclusive.
  const priceGstMode = patch.priceGstMode !== undefined
    ? (String(patch.priceGstMode) === "ex" ? "ex" : "inc")
    : user.price_gst_mode;

  await env.DB.prepare(
    `UPDATE user SET name = ?, phone = ?, company = ?, abn = ?, price_gst_mode = ?,
        address_line1 = ?, address_line2 = ?, address_suburb = ?, address_state = ?, address_postcode = ?
      WHERE id = ?`,
  ).bind(
    value("name", user.name), value("phone", user.phone),
    company || null, abn || null, priceGstMode || null,
    value("addressLine1", user.address_line1), value("addressLine2", user.address_line2),
    value("addressSuburb", user.address_suburb), value("addressState", user.address_state),
    value("addressPostcode", user.address_postcode),
    user.id,
  ).run();

  const fresh = (await env.DB.prepare("SELECT * FROM user WHERE id = ?").bind(user.id).first<UserRow>())!;
  return { ok: true, user: fresh };
}

