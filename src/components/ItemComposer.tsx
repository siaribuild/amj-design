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
import { Check, AlertCircle, Info, ChevronDown, Plus, Minus, Pencil, Trash2, Copy } from "lucide-react";
import { SAGE, WindowMark, Btn, FieldLabel, Input } from "../app/ui";
import { type Product, getProductBySlug, getProductsByFamily } from "../data/catalogue";
import {
  type QItem, type QuoteState, type MeasuredBy, type OptionChoice, MEASURED_LABELS,
  optionGroupsFor, defaultOptions, priceConfigured, familyGroups,
  fmt, mm, productLabel, POPULAR_COLOURS, normCode, suggestCode,
} from "../data/configurator";

export type EditFocus = "dims" | "options" | "qty";

// ─── Product-frame diagram — responds to entered aspect ratio ─────────────────
export function FrameDiagram({ w, h, tone = "sage" }: { w: number; h: number; tone?: "sage" | "light" }) {
  const ratio = (w > 0 && h > 0) ? Math.min(2.8, Math.max(0.3, w / h)) : 1.5;
  const MAXW = 190, MAXH = 130;
  let bw: number, bh: number;
  if (ratio >= 1) { bw = MAXW; bh = MAXW / ratio; if (bh > MAXH) { bh = MAXH; bw = MAXH * ratio; } }
  else { bh = MAXH; bw = MAXH * ratio; if (bw > MAXW) { bw = MAXW; bh = MAXW / ratio; } }
  const stroke = tone === "sage" ? "#5A7A6A" : "rgba(255,255,255,0.55)";
  const faint = tone === "sage" ? "rgba(90,122,106,0.35)" : "rgba(255,255,255,0.24)";
  return (
    <div className="flex items-end justify-center py-1" style={{ minHeight: MAXH + 30 }} aria-hidden="true">
      <div className="relative" style={{ width: bw, height: bh }}>
        <div className="absolute -left-5 top-0 bottom-0 flex flex-col items-center justify-center">
          <div className="w-px flex-1" style={{ background: faint }} />
          <span className="text-[9px] my-1" style={{ writingMode: "vertical-rl", color: stroke, fontFamily: "'DM Mono', monospace" }}>H</span>
          <div className="w-px flex-1" style={{ background: faint }} />
        </div>
        <div className="absolute inset-0 border-2" style={{ borderColor: stroke, background: tone === "sage" ? "rgba(90,122,106,0.05)" : "rgba(255,255,255,0.04)" }}>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-px" style={{ background: faint }} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-px" style={{ background: faint }} />
        </div>
        <div className="absolute -bottom-5 left-0 right-0 flex items-center justify-center gap-1">
          <div className="h-px flex-1" style={{ background: faint }} />
          <span className="text-[9px]" style={{ color: stroke, fontFamily: "'DM Mono', monospace" }}>W</span>
          <div className="h-px flex-1" style={{ background: faint }} />
        </div>
      </div>
    </div>
  );
}

const MEASURE_OPTIONS: { id: Exclude<MeasuredBy, "">; label: string }[] = [
  { id: "frame", label: "Frame size" }, { id: "opening", label: "Opening size" }, { id: "unsure", label: "Not sure" },
];
const selectClass = "w-full border border-[#131311]/20 bg-white pl-3 pr-9 py-2.5 text-sm text-[#131311] focus:outline-none focus:border-[#5A7A6A] transition-colors appearance-none cursor-pointer";

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
  else if (!inRangeFor(p, w, h)) issues.push({ section: "dims", msg: "Size is outside the allowed range" });
  for (const g of optionGroupsFor(p)) if (g.required && !it.options[g.typeSlug]) issues.push({ section: "options", msg: `Choose ${g.label.toLowerCase()}` });
  return issues;
}

// Does a saved item still need attention before it can be submitted?
export function itemNeedsAttention(item: QItem): boolean {
  const p = getProductBySlug(item.productSlug);
  return !p || itemIssues(p, item).length > 0;
}

