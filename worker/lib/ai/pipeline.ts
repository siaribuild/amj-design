// AI building-model pipeline: ingest → page-aware schedule/plan/energy skills →
// merged evidence-linked BuildingModelV1 → deterministic requirements and
// product selection. The model extracts evidence; deterministic code owns
// precedence, eligibility and pricing. Mode-A Melbourne/VIC context is always
// recorded as a fallback assumption and is replaced by project evidence.
//
// Persistence: writes the CANONICAL 0016 records (building_models,
// evidence_items, opening_requirements). Draft-line selection still routes
// through the delivered deterministic engine over opening_instance — that
// remains the selection substrate until a later phase cuts it over, so the
// existing review UI keeps working while the new model accrues.
import type { Env } from "../../types";
import { uuid } from "../util";
import { createAiRun, completeAiRun } from "./runs";
import { runStage } from "./stage";
import { ingestProjectFiles, type IngestedDoc } from "./ingest";
import { scheduleExtractor, type ScheduleLineV1 } from "../estimator/skills/schedule";
import { energyReportExtractor, type EnergyExtraction } from "../estimator/skills/energy";
import { planContextExtractor, type PlanContextV1 } from "../estimator/skills/plan";
import { applyEnergyAuthority, mapEnergyToOpenings, normalizeOpeningRef } from "./energyMap";
import { resolveDefaultEnvelope, ARCHETYPE_REGISTRY_VERSION, type EnvelopeArchetype } from "./archetypes";
import { computeThermalBand } from "../estimator/thermal/computedBand";
import { readSourced, type CompassPoint, type ThermalModelInputs } from "../estimator/thermal/contract";
import { resolveActiveDefaultBand, type ActiveDefaultBand } from "../estimator/thermal/defaultBand";
import { coerceCoherent } from "../estimator/thermal/precedence";
import { proposeSplit, parseSplitHint, resolveMakeUp, type SplitHint } from "../estimator/split";
import { runDrawingEnrichmentStage } from "../drawing/enrich";
import { setDrawingProgress } from "./jobs";
import { applyDrawingOrientation, applyDrawingRoom, persistReadings, conflictReason } from "../drawing/readings";
import type { DrawingReading } from "../drawing/contract";
import { BUILDING_MODEL_SCHEMA_VERSION } from "./versions";
import type { BuildingModelV1, OpeningV1 } from "./schema";
import { runProjectEstimate, type TierCounts } from "../estimator/estimate";
import { resolveScheduleType } from "../../../src/data/scheduleMatch";
import { sha256hex } from "./hash";
import type { SkillFailureKind } from "../estimator/skills/types";

// ── Pure: §9.3 parent/child tag decomposition ────────────────────────────────
// W04A/W04B are thermal children of architectural parent W04; a bare W04 or W12
// has no parent. Conservative: only a single trailing letter after digits.
export function parentTagOf(tag: string): string | null {
  const m = /^([A-Za-z]{1,3}\d{1,4})[A-Za-z]$/.exec(tag.trim());
  return m ? m[1] : null;
}

// ── Pure: merge per-document extractions; represent conflicts, never resolve
//    silently (§9.2). Same tag + same dims across docs dedupes; same tag with
//    materially different dims becomes a review-required conflict. ─────────────
export interface MergedLine extends ScheduleLineV1 { sourceFileIds: string[] }
export interface MergeResult {
  lines: MergedLine[];
  conflicts: BuildingModelV1["conflicts"];
}
export function mergeScheduleLines(perDoc: { fileId: string; lines: ScheduleLineV1[] }[]): MergeResult {
  const byTag = new Map<string, MergedLine>();
  const untagged: MergedLine[] = [];
  const conflicts: BuildingModelV1["conflicts"] = [];
  for (const doc of perDoc) {
    for (const line of doc.lines) {
      if (!line.tag) { untagged.push({ ...line, sourceFileIds: [doc.fileId] }); continue; }
      const existing = byTag.get(line.tag);
      if (!existing) { byTag.set(line.tag, { ...line, sourceFileIds: [doc.fileId] }); continue; }
      existing.sourceFileIds.push(doc.fileId);
      const dimsDiffer =
        (line.widthMm != null && existing.widthMm != null && line.widthMm !== existing.widthMm) ||
        (line.heightMm != null && existing.heightMm != null && line.heightMm !== existing.heightMm);
      if (dimsDiffer) {
        conflicts.push({
          conflictId: `conf_${conflicts.length + 1}`,
          entity: line.tag,
          field: "dimensions",
          values: [
            { value: { widthMm: existing.widthMm, heightMm: existing.heightMm }, source: existing.sourceFileIds[0], precedence: 50 },
            { value: { widthMm: line.widthMm, heightMm: line.heightMm }, source: doc.fileId, precedence: 50 },
          ],
          resolution: "keep_first_and_flag",
          selectedValue: { widthMm: existing.widthMm, heightMm: existing.heightMm },
          reviewRequired: true,
        });
      } else {
        // Same tag, compatible dims: fill gaps from the later source.
        existing.widthMm ??= line.widthMm; existing.heightMm ??= line.heightMm;
        existing.qty ??= line.qty; existing.typeText ??= line.typeText;
        existing.elementType ??= line.elementType; existing.colour ??= line.colour;
      }
    }
  }
  return { lines: [...byTag.values(), ...untagged], conflicts };
}

// ── Pure: merged lines → BuildingModelV1 (Mode A) ────────────────────────────
export function linesToBuildingModel(projectId: string, merged: MergeResult, docs: IngestedDoc[]): BuildingModelV1 {
  const openings: OpeningV1[] = merged.lines.map((l, i): OpeningV1 => ({
    openingId: `op_${l.tag || `untagged_${i + 1}`}`,
    externalRef: l.tag || `UNTAGGED-${i + 1}`,
    parentRef: l.tag ? parentTagOf(l.tag) : null,
    level: null, roomId: null, wallOrientation: null, wallOrientationSource: null,
    elementType: l.elementType ?? (l.tag.toUpperCase().startsWith("D") ? "door" : "window"),
    widthMm: l.widthMm, heightMm: l.heightMm,
    quantity: Math.max(1, Math.floor(l.qty ?? 1)),
    areaM2: l.widthMm != null && l.heightMm != null ? Math.round((l.widthMm * l.heightMm) / 1e4) / 100 : null,
    configuration: {
      familyRequested: l.typeText, panelCount: null, operablePanelCount: null,
      layoutCode: l.layoutCode, viewBasis: null,
    },
    scheduleRequirements: {
      doubleGlazed: l.doubleGlazed, glassDescription: l.glassNote, colour: l.colour, flyscreen: l.flyscreen,
    },
    shading: null,
    thermalRequirement: null, // Mode A: no observed thermal target; Phase 4 adds envelope bands
    evidence: l.sourceFileIds.map((fid) => ({
      entityPath: `/openings/${l.tag || `untagged_${i + 1}`}`,
      fileId: fid, pageNo: null, sheetRef: null, region: null,
      extractedText: [l.tag, l.typeText, l.widthMm && l.heightMm ? `${l.widthMm}x${l.heightMm}` : null].filter(Boolean).join(" "),
      origin: "explicit", confidence: l.confidence.tag,
    })),
    confidence: {
      tag: l.confidence.tag ?? 0,
      dimensions: l.confidence.dimensions ?? 0,
      configuration: l.confidence.configuration ?? 0,
    },
  }));

  return {
    schemaVersion: BUILDING_MODEL_SCHEMA_VERSION,
    projectId,
    inputMode: "schedule_only",
    jurisdiction: {
      // §3.1 minimum context — a DEFAULT, recorded as such below, never observed.
      country: "AU", state: "VIC", postcode: null, nccProfile: null,
      nathersClimateZone: 6, buildingClass: null, confidence: 0,
    },
    building: { storeys: null, conditionedFloorAreaM2: null, totalFloorAreaM2: null, exposure: null, northRotationDeg: null, balRating: null },
    envelope: { walls: [], floors: [], ceilings: [], roofs: [], airTightness: null, defaultArchetypeId: null },
    rooms: [],
    openings,
    energyAssessment: null,
    assumptions: [
      {
        fact: "location_default=Melbourne,VIC",
        origin: "regulatory_default",
        note: "Mode A commercial-estimate fallback only; replace with project evidence and confirm during review",
      },
      {
        fact: "project_type_default=new_build",
        origin: "regulatory_default",
        note: "Commercial-estimate fallback only; not a regulatory or compliance determination",
      },
      ...docs.filter((d) => d.qualityIssues.length).map((d) => ({
        fact: `document_quality:${d.filename}`, origin: "unknown" as const, note: d.qualityIssues.join(","),
      })),
    ],
    conflicts: merged.conflicts,
  };
}

