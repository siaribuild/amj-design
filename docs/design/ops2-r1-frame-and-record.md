# ops2 R1 — the frame and the record (detailed design)

Author: architect (pipeline stage 2)
Date: 2026-08-17
Parent: `docs/design/ops2-architecture.md` (binding for everything cross-region)
Spec ownership: `docs/specs/ops2.md` §7.1 R1 row, plus every criterion tagged `[R1]`.

**Owner correction applied (2026-08-17):** AC-17 (session-start value visible for reversal)
is void — no undo affordance, no per-edit history, no session snapshot is designed here.
AC-16, AC-18, AC-19 stand.

R1 is the tracer bullet: sign in → open a record → change a line → watch both totals move →
issue. It proves I1, I3, I4, I5, I6 in one slice, on the real API, with **zero migrations**.

---

## 1. What R1 contains (and pointedly does not)

In: the ops2 Vite entry and shell; boot/brand/sign-in/error boundary; the responsive layout
system and its tokens; path routing and deep links; the record — identity, phase ribbon,
action bar, line table, line editor, composites (units/split/merge), per-line notes, files
block, history block, payments block, issue; loud-failure primitives; the interim record
list; the carry-across register (created at this gate); two small Worker changes.

Out (owned elsewhere): RBAC and the abuse battery (R2 — R1 ships against today's staff
gates); derivation/thermal/teach panes and the divergence write (R3); queue, views, attention
surface, with-manufacturer (R4); global archives, customers, enquiries (R5); products,
settings (R6); referrals (R7); PWA + switch-over (R8).

---

## 2. Files

### 2.1 New — frontend

```
ops2.html                              Vite entry (added to build.rollupOptions.input)
src/ops2/
  main.tsx                             mount + router creation, base detection (§3.1 arch)
  App.tsx                              error boundary → boot gate → shell → outlet
  routes.tsx                           route table (arch §3.2; R1 registers /, /record/:ref[,/line/:lineId])
  shell/
    Shell.tsx                          nav frame: rail/drawer folded from one nav component by container width
    Brand.tsx                          logo → businessName → wordmark; never an invented mark (register row 4)
    SignIn.tsx                         OTP screen, register rows 5–13 verbatim (renders only when /me says Access is not configured)
    ErrorScreen.tsx                    boundary fallback + route-level not-found
  layout/
    tokens.css                         width change points, spacing/type scale, chrome palette slots (arch §4.2)
    useContainerWidth.ts               ResizeObserver hook (arch §4.1)
    Fold.tsx / RowList.tsx             the one folding list component (arch §4.1)
  api/
    client.ts                          request(), OpsError, abort pass-through (arch §5.1)
    ops.ts                             typed endpoint wrappers R1 uses
    errors.ts                          code → sentence map; ACTION_ERRORS copy carried verbatim (rows 67–68)
  state/
    loadable.ts                        Loadable<T>, WriteState (arch §5.2–5.3)
  record/
    RecordPage.tsx                     pane composition for /record/:ref
    useRecord.ts                       the record view-model hook (single fetch of GET /projects/:id; refresh; asOf)
    RecordHeader.tsx                   ref · title · customer · value+basis · GST-mode labelling (AC-79/80)
    PhaseRibbon.tsx                    6 phases, passed/current/future, caption (rows 57–59)
    ActionBar.tsx                      server-declared actions[], one primary, blockedReason inline (rows 60–64)
    ConfirmInline.tsx                  confirm-in-place, never a modal (row 64)
    LineTable.tsx                      openings list; folds by container width; deep-link line highlight (AC-25)
    LineEditor.tsx                     ItemForm reuse wrapper + save flow (rows 95–111)
    CompositePanel.tsx                 units, split planner, merge (rows 112–126)
    NotesBlock.tsx                     record + per-line notes; posts lineId (AC-18, row 93, appendix 280)
    FilesBlock.tsx / HistoryBlock.tsx / PaymentsBlock.tsx   (rows 149–158)
    ReadOnlyBar.tsx                    non-editable states named with the real cause (row 74, AC-81)
  home/
    InterimList.tsx                    interim record list at `/` — ref · title · phase · waitingOn,
                                       explicitly labelled interim; replaced by R4's queue (register rows 36–49 stay R4's)
```

