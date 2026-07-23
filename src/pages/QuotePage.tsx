// ═══════════════════════════════════════════════════════════════════════════════
// QUOTE BUILDER + MyProject (Route A)
// Product-selectable composer lives here too, so trade users can build a whole
// multi-item order from one page: upload a schedule (parsed into draft lines) and/or
// configure items directly. Added items collapse into compact editable cards.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from "react";
import {
  Upload, UploadCloud, X, Plus, ChevronLeft, ArrowRight,
  AlertCircle, CheckCircle, Send, ShieldCheck, UserCheck, LayoutGrid, Pencil, Paperclip,
} from "lucide-react";
import { type Page, SAGE, WindowMark, GhostMark, SLabel, Btn, FieldLabel, Input } from "../app/ui";
import { ItemForm, ItemSummaryCard, itemNeedsAttention } from "../components/ItemComposer";
import { StickyQuotePanel } from "../components/StickyQuotePanel";
import { uploadFile, startParse, type ParseResult, type SubmitContact, type SubmitResult } from "../data/api";
import {
  type QuoteState, type QItem,
  priceConfigured, fmt, mm, productLabel, hasDuplicateCode, lineBlocksSubmission, reviewClass, DEFAULT_PROJECT_TITLE,
} from "../data/configurator";
import { useGstMode, gstAdjust, gstSuffix } from "../data/gst";

type QuoteUser = { name: string; email: string; phone: string; type: string } | null;

// Inline-editable project name — same interaction as the item code (CodeField):
// a framed value + pencil, click to edit into a framed field, Enter/blur commits,
// Escape cancels. Empty falls back to the default title.
function ProjectNameField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const begin = () => { setDraft(value); setEditing(true); };
  const commit = () => { setEditing(false); const v = draft.trim() || DEFAULT_PROJECT_TITLE; if (v !== value) onCommit(v); };
  const cancel = () => { setDraft(value); setEditing(false); };
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);

  if (editing) {
    return (
      <input ref={inputRef} value={draft} maxLength={120} aria-label="Project name"
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } else if (e.key === "Escape") { e.preventDefault(); cancel(); } }}
        size={Math.max(draft.length, 12)}
        className="text-2xl md:text-3xl font-semibold text-[#131311] leading-tight bg-white border border-[#5A7A6A] px-2 py-0.5 max-w-full focus:outline-none focus:ring-2 focus:ring-[#5A7A6A]/40"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }} />
    );
  }
  return (
    <button onClick={begin} aria-label={`Rename project${value ? ` (${value})` : ""}`}
      className="group/name inline-flex items-center gap-2 text-2xl md:text-3xl font-semibold text-[#131311] leading-tight border border-black/12 hover:border-[#5A7A6A] bg-white px-2 py-0.5 max-w-full transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A]"
      style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <span className="truncate">{value}</span>
      <Pencil className="w-4 h-4 text-[#9a9894] group-hover/name:text-[#5A7A6A] flex-shrink-0" aria-hidden="true" />
    </button>
  );
}

