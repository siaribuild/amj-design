// ═══════════════════════════════════════════════════════════════════════════════
// QUOTE BUILDER + MyProject (Route A)
// Product-selectable composer lives here too, so trade users can build a whole
// multi-item order from one page: upload a schedule (parsed into draft lines) and/or
// configure items directly. Added items collapse into compact editable cards.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from "react";
import {
  Upload, UploadCloud, X, Plus,
  AlertCircle, CheckCircle, ShieldCheck, UserCheck, LayoutGrid, Pencil, Paperclip, Trash2,
} from "lucide-react";
import { type Page, SLabel, Btn } from "../app/ui";
import { ItemForm, ItemSummaryCard, itemNeedsAttention } from "../components/ItemComposer";
import { StickyQuotePanel } from "../components/StickyQuotePanel";
import { DocumentProgress } from "../components/DocumentProgress";
import { QuoteReviewSubmit, QuoteSubmitted } from "../components/QuoteReviewSubmit";
import { restoreAiLine, type SubmitContact, type SubmitResult } from "../data/api";
// The upload / parse / AI-refinement engine and its checklist now live in shared
// modules so the /quote-project A/B arm drives the SAME engine rather than a
// second copy. Behaviour here is unchanged by that move.
import { useProjectDocuments } from "../data/useProjectDocuments";
import { quoteSummary } from "../data/quoteSummary";
import { type QuoteState, hasDuplicateCode } from "../data/configurator";
import { useGstMode } from "../data/gst";
// Inline-editable project name. Moved to a shared component so /quote-project
// renames the same way rather than not at all.
import { ProjectNameField } from "../components/ProjectNameField";

type QuoteUser = { name: string; email: string; phone: string; type: string } | null;

