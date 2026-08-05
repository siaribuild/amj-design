// ═══════════════════════════════════════════════════════════════════════════════
// DRAWING RECOGNITION — the contracts
//
// Reading a set of architectural drawings well enough to know how a window is
// actually built. The owner's framing: "plans do have designed splits that can be
// recognised and therefore correctly tagged/split by a human… windows ID are
// identified for rooms and sides in the layouts, then side profile drawings
// reveal symbolic representation what that window should be built like."
//
// So it is a two-document join, and the drawing set supplies its own join key: a
// tag circle carries the window id AND the sheet where that window is drawn.
//
// ─── The governing separation ─────────────────────────────────────────────────
// OBSERVATION is convention-free geometry. INTERPRETATION is versioned data.
//
// A `SymbolObservation` says "two diagonals meet at the midpoint of the top
// edge". It does not say "awning". What that means is a drafting convention, and
// conventions differ between practices — so the meaning lives in a SymbolProfile
// that can be confirmed by a human and stored, never in a switch statement.
// Getting this backwards is how a systematic misread acquires a confident face.
//
// ─── Why geometry rather than a picture ───────────────────────────────────────
// An architectural PDF is not an image. A tag circle IS a closed subpath of four
// cubic Béziers; a mullion IS a near-vertical segment; an opening symbol IS a
// pair of diagonals meeting at an apex. unpdf is already a runtime dependency and
// getDocumentProxy is already imported by the ingest path, so this geometry is
// extractable in the Worker today with no new binding and no canvas.
//
// Measurement can be checked. Interpretation cannot.
// ═══════════════════════════════════════════════════════════════════════════════

/** A point in PAGE space: PDF user units, origin bottom-left, CTM already applied.
 *  Every producer in this module resolves the transform stack before emitting, so
 *  no consumer ever has to think about matrices. */
export interface Pt { x: number; y: number }

/** An axis-aligned box in page space. */
export interface Box { x0: number; y0: number; x1: number; y1: number }

/** A box expressed as fractions of the page, 0..1, origin TOP-left — the shape
 *  `evidence_items.region_json` stores so a reviewer can be shown the crop. Y is
 *  flipped from page space deliberately: every consumer of this value is a
 *  browser, and arguing about it at the call site is how it gets flipped twice. */
export type Region = [number, number, number, number];

// ─── Stage A: the sheet index ─────────────────────────────────────────────────

/** One straight run of the pen. Curves are flattened to segments by the walker;
 *  a Bézier that is genuinely curved becomes several. */
export interface Seg {
  a: Pt; b: Pt;
  /** Set when the segment was drawn with a dash pattern. The default convention
   *  reads dashed as "opens away from the viewer", so this is load-bearing for
   *  symbol interpretation and must survive extraction. */
  dashed: boolean;
  /** Page-space width. Mullions and frames are drawn heavier than symbols in most
   *  CAD output, which is a useful — but never decisive — hint. */
  width: number;
  /** The XObject nesting this segment was emitted inside, if any. Blocks are how
   *  CAD reuses a window type across a sheet, so a shared group id is strong
   *  evidence that two frames are the same product. */
  groupId: string | null;
}

/** A closed subpath whose sampled radius is near-constant — a circle in all but
 *  name. Tag circles and grid bubbles are both found this way and separated
 *  later, by what is written inside them rather than by how they are drawn. */
export interface Arc {
  centre: Pt;
  r: number;
  /** Sampled radius variance as a fraction of r. Used as the acceptance test. */
  variance: number;
  groupId: string | null;
}

/** A positioned text run. Taken from getTextContent() directly rather than from
 *  unpdf's extractTextItems, which discards the rotation components of the
 *  transform — that would mis-box the vertical dimension chains that run up the
 *  side of every floor plan. */
export interface TextRun {
  text: string;
  box: Box;
  /** Degrees anticlockwise from horizontal, derived from the text matrix. */
  rotationDeg: number;
  fontSize: number;
}

/** What a page is FOR. Derived from the title block and from what the page
 *  contains, never from the filename. */
export type SheetKind = "plan" | "elevation" | "section" | "detail" | "schedule" | "unknown";

/** Why a page yielded no usable geometry. Recorded rather than silently skipped:
 *  a customer whose drawings cannot be read deserves to be told which page and
 *  why, in time to send a better file. */
