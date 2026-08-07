// ═══════════════════════════════════════════════════════════════════════════════
// ITEM COMPOSER — shared field blocks, the new-item form, and the MyProject card
//
//  • Sections: (1) Dimensions [+ configuration in future], (2) Options,
//    (3) Quantity & location. "How did you measure?" sits AFTER the size fields.
//  • MyProject items are cards whose sections expand/edit INLINE (one at a time) —
//    editing a section does not open the whole form; edits apply live.
//  • New items use the same field blocks in a form with a commit button.
//  • Product-first; picker = two dependent fields (Type → Product).
// ═══════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";
import { Check, AlertCircle, Info, ChevronDown, Plus, Minus, Pencil, Trash2, Copy, X, Sun, Snowflake } from "lucide-react";
import { SAGE, WindowMark, Btn, FieldLabel, Input } from "../app/ui";
import { type Product, getProductBySlug, getProductsByFamily } from "../data/catalogue";
import { fitsAlongside } from "../data/frameSystem";
import {
  type QItem, type QuoteState, type OptionChoice, type GlazingChoice,
  optionGroupsFor, defaultOptions, linePriceTotal, familyGroups, glazingChoicesFor,
  fmt, mm, productLabel, POPULAR_COLOURS, normCode, suggestCode, clearReviewKey, lineBlocksSubmission,
  NOTE_MAX,
} from "../data/configurator";
import { useGstMode, gstAdjust, gstSuffix } from "../data/gst";
import { previewPrice } from "../data/api";
import { brandSubject } from "../data/sanity";
import { Elevation } from "./quote-project/Elevation";

export type EditFocus = "product" | "dims" | "options" | "qty";

const BASIS_COPY: Record<string, { label: string; detail: string; strong?: boolean }> = {
  explicit_energy_report: {
    label: "Energy-report allowance",
    detail: "Priced using requirements extracted from your energy report. {brand} will confirm the final product and glazing configuration.",
    strong: true,
  },
  schedule_specification: {
    label: "Schedule-based allowance",
    detail: "Priced using the glazing and performance information in your uploaded schedule. {brand} will confirm the final configuration.",
  },
  building_context: {
    label: "Building-context allowance",
    detail: "Priced using the available room, opening and building context. {brand} will confirm the final thermal configuration.",
  },
  default_allowance: {
    label: "Default thermal allowance",
    detail: "Priced using a conservative default where the documents did not establish a specific thermal requirement. {brand} will confirm it.",
  },
  default_envelope: {
    label: "Thermal allowance inferred",
    detail: "Price includes a likely frame and glazing configuration based on the building information available. {brand} will confirm it during technical review.",
  },
};

const selectClass = "field-control w-full border pl-3 pr-9 py-2.5 text-ink focus:outline-none transition-colors appearance-none cursor-pointer t-bd-sm";

function inRangeFor(p: Product, w: number, h: number) {
  return (p.minWidth == null || w >= p.minWidth) && (p.maxWidth == null || w <= p.maxWidth)
    && (p.minHeight == null || h >= p.minHeight) && (p.maxHeight == null || h <= p.maxHeight);
}

// Validation issues that block submission, grouped by section — surfaced at the
// card level so they stay visible even when the offending section is collapsed.
interface Issue { section: EditFocus; msg: string }
function itemIssues(p: Product, it: { width: string; height: string; options: Record<string, string> }): Issue[] {
  const issues: Issue[] = [];
  const w = parseInt(it.width) || 0, h = parseInt(it.height) || 0;
  if (!w || !h) issues.push({ section: "dims", msg: "Enter the opening size" });
  // Only UNDERSIZE is an issue. An oversized opening is a real building the
  // customer cannot change; it carries a `fit` warning, prices best-fit and
  // stays submittable — the same treatment a parsed oversized line gets.
  else if ((p.minWidth != null && w < p.minWidth) || (p.minHeight != null && h < p.minHeight)) {
    issues.push({ section: "dims", msg: `Size is below the minimum for ${p.name}` });
  }
  for (const g of optionGroupsFor(p)) if (g.required && !it.options[g.typeSlug]) issues.push({ section: "options", msg: `Choose ${g.label.toLowerCase()}` });
  return issues;
}

// Does a saved item still need attention before it can be submitted?
export function itemNeedsAttention(item: QItem): boolean {
  const p = getProductBySlug(item.productSlug);
  if (!p || itemIssues(p, item).length > 0) return true;
  // Auto-parsed lines carry per-field review flags until the customer resolves them.
  return !!item.review && Object.keys(item.review).length > 0;
}

