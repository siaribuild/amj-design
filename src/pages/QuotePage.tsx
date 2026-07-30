// ═══════════════════════════════════════════════════════════════════════════════
// QUOTE BUILDER + MyProject (Route A)
// Product-selectable composer lives here too, so trade users can build a whole
// multi-item order from one page: upload a schedule (parsed into draft lines) and/or
// configure items directly. Added items collapse into compact editable cards.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from "react";
import {
  Upload, UploadCloud, X, Plus, ChevronLeft, ArrowRight,
  AlertCircle, Check, CheckCircle, Send, ShieldCheck, UserCheck, LayoutGrid, Pencil, Paperclip, Trash2, Loader2,
} from "lucide-react";
import { type Page, SAGE, WindowMark, GhostMark, SLabel, Btn, FieldLabel, Input } from "../app/ui";
import { ItemForm, ItemSummaryCard, itemNeedsAttention } from "../components/ItemComposer";
import { StickyQuotePanel } from "../components/StickyQuotePanel";
import { uploadFile, startParse, extractionStatus, retryExtraction, deleteFile, resolveCollision, restoreAiLine, UploadError, type ExtractionRun, type ParseJob, type ParseResult, type SubmitContact, type SubmitResult } from "../data/api";
import {
  type QuoteState, type QItem,
  linePriceTotal, fmt, mm, productLabel, hasDuplicateCode, lineBlocksSubmission, reviewSeverity, DEFAULT_PROJECT_TITLE,
} from "../data/configurator";
import { useGstMode, gstAdjust, gstSuffix } from "../data/gst";

type QuoteUser = { name: string; email: string; phone: string; type: string } | null;

const whenSafe = (value: string): string | null => {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
};

const AI_IMAGE_TARGET_BYTES = 5_500_000;
const AI_IMAGE_MAX_SIDE = 2800;

class PhotoPreparationError extends Error {}

