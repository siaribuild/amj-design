// ═══════════════════════════════════════════════════════════════════════════════
// QUOTE BUILDER + MyProject (Route A)
// Product-selectable composer lives here too, so trade users can build a whole
// multi-item order from one page: upload a schedule (parsed into draft lines) and/or
// configure items directly. Added items collapse into compact editable cards.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import {
  Upload, UploadCloud, FileText, X, Plus, ChevronLeft, ArrowRight, Check,
  AlertCircle, CheckCircle, Send, ShieldCheck, UserCheck, LayoutGrid,
} from "lucide-react";
import { type Page, SAGE, WindowMark, GhostMark, SLabel, Btn, FieldLabel, Input } from "../app/ui";
import { ItemForm, ItemSummaryCard, itemNeedsAttention } from "../components/ItemComposer";
import { getProductBySlug } from "../data/catalogue";
import {
  type QuoteState,
  priceConfigured, defaultOptions, fmt, mm, productLabel,
} from "../data/configurator";

type QuoteUser = { name: string; email: string; phone: string; type: string } | null;

interface Draft { key: number; productSlug: string; width: string; height: string; qty: number; attention?: string }

export function QuotePage({ setPage, user, quote }: { setPage: (p: Page) => void; user: QuoteUser; quote: QuoteState }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [view, setView] = useState<"build" | "review">("build");
  const [newKey, setNewKey] = useState(0);
  const [adding, setAdding] = useState(quote.items.length === 0);
  const [uploading, setUploading] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const [submitted, setSubmitted] = useState(false);
  const [contactName, setContactName] = useState(user?.name || "");
  const [contactEmail, setContactEmail] = useState(user?.email || "");
  const [contactPhone, setContactPhone] = useState(user?.phone || "");
  const [suburb, setSuburb] = useState("");

  const total = quote.items.reduce((s, it) => s + priceConfigured(it).total, 0);
  const attentionCount = quote.items.filter(itemNeedsAttention).length;
  const hasContent = quote.items.length > 0 || quote.files.length > 0;

  const fakeUpload = () => {
    setUploading(true);
    setTimeout(() => {
      quote.addFiles([{ id: Date.now(), name: "window-schedule-rev-b.pdf", kind: "PDF", status: "Processing" }]);
      setDrafts([
        { key: 1, productSlug: "amj80-series-sliding-window", width: "1750", height: "1200", qty: 4 },
        { key: 2, productSlug: "amj80-series-awning-window", width: "900", height: "1200", qty: 2 },
        { key: 3, productSlug: "amj80-series-casement-window", width: "700", height: "", qty: 2, attention: "Height not detected — confirm the opening height." },
      ]);
      setUploading(false);
    }, 1400);
  };
  // Add every parsed line as a card; incomplete ones land as cards flagged for
  // attention (the reviewer resolves them before submitting).
  const addDraftsToProject = () => {
    drafts.forEach(d => {
      const p = getProductBySlug(d.productSlug);
      quote.add({ productSlug: d.productSlug, location: "", measuredBy: "", width: d.width, height: d.height, options: p ? defaultOptions(p) : {}, qty: d.qty, status: "Ready" });
    });
    setDrafts([]);
  };

  // ─── Submitted ──────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="relative min-h-screen bg-[#FAFAF9] pt-24 pb-24 overflow-hidden">
        <GhostMark size={300} opacity={0.05} pos="right-0 bottom-0" />
        <div className="max-w-md w-full mx-auto px-6 text-center relative">
          <div className="w-14 h-14 border border-[#5A7A6A]/30 bg-[#5A7A6A]/8 flex items-center justify-center mx-auto mb-6"><WindowMark size={24} color={SAGE} /></div>
          <h2 className="text-2xl font-semibold text-[#131311] mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Quote submitted</h2>
          <p className="text-[#5c5a56] text-sm mb-1">Reference</p>
          <p className="font-semibold text-lg mb-6 text-[#5A7A6A]" style={{ fontFamily: "'DM Mono', monospace" }}>AMJ-58901</p>
          <p className="text-sm text-[#5c5a56] leading-relaxed mb-8">We'll review dimensions, specifications and manufacturing suitability, then issue a reviewed quote. Expect a response within 1–2 business days.</p>
          <p className="text-xs text-[#5c5a56] mb-6">No payment at this stage. Deposit only after you approve the reviewed quote.</p>
          <div className="flex gap-3 justify-center">
            <Btn variant="sage" size="md" onClick={() => go("track-order")}>Track this order</Btn>
            <Btn variant="ghost" size="md" onClick={() => go("home")}>Back to home</Btn>
          </div>
        </div>
      </div>
    );
  }

  // ─── Review + submit ──────────────────────────────────────────────────────────
  if (view === "review") {
    return (
      <div className="min-h-screen bg-[#FAFAF9] pt-16">
        <div className="max-w-2xl mx-auto px-6 py-10">
          <button onClick={() => setView("build")} className="text-[#5c5a56] hover:text-[#131311] text-sm mb-5 flex items-center gap-1 cursor-pointer"><ChevronLeft className="w-4 h-4" />Back to MyProject</button>
          <SLabel>Review quote</SLabel>
          <h1 className="text-3xl font-semibold text-[#131311] mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Review and submit</h1>
          <p className="text-[#5c5a56] text-sm mb-6">No payment at this stage. A reviewed quote is issued after manual technical review.</p>
          <div className="border border-black/10 bg-white p-5 mb-4">
            <SLabel>Your quote</SLabel>
            <div className="space-y-2 mb-3">
              {quote.items.map((it, i) => (
                <div key={it.id} className="flex justify-between gap-3 text-sm border-b border-black/6 last:border-0 py-1.5">
                  <span className="text-[#131311] min-w-0 truncate">{String(i + 1).padStart(2, "0")} · {productLabel(it.productSlug)} — {mm(it.width)} × {mm(it.height)} ×{it.qty}</span>
                  <span className="text-[#5c5a56] flex-shrink-0" style={{ fontFamily: "'DM Mono', monospace" }}>{it.status === "Needs review" ? "Review" : fmt(priceConfigured(it).total)}</span>
                </div>
              ))}
              {quote.files.length > 0 && <p className="text-xs text-[#5c5a56] pt-1">+ {quote.files.length} uploaded file{quote.files.length !== 1 ? "s" : ""} for review</p>}
            </div>
            <div className="flex justify-between border-t border-black/8 pt-3 text-sm"><span className="text-[#5c5a56]">Estimated total</span><span className="font-semibold text-[#131311]" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(total)} inc GST</span></div>
          </div>
          <div className="border border-black/10 bg-white p-5 space-y-4 mb-4">
            {user && <p className="text-sm text-[#5A7A6A] flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />Pre-filled from your account — edit if needed.</p>}
            <div><FieldLabel>Full name</FieldLabel><Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Your name" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><FieldLabel>Email</FieldLabel><Input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="your@email.com" /></div>
              <div><FieldLabel>Phone</FieldLabel><Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="(03) 9000 0000" /></div>
            </div>
            <div><FieldLabel>Delivery suburb / postcode</FieldLabel><Input value={suburb} onChange={e => setSuburb(e.target.value)} placeholder="e.g. Preston VIC 3072" /></div>
          </div>
          <div className="bg-[#F2F0EC] border border-black/8 p-4 mb-6 text-xs text-[#5c5a56]"><AlertCircle className="w-3 h-3 inline mr-1" />Estimated totals are confirmed on technical review. No deposit until you approve the reviewed quote. Supply only — installation not included.</div>
          <div className="flex justify-end"><Btn variant="sage" size="lg" disabled={!contactName || !contactEmail} onClick={() => setSubmitted(true)}>Submit for technical review <Send className="w-4 h-4" /></Btn></div>
        </div>
      </div>
    );
  }

  // ─── Build ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* ─── Dark functional hero — header overlays it; upload panel is a live
             part of the hero, styled like the panels on the home hero ───────── */}
      <section className="relative bg-[#0c0c0a] overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1774516534130-d67eb3c98798?w=1920&h=1080&fit=crop&auto=format"
          alt="Contemporary home interior with full-height aluminium-framed glazing onto a landscaped garden at dusk"
          className="absolute inset-0 w-full h-full object-cover opacity-70 hero-zoom" />
        {/* Contrast overlay — stronger on the left behind the copy */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(12,12,10,0.9) 0%, rgba(12,12,10,0.6) 22%, rgba(12,12,10,0.32) 50%, rgba(12,12,10,0.28) 100%)" }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0a]/50 via-transparent to-transparent" />

        <div className="relative w-full max-w-6xl mx-auto px-6 pt-20 pb-6 md:pt-24 md:pb-9">
          <div className="grid gap-4 md:gap-10 md:grid-cols-[1fr_minmax(300px,380px)] md:items-center">
            {/* Copy */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2.5 md:mb-4">
                <LayoutGrid className="w-3.5 h-3.5 text-white/55" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60"
                  style={{ fontFamily: "'DM Mono', monospace" }}>Your quote</span>
              </div>
              <h1 className="font-semibold text-white leading-[1.03] tracking-tight mb-2 md:mb-3"
                style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.9rem, 4.2vw, 3rem)" }}>
                Build your quote
              </h1>
              <p className="text-white/80 text-[13px] leading-snug md:text-[15px] md:leading-relaxed max-w-lg">
                Add products manually or upload your plans and schedule. We'll review the
                specifications and issue a confirmed quote before any deposit is required.
              </p>
              {/* Trust row — decorative, hidden on mobile to keep the hero shallow */}
              <div className="hidden sm:flex flex-wrap items-center gap-x-6 gap-y-2 mt-5 text-[13px] text-white/65">
                <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-white/50" />Supply only</span>
                <span className="flex items-center gap-1.5"><UserCheck className="w-4 h-4 text-white/50" />Reviewed by our team</span>
                <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-white/50" />No account needed</span>
              </div>
            </div>

            {/* Upload panel — functional, matches home-hero panel styling. On mobile
                the decorative box collapses to just the button (the priority action). */}
            <div className="sm:border sm:border-dashed sm:border-white/25 sm:bg-white/[0.06] sm:backdrop-blur-md sm:p-6 sm:text-center">
              {uploading ? (
                <div className="flex items-center justify-center gap-3 py-3 sm:py-4 sm:flex-col">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 border-2 border-[#8CA99B] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-white/75">Reading your file…</p>
                </div>
              ) : (
                <>
                  <UploadCloud className="hidden sm:block w-8 h-8 text-white/70 mx-auto mb-3" />
                  <p className="hidden sm:block text-sm font-semibold text-white mb-1">Upload plans or a schedule</p>
                  <p className="text-[11px] tracking-wide text-white/55 mb-2 sm:mb-4"
                    style={{ fontFamily: "'DM Mono', monospace" }}>PDF · DWG · XLS · CSV · JPG</p>
                  <Btn variant="sage" size="md" onClick={fakeUpload} className="w-full justify-center">
                    <Upload className="w-4 h-4" />Upload files
                  </Btn>
                  <p className="hidden sm:block text-[11px] text-white/50 mt-3">or drag and drop files here</p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Parsed-upload review */}
        {drafts.length > 0 && (
          <div className="border border-[#5A7A6A]/30 bg-white mb-4">
            <div className="bg-[#5A7A6A]/8 border-b border-[#5A7A6A]/20 px-5 py-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#5A7A6A]" />
              <p className="text-sm font-semibold text-[#131311]">We found {drafts.length} item{drafts.length !== 1 ? "s" : ""} in your file</p>
            </div>
            <div className="divide-y divide-black/8">
              {drafts.map(d => (
                <div key={d.key} className={`px-5 py-3 ${d.attention ? "bg-amber-50" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#131311] truncate">{productLabel(d.productSlug)}</p>
                      <p className="text-xs text-[#5c5a56]">{mm(d.width)} × {d.height ? mm(d.height) : "—"} · ×{d.qty}</p>
                    </div>
                    {d.attention
                      ? <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap flex-shrink-0">Needs attention</span>
                      : <span className="text-[10px] px-2 py-0.5 bg-[#5A7A6A]/10 text-[#5A7A6A] whitespace-nowrap flex-shrink-0 flex items-center gap-1"><Check className="w-3 h-3" />Ready</span>}
                  </div>
                  {d.attention && (
                    <p className="flex items-start gap-1.5 mt-2 text-xs text-amber-800">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" /><span>{d.attention}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-black/8 flex items-center justify-between gap-3">
              <p className="text-xs text-[#5c5a56]">{drafts.filter(d => d.attention).length > 0 ? `${drafts.filter(d => d.attention).length} will need attention in MyProject.` : "All items ready."}</p>
              <Btn variant="sage" size="sm" onClick={addDraftsToProject}>
                Add {drafts.length} to MyProject <Plus className="w-4 h-4" />
              </Btn>
            </div>
          </div>
        )}

        {/* MyProject — items + composer */}
        <div className={drafts.length > 0 ? "mt-8 pt-8 border-t border-black/10" : ""}>
          {quote.items.length > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <WindowMark size={16} color={SAGE} />
              <h2 className="text-xl font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>MyProject</h2>
              <span className="text-xs text-[#5c5a56] border border-black/10 px-2 py-0.5">{quote.items.length} item{quote.items.length !== 1 ? "s" : ""}</span>
            </div>
          )}

          {/* Uploaded files chip list */}
          {quote.files.length > 0 && (
            <div className="border border-black/10 bg-white mb-3 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-[#5c5a56] mb-2">Uploaded for review · {quote.files.length}</p>
              {quote.files.map(f => (
                <div key={f.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 min-w-0 text-[#131311]"><FileText className="w-3.5 h-3.5 text-[#5A7A6A] flex-shrink-0" /><span className="truncate">{f.name}</span></span>
                  <span className="flex items-center gap-3 flex-shrink-0"><span className="text-[11px] text-[#5A7A6A]">{f.status}</span><button onClick={() => quote.removeFile(f.id)} className="text-[#5c5a56] hover:text-red-600 cursor-pointer" aria-label="Remove file"><X className="w-3.5 h-3.5" /></button></span>
                </div>
              ))}
            </div>
          )}

          {/* Item cards — sections expand/edit inline */}
          <div className="space-y-3">
            {quote.items.map((it, i) => (
              <ItemSummaryCard key={it.id} item={it} index={i} quote={quote}
                onDuplicate={() => quote.copy(it.id)}
                onRemove={() => quote.remove(it.id)} />
            ))}
          </div>

          {/* Add another item — a compact "+" link that opens the composer */}
          {adding ? (
            <div className="mt-3">
              <ItemForm key={`new-${newKey}`} quote={quote}
                onCommit={(b) => { quote.add(b); setNewKey(k => k + 1); setAdding(false); }}
                onCancel={quote.items.length > 0 ? () => setAdding(false) : undefined} />
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="mt-3 w-full flex items-center justify-center gap-1.5 border border-dashed border-black/20 hover:border-[#5A7A6A] py-3 text-sm text-[#5A7A6A] font-medium cursor-pointer transition-colors">
              <Plus className="w-4 h-4" />Add another item
            </button>
          )}

          {/* Total + review */}
          {quote.items.length > 0 && (
            <>
              {attentionCount > 0 && (
                <div className="mt-6 flex items-start gap-2 bg-amber-50 border border-amber-300 px-4 py-3 text-sm text-amber-800">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span><span className="font-medium">{attentionCount} item{attentionCount !== 1 ? "s" : ""} need{attentionCount === 1 ? "s" : ""} attention.</span> Resolve the highlighted card{attentionCount !== 1 ? "s" : ""} before submitting for review.</span>
                </div>
              )}
              <div className={`border border-black/10 bg-[#FAFAF9] px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${attentionCount > 0 ? "mt-3" : "mt-6"}`}>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#5c5a56]">Estimated total</p>
                  <p className="text-2xl font-semibold text-[#131311]" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(total)} <span className="text-xs font-normal text-[#5c5a56]">inc GST</span></p>
                </div>
                <Btn variant="sage" size="lg" disabled={attentionCount > 0} onClick={() => { setView("review"); window.scrollTo(0, 0); }}>Review quote <ArrowRight className="w-4 h-4" /></Btn>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
