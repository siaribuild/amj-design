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
import type { LineRationaleDto, RationaleCandidate, RationaleFigures } from "../../data/rationale";

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

/**
 * WHY-AC-17 — a ladder row's verdict, in words derived from its tier.
 *
 * `misses` names WHICH cap, because "missed a cap" without saying which is the
 * one thing a reviewer opened the ladder to find out. It is arithmetic against
 * the recorded caps and nothing more: R2 bans framing it as anyone's fault, and
 * an axis with no recorded figure is not named rather than assumed missed.
 */
export function verdictWord(
  candidate: RationaleCandidate, requirement: Requirement, tolerance: number,
): string {
  switch (candidate.tier) {
    case "meets": return "met the caps";
    case "within_tolerance": return `within the ${tolerancePercent(tolerance)} band`;
    case "thermal_unknown": return "no figure on the constrained axis";
    case "does_not_fit": return "would not fit at this size";
    case "misses": {
      const { uValue, shgc } = candidate.figures;
      const overU = requirement.maxUValue != null && uValue != null && uValue > requirement.maxUValue;
      const overShgc = (requirement.maxShgc != null && shgc != null && shgc > requirement.maxShgc)
        || (requirement.minShgc != null && shgc != null && shgc < requirement.minShgc);
      if (overU && overShgc) return "missed both caps";
      if (overU) return "missed the Uw cap";
      if (overShgc) return "missed the SHGC cap";
      return "missed the caps";
    }
    default: return "recorded without a verdict";
  }
}

/** R12/WHY-AC-23 — WHICH of the frame or the glass moved, as a quiet qualifier
 *  on the figures line it explains. It is never a fourth line and never a badge:
 *  D20 keeps the panel's three labels exactly as they are.
 *
 *  Neither term moving is a real state — the variant alone differs — and it
 *  gets no qualifier rather than an invented one, because neither of the two
 *  things this surface shows is what changed. */
export function changeQualifier(
  changed: { product: boolean; glazing: boolean } | null,
): string | null {
  if (!changed) return null;
  if (changed.product && changed.glazing) return "frame and glazing changed";
  if (changed.product) return "frame changed";
  if (changed.glazing) return "glazing changed";
  return null;
}

/** WHY-AC-9, absence 1. The one sentence that tells a NULL column apart from a
 *  captured absence — the figures read identically in both, so without it the
 *  panel would state one fact for two. */
export const PRE_CAPTURE_FOOT =
  "This line was saved before performance figures were kept on a line.";

export interface PanelLine {
  k: "Had to meet" | "This one" | "These ones" | "Chosen";
  v: string;
  /** The muted second line under the caps (R4). */
  origin?: string | null;
  /** R12's quiet qualifier, on the figures line it explains. */
  qualifier?: string | null;
  tone?: ChosenLine["tone"];
  /** The value is an absence and is styled as one — muted, italic, never a
   *  dash and never a zero. */
  absent?: boolean;
  /** The ops-split state's per-unit figures (WHY-AC-37, "These ones"). */
  units?: { code: string; figures: string }[];
}

export interface WhyPanelCopy {
  lines: PanelLine[];
  /** WHY-AC-9's absence-1 sentence, or null. */
  foot: string | null;
  /** The budget's own remainder, when the units line cuts. */
  more: string | null;
  /** The accessible name of the door, or `null` when there is nothing behind
   *  it — WHY-AC-41: a panel with no detail has no control at all. */
  door: string | null;
}

/** UX §3.5 — an ops split shows at most three units and STATES the remainder.
 *  There is no detail behind this panel, so the units beyond the third have
 *  nowhere else to live, which is exactly why the count is said rather than
 *  silently dropped. */
const UNIT_BUDGET = 3;

const unitLines = (units: { code: string; figures: RationaleFigures | null }[]) =>
  units.slice(0, UNIT_BUDGET).map((u) => ({ code: u.code, figures: figuresText(u.figures) }));

const unitRemainder = (units: unknown[]): string | null =>
  units.length > UNIT_BUDGET ? `+${units.length - UNIT_BUDGET} more units` : null;

/**
 * THE WHOLE PANEL, as facts a component renders — labels, values, and the two
 * things that are not lines (the foot sentence and the door's accessible name).
 *
 * Assembled here rather than in JSX so R6's line budget, D20's structural
 * invariant and WHY-AC-41's no-door rule are all one function that a node test
 * can walk state by state.
 */
