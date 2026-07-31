// WS6: tier-3 computed thermal band (our house/room model).
// When an opening/lite has neither its own explicit band (tier-1) nor a shared
// per-type band (tier-2), compute a band from what we DO know — climate zone,
// orientation, room/glazing ratio — so thermal is at least advisory, not absent.
//
// Supersedes archetypes.defaultRequirement() (a flat VIC constant, SHGC null).
// Design choices that keep this SAFE under a non-blocking regime:
//   - We never set a minShgc, so a computed band can never form an impossible
//     (min>max) interval and can never demand "at least this much" solar gain.
//   - Orientation drives an advisory shgcTarget (tie-break) and, for hard-to-shade
//     E/W glazing, a cooling-control maxShgc. Unknown orientation ⇒ Uw cap only
//     (honouring §11.3: no SHGC default without orientation).
//   - The Uw cap is assumption-grade (commercial), not a certified NCC figure;
//     lines it gates already degrade to commercial_only_estimate.
import type { ThermalBand } from "./types";

/** The minimal context the computed band needs — kept a primitive so BOTH the
 *  estimator (OpeningInput.thermalContext) and the AI pipeline (OpeningV1 +
 *  archetype) can call this without a cross-layer type dependency. */
export interface ComputeContext {
  climateZone?: string | number | null;
  orientation?: string | null;
}

// Assumption-grade whole-window Uw caps by NCC climate zone (colder ⇒ tighter).
// Coarse on purpose; a real per-project archetype can refine later.
const UCAP_BY_ZONE: Record<string, number> = {
  "1": 5.8, "2": 5.8, "3": 5.4, "4": 4.6, "5": 4.6, "6": 4.0, "7": 3.6, "8": 3.0,
};
const UCAP_FALLBACK = 4.0;

function uCapForZone(zone: string | number | null | undefined): number {
  if (zone == null) return UCAP_FALLBACK;
  return UCAP_BY_ZONE[String(zone).trim()] ?? UCAP_FALLBACK;
}

// Southern-hemisphere solar logic. North gets useful winter sun (shade in summer)
// ⇒ moderate target, no cooling cap. East/West take harsh low-angle summer sun
// that eaves can't shade ⇒ control cooling with a maxShgc. South is low-exposure.
function shgcForOrientation(orientation: string): { target: number | null; maxShgc: number | null } {
  const o = orientation.toUpperCase();
  if (o.startsWith("N")) return { target: 0.5, maxShgc: null };
  if (o === "E" || o === "W" || o === "SE" || o === "SW" || o === "NE" || o === "NW") {
    // Mixed/hard-to-shade aspects: bias cooler.
    if (o === "E" || o === "W") return { target: 0.35, maxShgc: 0.43 };
    return { target: 0.4, maxShgc: 0.5 };
  }
  if (o.startsWith("S")) return { target: 0.4, maxShgc: null };
  return { target: null, maxShgc: null };
}

/** Compute a per-opening/per-lite band from context. Returns null only when even a
 *  Uw cap cannot be justified (never, in practice — we always have a fallback cap),
 *  which keeps thermal at least advisory everywhere. */
export function computeDefaultBand(
  ctx: ComputeContext,
  _elementType?: string | null,
): ThermalBand | null {
  const maxUValue = uCapForZone(ctx.climateZone);
  const orientation = ctx.orientation ?? "";
  if (!orientation) {
    return { maxUValue, minShgc: null, maxShgc: null, shgcTarget: null };
  }
  const { target, maxShgc } = shgcForOrientation(orientation);
  return { maxUValue, minShgc: null, maxShgc, shgcTarget: target };
}