export function QuotePage({ setPage, user, quote, onSubmit }: { setPage: (p: Page) => void; user: QuoteUser; quote: QuoteState; onSubmit?: (contact: SubmitContact) => Promise<SubmitResult> }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [view, setView] = useState<"build" | "review">("build");
  const [newKey, setNewKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<null | { type: "success" | "error"; message: string }>(null);
  // Replace/Add prompt when parsing into a project that already has content.
  const [choice, setChoice] = useState<null | { fileId: string; existingItems: number; existingFile: string | null; many: boolean }>(null);
  const [clearConfirm, setClearConfirm] = useState(false);

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [contactName, setContactName] = useState(user?.name || "");
  const [contactEmail, setContactEmail] = useState(user?.email || "");
  const [contactPhone, setContactPhone] = useState(user?.phone || "");
  const [suburb, setSuburb] = useState("");

  const total = quote.items.reduce((s, it) => s + priceConfigured(it).total, 0);
  const gstMode = useGstMode();
  // Only CUSTOMER-fixable gaps block submission: an unpriceable line (no product /
  // missing size / missing option) or a duplicate code. Lines carrying only
  // TECHNICAL flags (timber→aluminium, composite sizing, obscure glazing) are
  // priced and stay submittable — submission is how they reach an AMJ technician.
  const itemBlocked = (it: QItem) => lineBlocksSubmission(it) || hasDuplicateCode(quote.items, it.id, it.code);
  const attentionCount = quote.items.filter(itemBlocked).length;
  // Lines that will be confirmed by AMJ at technical review (informational; never
  // block the customer's submission).
  const technicalCount = quote.items.filter((it) => !itemBlocked(it) && reviewClass(it.review) === "technical").length;
  const hasContent = quote.items.length > 0 || quote.files.length > 0;

  // One item expanded at a time; sticky-panel actions drive focus to the problem.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [focusReq, setFocusReq] = useState<{ id: number; nonce: number } | null>(null);
  const [codeFocusReq, setCodeFocusReq] = useState<{ id: number; nonce: number } | null>(null);
  const smoothScroll = (el: Element | null) => {
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  };
  const reviewIssues = () => {
    const bad = quote.items.find(itemBlocked);
    if (!bad) return;
    setExpandedId(bad.id);
    smoothScroll(document.getElementById(`qitem-${bad.id}`));
    if (itemNeedsAttention(bad)) setFocusReq({ id: bad.id, nonce: Date.now() }); // open the invalid group
    else setCodeFocusReq({ id: bad.id, nonce: Date.now() });                     // duplicate code — edit it
  };
  const finishItem = () => {
    const el = document.getElementById("new-item-composer") ?? document.getElementById("quote-start-actions");
    smoothScroll(el);
    requestAnimationFrame(() => el?.querySelector<HTMLElement>("input, select")?.focus({ preventScroll: true }));
  };

  // Submit only when the server confirms it. The success screen is shown ONLY on
  // a confirmed submission — never optimistically — so a failed or lost request
  // surfaces an error instead of a false confirmation.
  const handleSubmit = async () => {
    if (submitting) return;
    if (attentionCount > 0) { setView("build"); reviewIssues(); return; }
    if (!contactName.trim() || !contactEmail.trim()) { setSubmitError("Add your name and email to submit."); return; }
    setSubmitting(true); setSubmitError("");
    try {
      const result = await onSubmit?.({ name: contactName.trim(), email: contactEmail.trim(), phone: contactPhone.trim(), suburb: suburb.trim() });
      if (!result || result.ok) { setSubmitted(true); return; } // no handler = design preview
      setSubmitError(
        result.error === "rejected"
          ? "We couldn't submit this quote — check that every line is priced and your item codes are unique."
          : result.error === "no_project"
            ? "Add at least one item before submitting."
            : "Something went wrong submitting. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Upload → parse flow (one schedule per quote). The file goes to R2, then the
  // server parses it into draft lines; we re-hydrate from the server on success.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openUpload = () => fileInputRef.current?.click();

  // Friendly copy for every non-choice parse failure.
  const parseErrorMessage = (r: Extract<ParseResult, { ok: false }>): string => {
    switch (r.reason) {
      case "no_schedule_found":
        return "We couldn't find a window or door schedule in that file. Check it's the right PDF, or add items manually.";
      case "no_text_layer":
        return "This looks like a scanned PDF — we couldn't read its text. Please upload a digital (text) PDF, or add items manually.";
      case "quota":
        return `You've reached your monthly upload limit (${r.quota.limit}). It resets on ${r.quota.resetsOn}. You can still add items manually.`;
      case "rate_limited":
        return "Too many uploads in a short time — please wait a moment and try again.";
      case "busy":
        return "This project is already processing an upload — please wait for it to finish.";
      case "too_large":
        return "That file is too large. Please upload a schedule under 12 MB.";
      case "not_a_pdf":
        return "That doesn't look like a PDF. Please upload a PDF schedule, or add items manually.";
      case "encrypted_pdf":
        return "That PDF is password-protected — we can't read it. Please upload an unprotected PDF.";
      case "too_many_pages":
        return "That PDF has too many pages to process. Please upload the schedule pages only.";
      default: // file_missing | parse_failed | network
        return "We couldn't process that file. Please try again, or add items manually.";
    }
  };

  // Apply a resolved parse result (never a needs_choice — that is handled inline).
  const applyParseResult = async (result: ParseResult, many: boolean) => {
    if (result.ok) {
      await quote.reload();
      const { itemCount, needsReviewCount } = result.job;
      let message = `${itemCount} items imported${needsReviewCount ? `, ${needsReviewCount} need review` : ""}`;
      if (many) message += ". Only the first file was used — one schedule per quote.";
      setUploadNotice({ type: "success", message });
    } else {
      setUploadNotice({ type: "error", message: parseErrorMessage(result) });
    }
  };

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const file = list[0];                 // one schedule per quote
    const many = list.length > 1;
    setUploading(true);
    setUploadNotice(null);
    setChoice(null);
    try {
      const up = await uploadFile(file, "schedule");
      const result = await startParse(up.file.id);
      if (!result.ok && result.reason === "needs_choice") {
        setChoice({ fileId: up.file.id, existingItems: result.existingItems, existingFile: result.existingFile, many });
        return; // wait for the customer to pick Replace or Add
      }
      await applyParseResult(result, many);
    } catch {
      setUploadNotice({ type: "error", message: "We couldn't process that file. Please try again, or add items manually." });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Resolve the Replace/Add prompt: re-run the parse with an explicit mode.
  const resolveChoice = async (mode: "replace" | "append") => {
    if (!choice) return;
    const { fileId, many } = choice;
    setChoice(null);
    setUploading(true);
    setUploadNotice(null);
    try {
      const result = await startParse(fileId, mode);
      await applyParseResult(result, many);
    } catch {
      setUploadNotice({ type: "error", message: "We couldn't process that file. Please try again, or add items manually." });
    } finally {
      setUploading(false);
    }
  };

  // Home-page deep link (?upload=1) opens the picker on first mount, then cleans the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("upload") === "1") {
      const url = new URL(window.location.href);
      url.searchParams.delete("upload");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      openUpload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whole-project reset — clears every line and the attached schedule (server + local).
  const handleClearAll = async () => {
    setClearConfirm(false);
    setChoice(null);
    setUploadNotice(null);
    await quote.clearAll();
  };

  // ─── Submitted ──────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="relative min-h-screen bg-[#FAFAF9] pt-24 pb-24 overflow-hidden">
        <GhostMark size={300} opacity={0.05} pos="right-0 bottom-0" />
        <div className="max-w-md w-full mx-auto px-6 text-center relative">
          <div className="w-14 h-14 border border-[#5A7A6A]/30 bg-[#5A7A6A]/8 flex items-center justify-center mx-auto mb-6"><WindowMark size={24} color={SAGE} /></div>
          <h2 className="text-2xl font-semibold text-[#131311] mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Quote submitted</h2>
          <p className="text-sm text-[#5c5a56] leading-relaxed mb-8 mt-2">We've received your project and emailed a confirmation to <span className="text-[#131311]">{contactEmail || "your email"}</span>. We'll review dimensions, specifications and manufacturing suitability, then issue a reviewed quote with its reference. Expect a response within 1–2 business days.</p>
          <p className="text-xs text-[#5c5a56] mb-6">No payment at this stage. Deposit only after you approve the reviewed quote.</p>
          <div className="flex gap-3 justify-center">
            <Btn variant="sage" size="md" onClick={() => go(user ? "order" : "track-order")}>{user ? "View status" : "Track an order"}</Btn>
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
                  <span className="text-[#5c5a56] flex-shrink-0" style={{ fontFamily: "'DM Mono', monospace" }}>{it.status === "Needs review" ? "Review" : fmt(gstAdjust(priceConfigured(it).total, gstMode))}</span>
                </div>
              ))}
              {quote.files.length > 0 && <p className="text-xs text-[#5c5a56] pt-1">+ {quote.files.length} uploaded file{quote.files.length !== 1 ? "s" : ""} for review</p>}
            </div>
            <div className="flex justify-between border-t border-black/8 pt-3 text-sm"><span className="text-[#5c5a56]">Estimated total</span><span className="font-semibold text-[#131311]" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(gstAdjust(total, gstMode))} {gstSuffix(gstMode)}</span></div>
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
          {submitError && <p role="alert" className="text-sm text-red-700 flex items-center gap-1.5 mb-3 justify-end"><AlertCircle className="w-4 h-4" />{submitError}</p>}
          <div className="flex justify-end"><Btn variant="sage" size="lg" disabled={!contactName || !contactEmail || submitting} onClick={handleSubmit}>{submitting ? "Submitting…" : <>Submit for technical review <Send className="w-4 h-4" /></>}</Btn></div>
        </div>
      </div>
    );
  }

  // ─── Build ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100svh] bg-[#FAFAF9] flex flex-col">
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
              <input ref={fileInputRef} type="file" multiple className="hidden"
                accept=".pdf,.dwg,.xls,.xlsx,.csv,.jpg,.jpeg,.png"
                onChange={e => handleFiles(e.target.files)} />
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
                  <Btn variant="sage" size="md" onClick={openUpload} className="w-full justify-center">
                    <Upload className="w-4 h-4" />Upload files
                  </Btn>
                  <p className="hidden sm:block text-[11px] text-white/50 mt-3">or drag and drop files here</p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="w-full max-w-6xl mx-auto px-6 pt-10 pb-10 flex-1">
        {/* ─── MyProject — page header; the estimator tool follows ───────────── */}
        <div className="mb-7">
          <SLabel>Your project</SLabel>
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Editable project name — same edit pattern as the item code (pencil →
                framed field → Enter). Persists with the draft and shows in the
                project list, submission and reviewed quote. */}
            <ProjectNameField value={quote.title} onCommit={quote.setTitle} />
            {quote.items.length > 0 && (
              <span className="text-xs text-[#5c5a56] border border-black/10 px-2 py-0.5 flex-shrink-0">{quote.items.length} item{quote.items.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          {/* The uploaded schedule is integral to the order — shown as a non-removable
              chip (only Clear all removes it). */}
          {quote.files[0] && (
            <div className="mt-3 inline-flex items-center gap-2 border border-black/12 bg-white px-3 py-1.5 text-xs max-w-full">
              <Paperclip className="w-3.5 h-3.5 text-[#5A7A6A] flex-shrink-0" aria-hidden="true" />
              <span className="text-[#131311] font-medium truncate max-w-[16rem]">{quote.files[0].name}</span>
              <span className="text-[#8a8782] flex-shrink-0">· Attached for review</span>
            </div>
          )}
          {quote.items.length === 0 && (
            <p className="text-[#5c5a56] text-sm mt-1.5 max-w-lg">Add products or upload a schedule — we issue a reviewed quote before any deposit. Supply only.</p>
          )}
        </div>

        {/* Items + composer */}
        <div>
          {/* Replace / Add prompt — the schedule parsed but the project already has content. */}
          {choice && (
            <div role="alertdialog" aria-label="Import options"
              className="mb-4 border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">This project already has {choice.existingItems} item{choice.existingItems !== 1 ? "s" : ""}{choice.existingFile ? ` and "${choice.existingFile}"` : ""}.</p>
                  <p className="mt-0.5 text-amber-800">Replace them with the new schedule, or add the new items to what you already have?</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Btn variant="sage" size="sm" onClick={() => resolveChoice("append")}>Add to project</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => resolveChoice("replace")}>Replace everything</Btn>
                    <button onClick={() => setChoice(null)} className="ml-1 text-xs font-medium text-amber-800 hover:text-amber-900 underline cursor-pointer">Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {uploadNotice && (
            <div role={uploadNotice.type === "error" ? "alert" : "status"} aria-live="polite"
              className={`mb-4 flex items-start gap-2.5 border px-4 py-3 text-sm ${uploadNotice.type === "success" ? "border-[#5A7A6A]/30 bg-[#5A7A6A]/8 text-[#355344]" : "border-red-300 bg-red-50 text-red-800"}`}>
              {uploadNotice.type === "success"
                ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />}
              <span className="flex-1">{uploadNotice.message}</span>
              <button onClick={() => setUploadNotice(null)} className="p-1 -m-1 text-current opacity-60 hover:opacity-100 cursor-pointer" aria-label="Dismiss upload result">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Item cards — compact header + collapsible groups, one item open at a time */}
          <div className="space-y-2.5">
            {quote.items.map((it) => (
              <ItemSummaryCard key={it.id} item={it} quote={quote}
                id={`qitem-${it.id}`}
                expanded={expandedId === it.id}
                onToggleExpanded={() => setExpandedId(cur => cur === it.id ? null : it.id)}
                duplicate={hasDuplicateCode(quote.items, it.id, it.code)}
                focusSignal={focusReq?.id === it.id ? focusReq.nonce : undefined}
                codeFocusSignal={codeFocusReq?.id === it.id ? codeFocusReq.nonce : undefined}
                onDuplicate={() => { const nid = quote.copy(it.id); if (nid) { setExpandedId(nid); setCodeFocusReq({ id: nid, nonce: Date.now() }); } }}
                onRemove={() => quote.remove(it.id)} />
            ))}
          </div>

          {/* The empty project starts with an explicit choice of input method. */}
          {adding ? (
            <div className="mt-3" id="new-item-composer">
              <ItemForm key={`new-${newKey}`} quote={quote}
                onCommit={(b) => { quote.add(b); setNewKey(k => k + 1); setAdding(false); }}
                onCancel={() => setAdding(false)} />
            </div>
          ) : quote.items.length === 0 ? (
            <div id="quote-start-actions" className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Start your quote">
              <button onClick={openUpload} disabled={uploading}
                className="group min-h-32 border border-black/12 bg-white p-5 text-left hover:border-[#5A7A6A] hover:bg-[#F7F8F6] disabled:opacity-60 disabled:cursor-wait transition-colors cursor-pointer">
                <span className="w-9 h-9 mb-4 flex items-center justify-center bg-[#5A7A6A]/10 text-[#5A7A6A] group-hover:bg-[#5A7A6A] group-hover:text-white transition-colors">
                  {uploading
                    ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                    : <UploadCloud className="w-5 h-5" aria-hidden="true" />}
                </span>
                <span className="block text-base font-semibold text-[#131311] mb-1">{uploading ? "Reading schedule…" : "Upload a file"}</span>
                <span className="block text-sm leading-relaxed text-[#5c5a56]">Import products from plans or a window and door schedule.</span>
              </button>
              <button onClick={() => setAdding(true)}
                className="group min-h-32 border border-black/12 bg-white p-5 text-left hover:border-[#5A7A6A] hover:bg-[#F7F8F6] transition-colors cursor-pointer">
                <span className="w-9 h-9 mb-4 flex items-center justify-center bg-[#5A7A6A]/10 text-[#5A7A6A] group-hover:bg-[#5A7A6A] group-hover:text-white transition-colors">
                  <Plus className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="block text-base font-semibold text-[#131311] mb-1">Add a product manually</span>
                <span className="block text-sm leading-relaxed text-[#5c5a56]">Choose a product, then enter its dimensions and options.</span>
              </button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="mt-3 w-full flex items-center justify-center gap-1.5 border border-dashed border-black/20 hover:border-[#5A7A6A] py-3 text-sm text-[#5A7A6A] font-medium cursor-pointer transition-colors">
              <Plus className="w-4 h-4" />Add another item
            </button>
          )}

        </div>
      </div>

      {/* Persistent orientation and action throughout the build flow. */}
      <StickyQuotePanel
        itemCount={quote.items.length}
        attentionCount={attentionCount}
        total={total}
        editingItem={adding}
        onReviewQuote={() => { setView("review"); window.scrollTo(0, 0); }}
        onReviewIssues={reviewIssues}
        onFinishItem={finishItem}
        onClearAll={hasContent ? () => setClearConfirm(true) : undefined}
      />

      {/* Clear-all confirmation — destructive whole-project reset. */}
      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true" aria-label="Clear everything">
          <div className="w-full max-w-sm bg-white border border-black/10 p-5" style={{ boxShadow: "0 20px 50px rgba(19,19,17,0.28)" }}>
            <h3 className="text-base font-semibold text-[#131311] mb-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Clear everything?</h3>
            <p className="text-sm text-[#5c5a56] leading-relaxed mb-4">This removes all {quote.items.length} item{quote.items.length !== 1 ? "s" : ""} and the uploaded schedule and can't be undone.</p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="md" onClick={() => setClearConfirm(false)}>Cancel</Btn>
              <Btn variant="danger" size="md" onClick={handleClearAll}>Clear all</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
