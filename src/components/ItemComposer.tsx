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
import { useState } from "react";
import { Check, AlertCircle, Info, ChevronDown, Plus, Minus, Pencil, Trash2 } from "lucide-react";
import { SAGE, WindowMark, Btn, FieldLabel, Input } from "../app/ui";
import { type Product, getProductBySlug, getProductsByFamily } from "../data/catalogue";
import {
  type QItem, type QuoteState, type MeasuredBy, MEASURED_LABELS,
  optionGroupsFor, defaultOptions, priceConfigured, familyGroups,
  fmt, mm, productLabel,
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

function OptionsFields({ p, options, setOpt }: { p: Product; options: Record<string, string>; setOpt: (typeSlug: string, v: string) => void }) {
  const groups = optionGroupsFor(p);
  const [openOpt, setOpenOpt] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {groups.map(g => {
        const val = options[g.typeSlug];
        const open = openOpt === g.typeSlug;
        return (
          <div key={g.typeSlug} className="border border-black/10">
            <button onClick={() => setOpenOpt(open ? null : g.typeSlug)} className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left cursor-pointer bg-white">
              <span className="min-w-0">
                <span className="text-[10px] uppercase tracking-widest text-[#5c5a56] block">{g.label}{g.required && !val ? <span className="text-amber-600"> · required</span> : ""}</span>
                <span className={`text-sm font-medium truncate block ${val ? "text-[#131311]" : "text-[#9a9894]"}`}>{val || "Select…"}</span>
              </span>
              <ChevronDown className={`w-4 h-4 text-[#5c5a56] flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            <div className={`grid transition-[grid-template-rows] duration-200 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <div className="px-4 pb-3 pt-1 flex flex-wrap gap-1.5 border-t border-black/6">
                  {g.choices.map(c => (
                    <button key={c.name} onClick={() => setOpt(g.typeSlug, c.name)}
                      className={`text-xs px-3 py-1.5 border transition-colors cursor-pointer ${val === c.name ? "border-[#131311] bg-[#131311] text-white" : "border-black/15 bg-white text-[#131311] hover:border-[#5A7A6A]"}`}>
                      {c.name}
                    </button>
                  ))}
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
          <FieldLabel>Location / room (optional)</FieldLabel>
          <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Living room, north" />
        </div>
      </div>
      <p className="text-[11px] text-[#5c5a56] mt-2"><Info className="w-3 h-3 inline mr-1" />Quantity means every unit on this line is identical. For a different size, add a separate item.</p>
    </div>
  );
}

// ─── Collapsible section shell ────────────────────────────────────────────────
function Section({ label, summary, open, onToggle, children, variant = "boxed" }: {
  label: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode; variant?: "boxed" | "row";
}) {
  const boxed = variant === "boxed";
  return (
    <div className={boxed ? "border border-black/10" : ""}>
      <button onClick={onToggle} aria-expanded={open} className={`w-full flex items-center justify-between gap-3 text-left cursor-pointer bg-white ${boxed ? "px-4 py-3" : "px-4 py-2.5 hover:bg-[#FAFAF9] transition-colors"}`}>
        <span className="min-w-0">
          <span className="text-[10px] uppercase tracking-widest text-[#5c5a56] block">{label}</span>
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
  const canSave = priced.ok && inRange;
  const built: Omit<QItem, "id"> = { productSlug, location, measuredBy, width, height, options, qty, status: "Ready" };

  const pickFamily = (slug: string) => { setFamilySlug(slug); setProductSlug(""); };
  const pickProduct = (slug: string) => { setProductSlug(slug); const np = getProductBySlug(slug); setOptions(np ? defaultOptions(np) : {}); };
  const setOpt = (typeSlug: string, v: string) => setOptions(o => ({ ...o, [typeSlug]: v }));

  const famGroups = familyGroups();
  const familyProducts = familySlug ? getProductsByFamily(familySlug) : [];
  const dimsSummary = dimsEntered ? `${mm(width)} × ${mm(height)}${measuredBy ? ` · ${MEASURED_LABELS[measuredBy as Exclude<MeasuredBy, "">]}` : ""}` : "Enter the opening size";
  const qtySummary = `Qty ${qty}${location ? ` · ${location}` : ""}`;

  return (
    <div className="border border-black/10 bg-white">
      <div className="px-4 md:px-5 py-5 space-y-3">
        {lockedSlug ? (
          p && (
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 border border-[#5A7A6A]/30 flex items-center justify-center flex-shrink-0"><WindowMark size={15} color={SAGE} /></span>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-[#5c5a56]">Product</p>
                <p className="text-sm font-semibold text-[#131311] truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{p.name}</p>
              </div>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <Section label="Dimensions" summary={dimsSummary} open={open.dims} onToggle={() => setOpen(o => ({ ...o, dims: !o.dims }))}>
              <DimensionsFields p={p} width={width} height={height} measuredBy={measuredBy} setWidth={setWidth} setHeight={setHeight} setMeasuredBy={setMeasuredBy} rail={rail} />
            </Section>
            <Section label="Options" summary={optionSummaryOf(p, options)} open={open.options} onToggle={() => setOpen(o => ({ ...o, options: !o.options }))}>
              <OptionsFields p={p} options={options} setOpt={setOpt} />
            </Section>
            <Section label="Quantity & location" summary={qtySummary} open={open.qty} onToggle={() => setOpen(o => ({ ...o, qty: !o.qty }))}>
              <QtyLocationFields qty={qty} location={location} setQty={setQty} setLocation={setLocation} />
            </Section>
          </div>
        )}
      </div>

      {p && (
        <div className="border-t border-black/10 bg-white px-4 md:px-5 py-4 md:static sticky bottom-0 z-30" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
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

// ═══ MyProject ITEM CARD — sections expand/edit inline (live) ══════════════════
export function ItemSummaryCard({ item, index, added, quote, onDuplicate, onRemove, initialFocus }: {
  item: QItem; index?: number; added?: boolean; quote: QuoteState;
  onDuplicate?: () => void; onRemove?: () => void; initialFocus?: EditFocus;
}) {
  const [open, setOpen] = useState<EditFocus | null>(initialFocus ?? null);
  const p = getProductBySlug(item.productSlug);
  const pr = priceConfigured(item);
  const w = parseInt(item.width) || 0, h = parseInt(item.height) || 0;
  const valid = !!p && pr.ok && inRangeFor(p, w, h);
  const toggle = (s: EditFocus) => setOpen(o => (o === s ? null : s));
  const update = (patch: Partial<QItem>) => quote.update(item.id, patch);

  const dimsSummary = w && h ? `${mm(item.width)} × ${mm(item.height)}${item.measuredBy ? ` · ${MEASURED_LABELS[item.measuredBy as Exclude<MeasuredBy, "">]}` : ""}` : "Enter the opening size";
  const qtySummary = `Qty ×${item.qty}${item.location ? ` · ${item.location}` : ""}`;

  return (
    <div className={`border ${added ? "border-[#5A7A6A]/40" : "border-black/10"} bg-white flex`}>
      <div className={`w-9 flex-shrink-0 flex items-start justify-center pt-3 border-r border-black/8 ${added ? "bg-[#5A7A6A]/8" : "bg-[#FAFAF9]"}`}>
        {added ? <Check className="w-4 h-4 text-[#5A7A6A]" /> : <span className="text-[11px] text-[#5A7A6A]" style={{ fontFamily: "'DM Mono', monospace" }}>{index != null ? String(index + 1).padStart(2, "0") : ""}</span>}
      </div>
      <div className="flex-1 min-w-0">
        {/* Product (fixed) */}
        <div className="px-4 py-2.5 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[#131311] truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{productLabel(item.productSlug)}</p>
          {!valid && <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0 whitespace-nowrap">Check size</span>}
        </div>
        <div className="border-t border-black/8">
          {p && (
            <>
              <Section variant="row" label="Dimensions" summary={dimsSummary} open={open === "dims"} onToggle={() => toggle("dims")}>
                <DimensionsFields p={p} width={item.width} height={item.height} measuredBy={item.measuredBy}
                  setWidth={v => update({ width: v })} setHeight={v => update({ height: v })} setMeasuredBy={v => update({ measuredBy: v })} />
              </Section>
              <Section variant="row" label="Options" summary={optionSummaryOf(p, item.options)} open={open === "options"} onToggle={() => toggle("options")}>
                <OptionsFields p={p} options={item.options} setOpt={(t, v) => update({ options: { ...item.options, [t]: v } })} />
              </Section>
              <Section variant="row" label="Quantity & location" summary={qtySummary} open={open === "qty"} onToggle={() => toggle("qty")}>
                <QtyLocationFields qty={item.qty} location={item.location} setQty={v => update({ qty: v })} setLocation={v => update({ location: v })} />
              </Section>
            </>
          )}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-black/8">
            <span className="text-sm font-semibold text-[#131311]" style={{ fontFamily: "'DM Mono', monospace" }}>{valid ? `${fmt(pr.total)} inc GST` : "—"}</span>
            <div className="flex items-center gap-2">
              {onDuplicate && <Btn variant="ghost" size="sm" onClick={onDuplicate}>Duplicate</Btn>}
              {onRemove && <button onClick={onRemove} className="text-[#5c5a56] hover:text-red-600 cursor-pointer p-1" aria-label="Remove item"><Trash2 className="w-4 h-4" /></button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