// ── WS5 + 02-design-v2.md §3.4: one place that turns a merged schedule line
// (plus, when enrichment ran, its drawing reading) into a split hint and the
// review flags it earns. Pure — extracted so the make-up ladder is tested
// directly rather than only through the full runAiExtraction pipeline. ──
export function buildSplitHints(
  lines: MergedLine[],
  drawingReadings: DrawingReading[],
): { splitHints: Map<string, SplitHint>; flags: Map<string, string[]> } {
  const readingByTag = new Map(drawingReadings
    .filter((r) => r.splitState === "value" && r.split)
    .map((r) => [r.externalRef, { splitState: r.splitState, units: r.split!.units, axis: r.split!.axis }] as const));
  const splitHints = new Map<string, SplitHint>();
  const flags = new Map<string, string[]>();
  const flag = (tag: string, reason: string) => {
    const list = flags.get(tag) ?? [];
    list.push(reason);
    flags.set(tag, list);
  };
  for (const l of lines) {
    if (!l.tag || l.widthMm == null || l.heightMm == null) continue;
    const reading = readingByTag.get(l.tag) ?? null;
    // AC-9: schedule says FIXED, the drawing shows an operating unit — the
    // reason string names both sides, the same channel a split proposal
    // uses (§3.5), so it reaches the reviewer with zero new machinery.
    if (reading && (l.typeText ?? "").trim().toLowerCase() === "fixed" && reading.units.some((u) => u.role === "operable")) {
      flag(l.tag, conflictReason("drawing shows operating unit", "schedule types FIXED"));
    }
    const commentHint: SplitHint | null = l.split?.operable?.length
      ? { units: l.split.operable, raw: l.notes ?? "", source: "schedule_comment" }
      : parseSplitHint(l.notes);
    const { hint, conflict } = resolveMakeUp(l.tag, {
      reading,
      commentHint,
      typeText: l.typeText ?? null,
      fallbackOp: (l.typeText ?? "").toLowerCase() || "awning",
      energyComponents: null,
      energyAxis: "vertical",
    });
    if (!hint) continue;
    splitHints.set(l.tag, hint);
    const proposal = proposeSplit(
      { operationType: (l.typeText ?? "").toLowerCase() || null, widthMm: l.widthMm, heightMm: l.heightMm },
      hint,
    );
    const layout = proposal.segments.map((s) => `${s.operation} ${s.widthMm}mm`).join(" + ");
    flag(l.tag, `proposed split (confirm at review): ${layout}`);
    if (conflict) flag(l.tag, conflict);
  }
  return { splitHints, flags };
}

export function applyPlanContext(
  model: BuildingModelV1,
  sources: { fileId: string; context: PlanContextV1 }[],
): void {
  if (!sources.length) return;
  model.inputMode = "plans_no_report";
  const roomIds = new Set(model.rooms.map((r) => r.roomId));
  for (const { fileId, context } of sources) {
    if (context.jurisdiction.state) {
      model.jurisdiction.state = context.jurisdiction.state;
      model.jurisdiction.confidence = null;
      model.assumptions = model.assumptions.filter((a) => !a.fact.startsWith("location_default="));
    }
    model.jurisdiction.postcode ??= context.jurisdiction.postcode;
    model.jurisdiction.buildingClass ??= context.jurisdiction.buildingClass;
    model.building.storeys ??= context.storeys;
    model.building.totalFloorAreaM2 ??= context.totalFloorAreaM2;
    model.building.conditionedFloorAreaM2 ??= context.conditionedFloorAreaM2;
    model.building.northRotationDeg ??= context.northRotationDeg;
    for (const room of context.rooms) {
      if (roomIds.has(room.id)) continue;
      roomIds.add(room.id);
      model.rooms.push({ roomId: room.id, name: room.name, level: room.level, areaM2: room.areaM2, zoneType: room.zoneType });
    }
    // Joined on the NORMALISED ref, like every other ref join in this pipeline.
    // It used to be raw string equality, so a plan printing "W-04" against a
    // schedule printing "W04" dropped that opening's room and orientation and
    // said nothing — and orientation hard-filters product candidates downstream,
    // so a silent miss here does not degrade a recommendation, it removes the
    // correct product from consideration. normalizeOpeningRef is the form the
    // rest of the pipeline already keys on; a second spelling of the key would
    // be the same bug wearing a different hat.
    const byRef = new Map(context.openings.map((opening) => [normalizeOpeningRef(opening.ref) ?? opening.ref, opening]));
    for (const opening of model.openings) {
      const mapped = byRef.get(normalizeOpeningRef(opening.externalRef) ?? opening.externalRef);
      if (!mapped) continue;
      opening.roomId ??= mapped.roomId;
      opening.wallOrientation ??= mapped.orientation as OpeningV1["wallOrientation"];
      // Bookkeeping only, beside the write that just happened: record WHICH
      // document class supplied the orientation the thermal contract will read.
      // No precedence logic and no new producer — `??=` above still decides who
      // wins, exactly as before.
      if (opening.wallOrientation && !opening.wallOrientationSource) opening.wallOrientationSource = "plan";
      if (mapped.horizontalProjectionMm != null) {
        opening.shading = {
          horizontalProjectionMm: mapped.horizontalProjectionMm,
          verticalFeature: null,
          source: fileId,
        };
      }
      opening.evidence.push({
        entityPath: `/openings/${opening.externalRef}/building_context`,
        fileId,
        pageNo: null,
        sheetRef: null,
        region: null,
        extractedText: [
          mapped.roomId ? `room ${mapped.roomId}` : null,
          mapped.orientation ? `orientation ${mapped.orientation}` : null,
          mapped.horizontalProjectionMm != null ? `projection ${mapped.horizontalProjectionMm}mm` : null,
        ].filter(Boolean).join(" · "),
        origin: "geometry_derived",
        confidence: null,
      });
    }
    for (const issue of context.issues) {
      model.assumptions.push({ fact: `plan_context_issue:${issue}`, origin: "unknown", note: fileId });
    }
  }
}

