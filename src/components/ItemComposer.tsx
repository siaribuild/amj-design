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
import {
  type QItem, type QuoteState, type OptionChoice, type GlazingChoice,
  optionGroupsFor, defaultOptions, linePriceTotal, familyGroups, glazingChoicesFor,
  fmt, mm, productLabel, POPULAR_COLOURS, normCode, suggestCode, clearReviewKey, lineBlocksSubmission,
} from "../data/configurator";
import { useGstMode, gstAdjust, gstSuffix } from "../data/gst";
import { previewPrice } from "../data/api";
import { brandSubject } from "../data/sanity";

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

// ─── Product-frame diagram — responds to entered aspect ratio ─────────────────
export function FrameDiagram({ w, h, tone = "sage" }: { w: number; h: number; tone?: "sage" | "light" }) {
  const ratio = (w > 0 && h > 0) ? Math.min(2.8, Math.max(0.3, w / h)) : 1.5;
  const MAXW = 190, MAXH = 130;
  let bw: number, bh: number;
  if (ratio >= 1) { bw = MAXW; bh = MAXW / ratio; if (bh > MAXH) { bh = MAXH; bw = MAXH * ratio; } }
  else { bh = MAXH; bw = MAXH * ratio; if (bw > MAXW) { bw = MAXW; bh = MAXW / ratio; } }
  const stroke = tone === "sage" ? "var(--sage)" : "color-mix(in srgb, var(--paper) 55%, transparent)";
  const faint = tone === "sage" ? "color-mix(in srgb, var(--sage) 35%, transparent)" : "color-mix(in srgb, var(--paper) 24%, transparent)";
  return (
    <div className="flex items-end justify-center py-1" style={{ minHeight: MAXH + 30 }} aria-hidden="true">
      <div className="relative" style={{ width: bw, height: bh }}>
        <div className="absolute -left-5 top-0 bottom-0 flex flex-col items-center justify-center">
          <div className="w-px flex-1" style={{ background: faint }} />
          <span className="my-1 t-cap font-display" style={{ writingMode: "vertical-rl", color: stroke }}>H</span>
          <div className="w-px flex-1" style={{ background: faint }} />
        </div>
        <div className="absolute inset-0 border-2" style={{ borderColor: stroke, background: tone === "sage" ? "color-mix(in srgb, var(--sage) 5%, transparent)" : "color-mix(in srgb, var(--paper) 4%, transparent)" }}>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-px" style={{ background: faint }} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-px" style={{ background: faint }} />
        </div>
        <div className="absolute -bottom-5 left-0 right-0 flex items-center justify-center gap-1">
          <div className="h-px flex-1" style={{ background: faint }} />
          <span className="t-cap font-display" style={{ color: stroke }}>W</span>
          <div className="h-px flex-1" style={{ background: faint }} />
        </div>
      </div>
    </div>
  );
}

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
function DimensionsFields({ p, width, height, setWidth, setHeight, rail = false, lockedDimension }: {
  p: Product; width: string; height: string;
  setWidth: (v: string) => void; setHeight: (v: string) => void; rail?: boolean;
  lockedDimension?: "width" | "height";
}) {
  const w = parseInt(width) || 0, h = parseInt(height) || 0;
  const dimsEntered = w > 0 && h > 0;
  const inRange = inRangeFor(p, w, h);
  const tooSmall = dimsEntered && ((p.minWidth != null && w < p.minWidth) || (p.minHeight != null && h < p.minHeight));
  const oversize = dimsEntered && !inRange && !tooSmall;
  const wideFamily = p.categorySlug === "doors" || p.familySlug === "sliding-window";
  const reversed = wideFamily && dimsEntered && h > w * 1.1 && inRange;
  return (
    <div>
      <div className={`flex gap-4 ${rail ? "flex-col" : "flex-col md:flex-row"}`}>
        <div className={rail ? "w-full" : "md:w-44 flex-shrink-0"}><FrameDiagram w={w} h={h} /></div>
        <div className="flex-1 space-y-3">
          <div>
            <FieldLabel>Width — horizontal (mm)</FieldLabel>
            <Input type="number" inputMode="numeric" value={width} onChange={e => setWidth(e.target.value)} placeholder="e.g. 1810" disabled={lockedDimension === "width"} />
          </div>
          <div>
            <FieldLabel>Height — vertical (mm)</FieldLabel>
            <Input type="number" inputMode="numeric" value={height} onChange={e => setHeight(e.target.value)} placeholder="e.g. 1210" disabled={lockedDimension === "height"} />
          </div>
          {dimsEntered && inRange && (
            <p className="text-ink t-bd-sm"><Check className="w-3.5 h-3.5 inline text-sage mr-1" />You have entered: <span className="font-medium">{mm(width)} wide × {mm(height)} high</span></p>
          )}
          {!dimsEntered && (
            <p className="text-body t-cap">Fits {mm(p.minWidth ?? 0)}–{mm(p.maxWidth ?? 0)} wide, {mm(p.minHeight ?? 0)}–{mm(p.maxHeight ?? 0)} high.</p>
          )}
          {reversed && (
            <div className="quote-notice--warning flex items-start gap-2 border border-warning/40 px-3 py-2 t-cap">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-warning" />
              <span>Height is greater than width — these look reversed. <button onClick={() => { setWidth(height); setHeight(width); }} className="underline font-medium cursor-pointer">Swap</button></span>
            </div>
          )}
          {tooSmall && (
            <div className="quote-notice--danger flex items-start gap-2 border border-destructive/35 px-3 py-2 t-cap">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-destructive" />
              <span>{p.name} starts at {mm(p.minWidth ?? 0)} wide and {mm(p.minHeight ?? 0)} high. Check the measurement.</span>
            </div>
          )}
          {oversize && (
            <div className="quote-notice--info flex items-start gap-2 border border-info/35 px-3 py-2 t-cap">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                No single {p.name} is made this large (up to {mm(p.maxWidth ?? 0)} × {mm(p.maxHeight ?? 0)}). Openings this
                size are built as two or more units joined on site. <strong className="font-medium">Keep your real size</strong> — we design
                the join and confirm the price at technical review.
              </span>
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
      <div className={`grid transition-[grid-template-rows] duration-200 ${showAll ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
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
          <div className={`grid transition-[grid-template-rows] duration-200 ${openOpt === "glazing" ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div className="overflow-hidden">
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
                <span className="text-body block t-label">{g.label}{g.required && !val ? <span className="text-amber-600"> · required</span> : ""}</span>
                <span className={`font-medium truncate flex items-center gap-1.5 ${val ? "text-ink" : "text-quieter"} t-bd-sm`}>
                  {isColour && val && <span className="w-3.5 h-3.5 flex-shrink-0 border border-black/25" style={{ backgroundColor: swatchHex || "var(--muted)" }} aria-hidden="true" />}
                  {val || "Select…"}
                </span>
              </span>
              <ChevronDown className={`w-4 h-4 text-body flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            <div className={`grid transition-[grid-template-rows] duration-200 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
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
    <div className={boxed ? `border ${attention ? "border-warning/40" : "border-line"}` : "border-b border-line last:border-b-0"}>
      <button onClick={onToggle} aria-expanded={open} data-attention={attention ? "true" : "false"} className={`quote-section-trigger w-full flex items-center justify-between gap-3 text-left cursor-pointer ${boxed ? "px-4 py-3" : "px-4 py-2.5"}`}>
        <span className="min-w-0">
          <span className={`block flex items-center gap-1 ${attention ? "text-amber-700" : "text-body"} t-label`}>{label}{attention && <AlertCircle className="w-3 h-3" />}</span>
          <span className="text-ink font-medium truncate block t-bd-sm">{summary}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-body flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden"><div className={`quote-section-content ${boxed ? "px-4 pb-4 pt-1 border-t border-line" : "px-4 pb-4 pt-1 border-t border-line"}`}>{children}</div></div>
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
): { label: string; value: string; chosen: boolean }[] => {
  if (!p) return [];
  const out: { label: string; value: string; chosen: boolean }[] = [];
  const glazing = glazingChoicesFor(p);
  if (glazing.length) {
    const name = glazing.find(g => g.slug === options.glazing)?.name;
    out.push({ label: "Glazing", value: name ?? "None", chosen: !!name });
  }
  for (const g of optionGroupsFor(p)) {
    const value = options[g.typeSlug];
    out.push({ label: g.label, value: value || "None", chosen: !!value });
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
  stickyActions = false, hideHeader = false,
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
}) {
  const isUnit = scope === "unit";
  const unitHeading = unitMode === "add" ? "Add composite unit" : "Edit composite unit";
  const seedProduct = seed?.productSlug ? getProductBySlug(seed.productSlug) : undefined;
  const [familySlug, setFamilySlug] = useState(lockedSlug ? (getProductBySlug(lockedSlug)?.familySlug || "") : (seedProduct?.familySlug || ""));
  const [productSlug, setProductSlug] = useState(lockedSlug || seed?.productSlug || "");
  const p = getProductBySlug(productSlug);
  const [code, setCode] = useState(seed?.code || (productSlug ? suggestCode(quote.items, productSlug) : ""));
  const [codeEdited, setCodeEdited] = useState(!!seed?.code);

  const [width, setWidth] = useState(seed?.width || "");
  const [height, setHeight] = useState(seed?.height || "");
  const [options, setOptions] = useState<Record<string, string>>(seed?.options ? { ...seed.options } : (p ? defaultOptions(p) : {}));
  const [qty, setQty] = useState(seed?.qty || 1);
  const [location, setLocation] = useState(seed?.location || "");
  // `initialSection` lets a caller open the form AT the offending field —
  // /quote-project's `Fix details` is a direct action, not merely an expand.
  const [open, setOpen] = useState<{ dims: boolean; options: boolean; qty: boolean }>({
    dims: initialSection ? initialSection === "dims" : true,
    options: initialSection === "options",
    qty: initialSection === "qty",
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
  const oversize = dimsEntered && !inRange && !((p?.minWidth != null && w < p.minWidth) || (p?.minHeight != null && h < p.minHeight));
  const tooSmall = dimsEntered && !inRange && !oversize;
  // Oversize is submittable, flagged; undersize is a typo and blocks.
  // Before the first save there is no project to price-preview against (the claim
  // cookie is minted on save); the save itself creates the project and prices the
  // line server-side, so don't deadlock the first item on a preview we can't run.
  const priceDeferred = !!priced.needsProject;
  // `busy` covers an in-flight save the CALLER owns (composite segment writes are
  // async round-trips). Without it the primary stays enabled during the request
  // and a second click fires the mutation twice — two units added, not one.
  const canSave = (priced.ok || priceDeferred) && !tooSmall && !duplicateCode && !busy;
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
  const setOpt = (typeSlug: string, v: string) => setOptions(o => ({ ...o, [typeSlug]: v }));

  const famGroups = familyGroups();
  const familyProducts = familySlug ? getProductsByFamily(familySlug) : [];
  const dimsSummary = dimsEntered ? `${mm(width)} × ${mm(height)}` : "Enter the opening size";
  const qtySummary = `Qty ${qty}${location ? ` · ${location}` : ""}`;
  // A hidden Options group must not still gate saving on a choice the user was
  // never shown — that is an invisible disabled button.
  const issues = (p ? itemIssues(p, { width, height, options }) : [])
    .filter((i) => !(hideOptions && i.section === "options"));
  const hasIssue = (s: EditFocus) => issues.some(i => i.section === s);

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
                <Input value={code} maxLength={10} onChange={e => { setCodeEdited(true); setCode(e.target.value.toUpperCase()); }} placeholder="e.g. W01" />
                {duplicateCode && <p className="text-amber-700 mt-1 t-cap">Item ID already exist</p>}
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
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${isUnit ? "md:grid-cols-2" : "md:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)]"}`}>
            {!isUnit && (
              <div>
                <FieldLabel>Item ID</FieldLabel>
                <Input value={code} maxLength={10} onChange={e => { setCodeEdited(true); setCode(e.target.value.toUpperCase()); }} placeholder="e.g. W01" />
                {duplicateCode && <p className="text-amber-700 mt-1 t-cap">Item ID already exist</p>}
              </div>
            )}
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
            <div>
              <FieldLabel>Product</FieldLabel>
              <div className="relative">
                <select value={productSlug} onChange={e => pickProduct(e.target.value)} disabled={!familySlug} className={`${selectClass} disabled:cursor-not-allowed`}>
                  <option value="">{familySlug ? "Choose a product…" : "Select a type first"}</option>
                  {familyProducts.map(pr => <option key={pr.slug} value={pr.slug}>{pr.name}</option>)}
                </select>
                <ChevronDown className="w-4 h-4 text-body absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>
        )}

        {p && (
          <div className="space-y-2">
            <Section label="Dimensions" summary={dimsSummary} attention={hasIssue("dims")} open={open.dims} onToggle={() => setOpen(o => ({ ...o, dims: !o.dims }))}>
              <DimensionsFields p={p} width={width} height={height} setWidth={setWidth} setHeight={setHeight} rail={rail}
                lockedDimension={isUnit ? (unitAxis === "vertical" ? "height" : "width") : undefined} />
            </Section>
            {!hideOptions && (
            <Section label="Options" summary={optionSummaryOf(p, options)} attention={hasIssue("options")} open={open.options} onToggle={() => setOpen(o => ({ ...o, options: !o.options }))}>
              <OptionsFields p={p} options={options} setOpt={setOpt} />
            </Section>
            )}
            {/* A unit's quantity is not its own: it is the opening's quantity
                times how many of this frame go into one opening, and composite.ts
                is the single writer of the product. Offering a quantity box here
                would let a reviewer type a number the next recompute overwrites.
                The room is the opening's too — one opening, one location. */}
            {!isUnit && (
              <Section label="Quantity & note" summary={qtySummary} open={open.qty} onToggle={() => setOpen(o => ({ ...o, qty: !o.qty }))}>
                <QtyLocationFields qty={qty} location={location} setQty={setQty} setLocation={setLocation} />
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
      {p && (
        <div className={`quote-panel-footer px-4 md:px-5 py-4 sticky bottom-0 z-30 ${stickyActions ? "" : "md:static"}`}
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
          {issues.length > 0 && (
            <p className="text-amber-800 mb-2 flex items-start gap-1.5 t-cap"><AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />{issues.map(i => i.msg).join(" · ")}.</p>
          )}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-body t-label">Estimated price</p>
              {priced.ok ? (
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
  item, added, quote, onDuplicate, onRemove, initialFocus, id, focusSignal,
  expanded, onToggleExpanded, duplicate, codeFocusSignal, basis, changes, onRestoreAi,
}: {
  item: QItem; added?: boolean; quote: QuoteState;
  onDuplicate?: () => void; onRemove?: () => void; initialFocus?: EditFocus;
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
  const pr = { total: linePriceTotal(item) };
  const displayTotal = linePriceTotal(item);
  const aiPriced = item.origin === "ai" || !!item.aiPriced;
  const priceReady = aiPriced ? typeof item.lineTotal === "number" : pr.ok;
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
              shows the italic amber "Choose a product" customer action. */}
          <button onClick={toggleExpanded} aria-expanded={isExpanded}
            className={`min-w-0 truncate text-left font-semibold cursor-pointer hover:text-sage ${item.productSlug ? "text-ink" : "text-warning-ink italic"} font-display t-bd-sm`}>
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
                  setHeight={v => update({ height: v, review: clearReviewKey(item.review, "dims") })} />
              </Section>
              <Section variant="row" label="Options" summary={optionSummaryOf(p, item.options)} attention={hasIssue("options")} open={open === "options"} onToggle={() => toggle("options")}>
                <OptionsFields p={p} options={item.options} setOpt={(t, v) => update({ options: { ...item.options, [t]: v }, review: clearReviewKey(item.review, "options") })} />
              </Section>
              <Section variant="row" label="Quantity & note" summary={qtySummary} open={open === "qty"} onToggle={() => toggle("qty")}>
                <QtyLocationFields qty={item.qty} location={item.location} setQty={v => update({ qty: v })} setLocation={v => update({ location: v })} />
              </Section>
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
  const [addingUnit, setAddingUnit] = useState(false);
  const [removingUnit, setRemovingUnit] = useState<string | null>(null);
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

  // Opening this form is intentionally local: the customer must choose the new
  // frame before a unit exists in the quote. No inherited product or glazing is
  // silently saved just because they clicked Add.
  const addUnit = () => {
    setAddingUnit(true); setEditingUnit(null); setRemovingUnit(null); setError("");
  };

  const saveNewUnit = async (built: Omit<QItem, "id">) => {
    if (!item.serverId) return;
    setBusy(true); setError("");
    try {
      await quote.addSegment(item.serverId, {
        productSlug: built.productSlug,
        options: built.options,
        alongMm: parseInt(axis === "vertical" ? built.width : built.height) || 0,
      });
      setAddingUnit(false);
    } catch {
      setError("That unit could not be added. Check its product, size and options, then try again.");
    } finally { setBusy(false); }
  };

  const removeUnit = async (segmentId: string) => {
    setBusy(true); setError("");
    try { await quote.removeSegment(segmentId); setRemovingUnit(null); }
    catch { setError("That unit could not be removed. A composite must retain at least two units."); }
    finally { setBusy(false); }
  };

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
                {segments.length > 2 && (removingUnit === s.id ? (
                  <span className="inline-flex items-center gap-1.5 t-cap">
                    <button type="button" disabled={busy} onClick={() => void removeUnit(s.id)} className="font-medium text-red-600 underline">Confirm</button>
                    <button type="button" onClick={() => setRemovingUnit(null)} className="text-body underline">Keep</button>
                  </span>
                ) : (
                  <button type="button" disabled={busy} onClick={() => setRemovingUnit(s.id)}
                    className="text-body underline underline-offset-2 disabled:opacity-50 cursor-pointer t-cap">Remove</button>
                ))}
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

      {addingUnit && (
        <div className="quote-composite-editor mt-3 px-3.5 pb-3.5">
          <p className="py-2 text-body t-cap">Choose the product, its options and the new unit's size before adding it to this opening.</p>
          <ItemForm
            key={"new-unit-" + (item.serverId ?? item.id)}
            scope="unit"
            unitAxis={axis}
            unitMode="add"
            quote={quote}
            seed={{
              width: axis === "vertical" ? "" : item.width,
              height: axis === "vertical" ? item.height : "",
              options: {}, qty: 1,
            }}
            submitLabel={busy ? "Adding…" : "Add unit"}
            onCommit={saveNewUnit}
            onCancel={() => setAddingUnit(false)}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button type="button" disabled={busy || !item.serverId || addingUnit} onClick={addUnit}
          className="font-medium text-sage underline underline-offset-2 disabled:opacity-50 cursor-pointer t-cap">
          {addingUnit ? "New unit open" : <>+ Add {parentProduct?.categorySlug === "doors" ? "door" : "window"}</>}
        </button>
        <span className="text-body t-cap">Changes are repriced now and confirmed during technical review.</span>
      </div>
      {error && <p role="alert" className="mt-2 text-red-700 t-cap">{error}</p>}

      <p className="text-quiet mt-3 max-w-[62ch] t-cap">
        Two or more units joined on site is how large openings are made. The join is an engineering
        decision — mullion size, wind load and weather seal — so {brand.toLowerCase() === "we" ? "we confirm" : `${brand} confirms`} the final layout during technical review.
      </p>
    </div>
  );
}
