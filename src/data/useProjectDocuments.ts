// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT DOCUMENTS — the shared upload / parse / AI-refinement engine
//
// Extracted verbatim from the card builder /quote used to be, so both arms of
// the A/B drove the same engine rather than each owning a copy — two copies of a
// polling state machine is how they would have diverged on timing, retry and
// failure copy, and an A/B that differs in its engine measures the engine rather
// than the presentation. The arm won and the card builder is gone; the engine
// stays here because a page is not where a state machine belongs.
//
// Behaviour here is deliberately unchanged from the original. The epoch /
// deadline / stall logic in particular is load-bearing and tuned:
// see the comments inline.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from "react";
import {
  uploadFile, startParse, extractionStatus, retryExtraction, deleteFile, resolveCollision,
  UploadError, type ExtractionRun, type ParseJob, type ParseResult,
} from "./api";
import { type QuoteState } from "./configurator";

export type SafeDiagnostic = NonNullable<ExtractionRun["diagnostic"]>;
export type AiProgressStage = NonNullable<ExtractionRun["progressStage"]>;

export type AiPhase =
  | null
  | {
      kind: "reading"; docs: number; stage?: AiProgressStage;
      /** Present only while a drawing read is running (§5) — the customer
       *  sees a counter, never which openings could not be read. */
      drawingsDone?: number; drawingsTotal?: number;
    }
  | { kind: "deferred"; docs: number; diagnostic: SafeDiagnostic }
  | { kind: "done"; refined: number }
  | { kind: "failed"; diagnostic?: SafeDiagnostic | null };

export interface DocumentChecklistStep {
  key: AiProgressStage | "reading_openings";
  label: string;
  detail: string;
}

const BASE_STEPS: { key: AiProgressStage; label: string }[] = [
  { key: "queued", label: "Preparing document review" },
  { key: "reading_documents", label: "Reading the documents" },
  { key: "extracting_schedule", label: "Extracting the schedule" },
  { key: "building_envelope", label: "Checking thermal requirements" },
  { key: "matching_and_pricing", label: "Matching products and prices" },
  { key: "preparing_quote", label: "Preparing your recommendations" },
];

/** The checklist the customer sees, plus which row is current — computed
 *  once so the component only renders it.
 *
 *  A drawing read gets its OWN row, driven by counts rather than a stage:
 *  there is no `reading_openings` progress_stage and there will not be one
 *  (0059's own rationale — extending the CHECK is a table rebuild). It runs
 *  inside the same DB window as "building the envelope" but is conceptually
 *  a different job, so it earns its own row rather than hiding under
 *  "Checking thermal requirements" — the placement lesson two prior sessions
 *  (f0714fec, then the correction in 827a8a32) had to learn by shipping it
 *  wrong first. */
export function documentChecklist(
  phase: { stage?: AiProgressStage; drawingsDone?: number; drawingsTotal?: number } | undefined,
): { steps: DocumentChecklistStep[]; current: number } {
  const total = phase?.drawingsTotal;
  const done = phase?.drawingsDone ?? 0;
  const steps: DocumentChecklistStep[] = [];
  for (const s of BASE_STEPS) {
    steps.push({ key: s.key, label: s.label, detail: "" });
    if (s.key === "extracting_schedule" && total != null) {
      steps.push({
        key: "reading_openings",
        label: "Reading your drawings",
        detail: done > 0
          ? ` · opening ${done} of ${total}`
          : ` · ${total} opening${total === 1 ? "" : "s"} found`,
      });
    }
  }
  const stillReadingDrawings = phase?.stage === "building_envelope" && total != null && done < total;
  const currentKey = stillReadingDrawings ? "reading_openings" : phase?.stage;
  const current = steps.findIndex((s) => s.key === currentKey);
  return { steps, current: current < 0 ? 0 : current };
}

export type StageLogEntry = { stage: AiProgressStage; at: number };
export type UploadNotice = { type: "success" | "error"; message: string };

export class PhotoPreparationError extends Error {}

const AI_IMAGE_TARGET_BYTES = 5_500_000;
const AI_IMAGE_MAX_SIDE = 2800;

const whenSafe = (value: string): string | null => {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
};