export function thermalContextFor(
  model: BuildingModelV1,
  opening: OpeningV1,
  technicalReviewReasons: string[] = [],
) {
  const room = model.rooms.find((r) => r.roomId === opening.roomId);
  const openingAreaM2 = opening.areaM2;
  const glazingToRoomFloorRatio = openingAreaM2 != null && room?.areaM2
    ? Math.round((openingAreaM2 / room.areaM2) * 1000) / 1000
    : null;
  let risk = 0;
  if (openingAreaM2 != null && openingAreaM2 >= 4) risk += 1;
  if (glazingToRoomFloorRatio != null && glazingToRoomFloorRatio >= 0.3) risk += 2;
  if (opening.wallOrientation === "E" || opening.wallOrientation === "W") risk += 1;
  if (opening.shading?.horizontalProjectionMm === 0) risk += 1;
  if (opening.scheduleRequirements.doubleGlazed === true) risk += 2;
  const glass = (opening.scheduleRequirements.glassDescription || "").toLowerCase();
  if (glass.includes("low-e") || glass.includes("low e")) risk += 2;
  return {
    inputMode: model.inputMode,
    requirementBasis: opening.thermalRequirement?.basis ?? null,
    roomAreaM2: room?.areaM2 ?? null,
    totalFloorAreaM2: model.building.totalFloorAreaM2,
    openingAreaM2,
    glazingToRoomFloorRatio,
    orientation: opening.wallOrientation,
    shadingKnown: opening.shading != null,
    riskBand: risk >= 4 ? "high" : risk >= 2 ? "medium" : "low",
    climateZone: model.jurisdiction.nathersClimateZone != null
      ? String(model.jurisdiction.nathersClimateZone)
      : null,
    jurisdiction: [model.jurisdiction.country, model.jurisdiction.state].filter(Boolean).join("-") || null,
    buildingClass: model.jurisdiction.buildingClass,
    envelopeClass: model.envelope.defaultArchetypeId,
    technicalReviewReasons: [...new Set(technicalReviewReasons)].slice(0, 20),
  } as const;
}

// ── Pure: assemble one opening's THERMAL INPUT CONTRACT record ───────────────
//
// Assembly READS the model; it never extracts. Every field below is a fact the
// building model already holds, and each document-derived one is stamped with
// the document class that supplied it — an orientation whose producer we cannot
// name is not evidence, so it is assembled as absent rather than as an unsourced
// value the band would then rest on invisibly.
//
// In production today every `plan`-sourced field is null (0 of 38 models carry
// rooms or shading) and orientation arrives only via an energy report, for
// openings that report gave no band to. That availability is the extraction
// thread's to change; nothing here has to move when it does.
export function thermalInputsFor(model: BuildingModelV1, opening: OpeningV1): ThermalModelInputs {
  const archetype = resolveDefaultEnvelope(model);
  const room = model.rooms.find((r) => r.roomId === opening.roomId);
  const areaM2 = opening.areaM2;
  // Same rounding as thermalContextFor — one derivation of this ratio, not two.
  const glazingRatio = areaM2 != null && room?.areaM2
    ? Math.round((areaM2 / room.areaM2) * 1000) / 1000
    : null;
  const schedule = opening.scheduleRequirements;
  const hasGlazingInstruction = schedule.doubleGlazed != null || schedule.glassDescription != null;
  return {
    climateZone: archetype?.nccClimateZone ?? null,
    elementType: opening.elementType,
    isCompositeChild: opening.parentRef != null,
    widthMm: opening.widthMm,
    heightMm: opening.heightMm,
    areaM2,
    orientation: readSourced<CompassPoint>(
      { value: opening.wallOrientation, source: opening.wallOrientationSource },
      { compass: true },
    ),
    roomAreaM2: room?.areaM2 != null ? { value: room.areaM2, source: "plan" } : null,
    glazingToRoomFloorRatio: glazingRatio != null ? { value: glazingRatio, source: "plan" } : null,
    shadingProjectionMm: opening.shading?.horizontalProjectionMm != null
      ? { value: opening.shading.horizontalProjectionMm, source: "plan" }
      : null,
    zoneType: room?.zoneType != null ? { value: room.zoneType, source: "plan" } : null,
    glazingInstruction: hasGlazingInstruction
      ? { value: { doubleGlazed: schedule.doubleGlazed, note: schedule.glassDescription }, source: "schedule" }
      : null,
  };
}

/** The run's THERMAL REACH, as counts (TB-9).
 *
 *  The defect this feature repairs was invisible for months because nobody could
 *  see it without writing a GROUP BY: 444 identical bands and a tier that had
 *  never been assigned looked exactly like a working model. These two figures put
 *  the answer in every run's summary, so the drawing thread's arrival shows up as
 *  `plan_derived` rising and `withShgc` with it, with no query by hand.
 *
 *  Customer-safe by construction: counts only, all from this project's own run. */
export function modelReachCounters(energyApplied: number, counts: DefaultEnvelopeCounts) {
  return {
    basisCounts: {
      // An opening whose report band coerced away to nothing was recomputed, and
      // the row it ends up with says so. It is counted where it landed, not
      // where it passed through — so this sums to the openings it describes and
      // agrees with the group-by over `opening_requirements`.
      explicit_energy_report: Math.max(0, energyApplied - counts.recomputedOverReport),
      plan_derived: counts.plan_derived,
      default_envelope: counts.default_envelope,
    },
    computedBands: { total: counts.computed, withShgc: counts.withShgc },
  };
}

/** The immutable per-opening record written to `opening_requirements.requirement_json`.
 *
 *  Pure and exported so the thing that actually lands in the column can be read
 *  back in a test rather than inferred from the SQL around it.
 *
 *  Both snapshots ride along for a COMPUTED requirement and neither for a
 *  reported one, keyed on the derivation's presence rather than on a basis name:
 *  a requirement must stay readable as the claim it made WHEN IT WAS MADE, so
 *  neither a registry change nor a superseding dial row can re-base history. A
 *  reported band was stated rather than derived, so it snapshots neither. */
export function requirementSnapshot(
  opening: OpeningV1,
  archetype: EnvelopeArchetype | null,
  dial: ActiveDefaultBand,
) {
  const requirement = opening.thermalRequirement;
  const computed = !!requirement?.derivation;
  return {
    opening: opening.externalRef,
    thermal: requirement,
    archetype: computed && archetype ? archetype : undefined,
    // A PROJECTION of the dial record, not the record. TB-15 needs the value,
    // the method, the citation and the date; `setBy` is a staff identity (an
    // Access email) and `observations` is internal corpus bookkeeping, and a
    // per-opening row on a customer's project has no business carrying either.
    // Nothing reads `requirement_json` today, which is exactly why this is
    // cheaper to prevent now than to remember when something does.
    defaultBand: computed
      ? {
          version: dial.version, maxUValue: dial.maxUValue, method: dial.method,
          source: dial.source, derivedAt: dial.derivedAt, interim: dial.interim,
        }
      : undefined,
  };
}

/** What one run's envelope stage did, for the summary counters (TB-9). */
export interface DefaultEnvelopeCounts {
  computed: number;
  withShgc: number;
  plan_derived: number;
  default_envelope: number;
  /** Of `computed`, how many openings ALREADY carried a requirement row when the
   *  envelope stage reached them — a report band that coerced away to nothing,
   *  so the opening was never actually answered (spec §8).
   *
   *  The energy map has already tallied these under `energyApplied`: it did
   *  write them a row. The recomputation then decides their real basis, and the
   *  persisted row records that one. Without this number the run summary would
   *  report the same opening twice under two different bases, and disagree with
   *  the `GROUP BY requirement_basis` it exists to save anyone running. */
  recomputedOverReport: number;
}