export type GeometryGap = "raster_page" | "over_budget" | "no_content_stream" | "encrypted";

export interface SheetIndexV1 {
  version: 1;
  fileId: string;
  pageNo: number;
  /** The sheet number from the title block — "S08". This is the value a tag
   *  circle's second line points at, and the whole join hangs off it. */
  sheetId: string | null;
  sheetKind: SheetKind;
  sheetTitle: string | null;
  texts: TextRun[];
  segs: Seg[];
  arcs: Arc[];
  /** Page dimensions in user units, for converting boxes to regions. */
  pageWidth: number;
  pageHeight: number;
  /** Set when this page produced no geometry, with the reason. */
  gap: GeometryGap | null;
  /** Identifies the extraction code that produced this, so a cached index from an
   *  older reader is not silently trusted by a newer one. */
  extractor: string;
}

// ─── Stage B: tags on a floor plan ────────────────────────────────────────────

/** A window tag harvested from a plan: the circle with two lines in it.
 *
 *  The discriminator against a grid bubble needs no semantics — a tag circle
 *  contains TWO text runs and sits inside the building outline; a grid bubble
 *  contains ONE character and sits outside it. */
export interface PlanTagObservation {
  /** Normalised through one primitive so "W-04" and "W04" are the same tag. */
  tag: string;
  /** The second line — the sheet this window is drawn on. Null when the circle
   *  carried only an id, which is common on smaller sets. */
  sheetRefText: string | null;
  centre: Pt;
  /** Where the leader lands, when there is one. */
  leaderTo: Pt | null;
  /** The wall segment the leader terminates on, and its compass direction. This
   *  is what turns a tag into "the north wall of BED 3" — computed from geometry
   *  rather than inferred from prose, which is the whole point. */
  wallSegIndex: number | null;
  wallAzimuthDeg: number | null;
  /** The room label whose text box is nearest on the inside of that wall. */
  roomLabel: string | null;
  region: Region;
}

// ─── Stage C: panels on an elevation ──────────────────────────────────────────

/** Raw geometry of what is drawn inside one panel. NO MEANING IS ATTACHED HERE.
 *
 *  Every field is something a tape measure could settle. "apexEdge: top" is an
 *  observation; whether that means the sash is hinged at the top is a convention,
 *  and conventions live in SymbolProfile. */
export interface SymbolObservation {
  marks: "none" | "diagonals" | "arrows" | "louvre_bars" | "mixed";
  /** Which edge of the panel the diagonals converge on. */
  apexEdge: "top" | "bottom" | "left" | "right" | null;
  /** One apex is a single sash; two is a pair meeting in the middle. */
  apexCount: 1 | 2 | null;
  /** Whether the symbol lines were dashed. Null when there are no lines to ask
   *  about — distinct from false, which means "drawn solid". */
  dashed: boolean | null;
  arrowAxis: "horizontal" | "vertical" | null;
  /** "left" | "right" | "up" | "down", or a pair for a double slider. */
  arrowDir: string | null;
  /** A horizontal division inside the panel — a double-hung meeting rail. */
  midRail: boolean;
  /** Any text found inside the panel box: some practices simply write "AWN". */
  legendText: string | null;
  /** 0..1. How cleanly the marks matched a known shape. NOT a confidence in the
   *  interpretation — only in the observation. */
  clarity: number;
}

/** One panel of one window group. */
export interface PanelObservation {
  /** Fraction of the group's width, left to right. Fractions rather than
   *  millimetres because an elevation's scale is not known until the join fits
   *  it, and storing a scaled figure would bake in a guess. */
  widthFrac: number;
  sillYFrac: number;
  headYFrac: number;
  symbol: SymbolObservation;
}

/** A window group found on an elevation: the frame and its panels. */
export interface ElevationGroupObservation {
  /** Index within the sheet, ordered left to right. */
  index: number;
  box: Box;
  region: Region;
  /** A W-number found written on or beside the frame. When present the join is
   *  decided and no inference is needed — the drawing labelled itself. */
  labelText: string | null;
  panels: PanelObservation[];
  /** Horizontal divisions spanning the full frame — transoms. */
  transomCount: number;
  /** The XObject block this frame was drawn from, when it came from one. Two
   *  groups sharing a block are the same window type by construction. */
  groupId: string | null;
}

