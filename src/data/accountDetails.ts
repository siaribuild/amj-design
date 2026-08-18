// Account contact details — the one place that answers "is this enough to
// submit?" and "is this patch storable?" (registration Phase 1, design §4.2).
//
// Pure module, no imports beyond ./phone, so the Worker and the browser run the
// identical code. The Worker is the authority; the client's use is advisory
// gating only, which is why there is one implementation rather than two that
// agree today.
import { isValidAuPhone } from "./phone";

export const AU_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"] as const;
export type AuState = (typeof AU_STATES)[number];

// Stated maxima (E12 / AB-13). Nothing unbounded reaches D1: an over-limit value
// is refused by name, never silently clipped — a truncated address corrupts a
// delivery-adjacent fact.
export const DETAIL_LIMITS = {
  name: 120,
  phone: 40,
  addressLine1: 120,
  addressLine2: 120,
  addressSuburb: 80,
  addressState: 3,
  addressPostcode: 4,
} as const;

export interface AccountDetails {
  name: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressSuburb: string | null;
  addressState: string | null;
  addressPostcode: string | null;
}

export type DetailField = keyof AccountDetails;

export const DETAIL_FIELDS: readonly DetailField[] = [
  "name", "phone", "addressLine1", "addressLine2", "addressSuburb", "addressState", "addressPostcode",
];

const trimmed = (v: string | null | undefined) => String(v ?? "").trim();

/** Field-level problems in a PATCH: over-limit, invalid phone, bad state or
 *  postcode. Empty values are NOT problems here — clearing a field is legal at
 *  the profile layer; what blocks submission is `submitMissing`. */
export function detailsPatchProblems(patch: Partial<Record<DetailField, string>>): DetailField[] {
  const problems: DetailField[] = [];
  for (const field of DETAIL_FIELDS) {
    const raw = patch[field];
    if (raw === undefined) continue;
    const value = trimmed(raw);
    // Measured as it will be STORED. Checking the raw length made "3072 " an
    // over-limit postcode — refused for a trailing space the customer cannot see,
    // against a limit their visible value never came near.
    if (value.length > DETAIL_LIMITS[field]) { problems.push(field); continue; }
    if (!value) continue; // clearing is legal
    if (field === "phone" && !isValidAuPhone(value)) problems.push(field);
    else if (field === "addressState" && !(AU_STATES as readonly string[]).includes(value.toUpperCase())) problems.push(field);
    else if (field === "addressPostcode" && !/^\d{4}$/.test(value)) problems.push(field);
  }
  return problems;
}

/** What blocks SUBMISSION: required fields that are absent OR stored-invalid.
 *  addressLine2 (unit/level) is the one optional field. A stored-but-invalid
 *  phone counts as missing deliberately — a pre-phase row carrying junk must be
 *  corrected at the gate, not submitted around. */
export function submitMissing(details: AccountDetails): DetailField[] {
  const missing: DetailField[] = [];
  if (!trimmed(details.name)) missing.push("name");
  if (!isValidAuPhone(trimmed(details.phone))) missing.push("phone");
  if (!trimmed(details.addressLine1)) missing.push("addressLine1");
  if (!trimmed(details.addressSuburb)) missing.push("addressSuburb");
  if (!(AU_STATES as readonly string[]).includes(trimmed(details.addressState).toUpperCase())) missing.push("addressState");
  if (!/^\d{4}$/.test(trimmed(details.addressPostcode))) missing.push("addressPostcode");
  return missing;
}