export async function preparePhotoForAi(file: File): Promise<File> {
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

// Parse outcomes that just mean "not a schedule" are quiet — those files are
// contributions (energy report / plans), not failures.
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

export interface ProjectDocuments {
  uploading: boolean;
  uploadNotice: UploadNotice | null;
  setUploadNotice: (n: UploadNotice | null) => void;
  aiPhase: AiPhase;
  stageLog: StageLogEntry[];
  nowTick: number;
  /** True while EITHER path is busy: the anonymous deterministic parse or the
   *  registered AI run (which keeps going after the HTTP upload resolves — the
   *  gap that made the page look idle and invited a duplicate upload). */
  processing: boolean;
  processingDocs: number;
  retryingAi: boolean;
  basisMap: Record<string, string>;
  collisionTags: string[];
  removeOffer: null | { fileId: string; name: string };
  setRemoveOffer: (o: null | { fileId: string; name: string }) => void;
  removingFile: string | null;
  setRemovingFile: (id: string | null) => void;
  lineChanges: Record<string, { field: string; from: string; to: string }[]>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  openUpload: () => void;
  handleFiles: (list: FileList | null) => Promise<void>;
  handleRemoveFile: (fileId: string, name: string) => Promise<void>;
  handleCollision: (tag: string, choice: "linked" | "separate") => Promise<void>;
  handleAiRetry: () => Promise<void>;
  diagnosticMessage: (d: SafeDiagnostic | null | undefined) => string;
  /** Reset every document-derived state. Used by the whole-project clear. */
  resetDocuments: () => void;
}

export function useProjectDocuments(
  quote: QuoteState,
  user: { email: string } | null,
  options?: { onImported?: () => void },
): ProjectDocuments {
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<UploadNotice | null>(null);
  const [aiPhase, setAiPhase] = useState<AiPhase>(null);
  // How many documents the current upload put in flight — kept because the
  // anonymous path has no aiPhase to read a count from.
  const [uploadingDocs, setUploadingDocs] = useState(0);
  const [retryingAi, setRetryingAi] = useState(false);

  // Per-step timing. The customer's real anxiety is a FROZEN screen, not elapsed
  // time — a minute that is visibly advancing is fine; 45s of nothing is not. So
  // we record when each stage was first seen and show how long each step took,
  // with a live timer on the step in flight. `stageLog` is append-only per run.
  const [stageLog, setStageLog] = useState<StageLogEntry[]>([]);
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

  const processing = uploading || aiPhase?.kind === "reading";
  const processingDocs = aiPhase?.kind === "reading" ? aiPhase.docs : uploadingDocs;

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const openUpload = () => fileInputRef.current?.click();

  const handleRemoveFile = async (fileId: string, name: string) => {
    setRemovingFile(null);
    setRemoveOffer(null);
    let res: Awaited<ReturnType<typeof deleteFile>>;
    try {
      res = await deleteFile(fileId);
    } catch {
      setUploadNotice({ type: "error", message: `We couldn't remove ${name}. Please try again.` });
      return;
    }
    // The delete is now durable. Reflect it immediately, and do not let reload()
    // pre-save the stale pre-delete cart snapshot over the server mutation.
    quote.removeFile(fileId);
    try {
      await quote.reload({ flushLocalChanges: false });
    } catch {
      // A transient read-back failure does not turn a committed delete into a
      // reported failure. An ordinary refresh can finish line reconciliation.
    }
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
  const pollEpoch = useRef(0);
  const stopPolling = () => {
    pollEpoch.current++;
    if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; }
  };
  useEffect(() => () => stopPolling(), []);

  const pollExtraction = (docs: number) => {
    stopPolling();
    const epoch = pollEpoch.current;
    const t0 = Date.now();
    setStageLog([]);            // fresh timeline for this run
    setAiPhase({ kind: "reading", docs, stage: "queued" });
    let sawRun = false;
    let lastDiagnostic: SafeDiagnostic | null = null;
    let lastStage: AiProgressStage | undefined;
    const tick = async (n: number) => {
      if (epoch !== pollEpoch.current) return;
      let inFlight = false;
      // Duration is NOT failure. The client backstop is generous (past the
      // server's 120s job ceiling); the server is the authority on actual
      // failure. We only give up on our own if the whole run window elapses with
      // no terminal status at all — a stall is surfaced as concern, not death.
      const windowElapsed = Date.now() - t0 >= 150_000;
      try {
        const { run, basis } = await extractionStatus();
        if (epoch !== pollEpoch.current) return;
        if (basis) setBasisMap(basis);
        if (run && (run.status === "queued" || run.status === "running")) {
          sawRun = true;
          inFlight = true;
          lastDiagnostic = run.diagnostic ?? null;
          if (run.progressStage !== lastStage) { lastStage = run.progressStage; }
          recordStage(run.progressStage);
          setAiPhase(run.diagnostic
            ? { kind: "deferred", docs, diagnostic: run.diagnostic }
            : { kind: "reading", docs, stage: run.progressStage, drawingsDone: run.drawingsDone, drawingsTotal: run.drawingsTotal });
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
          : { kind: "reading", docs, stage: run.progressStage, drawingsDone: run.drawingsDone, drawingsTotal: run.drawingsTotal });
        pollExtraction(docs);
      } else if (docs > 0 && run?.status === "failed") {
        setAiPhase({ kind: "failed", diagnostic: run.diagnostic });
      } else if (docs > 0 && run?.completedAt) {
        setAiPhase({ kind: "done", refined: run.summary?.cartApplied ?? 0 });
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  // Multi-file upload (UX spec: docs/estimator/multifile-ux-spec.md). SEQUENTIAL
  // for…of — the rate limit is per-source (parallel bursts risk spurious 429s)
  // and chips stay order-stable. One bad file never aborts the rest. kind is
  // "upload": the SERVER classifies (schedule / energy report / plans), shown on
  // the file rail.
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
    // Uploading bytes and waiting for the AI job are different phases. Do not
    // show the server's queued step until the files are actually attached.
    setAiPhase(null);
    stopPolling();
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
      if (imported) options?.onImported?.(); // a stray in-progress add-form is stale once imported lines land
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

  const resetDocuments = () => {
    stopPolling();
    setAiPhase(null);
    setStageLog([]);
    setBasisMap({});
    setCollisionTags([]);
    setLineChanges({});
    setRemoveOffer(null);
    setUploadingDocs(0);
    setUploadNotice(null);
  };

  return {
    uploading, uploadNotice, setUploadNotice, aiPhase, stageLog, nowTick,
    processing, processingDocs, retryingAi, basisMap, collisionTags,
    removeOffer, setRemoveOffer, removingFile, setRemovingFile, lineChanges,
    fileInputRef, openUpload, handleFiles, handleRemoveFile, handleCollision,
    handleAiRetry, diagnosticMessage, resetDocuments,
  };
}