// ── Pure: Path 3 — compute the requirement for every unanswered opening ──────
//
// This is precedence TIER 3, and it is where a computed requirement is born.
//
// "Unanswered" is a question about the BAND, not about the row. The old test
// (`if (o.thermalRequirement) continue`) skipped on the row's existence, so an
// opening whose report band was incoherent and coerced away to nothing kept a
// requirement that constrained nothing at all and never reached the
// calculation. It now runs for that opening and the basis is computed —
// `coerceCoherent` is the single existing normalisation and is not duplicated
// here. A human's edit is never recomputed regardless of content.
//
// Composite children are just openings in this loop: each is banded from its own
// inputs and inherits nothing implicitly. Report-defined `thermalComponents`
// keep their own report requirements and never reach here.
export function applyDefaultEnvelope(
  model: BuildingModelV1,
  dial: ActiveDefaultBand,
): { archetype: EnvelopeArchetype | null; dial: ActiveDefaultBand; counts: DefaultEnvelopeCounts } {
  const counts: DefaultEnvelopeCounts = {
    computed: 0, withShgc: 0, plan_derived: 0, default_envelope: 0, recomputedOverReport: 0,
  };
  const archetype = resolveDefaultEnvelope(model);
  if (!archetype) return { archetype: null, dial, counts };
  for (const o of model.openings) {
    const existing = o.thermalRequirement;
    if (existing) {
      // The human is the highest-precedence source, full stop.
      if (existing.basis === "human_override") continue;
      const effective = coerceCoherent({
        maxUValue: existing.maxUValue, minShgc: existing.shgcMin,
        maxShgc: existing.shgcMax, shgcTarget: existing.shgcTarget,
      }).band;
      // An effective report band ends the matter: the calculation contributes
      // NOTHING to an opening a report has already answered, so it can never add
      // an SHGC cap the report never asked for and exclude a product the report
      // allows.
      if (effective) continue;
    }
    // This opening is about to get a computed basis. If it arrived carrying a
    // report row, the energy map has already counted it once — record that here
    // so the run summary does not count it twice.
    if (existing) counts.recomputedOverReport++;
    const result = computeThermalBand(thermalInputsFor(model, o), dial);
    // What the calculation actually CONSUMED, not what the model was carrying.
    const citedOrientation = result.inputsUsed.find((used) => used.field === "orientation")?.value ?? null;
    o.thermalRequirement = {
      basis: result.basis,
      maxUValue: result.band.maxUValue,
      shgcTarget: result.band.shgcTarget,
      shgcMin: result.band.minShgc,
      shgcMax: result.band.maxShgc,
      zoneType: null,
      operablePercent: null,
      // Named from the consumed input: an orientation the contract refused
      // contributed nothing, and prose claiming it would tell a reviewer the
      // opposite of what `inputsMissing` records.
      notes: `${archetype.defaultOpeningBand.note} (orientation ${citedOrientation ?? "unknown"})`,
      derivation: {
        inputsUsed: result.inputsUsed,
        inputsMissing: result.inputsMissing,
        rulesApplied: result.rulesApplied,
        defaultBandVersion: result.defaultBandVersion,
        contractVersion: result.contractVersion,
      },
    };
    counts.computed++;
    if (result.band.shgcTarget != null || result.band.maxShgc != null) counts.withShgc++;
    counts[result.basis]++;
  }
  if (counts.computed) {
    model.envelope.defaultArchetypeId = archetype.id;
    model.assumptions.push({
      fact: `default_envelope:${archetype.id}`,
      origin: "envelope_default",
      note: `${archetype.defaultOpeningBand.note} — registry ${ARCHETYPE_REGISTRY_VERSION}, applied to ${counts.computed} opening(s)`,
    });
  }
  return { archetype: counts.computed ? archetype : null, dial, counts };
}

// ── Orchestration ────────────────────────────────────────────────────────────
export interface AiExtractionSummary {
  runId: string;
  status: "completed" | "partial" | "failed";
  documents: number;
  extractedLines: number;
  conflicts: number;
  /** Path-1 outcome: openings that received an explicit report requirement. */
  energyApplied: number;
  /** THERMAL REACH (TB-9): how many openings ended on each requirement basis,
   *  and how many computed bands actually carried an SHGC constraint. Absent on
   *  a failed run, which computed no bands to count. */
  basisCounts?: { explicit_energy_report: number; plan_derived: number; default_envelope: number };
  computedBands?: { total: number; withShgc: number };
  /** Openings by competing tier, so a change to the default band shows up as a
   *  shift in review load rather than being discovered through it. Null when no
   *  estimate ran. */
  selectionTiers?: TierCounts | null;
  buildingModelId: string | null;
  estimate: { openings: number; selected: number } | null;
  cartApplied?: number;
  stageWarnings: string[];
  /** Human-readable report-vs-plan items retained for audit and staff review. */
  discrepancyWarnings?: string[];
  /** Stable category consumed by queue retry policy; never parse warning text. */
  failureKind?: SkillFailureKind | "business_incomplete" | "stale_generation" | null;
  errorCode?: string | null;
}

