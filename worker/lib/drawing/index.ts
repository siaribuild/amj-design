// ═══════════════════════════════════════════════════════════════════════════════
// DRAWING RECOGNITION — public surface
//
// Reads a set of architectural drawings well enough to know how a window is
// actually built, so a designed split is recognised rather than guessed.
//
// THE STAGES, and why they are separate:
//
//   A  sheetIndex   PDF → geometry. The only stage that touches a document.
//   B  tags         plan pages  → PlanTagObservation[]   (which W, which wall)
//   C  frames       elevations  → ElevationGroupObservation[] (how it is built)
//   D  join         observations + schedule → CorrelatedOpening[]
//   E  project      → SplitHint for the existing split machinery
//
// B, C and D are PURE. They take geometry and return findings, with no I/O and
// no model call, which is what makes them testable against a fixture and what
// makes their answers reproducible. Only A touches R2 and only E touches D1.
//
// NOTHING HERE INVENTS A PARALLEL PIPELINE. Stage E writes into the same
// `splitHints` map the schedule-comment and energy-report paths already use, and
// the composite is built by the same proposeSplit → materialiseSplits → splitLine
// chain as every other split. The drawing is a new SOURCE, not a new mechanism.
// ═══════════════════════════════════════════════════════════════════════════════
export type {
  Pt, Box, Region, Seg, Arc, TextRun, SheetKind, GeometryGap, SheetIndexV1,
  PlanTagObservation, SymbolObservation, PanelObservation, ElevationGroupObservation,
  ClaimSource, Claim, OpeningConflict, PanelClass, CorrelatedPanel, CorrelatedOpening,
  RecognitionDecision, RecognitionResult,
} from "./types";

export type { CropBox } from "./crop";
export type { CropIntent, CropPage, CropRequest } from "./container";
export { buildCropRequest, MAX_CROPS_PER_CALL } from "./container";

export type { CropFailureReason, DecodedCrop, DecodedCropResponse } from "./containerClient";
export { encodeCropRequest, decodeCropResponse, callPlanParse } from "./containerClient";
export { cropBoxFor, MIN_CROP_WIDTH_PX } from "./crop";

export type { SymbolProfile, ApexMeaning, ViewBasis } from "./profile";
export { DEFAULT_PROFILE, classify, refineOperable, MISMATCH_QUORUM } from "./profile";

// Opening tags are keyed with normalizeOpeningRef (../ai/energyMap) — see ref.ts
// for why this module does not define a second one.
export { normalizeSheetId, azimuthToOrientation } from "./ref";

export {
  dist, segLength, segAngleDeg, isVertical, isHorizontal,
  boxOf, boxOfSegs, boxWidth, boxHeight, boxArea, contains, containsPt, intersects,
  toRegion, collapseParallel, midpoint, circleFit, edgeOf,
} from "./geometry";