// ─── Field blocks (shared by the new-item form and the MyProject card) ────────
function DimensionsFields({ p, width, height, setWidth, setHeight, rail = false, lockedDimension,
  location, setLocation, isUnit = false, opening = false, parts, axis }: {
  /** Null for an OPENING with no product of its own — a composite parent. There
   *  is no size range to state and no family to draw, so the range copy and the
   *  drawing's symbols fall away with it. */
  p: Product | null; width: string; height: string;
  setWidth: (v: string) => void; setHeight: (v: string) => void; rail?: boolean;
  lockedDimension?: "width" | "height";
  /** The note rides in THIS group now (owner). It was the back half of a
   *  "Quantity & note" section whose front half is gone, and a group holding
   *  one optional text field is a disclosure that never earns its click.
   *
   *  Present on openings AND units. Only the placeholder differs: an opening's
   *  asks for a location in the building, which a unit sitting inside one
   *  opening has already been told. */
  location?: string; setLocation?: (v: string) => void;
  isUnit?: boolean;
  opening?: boolean;
  /** A composite's units, so the editor draws the opening that is actually
   *  being made — proportional panels, each unit's own symbol, mullions at the
   *  real joins — exactly as the list row does. Without them a composite parent
   *  fell back to the plain `opening` square, which is right for an opening with
   *  nothing in it and wrong for one built from two frames (owner). */
  parts?: { productSlug: string; alongMm: string | number; qty?: number }[];
  axis?: "vertical" | "horizontal" | null;
}) {
  const w = parseInt(width) || 0, h = parseInt(height) || 0;
  const dimsEntered = w > 0 && h > 0;
  const inRange = !!p && inRangeFor(p, w, h);
  const tooSmall = !!p && dimsEntered && ((p.minWidth != null && w < p.minWidth) || (p.minHeight != null && h < p.minHeight));
  // The "these look reversed — Swap" notice is GONE (owner). A tall sliding
  // window or a door taller than it is wide is an ordinary building, and the
  // notice called it a problem on no evidence beyond an aspect ratio — it was
  // dressed as a warning and offered a button that silently rewrote two
  // measurements the customer had just read off a wall.
  return (
    <div>
      <div className={`flex gap-4 ${rail ? "flex-col" : "flex-col md:flex-row"}`}>
        {/* The drawing IS the dimension field's feedback, and it REPLACES the
            old FrameDiagram rather than sitting above it. That was a plain
            rectangle with the letters W and H: it knew the aspect ratio and
            nothing else — not the product, not the panel count, not which way
            the sash opens — and it labelled the sides "W" and "H" instead of
            showing the numbers being typed.
            Live by construction: `width` and `height` ARE these fields' state,
            so there is no callback and no second copy of the values. */}
        <div className={`${rail ? "w-full" : "md:w-44 flex-shrink-0"} flex justify-center`}>
          {/* parts wins over opening: a composite draws what it is built from,
              and the plain square is only for an opening with nothing in it yet.
              Elevation applies the same precedence. */}
          <Elevation productSlug={p?.slug ?? ""} opening={opening} parts={parts} axis={axis}
            widthMm={width} heightMm={height}
            size="sm" className="w-[180px] h-[180px] max-w-full text-body" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <FieldLabel>Width — horizontal (mm)</FieldLabel>
            <Input type="number" inputMode="numeric" value={width} onChange={e => setWidth(e.target.value)} placeholder="e.g. 1810" disabled={lockedDimension === "width"} />
          </div>
          <div>
            <FieldLabel>Height — vertical (mm)</FieldLabel>
            <Input type="number" inputMode="numeric" value={height} onChange={e => setHeight(e.target.value)} placeholder="e.g. 1210" disabled={lockedDimension === "height"} />
          </div>
          {/* "You have entered: 1810 wide × 1210 high" is gone (owner). The
              drawing directly above now carries both figures as dimension
              leaders, measured off the same state these inputs hold — so the
              line restated, in words, two numbers already shown twice: once in
              the fields being typed into and once on the elevation. */}
          {!dimsEntered && p && (
            <p className="text-body t-cap">Fits {mm(p.minWidth ?? 0)}–{mm(p.maxWidth ?? 0)} wide, {mm(p.minHeight ?? 0)}–{mm(p.maxHeight ?? 0)} high.</p>
          )}
          {tooSmall && p && (
            <div className="quote-notice--danger flex items-start gap-2 border border-destructive/35 px-3 py-2 t-cap">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-destructive" />
              <span>{p.name} starts at {mm(p.minWidth ?? 0)} wide and {mm(p.minHeight ?? 0)} high. Check the measurement.</span>
            </div>
          )}
          {/* The oversize notice is GONE (owner). It explained our manufacturing
              limit and what we would do about it — "no single X is made this
              large … built as two or more units joined on site" — to a customer
              who cannot change the size of their wall and has no decision to
              make. The line still carries its technical `fit` flag, so the
              constraint reaches the people it is actually for. */}
          {setLocation && (
            <div>
              <FieldLabel>Note</FieldLabel>
              {/* One label, so it reads as the same field wherever it appears.
                  Different placeholder on a unit: a unit sits inside one
                  opening, so asking it for a room re-asks a question the
                  opening already answered. */}
              {/* "(optional)" is gone (owner): optionality is expressed by not
                  being validated as required, not by a word in the label. The
                  field IS validated — capped at NOTE_MAX, the same 500 the ops
                  note has always used, enforced here and again on the server.
                  Injection is not a length question: every write is a
                  parameterised D1 bind and every render is React-escaped text,
                  so the gap this closes is an unbounded string, not a quoting
                  one. */}
              <Input value={location ?? ""} maxLength={NOTE_MAX}
                onChange={e => setLocation(e.target.value.slice(0, NOTE_MAX))}
                placeholder={isUnit ? "e.g. left leaf, obscure glass here" : "e.g. Bedroom 1, north elevation"} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Responsive option grid — fills the available width: 2 columns when narrow (e.g.
// the PDP side rail), 3–4 as the container widens (the full-width quote card).
const OPTION_GRID = "grid grid-cols-2 @md:grid-cols-3 @xl:grid-cols-4 gap-1.5";

// A single option choice — unified across every option group. Colours pass a `hex`
// so the swatch shows; text options (hardware, flyscreen…) omit it. Same size.
function OptionButton({ label, hex, selected, onPick }: { label: string; hex?: string; selected: boolean; onPick: () => void }) {
  return (
    <button onClick={onPick} aria-pressed={selected} title={label}
      className="quote-option flex items-center gap-2 px-2.5 py-2 border text-left transition-colors cursor-pointer min-w-0">
      {hex !== undefined && <span className="w-4 h-4 flex-shrink-0 border border-black/25" style={{ backgroundColor: hex || "var(--muted)" }} aria-hidden="true" />}
      <span className="text-ink truncate flex-1 t-cap">{label}</span>
      {selected && <Check className="w-3.5 h-3.5 text-sage flex-shrink-0" aria-hidden="true" />}
    </button>
  );
}

// Colour picker: the four most-popular colours for direct selection, with the full
// standard range available under "Other". Every choice shows its name and swatch.
function ColourChoices({ choices, value, onPick }: { choices: OptionChoice[]; value: string; onPick: (name: string) => void }) {
  const popular = POPULAR_COLOURS.map(n => choices.find(c => c.name === n)).filter(Boolean) as OptionChoice[];
  const isPopular = POPULAR_COLOURS.includes(value);
  const [showAll, setShowAll] = useState(!isPopular && !!value); // reveal the full list if a non-popular colour is selected
  return (
    <div>
      <div className={OPTION_GRID}>
        {popular.map(c => <OptionButton key={c.name} label={c.name} hex={c.hex} selected={value === c.name} onPick={() => onPick(c.name)} />)}
      </div>
      <button onClick={() => setShowAll(s => !s)} aria-expanded={showAll}
        className="mt-2 flex items-center gap-1 font-medium text-sage hover:text-sage-hover cursor-pointer t-cap">
        {showAll ? "Hide other colours" : "Other colours"}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAll ? "rotate-180" : ""}`} />
      </button>
      <div className="disclose" data-open={showAll ? "true" : "false"}>
        <div>
          <p className="text-body pt-2 pb-1.5 t-label">All standard colours</p>
          <div className={OPTION_GRID}>
            {choices.map(c => <OptionButton key={c.name} label={c.name} hex={c.hex} selected={value === c.name} onPick={() => onPick(c.name)} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// Star rating as glyphs (half-star aware), tinted by what it measures.
function StarRating({ value, className }: { value?: number | null; className: string }) {
  if (value == null) return <span className="text-quieter">—</span>;
  const half = Math.round(value * 2) / 2, full = Math.floor(half), hasHalf = half - full >= 0.5;
  return (
    <span className={`whitespace-nowrap ${className}`} title={`${value.toFixed(1)} stars`}>
      {"★".repeat(full)}{hasHalf ? "½" : ""}
    </span>
  );
}

// Glazing picker: every build-up the frame offers (WERS long name + ratings), led by
// the heating/cooling trade-off a buyer can actually use. The ops-ordered list is the
// default order (first = recommended when no thermal requirement); the lens re-sorts
// without hiding any option. The chosen build-up is priced per m² server-side.
function GlazingChoices({ choices, value, onPick }: { choices: GlazingChoice[]; value: string; onPick: (slug: string) => void }) {
  const [lens, setLens] = useState<"allround" | "warmth" | "cooling">("allround");
  const list = lens === "allround" ? choices : [...choices].sort((a, b) =>
    lens === "warmth" ? (b.heatingStars ?? 0) - (a.heatingStars ?? 0) : (b.coolingStars ?? 0) - (a.coolingStars ?? 0));
  const recommended = choices[0]?.slug; // first in the ops list = the no-requirement default
  const lensBtn = (k: typeof lens, label: string) => (
    <button key={k} onClick={() => setLens(k)} aria-pressed={lens === k}
      className="quote-option px-2 py-1 border transition-colors cursor-pointer">{label}</button>
  );
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 text-body t-cap">
        <span>Sort</span>
        {lensBtn("allround", "All-round")}{lensBtn("warmth", "Warmth")}{lensBtn("cooling", "Cooling")}
        <span className="ml-auto text-quieter">{choices.length} options</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {list.map(c => {
          const sel = c.slug === value;
          return (
            <button key={c.slug} onClick={() => onPick(c.slug)} aria-pressed={sel}
              className="quote-option text-left px-2.5 py-2 border transition-colors cursor-pointer">
              <span className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-ink truncate flex-1 t-cap">{c.name}</span>
                {c.slug === recommended && <span className="text-sage border border-sage/40 rounded-full px-1.5 py-0.5 whitespace-nowrap t-cap">Recommended</span>}
                {sel && <Check className="w-3.5 h-3.5 text-sage flex-shrink-0" aria-hidden="true" />}
              </span>
              <span className="flex items-center gap-3 mt-1 text-body t-cap">
                <span className="flex items-center gap-1"><Sun className="w-3 h-3 text-amber-500" aria-hidden="true" /><StarRating value={c.heatingStars} className="text-amber-600" /></span>
                <span className="flex items-center gap-1"><Snowflake className="w-3 h-3 text-sky-500" aria-hidden="true" /><StarRating value={c.coolingStars} className="text-sky-600" /></span>
                <span className="ml-auto tabular-nums text-quieter">{c.uValue != null ? `Uw ${c.uValue.toFixed(1)}` : ""}{c.shgc != null ? ` · SHGC ${c.shgc.toFixed(2)}` : ""}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OptionsFields({ p, options, setOpt }: { p: Product; options: Record<string, string>; setOpt: (typeSlug: string, v: string) => void }) {
  const groups = optionGroupsFor(p);
  const glazing = glazingChoicesFor(p);
  const [openOpt, setOpenOpt] = useState<string | null>(null);
  const glazingName = glazing.find(g => g.slug === options.glazing)?.name;
  return (
    <div className="space-y-2">
      {glazing.length > 0 && (
        <div className="quote-option-list border border-line">
          <button onClick={() => setOpenOpt(openOpt === "glazing" ? null : "glazing")} className="quote-section-trigger w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left cursor-pointer">
            <span className="min-w-0">
              <span className="text-body block t-label">Glazing</span>
              <span className={`font-medium truncate block ${glazingName ? "text-ink" : "text-quieter"} t-bd-sm`}>{glazingName || "Select…"}</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-body flex-shrink-0 transition-transform ${openOpt === "glazing" ? "rotate-180" : ""}`} />
          </button>
          <div className="disclose" data-open={openOpt === "glazing" ? "true" : "false"}>
            <div>
              <div className="@container px-4 pb-3 pt-2 border-t border-black/6">
                <GlazingChoices choices={glazing} value={options.glazing ?? ""} onPick={v => setOpt("glazing", v)} />
              </div>
            </div>
          </div>
        </div>
      )}
      {groups.map(g => {
        const val = options[g.typeSlug];
        const open = openOpt === g.typeSlug;
        const isColour = g.typeSlug === "colour";
        const swatchHex = isColour ? g.choices.find(c => c.name === val)?.hex : undefined;
        return (
          <div key={g.typeSlug} className="border border-black/10">
            <button onClick={() => setOpenOpt(open ? null : g.typeSlug)} className="quote-section-trigger w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left cursor-pointer">
              <span className="min-w-0">
                <span className="text-body block t-label">{g.label}{g.required && !val ? <span className="text-attention"> · required</span> : ""}</span>
                <span className={`font-medium truncate flex items-center gap-1.5 ${val ? "text-ink" : "text-quieter"} t-bd-sm`}>
                  {isColour && val && <span className="w-3.5 h-3.5 flex-shrink-0 border border-black/25" style={{ backgroundColor: swatchHex || "var(--muted)" }} aria-hidden="true" />}
                  {val || "Select…"}
                </span>
              </span>
              <ChevronDown className={`w-4 h-4 text-body flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            <div className="disclose" data-open={open ? "true" : "false"}>
              <div>
                <div className="@container px-4 pb-3 pt-2 border-t border-black/6">
                  {isColour ? (
                    <ColourChoices choices={g.choices} value={val} onPick={v => setOpt(g.typeSlug, v)} />
                  ) : (
                    <div className={OPTION_GRID}>
                      {g.choices.map(c => (
                        <OptionButton key={c.name} label={c.name} selected={val === c.name} onPick={() => setOpt(g.typeSlug, c.name)} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Product picker for a SAVED item (Type → Product, same two dependent fields as
// the new-item form). Family is local state so switching type just re-lists the
// products; the item's product only changes when a concrete product is chosen.
function ProductPicker({ productSlug, onPick }: { productSlug: string; onPick: (slug: string) => void }) {
  const current = getProductBySlug(productSlug);
  const [familySlug, setFamilySlug] = useState(current?.familySlug || "");
  const famGroups = familyGroups();
  const familyProducts = familySlug ? getProductsByFamily(familySlug) : [];
  // Only show the saved product in the Product select if it belongs to the type
  // currently chosen — otherwise the select reads "Choose a product…".
  const selValue = current && current.familySlug === familySlug ? productSlug : "";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <FieldLabel>Product type</FieldLabel>
        <div className="relative">
          <select value={familySlug} onChange={e => setFamilySlug(e.target.value)} className={selectClass}>
            <option value="">Choose a type…</option>
            {famGroups.map(g => <optgroup key={g.category} label={g.category}>{g.families.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}</optgroup>)}
          </select>
          <ChevronDown className="w-4 h-4 text-body absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>
      <div>
        <FieldLabel>Product</FieldLabel>
        <div className="relative">
          <select value={selValue} onChange={e => { if (e.target.value) onPick(e.target.value); }} disabled={!familySlug}
            className={`${selectClass} disabled:cursor-not-allowed`}>
            <option value="">{familySlug ? "Choose a product…" : "Select a type first"}</option>
            {familyProducts.map(pr => <option key={pr.slug} value={pr.slug}>{pr.name}</option>)}
          </select>
          <ChevronDown className="w-4 h-4 text-body absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

// Quantity is GONE from the composer form (owner): /quote-project's model is one
// opening per reference — the field is still stored, still priced, and
// permanently 1 — so a stepper offered a decision that does not exist and a
// caption ("every unit on this line is identical") explained a rule nobody can
// break. The note moved into Dimensions, leaving two groups there: Dimensions
// and Options.
//
// This block survives for ONE caller: the MyProject card on /quote, which is the
// legacy arm and is explicitly not held to parity. Changing it would be a change
// to an area this work was told to leave alone.
function QtyLocationFields({ qty, location, setQty, setLocation }: {
  qty: number; location: string; setQty: (v: number) => void; setLocation: (v: string) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>Quantity — identical units</FieldLabel>
          <div className="field-control flex items-center border h-[44px] w-full">
            <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-12 h-full flex items-center justify-center text-body hover:bg-recessive cursor-pointer" aria-label="Decrease quantity"><Minus className="w-4 h-4" /></button>
            <span className="flex-1 text-center font-medium t-bd-sm">{qty}</span>
            <button onClick={() => setQty(qty + 1)} className="w-12 h-full flex items-center justify-center text-body hover:bg-recessive cursor-pointer" aria-label="Increase quantity"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
        <div>
          <FieldLabel>Note (optional)</FieldLabel>
          <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Bedroom 1, north elevation" />
        </div>
      </div>
      <p className="text-body mt-2 t-cap"><Info className="w-3 h-3 inline mr-1" />Quantity means every unit on this line is identical. For a different size, add a separate item.</p>
    </div>
  );
}

// ─── Collapsible section shell ────────────────────────────────────────────────
function Section({ label, summary, open, onToggle, children, variant = "boxed", attention = false }: {
  label: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode; variant?: "boxed" | "row"; attention?: boolean;
}) {
  const boxed = variant === "boxed";
  return (
    <div className={boxed ? `border ${attention ? "border-attention/40" : "border-line"}` : "border-b border-line last:border-b-0"}>
      <button onClick={onToggle} aria-expanded={open} data-attention={attention ? "true" : "false"} className={`quote-section-trigger w-full flex items-center justify-between gap-3 text-left cursor-pointer ${boxed ? "px-4 py-3" : "px-4 py-2.5"}`}>
        <span className="min-w-0">
          <span className={`block flex items-center gap-1 ${attention ? "text-attention-ink" : "text-body"} t-label`}>{label}{attention && <AlertCircle className="w-3 h-3" />}</span>
          <span className="text-ink font-medium truncate block t-bd-sm">{summary}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-body flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className="disclose" data-open={open ? "true" : "false"}>
        <div><div className={`quote-section-content ${boxed ? "px-4 pb-4 pt-1 border-t border-line" : "px-4 pb-4 pt-1 border-t border-line"}`}>{children}</div></div>
      </div>
    </div>
  );
}

/** The selected options as label/value pairs, in the same glazing-first order as
 *  the one-line summary. A run-on "5Clear · White · Standard · None" line cannot
 *  be scanned — the reader has to know the option order to decode which value is
 *  which — so a reading surface wants the labels back. */
export const optionSummaryPairs = (
  p: Product | undefined, options: Record<string, string>,
): { label: string; value: string }[] => {
  if (!p) return [];
  const pairs: { label: string; value: string }[] = [];
  const glazing = glazingChoicesFor(p).find(g => g.slug === options.glazing)?.name;
  if (glazing) pairs.push({ label: "Glazing", value: glazing });
  for (const g of optionGroupsFor(p)) {
    const value = options[g.typeSlug];
    if (value) pairs.push({ label: g.label, value });
  }
  return pairs;
};

/** EVERY option the product offers, chosen or not, in the same glazing-first
 *  order — for the expansion, which is the one place answering "what did I end
 *  up with" rather than "what is notable about this line".
 *
 *  optionSummaryPairs omits what was not chosen, which is right for a summary
 *  and wrong here: an absent flyscreen reads as an oversight in a list that
 *  never mentions flyscreens, and as a decision in one that says None. Glazing
 *  appears only for products that actually offer a build-up — listing a choice
 *  the product cannot make would be a third kind of lie. */
export const optionFullPairs = (
  p: Product | undefined, options: Record<string, string>,
): { label: string; value: string; chosen: boolean; hex?: string }[] => {
  if (!p) return [];
  const out: { label: string; value: string; chosen: boolean; hex?: string }[] = [];
  const glazing = glazingChoicesFor(p);
  if (glazing.length) {
    const name = glazing.find(g => g.slug === options.glazing)?.name;
    out.push({ label: "Glazing", value: name ?? "None", chosen: !!name });
  }
  for (const g of optionGroupsFor(p)) {
    const chosen = options[g.typeSlug];
    // NOTHING CHOSEN FALLS BACK TO THE STANDARD, not to "None" (owner).
    // "None" said the line had no colour; it has one — the product's standard is
    // what gets made and what the price already assumes, since a standard option
    // carries no surcharge. Printing "None" beside a figure that includes Dover
    // White was simply inaccurate.
    //
    // `chosen` stays false either way, so the panel keeps rendering an inherited
    // value in its quiet tone: the customer can still see, at a glance, which
    // lines they decided and which the product decided for them.
    const value = chosen || g.choices.find(c => c.standard)?.name || "";
    // The swatch comes off the CHOICE, not off a name-to-hex table of our own:
    // Colorbond names are the catalogue's, and a second mapping here would drift
    // the moment ops adds a colour.
    const hex = value ? g.choices.find(c => c.name === value)?.hex : undefined;
    out.push({ label: g.label, value: value || "None", chosen: !!chosen, hex });
  }
  return out;
};

// Exported so the /quote-project read-only expansion shows the SAME summary in
// the same order rather than reimplementing the glazing-first rule.
export const optionSummaryOf = (p: Product | undefined, options: Record<string, string>) => {
  if (!p) return "Standard selections";
  // Lead with the chosen glazing (its own picker, not an optionGroup) so a collapsed
  // summary still says which glass — and it survives truncation as the first item.
  const glazing = glazingChoicesFor(p).find(g => g.slug === options.glazing)?.name;
  const parts = [glazing, ...optionGroupsFor(p).map(g => options[g.typeSlug])].filter(Boolean);
  return parts.join(" · ") || "Standard selections";
};

// ═══ NEW-ITEM FORM (product picker + sections + commit) ═══════════════════════
export function ItemForm({
  lockedSlug, quote, seed, onCommit, onCancel, rail = false, submitLabel = "Save",
  priceFn = previewPrice, scope = "item", unitAxis = "vertical", unitMode = "edit",
  onDirtyChange, initialSection, excludeId, heading, busy = false, hideOptions = false,
  hideProduct = false, stickyActions = false, hideHeader = false, quietUntilTouched = false, parts, compatibility,
}: {
  lockedSlug?: string;
  /** Only `items` is read — for the duplicate-code check and code suggestion. It
   *  is deliberately NOT the whole QuoteState: ops reuses this form against a
   *  record it loads from its own API, and it has no customer quote store to
   *  hand over. Narrowing the type is what makes that legal rather than a cast. */
  quote: Pick<QuoteState, "items">;
  seed?: Partial<QItem> | null;
  onCommit: (built: Omit<QItem, "id">) => void;
  onCancel?: () => void;
  rail?: boolean;
  /** Keep the action footer pinned at EVERY width. For a host that is its own
   *  scroll container — the opening drawer — where a footer in page flow simply
   *  scrolls away. In page flow it would hover over unrelated content, so it is
   *  off by default. */
  stickyActions?: boolean;
  /** Drop the form's own title + Cancel strip. For a host that already renders
   *  both — again the drawer, whose dialog header carries the reference and the
   *  close control, so the form's strip sat directly beneath as a second title
   *  and a second dismiss. When set, Cancel does NOT raise this form's inline
   *  discard prompt: the host owns that guard, or there would be two. */
  hideHeader?: boolean;
  submitLabel?: string;
  /** How the live figure is obtained. Defaults to the customer preview, which is
   *  scoped to the signed-in visitor's own project. Ops must override it: a
   *  staff member pricing someone else's line has no "current project", and the
   *  figure has to be computed in that project's owner context so an account
   *  discount is neither invented nor dropped. */
  priceFn?: (item: {
    productSlug: string; width: string; height: string;
    options: Record<string, string>; qty: number;
  }) => Promise<{ ok: boolean; total: number | null; needsProject?: boolean }>;
  /** "item" is a whole opening. "unit" is one frame INSIDE a composite opening:
   *  it has no architect tag and no room of its own — one opening, one code —
   *  and its size across the join is set by the opening, so that dimension is
   *  shown but locked rather than being editable and then ignored. */
  scope?: "item" | "unit";
  /** The direction in which the child units are joined. */
  unitAxis?: "vertical" | "horizontal";
  /** A new unit stays client-side until this form is deliberately saved. */
  unitMode?: "edit" | "add";
  /** Reports draft dirtiness upward. The /quote-project drawer owns its own
   *  close affordances (X, Escape, scrim) and must be able to guard an unsaved
   *  draft the same way this form's own Cancel does. Optional and inert for
   *  every existing caller. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Which detail group starts open. Defaults to dimensions. */
  initialSection?: "dims" | "options" | "qty";
  /** Local id of the line being edited, so its own code is not a collision. */
  excludeId?: number;
  /** Panel heading. Defaults to "New item" — wrong for an edit surface. */
  heading?: string;
  /** A caller-owned save is in flight; disables the primary against double-submit. */
  busy?: boolean;
  /** A composite PARENT is a schedule line, not a product in its own right — its
   *  glazing and hardware live on the units. Hides the Options group and stops
   *  requiring choices the parent will never carry. */
  hideOptions?: boolean;
  /** …and it is not a product either, so it gets no type/product selectors —
   *  just its ID and its size (owner). The drawing becomes a plain opening. */
  hideProduct?: boolean;
  /** Editing a UNIT of a composite: the products of the frames beside it, and
   *  whether a frame that cannot couple with them may still be chosen.
   *
   *  `enforce` mirrors the server exactly — the customer route refuses an
   *  incompatible unit and the ops route saves it with a review reason — because
   *  a picker that offers what the server rejects is a dead end, and one that
   *  hides what the server would accept takes a decision away from the person
   *  qualified to make it. Absent on a plain opening, which has no siblings. */
  compatibility?: { siblingSlugs: string[]; enforce: boolean } | null;
  /** Say nothing until the customer has typed something.
   *
   *  A blank form is not a form with mistakes in it. On the product page the
   *  editor is the FIRST thing a visitor meets, with no size entered because
   *  they have not entered one yet — and it opened flagging Dimensions and
   *  Options in red and listing two faults above the button, before anyone had
   *  touched anything. Issues still gate Save from the first render; they are
   *  simply not SHOUTED until the draft has been edited once, which is when
   *  they stop being an assumption about the visitor and start being feedback.
   *
   *  A state variation for that surface only (owner). An editor opened on a
   *  line that already exists is describing a real fault in real data, and must
   *  say so immediately. */
  quietUntilTouched?: boolean;
  /** A composite parent's units. The editor then draws the opening that is
   *  actually being made, the same way the list row does, instead of the plain
   *  square meant for an opening with nothing in it (owner). */
  parts?: { productSlug: string; alongMm: string | number; qty?: number }[];
}) {
  const isUnit = scope === "unit";
  const unitHeading = unitMode === "add" ? "Add composite unit" : "Edit composite unit";
  const seedProduct = seed?.productSlug ? getProductBySlug(seed.productSlug) : undefined;
  const [familySlug, setFamilySlug] = useState(lockedSlug ? (getProductBySlug(lockedSlug)?.familySlug || "") : (seedProduct?.familySlug || ""));
  const [productSlug, setProductSlug] = useState(lockedSlug || seed?.productSlug || "");
  const p = getProductBySlug(productSlug);
  const [code, setCode] = useState(seed?.code || (productSlug ? suggestCode(quote.items, productSlug) : ""));
  const [codeEdited, setCodeEdited] = useState(!!seed?.code);

  // Has the customer touched this draft at all? Only quietUntilTouched reads it,
  // and only to decide whether issues are ANNOUNCED — never whether they exist.
  const [touched, setTouched] = useState(false);
  const [width, setWidthRaw] = useState(seed?.width || "");
  const [height, setHeightRaw] = useState(seed?.height || "");
  const setWidth = (v: string) => { setTouched(true); setWidthRaw(v); };
  const setHeight = (v: string) => { setTouched(true); setHeightRaw(v); };
  const [options, setOptions] = useState<Record<string, string>>(seed?.options ? { ...seed.options } : (p ? defaultOptions(p) : {}));
  // Read, never written: one opening per reference, so the value is whatever the
  // line already carries (1) and there is no control that can change it.
  const qty = seed?.qty || 1;
  const [location, setLocationRaw] = useState(seed?.location || "");
  const setLocation = (v: string) => { setTouched(true); setLocationRaw(v); };
  // `initialSection` lets a caller open the form AT the offending field —
  // /quote-project's `Fix details` is a direct action, not merely an expand.
  // Two groups now, so anything that is not Options opens Dimensions — including
  // a "qty" fix target, which the server can still emit from a review flag and
  // which no longer has a group of its own to land in.
  const [open, setOpen] = useState<{ dims: boolean; options: boolean }>({
    dims: initialSection !== "options",
    options: initialSection === "options",
  });
  const [confirmClose, setConfirmClose] = useState(false);

  const w = parseInt(width) || 0, h = parseInt(height) || 0;
  const dimsEntered = w > 0 && h > 0;
  const inRange = !!p && inRangeFor(p, w, h);

  // The browser holds no rate data — the commercial model lives in D1 — so the
  // live figure is asked of the server. Debounced while typing, and the previous
  // figure is cleared the moment the configuration changes so a stale price can
  // never sit under a new specification.
  const [priced, setPriced] = useState<{ ok: boolean; total: number; unit: number; needsProject?: boolean }>({ ok: false, total: 0, unit: 0 });
  const priceKey = JSON.stringify({ productSlug, width, height, options, qty });
  useEffect(() => {
    if (!productSlug || !dimsEntered) { setPriced({ ok: false, total: 0, unit: 0 }); return; }
    let live = true;
    setPriced((prev) => ({ ...prev, ok: false }));
    const t = setTimeout(() => {
      priceFn({ productSlug, width, height, options, qty })
        .then((r) => { if (live) setPriced({ ok: r.ok, total: r.total ?? 0, unit: qty > 0 ? (r.total ?? 0) / qty : 0, needsProject: r.needsProject }); })
        .catch(() => { if (live) setPriced({ ok: false, total: 0, unit: 0 }); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey, dimsEntered]);
  const gstMode = useGstMode();
  // A unit carries no code, so it can neither be suggested one nor collide.
  const finalCode = isUnit ? "" : (normCode(code) || (productSlug ? suggestCode(quote.items, productSlug) : ""));
  // `excludeId` is the line being EDITED. Without it the form collides with
  // itself — an existing opening's own code is in `quote.items`, so Save is
  // disabled the instant the editor opens. The new-item form passes nothing and
  // keeps comparing against every line, as before.
  const duplicateCode = !isUnit && !!finalCode
    && quote.items.some(item => item.id !== excludeId && normCode(item.code) === finalCode);
  // An OPENING has no product, so it has no size range to be outside of.
  const oversize = !!p && dimsEntered && !inRange
    && !((p.minWidth != null && w < p.minWidth) || (p.minHeight != null && h < p.minHeight));
  const tooSmall = !!p && dimsEntered && !inRange && !oversize;
  // Oversize is submittable, flagged; undersize is a typo and blocks.
  // Before the first save there is no project to price-preview against (the claim
  // cookie is minted on save); the save itself creates the project and prices the
  // line server-side, so don't deadlock the first item on a preview we can't run.
  const priceDeferred = !!priced.needsProject;
  // `busy` covers an in-flight save the CALLER owns (composite segment writes are
  // async round-trips). Without it the primary stays enabled during the request
  // and a second click fires the mutation twice — two units added, not one.
  // A composite parent's total is the sum of its units and is computed by the
  // server, so gating its Save on a preview of the parent's own slug would keep
  // the button dead on exactly the line whose price this form cannot produce.
  // Its size and its ID are the whole of what it can be saved with.
  // A hidden Options group must not still gate saving on a choice the user was
  // never shown — that is an invisible disabled button.
  const issues = (p ? itemIssues(p, { width, height, options }) : [])
    .filter((i) => !(hideOptions && i.section === "options"));
  // SHOWN issues, which is not the same set as the issues that gate Save. A
  // blank form on the product page is not a form with mistakes in it; the faults
  // are real from the first render and still hold the button, they are just not
  // announced until the visitor has touched the draft once (owner).
  const shownIssues = quietUntilTouched && !touched ? [] : issues;
  const hasIssue = (s: EditFocus) => shownIssues.some(i => i.section === s);

  // `issues` gates SAVE now, not just the amber line above it. A required option
  // with nothing chosen was listed in the footer and then saved anyway — and
  // because an unchosen option contributes no surcharge, the line priced
  // cleanly and reached the list looking finished. The one thing that must not
  // gate is an issue for a group this instance never showed, which is what the
  // hideOptions filter below already handles.
  const blockingIssues = issues.length > 0;
  const canSave = hideProduct
    ? dimsEntered && !duplicateCode && !busy
    : (priced.ok || priceDeferred) && !tooSmall && !duplicateCode && !blockingIssues && !busy;
  const built: Omit<QItem, "id"> = {
    code: finalCode, productSlug, location, width, height, options, qty,
    status: oversize ? "Needs review" : "Ready",
    review: oversize
      ? { fit: "No single unit is made at this size — we will confirm how it is built and price it at technical review." }
      : null,
  };

  const pickFamily = (slug: string) => { setFamilySlug(slug); setProductSlug(""); if (!codeEdited) setCode(""); };
  const pickProduct = (slug: string) => {
    setProductSlug(slug);
    const np = getProductBySlug(slug);
    setOptions(np ? defaultOptions(np) : {});
    if (!codeEdited) setCode(slug ? suggestCode(quote.items, slug) : "");
  };
  const setOpt = (typeSlug: string, v: string) => { setTouched(true); setOptions(o => ({ ...o, [typeSlug]: v })); };

  const famGroups = familyGroups();
  // What this UNIT may be built from, given the frames beside it. A composite is
  // coupled frames and they have to be the same extrusion platform, so a product
  // of another depth is not an option here — it would clash at the mullion.
  //
  // The customer's list is FILTERED and staff's is MARKED (owner, 2026-08-08).
  // Filtering for the customer is not decoration: the server refuses the save, so
  // offering a product it will reject is a dead end with no explanation. Marking
  // for staff is the same fact stated without taking the decision away.
  const siblingSystems = (compatibility?.siblingSlugs ?? [])
    .map((slug) => getProductBySlug(slug)?.frameSystem ?? null);
  const incompatible = (pr: Product) => siblingSystems.length > 0 && !fitsAlongside(pr.frameSystem ?? null, siblingSystems);
  const allProducts = familySlug ? getProductsByFamily(familySlug) : [];
  const familyProducts = compatibility?.enforce ? allProducts.filter((pr) => !incompatible(pr)) : allProducts;
  const excludedCount = allProducts.length - familyProducts.length;
  const dimsSummary = (dimsEntered ? `${mm(width)} × ${mm(height)}` : "Enter the opening size")
    + (location ? ` · ${location}` : "");

  // Dismissing the draft: silent for an empty/product-only form, but a real
  // in-progress item asks first (inline — no modal, matching the page).
  const initialUnitState = JSON.stringify({
    productSlug: seed?.productSlug ?? "",
    width: seed?.width ?? "",
    height: seed?.height ?? "",
    options: seed?.options ?? {},
  });
  const currentUnitState = JSON.stringify({ productSlug, width, height, options });
  // An EDIT (seeded) form is dirty only when it actually differs from what it
  // was opened with. The old "has the user typed anything" heuristic reads as
  // dirty from the first render of an existing line — which silently defeats
  // any discard guard built on top of it. A blank ADD form keeps that heuristic:
  // there is no seed to diff against.
  // The baseline must use the SAME expressions the state initialisers do. A
  // seeded line with a blank code takes a suggested one, and comparing that
  // against "" would report the form as dirty before the user touched it —
  // reintroducing the spurious discard prompt this diff exists to prevent.
  const initialItemState = JSON.stringify({
    productSlug: seed?.productSlug ?? "", width: seed?.width ?? "", height: seed?.height ?? "",
    options: seed?.options ? { ...seed.options } : (seedProduct ? defaultOptions(seedProduct) : {}),
    qty: seed?.qty || 1,
    location: seed?.location ?? "",
    code: seed?.code || (seed?.productSlug ? suggestCode(quote.items, seed.productSlug) : ""),
  });
  const currentItemState = JSON.stringify({ productSlug, width, height, options, qty, location, code });
  const dirty = isUnit
    ? currentUnitState !== initialUnitState
    : seed
      ? currentItemState !== initialItemState
      : !!productSlug && (dimsEntered || !!location.trim() || codeEdited);
  // With the header hidden there is nowhere to render the inline confirm, and
  // the host that hid it owns the discard guard — raising both would ask twice.
  const requestCancel = () => {
    if (!hideHeader && dirty && !confirmClose) { setConfirmClose(true); return; }
    onCancel?.();
  };
  // Ref-held so an inline arrow from the caller cannot make this fire every
  // render (which would loop through the parent's setState).
  const dirtyCbRef = useRef(onDirtyChange);
  dirtyCbRef.current = onDirtyChange;
  useEffect(() => { dirtyCbRef.current?.(dirty); }, [dirty]);

  return (
    <div className="quote-panel">
      {/* Persistent header — the dismiss affordance is here from the first render,
          so an empty form (no product yet) can still be backed out of. */}
      {onCancel && !hideHeader && (
        <div className="quote-panel-head flex items-center justify-between gap-3 px-4 md:px-5 py-2.5">
          <p className="text-body t-label">{isUnit ? unitHeading : (heading ?? "New item")}</p>
          {confirmClose ? (
            <span className="flex items-center gap-2 text-body t-cap">
              {isUnit ? (unitMode === "add" ? "Discard new unit?" : "Discard unit changes?") : (seed ? "Discard changes?" : "Discard this item?")}
              <button type="button" onClick={() => onCancel?.()} className="font-medium text-red-600 hover:text-red-700 cursor-pointer">Discard</button>
              <button type="button" onClick={() => setConfirmClose(false)} className="font-medium text-ink hover:text-sage cursor-pointer">Keep editing</button>
            </span>
          ) : (
            <button type="button" onClick={requestCancel} aria-label={isUnit ? (unitMode === "add" ? "Cancel new unit" : "Cancel unit editing") : (seed ? "Cancel editing" : "Cancel new item")}
              className="inline-flex items-center gap-1 -mr-1 px-2 py-1 font-medium text-body-soft hover:text-ink cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage t-cap">
              Cancel <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      <div className="px-4 md:px-5 py-5 space-y-3">
        {lockedSlug ? (
          p && (
            <div className={`grid gap-3 ${rail ? "grid-cols-1" : "sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-end"}`}>
              <div>
                <FieldLabel>Item ID</FieldLabel>
                <Input value={code} maxLength={10} onChange={e => { setTouched(true); setCodeEdited(true); setCode(e.target.value.toUpperCase()); }} placeholder="e.g. W01" />
                {duplicateCode && <p className="text-attention-ink mt-1 t-cap">Item ID already exist</p>}
              </div>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 border border-sage/30 flex items-center justify-center flex-shrink-0"><WindowMark size={15} color={SAGE} /></span>
                <div className="min-w-0">
                  <p className="text-body t-label">Product</p>
                  <p className="font-semibold text-ink truncate font-display t-bd-sm">{p.name}</p>
                </div>
              </div>
            </div>
          )
        ) : (
          // TWO ROWS (owner): ID 30% + Family 70%, then Product across the full
          // width. Three fields on one line gave the product name — the longest
          // string in the form and the one being read — the narrowest third of
          // it; "AMJ80 Series Sliding Window" had nowhere to go.
          <div className="grid grid-cols-1 sm:grid-cols-[3fr_7fr] gap-3">
            {!isUnit && (
              <div>
                <FieldLabel>Item ID</FieldLabel>
                <Input value={code} maxLength={10} onChange={e => { setTouched(true); setCodeEdited(true); setCode(e.target.value.toUpperCase()); }} placeholder="e.g. W01" />
                {duplicateCode && <p className="text-attention-ink mt-1 t-cap">Item ID already exist</p>}
              </div>
            )}
            {/* A composite PARENT gets no product picker at all (owner) — just
                its ID. It is the schedule line, not a frame: its units are the
                products, they can be different products from each other, and
                offering one selector here asks the customer to name a thing
                that does not exist. */}
            {!hideProduct && (
              <>
                <div>
                  <FieldLabel>Product type</FieldLabel>
                  <div className="relative">
                    <select value={familySlug} onChange={e => pickFamily(e.target.value)} className={selectClass}>
                      <option value="">Choose a type…</option>
                      {famGroups.map(g => <optgroup key={g.category} label={g.category}>{g.families.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}</optgroup>)}
                    </select>
                    <ChevronDown className="w-4 h-4 text-body absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Product</FieldLabel>
                  <div className="relative">
                    <select value={productSlug} onChange={e => pickProduct(e.target.value)} disabled={!familySlug} className={`${selectClass} disabled:cursor-not-allowed`}>
                      <option value="">{familySlug ? "Choose a product…" : "Select a type first"}</option>
                      {familyProducts.map(pr => (
                        <option key={pr.slug} value={pr.slug}>
                          {pr.name}{incompatible(pr) ? " — different frame system" : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-body absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  {/* Say WHY the list is short. A picker that silently drops half
                      its options reads as a catalogue that has run out. */}
                  {excludedCount > 0 && (
                    <p className="text-quiet mt-1 t-cap">
                      Showing the frames that join the other units of this opening
                      {excludedCount === 1 ? "; one more is a different frame system" : `; ${excludedCount} more are a different frame system`}.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* An opening with no product still has a size, so the gate is "product
            OR opening" rather than product alone — otherwise hiding the picker
            from a composite parent would hide its dimensions with it. */}
        {(p || hideProduct) && (
          <div className="space-y-2">
            <Section label="Dimensions" summary={dimsSummary} attention={hasIssue("dims")} open={open.dims} onToggle={() => setOpen(o => ({ ...o, dims: !o.dims }))}>
              <DimensionsFields p={p ?? null} opening={hideProduct} parts={parts} axis={unitAxis} width={width} height={height}
                setWidth={setWidth} setHeight={setHeight} rail={rail}
                // A unit's across-axis dimension is EDITABLE (owner). It used to
                // be locked to the opening's, which reads as a safety rail and
                // behaves as a trap: correct an opening's parsed height and
                // every unit is left at the old figure with its only repair
                // field greyed out. A mismatch is reported — on the unit and on
                // the opening — rather than prevented.
                lockedDimension={undefined}
                // The note is on UNITS too (owner). "Note is a note — it may
                // serve for location, it may serve for anything else that is
                // notable", and from the customer's side a unit carries exactly
                // the same kind of information as a childless opening; the only
                // difference is that it has a parent. It persists in the same
                // column an opening's does (quote_line.room_label).
                location={location}
                setLocation={setLocation}
                isUnit={isUnit} />
            </Section>
            {!hideOptions && p && (
            <Section label="Options" summary={optionSummaryOf(p, options)} attention={hasIssue("options")} open={open.options} onToggle={() => setOpen(o => ({ ...o, options: !o.options }))}>
              <OptionsFields p={p} options={options} setOpt={setOpt} />
            </Section>
            )}
          </div>
        )}
      </div>

      {/* `md:static` is right for a composer in PAGE FLOW — a card whose footer
          has no reason to follow the viewport, and which would otherwise hover
          over the page as you scrolled past it. It is wrong inside the drawer,
          which is its own scroll container at every width: the actions scrolled
          out of reach on any form long enough to need scrolling, which is most
          of them. NOT keyed off `rail` — that means "narrow column", and the
          product page passes it for a form that sits in page flow. */}
      {(p || hideProduct) && (
        <div className={`quote-panel-footer px-4 md:px-5 py-4 sticky bottom-0 z-30 ${stickyActions ? "" : "md:static"}`}
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
          {shownIssues.length > 0 && (
            <p className="text-attention-ink mb-2 flex items-start gap-1.5 t-cap"><AlertCircle className="w-3.5 h-3.5 text-attention flex-shrink-0 mt-0.5" />{shownIssues.map(i => i.msg).join(" · ")}.</p>
          )}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-body t-label">Estimated price</p>
              {/* A composite's figure is the sum of its units, worked out by the
                  server on save — this form can only preview a single product,
                  and the parent is not one. */}
              {hideProduct ? (
                <p className="font-medium text-body t-bd-sm">Priced from its units</p>
              ) : priced.ok ? (
                <p className="font-semibold text-ink font-data t-data">{fmt(gstAdjust(priced.total, gstMode))} <span className="font-normal text-body t-cap">{gstSuffix(gstMode)}{qty > 1 ? ` · ${fmt(gstAdjust(priced.unit, gstMode))} ea` : ""}</span></p>
              ) : priceDeferred ? (
                <p className="font-medium text-body t-bd-sm">Calculated when you add it</p>
              ) : (
                <p className="font-semibold text-ink font-data t-data">—</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {onCancel && <Btn variant="ghost" size="md" onClick={requestCancel}>Cancel</Btn>}
              <Btn variant="sage" size="md" onClick={() => canSave && onCommit(built)} disabled={!canSave}><Check className="w-4 h-4" />{submitLabel}</Btn>
            </div>
          </div>
          <p className="text-body mt-1.5 t-cap">Confirmed on technical review before any deposit. Supply only.</p>
        </div>
      )}
    </div>
  );
}

// ─── Inline editable item code (W01 / D03…) ───────────────────────────────────
function CodeField({ code, duplicate, editSignal, onCommit }: {
  code: string; duplicate?: boolean; editSignal?: number; onCommit: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(code);
  const inputRef = useRef<HTMLInputElement>(null);

  const begin = () => { setDraft(code); setEditing(true); };
  const commit = () => { setEditing(false); const v = draft.trim(); if (v !== code) onCommit(v); };
  const cancel = () => { setDraft(code); setEditing(false); };

  // Duplication focuses the new item's code for confirmation.
  useEffect(() => { if (editSignal) { setDraft(code); setEditing(true); } /* eslint-disable-next-line */ }, [editSignal]);
  useEffect(() => { if (editing) inputRef.current?.focus(); inputRef.current?.select(); }, [editing]);

  if (editing) {
    return (
      <input ref={inputRef} value={draft} maxLength={10} aria-label="Item ID"
        onChange={e => setDraft(e.target.value.toUpperCase())}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } else if (e.key === "Escape") { e.preventDefault(); cancel(); } }}
        className="quote-code-field w-[4.75rem] h-8 border border-sage px-2 font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-sage/40 font-data t-data-sm" />
    );
  }
  return (
    <button onClick={begin} aria-label={`Edit item ID${code ? ` ${code}` : ""}`}
      data-attention={duplicate ? "true" : "false"} className="quote-code-field group/code inline-flex items-center gap-1 h-8 px-2 font-semibold border text-ink transition-colors cursor-pointer hover:border-sage font-data t-data-sm">
      {code || "Set code"}
      <Pencil className="w-3 h-3 text-quieter group-hover/code:text-sage" aria-hidden="true" />
    </button>
  );
}

// ═══ MyProject ITEM CARD — compact header + collapsible detail groups ══════════
// Two levels of collapse: the whole item collapses to a header + one summary line;
// expanding reveals the three detail groups (one open at a time). Item code, status
// and line price stay visible in every state.
export function ItemSummaryCard({
  item, added, quote, onDuplicate, onRemove, initialFocus, id, focusSignal, panelParity = false,
  expanded, onToggleExpanded, duplicate, codeFocusSignal, basis, changes, onRestoreAi,
}: {
  item: QItem; added?: boolean; quote: QuoteState;
  onDuplicate?: () => void; onRemove?: () => void; initialFocus?: EditFocus;
  /** Match the /quote-project edit panel (owner): no Quantity group, and the
   *  note inside Dimensions. Opt-in, not default, purely so the legacy /quote
   *  card is unchanged while the old-vs-new comparison is being run. It dies
   *  with /quote — at which point this becomes the only arrangement. */
  panelParity?: boolean;
  id?: string; focusSignal?: number;
  expanded?: boolean; onToggleExpanded?: () => void; duplicate?: boolean; codeFocusSignal?: number;
  /** Requirement basis for the trust chip (UX spec §5) — status ("is anything
   *  needed?") and basis ("how solid is this number?") are separate questions.
   *  'explicit_energy_report' | 'default_envelope' | null (no chip). */
  basis?: string | null;
  onRestoreAi?: () => void | Promise<void>;
  /** This session's document-driven changes to the line (spec §3 provenance):
   *  renders the Updated pill + old→new rows. Session-scoped; decays on reload. */
  changes?: { field: string; from: string; to: string }[] | null;
}) {
  const [open, setOpen] = useState<EditFocus | null>(initialFocus ?? null);
  const [selfExpanded, setSelfExpanded] = useState(!!initialFocus);
  const [restoringAi, setRestoringAi] = useState(false);
  const isExpanded = expanded ?? selfExpanded;
  const toggleExpanded = onToggleExpanded ?? (() => setSelfExpanded(v => !v));
  const rootRef = useRef<HTMLDivElement>(null);
  const p = getProductBySlug(item.productSlug);
  const compositeUnits = (item.segments ?? []).reduce((count, segment) =>
    count + Math.max(1, segment.qtyPerParent), 0);
  const basisCopy = basis ? BASIS_COPY[basis] : null;
  // linePriceTotal() returns the SERVER figure, or 0 when there is none — so
  // "is there a price" is a question about item.lineTotal, not about the
  // formatted number. This read used to be pr.ok on an object with no such
  // property: always undefined, so every manually configured line rendered
  // "$-,--" while a real total sat one field away.
  const displayTotal = linePriceTotal(item);
  const aiPriced = item.origin === "ai" || !!item.aiPriced;
  const priceReady = typeof item.lineTotal === "number" && Number.isFinite(item.lineTotal);
  const gstMode = useGstMode();
  const w = parseInt(item.width) || 0, h = parseInt(item.height) || 0;
  const issues = p && !aiPriced ? itemIssues(p, item) : [];

  // Per-field review reasons from an auto-parse (field -> human reason). Keys map to
  // sections so the offending group is highlighted amber; every reason is also shown.
  const reviewEntries = item.review ? Object.entries(item.review) : [];
  const reviewKeys = new Set(reviewEntries.map(([k]) => k));
  const reviewReasons = reviewEntries.map(([, reason]) => reason);

  // The first group needing attention — a live validation issue, else a parse
  // review flag. Drives the "Review issues" jump. "product" comes first so a line
  // the parser couldn't match opens straight on the product picker.
  const firstAttentionSection: EditFocus | null =
    issues[0]?.section
    ?? (reviewKeys.has("product") ? "product"
      : reviewKeys.has("dims") ? "dims"
      : reviewKeys.has("options") ? "options" : null);

  // "Review issues" targets this card: open the first offending group + focus it.
  useEffect(() => {
    if (!focusSignal || !firstAttentionSection) return;
    setOpen(firstAttentionSection);
    // Let the expand/open commit and lay out before moving focus into the group.
    const t = setTimeout(() => {
      const field = rootRef.current?.querySelector<HTMLElement>("input, select, textarea");
      field?.focus({ preventScroll: true });
    }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal]);
  const hasIssue = (s: EditFocus) =>
    issues.some(i => i.section === s)
    || (s === "product" && reviewKeys.has("product"))
    || (s === "dims" && reviewKeys.has("dims"))
    || (s === "options" && reviewKeys.has("options"));
  // Customer-blocking (must fix to submit) vs technical-only (we confirm; the
  // customer can still submit). Product/dims live-issues and 'customer' review keys
  // block; a priced line with only 'technical' flags does not.
  // ONE predicate for Tier 1 — the RED border, the "Needs attention" pill AND the
  // sticky "N need attention" count all derive from lineBlocksSubmission (the
  // client+server single source of truth), so they can never diverge again (UX
  // review 2026-07-26). A PRICED line carrying a review flag is Tier 2 (sky, "we
  // confirms — you can still submit"), never red. Out-of-range live issues (which
  // still price, so don't block) also fall to Tier 2 so they stay visible.
  const customerBlocking = lineBlocksSubmission(item) || !!duplicate;
  const hasReviewFlag = !!item.review && Object.keys(item.review).length > 0;
  const technicalOnly = !customerBlocking && (hasReviewFlag || issues.length > 0);
  const attention = customerBlocking || technicalOnly;
  const toggle = (s: EditFocus) => setOpen(o => (o === s ? null : s));
  const update = (patch: Partial<QItem>) => quote.update(item.id, patch);

  const dimsSummary = w && h ? `${mm(item.width)} × ${mm(item.height)}` : "Enter the opening size";
  const qtySummary = `Qty ×${item.qty}${item.location ? ` · ${item.location}` : ""}`;
  const summaryLine = `${dimsSummary} · Qty ×${item.qty}${item.location ? ` · ${item.location}` : ""}`;
  const selectedOptionsSummary = optionSummaryOf(p, item.options);
  const attentionMsg = [
    ...(duplicate ? ["Item ID already exist"] : []),
    ...issues.map(i => i.msg),
    ...reviewReasons,
  ].join(" · ");
  const priceLabel = priceReady ? fmt(gstAdjust(displayTotal, gstMode)) : "$-,--";

  const itemState = customerBlocking ? "attention" : technicalOnly ? "review" : added ? "added" : "ready";

  return (
    <div id={id} ref={rootRef} data-state={itemState} className="quote-item-card scroll-mt-24">
      {/* Header: product identity and the highest-priority item actions. */}
      <div className="quote-item-head flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-3 whitespace-nowrap">
        <span className="flex-shrink-0">
          <CodeField code={item.code} duplicate={duplicate} editSignal={codeFocusSignal} onCommit={v => update({ code: v })} />
        </span>
        <span className="flex-1 min-w-0 flex items-center gap-1.5">
          {/* A warned line still names its (best-fit / substituted) product — the
              warning explains the caveat. Only a line with NO product at all
              shows the italic "Choose a product" customer action, in the attention red. */}
          <button onClick={toggleExpanded} aria-expanded={isExpanded}
            className={`min-w-0 truncate text-left font-semibold cursor-pointer hover:text-sage ${item.productSlug ? "text-ink" : "text-attention-ink italic"} font-display t-bd-sm`}>
            {item.productSlug ? productLabel(item.productSlug) : "Choose a product"}
          </button>
          {customerBlocking
            ? <span className="quote-chip quote-chip--attention flex-shrink-0 font-medium t-cap"><AlertCircle className="w-2.5 h-2.5" aria-hidden="true" /><span className="hidden sm:inline">Needs </span>attention</span>
            : technicalOnly
              ? <span className="quote-chip quote-chip--review flex-shrink-0 font-medium t-cap" title={item.review?.fit ? `Indicative price — no standard product is made at this size; ${brandSubject()} will design a composite/custom unit and confirm the price at review. You can still submit.` : `${brandSubject()} will confirm this at review — you can still submit.`}><Info className="w-2.5 h-2.5" aria-hidden="true" />Needs review</span>
              : <span className="quote-chip quote-chip--ready flex-shrink-0 font-medium t-cap"><Check className="w-2.5 h-2.5" aria-hidden="true" />Ready</span>}
          {compositeUnits > 0 && (
            <span className="quote-chip quote-chip--review flex-shrink-0 font-medium t-cap">
              Composite · {compositeUnits} {p?.categorySlug === "doors" ? "doors" : "windows"}
            </span>
          )}
          {/* Basis chip (UX spec §5): orthogonal to status — report-backed vs
              assumption-based. Hidden on small screens; the tooltip carries the
              compliance sentence once, and doubles as the upload upsell. */}
          {basisCopy && (
            <span className={`hidden md:inline-flex flex-shrink-0 items-center font-medium px-1.5 py-0.5 border ${ basisCopy.strong ? "border-positive/30 bg-positive/10 text-positive" : "border-dashed border-black/20 bg-black/[0.03] text-body-soft" } t-cap`} title={basisCopy.detail.replace("{brand}", brandSubject())}>
              {basisCopy.label}
            </span>
          )}
          {/* Updated pill (spec §3): information, not a demand — work-slate tone,
              session-scoped (decays on reload). Expanding shows the old→new rows. */}
          {!!changes?.length && (
            <span className="flex-shrink-0 inline-flex items-center font-medium px-1.5 py-0.5 border border-info/30 bg-info/10 text-info t-cap"
              title="This line was updated by a document you uploaded — expand to see what changed.">
              Updated
            </span>
          )}
        </span>
        <span className={`flex-shrink-0 font-semibold ${priceReady ? "text-ink" : "text-body"} font-data t-data`}>
          {priceLabel}{priceReady ? <span className="hidden sm:inline font-normal text-body t-cap"> {gstSuffix(gstMode)}</span> : null}
        </span>

        <div className="flex items-center gap-0.5 flex-shrink-0" aria-label="Item actions">
          {onDuplicate && <button onClick={onDuplicate} className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center text-body hover:text-sage icon-btn cursor-pointer" aria-label="Duplicate item"><Copy className="w-4 h-4" /></button>}
          {onRemove && <button onClick={onRemove} className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center text-body hover:text-red-600 icon-btn cursor-pointer" aria-label="Remove item"><Trash2 className="w-4 h-4" /></button>}
          <button onClick={toggleExpanded} aria-expanded={isExpanded} aria-label={isExpanded ? "Collapse item" : "Expand item"} className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center text-body hover:text-ink icon-btn cursor-pointer">
            <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {item.review?.customerConfigurationChanged && onRestoreAi && (
        <div className="quote-notice--warning px-3 sm:px-4 py-2 border-b border-warning/30 flex items-center justify-between gap-3">
          <p className="text-amber-800 t-cap">
            This edit needs a new exact price. You can restore the previous AI-priced configuration.
          </p>
          <button
            type="button"
            disabled={restoringAi}
            onClick={() => {
              setRestoringAi(true);
              Promise.resolve(onRestoreAi()).finally(() => setRestoringAi(false));
            }}
            className="flex-shrink-0 font-semibold underline text-amber-900 disabled:opacity-50 cursor-pointer t-cap">
            {restoringAi ? "Restoring…" : "Restore AI selection"}
          </button>
        </div>
      )}

      {/* The compact summary is useful only while the detail groups are collapsed. */}
      {!isExpanded && (
        <div className="quote-item-body px-3 sm:px-4 py-3">
          <button onClick={toggleExpanded} aria-expanded={isExpanded}
            className="w-full text-left cursor-pointer group/summary">
            <span className="block text-quiet mb-1 t-label">Configuration</span>
            <span className="block text-body group-hover/summary:text-ink t-cap">{summaryLine}</span>
            <span className="block text-body mt-1 truncate group-hover/summary:text-ink t-cap"><span className="text-quiet">Options:</span> {selectedOptionsSummary}</span>
          </button>
          {attention && attentionMsg && (
            <p className={`mt-2.5 pt-2.5 border-t flex items-start gap-1.5 ${technicalOnly ? "quote-message--info" : "quote-message--warning"} t-cap`}>
              {technicalOnly
                ? <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" aria-hidden="true" />
                : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" aria-hidden="true" />}
              <span>{technicalOnly ? `${brandSubject()} will confirm at technical review — you can still submit. ` : ""}{attentionMsg}</span>
            </p>
          )}
        </div>
      )}

      {/* ── Expanded detail groups — one open at a time ── */}
      {isExpanded && (
        <div className="quote-item-body border-t border-line">
          {/* Mobile basis disclosure (UX review, blocking): the header chip is
              hidden below md, but "assumed / not a certificate" is compliance
              language and must stay reachable on phones — so the expanded body
              carries it inline where the chip's tooltip can't be hovered. */}
          {basisCopy && (
            <p className={`md:hidden px-3 sm:px-4 py-2 border-b border-black/[0.06] ${ basisCopy.strong ? "text-positive bg-positive/5" : "text-body-soft bg-black/[0.02]" } t-cap`}>
              {basisCopy.detail.replace("{brand}", brandSubject())}
            </p>
          )}
          {/* Change provenance (spec §3): strike-through old → current, same
              grammar as superseded revision values. What changed and to what —
              the WHY (which document) lives in the digest banner. */}
          {!!changes?.length && (
            <div className="quote-notice--info px-3 sm:px-4 py-2 border-b border-line">
              <span className="block text-info mb-1 t-label">Updated from your documents</span>
              {changes.map((ch, i) => (
                <p key={i} className="text-info-ink t-cap">
                  <span className="capitalize">{ch.field === "qty" ? "Quantity" : ch.field}</span>:{" "}
                  <span className="line-through text-quiet">{ch.from}</span>
                  {" → "}
                  <span className="font-medium">{ch.to}</span>
                </p>
              ))}
            </div>
          )}
          {/* How this opening gets built, when it is too large for one unit.
              Sits ABOVE the editable detail: it is the answer to "why does my
              line look like this?", not a footnote under it. */}
          {item.segments && item.segments.length > 0 && (
            <CompositePanel item={item} quote={quote} />
          )}
          {/* Product is editable — a schedule line the parser couldn't match (or
              flagged for substitution) is re-pointed here. Changing product resets
              options to the new product's defaults and clears the product flag. */}
          <Section variant="row" label="Product" summary={p ? p.name : "No product selected — choose one"} attention={hasIssue("product")} open={open === "product"} onToggle={() => toggle("product")}>
            <ProductPicker productSlug={item.productSlug} onPick={slug => {
              const np = getProductBySlug(slug);
              update({ productSlug: slug, options: np ? defaultOptions(np) : {}, review: clearReviewKey(item.review, "product") });
            }} />
            {p && <p className="text-body mt-2 t-cap"><Info className="w-3 h-3 inline mr-1" />Changing the product resets its options to the standard selections.</p>}
          </Section>
          {p ? (
            <>
              <Section variant="row" label="Dimensions" summary={dimsSummary} attention={hasIssue("dims")} open={open === "dims"} onToggle={() => toggle("dims")}>
                <DimensionsFields p={p} width={item.width} height={item.height}
                  setWidth={v => update({ width: v, review: clearReviewKey(item.review, "dims") })}
                  setHeight={v => update({ height: v, review: clearReviewKey(item.review, "dims") })}
                  // Under panel parity the note lives HERE, as it does in the
                  // estimator's panel — a group holding one optional text field
                  // is a disclosure that never earns its click.
                  location={panelParity ? item.location : undefined}
                  setLocation={panelParity ? (v => update({ location: v })) : undefined} />
              </Section>
              <Section variant="row" label="Options" summary={optionSummaryOf(p, item.options)} attention={hasIssue("options")} open={open === "options"} onToggle={() => toggle("options")}>
                <OptionsFields p={p} options={item.options} setOpt={(t, v) => update({ options: { ...item.options, [t]: v }, review: clearReviewKey(item.review, "options") })} />
              </Section>
              {/* Quantity is gone under panel parity (owner): the estimator's
                  model is one opening per reference, so a stepper offers a
                  decision that does not exist. The legacy card keeps it until
                  /quote retires — see panelParity. */}
              {!panelParity && (
                <Section variant="row" label="Quantity & note" summary={qtySummary} open={open === "qty"} onToggle={() => toggle("qty")}>
                  <QtyLocationFields qty={item.qty} location={item.location} setQty={v => update({ qty: v })} setLocation={v => update({ location: v })} />
                </Section>
              )}
            </>
          ) : (
            <div className="quote-notice--warning px-4 py-3 border-t border-line flex items-start gap-1.5 t-cap">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" aria-hidden="true" />
              <span>Choose a product above to set its dimensions, options and quantity.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Composite opening — how one opening gets built as several joined units ───
//
// The customer submitted ONE line with ONE tag (W12) and gets back N products.
// Everything here defends against that reading as a bait-and-switch:
//
//  • their code, their opening size and their price stay exactly where they were
//  • segments carry the WORD "included", never an amount, so three numbers can
//    never look like three charges. The parent total is the only figure.
//  • the sum is restated as the parent's own total — repeating a number the
//    customer already saw is reassurance; introducing new ones is alarm.
//
// It is read-only by construction: a customer may not choose or edit a
// composite, only see it and question it. There are no controls here.
export function CompositePanel({ item, quote }: { item: QItem; quote: QuoteState }) {
  const segments = item.segments ?? [];
  const units = segments.reduce((n, s) => n + Math.max(1, s.qtyPerParent), 0);
  const openingW = parseInt(item.width) || 0;
  const openingH = parseInt(item.height) || 0;
  const brand = brandSubject();
  const parentProduct = getProductBySlug(item.productSlug);
  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const axis = item.compositeAxis === "horizontal" ? "horizontal" : "vertical";

  const saveUnit = async (segmentId: string, built: Omit<QItem, "id">) => {
    setBusy(true); setError("");
    try {
      await quote.updateSegment(segmentId, {
        productSlug: built.productSlug,
        options: built.options,
        alongMm: parseInt(axis === "vertical" ? built.width : built.height) || 0,
      });
      setEditingUnit(null);
    } catch {
      setError("That unit could not be saved. Check its product, size and options, then try again.");
    } finally { setBusy(false); }
  };

  // Adding and removing units are NOT here (owner, 2026-08-04). The unit COUNT
  // is the split decision, and the split decision is not the customer's — see
  // the note on the customer segment route. They may change what each unit IS;
  // they may not change how many there are.


  return (
    <div className="quote-composite-panel border-t border-line px-4 py-4 md:px-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2.5 h-2.5 border border-info flex-shrink-0" aria-hidden="true" />
        <span className="text-info font-data t-label">
          Built as {units} units
        </span>
      </div>

      <p className="text-body mb-3 max-w-[62ch] t-cap">
        No single unit is made {mm(item.width)} wide, so {item.code || "this opening"} is built as {units} units joined
        on site. One opening, one price — {brand.toLowerCase() === "we" ? "we confirm" : `${brand} confirms`} the join at technical review.
      </p>

      <div className="quote-panel">
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-black/8">
          <span className="text-quiet font-data t-data-sm">Your opening</span>
          <span className="text-ink font-data t-data-sm">
            {openingW && openingH ? `${openingW.toLocaleString("en-AU")} × ${openingH.toLocaleString("en-AU")} mm` : "—"}
          </span>
        </div>
        {segments.map((s, i) => (
          <div key={s.id} className="border-b border-black/5 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
              <span className="text-ink min-w-0 t-cap">
                <span className="text-quiet mr-2 font-data">
                  Unit {i + 1}{s.qtyPerParent > 1 ? ` ×${s.qtyPerParent}` : ""}
                </span>
                {productLabel(s.productSlug)}
              </span>
              <span className="flex items-center gap-3 flex-shrink-0">
                <span className="text-body font-data t-data-sm">
                  {(parseInt(s.width) || 0).toLocaleString("en-AU")} × {(parseInt(s.height) || 0).toLocaleString("en-AU")}
                </span>
                <span className="text-quiet font-data t-data-sm">included</span>
                <button type="button" disabled={busy} onClick={() => setEditingUnit(editingUnit === s.id ? null : s.id)}
                  className="font-medium text-sage underline underline-offset-2 disabled:opacity-50 cursor-pointer t-cap">
                  {editingUnit === s.id ? "Close" : "Edit"}
                </button>
              </span>
            </div>
            {editingUnit === s.id && (
              <div className="quote-composite-editor px-3.5 pb-3.5">
                <p className="py-2 text-body t-cap">
                  Unit {i + 1}. Its {axis === "vertical" ? "height" : "width"} follows the parent opening; edit the product, options and {axis === "vertical" ? "width" : "height"} here.
                </p>
                <ItemForm
                  key={`${s.id}-${s.productSlug}-${s.width}-${s.height}`}
                  scope="unit"
                  unitAxis={axis}
                  quote={quote}
                  seed={{ productSlug: s.productSlug, width: s.width, height: s.height, options: s.options ?? {}, qty: s.qty }}
                  submitLabel={busy ? "Saving…" : `Save unit ${i + 1}`}
                  onCommit={(built) => void saveUnit(s.id, built)}
                  onCancel={() => setEditingUnit(null)}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-body t-cap">Changes are repriced now and confirmed during technical review.</p>
      {error && <p role="alert" className="mt-2 text-red-700 t-cap">{error}</p>}

      <p className="text-quiet mt-3 max-w-[62ch] t-cap">
        Two or more units joined on site is how large openings are made. The join is an engineering
        decision — mullion size, wind load and weather seal — so {brand.toLowerCase() === "we" ? "we confirm" : `${brand} confirms`} the final layout during technical review.
      </p>
    </div>
  );
}
