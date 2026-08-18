// The ONE module that knows the Australian Business Register exists
// (registration Phase 2, design §4).
//
// Everything a caller would otherwise have to know — the credential, the URL,
// the deadline, the JSONP wrapper, the register's field names, the fact that it
// sometimes returns an HTML maintenance page with a 200 — stops here. The
// verification engine consumes a typed result and never sees a URL or the GUID.
//
// THE FAILURE PATH IS THE DESIGN, not an afterthought: ABR being down, slow, or
// lying can only ever produce `unavailable`, which the engine turns into "a
// human looks at it". Nobody is blocked and nobody is waved through (D3). That
// is why there is one attempt and no retry: the two interactive doors have a
// person watching a spinner, a retry doubles their worst case, and the cost of a
// transient blip is one application that queues instead of auto-passing — ops
// minutes, not a lost customer (ASSUMED: P2-ARCH-2).
import type { Env } from "../types";

export type AbrLookup =
  | {
      outcome: "found";
      abn: string;
      abnActive: boolean;
      abnStatusEffectiveFrom: string | null;
      entityName: string | null;
      entityTypeName: string | null;
      /** Trading/business names, deduped and capped. Criterion 2 considers every
       *  one of them, not just the entity name (E-P2-3). */
      businessNames: string[];
      queriedAt: string;
    }
  /** The register answered, and there is no such ABN. */
  | { outcome: "not_found"; queriedAt: string }
  /** Timeout, non-200, unparseable body, or no credential configured. */
  | { outcome: "unavailable"; queriedAt: string };

const DEFAULT_BASE_URL = "https://abr.business.gov.au";
const LOOKUP_PATH = "/json/AbnDetails.aspx";
const TIMEOUT_MS = 5_000;
const CALLBACK = "abnCallback";

/** ABR is outside the trust boundary. These caps mean a hostile or broken
 *  response cannot balloon a D1 row through the frozen snapshot. */
const MAX_NAME_CHARS = 300;
const MAX_BUSINESS_NAMES = 20;

// Workers have no startup hook, so "warn once at startup" (E-P2-18) is honestly
// implemented as once per isolate, on first use. Same operator outcome: one
// warning, not one per application.
let warnedMissingGuid = false;

const clamp = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_NAME_CHARS) : null;
};

/** ONE call per application. Never throws. Never logs the ABN or the GUID. */
export async function lookupAbn(env: Env, abn11: string): Promise<AbrLookup> {
  const queriedAt = new Date().toISOString();

  if (!env.ABR_GUID) {
    if (!warnedMissingGuid) {
      warnedMissingGuid = true;
      // No ABN, no URL, no credential — an operator needs to know the register
      // is unreachable, not what anybody applied with (AB-P2-8).
      console.warn("[abr] ABR_GUID not configured — every application will queue for manual review");
    }
    return { outcome: "unavailable", queriedAt };
  }

  // The JSON API is GET-only and takes `abn` and `guid` as query parameters.
  // This is a server→server TLS call to the registrar itself: no referrer, no
  // browser history, and nothing here is ever logged. Design §14.3 records why
  // AB-P2-16 ("no ABN in a query string") governs the browser↔Worker requests
  // this phase adds and not this outbound leg.
  const base = env.ABR_BASE_URL || DEFAULT_BASE_URL;
  const url = `${base}${LOOKUP_PATH}?abn=${encodeURIComponent(abn11)}&guid=${encodeURIComponent(env.ABR_GUID)}&callback=${CALLBACK}`;

  let raw: string;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      console.log("[abr] lookup failed: http");
      return { outcome: "unavailable", queriedAt };
    }
    raw = await res.text();
  } catch {
    // Timeout or transport failure. Deliberately no detail: the message would
    // be the only place an ABN or a URL could leak into the log.
    console.log("[abr] lookup failed: timeout");
    return { outcome: "unavailable", queriedAt };
  }

  let data: Record<string, unknown>;
  try {
    // The API answers JSONP — `abnCallback({...})`. Accept bare JSON too, so the
    // stub and any future API version both work.
    const open = raw.indexOf("(");
    const close = raw.lastIndexOf(")");
    const json = raw.trimStart().startsWith("{") ? raw : raw.slice(open + 1, close);
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    data = parsed as Record<string, unknown>;
  } catch {
    console.log("[abr] lookup failed: parse");
    return { outcome: "unavailable", queriedAt };
  }

  // The register's not-found shape is an empty record plus a Message.
  const abn = typeof data.Abn === "string" ? data.Abn.replace(/\s/g, "") : "";
  const status = typeof data.AbnStatus === "string" ? data.AbnStatus : "";
  if (!abn || !status) return { outcome: "not_found", queriedAt };

  const businessNames = Array.isArray(data.BusinessName)
    ? [...new Set(data.BusinessName.map(clamp).filter((n): n is string => !!n))].slice(0, MAX_BUSINESS_NAMES)
    : [];

  return {
    outcome: "found",
    abn,
    // The ONE activity test. A branch or GST-only variation is Active and passes
    // — GST registration is not a criterion and is not even read (E-P2-4).
    abnActive: status.trim().toLowerCase() === "active",
    abnStatusEffectiveFrom: clamp(data.AbnStatusEffectiveFrom),
    entityName: clamp(data.EntityName),
    entityTypeName: clamp(data.EntityTypeName),
    businessNames,
    queriedAt,
  };
}