// ─── Field blocks (shared by the new-item form and the MyProject card) ────────
function DimensionsFields({ p, width, height, measuredBy, setWidth, setHeight, setMeasuredBy, rail = false }: {
  p: Product; width: string; height: string; measuredBy: MeasuredBy;
  setWidth: (v: string) => void; setHeight: (v: string) => void; setMeasuredBy: (v: MeasuredBy) => void; rail?: boolean;
}) {
  const w = parseInt(width) || 0, h = parseInt(height) || 0;
  const dimsEntered = w > 0 && h > 0;
  const inRange = inRangeFor(p, w, h);
  const outOfRange = dimsEntered && !inRange;
  const wideFamily = p.categorySlug === "doors" || p.familySlug === "sliding-window";
  const reversed = wideFamily && dimsEntered && h > w * 1.1 && inRange;
  return (
    <div>
      <div className={`flex gap-4 ${rail ? "flex-col" : "flex-col md:flex-row"}`}>
        <div className={rail ? "w-full" : "md:w-44 flex-shrink-0"}><FrameDiagram w={w} h={h} /></div>
        <div className="flex-1 space-y-3">
          <div>
            <FieldLabel>Width — horizontal (mm)</FieldLabel>
            <Input type="number" inputMode="numeric" value={width} onChange={e => setWidth(e.target.value)} placeholder="e.g. 1810" />
          </div>
          <div>
            <FieldLabel>Height — vertical (mm)</FieldLabel>
            <Input type="number" inputMode="numeric" value={height} onChange={e => setHeight(e.target.value)} placeholder="e.g. 1210" />
          </div>
          {dimsEntered && inRange && (
            <p className="text-sm text-[#131311]"><Check className="w-3.5 h-3.5 inline text-[#5A7A6A] mr-1" />You have entered: <span className="font-medium">{mm(width)} wide × {mm(height)} high</span></p>
          )}
          {!dimsEntered && (
            <p className="text-xs text-[#5c5a56]">Fits {mm(p.minWidth ?? 0)}–{mm(p.maxWidth ?? 0)} wide, {mm(p.minHeight ?? 0)}–{mm(p.maxHeight ?? 0)} high.</p>
          )}
          {reversed && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-800">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
              <span>Height is greater than width — these look reversed. <button onClick={() => { setWidth(height); setHeight(width); }} className="underline font-medium cursor-pointer">Swap</button></span>
            </div>
          )}
          {outOfRange && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-300 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-red-500" />
              <span>Size must be within {mm(p.minWidth ?? 0)}–{mm(p.maxWidth ?? 0)} wide and {mm(p.minHeight ?? 0)}–{mm(p.maxHeight ?? 0)} high for {p.name}.</span>
            </div>
          )}
        </div>
      </div>
      {/* Measurement basis — after the size has been entered */}
      {dimsEntered && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-widest text-[#5c5a56] mb-2">How did you measure?</p>
          <div className="grid grid-cols-3 gap-1.5">
            {MEASURE_OPTIONS.map(m => (
              <button key={m.id} onClick={() => setMeasuredBy(m.id)}
                className={`px-2 py-2 text-xs border transition-colors cursor-pointer ${measuredBy === m.id ? "border-[#5A7A6A] bg-[#5A7A6A] text-white font-medium" : "border-black/15 bg-white text-[#131311] hover:border-[#5A7A6A]/60"}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
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
      className={`flex items-center gap-2 px-2.5 py-2 border text-left transition-colors cursor-pointer min-w-0 ${selected ? "border-[#131311] bg-[#131311]/[0.04] ring-1 ring-[#131311]" : "border-black/15 bg-white hover:border-[#5A7A6A]"}`}>
      {hex !== undefined && <span className="w-4 h-4 flex-shrink-0 border border-black/25" style={{ background: hex || "#ccc" }} aria-hidden="true" />}
      <span className="text-xs text-[#131311] truncate flex-1">{label}</span>
      {selected && <Check className="w-3.5 h-3.5 text-[#5A7A6A] flex-shrink-0" aria-hidden="true" />}
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
        className="mt-2 flex items-center gap-1 text-xs font-medium text-[#5A7A6A] hover:text-[#4a6858] cursor-pointer">
        {showAll ? "Hide other colours" : "Other colours"}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAll ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ${showAll ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <p className="text-[10px] uppercase tracking-widest text-[#5c5a56] pt-2 pb-1.5">All standard colours</p>
          <div className={OPTION_GRID}>
            {choices.map(c => <OptionButton key={c.name} label={c.name} hex={c.hex} selected={value === c.name} onPick={() => onPick(c.name)} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionsFields({ p, options, setOpt }: { p: Product; options: Record<string, string>; setOpt: (typeSlug: string, v: string) => void }) {
  const groups = optionGroupsFor(p);
  const [openOpt, setOpenOpt] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {groups.map(g => {
        const val = options[g.typeSlug];
        const open = openOpt === g.typeSlug;
        const isColour = g.typeSlug === "colour";
        const swatchHex = isColour ? g.choices.find(c => c.name === val)?.hex : undefined;
        return (
          <div key={g.typeSlug} className="border border-black/10">
            <button onClick={() => setOpenOpt(open ? null : g.typeSlug)} className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left cursor-pointer bg-white">
              <span className="min-w-0">
                <span className="text-[10px] uppercase tracking-widest text-[#5c5a56] block">{g.label}{g.required && !val ? <span className="text-amber-600"> · required</span> : ""}</span>
                <span className={`text-sm font-medium truncate flex items-center gap-1.5 ${val ? "text-[#131311]" : "text-[#9a9894]"}`}>
                  {isColour && val && <span className="w-3.5 h-3.5 flex-shrink-0 border border-black/25" style={{ background: swatchHex || "#ccc" }} aria-hidden="true" />}
                  {val || "Select…"}
                </span>
              </span>
              <ChevronDown className={`w-4 h-4 text-[#5c5a56] flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
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

function QtyLocationFields({ qty, location, setQty, setLocation }: {
  qty: number; location: string; setQty: (v: number) => void; setLocation: (v: string) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>Quantity — identical units</FieldLabel>
          <div className="flex items-center border border-[#131311]/20 h-[44px] w-full">
            <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-12 h-full flex items-center justify-center text-[#5c5a56] hover:bg-[#FAFAF9] cursor-pointer" aria-label="Decrease quantity"><Minus className="w-4 h-4" /></button>
            <span className="flex-1 text-center text-sm font-medium">{qty}</span>
            <button onClick={() => setQty(qty + 1)} className="w-12 h-full flex items-center justify-center text-[#5c5a56] hover:bg-[#FAFAF9] cursor-pointer" aria-label="Increase quantity"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
        <div>
          <FieldLabel>Note (optional)</FieldLabel>
          <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Bedroom 1, north elevation" />
        </div>
      </div>
      <p className="text-[11px] text-[#5c5a56] mt-2"><Info className="w-3 h-3 inline mr-1" />Quantity means every unit on this line is identical. For a different size, add a separate item.</p>
    </div>
  );
}

// ─── Collapsible section shell ────────────────────────────────────────────────
function Section({ label, summary, open, onToggle, children, variant = "boxed", attention = false }: {
  label: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode; variant?: "boxed" | "row"; attention?: boolean;
}) {
  const boxed = variant === "boxed";
  return (
    <div className={boxed ? `border ${attention ? "border-amber-300" : "border-black/10"}` : "border-b border-black/[0.06] last:border-b-0"}>
      <button onClick={onToggle} aria-expanded={open} className={`w-full flex items-center justify-between gap-3 text-left cursor-pointer ${attention ? "bg-amber-50" : "bg-white"} ${boxed ? "px-4 py-3" : "px-4 py-2.5 hover:bg-[#FAFAF9] transition-colors"}`}>
        <span className="min-w-0">
          <span className={`text-[10px] uppercase tracking-widest block flex items-center gap-1 ${attention ? "text-amber-700" : "text-[#5c5a56]"}`}>{label}{attention && <AlertCircle className="w-3 h-3" />}</span>
          <span className="text-sm text-[#131311] font-medium truncate block">{summary}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-[#5c5a56] flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden"><div className={`${boxed ? "px-4 pb-4 pt-1 border-t border-black/6" : "px-4 pb-4 pt-1 border-t border-black/6 bg-[#FAFAF9]/40"}`}>{children}</div></div>
      </div>
    </div>
  );
}

const optionSummaryOf = (p: Product | undefined, options: Record<string, string>) =>
  (p ? optionGroupsFor(p).map(g => options[g.typeSlug]).filter(Boolean) : []).join(" · ") || "Standard selections";

// ═══ NEW-ITEM FORM (product picker + sections + commit) ═══════════════════════
export function ItemForm({ lockedSlug, quote, seed, onCommit, onCancel, rail = false, submitLabel = "Save" }: {
  lockedSlug?: string;
  quote: QuoteState;
  seed?: Partial<QItem> | null;
  onCommit: (built: Omit<QItem, "id">) => void;
  onCancel?: () => void;
  rail?: boolean;
  submitLabel?: string;
}) {
  const seedProduct = seed?.productSlug ? getProductBySlug(seed.productSlug) : undefined;
  const [familySlug, setFamilySlug] = useState(lockedSlug ? (getProductBySlug(lockedSlug)?.familySlug || "") : (seedProduct?.familySlug || ""));
  const [productSlug, setProductSlug] = useState(lockedSlug || seed?.productSlug || "");
  const p = getProductBySlug(productSlug);
  const [code, setCode] = useState(seed?.code || (productSlug ? suggestCode(quote.items, productSlug) : ""));
  const [codeEdited, setCodeEdited] = useState(!!seed?.code);

  const [measuredBy, setMeasuredBy] = useState<MeasuredBy>(seed?.measuredBy || "");
  const [width, setWidth] = useState(seed?.width || "");
  const [height, setHeight] = useState(seed?.height || "");
  const [options, setOptions] = useState<Record<string, string>>(seed?.options ? { ...seed.options } : (p ? defaultOptions(p) : {}));
  const [qty, setQty] = useState(seed?.qty || 1);
  const [location, setLocation] = useState(seed?.location || "");
  const [open, setOpen] = useState<{ dims: boolean; options: boolean; qty: boolean }>({ dims: true, options: false, qty: false });

  const w = parseInt(width) || 0, h = parseInt(height) || 0;
  const dimsEntered = w > 0 && h > 0;
  const inRange = !!p && inRangeFor(p, w, h);
  const priced = priceConfigured({ productSlug, width, height, options, qty });
  const finalCode = normCode(code) || (productSlug ? suggestCode(quote.items, productSlug) : "");
  const duplicateCode = !!finalCode && quote.items.some(item => normCode(item.code) === finalCode);
  const canSave = priced.ok && inRange && !duplicateCode;
  const built: Omit<QItem, "id"> = { code: finalCode, productSlug, location, measuredBy, width, height, options, qty, status: "Ready" };

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
  const dimsSummary = dimsEntered ? `${mm(width)} × ${mm(height)}${measuredBy ? ` · ${MEASURED_LABELS[measuredBy as Exclude<MeasuredBy, "">]}` : ""}` : "Enter the opening size";
  const qtySummary = `Qty ${qty}${location ? ` · ${location}` : ""}`;
  const issues = p ? itemIssues(p, { width, height, options }) : [];
  const hasIssue = (s: EditFocus) => issues.some(i => i.section === s);

  return (
    <div className="border border-black/10 bg-white">
      <div className="px-4 md:px-5 py-5 space-y-3">
        {lockedSlug ? (
          p && (
            <div className={`grid gap-3 ${rail ? "grid-cols-1" : "sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-end"}`}>
              <div>
                <FieldLabel>Item ID</FieldLabel>
                <Input value={code} maxLength={10} onChange={e => { setCodeEdited(true); setCode(e.target.value.toUpperCase()); }} placeholder="e.g. W01" />
                {duplicateCode && <p className="text-[11px] text-amber-700 mt-1">Item ID already exist</p>}
              </div>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 border border-[#5A7A6A]/30 flex items-center justify-center flex-shrink-0"><WindowMark size={15} color={SAGE} /></span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-[#5c5a56]">Product</p>
                  <p className="text-sm font-semibold text-[#131311] truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{p.name}</p>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div>
              <FieldLabel>Item ID</FieldLabel>
              <Input value={code} maxLength={10} onChange={e => { setCodeEdited(true); setCode(e.target.value.toUpperCase()); }} placeholder="e.g. W01" />
              {duplicateCode && <p className="text-[11px] text-amber-700 mt-1">Item ID already exist</p>}
            </div>
            <div>
              <FieldLabel>Product type</FieldLabel>
              <div className="relative">
                <select value={familySlug} onChange={e => pickFamily(e.target.value)} className={selectClass}>
                  <option value="">Choose a type…</option>
                  {famGroups.map(g => <optgroup key={g.category} label={g.category}>{g.families.map(f => <option key={f.slug} value={f.slug}>{f.name}</option>)}</optgroup>)}
                </select>
                <ChevronDown className="w-4 h-4 text-[#5c5a56] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div>
              <FieldLabel>Product</FieldLabel>
              <div className="relative">
                <select value={productSlug} onChange={e => pickProduct(e.target.value)} disabled={!familySlug} className={`${selectClass} disabled:bg-[#FAFAF9] disabled:text-[#9a9894] disabled:cursor-not-allowed`}>
                  <option value="">{familySlug ? "Choose a product…" : "Select a type first"}</option>
                  {familyProducts.map(pr => <option key={pr.slug} value={pr.slug}>{pr.name}</option>)}
                </select>
                <ChevronDown className="w-4 h-4 text-[#5c5a56] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>
        )}

        {p && (
          <div className="space-y-2">
            <Section label="Dimensions" summary={dimsSummary} attention={hasIssue("dims")} open={open.dims} onToggle={() => setOpen(o => ({ ...o, dims: !o.dims }))}>
              <DimensionsFields p={p} width={width} height={height} measuredBy={measuredBy} setWidth={setWidth} setHeight={setHeight} setMeasuredBy={setMeasuredBy} rail={rail} />
            </Section>
            <Section label="Options" summary={optionSummaryOf(p, options)} attention={hasIssue("options")} open={open.options} onToggle={() => setOpen(o => ({ ...o, options: !o.options }))}>
              <OptionsFields p={p} options={options} setOpt={setOpt} />
            </Section>
            <Section label="Quantity & note" summary={qtySummary} open={open.qty} onToggle={() => setOpen(o => ({ ...o, qty: !o.qty }))}>
              <QtyLocationFields qty={qty} location={location} setQty={setQty} setLocation={setLocation} />
            </Section>
          </div>
        )}
      </div>

      {p && (
        <div className="border-t border-black/10 bg-white px-4 md:px-5 py-4 md:static sticky bottom-0 z-30" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
          {issues.length > 0 && (
            <p className="text-xs text-amber-800 mb-2 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />{issues.map(i => i.msg).join(" · ")}.</p>
          )}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#5c5a56]">Estimated price</p>
              <p className="text-lg font-semibold text-[#131311]" style={{ fontFamily: "'DM Mono', monospace" }}>{canSave ? fmt(priced.total) : "—"} <span className="text-xs font-normal text-[#5c5a56]">inc GST{canSave && qty > 1 ? ` · ${fmt(priced.unit)} ea` : ""}</span></p>
            </div>
            <div className="flex items-center gap-2">
              {onCancel && <Btn variant="ghost" size="md" onClick={onCancel}>Cancel</Btn>}
              <Btn variant="sage" size="md" onClick={() => canSave && onCommit(built)} disabled={!canSave}><Check className="w-4 h-4" />{submitLabel}</Btn>
            </div>
          </div>
          <p className="text-[10px] text-[#5c5a56] mt-1.5">Confirmed on technical review before any deposit. Supply only.</p>
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
        className="w-[4.75rem] h-8 border border-[#5A7A6A] bg-white px-2 text-xs font-semibold text-[#131311] focus:outline-none focus:ring-2 focus:ring-[#5A7A6A]/40"
        style={{ fontFamily: "'DM Mono', monospace" }} />
    );
  }
  return (
    <button onClick={begin} aria-label={`Edit item ID${code ? ` ${code}` : ""}`}
      className={`group/code inline-flex items-center gap-1 h-8 px-2 text-xs font-semibold border transition-colors cursor-pointer ${duplicate ? "border-amber-400 bg-amber-50 text-amber-800" : "border-black/15 bg-white text-[#131311] hover:border-[#5A7A6A]"}`}
      style={{ fontFamily: "'DM Mono', monospace" }}>
      {code || "Set code"}
      <Pencil className="w-3 h-3 text-[#9a9894] group-hover/code:text-[#5A7A6A]" aria-hidden="true" />
    </button>
  );
}

// ═══ MyProject ITEM CARD — compact header + collapsible detail groups ══════════
// Two levels of collapse: the whole item collapses to a header + one summary line;
// expanding reveals the three detail groups (one open at a time). Item code, status
// and line price stay visible in every state.
export function ItemSummaryCard({
  item, added, quote, onDuplicate, onRemove, initialFocus, id, focusSignal,
  expanded, onToggleExpanded, duplicate, codeFocusSignal,
}: {
  item: QItem; added?: boolean; quote: QuoteState;
  onDuplicate?: () => void; onRemove?: () => void; initialFocus?: EditFocus;
  id?: string; focusSignal?: number;
  expanded?: boolean; onToggleExpanded?: () => void; duplicate?: boolean; codeFocusSignal?: number;
}) {
  const [open, setOpen] = useState<EditFocus | null>(initialFocus ?? null);
  const [selfExpanded, setSelfExpanded] = useState(!!initialFocus);
  const isExpanded = expanded ?? selfExpanded;
  const toggleExpanded = onToggleExpanded ?? (() => setSelfExpanded(v => !v));
  const rootRef = useRef<HTMLDivElement>(null);
  const p = getProductBySlug(item.productSlug);
  const pr = priceConfigured(item);
  const w = parseInt(item.width) || 0, h = parseInt(item.height) || 0;
  const issues = p ? itemIssues(p, item) : [];

  // "Review issues" targets this card: open the first offending group + focus it.
  useEffect(() => {
    if (!focusSignal) return;
    const section = issues[0]?.section ?? null;
    if (!section) return;
    setOpen(section);
    // Let the expand/open commit and lay out before moving focus into the group.
    const t = setTimeout(() => {
      const field = rootRef.current?.querySelector<HTMLElement>("input, select, textarea");
      field?.focus({ preventScroll: true });
    }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal]);

  const hasIssue = (s: EditFocus) => issues.some(i => i.section === s);
  const attention = issues.length > 0 || !!duplicate;
  const toggle = (s: EditFocus) => setOpen(o => (o === s ? null : s));
  const update = (patch: Partial<QItem>) => quote.update(item.id, patch);

  const dimsSummary = w && h ? `${mm(item.width)} × ${mm(item.height)}${item.measuredBy ? ` · ${MEASURED_LABELS[item.measuredBy as Exclude<MeasuredBy, "">]}` : ""}` : "Enter the opening size";
  const qtySummary = `Qty ×${item.qty}${item.location ? ` · ${item.location}` : ""}`;
  const summaryLine = `${dimsSummary} · Qty ×${item.qty}${item.location ? ` · ${item.location}` : ""}`;
  const selectedOptionsSummary = optionSummaryOf(p, item.options);
  const attentionMsg = duplicate ? "Item ID already exist" : issues.map(i => i.msg).join(" · ");
  const priceLabel = pr.ok ? fmt(pr.total) : "$-,--";

  const borderTone = attention ? "border-amber-400" : added ? "border-[#5A7A6A]/50" : "border-black/12";

  return (
    <div id={id} ref={rootRef} className={`border bg-white scroll-mt-24 ${borderTone}`}>
      {/* Header: product identity and the highest-priority item actions. */}
      <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-3 bg-[#FAFAF9] border-b border-black/[0.06] whitespace-nowrap">
        <span className="flex-shrink-0">
          <CodeField code={item.code} duplicate={duplicate} editSignal={codeFocusSignal} onCommit={v => update({ code: v })} />
        </span>
        <span className="flex-1 min-w-0 flex items-center gap-1.5">
          <button onClick={toggleExpanded} aria-expanded={isExpanded}
            className="min-w-0 truncate text-left text-sm font-semibold text-[#131311] leading-tight cursor-pointer hover:text-[#5A7A6A]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {productLabel(item.productSlug)}
          </button>
          {attention
            ? <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 border border-amber-300 bg-amber-100 text-amber-800"><AlertCircle className="w-2.5 h-2.5" aria-hidden="true" /><span className="hidden sm:inline">Needs </span>attention</span>
            : <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 border border-[#5A7A6A]/30 bg-[#5A7A6A]/10 text-[#355344]"><Check className="w-2.5 h-2.5" aria-hidden="true" />Ready</span>}
        </span>
        <span className={`flex-shrink-0 text-sm font-semibold ${pr.ok ? "text-[#131311]" : "text-[#5c5a56]"}`} style={{ fontFamily: "'DM Mono', monospace" }}>
          {priceLabel}{pr.ok ? <span className="hidden sm:inline text-[10px] font-normal text-[#5c5a56]"> inc GST</span> : null}
        </span>

        <div className="flex items-center gap-0.5 flex-shrink-0" aria-label="Item actions">
          {onDuplicate && <button onClick={onDuplicate} className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center text-[#5c5a56] hover:text-[#5A7A6A] hover:bg-white cursor-pointer" aria-label="Duplicate item"><Copy className="w-4 h-4" /></button>}
          {onRemove && <button onClick={onRemove} className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center text-[#5c5a56] hover:text-red-600 hover:bg-white cursor-pointer" aria-label="Remove item"><Trash2 className="w-4 h-4" /></button>}
          <button onClick={toggleExpanded} aria-expanded={isExpanded} aria-label={isExpanded ? "Collapse item" : "Expand item"} className="w-8 h-8 sm:w-9 sm:h-9 inline-flex items-center justify-center text-[#5c5a56] hover:text-[#131311] hover:bg-white cursor-pointer">
            <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* The compact summary is useful only while the detail groups are collapsed. */}
      {!isExpanded && (
        <div className="px-3 sm:px-4 py-3 bg-white">
          <button onClick={toggleExpanded} aria-expanded={isExpanded}
            className="w-full text-left cursor-pointer group/summary">
            <span className="block text-[10px] uppercase tracking-widest text-[#8a8782] mb-1">Configuration</span>
            <span className="block text-xs text-[#5c5a56] leading-snug group-hover/summary:text-[#131311]">{summaryLine}</span>
            <span className="block text-xs text-[#5c5a56] leading-snug mt-1 truncate group-hover/summary:text-[#131311]"><span className="text-[#8a8782]">Options:</span> {selectedOptionsSummary}</span>
          </button>
          {attention && attentionMsg && (
            <p className="text-xs text-amber-700 mt-2.5 pt-2.5 border-t border-amber-200 flex items-start gap-1.5 leading-snug">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" aria-hidden="true" />
              <span>{attentionMsg}</span>
            </p>
          )}
        </div>
      )}

      {/* ── Expanded detail groups — one open at a time ── */}
      {isExpanded && p && (
        <div className="border-t border-black/8">
          <Section variant="row" label="Dimensions" summary={dimsSummary} attention={hasIssue("dims")} open={open === "dims"} onToggle={() => toggle("dims")}>
            <DimensionsFields p={p} width={item.width} height={item.height} measuredBy={item.measuredBy}
              setWidth={v => update({ width: v })} setHeight={v => update({ height: v })} setMeasuredBy={v => update({ measuredBy: v })} />
          </Section>
          <Section variant="row" label="Options" summary={optionSummaryOf(p, item.options)} attention={hasIssue("options")} open={open === "options"} onToggle={() => toggle("options")}>
            <OptionsFields p={p} options={item.options} setOpt={(t, v) => update({ options: { ...item.options, [t]: v } })} />
          </Section>
          <Section variant="row" label="Quantity & note" summary={qtySummary} open={open === "qty"} onToggle={() => toggle("qty")}>
            <QtyLocationFields qty={item.qty} location={item.location} setQty={v => update({ qty: v })} setLocation={v => update({ location: v })} />
          </Section>
        </div>
      )}
    </div>
  );
}