async function preparePhotoForAi(file: File): Promise<File> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isPhoto = file.type.startsWith("image/") || ["heic", "heif"].includes(extension);
  const modelReady = ["image/jpeg", "image/png", "image/webp"].includes(file.type)
    || ["jpg", "jpeg", "png", "webp"].includes(extension);
  const needsConversion = !modelReady || file.size > AI_IMAGE_TARGET_BYTES;
  if (!isPhoto || !needsConversion) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new PhotoPreparationError(
      "We couldn't read that phone-photo format. Take a new photo here, or choose a JPG, PNG or WebP image.",
    );
  }
  try {
    const scale = Math.min(1, AI_IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new PhotoPreparationError("We couldn't prepare that photo. Please try a JPG or PNG.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
    if (blob && blob.size > AI_IMAGE_TARGET_BYTES) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.68));
    }
    if (!blob) throw new PhotoPreparationError("We couldn't prepare that photo. Please try a JPG or PNG.");
    if (blob.size > AI_IMAGE_TARGET_BYTES) {
      throw new PhotoPreparationError("That photo is still too large to read. Move closer to the schedule and take another photo.");
    }
    const base = file.name.replace(/\.[^.]+$/, "") || "schedule-photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

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
        className="text-2xl md:text-3xl font-semibold text-ink leading-tight bg-white border border-sage px-2 py-0.5 max-w-full focus:outline-none focus:ring-2 focus:ring-sage/40"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }} />
    );
  }
  return (
    <button onClick={begin} aria-label={`Rename project${value ? ` (${value})` : ""}`}
      className="group/name inline-flex items-center gap-2 text-2xl md:text-3xl font-semibold text-ink leading-tight border border-black/12 action-hover bg-white px-2 py-0.5 max-w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <span className="truncate">{value}</span>
      <Pencil className="w-4 h-4 text-quieter group-hover/name:text-sage flex-shrink-0" aria-hidden="true" />
    </button>
  );
}

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
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<null | { type: "success" | "error"; message: string }>(null);
  // Replace/Add prompt when parsing into a project that already has content.
  const [clearConfirm, setClearConfirm] = useState(false);

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  // Keep the shell's header in step with which view is showing.
  useEffect(() => { onHeroChange?.(view === "build" && !submitted); }, [view, submitted, onHeroChange]);
  const [contactName, setContactName] = useState(user?.name || "");
  const [contactEmail, setContactEmail] = useState(user?.email || "");
  const [contactPhone, setContactPhone] = useState(user?.phone || "");
  const [suburb, setSuburb] = useState("");
  type SafeDiagnostic = NonNullable<ExtractionRun["diagnostic"]>;
  type AiProgressStage = NonNullable<ExtractionRun["progressStage"]>;
  const [aiPhase, setAiPhase] = useState<
    null
    | { kind: "reading"; docs: number; stage?: AiProgressStage }
    | { kind: "deferred"; docs: number; diagnostic: SafeDiagnostic }
    | { kind: "done"; refined: number }
    | { kind: "failed"; diagnostic?: SafeDiagnostic | null }
  >(null);
  // How many documents the current upload put in flight — kept because the
  // anonymous path has no aiPhase to read a count from.
  const [uploadingDocs, setUploadingDocs] = useState(0);
  const [retryingAi, setRetryingAi] = useState(false);

  // Per-step timing. The customer's real anxiety is a FROZEN screen, not elapsed
  // time — a minute that is visibly advancing is fine; 45s of nothing is not. So
  // we record when each stage was first seen and show how long each step took,
  // with a live timer on the step in flight. `stageLog` is append-only per run.
  const [stageLog, setStageLog] = useState<{ stage: AiProgressStage; at: number }[]>([]);
  const [nowTick, setNowTick] = useState(() => 0);
  const recordStage = (stage: AiProgressStage | undefined) => {
    if (!stage || stage === "waiting_capacity") return;   // a pause is not a step
    setStageLog((prev) => (prev.some((s) => s.stage === stage) ? prev : [...prev, { stage, at: Date.now() }]));
  };
  // A one-second heartbeat so the in-progress step's timer ticks. Runs only while
  // a run is in flight, and is torn down the moment it is not — no idle interval.
  useEffect(() => {
    if (aiPhase?.kind !== "reading") return;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [aiPhase?.kind]);
  const fmtDur = (ms: number): string => {
    const s = Math.max(0, Math.round(ms / 1000));
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  };

  // One flag for "the project is busy with documents", covering BOTH paths: the
  // anonymous deterministic parse (bounded by `uploading`) and the registered AI
  // run (which keeps going after the HTTP upload resolves — the gap that made
  // the page look idle and invited a duplicate upload).
  const processing = uploading || aiPhase?.kind === "reading";
  const processingDocs = aiPhase?.kind === "reading" ? aiPhase.docs : uploadingDocs;
  const progressMessage = (stage: AiProgressStage | undefined): string => {
    switch (stage) {
      case "queued": return "Securing your files and preparing AI review…";
      case "reading_documents": return "Reading document text, tables and images…";
      case "extracting_schedule": return "Reading schedules, plans and energy requirements…";
      case "building_envelope": return "Building the thermal context and checking requirements…";
      case "matching_and_pricing": return "Matching suitable products, glazing and prices…";
      case "preparing_quote": return "Preparing the recommendations for your review…";
      case "waiting_capacity": return "Waiting for AI service capacity…";
      default: return "Reading and refining your schedule…";
    }
  };

  // The pipeline's real milestones, in the order the server reports them. A
  // single line that overwrote itself threw away everything already achieved:
  // the customer saw one moving target and no evidence of progress. As a list,
  // finished steps stay finished and the run reads as advancing rather than
  // merely churning.
  //
  // Shorter labels than progressMessage: a checklist is scanned, not read, and
  // the sentence-length copy belongs to the single-line fallback.
  const AI_STEPS: { stage: AiProgressStage; label: string }[] = [
    { stage: "queued", label: "Securing your files" },
    { stage: "reading_documents", label: "Reading the documents" },
    { stage: "extracting_schedule", label: "Extracting the schedule" },
    { stage: "building_envelope", label: "Checking thermal requirements" },
    { stage: "matching_and_pricing", label: "Matching products and prices" },
    { stage: "preparing_quote", label: "Preparing your recommendations" },
  ];
  // `waiting_capacity` is deliberately NOT a step: it is not a stage of the work
  // but a pause in it, and giving it a row would imply the run had moved on.
  const stepIndex = (stage: AiProgressStage | undefined): number =>
    AI_STEPS.findIndex((s) => s.stage === stage);

  const diagnosticMessage = (diagnostic: SafeDiagnostic | null | undefined): string => {
    const retryTime = diagnostic?.retryAt ? whenSafe(diagnostic.retryAt) : null;
    switch (diagnostic?.code) {
      case "RATE_LIMITED":
        return `The AI service capacity limit was reached${retryTime ? `; try again after ${retryTime}` : ""}. Your documents are saved, and you can still submit for human review.`;
      case "CATALOGUE_UNAVAILABLE":
        return "AI refinement is waiting for verified product pricing. Your documents are saved, and you can still submit for human review.";
      case "DOCUMENTS_NOT_UNDERSTOOD":
        return "We couldn't confidently create priced items from these documents. If this is a scanned PDF, upload a clear JPG or PNG photo or screenshot of the schedule page.";
      case "SERVICE_CONFIGURATION_ERROR":
        return "AI refinement is temporarily unavailable. Your documents are saved and our team can review them.";
      case "RETRY_REQUIRED":
        return "AI refinement stopped before finishing. Your documents are saved; you can try AI again or send them for human review.";
      case "TEMPORARY_FAILURE":
        return `AI refinement was interrupted${retryTime ? ` and can retry after ${retryTime}` : ""}. Your documents are saved, and you can still submit for human review.`;
      default:
        return quote.items.length
          ? "We couldn't refine this estimate; we will confirm it during human review."
          : "We couldn't create priced items from these documents; add items manually or contact us.";
    }
  };

  const total = quote.items.reduce((s, it) => s + linePriceTotal(it), 0);
  const gstMode = useGstMode();
  // Only CUSTOMER-fixable gaps block submission: an unpriceable line (no product /
  // missing size / missing option) or a duplicate code. Lines carrying only
  // TECHNICAL flags (timber→aluminium, composite sizing, obscure glazing) are
  // priced and stay submittable — submission is how they reach a technician.
  const itemBlocked = (it: QItem) => lineBlocksSubmission(it) || hasDuplicateCode(quote.items, it.id, it.code);
  const attentionCount = quote.items.filter(itemBlocked).length;
  const pendingPriceCount = quote.items.filter((it) =>
    (it.origin === "ai" || it.aiPriced) &&
    (typeof it.lineTotal !== "number" || !Number.isFinite(it.lineTotal)) &&
    !!it.review?.customerConfigurationChanged).length;
  // WARNING-severity lines: priced (indicative) and submittable, but carrying an
  // technical decision — a composite for an oversized opening, a substituted
  // product, a material/glazing caveat. Counted separately from errors so the
  // sticky panel can show both without the gate ever depending on warnings.
  const technicalCount = quote.items.filter((it) => !itemBlocked(it) && reviewSeverity(it.review) === "warning").length;
  const hasContent = quote.items.length > 0 || quote.files.length > 0;
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

  // Submit only when the server confirms it. The success screen is shown ONLY on
  // a confirmed submission — never optimistically — so a failed or lost request
  // surfaces an error instead of a false confirmation.
  const handleSubmit = async () => {
    if (submitting) return;
    if (aiPhase?.kind === "reading") {
      setSubmitError("Please wait while we finish refining this estimate from your documents.");
      return;
    }
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

  // Friendly copy for an upload the server refused outright (before parsing).
  const uploadErrorMessage = (e: unknown): string => {
    const reason = e instanceof UploadError ? e.reason : "";
    switch (reason) {
      case "file_rejected":
        return "That file was blocked by our security check — it isn't a plain PDF, image, or text document, or the PDF contains embedded scripts. Please re-export it as a standard PDF and try again.";
      case "scan_unavailable":
        return "Our security check is temporarily unavailable, so we couldn't accept that file. Please try again shortly, or add items manually.";
      case "too_large":
        return "That file is too large. Please upload a schedule under 12 MB.";
      case "quota_exceeded":
        return "This project has reached its file limit. Remove a file, or add items manually.";
      case "rate_limited":
        return "Too many uploads in a short time — please wait a moment and try again.";
      default:
        return "We couldn't process that file. Please try again, or add items manually.";
    }
  };

  // Friendly copy for every non-choice parse failure.
  const parseErrorMessage = (r: Extract<ParseResult, { ok: false }>): string => {
    switch (r.reason) {
      case "no_schedule_found":
        return "We couldn't find a window or door schedule in that file. If it's a scan, upload a clear photo or screenshot of the schedule page.";
      case "no_text_layer":
        return "This looks like a scanned PDF. Upload a clear JPG or PNG photo or screenshot of the schedule page instead.";
      case "quota":
        return `You've reached your monthly upload limit (${r.quota.limit}). It resets on ${r.quota.resetsOn}. You can still add items manually.`;
      case "rate_limited":
        return "Too many uploads in a short time — please wait a moment and try again.";
      case "busy":
        return "We're still reading an earlier document for this project. It will be ready shortly — then add this one.";
      case "too_large":
        return "That file is too large. Please upload a schedule under 12 MB.";
      case "not_a_pdf":
        return "That doesn't look like a PDF. Please upload a PDF schedule, or add items manually.";
      case "encrypted_pdf":
        return "That PDF is password-protected — we can't read it. Please upload an unprotected PDF.";
      case "too_many_pages":
        return "That PDF has too many pages to process. Please upload the schedule pages only.";
      case "too_many_items":
        return "That schedule has too many items to import at once. Please split it and upload in parts.";
      case "scan_pending":
      case "file_not_scanned":
        return "That file hasn't finished its security check yet. Please try uploading it again.";
      default: // file_missing | parse_failed | network
        return "We couldn't process that file. Please try again, or add items manually.";
    }
  };

  // Multi-file upload (UX spec: docs/estimator/multifile-ux-spec.md). SEQUENTIAL
  // for…of — the rate limit is per-source (parallel bursts risk spurious 429s)
  // and chips stay order-stable. One bad file never aborts the rest. kind is
  // "upload": the SERVER classifies (schedule / energy report / plans), shown on
  // the file rail. Parse outcomes that just mean "not a schedule" are quiet —
  // those files are contributions (energy/plans), not failures.
  const NOT_A_SCHEDULE = new Set(["no_schedule_found", "not_a_pdf", "no_text_layer"]);

  // Per-file change digest (UX spec §3): the banner must sum to every line the
  // parse touched — updates, adds, removals and edited-kept lines all counted.
  const digestOf = (job: ParseJob): string => {
    const parts: string[] = [];
    if (job.updated) parts.push(`${job.updated} updated`);
    if (job.added) parts.push(`${job.added} added`);
    if (job.removed) parts.push(`${job.removed} removed — no longer in your schedule`);
    if (job.keptForReview) parts.push(`${job.keptForReview} kept — needs your review`);
    // No counted changes: distinguish a first import (nothing pre-existed) from
    // an identical re-upload — "already up to date" must never read as churn.
    if (!parts.length) parts.push(job.itemCount ? "no changes — already up to date" : "nothing imported");
    // NB: no live "N need review" here — that count mutates as the customer
    // reviews, so it would go stale in a fixed event digest. The sticky panel
    // owns the LIVE attention count (UX review 2026-07-26).
    return parts.join(" · ");
  };

  // AI-run tail (UX spec §2, one banner updating in place): polls only while a
  // run is in flight; 2s×7 then 5s, hard stop at 60s. Anonymous users never
  // have a run, so the first poll returns null and no future-tense copy ever
  // renders for them.
  // Per-line requirement basis for the trust chips (UX spec §5); refreshed on
  // mount and whenever the poll returns it.
  const [basisMap, setBasisMap] = useState<Record<string, string>>({});
  useEffect(() => { extractionStatus().then((r) => setBasisMap(r.basis ?? {})).catch(() => {}); }, []);
  // Wrong-project early exit (UX ratification): offered only when a file CHANGED
  // more lines than it added — the signature of a document landing in the wrong
  // project. One offer, for the qualifying file.
  const [removeOffer, setRemoveOffer] = useState<null | { fileId: string; name: string }>(null);
  // Manual-vs-schedule tag collisions awaiting the customer's one-time decision.
  const [collisionTags, setCollisionTags] = useState<string[]>([]);
  // Per-file Remove on the rail: id pending inline confirmation.
  const [removingFile, setRemovingFile] = useState<string | null>(null);
  const pollExtractionRef = useRef<(docs: number) => void>(() => {});
  // Per-line changes from this session's parses (spec §3 provenance): drives the
  // Updated pill + old→new rows. Session-scoped by design — decays on reload;
  // the line's values are the durable record.
  const [lineChanges, setLineChanges] = useState<Record<string, { field: string; from: string; to: string }[]>>({});

  const handleRemoveFile = async (fileId: string, name: string) => {
    setRemovingFile(null);
    setRemoveOffer(null);
    try {
      const res = await deleteFile(fileId);
      await quote.reload();
      // Re-read only what is LEFT. `Math.max(1, …)` claimed one document was
      // being read after the last one was removed — a spinner over nothing,
      // and the server no longer queues a run in that case either.
      const docs = quote.files.length - 1;
      if (user && docs > 0) {
        setAiPhase({ kind: "reading", docs, stage: "queued" });
        pollExtractionRef.current(docs);
      } else {
        setAiPhase(null);
      }
      const parts = [`${name} removed`];
      if (res.removedLines) parts.push(`${res.removedLines} line${res.removedLines !== 1 ? "s" : ""} removed with it`);
      if (res.keptForReview) parts.push(`${res.keptForReview} kept — needs your review`);
      setUploadNotice({ type: "success", message: parts.join(" · ") });
    } catch {
      setUploadNotice({ type: "error", message: `We couldn't remove ${name}. Please try again.` });
    }
  };

  const handleCollision = async (tag: string, choice: "linked" | "separate") => {
    const line = quote.items.find((it) => it.code === tag);
    const serverId = (line as unknown as { serverId?: string })?.serverId;
    if (!serverId) { setCollisionTags((t) => t.filter((x) => x !== tag)); return; }
    try {
      await resolveCollision(serverId, choice);
      setCollisionTags((t) => t.filter((x) => x !== tag));
      if (choice === "linked") await quote.reload();
    } catch { /* leave the card up — resolving again is safe */ }
  };
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopPolling = () => { if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; } };
  useEffect(() => () => stopPolling(), []);
  const pollExtraction = (docs: number) => {
    stopPolling();
    const t0 = Date.now();
    setStageLog([]);            // fresh timeline for this run
    let sawRun = false;
    let lastDiagnostic: SafeDiagnostic | null = null;
    let lastStage: AiProgressStage | undefined;
    let lastStageChangeAt = Date.now();
    const tick = async (n: number) => {
      let inFlight = false;
      // Duration is NOT failure. The client backstop is generous (past the
      // server's 120s job ceiling); the server is the authority on actual
      // failure. We only give up on our own if the whole run window elapses with
      // no terminal status at all — a stall is surfaced as concern, not death.
      const windowElapsed = Date.now() - t0 >= 150_000;
      try {
        const { run, basis } = await extractionStatus();
        if (basis) setBasisMap(basis);
        if (run && (run.status === "queued" || run.status === "running")) {
          sawRun = true;
          inFlight = true;
          lastDiagnostic = run.diagnostic ?? null;
          if (run.progressStage !== lastStage) { lastStage = run.progressStage; lastStageChangeAt = Date.now(); }
          recordStage(run.progressStage);
          setAiPhase(run.diagnostic
            ? { kind: "deferred", docs, diagnostic: run.diagnostic }
            : { kind: "reading", docs, stage: run.progressStage });
        } else if (run?.status === "failed") {
          setAiPhase({ kind: "failed", diagnostic: run.diagnostic });
          return;
        } else if (run && sawRun) {
          // The run we watched finished — swap the tail for its outcome.
          if (run.status === "partial" && (run.summary?.cartApplied ?? 0) === 0) {
            setAiPhase({ kind: "failed", diagnostic: run.diagnostic });
          } else {
            // Results append to the bottom of the list, where the placeholder
            // has been standing — so the page grows rather than rearranges and
            // there is nothing for the customer to dismiss.
            await quote.reload();       // flushes pending saves first (App.tsx)
            setAiPhase({ kind: "done", refined: run.summary?.cartApplied ?? 0 });
          }
          return;
        } else if (!run || (!sawRun && run.completedAt)) {
          // No run yet — the server coalesces uploads behind a ~10s debounce, so
          // absence is inconclusive early. Only after 25s of nothing (anonymous,
          // or the kill-switch) do we stop; a stale completed run never counts.
          if (Date.now() - t0 > 25_000) { setAiPhase({ kind: "failed" }); return; }
        }
      } catch {
        // A final status read still gets one chance at the deadline; only then
        // does a network failure become the visible bounded failure state.
      }
      // Only the CLIENT backstop fails here; a healthy-but-slow run keeps its
      // checklist and its live timer. The server fails the job at 120s and we
      // read that as run.status==='failed' above — this is just the net for a
      // status endpoint that never returns a terminal state at all.
      if (windowElapsed) {
        setAiPhase({
          kind: "failed",
          diagnostic: lastDiagnostic ?? { code: "TEMPORARY_FAILURE", retryable: true, retryAt: null },
        });
        return;
      }
      const normalDelay = inFlight || n >= 7 ? 5000 : 2000;
      const remaining = Math.max(250, 150_000 - (Date.now() - t0));
      pollTimer.current = setTimeout(() => void tick(n + 1), Math.min(normalDelay, remaining));
    };
    void tick(0);
  };
  pollExtractionRef.current = pollExtraction;
  const handleAiRetry = async () => {
    if (retryingAi || !quote.files.length) return;
    setRetryingAi(true);
    setUploadNotice(null);
    try {
      await retryExtraction();
      setAiPhase({ kind: "reading", docs: quote.files.length, stage: "queued" });
      pollExtraction(quote.files.length);
    } catch {
      setAiPhase({
        kind: "failed",
        diagnostic: { code: "TEMPORARY_FAILURE", retryable: true, retryAt: null },
      });
    } finally {
      setRetryingAi(false);
    }
  };
  useEffect(() => {
    if (!user) return;
    extractionStatus().then(({ run }) => {
      // A run can outlive its documents: a worker that dies mid-run leaves the
      // row 'running' forever, and `|| 1` then claimed one document was being
      // read for a project with none — a spinner that survived a refresh and
      // never resolved. The FILES are the truth about whether there is anything
      // to read; the run is only the truth about whether work is under way.
      const docs = quote.files.length;
      if (docs > 0 && run && (run.status === "queued" || run.status === "running")) {
        setAiPhase(run.diagnostic
          ? { kind: "deferred", docs, diagnostic: run.diagnostic }
          : { kind: "reading", docs, stage: run.progressStage });
        pollExtraction(docs);
      } else if (docs > 0 && run?.status === "failed") {
        setAiPhase({ kind: "failed", diagnostic: run.diagnostic });
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    // Adding a document while one is being read is legitimate and expected —
    // the server coalesces uploads behind a ~10s debounce precisely so a
    // schedule and an energy report become ONE run. Re-adding the SAME file is
    // not: it is what people do when the screen looks idle. Name it plainly and
    // spend no extraction on identical bytes. (Match on name+size: the server's
    // content checksum isn't exposed on the project's file list.)
    const seen = new Set(quote.files.map((f) => `${f.name}|${f.size ?? ""}`));
    const key = (f: File) => `${f.name}|${f.size}`;
    const chosen = Array.from(list);
    const dupes = chosen.filter((f) => seen.has(key(f)));
    const files = chosen.filter((f) => !seen.has(key(f)));
    const dupeNames = dupes.map((f) => f.name).join(", ");
    if (!files.length) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      const many = dupes.length > 1;
      setUploadNotice({
        type: "error",
        message: `${dupeNames} ${many ? "are" : "is"} already on this project` +
          (processing ? ` — we're still reading ${many ? "them" : "it"}.` : "."),
      });
      return;
    }

    setUploading(true);
    setUploadingDocs(files.length);
    setUploadNotice(null);
    setAiPhase(user ? { kind: "reading", docs: files.length, stage: "queued" } : null);
    setRemoveOffer(null);
    const failures: string[] = [];
    const digests: string[] = [];
    const newCollisions: string[] = [];
    const serverDupes: string[] = [];
    let imported = 0, attached = 0;
    try {
      for (const file of files) {
        try {
          const preparedFile = await preparePhotoForAi(file);
          const up = await uploadFile(preparedFile, "upload");
          // The server hashes content and is the authority for stale tabs,
          // renamed files and photos that were resized before upload. A duplicate
          // response points at the already-retained file and never queues AI.
          if (up.duplicate) {
            serverDupes.push(file.name);
            continue;
          }
          if (user) {
            // Registered projects use the first-class AI proposal path. The
            // durable Worker job creates/refines the real cart; the deterministic
            // schedule estimator remains the anonymous service.
            attached++;
            continue;
          }
          const result = await startParse(up.file.id);
          if (result.ok) {
            imported += result.job.itemCount;
            digests.push(`${file.name}: ${digestOf(result.job)}`);
            newCollisions.push(...(result.job.collisions ?? []));
            if (result.job.changes?.length) {
              setLineChanges((prev) => {
                const next = { ...prev };
                for (const ch of result.job.changes!) (next[ch.tag] ??= []).push(ch);
                return next;
              });
            }
            // Wrong-project signature: more existing lines changed than added.
            if ((result.job.updated ?? 0) > (result.job.added ?? 0)) setRemoveOffer({ fileId: up.file.id, name: file.name });
            continue;
          }
          if (NOT_A_SCHEDULE.has(result.reason)) { attached++; continue; } // contribution, not a failure
          failures.push(`${file.name}: ${parseErrorMessage(result)}`);
        } catch (e) {
          failures.push(`${file.name}: ${e instanceof PhotoPreparationError ? e.message : uploadErrorMessage(e)}`);
        }
      }
      await quote.reload();
      if (newCollisions.length) setCollisionTags((t) => [...new Set([...t, ...newCollisions])]);
      if (imported) setAdding(false); // a stray in-progress add-form is stale once imported lines land
      const skippedNames = [...dupes.map((f) => f.name), ...serverDupes];
      const dupNote = skippedNames.length
        ? `${[...new Set(skippedNames)].join(", ")} already added — skipped`
        : null;
      if (failures.length) {
        const okCount = files.length - failures.length - serverDupes.length;
        setUploadNotice({ type: "error", message: `${okCount} of ${files.length} file${files.length !== 1 ? "s" : ""} uploaded. ${failures.join(" ")}${dupNote ? ` ${dupNote}.` : ""}` });
      } else if (digests.length || attached || dupNote) {
        const parts = [...digests];
        if (attached) parts.push(`${attached} document${attached !== 1 ? "s" : ""} attached for review`);
        if (dupNote) parts.push(dupNote);
        setUploadNotice({ type: "success", message: parts.join(" · ") });
      }
      // Registered users get an automatic AI run per upload — watch it.
      if (user && attached > 0) pollExtraction(attached);
      else if (user) setAiPhase(null);
    } finally {
      setUploading(false);
      setUploadingDocs(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
    setUploadNotice(null);
    await quote.clearAll();
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

  // ─── Submitted ──────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="relative min-h-screen ground-paper pt-24 pb-24 overflow-hidden">
        <GhostMark size={300} opacity={0.05} pos="right-0 bottom-0" />
        <div className="max-w-md w-full mx-auto px-6 text-center relative">
          <div className="w-14 h-14 border border-sage/30 bg-sage-wash flex items-center justify-center mx-auto mb-6"><WindowMark size={24} color={SAGE} /></div>
          <h2 className="text-2xl font-semibold text-ink mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Quote submitted</h2>
          <p className="text-sm text-body leading-relaxed mb-8 mt-2">We've received your project and emailed a confirmation to <span className="text-ink">{contactEmail || "your email"}</span>. We'll review dimensions, specifications and manufacturing suitability, then issue a reviewed quote with its reference. Expect a response within 1–2 business days.</p>
          <p className="text-xs text-body mb-6">No payment at this stage. Deposit only after you approve the reviewed quote.</p>
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
      <div className="min-h-screen ground-paper pt-16">
        <div className="max-w-2xl mx-auto px-6 py-10">
          <button onClick={() => setView("build")} className="text-body hover:text-ink text-sm mb-5 flex items-center gap-1 cursor-pointer"><ChevronLeft className="w-4 h-4" />Back to MyProject</button>
          <SLabel>Review quote</SLabel>
          <h1 className="text-3xl font-semibold text-ink mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Review and submit</h1>
          <p className="text-body text-sm mb-6">No payment at this stage. A reviewed quote is issued after manual technical review.</p>
          <div className="card p-5 mb-4">
            <SLabel>Your quote</SLabel>
            <div className="space-y-2 mb-3">
              {quote.items.map((it, i) => (
                <div key={it.id} className="flex justify-between gap-3 text-sm border-b border-black/6 last:border-0 py-1.5">
                  <span className="text-ink min-w-0 truncate">{String(i + 1).padStart(2, "0")} · {productLabel(it.productSlug)} — {mm(it.width)} × {mm(it.height)} ×{it.qty}</span>
                  <span className="text-body flex-shrink-0" style={{ fontFamily: "'DM Mono', monospace" }}>
                    {it.review?.customerConfigurationChanged && (typeof it.lineTotal !== "number" || !Number.isFinite(it.lineTotal))
                      ? "Pending final price"
                      : lineBlocksSubmission(it) ? "Review" : fmt(gstAdjust(linePriceTotal(it), gstMode))}
                  </span>
                </div>
              ))}
              {quote.files.length > 0 && <p className="text-xs text-body pt-1">+ {quote.files.length} uploaded file{quote.files.length !== 1 ? "s" : ""} for review</p>}
            </div>
            <div className="flex justify-between border-t border-black/8 pt-3 text-sm"><span className="text-body">{pendingPriceCount ? "Priced-items subtotal" : "Estimated total"}</span><span className="font-semibold text-ink" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(gstAdjust(total, gstMode))} {gstSuffix(gstMode)}</span></div>
            {pendingPriceCount > 0 && <p className="mt-2 text-xs text-amber-800">{pendingPriceCount} customer-changed configuration{pendingPriceCount === 1 ? "" : "s"} will be added after we confirm the exact product and price.</p>}
          </div>
          <div className="card p-5 space-y-4 mb-4">
            {user && <p className="text-sm text-sage flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />Pre-filled from your account — edit if needed.</p>}
            <div><FieldLabel>Full name</FieldLabel><Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Your name" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><FieldLabel>Email</FieldLabel><Input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="your@email.com" /></div>
              <div><FieldLabel>Phone</FieldLabel><Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="(03) 9000 0000" /></div>
            </div>
            <div><FieldLabel>Delivery suburb / postcode</FieldLabel><Input value={suburb} onChange={e => setSuburb(e.target.value)} placeholder="e.g. Preston VIC 3072" /></div>
          </div>
          <div className="bg-bone border border-black/8 p-4 mb-6 text-xs text-body"><AlertCircle className="w-3 h-3 inline mr-1" />Estimated totals are confirmed on technical review. No deposit until you approve the reviewed quote. Supply only — installation not included.</div>
          {submitError && <p role="alert" className="text-sm text-red-700 flex items-center gap-1.5 mb-3 justify-end"><AlertCircle className="w-4 h-4" />{submitError}</p>}
          <div className="flex justify-end"><Btn variant="sage" size="lg" disabled={!contactName || !contactEmail || submitting || aiPhase?.kind === "reading"} onClick={handleSubmit}>{submitting ? "Submitting…" : aiPhase?.kind === "reading" ? "Refining estimate…" : <>Submit for technical review <Send className="w-4 h-4" /></>}</Btn></div>
        </div>
      </div>
    );
  }

  // ─── Build ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100svh] ground-paper flex flex-col">
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
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60"
                  style={{ fontFamily: "'DM Mono', monospace" }}>Your quote</span>
              </div>
              <h1 className="font-semibold text-white leading-[1.03] tracking-tight mb-2 md:mb-3"
                style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.9rem, 4.2vw, 3rem)" }}>
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
              <p className="text-white/80 text-[15px] leading-relaxed max-w-[46ch]">
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
                aria-label="Clear all items and the uploaded schedule"
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
                        className="text-xs font-medium text-red-700 border border-red-300 bg-white px-1.5 py-0.5 hover:bg-red-100 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400">Remove</button>
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
                      <span className={`text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 border leading-none flex-shrink-0 ${chip.tint}`}
                        style={{ fontFamily: "'DM Mono', monospace" }}>{chip.label}</span>
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
              className="mb-4 flex items-start gap-2.5 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
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
            {processing && (() => {
              // The checklist needs a stage to place the marker. The anonymous
              // deterministic parse reports none, so it keeps the single line.
              const active = aiPhase?.kind === "reading" ? aiPhase.stage : undefined;
              const waiting = active === "waiting_capacity";
              // An unknown stage is treated as the first step rather than as no
              // progress: work IS under way, and showing six pending rows would
              // say the opposite.
              const current = waiting ? 0 : Math.max(0, stepIndex(active));
              const showSteps = aiPhase?.kind === "reading" && !!active;

              // Per-step elapsed, from the observed transition times. A step's end
              // is the next observed step's start; the current step ticks live.
              const stepStart = (i: number) => stageLog.find((s) => s.stage === AI_STEPS[i].stage)?.at;
              const stepDurMs = (i: number): number | null => {
                const start = stepStart(i);
                if (start == null) return null;
                for (let j = i + 1; j < AI_STEPS.length; j++) {
                  const nx = stepStart(j);
                  if (nx != null) return nx - start;
                }
                return i === current ? Math.max(0, nowTick - start) : null;
              };
              // Stall = no new step for a while. This, not elapsed time, is what
              // actually worries a customer, so it is the only thing that changes
              // the reassurance into a heads-up.
              const lastAt = stageLog.length ? stageLog[stageLog.length - 1].at : 0;
              const sinceLastMs = lastAt ? nowTick - lastAt : 0;
              const concerned = !waiting && showSteps && sinceLastMs >= 45_000;

              return (
                <div role="status" aria-live="polite"
                  className="border border-dashed border-sage/45 bg-sage/[0.05] px-4 py-5 text-sm">
                  {showSteps ? (
                    <>
                      <ol className="space-y-2">
                        {AI_STEPS.map((step, i) => {
                          const done = i < current;
                          const inProgress = i === current && !waiting;
                          const stalled = i === current && waiting;
                          const durMs = stepDurMs(i);
                          // Reading step names how many documents it is working through —
                          // the honest, available granularity (the PDF text layer is read
                          // in one call, so there is no live per-page tick to show).
                          const detail = inProgress && step.stage === "reading_documents" && aiPhase?.kind === "reading" && aiPhase.docs > 0
                            ? ` · ${aiPhase.docs} document${aiPhase.docs !== 1 ? "s" : ""}`
                            : "";
                          return (
                            <li key={step.stage} className="flex items-center gap-2.5">
                              <span className="w-4 h-4 flex-shrink-0 grid place-items-center" aria-hidden="true">
                                {done ? (
                                  <Check className="w-4 h-4 text-sage" />
                                ) : inProgress || stalled ? (
                                  <Loader2 className={`w-4 h-4 text-sage ${stalled ? "" : "animate-spin"}`} />
                                ) : (
                                  <span className="w-2.5 h-2.5 rounded-full border border-line" />
                                )}
                              </span>
                              <span className={
                                done ? "text-body"
                                  : inProgress || stalled ? "font-medium text-sage-ink"
                                    : "text-quieter"
                              }>
                                {step.label}{detail}
                              </span>
                              {/* The state in words, for anyone not seeing the glyph. */}
                              <span className="sr-only">
                                {done ? " — done" : inProgress ? " — in progress" : stalled ? " — waiting" : " — pending"}
                              </span>
                              {durMs != null && (
                                <span className={`ml-auto tabular-nums text-xs ${inProgress ? "text-sage" : "text-quieter"}`}>
                                  {fmtDur(durMs)}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                      <p className={`mt-3 leading-relaxed ${concerned ? "text-amber-800" : "text-body"}`}>
                        {waiting
                          ? "Waiting for AI service capacity. Your documents are saved; if this attempt stops, you can retry or send them for human review."
                          : concerned
                            ? "This step is taking longer than usual — still working. If it can't finish, your documents are saved for human review."
                            : "Each step completes as it finishes; a schedule usually takes a minute or two. Your documents are saved either way."}
                      </p>
                    </>
                  ) : (
                    <div className="flex items-start gap-3">
                      <Loader2 className="w-4 h-4 mt-0.5 flex-shrink-0 animate-spin text-sage" aria-hidden="true" />
                      <span>
                        <span className="block font-medium text-sage-ink">
                          {aiPhase?.kind === "reading"
                            ? progressMessage(aiPhase.stage)
                            : `Reading your document${processingDocs !== 1 ? "s" : ""}…`}
                        </span>
                        <span className="block mt-0.5 text-body leading-relaxed">
                          This normally finishes in under a minute. If automatic review cannot finish, we will stop and keep your document ready for human review.
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
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
            className="w-full max-w-sm card p-5" style={{ boxShadow: "0 20px 50px rgba(19,19,17,0.28)" }}>
            <h3 className="text-base font-semibold text-ink mb-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Clear everything?</h3>
            <p className="text-sm text-body leading-relaxed mb-4">This removes all {quote.items.length} item{quote.items.length !== 1 ? "s" : ""} and the uploaded schedule and can't be undone.</p>
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