export async function runAiExtraction(
  env: Env,
  projectId: string,
  opts: { sourceGeneration?: number; processingToken?: string } = {},
): Promise<AiExtractionSummary> {
  const manifest = await env.DB.prepare(
    "SELECT id, checksum, filename FROM file_asset WHERE project_id = ? AND virus_status = 'clean' ORDER BY id",
  ).bind(projectId).all<{ id: string; checksum: string | null; filename: string }>();
  const sourceManifestHash = await sha256hex(
    new TextEncoder().encode(JSON.stringify(manifest.results ?? [])),
  );
  const generationRow = await env.DB.prepare("SELECT ai_generation FROM project WHERE id = ?")
    .bind(projectId).first<{ ai_generation: number }>();
  const sourceGeneration = opts.sourceGeneration ?? generationRow?.ai_generation ?? 0;
  const run = await createAiRun(env, {
    projectId,
    inputMode: "schedule_only",
    sourceGeneration,
    sourceManifestHash,
  });
  const warnings: string[] = [];
  const stageFailures: SkillFailureKind[] = [];

  // Structured wall-clock telemetry for phases spanning I/O. Synchronous CPU
  // timing belongs to Cloudflare's invocation metrics: workerd deliberately
  // does not make Date.now() a trustworthy profiler for uninterrupted code.
  // Never log filenames, document text or model output (§21.1).
  const runStartedAt = Date.now();
  let phaseMark = runStartedAt;
  let lastPhase = "start";
  const phase = (
    label: string,
    fields: Record<string, string | number | boolean | null> = {},
  ) => {
    lastPhase = label;
    const now = Date.now();
    console.log({
      event: "ai_pipeline_phase",
      aiRunId: run.id,
      projectId,
      sourceGeneration,
      phase: label,
      durationMs: now - phaseMark,
      totalDurationMs: now - runStartedAt,
      ...fields,
    });
    phaseMark = now;
  };

  const setProgress = async (
    stage: "reading_documents" | "extracting_schedule" | "building_envelope" | "matching_and_pricing" | "preparing_quote",
  ) => {
    if (!opts.processingToken) return;
    await env.DB.prepare(
      `UPDATE ai_job_claim SET progress_stage=?, updated_at=datetime('now')
        WHERE project_id=? AND source_generation=? AND status='processing'
          AND processing_token=?`,
    ).bind(stage, projectId, sourceGeneration, opts.processingToken).run().catch(() => {});
  };
  try {

  await setProgress("reading_documents");
  const docs = await ingestProjectFiles(env, projectId);
  phase("ingest", { documents: docs.length });
  const usable = docs.filter((d) => !d.rejected && (d.markdown || d.imageDataUrl));
  if (!usable.length) {
    const summary: AiExtractionSummary = {
      runId: run.id, status: "failed", documents: docs.length, extractedLines: 0,
      conflicts: 0, energyApplied: 0, buildingModelId: null, estimate: null,
      stageWarnings: docs.flatMap((d) => d.qualityIssues),
      failureKind: "business_incomplete",
    };
    // A PDF that produced no markdown is not an unreadable IMAGE. Reporting it
    // as one sent the investigation looking at scan quality for a 14-page
    // vector plan set with a perfectly good text layer.
    const errorCode = !docs.length
      ? "FILE_UNSUPPORTED"
      : docs.some((d) => d.kind === "pdf") ? "MARKDOWN_CONVERSION_FAILED" : "IMAGE_UNREADABLE";
    summary.errorCode = errorCode;
    await completeAiRun(env, run.id, { status: "failed", errorCode, summary });
    return summary;
  }

  // Route documents by classification (§7.4): energy reports feed the energy
  // skill (Path 1, authoritative); everything else feeds schedule extraction.
  // ingestProjectFiles is oldest-first. Treat the newest successful report as
  // the active revision; older reports remain evidence and are called out.
  const energyDocs = usable.filter((d) => d.roles.includes("energy_report")).reverse();
  const planDocs = usable.filter((d) => d.roles.includes("plans"));
  const scheduleDocs = usable.filter((d) => d.roles.includes("schedule"));

  // Schedule, plan-context and energy-report extraction are independent views
  // of the same saved documents. Running those groups sequentially made their
  // wall times additive and forced a healthy schedule response to compete with
  // the one-minute UX budget. Groups run concurrently; documents within a group
  // remain sequential so a multi-file upload never creates an unbounded fan-out.
  await setProgress("extracting_schedule");
  const documentSkillsStartedAt = Date.now();

  const scheduleTask = async () => {
    const values: { fileId: string; lines: ScheduleLineV1[] }[] = [];
    const taskWarnings: string[] = [];
    const failures: SkillFailureKind[] = [];
    const startedAt = Date.now();
    for (const doc of scheduleDocs) {
      const res = await runStage(env, {
        aiRunId: run.id, projectId, skill: scheduleExtractor,
        input: {
          text: doc.roleText.schedule ?? doc.markdown,
          imageDataUrl: doc.imageDataUrl,
          docName: doc.filename,
          checksum: doc.checksum,
          pageNumbers: doc.rolePages.schedule,
        },
        signals: (data) => ({
          criticalConfidence: data
            ? Object.fromEntries(data.lines.slice(0, 50).map((l, i) => [`line_${i}_dims`, l.confidence.dimensions ?? 0]))
            : undefined,
        }),
      });
      taskWarnings.push(...res.warnings);
      if (res.ok && res.data) values.push({ fileId: doc.fileId, lines: res.data.lines });
      else if (res.failureKind) failures.push(res.failureKind);
    }
    return { values, warnings: taskWarnings, failures, durationMs: Date.now() - startedAt };
  };

  const planTask = async () => {
    const values: { fileId: string; context: PlanContextV1 }[] = [];
    const taskWarnings: string[] = [];
    const failures: SkillFailureKind[] = [];
    const startedAt = Date.now();
    for (const doc of planDocs) {
      const res = await runStage(env, {
        aiRunId: run.id, projectId, skill: planContextExtractor,
        input: {
          text: doc.roleText.plans ?? doc.markdown,
          imageDataUrl: doc.imageDataUrl,
          docName: doc.filename,
          checksum: doc.checksum,
          pageNumbers: doc.rolePages.plans,
        },
      });
      taskWarnings.push(...res.warnings);
      if (res.ok && res.data) values.push({ fileId: doc.fileId, context: res.data });
      else if (res.failureKind) failures.push(res.failureKind);
    }
    return { values, warnings: taskWarnings, failures, durationMs: Date.now() - startedAt };
  };

  const energyTask = async () => {
    let value: { fileId: string; extraction: EnergyExtraction } | null = null;
    const taskWarnings: string[] = [];
    const failures: SkillFailureKind[] = [];
    const startedAt = Date.now();
    for (const doc of energyDocs) {
      if (!doc.markdown) {
        taskWarnings.push(`energy_report_image_only:${doc.filename}`);
        continue;
      }
      const res = await runStage(env, {
        aiRunId: run.id, projectId, skill: energyReportExtractor,
        input: { text: doc.roleText.energy_report ?? doc.markdown, checksum: doc.checksum },
      });
      taskWarnings.push(...res.warnings);
      if (res.ok && res.data) {
        if (!value) value = { fileId: doc.fileId, extraction: res.data };
        else taskWarnings.push(`multiple_energy_reports:${doc.filename}`);
      } else if (res.failureKind) {
        failures.push(res.failureKind);
      }
    }
    return { value, warnings: taskWarnings, failures, durationMs: Date.now() - startedAt };
  };

  const [scheduleBatch, planBatch, energyBatch] = await Promise.all([
    scheduleTask(),
    planTask(),
    energyTask(),
  ]);
  const perDoc = scheduleBatch.values;
  const planContexts = planBatch.values;
  const energy = energyBatch.value;
  warnings.push(...scheduleBatch.warnings, ...planBatch.warnings, ...energyBatch.warnings);
  stageFailures.push(...scheduleBatch.failures, ...planBatch.failures, ...energyBatch.failures);
  let anyFailed = stageFailures.length > 0;
  phase("document_skills", {
    durationMsObserved: Date.now() - documentSkillsStartedAt,
    scheduleDurationMs: scheduleBatch.durationMs,
    planDurationMs: planBatch.durationMs,
    energyDurationMs: energyBatch.durationMs,
    scheduleDocuments: scheduleDocs.length,
    planDocuments: planDocs.length,
    energyDocuments: energyDocs.length,
  });

  if (!perDoc.length) {
    const failureKind = dominantFailure(stageFailures) ?? "business_incomplete";
    const errorCode = failureKind === "business_incomplete" ? "NO_USABLE_OPENINGS" : errorCodeForFailure(failureKind);
    const summary: AiExtractionSummary = {
      runId: run.id, status: "failed", documents: docs.length, extractedLines: 0,
      conflicts: 0, energyApplied: 0, buildingModelId: null, estimate: null,
      stageWarnings: warnings, failureKind, errorCode,
    };
    await completeAiRun(env, run.id, { status: "failed", errorCode, summary });
    return summary;
  }

  // Merge, model, persist the canonical records.
  await setProgress("building_envelope");
  const merged = mergeScheduleLines(perDoc);
  const model = linesToBuildingModel(projectId, merged, docs);

  // Plan-parse enrichment (02-design-v2.md §4) — runDrawingEnrichmentStage
  // owns the mode gate, the R2-key lookup and the container/model wiring
  // (worker/lib/drawing/enrich.ts, unit-tested there — it never throws;
  // this try/catch only covers the schedule-row mapping around the call).
  // Applied BEFORE applyPlanContext so its wallOrientation ??= (the
  // text-derived fallback) cannot override a reading (§3.5).
  let drawingReadings: Awaited<ReturnType<typeof runDrawingEnrichmentStage>>["readings"] = [];
  let drawingReport: Awaited<ReturnType<typeof runDrawingEnrichmentStage>>["report"] = null;
  try {
    const planPdfDocs = planDocs.filter((d) => d.kind === "pdf").map((d) => ({ fileId: d.fileId }));
    const scheduleRows = merged.lines
      .filter((l): l is typeof l & { tag: string; widthMm: number; heightMm: number } => !!l.tag && l.widthMm != null && l.heightMm != null)
      .map((l) => ({ tag: l.tag, widthMm: l.widthMm, heightMm: l.heightMm, typeText: l.typeText ?? null, commentText: l.notes ?? null }));
    const onProgress = opts.processingToken
      ? async (done: number, total: number) => setDrawingProgress(env, projectId, sourceGeneration, opts.processingToken!, done, total)
      : undefined;
    const result = await runDrawingEnrichmentStage(env, { projectId, aiRunId: run.id, planPdfDocs, scheduleRows, onProgress });
    drawingReadings = result.readings;
    drawingReport = result.report;
    applyDrawingOrientation(model, drawingReadings);
    if (drawingReport) {
      await env.DB.prepare("UPDATE ai_runs SET drawing_report_json=? WHERE id=?")
        .bind(JSON.stringify(drawingReport), run.id).run().catch(() => {});
      const files = drawingReport.files;
      console.log({
        event: "drawing_enrichment", aiRunId: run.id, projectId,
        filesTried: files.length,
        containerCalls: files.reduce((sum, file) => sum + file.containerCalls, 0),
        modelCalls: files.reduce((sum, file) => sum + file.modelCalls, 0),
        readingsProduced: drawingReadings.length,
        notReadCount: drawingReadings.filter((reading) => reading.splitState !== "value").length,
        wallMs: files.reduce((sum, file) => sum + file.wallMs, 0),
        inspectTimings: files.map((file) => file.inspectTimings ?? null),
      });
    }
    if (drawingReadings.length) {
      await persistReadings(env, projectId, run.id, drawingReadings).catch((error) => {
        warnings.push(`drawing_readings_persist_failed:${error instanceof Error ? error.name : "Error"}`);
      });
    }
  } catch (err) {
    warnings.push(`drawing_enrichment_failed:${err instanceof Error ? err.name : "Error"}`);
  }

  applyPlanContext(model, planContexts);
  const technicalReviewReasons = new Map<string, Set<string>>();
  const flagOpening = (externalRef: string, reason: string) => {
    const current = technicalReviewReasons.get(externalRef) ?? new Set<string>();
    current.add(reason);
    technicalReviewReasons.set(externalRef, current);
  };

  // WS5: propose a composite split where the schedule COMMENT describes one. The
  // model extracts a structured `split` from the free-text comment (flexible to
  // wording); the deterministic parser is the fallback. The proposal is ALWAYS
  // review-flagged — a smart starting point, never a final answer. The hint is
  // both surfaced as a review reason AND passed to the estimator, which
  // materialises the composite (parent + priced segments) for comment and
  // oversize openings.
  const splitHints = new Map<string, SplitHint>();
  // The schedule's TYPE text, verbatim and per tag. operation_type is stored
  // normalised — operationFrom() maps "OFFSET AWNING" to plain "awning" — so
  // without this the family default cannot tell a centred make-up from an
  // offset one, and the estimator has no other copy of the wording.
  const scheduleTypes = new Map<string, string>();
  for (const l of merged.lines) {
    if (l.tag && l.typeText) scheduleTypes.set(l.tag, l.typeText);
  }
  const built = buildSplitHints(merged.lines, drawingReadings);
  for (const [tag, hint] of built.splitHints) splitHints.set(tag, hint);
  for (const [tag, reasons] of built.flags) for (const reason of reasons) flagOpening(tag, reason);

  // Path 1 (§10.1): report configuration/performance is authoritative, while
  // architectural dimensions describe the constructed opening. Map both onto
  // the opening graph; represent mismatches and surface unmatched constraints.
  let energyApplied = 0;
  let energyReviewWarnings: string[] = [];
  let energyConflictWarnings: string[] = [];
  if (energy) {
    const mapped = mapEnergyToOpenings(energy.extraction, model.openings);
    energyReviewWarnings = mapped.reviewWarnings;
    energyConflictWarnings = mapped.conflictWarnings;
    for (const o of model.openings) {
      const authority = mapped.authoritativeOpenings.get(o.externalRef);
      if (authority) {
        applyEnergyAuthority(o, authority);
      }
      const components = mapped.components.get(o.externalRef);
      if (components?.length) {
        o.thermalComponents = components;
        const authorityAxis = authority?.axis ?? "vertical";
        const componentUnits = components.map((component) => ({
          operation: component.operationType ?? "fixed",
          count: 1,
          widthMm: component.widthMm,
          heightMm: component.heightMm,
          ref: component.ref,
          requirement: component.requirement,
          performanceTypeId: component.performanceTypeId,
          performanceDescription: component.performanceDescription,
          glazingNote: component.glazingNote,
        }));
        // OWNER RULE (2026-08-06): THE PLAN WINS THE GEOMETRY. It is the
        // architectural contract; the energy report is produced later, can carry
        // human error, and can be biased toward a particular product's size
        // limits. The report is the FIRST FALLBACK when the plan says nothing
        // about how an opening is divided.
        //
        // This used to be decided by nothing but write order — the loop below the
        // plan's own loop set the SAME map key, so the report always landed last
        // and silently replaced a split the drawings had specified. A hint that
        // came from the plan now keeps its units; the report's components ride
        // along in `components` so the thermal targets they carry can still be
        // attached to whatever the plan produced (plans do not carry targets).
        const planHint = splitHints.get(o.externalRef);
        // "plans" (a drawing reading) wins the geometry same as
        // "schedule_comment" always has (§3.4 point 4) — only when nothing
        // but the energy report proposed a shape does the report supply one.
        if (planHint && planHint.source !== "energy_report") {
          planHint.components = componentUnits;
        } else {
          splitHints.set(o.externalRef, {
            source: "energy_report",
            axis: authorityAxis,
            raw: components.map((component) => component.ref).join(" + "),
            units: componentUnits,
          });
        }
      }
      const req = mapped.requirements.get(o.externalRef);
      if (!req) continue;
      energyApplied++;
      o.thermalRequirement = {
        basis: req.basis, maxUValue: req.maxUValue, shgcTarget: req.shgcTarget,
        shgcMin: req.shgcMin, shgcMax: req.shgcMax, zoneType: req.zoneType,
        operablePercent: req.operablePercent, notes: req.notes,
      };
      o.evidence.push({
        entityPath: `/openings/${o.externalRef}/thermal_requirement`,
        fileId: energy.fileId, pageNo: null, sheetRef: null, region: null,
        extractedText: [
          req.sourceRef ? `report ref ${req.sourceRef} (${req.matchKind})` : `type rule (${req.matchKind})`,
          req.maxUValue != null ? `Uw<=${req.maxUValue}` : null,
          req.shgcMin != null || req.shgcMax != null ? `SHGC ${req.shgcMin ?? "-"}..${req.shgcMax ?? "-"}` : null,
        ].filter(Boolean).join(" · "),
        origin: "explicit", confidence: null,
      });
    }
    model.conflicts.push(...mapped.conflicts);
    for (const conflict of mapped.conflicts.filter((item) => item.reviewRequired)) {
      flagOpening(
        conflict.entity,
        conflict.field === "thermalRequirement"
          ? "energy_requirement_ambiguous"
          : conflict.field === "configuration"
            ? "energy_configuration_conflict"
            : conflict.field === "context"
              ? "energy_requirement_context_mismatch"
              : "energy_dimension_conflict",
      );
    }
    for (const warning of mapped.reviewWarnings) {
      const ref = warning.split(":", 1)[0];
      if (model.openings.some((opening) => opening.externalRef === ref)) flagOpening(ref, warning);
    }
    model.inputMode = planContexts.length ? "plans_plus_energy_report" : "schedule_only";
    model.energyAssessment = {
      certificateRef: energy.extraction.certificateRef, starRating: energy.extraction.starRating,
      heatingLoad: null, coolingLoad: null, precedenceStatement: energy.extraction.precedenceStatement,
    };
    for (const u of mapped.unmatched) {
      const sameRef = u.ref
        ? model.openings.find((opening) => normalizeOpeningRef(opening.externalRef) === normalizeOpeningRef(u.ref))
        : null;
      if (sameRef) {
        flagOpening(sameRef.externalRef, "energy_requirement_context_mismatch");
      } else {
        // A report requirement with no corresponding schedule opening is a
        // project-level reconciliation problem. Propagate it to every proposed
        // line so the quote cannot silently present itself as review-free.
        for (const opening of model.openings) {
          flagOpening(opening.externalRef, "energy_requirement_unmatched");
        }
      }
      model.assumptions.push({
        fact: `unmatched_energy_constraint:${u.ref ?? u.elementHint ?? "?"}`,
        origin: "unknown", note: "energy-report constraint matched no schedule opening — review required",
      });
    }
  }

  // Path 3 (Phase 4): compute the requirement for every opening no report has
  // effectively answered, against the OWNER'S DIAL resolved once for the whole
  // run — one read, and every requirement this run produces snapshots the same
  // record, so turning the dial mid-run cannot split a project across two
  // defaults. Snapshotted immutably into requirement_json below.
  const dial = await resolveActiveDefaultBand(env.DB);
  const { archetype, counts: envelopeCounts } = applyDefaultEnvelope(model, dial);

  await assertCurrentGeneration(env, projectId, sourceGeneration, opts.processingToken);

  const buildingModelId = uuid();
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO building_models (id, project_id, ai_run_id, schema_version, status, model_json, confidence_json)
       VALUES (?,?,?,?, 'draft', ?, ?)`,
    ).bind(buildingModelId, projectId, run.id, model.schemaVersion, JSON.stringify(model),
      JSON.stringify({ schedule_extraction_confidence: avgConfidence(model.openings) })),
  ];
  for (const o of model.openings) {
    for (const ev of o.evidence) {
      stmts.push(env.DB.prepare(
        `INSERT INTO evidence_items (id, project_id, ai_run_id, entity_path, file_id, page_no, sheet_ref, region_json, extracted_text, origin, confidence)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(uuid(), projectId, run.id, ev.entityPath, ev.fileId, ev.pageNo, ev.sheetRef,
        ev.region ? JSON.stringify(ev.region) : null, ev.extractedText, ev.origin, ev.confidence));
    }
    const tr = o.thermalRequirement;
    // Absence of a requirement is not a "default envelope". Persist no
    // requirement row unless an explicit/default pathway actually produced one.
    if (tr) stmts.push(env.DB.prepare(
      `INSERT INTO opening_requirements (id, project_id, building_model_id, external_ref, parent_opening_id, requirement_basis,
         max_u_value, shgc_target, shgc_min, shgc_max, confidence_json, requirement_json, review_state)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'unreviewed')`,
    ).bind(uuid(), projectId, buildingModelId, o.externalRef, null, tr.basis,
      tr.maxUValue, tr.shgcTarget, tr.shgcMin, tr.shgcMax,
      JSON.stringify(o.confidence),
      JSON.stringify(requirementSnapshot(o, archetype, dial))),
    );
  }
  await env.DB.batch(stmts);

  // Bridge into the deterministic selection substrate (only when the project has
  // no openings yet — same idempotence convention as the parse-line bridge).
  // requirements_json feeds the deterministic HARD RULES (rules.ts energy filter):
  // an explicit Uw/SHGC requirement is enforced by the same engine as before —
  // the LLM supplies the target, never the pass/fail decision.
  // SCAFFOLD WS2/WS5: serialise the RESOLVED, coherent band (never min>max), and
  // per-lite bands for composites. Route computed/ambiguous bands to
  // advisoryRequirements (soft) rather than requirements (hard). Plan §2/WS2.
  const reqJson = (o: OpeningV1) => o.thermalRequirement
    ? JSON.stringify({ maxUValue: o.thermalRequirement.maxUValue, minShgc: o.thermalRequirement.shgcMin, maxShgc: o.thermalRequirement.shgcMax })
    : null;
  // UPSERT by external_ref: runs fire automatically per upload (owner decision),
  // so a schedule-then-plan-then-report sequence must ADD new openings and
  // REFRESH known ones — never skip, and never clobber a known value with null
  // (COALESCE keeps the best evidence seen so far).
  const { results: existingRows } = await env.DB
    .prepare("SELECT id, external_ref, edited_fields, requirements_json FROM opening_instance WHERE project_id = ? AND external_ref IS NOT NULL")
    .bind(projectId).all<{ id: string; external_ref: string; edited_fields: string | null; requirements_json: string | null }>();
  const byRef = new Map((existingRows ?? []).map((r) => [r.external_ref, r]));
  const { results: quoteRows } = await env.DB.prepare(
    `SELECT id, external_ref, qty, options_json
       FROM quote_line
      WHERE project_id = ? AND external_ref IS NOT NULL`,
  ).bind(projectId).all<{ id: string; external_ref: string; qty: number; options_json: string | null }>();
  const quoteByRef = new Map((quoteRows ?? []).map((row) => [row.external_ref, row]));
  const upserts: D1PreparedStatement[] = [];
  for (const o of model.openings) {
    if (o.externalRef.startsWith("UNTAGGED")) continue;
    const existing = byRef.get(o.externalRef);
    const quoteLine = quoteByRef.get(o.externalRef);
    const scheduleOptions = {
      ...safeObject(quoteLine?.options_json),
      glassDescription: o.scheduleRequirements.glassDescription,
      doubleGlazed: o.scheduleRequirements.doubleGlazed,
      colour: o.scheduleRequirements.colour,
      flyscreen: o.scheduleRequirements.flyscreen,
    };
    const context = thermalContextFor(model, o, [...(technicalReviewReasons.get(o.externalRef) ?? [])]);
    const requirementBasis = o.thermalRequirement?.basis ?? null;
    if (existing) {
      // HUMAN-EDIT GUARD: a field a human set is never overwritten by a document
      // re-run — the human is the highest-precedence source. Locked fields have
      // their incoming value nulled so COALESCE keeps the human's value.
      let locked: string[] = [];
      try { const v = JSON.parse(existing.edited_fields || "[]"); if (Array.isArray(v)) locked = v; } catch { /* unreadable ⇒ no locks */ }
      const unless = (field: string, value: unknown) => (locked.includes(field) ? null : value);
      upserts.push(env.DB.prepare(
        `UPDATE opening_instance SET
           group_code = COALESCE(?, group_code), family = COALESCE(?, family),
           operation_type = COALESCE(?, operation_type),
           width_mm = COALESCE(?, width_mm), height_mm = COALESCE(?, height_mm),
           requirements_json = ?,
           quote_line_id = COALESCE(?, quote_line_id), qty = COALESCE(?, qty),
           options_json = COALESCE(?, options_json), context_json = ?,
           requirement_basis = ?, source_generation = ?
         WHERE id = ?
           AND EXISTS (
             SELECT 1 FROM project p
              WHERE p.id=opening_instance.project_id AND p.ai_generation=?
                AND p.status_customer='draft'
           )`,
      ).bind(unless("group_code", o.parentRef), unless("family", o.elementType === "door" ? "doors" : "windows"),
        unless("operation_type", operationFrom(o.configuration.familyRequested)),
        unless("width_mm", o.widthMm), unless("height_mm", o.heightMm),
        locked.includes("requirements_json") ? existing.requirements_json : reqJson(o), quoteLine?.id ?? null,
        unless("qty", quoteLine?.qty ?? o.quantity), unless("options_json", JSON.stringify(scheduleOptions)),
        JSON.stringify(context), requirementBasis, sourceGeneration, existing.id, sourceGeneration));
    } else {
      upserts.push(env.DB.prepare(
        `INSERT INTO opening_instance
           (id, project_id, external_ref, group_code, family, operation_type, width_mm, height_mm,
            requirements_json, quote_line_id, qty, options_json, context_json, requirement_basis,
            source_generation, status)
         SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'extracted'
           WHERE EXISTS (
             SELECT 1 FROM project
              WHERE id=? AND ai_generation=? AND status_customer='draft'
           )`,
      ).bind(uuid(), projectId, o.externalRef, o.parentRef, o.elementType === "door" ? "doors" : "windows",
        operationFrom(o.configuration.familyRequested), o.widthMm, o.heightMm, reqJson(o),
        quoteLine?.id ?? null, quoteLine?.qty ?? o.quantity, JSON.stringify(scheduleOptions),
        JSON.stringify(context), requirementBasis, sourceGeneration, projectId, sourceGeneration));
    }
  }
  await assertCurrentGeneration(env, projectId, sourceGeneration, opts.processingToken);
  if (upserts.length) await env.DB.batch(upserts);
  await assertCurrentGeneration(env, projectId, sourceGeneration, opts.processingToken);
  phase("envelope_and_model");
  await setProgress("matching_and_pricing");
  const estimate = await runProjectEstimate(env, projectId, {
    aiRunId: run.id,
    buildingModelId,
    sourceGeneration,
    sourceManifestHash,
    processingToken: opts.processingToken,
  }, { splitHints, scheduleTypes });

  // Room application stays after estimate because quote_line rows do not
  // exist earlier. Readings/report were persisted immediately after
  // enrichment so a later estimate failure cannot erase diagnostics.
  if (drawingReadings.length) {
    try {
      await applyDrawingRoom(env, projectId, drawingReadings);
    } catch (err) {
      warnings.push(`drawing_readings_persist_failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  phase("estimate_and_pricing", {
    openings: estimate.openings,
    selected: estimate.selected,
  });

  const status = anyFailed ? "partial" : "completed";
  const summary: AiExtractionSummary = {
    runId: run.id, status, documents: docs.length,
    extractedLines: merged.lines.length, conflicts: model.conflicts.length, energyApplied,
    ...modelReachCounters(energyApplied, envelopeCounts),
    selectionTiers: estimate.tierCounts ?? null,
    buildingModelId, estimate: { openings: estimate.openings, selected: estimate.selected },
    cartApplied: estimate.appliedToCart,
    stageWarnings: warnings,
    // Persist source reconciliation for audit/staff review. Architectural
    // dimensions already resolve these conflicts, so the customer estimator
    // does not turn them into a project-level warning or navigation task.
    discrepancyWarnings: [...new Set(energyConflictWarnings)],
  };
  await setProgress("preparing_quote");
  await completeAiRun(env, run.id, { status, inputMode: model.inputMode, summary });
  return summary;
  } catch (error) {
    console.log({
      event: "ai_pipeline_error", aiRunId: run.id, projectId,
      name: error instanceof Error ? error.name : "Error",
      message: (error instanceof Error ? error.message : String(error)).slice(0, 300),
      phase: lastPhase,
    });
    const stale = error instanceof Error && error.message === "ai_job_stale_before_publish";
    const failureKind = stale ? "stale_generation" : dominantFailure(stageFailures);
    const errorCode = stale ? "STALE_GENERATION" : (failureKind ? errorCodeForFailure(failureKind) : "PIPELINE_INTERNAL_ERROR");
    const summary: AiExtractionSummary = {
      runId: run.id,
      status: "failed",
      documents: 0,
      extractedLines: 0,
      conflicts: 0,
      energyApplied: 0,
      buildingModelId: null,
      estimate: null,
      stageWarnings: [...warnings, stale ? "stale_generation_before_publish" : "pipeline_failed"],
      failureKind,
      errorCode,
    };
    await completeAiRun(env, run.id, {
      status: "failed",
      errorCode,
      summary,
    }).catch(() => {});
    return summary;
  }
}

function dominantFailure(failures: SkillFailureKind[]): SkillFailureKind | null {
  const priority: SkillFailureKind[] = [
    "transient_rate_limit",
    "transient_provider",
    "provider_unavailable",
    "permanent_request",
    "invalid_output",
  ];
  return priority.find((kind) => failures.includes(kind)) ?? null;
}

function errorCodeForFailure(failure: SkillFailureKind): string {
  switch (failure) {
    case "transient_rate_limit": return "PROVIDER_RATE_LIMITED";
    case "transient_provider": return "PROVIDER_TEMPORARY_FAILURE";
    case "provider_unavailable": return "AI_UNAVAILABLE";
    case "permanent_request": return "PROVIDER_REQUEST_REJECTED";
    case "invalid_output": return "SCHEMA_VALIDATION_FAILED";
  }
}

async function assertCurrentGeneration(
  env: Env,
  projectId: string,
  sourceGeneration: number,
  processingToken?: string,
): Promise<void> {
  const project = await env.DB.prepare(
    "SELECT ai_generation, status_customer FROM project WHERE id = ?",
  ).bind(projectId).first<{ ai_generation: number; status_customer: string }>();
  if (!project || project.ai_generation !== sourceGeneration || project.status_customer !== "draft") {
    throw new Error("ai_job_stale_before_publish");
  }
  if (!processingToken) return;
  const claim = await env.DB.prepare(
    `SELECT 1 AS owned FROM ai_job_claim
      WHERE project_id=? AND source_generation=? AND status='processing' AND processing_token=?`,
  ).bind(projectId, sourceGeneration, processingToken).first<{ owned: number }>();
  if (!claim?.owned) throw new Error("ai_job_stale_before_publish");
}

function avgConfidence(openings: OpeningV1[]): number | null {
  const vals = openings.map((o) => o.confidence.dimensions).filter((v) => typeof v === "number");
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
}

function safeObject(value: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = value ? JSON.parse(value) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Raw schedule type text → the catalogue operation vocabulary (same mapping the
// parse-line bridge uses).
function operationFrom(typeText: string | null): string | null {
  const t = (typeText || "").toUpperCase();
  if (!t) return null;
  // Catalogue-authored aliases FIRST, so architect vocabulary added in Sanity is
  // understood identically by the AI and deterministic paths. Exact match only —
  // an unrecognised type resolves to null and yields no candidate (an honest
  // "we don't know", never a mispriced guess at a neighbouring family).
  const viaCatalogue = resolveScheduleType(typeText && /DOOR|ENTRY|STACKER|SLIDER/.test(t) ? "door" : "window", typeText).operationType;
  if (viaCatalogue) return viaCatalogue;
  if (t.includes("AWNING")) return "awning";
  if (t.includes("STACKER") || t.includes("SLIDING") || t.includes("SLIDER")) return "sliding";
  if (t.includes("FIXED")) return "fixed";
  if (t.includes("CASEMENT")) return "casement";
  if (t.includes("LOUVRE") || t.includes("LOUVER")) return "louvre";
  if (t.includes("BIFOLD") || t.includes("BI-FOLD") || t.includes("BI FOLD")) return "bi-fold";
  if (t.includes("HUNG")) return "double-hung";
  if (t.includes("HINGED") || t.includes("ENTRY")) return "hinged";
  return null;
}