Component reuse note: `LineEditor` wraps the same `ItemForm` the customer estimator and
legacy ops share today (register row 95 — "reused verbatim"). R1 does not fork it; ops2
imports it from its current home. If its styling assumptions fight the ops2 shell, the
ui-designer pass adjusts presentation via the wrapper, not by copying the form.

### 2.2 Changed — worker (small, additive, shared with legacy)

| File | Change |
|---|---|
| `worker/index.ts` | Shell selection becomes `opsShellFor(pathname)`: on the ops host, paths under `/ops2` (and any extension-less GET beneath it) serve `/ops2.html`; all else serves `/ops.html` unchanged. (Arch §2.2 state 1.) |
| `worker/routes/ops.ts` — `PATCH /lines/:id` | (a) Split the folded lookup (today `:902–910`): line missing → 404 `not_found`; line present but project outside the editable set → **409 `{ error: "not_editable", statusInternal }`**. (b) Response gains `quoteTotals: { goods, delivery, total }` computed from the post-write rows (goods = Σ parent `line_total`; delivery = `project.delivery_amount`, may be null; total = goods + (delivery ?? 0)). Same two additions to `PUT /lines/:id/price` and the segment endpoints so every line-mutating answer carries the same totals shape. Legacy tolerates both: unknown response fields ignored; unknown error code falls through to its generic sentence. |
| `vite.config.ts` | Third rollup input `ops2: ops2.html`. |
| `src/data/opsDtos.ts` (new) | R1 moves the DTO types it consumes (record, line, actions, totals) from `src/ops/api.ts` into the shared home; legacy imports them from there (type-only change, no behaviour). |