// ─── Stage D: correlation ─────────────────────────────────────────────────────

/** Where a claim about a window came from. */
export type ClaimSource = "schedule" | "schedule_comment" | "energy_report" | "plan_tag" | "elevation";

/** One asserted fact with its provenance, so a conflict can name both sides. */
export interface Claim<T> {
  value: T;
  source: ClaimSource;
  /** For an elevation claim: the sheet and region that proves it. */
  sheetId?: string | null;
  region?: Region | null;
  /** 0..1 corroboration, never a self-reported model score. */
  confidence: number;
}

/** Two sources disagreeing about the same window.
 *
 *  Per the owner's decision the DRAWING wins and the disagreement is surfaced as
 *  a warning — it is not a reason to propose nothing. The conflict row exists so
 *  the reviewer can see what was overruled and why. */
export interface OpeningConflict {
  field: "panelCount" | "operations" | "width" | "height" | "sheetRef";
  kept: ClaimSource;
  overruled: ClaimSource;
  detail: string;
}

/** What v1 is allowed to claim about how a panel opens.
 *
 *  Three classes only, each convention-INDEPENDENT:
 *    fixed     — no marks at all. Absence needs no convention to read.
 *    sliding   — a horizontal arrow. A distinct glyph, not a chevron.
 *    operable  — any diagonal or chevron, family unresolved.
 *
 *  Awning-versus-hopper and casement hand ARE observed and recorded, and are
 *  deliberately not priced from the drawing until a practice's profile has been
 *  confirmed by a human. The family comes from the schedule's type column, which
 *  is text and is not a convention. */
export type PanelClass = "fixed" | "sliding" | "operable";

export interface CorrelatedPanel {
  klass: PanelClass;
  widthFrac: number;
  /** The raw observation, carried through so ops can see what was actually on the
   *  page rather than only our reading of it. */
  observation: SymbolObservation;
  /** The family we would price, once resolved against the schedule's type text. */
  operation: string | null;
}

export interface CorrelatedOpening {
  tag: string;
  roomLabel: string | null;
  wallAzimuthDeg: number | null;
  /** The sheet the tag pointed at, and the group we matched on it. */
  sheetId: string | null;
  groupIndex: number | null;
  panels: CorrelatedPanel[];
  claims: {
    panelCount: Claim<number> | null;
    widthMm: Claim<number> | null;
    heightMm: Claim<number> | null;
  };
  conflicts: OpeningConflict[];
  /** Leave-one-out width residual from the join fit, as a fraction. Persisted to
   *  evidence BEFORE the layout rescales widths to sum exactly, which destroys
   *  it. Without this a post-hoc error analysis has nothing to work with. */
  joinResidual: number | null;
  decision: RecognitionDecision;
}

/** What we are entitled to do with a reading.
 *
 *  The owner chose auto-apply (Q1c), so `propose` is the normal outcome and the
 *  composite reaches the customer as an ordinary composite. `ask` still exists
 *  for a reading we genuinely could not complete, and `silent` for one we should
 *  never have attempted — a raster page, an unrouted tag, a withdrawn set. */
export type RecognitionDecision = "propose" | "propose_and_ask" | "ask" | "silent";

/** The whole set's verdict. Set-level because a convention mismatch is a property
 *  of the producer, not of one window: if three openings disagree with their
 *  schedules IN THE SAME DIRECTION, that is one systematic error, not three
 *  independent ones, and every drawing-derived split in the set is withdrawn
 *  until a human confirms the profile (owner's Q4c). */
export interface RecognitionResult {
  openings: CorrelatedOpening[];
  /** Set when a systematic convention mismatch was detected and every
   *  drawing-derived split was withdrawn. */
  withdrawn: { reason: string; evidence: string } | null;
  /** Pages that yielded nothing, so the customer can be told which and why. */
  gaps: { pageNo: number; sheetId: string | null; gap: GeometryGap }[];
  /** Tags present on a plan but absent from the schedule, and vice versa. The
   *  roster reconciliation — today an untagged opening is silently dropped and
   *  the customer is never told. */
  rosterOnlyInPlans: string[];
  rosterOnlyInSchedule: string[];
  profileId: string;
}
