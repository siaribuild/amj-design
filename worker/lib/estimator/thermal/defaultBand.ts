// The owner's dial: the default Uw cap asserted when no document evidence
// constrains an opening.
//
// It is a VERSIONED RECORD with provenance, never a bare constant. Which value
// it carries is a business decision the owner makes and changes at will;
// engineering's job is only to make it a settable record whose consequences are
// visible before it is turned (calibration.ts) and whose version is snapshotted
// into every requirement it produced.

export type DefaultBandMethod = "unsourced_legacy" | "abcb_glazing_calculator" | "manual";
// `observed_report_maximum` is deliberately NOT in this enum. The owner withdrew
// that derivation rule (spec correction 2); leaving it representable would
// invite its quiet return, and the migration's CHECK omits it for the same
// reason.

export interface ActiveDefaultBand {
  /** "seed:1" | "row:<id>" — stamped into every requirement produced from it. */
  version: string;
  maxUValue: number;
  method: DefaultBandMethod;
  source: string;
  derivedAt: string;
  observations: { openings: number; projects: number } | null;
  setBy: string;
  interim: boolean;
}

/** The code-resident default, in force while the `thermal_default_band` ledger
 *  is empty.
 *
 *  Its value is TODAY'S value. That is the whole point: shipping the dial must
 *  move no existing estimate, so the mechanism arrives without a business change
 *  riding along inside it. An attempt to *derive* a tighter default from the two
 *  projects' parsed reports was withdrawn by the owner — it would have taken
 *  deliverable published catalogue rows from 49 to 28 — and the method that
 *  would have expressed it is absent from the enum above so it cannot return
 *  quietly.
 *
 *  Superseding this is an INSERT into the ledger, not a deploy. */
export const SEED_DEFAULT_BAND: ActiveDefaultBand = {
  version: "seed:1",
  maxUValue: 4.0,
  method: "unsourced_legacy",
  source: "No citable source exists for this value. It is the constant the platform has carried "
    + "since the default envelope was written; it awaits an owner decision (ABCB Glazing "
    + "Calculator run or manual choice) entered as a superseding row.",
  derivedAt: "2026-08-20",
  observations: null,
  setBy: "system_seed",
  interim: true,
};

interface DefaultBandRow {
  id: number;
  max_u_value: number;
  method: string;
  source: string;
  derived_at: string;
  observations_json: string | null;
  set_by: string;
  interim: number;
}

const METHODS: ReadonlySet<string> = new Set<DefaultBandMethod>([
  "unsourced_legacy", "abcb_glazing_calculator", "manual",
]);

/** Resolve the default in force: the newest ledger row, else the seed.
 *
 *  NEVER THROWS. This is read once per extraction run, and a configuration value
 *  that cannot be read is not a reason to fail an estimate — it is a reason to
 *  fall back to the value that was in force before the ledger existed. A row
 *  that cannot be a cap (non-positive, unreadable method) is treated the same
 *  way: skipped, not coerced into something plausible. */
export async function resolveActiveDefaultBand(db: D1Database): Promise<ActiveDefaultBand> {
  let row: DefaultBandRow | null = null;
  try {
    row = await db.prepare(
      `SELECT id, max_u_value, method, source, derived_at, observations_json, set_by, interim
         FROM thermal_default_band
        ORDER BY id DESC
        LIMIT 1`,
    ).first<DefaultBandRow>();
  } catch {
    return SEED_DEFAULT_BAND;
  }
  if (!row) return SEED_DEFAULT_BAND;
  if (!(Number(row.max_u_value) > 0)) return SEED_DEFAULT_BAND;
  if (!METHODS.has(row.method)) return SEED_DEFAULT_BAND;
  let observations: ActiveDefaultBand["observations"] = null;
  try {
    const parsed = row.observations_json ? JSON.parse(row.observations_json) : null;
    if (parsed && typeof parsed.openings === "number" && typeof parsed.projects === "number") {
      observations = { openings: parsed.openings, projects: parsed.projects };
    }
  } catch { /* unreadable observations are absent observations, not a failure */ }
  return {
    version: `row:${row.id}`,
    maxUValue: Number(row.max_u_value),
    method: row.method as DefaultBandMethod,
    source: row.source,
    derivedAt: row.derived_at,
    observations,
    setBy: row.set_by,
    interim: row.interim === 1,
  };
}
