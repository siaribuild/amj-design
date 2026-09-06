Verdict: **CONFORMS** — no fixes required. Findings, most significant first; all are accepted deviations or sanctioned stage work, none violate design intent.

**1. Accepted deviation — `arrivalRef` is three-valued, not the design's boolean sketch** (`src/ops2/projects/ProjectsPage.tsx:95–147` vs design §1). Design sketched `useRef(false)` with `setQuery(EMPTY_QUERY)` fired at leave-time. Implementation: `boolean | null`, flag flipped `true→false` on leave, reset consumed on return. Reason recorded in code: plain boolean can't distinguish "attn just stripped by the arrival effect" from "stripped a visit ago" — the exact F2 failure class the design cites. Core design clauses hold: reset hangs off router location not `ionViewWillEnter`, entry-key machinery (`attnEntryRef`, `history.location.key`) fully deleted, measured-fact comments preserved, `?attn=` web tests (spec lines 128–257) byte-identical — no hunks touch that range, satisfying t3's "byte-identical" clause. Good reason; design doc §1 should be annotated to match (I'm read-only — conductor should note it, no code change).

**2. Sanctioned out-of-design edit — `projects.css` gained ~35 lines the design never named** (footer pinned to panel foot, phone-height clipping fix). This is polish-stage work, documented as items 1 and P0 in `05-polish.md`, which the pipeline's `[polish]` stage owns. The design's one named CSS change — brand-pill deletion at 514–521 — is present. The `.pq-active__names` flex simplification is a direct consequence of the pill deletion (one item left in the row). Not a divergence.

**3. Sanctioned out-of-design edit — skeleton test rework in `ops2-projects.spec.ts` (hunks at 528–557)**, outside t3's "edit ONLY lines ~401, ~586–610" clause. It is a `settled()` flake fix for a load-timing race, documented as finding 1 in `06-verify.md` with the failure signature. Verify-stage remediation, not a design shortcut.

**4. Comment-only edits at `queue.ts:76` and `:493`** (unnamed by design): rename `ATTENTION_FILTERS` references inside doc comments — forced by the criterion-18 symbol purge. Correct consequence, not scope creep.

Structural checks that pass clean:
- Every path in `02-tasks.json` exists and changed: `queue.ts`, `ops2-projects.test.mjs`, `attention.ts`, `ops2-attention.test.mjs`, `ProjectsPage.tsx`, `projects.css`, `web/ops2-projects.spec.ts` — all `M` in the diff.
- **Absence checks** (the ones a diff read misses): `FilterSheet.tsx` untouched as design mandated; `web/ops2-attention.spec.ts` untouched as design mandated (criterion 17's proof); no `worker/`, no `migrations/`, no new endpoint — matches design's "frontend only".
- Named-but-never-created test artifacts: none. No new test files were designed; the three new web scenarios exist as three appended tests with criteria numbers in their titles (5-7/20, 9, 4/10-12).
- Symbol purge verified: `ATTENTION_FILTERS`/`attentionQuery`/`attentionStates` appear nowhere under `src/ops2/`; `ATTENTION_ARRIVALS`/`arrivalQuery` present in exactly the three designed files.
- Strip Clear = `EMPTY_QUERY` (ProjectsPage:422), panel `onClear` stays refinements-only (:442) — both per design §2.
- Docs applied with design as stated: `CONTEXT.md`, ADR 0020 added, ADR 0018 status updated (0019 is `A` because it post-dates the baseline — created during this run's grill/design, consistent).
- Sequencing respected as far as the artifact trail shows (04-build.md records the t1→t4 order).

One action for the conductor: annotate `02-design.md` §1 (or ADR 0020) with the three-valued `arrivalRef` refinement from finding 1, so the doc matches the shipped mechanism.