**No new endpoints. No migrations.** `GET /projects/:id` already returns everything the
record renders (verified against the legacy record's usage); issue is the existing
`POST /projects/:id/issue-quote`; notes already accept `lineId` (`ops.ts:1285–1296`).

---

## 3. Interfaces (the seams later regions inherit)

```ts
// state/loadable.ts — every read surface programs against this and nothing else
type Loadable<T> =
  | { state: "loading" }
  | { state: "error"; error: OpsError; retry: () => void }
  | { state: "ready"; data: T; asOf: Date; refresh: () => void };

type WriteState =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "failed"; code: string; sentence: string; retry: () => void };

// api/client.ts
class OpsError extends Error { status: number; code: string; detail?: string; missingOptions?: string[] }

// record/useRecord.ts — the record plane's one data door
function useRecord(ref: string): Loadable<RecordVm> & {
  saveLine(lineId: string, patch: LinePatch): Promise<SaveResult>;   // pessimistic; updates lines + totals from response
  issue(): Promise<IssueResult>;
  addNote(body: string, lineId?: string): Promise<void>;
};
// SaveResult carries the server's quoteTotals — the client never sums money itself.
// GST display: RecordVm exposes amounts through src/data/gst.ts helpers with the owner
// account's price_gst_mode; the ops view toggle is view-state only (AC-79/80).
```

`useRecord` is deliberately the deep module of R1: pane components are thin renderers over
`RecordVm`; every mutation goes through it, so WriteState, totals propagation, and conflict
handling live in exactly one place. The line editor's field state lives in the hook's
editing slice, keyed by field identity — that is what makes AC-12's fold-without-loss hold.

Routing contract (arch §3.2): `/record/:ref` resolves by `public_ref`; `/record/:ref/line/:id`
scrolls and highlights. `useRecord` resolves ref→id via the record fetch itself (the record
DTO carries both); no extra endpoint.

---

## 4. Behaviour the criteria pin (R1's acceptance surface)

| Criterion | Design answer |
|---|---|
| AC-1 (partial, with R3) | Save path has no confirmation/justification step anywhere; review flags resolve only by explicit request (existing `resolveReview` contract, unchanged). |
| AC-11/12/13/15 | Arch §4: container-driven layout, one folding component, 320px floor, static purity check, Playwright width matrix + mid-task resize. |
| AC-14 (floor) | At ≥1440px the record renders openings list and (until R3, the notes/files/history scope) side by side; no primary column at phone measure. R3 slots derivation into the second pane without re-architecture. |
| AC-16 | Debounced (250ms) price preview + save returning `quoteTotals`; both totals bound to the same response. Budget measured in Playwright with network throttling; p95 ≤ 1200ms. |
| AC-18 | NotesBlock posts `lineId`; notes render against their line thereafter. |
| AC-19 | Totals from every line-mutating response; no reload, no navigation. |
| AC-20/21/22 | WriteState at the failing control; values retained; retry re-sends the same payload. Simulated offline in Playwright. |
| AC-23 | 409 `not_editable` + `statusInternal` → sentence naming the real cause + `Reload this record`. |
| AC-24 | Path routing (ADR-0002). Local/CI verifies target survival through the non-Access boot; the Access-mode half is a production smoke on the reference devices, recorded in the register. |
| AC-25/26 | Route table + line highlight; every destination is a URL; back works (router history). |
| AC-79/80 | Primary money in the owner account's GST mode, always labelled, via `src/data/gst.ts` (single source); reviewer toggle is view-only state in the shell. |
| AC-81 | Editor renders only in the editable set (today's rule, register row 77); ReadOnlyBar names the actual state and the way back. |
| AC-84 | A line whose product is withdrawn/non-offerable still renders and prices from its stored config; the state is named on the line (existing DTO fields; no invented availability). |
| AC-85 | Delivery figure renders unpriced/basis states distinctly (existing delivery DTO: `basis`, `amount` null vs 0 — register rows around delivery are honest by DTO, the record renders them). |
| AC-86 | Coverage sentences never veto; save succeeds; divergence recorded on the line (existing composite contract, carried). |
| AC-35/40a/40b | `docs/ops2/register.md` exists, every row region-assigned, dormant entries present, sweep re-run recorded (done at this gate; production role query is the named residual step). |

---

## 5. Security (R1 scope)

**Data:** the record exposes commercial data (pricing, lifecycle) and personal PII (customer
name/email/phone, submit-time contact) to staff — the same data the legacy record already
serves from the same endpoints. R1 adds **no new data surface**, no new endpoint, and
serialises nothing new into any customer response.

**Trust boundaries:** unchanged from arch §11.2. R1 touches boundary 2 only as a consumer;
it adds no auth route and does not modify `staff.ts` (AC-57a untouched — the guard and the
OTP trio are not in R1's diff at all; the SignIn screen renders only when `/me` reports
non-Access mode, exactly as legacy).

**Per-endpoint authorization (R1 interim, pre-RBAC):** every endpoint R1 calls is already
gated — `resolveStaff` (refuses manufacturer role and non-staff) plus `hasAssignedRole` /
`canIssueQuote` on the write paths (`ops.ts:892–895, :1299–1302`); the two Worker changes
in §2.2 sit **inside** those existing gates and alter no authorization logic. Scoping: ops
reads are business-wide by design (arch §11.3); identifier discipline unchanged (`not_found`
for missing rows). The R2 floor and manifest supersede this interim state; R1's client needs
no change when they land.

**Abuse cases in R1's diff:** (1) The shell-serving change routes *which HTML file* is
returned on the ops host only — customer-host behaviour is untouched, and the served shells
are both Access-protected on that host; nothing new is reachable. (2) The 409 `not_editable`
answer discloses quote state to staff only (behind `resolveStaff`) — no anonymous or
customer path reaches it. (3) `dangerouslySetInnerHTML` is refused in `src/ops2/**` by the
static check (AC-78's rendering half); note bodies render as text. Residual: none beyond
arch §11.4's named residuals.

---

## 6. Build order (developer sequencing, test-first throughout)

1. **Worker seams first** (they're the smallest and unblock everything):
   failing tests in `scripts/tests/ops2-frame.test.mjs` for (a) ops2 shell serving matrix
   (ops host `/ops2/record/x` → ops2.html; ops host `/` → ops.html; customer host untouched),
   (b) PATCH conflict causes (missing vs non-editable), (c) `quoteTotals` in every
   line-mutating response. Then the `worker/index.ts` + `ops.ts` changes to green.
2. **Entry + shell + routing:** ops2.html, boot gate, error boundary, route table, base
   detection; Playwright `ops2-shell.spec.ts` for boot states, deep-link reload, back.
3. **Layout system:** tokens, Fold/RowList, purity static check (added to
   `ops2-frame.test.mjs`); Playwright width matrix fixture.
4. **Record read plane:** useRecord + header/ribbon/line table/blocks; interim list;
   `ops2-record.spec.ts` deep links (AC-24 local half, AC-25/26), GST labelling (AC-79/80),
   read-only states (AC-81), withdrawn-product line (AC-84), delivery honesty (AC-85).
5. **Mutations:** line editor, composites, notes, issue; WriteState; conversation-pace and
   loud-failure Playwright specs (AC-16, AC-18–23, AC-86).
6. **Register:** tester walks R1-assigned rows in their environments; states + evidence
   recorded in `docs/ops2/register.md`; UX mock gate output (approved copy) cross-checked
   against verbatim-copy rows (AC-39).

Probity note: steps 1's Worker writes and the `src/data/opsDtos.ts` move are inside the TDD
gate scope — red first. `src/ops2/**` UI is outside `probity.config.ts` scope but follows
the same discipline via the Playwright specs above.

## 7. Test plan (named files, wired scripts)

- `package.json`: add `"test:ops2": "node --test scripts/tests/ops2-frame.test.mjs"` and
  append `test:ops2` to the root `test` chain.
- `scripts/tests/ops2-frame.test.mjs` (node): shell-serving matrix; PATCH conflict causes;
  `quoteTotals` shape and arithmetic (Σ parents + delivery, null-delivery case); layout
  purity grep; `dangerouslySetInnerHTML` refusal.
- `scripts/tests/web/ops2-shell.spec.ts` (Playwright): boot, error boundary, sign-in
  (non-Access), deep-link cold open + reload, back behaviour.
- `scripts/tests/web/ops2-record.spec.ts`: record rendering across the width matrix
  (320/375/768/1024/1440), mid-task resize with an open editor (AC-12), line deep link
  (AC-25), GST mode labelling, read-only cause naming.
- `scripts/tests/web/ops2-edit.spec.ts`: option change → both totals (AC-16 with throttled
  network, AC-19), per-line note (AC-18), offline save → at-control error → retry (AC-20/22),
  issued-while-editing conflict (AC-23, using a second context to issue), composite coverage
  save (AC-86).
- Device-lab walk (AC-15) and the production Access smoke for AC-24: manual tester steps,
  evidence recorded in the register.

## 8. Rejected alternatives (R1-specific)

| Alternative | Rejected because |
|---|---|
| Client-side quote-total computation (sum lines locally for speed) | Two homes for money arithmetic; the server already owns totals at issue; one response field is cheaper than one drift class. |
| A `GET /records/:ref` resolver endpoint | The record DTO already carries `public_ref`; a second read path for the same fact fails the deletion test. |
| Building R1 on the legacy `src/ops/api.ts` client as-is | Its error handling is the silent-failure pattern ops2 exists to kill; types are shared via `src/data/opsDtos.ts` instead, behaviour is not. |
| Shipping R1 without any list at `/` (URL-only record access) | The tracer must be operable by the owner, not only by someone pasting URLs; the interim list is ~50 lines and is explicitly disposable. |
| A session-start value snapshot in the editor | Removed by the owner's 2026-08-17 correction; carrying it "in case" is hedging the owner has forbidden. |

## 9. Decisions needed

None from R1. (See the architecture document's closing section for the one spec-wording
correction — hash → path routing — which is the PM's to fold in, not an owner decision.)
