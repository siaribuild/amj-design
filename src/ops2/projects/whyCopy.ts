/**
 * EVERY SENTENCE ON THE "WHY THIS PRODUCT" SURFACE, in one pure module.
 *
 * The rationale contract carries facts and no prose (`src/data/rationale.ts`),
 * exactly as the recommendation contract does, so the words are the skin's — and
 * they live HERE rather than in JSX for one reason: R2's ban is a claim about a
 * string table. *"No word frames a human's change as an error"* is checkable by
 * reading the strings, and not checkable at all if they are scattered through
 * three components. `scripts/tests/ops2-why.test.mjs` reads this file.
 *
 * ── THE RULES THESE STRINGS ARE HELD TO ─────────────────────────────────────
 *  • R2 — nothing here calls a person's decision wrong. Stating that a figure
 *    misses a cap is a fact about two numbers; stating that somebody erred is
 *    not, and is banned from the whole table.
 *  • D18 — no money, ever. There is no price in the DTO to format.
 *  • R5 — no certification vocabulary, in any phase.
 *  • WHY-AC-4 — a figure that is not a number is never rendered as a number, a
 *    zero or a dash, and WHICH absence it is comes from the DTO's KIND, never
 *    from inspecting the figures (spec §9.0).
 *  • WHY-AC-6 — the tolerance is read from the run and formatted. Never `5`.
 */
import type { RequirementBasis } from "../../data/recommendation";
import type { LineRationaleDto, RationaleFigures } from "../../data/rationale";

/** Two places on both axes, so 3.9 and 3.90 are one number on the screen as
 *  well as in the row. */
const fig = (n: number): string => n.toFixed(2);

/** R4 — where the requirement came from, one label per basis. A basis this
 *  build does not know gets NO label rather than a guess: the origin is the
 *  half a reviewer weighs the cap by, and an invented one is worse than none. */
const BASIS_LABELS: Record<RequirementBasis, string> = {
  explicit_energy_report: "parsed from an energy report",
  plan_derived: "modelled by the platform from the plan",
  default_envelope: "a default value the platform applies",
  human_override: "set by a person",
};

export function basisLabel(basis: string | null | undefined): string | null {
  return basis && basis in BASIS_LABELS
    ? BASIS_LABELS[basis as RequirementBasis]
    : null;
}

export interface Requirement {
  maxUValue: number | null;
  minShgc: number | null;
  maxShgc: number | null;
  basis: RequirementBasis | null;
  absent: boolean;
}

/**
 * "Had to meet" — the caps as figures (WHY-AC-2), or the plain statement that
 * there was no requirement (WHY-AC-3).
 *
 * `absent` wins outright over any cap still sitting on the record. The two
 * disagreeing is a stored-data question; showing a cap for an opening the run
 * recorded as unconstrained would answer it with the wrong half.
 */
export function requirementText(r: Requirement): string {
  if (r.absent) return "this opening had no thermal requirement";
  const parts: string[] = [];
  if (r.maxUValue != null) parts.push(`Uw ≤ ${fig(r.maxUValue)}`);
  if (r.minShgc != null && r.maxShgc != null) {
    parts.push(`SHGC ${fig(r.minShgc)}–${fig(r.maxShgc)}`);
  } else if (r.maxShgc != null) {
    parts.push(`SHGC ≤ ${fig(r.maxShgc)}`);
  } else if (r.minShgc != null) {
    parts.push(`SHGC ≥ ${fig(r.minShgc)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "this opening had no thermal requirement";
}

/** A figure that is not a number, said. Never `0`, never `—`, never an omitted
 *  row (WHY-AC-4). */
export const NOT_RECORDED = "not recorded";

/**
 * "This one" — the line's own captured figures.
 *
 * `null` (the column was never written) and `{null,null}` (captured, and there
 * was no figure) BOTH read "not recorded" here, and that is deliberate: they are
 * the same thing to say about a number. WHICH absence it is is said elsewhere,
 * by the panel's foot sentence and by the DTO's kind — never by this function,
 * which can only see the figures and could never tell them apart.
 */
export function figuresText(f: RationaleFigures | null | undefined): string {
  if (!f || (f.uValue == null && f.shgc == null)) return NOT_RECORDED;
  return [
    f.uValue == null ? `Uw ${NOT_RECORDED}` : `Uw ${fig(f.uValue)}`,
    f.shgc == null ? `SHGC ${NOT_RECORDED}` : `SHGC ${fig(f.shgc)}`,
  ].join(" · ");
}

/** WHY-AC-6 — the band as a percentage, read from the run's stored tolerance
 *  and formatted here. `0.08` is `8%`; `0.125` is `12.5%`. The number was `5`
 *  for the whole life of the model, which is exactly why it is never typed. */
export const tolerancePercent = (tolerance: number): string =>
  `${Number((tolerance * 100).toFixed(1))}%`;

/**
 * "Chosen" — one sentence, and the tone it carries.
 *
 * `warn` in this console means *"ours to resolve, the human proceeds"*, never
 * attention/red: nothing on this surface is an error, least of all a person's
 * decision (R2). `absent` is the muted treatment for a fact that was not kept.
 */
export interface ChosenLine { text: string; tone: "plain" | "warn" | "absent" }

const TIER_SENTENCE = (tier: string, band: string): string => {
  switch (tier) {
    case "meets": return "the cheapest of those that met the caps";
    case "within_tolerance": return `nothing met the caps, so the cheapest within ${band} of the closest`;
    case "misses": return `nothing came within the ${band} band, so the closest was taken`;
    case "thermal_unknown": return "no figure existed on the constrained axis, so it was chosen on fit and price";
    case "does_not_fit": return "nothing fitted this opening, so the best fit was taken";
    // A tier this build does not know is not narrated. Saying nothing beats
    // saying the wrong rule won.
    default: return "the cheapest that fitted the opening";
  }
};

export function chosenLine(dto: LineRationaleDto): ChosenLine {
  if (dto.kind === "unrecorded") {
    return { text: "recorded by an earlier model, whose reasoning was not kept", tone: "absent" };
  }
  // WHY-AC-9's SECOND meaning, and it arrives as a KIND rather than as a shape
  // of the figures — which could never have told it apart from "this product
  // has no published figure" (spec §9.0).
  if (dto.kind === "unresolved") {
    return { text: "the platform evaluated this opening and selected nothing", tone: "warn" };
  }
  if (dto.kind === "human") {
    return dto.units
      ? { text: "a person decided this split", tone: "plain" }
      : { text: "a person chose this product", tone: "plain" };
  }

  // D20 — on a line a person changed, the STRUCTURE does not move: the same
  // three labels, and only this sentence differs.
  if (dto.selectionChanged) {
    return {
      text: `a person chose this — the platform had recommended ${dto.recommended.productName}`,
      tone: "plain",
    };
  }

  if (dto.composite) {
    const beaten = dto.composite.beatenSingle;
    return {
      text: beaten
        ? `this split ranked ahead of the best single unit, ${beaten.productName}`
        : "this split ranked ahead of every single unit recorded for this opening",
      tone: dto.competingTier === "meets" ? "plain" : "warn",
    };
  }

  const tier = dto.competingTier ?? dto.recommended.tier;
  return {
    text: dto.requirement.absent
      ? "the cheapest that fitted the opening"
      : TIER_SENTENCE(tier, tolerancePercent(dto.tolerance)),
    tone: !dto.requirement.absent && tier !== "meets" ? "warn" : "plain",
  };
}