export function panelCopy(dto: LineRationaleDto): WhyPanelCopy {
  const foot = (c: { figures: RationaleFigures | null }) => (c.figures === null ? PRE_CAPTURE_FOOT : null);
  const chosen = chosenLine(dto);
  const chosenRow = (): PanelLine => ({ k: "Chosen", v: chosen.text, tone: chosen.tone });

  if (dto.kind === "unresolved") {
    return {
      lines: [
        // NOT "not recorded". The row shows a run that established there was
        // nothing to select, which is a different fact from a product with no
        // published figure — and the figures, present-and-null in both, cannot
        // tell them apart (spec §9.0).
        { k: "This one", v: "no selection was made on this line", absent: true },
        chosenRow(),
      ],
      foot: null, more: null, door: null,
    };
  }

  if (dto.kind === "unrecorded") {
    return {
      lines: [
        { k: "This one", v: figuresText(dto.current.figures), absent: dto.current.figures === null },
        chosenRow(),
      ],
      foot: foot(dto.current), more: null, door: null,
    };
  }

  if (dto.kind === "human") {
    const units = dto.units;
    return {
      lines: [
        units
          ? { k: "These ones", v: "", units: unitLines(units) }
          : {
              k: "This one",
              v: figuresText(dto.current.figures),
              absent: dto.current.figures == null || dto.current.figures.uValue == null,
            },
        chosenRow(),
      ],
      foot: units ? null : foot(dto.current),
      more: units ? unitRemainder(units) : null,
      door: null,
    };
  }

  const thisOne: PanelLine = dto.composite
    ? { k: "This one", v: `made as ${dto.composite.units.length} units` }
    : {
        k: "This one",
        v: figuresText(dto.current.figures),
        qualifier: changeQualifier(dto.selectionChanged),
        absent: dto.current.figures == null || dto.current.figures.uValue == null,
      };
  if (dto.composite) thisOne.qualifier = changeQualifier(dto.selectionChanged);

  return {
    lines: [
      {
        k: "Had to meet",
        v: requirementText(dto.requirement),
        origin: dto.requirement.absent ? null : basisLabel(dto.requirement.basis),
      },
      thisOne,
      chosenRow(),
    ],
    foot: foot(dto.current),
    more: null,
    // UX §3.2 — the door names what is behind it, and there is always something
    // behind it on this kind.
    door: `Why this product — open ${
      dto.selectionChanged ? "the comparison and what else was considered"
        : dto.composite ? "why it was split and what else was considered"
          : "what else was considered"}`,
  };
}

/**
 * WHY-AC-27 — the line's OWN stored figures against the run's recorded caps.
 *
 * Deliberately in WHY-AC-17's vocabulary, which the criterion names: a reviewer
 * comparing the two cards is reading one scale, not two. Within-band means
 * over a cap by no more than the run's stored tolerance — the same figure the
 * "Chosen" sentence prints, never a typed 5.
 *
 * `null` when the figures are not numbers: the verdict row is OMITTED rather
 * than guessed (UX §4.5), because a comparison of an absence against a cap has
 * no answer and rendering one would invent it.
 */
export function comparisonVerdict(
  figures: RationaleFigures | null | undefined,
  requirement: Requirement,
  tolerance: number,
): string | null {
  if (requirement.absent) return null;
  if (!figures || (figures.uValue == null && figures.shgc == null)) return null;

  const { uValue, shgc } = figures;
  const overU = requirement.maxUValue != null && uValue != null && uValue > requirement.maxUValue;
  const overShgc = (requirement.maxShgc != null && shgc != null && shgc > requirement.maxShgc)
    || (requirement.minShgc != null && shgc != null && shgc < requirement.minShgc);
  if (!overU && !overShgc) return "met the caps";

  const band = 1 + tolerance;
  const uWithin = !overU
    || (requirement.maxUValue != null && uValue != null && uValue <= requirement.maxUValue * band);
  const shgcWithin = !overShgc || (
    shgc != null
    && (requirement.maxShgc == null || shgc <= requirement.maxShgc * band)
    && (requirement.minShgc == null || shgc >= requirement.minShgc / band)
  );
  if (uWithin && shgcWithin) return `within the ${tolerancePercent(tolerance)} band`;

  if (!uWithin && !shgcWithin) return "missed both caps";
  return uWithin ? "missed the SHGC cap" : "missed the Uw cap";
}

