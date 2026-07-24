# Multi-file upload UX — build spec (UX-agent approved, 2026-07-25)

Owner mandate: all UI changes consulted with / supervised by the UX agent. This
is the agreed build-against spec (slice 1 + replace/append rethink).

## 1. Replace/Append prompt: KILLED — classification decides

The `needs_choice` replace/append prompt existed because the deterministic parser
was destructive-or-additive with no identity model. The pipeline has identity
(tag upsert) + provenance (evidence), so it answers the question itself.

Per detected type when items pre-exist (never prompt):
- **schedule** → upsert by tag (new tags create; matching enrich/re-gate;
  materially different dims → conflict chip, keep-first-and-flag). Append
  subsumed; "replace" ceases to exist as a parse mode.
- **energy_report** → contribute only; never creates lines; unmatched constraints
  = review notes.
- **plans** → contribute only (room/orientation enrichment, future).
- **supporting** → attach only; rail shows "Not used for pricing".

**Revision reconciliation** (replaces "replace"): after each run, any
document-origin UNEDITED line whose tag no longer appears in any current evidence
is auto-removed + listed in the change digest. Customer-edited line → NOT
deleted; attn chip "No longer in your documents" with Remove/Keep.

**Manual items**: document runs never create/delete/write `origin:"manual"` lines
— hard filter in the upsert. Exception: schedule tag == manual item code → do NOT
merge; conflict card "Link to schedule W04 / Keep separate" (Link converts origin
to schedule with ALL fields marked edited).

**Start over**: per-file Remove (X + confirm) on rail chips, DRAFT projects only
(post-submission files lock, current behavior). Removing triggers a re-run;
reconciliation cleans up solely-sourced lines. "Clear all" survives as
whole-project reset. The parse-route's delete-other-schedules block survives only
on the legacy path; pipeline path drops 1-schedule-per-quote deletion.

**NO surviving question (owner challenge 2026-07-25, UX-ratified)**: the
tag-overlap heuristic is killed — it gates the wrong tail (different houses
share W01..Wnn conventions ⇒ the harmful case shows HIGH overlap and merges
silently; re-parse nondeterminism makes any threshold flappy). The binary
contract: **a file contributes to the project it was uploaded into.** Safety is
visibility + reversibility, never prediction:
- Upload panel subline shows scope at the commitment moment: "Adding to
  **<project name>**" (DM Mono, text-white/55, replaces the static
  "PDF · DWG · XLS…" line once files exist); uploading state reads
  "Reading 2 documents for **<project name>**…".
- Change digest LEADS with impact scale when existing lines changed:
  "Schedule_v2.pdf **changed 11 of your 14 items** — [see changes] ·
  [not for this project? Remove file]" — the inline Remove link (only when
  changed > added) is the wrong-project early exit. Neutral copy, not alarmed.
- Future evidence-based check: extracted site address vs project address
  mismatch ⇒ review FLAG with provenance (a fact, not a score), never a gate.

## 2. Slice-1 implementation spec

**Upload loop (`QuotePage.handleFiles`)**: sequential `for…of` POSTs, per-file
try/catch, continue on failure. Send `kind:"upload"` (stop hardcoding
"schedule" — server classifies). Optimistic chip {status:"Uploading…"} → 200 ⇒
"Processing" → error ⇒ chip error state (existing uploadErrorMessage copy),
never abort loop, no single uploadNotice for per-file errors. After loop, ONE
aggregate notice only if ≥1 failure ("2 of 3 files uploaded. X: too large.").
Drop list[0] slice + "one schedule per quote" string. Do NOT call startParse on
the pipeline path.

**Persistence**: migration adds `doc_type TEXT`, `doc_type_source TEXT NOT NULL
DEFAULT 'auto'` to file_asset. `ingestProjectFiles` writes back:
`UPDATE file_asset SET doc_type=? WHERE id=? AND doc_type_source='auto'`.
`GET /projects/:id/files` returns both; QFile gains `docType`.

**File rail** (replaces single chip at QuotePage.tsx:426, same position):
- Container `div.mt-3.flex.flex-wrap.gap-2`.
- Chip `inline-flex items-center gap-2 border border-black/12 bg-white px-3
  py-1.5 text-xs max-w-full`: Paperclip w-3.5 sage · filename font-medium
  text-[#131311] truncate max-w-[14rem] · type label · "·" status text.
- Type label: DM Mono text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5
  border leading-none. Tints: SCHEDULE border-[#5A7A6A]/30 bg-[#5A7A6A]/8
  text-[#355344]; ENERGY REPORT TONE.work; PLANS TONE.mute; SUPPORTING TONE.mute
  border-dashed; doc_type null → dashed "SORTING…".
- Status text text-xs text-[#8a8782], icon+text never color alone:
  Uploading… Loader2 w-3 h-3 spin; Processing → spinner "Reading…";
  Uploaded → "Read" + Check w-3 h-3 #2C7A54 (+ "· 14 openings" when known);
  Needs attention → AlertCircle w-3 h-3 + msg in TONE.attn.text;
  upload error → chip border-red-300 bg-red-50 text-red-800, X dismisses.

**edited_fields guard** (DONE, migration 0017): JSON array on opening_instance;
pipeline upsert skips edited columns (human = highest precedence). Lines-save
path must SET it when a customer changes dimension/product/option on a
schedule-origin line (union; "use document's value" resolution clears a key).
Manual-origin lines skipped entirely.

## Later slices (from the main design report)
(3) extraction-status polling + sticky-bar "Reading N documents…" + digest
banner; (4) basis chip (status vs basis split + compliance tooltip); (6) run
coalescing ~10s KV debounce; (7) per-run changes[] diff + Updated pills +
strike-through provenance; (8) document-vs-edit conflict card.