export function QuotePage({ setPage, user, quote, onSubmit, onHeroChange }: {
  setPage: (p: Page) => void; user: QuoteUser; quote: QuoteState;
  onSubmit?: (contact: SubmitContact) => Promise<SubmitResult>;
  /** Only the BUILD view has a dark hero for the header to overlay. Review and
   *  Submitted do not, and without telling the shell that, the header stayed
   *  transparent over them — an invisible menu on a light ground. */
  onHeroChange?: (hasHero: boolean) => void;
}) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [view, setView] = useState<"build" | "review">("build");
  const [newKey, setNewKey] = useState(0);
  const [adding, setAdding] = useState(false);
  // Replace/Add prompt when parsing into a project that already has content.
  const [clearConfirm, setClearConfirm] = useState(false);

  // The shared upload / parse / AI-refinement engine and every piece of state it
  // produces. `onImported` drops a stray in-progress add form — it is stale once
  // imported lines land.
  const {
    uploading, uploadNotice, setUploadNotice, aiPhase, stageLog, nowTick,
    processing, processingDocs, retryingAi, basisMap, collisionTags,
    removeOffer, removingFile, setRemovingFile, lineChanges,
    fileInputRef, openUpload, handleFiles, handleRemoveFile, handleCollision,
    handleAiRetry, diagnosticMessage, resetDocuments,
  } = useProjectDocuments(quote, user, { onImported: () => setAdding(false) });

  const [submitted, setSubmitted] = useState(false);
  // The address the confirmation went to, reported by the shared review step.
  const [submittedEmail, setSubmittedEmail] = useState("");
  // Keep the shell's header in step with which view is showing.
  useEffect(() => { onHeroChange?.(view === "build" && !submitted); }, [view, submitted, onHeroChange]);
  const gstMode = useGstMode();
  // Shared derivation (data/quoteSummary.ts), so this page and the
  // /quote-project A/B arm can never disagree about the total or about whether
  // the quote is submittable.
  //
  // Only CUSTOMER-fixable gaps block submission: an unpriceable line (no product /
  // missing size / missing option) or a duplicate code. Lines carrying only
  // TECHNICAL flags (timber→aluminium, composite sizing, obscure glazing) are
  // priced and stay submittable — submission is how they reach a technician.
  // WARNING-severity lines are counted separately from errors so the sticky
  // panel can show both without the gate ever depending on warnings.
  const {
    total, attentionCount, pendingPriceCount, technicalCount, hasContent, itemBlocked,
  } = quoteSummary(quote);
  // Lines render in the order they were added, manual and document-derived
  // alike — a manual line at #1 stays at #1 when five parsed lines append to
  // #2–6, and a later manual line at #7 stays at #7. No re-sorting, no
  // grouping: the list only ever grows downwards, so nothing moves under the
  // customer and position is a stable thing to refer to.

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

  // Submission itself lives in the shared review step (components/QuoteReviewSubmit),
  // so this page and the /quote-project arm cannot drift apart on contact gating,
  // error copy or the technical-review promise.


  // Whole-project reset — clears every line and the attached schedule (server + local).
  const handleClearAll = async () => {
    setClearConfirm(false);
    setUploadNotice(null);
    try {
      await quote.clearAll();
      resetDocuments();   // stops polling and drops every document-derived state
      setExpandedId(null);
    } catch {
      setUploadNotice({ type: "error", message: "We couldn't clear this project. Nothing was removed; please try again." });
    }
  };

  // Destructive-dialog focus: trap initial focus on Cancel (safer default), and
  // return focus to the trigger when the dialog is dismissed without acting.
  const clearBtnRef = useRef<HTMLButtonElement>(null);
  const clearDialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!clearConfirm) return;
    const t = setTimeout(() => clearDialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0);
    return () => clearTimeout(t);
  }, [clearConfirm]);
  const cancelClear = () => { setClearConfirm(false); clearBtnRef.current?.focus(); };

  // ─── Submitted / Review + submit ────────────────────────────────────────────
  // Both are the SHARED final step, so /quote and /quote-project submit through
  // one lifecycle rather than two.
  if (submitted) {
    return <QuoteSubmitted email={submittedEmail} user={user} onGo={go} />;
  }

  if (view === "review") {
    return (
      <QuoteReviewSubmit
        quote={quote} user={user}
        aiReading={aiPhase?.kind === "reading"}
        onBack={() => setView("build")}
        onSubmit={onSubmit}
        onSubmitted={(email) => { setSubmittedEmail(email); setSubmitted(true); }}
        onFixBlocked={() => { setView("build"); reviewIssues(); }}
      />
    );
  }

  // ─── Build ────────────────────────────────────────────────────────────────────
  return (
    <div className="quote-page min-h-[100svh] ground-bone flex flex-col">
      {/* ─── Dark functional hero — header overlays it; upload panel is a live
             part of the hero, styled like the panels on the home hero ───────── */}
      <section className="relative bg-night overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1774516534130-d67eb3c98798?w=1920&h=1080&fit=crop&auto=format"
          alt="Contemporary home interior with full-height aluminium-framed glazing onto a landscaped garden at dusk"
          className="hero-img hero-zoom" />
        {/* Contrast overlay — stronger on the left behind the copy */}
        <div className="hero-scrim" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-t from-night/50 via-transparent to-transparent" />

        <div className="relative w-full max-w-6xl mx-auto px-6 pt-20 pb-6 md:pt-24 md:pb-9">
          {/* The picker has no visible control here: it is opened from the items
              area (where the results land) and from the ?upload=1 deep link. */}
          <input ref={fileInputRef} type="file" multiple className="hidden"
            accept=".pdf,.csv,.jpg,.jpeg,.png,.webp,.heic,.heif,text/csv,image/*"
            onChange={e => handleFiles(e.target.files)} />
          <div>
            {/* Copy */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2.5 md:mb-4">
                <LayoutGrid className="w-3.5 h-3.5 text-white/55" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60 font-data">Your quote</span>
              </div>
              <h1 className="text-white mb-2 md:mb-3 t-ds1">
                Build your quote
              </h1>
              {/* Was 201 characters at 13px — the most text in the smallest type
                  anywhere on the site, ~5 lines at 375px. Now 98 at 15px.
                  Schedule still leads: a tradie arrives from a hero promising
                  "your schedule, priced in about a minute", and an earlier version
                  led with "Add products manually", demoting the thing they were
                  just sold. The review-before-deposit reassurance moves off the
                  hero — it is stated at the point it matters, on submit, and a
                  hero is not where a deposit is on anyone's mind. */}
              <p className="text-white/80 leading-relaxed max-w-[46ch] t-bd">
                Upload a PDF, CSV or clear photo and every line comes back priced in about a minute —
                or add products manually.
              </p>
              {/* Trust row — decorative, hidden on mobile to keep the hero shallow */}
              <div className="hidden sm:flex flex-wrap items-center gap-x-6 gap-y-2 mt-5 text-[13px] text-white/65">
                <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-white/50" />Supply only</span>
                <span className="flex items-center gap-1.5"><UserCheck className="w-4 h-4 text-white/50" />Reviewed by our team</span>
                <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-white/50" />No account needed</span>
              </div>
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
              <span className="text-xs text-body border border-black/10 px-2 py-0.5 flex-shrink-0">{quote.items.length} item{quote.items.length !== 1 ? "s" : ""}</span>
            )}
            {/* Whole-project reset. Lives here — beside the scope it wipes (items +
                schedule) — rather than on the sticky action bar, so it is findable
                without competing with the primary CTA or inviting an accidental tap. */}
            {hasContent && (
              <button ref={clearBtnRef} type="button" onClick={() => setClearConfirm(true)}
                aria-label="Clear all items and uploaded documents"
                className="ml-auto inline-flex items-center gap-1.5 card px-2.5 py-1 text-xs font-medium text-body-soft hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage">
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />Clear all
              </button>
            )}
          </div>
          {/* File rail (UX spec: multifile-ux-spec.md) — one chip per uploaded
              document, showing what the system DETECTED each file as. Files are
              integral to the order (only Clear all removes them, for now). */}
          {(quote.files.length > 0 || quote.items.length > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {quote.files.map((f) => {
                // Type chip renders ONLY once a real classification exists. null is
                // permanent for anonymous/deterministic uploads and transient for
                // registered ones pre-AI-run — never show an unresolvable "SORTING…"
                // promise (UX review 2026-07-26). Known types only:
                const type = (f.docType ?? null) as string | null;
                const known: Record<string, { label: string; tint: string }> = {
                  schedule: { label: "SCHEDULE", tint: "border-sage/30 bg-sage-wash text-sage-ink" },
                  energy_report: { label: "ENERGY REPORT", tint: "border-info/30 bg-info/10 text-info" }, // TONE.work
                  plans: { label: "PLANS", tint: "border-black/15 bg-black/[0.03] text-body-soft" },
                  supporting: { label: "SUPPORTING", tint: "border-dashed border-black/15 bg-black/[0.03] text-body-soft" },
                };
                const chip = type ? known[type] : undefined;
                const confirming = removingFile === String(f.id);
                if (confirming) {
                  // Destructive confirm replaces the whole chip — real buttons, red
                  // framing, "Keep" is the safe default (UX review 2026-07-26).
                  return (
                    <div key={f.id} className="inline-flex items-center gap-2.5 border border-red-300 bg-red-50 px-3 py-1.5 text-xs max-w-full">
                      <span className="text-red-800 font-medium truncate max-w-[12rem]">Remove {f.name}? Its lines go too.</span>
                      {/* Quiet text-scale controls — the red container carries the
                          alarm; the buttons shouldn't shout (UX review 2026-07-26). */}
                      <button onClick={() => void handleRemoveFile(String(f.id), f.name)}
                        className="quote-button--danger text-xs font-medium border px-1.5 py-0.5 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-destructive">Remove</button>
                      <button onClick={() => setRemovingFile(null)} autoFocus
                        className="text-xs text-body card px-1.5 py-0.5 hover:border-black/25 cursor-pointer">Keep</button>
                    </div>
                  );
                }
                return (
                  <div key={f.id} className="inline-flex items-center gap-2 card px-3 py-1.5 text-xs max-w-full">
                    <Paperclip className="w-3.5 h-3.5 text-sage flex-shrink-0" aria-hidden="true" />
                    <span className="text-ink font-medium truncate max-w-[14rem]">{f.name}</span>
                    {chip && (
                      <span className={`text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 border leading-none flex-shrink-0 ${chip.tint} font-data`}>{chip.label}</span>
                    )}
                    <span className="text-quiet flex-shrink-0">
                      {type === "supporting" ? "· Not used for pricing" : "· Attached for review"}
                    </span>
                    {/* Per-file Remove (spec §1c). Trash2 (not X) — X reads as
                        "dismiss", Trash2 as "delete"; matches Clear-all's icon. */}
                    <button onClick={() => setRemovingFile(String(f.id))} aria-label={`Remove ${f.name}`}
                      className="flex-shrink-0 -mr-1 w-5 h-5 inline-flex items-center justify-center text-quiet hover:text-red-600 transition-colors cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
              {/* The upload affordance for a project that already has content —
                  the empty-state card is gone by then, and the file rail is where
                  documents live. Stays ENABLED while reading: adding a second
                  document is the designed multi-file path (the server coalesces
                  uploads behind a ~10s debounce), unlike manual entry, which is
                  parked. Re-adding the same file is caught in handleFiles. */}
              <button type="button" onClick={openUpload}
                className="inline-flex items-center gap-1.5 border border-dashed border-black/25 action-hover px-3 py-1.5 text-xs font-medium text-sage cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage">
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                {quote.files.length > 0 ? "Add another document" : "Upload plans or a schedule"}
              </button>
            </div>
          )}
          {quote.items.length === 0 && (
            <p className="text-body text-sm mt-1.5 max-w-lg">Add products or upload a schedule — we issue a reviewed quote before any deposit. Supply only.</p>
          )}
        </div>

        {/* Items + composer */}
        <div>
          {/* Manual-vs-schedule tag collision (spec §1b): asked ONCE per tag —
              the customer's line stands either way; Link converts it to a
              schedule line that future re-parses may refresh (edits protected). */}
          {collisionTags.map((tag) => (
            <div key={tag} role="status" className="mb-4 border border-info/30 bg-info/10 px-4 py-3 text-sm text-info-ink">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Your schedule also lists {tag} — you already added an item with that code.</p>
                  <p className="mt-0.5">Your item stays as you built it. Link it to the schedule line, or keep them separate?</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Btn variant="sage" size="sm" onClick={() => void handleCollision(tag, "linked")}>Link to schedule {tag}</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => void handleCollision(tag, "separate")}>Keep separate</Btn>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {uploadNotice && (
            <div role={uploadNotice.type === "error" ? "alert" : "status"} aria-live="polite"
              className={`mb-4 flex items-start gap-2.5 border px-4 py-3 text-sm ${uploadNotice.type === "success" ? "border-sage/30 bg-sage-wash text-sage-ink" : "border-red-300 bg-red-50 text-red-800"}`}>
              {uploadNotice.type === "success"
                ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />}
              <span className="flex-1">
                {uploadNotice.message}
                {uploadNotice.type === "success" && aiPhase?.kind === "deferred" && (
                  <span className="ml-1.5 text-amber-800">{diagnosticMessage(aiPhase.diagnostic)}</span>
                )}
                {uploadNotice.type === "success" && aiPhase?.kind === "done" && (
                  <span className="ml-1.5">· estimate refined for {aiPhase.refined} item{aiPhase.refined !== 1 ? "s" : ""}</span>
                )}
                {uploadNotice.type === "success" && aiPhase?.kind === "failed" && (
                  <span className="ml-1.5 text-amber-800">
                    · {diagnosticMessage(aiPhase.diagnostic)}{" "}
                    <button onClick={() => void handleAiRetry()} disabled={retryingAi}
                      className="underline font-medium disabled:opacity-50 cursor-pointer">
                      {retryingAi ? "Retrying…" : "Try AI again"}
                    </button>
                  </span>
                )}
                {uploadNotice.type === "success" && removeOffer && (
                  <span className="ml-1.5 whitespace-nowrap">
                    · not for this project?{" "}
                    <button onClick={() => void handleRemoveFile(removeOffer.fileId, removeOffer.name)}
                      className="underline font-medium hover:text-ink cursor-pointer">Remove file</button>
                  </span>
                )}
              </span>
              <button onClick={() => setUploadNotice(null)} className="p-1 -m-1 text-current opacity-60 hover:opacity-100 cursor-pointer" aria-label="Dismiss upload result">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Item cards — compact header + collapsible groups, one item open at
              a time, in the order they were added. */}
          {!uploadNotice && (aiPhase?.kind === "deferred" || aiPhase?.kind === "failed") && (
            <div
              role={aiPhase.kind === "failed" ? "alert" : "status"}
              aria-live="polite"
              className="quote-notice--warning mb-4 flex items-start gap-2.5 border border-warning/40 px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="flex-1">
                {diagnosticMessage(aiPhase.diagnostic)}{" "}
                {aiPhase.kind === "failed" && (
                  <button onClick={() => void handleAiRetry()} disabled={retryingAi}
                    className="underline font-medium disabled:opacity-50 cursor-pointer">
                    {retryingAi ? "Retrying…" : "Try AI again"}
                  </button>
                )}
              </span>
            </div>
          )}
          <div className="space-y-2.5">
            {quote.items.map((it) => (
              <ItemSummaryCard key={it.id} item={it} quote={quote}
                id={`qitem-${it.id}`}
                basis={it.serverId ? basisMap[it.serverId] ?? null : null}
                changes={it.code ? lineChanges[it.code] ?? null : null}
                expanded={expandedId === it.id}
                onToggleExpanded={() => setExpandedId(cur => cur === it.id ? null : it.id)}
                duplicate={hasDuplicateCode(quote.items, it.id, it.code)}
                focusSignal={focusReq?.id === it.id ? focusReq.nonce : undefined}
                codeFocusSignal={codeFocusReq?.id === it.id ? codeFocusReq.nonce : undefined}
                onDuplicate={() => { const nid = quote.copy(it.id); if (nid) { setExpandedId(nid); setCodeFocusReq({ id: nid, nonce: Date.now() }); } }}
                onRestoreAi={it.serverId ? async () => {
                  await restoreAiLine(it.serverId!);
                  await quote.reload();
                } : undefined}
                onRemove={() => quote.remove(it.id)} />
            ))}

            {/* The work is happening HERE, where the results will land. Without
                this the items area looks idle mid-run, which reads as "nothing
                happened" and invites a pointless second upload. */}
            {processing && (
              <DocumentProgress uploading={uploading} processingDocs={processingDocs}
                aiPhase={aiPhase} stageLog={stageLog} nowTick={nowTick} />
            )}
          </div>

          {/* The empty project starts with an explicit choice of input method.
              While documents are being read, manual entry is parked: adding a
              line into a list that is about to grow beneath it is a flow nobody
              actually wants, and the placeholder above already says why. */}
          {adding ? (
            <div className="mt-3" id="new-item-composer">
              <ItemForm key={`new-${newKey}`} quote={quote}
                onCommit={(b) => { quote.add(b); setNewKey(k => k + 1); setAdding(false); }}
                onCancel={() => setAdding(false)} />
            </div>
          ) : processing ? (
            quote.items.length > 0 && (
              <p className="mt-3 border border-dashed border-black/12 py-3 text-center text-sm text-quiet">
                Adding items is paused until we finish reading.
              </p>
            )
          ) : quote.items.length === 0 ? (
            <div id="quote-start-actions" className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Start your quote">
              <button onClick={openUpload} disabled={uploading}
                className="group min-h-32 action-tile action-hover p-5 text-left disabled:opacity-60 disabled:cursor-wait cursor-pointer">
                <span className="w-9 h-9 mb-4 flex items-center justify-center bg-sage-wash text-sage group-hover:bg-sage group-hover:text-white transition-colors">
                  {uploading
                    ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                    : <UploadCloud className="w-5 h-5" aria-hidden="true" />}
                </span>
                <span className="block text-base font-semibold text-ink mb-1">{uploading ? "Reading schedule…" : "Upload schedule or photo"}</span>
                <span className="block text-sm leading-relaxed text-body">PDFs, CSV files and clear photos come back matched and priced. Plans work too.</span>
              </button>
              <button onClick={() => setAdding(true)}
                className="group min-h-32 action-tile action-hover p-5 text-left cursor-pointer">
                <span className="w-9 h-9 mb-4 flex items-center justify-center bg-sage-wash text-sage group-hover:bg-sage group-hover:text-white transition-colors">
                  <Plus className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="block text-base font-semibold text-ink mb-1">Add a product manually</span>
                <span className="block text-sm leading-relaxed text-body">Choose a product, then enter its dimensions and options.</span>
              </button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="mt-3 w-full flex items-center justify-center gap-1.5 border border-dashed border-black/20 action-hover py-3 text-sm text-sage font-medium cursor-pointer">
              <Plus className="w-4 h-4" />Add another item
            </button>
          )}

        </div>
      </div>

      {/* Persistent orientation and action throughout the build flow. */}
      <StickyQuotePanel
        itemCount={quote.items.length}
        attentionCount={attentionCount}
        pendingPriceCount={pendingPriceCount}
        technicalCount={technicalCount}
        total={total}
        editingItem={adding}
        uploading={uploading}
        readingDocs={processing ? processingDocs : 0}
        onReviewQuote={() => { setView("review"); window.scrollTo(0, 0); }}
        onReviewIssues={reviewIssues}
        onFinishItem={finishItem}
      />

      {/* Clear-all confirmation — destructive whole-project reset. */}
      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true" aria-label="Clear everything"
          onClick={cancelClear} onKeyDown={e => { if (e.key === "Escape") cancelClear(); }}>
          <div ref={clearDialogRef} onClick={e => e.stopPropagation()}
            className="quote-dialog w-full max-w-sm p-5">
            <h3 className="text-base font-semibold text-ink mb-1.5 font-display">Clear everything?</h3>
            <p className="text-sm text-body leading-relaxed mb-4">This removes all {quote.items.length} item{quote.items.length !== 1 ? "s" : ""} and every uploaded document and can't be undone.</p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="md" onClick={cancelClear}>Cancel</Btn>
              <Btn variant="danger" size="md" onClick={handleClearAll}>Clear all</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