// ── The detail screen's own words (mock section C) ──────────────────────────
//
// HERE RATHER THAN IN THE COMPONENT, for the same reason the panel's are: the
// ban is a scan of this file, and a heading typed into JSX is a heading the ban
// never looked at.
export const DETAIL = {
  title: "Why this product",
  hadToMeet: "What it had to meet",
  comparison: "The platform's pick, and this line's",
  split: "Why it was split",
  bands: "Each unit's own band",
  ladder: "What else was considered",
  ladderLabel: "What else was considered",
  targetHeld:
    "This is the target the platform recorded when it made its recommendation. "
    + "A later change to the product does not move it.",
  platformColumn: "Platform recommended",
  currentColumn: "On this line now",
  // R2, and the sentence the whole comparison block exists to carry.
  comparisonNote:
    "A product is changed for reasons the platform cannot see — availability, lead time, "
    + "what the customer asked for. Both are shown so the difference is readable, "
    + "not so one of them is right.",
  splitMadeAs: "Made as",
  splitBeaten: "Best single unit",
  splitNote:
    "A make-up of two units and a single window competed in the same ladder; "
    + "this is the single unit the split beat.",
  bandsNote:
    "An awning lite and a fixed lite carry different bands. These have been recorded on "
    + "every split since the split feature shipped and have never been shown.",
  bandMissing: "Its band was not recorded.",
  noRequirement: "This opening had no thermal requirement.",
  // R28/WHY-AC-39 — stated positively, so a later reader does not mistake the
  // absence of an action for an oversight and helpfully restore one.
  closing: "Nothing on this screen changes the quote — it is read and closed.",
} as const;

/** The ladder's chosen row. On a line a person has changed it reads "the
 *  platform's pick" instead: the row describes the recommendation, and the
 *  line's current product is somebody else's (R24). */
export const chosenRowMark = (changed: unknown): string =>
  (changed ? "· the platform's pick" : "· chosen");

const NUMBER_WORD = ["no", "One", "Two", "Three", "Four", "Five"];

/** WHY-AC-13 — fewer than five is the list that exists, with no placeholder row
 *  and NO COUNT OF ANYTHING BEYOND IT. The sentence counts what is on screen. */
export function ladderNote(shown: number): string {
  if (shown >= 5) {
    return "The chosen product and the next four by rank. No price, nothing to price, "
      + "and nothing here changes the line.";
  }
  const count = NUMBER_WORD[shown] ?? String(shown);
  return `${count} candidate${shown === 1 ? " was" : "s were"} recorded for this opening — `
    + "the list is what exists, with nothing padded and no remainder counted.";
}

/** A make-up's name in the ladder, from the units it is made of. A single names
 *  its product. */
export function candidateName(c: RationaleCandidate): string {
  if (c.form !== "split" || !c.units || c.units.length === 0) return c.productName;
  const parts = c.units.map((u) => u.operationType).filter(Boolean);
  return parts.length > 0 ? `Split: ${parts.join(" + ")}` : `Split: ${c.units.length} units`;
}

/** A make-up has no single assembly figure, and inventing one would be a
 *  number nobody recorded — so the cell says what it is instead. */
export function candidateFigures(c: RationaleCandidate): string {
  return c.form === "split" && c.units
    ? `${c.units.length} units`
    : figuresText(c.figures);
}

/** WHY-AC-34 — a lite's own band. `null` when none was recorded, and NOTHING is
 *  computed for it (WHY-AC-35): not the parent's band, not the sibling's. */
export function unitBandText(
  band: { maxUValue: number | null; minShgc: number | null; maxShgc: number | null } | null,
): string | null {
  if (!band) return null;
  const parts: string[] = [];
  if (band.maxUValue != null) parts.push(`Uw ≤ ${fig(band.maxUValue)}`);
  if (band.minShgc != null && band.maxShgc != null) parts.push(`SHGC ${fig(band.minShgc)}–${fig(band.maxShgc)}`);
  else if (band.maxShgc != null) parts.push(`SHGC ≤ ${fig(band.maxShgc)}`);
  else if (band.minShgc != null) parts.push(`SHGC ≥ ${fig(band.minShgc)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Where a candidate sat on the ladder. Ordinals, because "ranked 1st" reads as
 *  a position and "rank 1" reads as a field name. */
export function rankedText(rank: number | null): string | null {
  if (rank == null) return null;
  const tens = rank % 100;
  const suffix = tens >= 11 && tens <= 13
    ? "th"
    : ["th", "st", "nd", "rd"][rank % 10] ?? "th";
  return `ranked ${rank}${suffix}`;
}
