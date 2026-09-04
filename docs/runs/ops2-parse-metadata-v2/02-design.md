# Design — ops2 line Metadata tab (parse audit surface)

Spec: `docs/runs/ops2-parse-metadata/01-spec.md` (30 ACs). Base:
`feat/plan-parse-conformance`. No migration. No new generic components. UI
stage off (grill decision 22) — composition of existing components only.

## 0. Shape in one paragraph

One new deep module, `worker/lib/drawing/meta.ts`, owns the whole availability
question behind a single scoped entry SELECT — parsed line, right project,
pre-issue — and returns either an allow-listed DTO or `null`. Two thin routes
in `worker/routes/ops.ts` expose it: a JSON metadata read and a crop-image
stream (key resolved server-side, access audit-logged). On the client, a new
`useLineMeta` hook (a copy of `useLineRationale`'s four-state discipline) makes
"the endpoint answered 404" and "there is no tab" the same fact; `lineRoute.ts`
grows three sibling views (`/meta`, `/meta/reading`, `/meta/run`); `LinePage`
renders the two `.pq-chip` tabs in `OpsPage`'s `controls` slot and hosts one
new composition file, `MetaTab.tsx`, which arranges the three panels from
existing `OpenablePanel`/`SidePanel` parts.

## 1. Affected files — hand-off index

New files:

| Path | What it is |
|---|---|
| `src/data/lineMeta.ts` | DTO types only, zero runtime imports — follows `src/data/rationale.ts` doctrine (facts not sentences; forbidden facts absent by shape). |
| `worker/lib/drawing/meta.ts` | Deep module: `lineMeta(env, {projectId, lineId})` and `lineCropKey(env, {projectId, lineId})`, both behind one scoped entry SELECT. |
| `src/ops2/projects/useLineMeta.ts` | Client hook, a structural copy of `src/ops2/projects/useLineRationale.ts` (loading/ready/missing/error; disabled answers `missing` synchronously; 404 → `missing`). |
| `src/ops2/projects/MetaTab.tsx` | Presentation-only composition: Image panel, Reading `OpenablePanel` + `SidePanel` expansion, Run `OpenablePanel` + `SidePanel` expansion. Imports no router — `LinePage` hands it `view`, `onOpenReading`, `onOpenRun`, `onClose`, `cropSrc`, `dto`. |
| `scripts/tests/meta-api.test.mjs` | API/lib suite (heavy tier), patterned on `scripts/tests/why-rationale-api.test.mjs`. |
| `scripts/tests/ops2-meta.test.mjs` | Client suite (pure tier) for `MetaTab` + `useLineMeta`, patterned on `scripts/tests/ops2-why.test.mjs`. |

Changed files:

| Path | Where | Change |
|---|---|---|
| `worker/routes/ops.ts` | after the rationale route (`ops.get("/projects/:id/lines/:lineId/rationale")`, lines 727–742) | Two new routes: `GET /projects/:id/lines/:lineId/meta` and `GET /projects/:id/lines/:lineId/meta/crop`. Same auth ladder verbatim (`resolveStaff` → 403 `{error:"forbidden"}`; `hasAssignedRole` → 403 `{error:"forbidden_role"}`). Crop route copies the staff download route's response/audit pattern (`ops.get("/files/:id/download")`, lines 2274–2308: `logEvent`, `nosniff`, `private, no-store`, `no-referrer`). |
| `src/ops2/projects/lineRoute.ts` | `parseLineRoute` (line 167), `at()` (line 147), suffix consts near `WHY_SUFFIX` (line 145), marks (lines 95–115), readers (lines 121–134) | Three new views `meta`/`metaReading`/`metaRun`, `hasMeta` parameter, `META_SUFFIX`/`META_READING_SUFFIX`/`META_RUN_SUFFIX`, one new door mark + `metaDoor()` reader. |
| `src/ops2/projects/LinePage.tsx` | imports (1–18); enable/readiness block (77–98, 133–139); `closeChild` (234–243); render (245–327) | `useLineMeta` hook; `hasMeta` fed to `parseLineRoute`; readiness gate extended so a deep `/meta` link never flashes the Opening body (AC-3); tab chips in `OpsPage controls` slot; `MetaTab` rendered when the meta view is active; `closeChild` targets `/meta` when closing a meta expansion (AC-21). |
| `package.json` | `test:pure` (line 17), `test:heavy` (line 18), `test:ops2` (line 55), plus one new `test:meta` script | Wire both new test files in. |
| `CONTEXT.md` | after **Crop evidence** (line 156) | New term **Metadata tab** (architect applies this edit — done alongside this design). |

Precedents the developer copies without re-deriving (read once, already located):

- Tab chips markup: `src/ops2/projects/ProjectRecordPage.tsx` lines 298–331
  (`.pq-controls` / `.pq-chips` / `.pq-chip`, `aria-pressed`, `data-tab`).
  CSS already exists at `src/ops2/styles/projects.css` lines 200–245 — no CSS
  change.
- `OpsPage` `controls` slot: `src/ops2/chrome/OpsPage.tsx` (desk toolbar lines
  200–204, phone band line 254). No change to `OpsPage`.
- Deep-module refusal pattern: `worker/lib/estimator/rationale.ts` (single
  scoped entry SELECT, `parse<T>` JSON helper, allow-list DTO builders).
- Reading row columns: the `persistReadings` INSERT in
  `worker/lib/drawing/readings.ts` lines 127–140 is the authoritative column
  list for `drawing_reading`.
- Report shape: `worker/lib/drawing/contract.ts` — `DrawingReport`,
  `DrawingFileReport`, `DrawingRunStepCounts`, `ReadingState`, `GapCode`,
  `DrawingFlag`, `SplitReading`.
- `OpenablePanel` (`{title, testId, busy?, open?: {label, onOpen}}`) and
  `SidePanel` (`{open, onClose, title, testId, phoneForm, dismiss}`) in
  `src/ops2/chrome/`.

## 2. Data model and migrations

**No migration.** Everything this surface shows is already persisted:
`drawing_reading` rows (migrations 0060/0061), `ai_runs.drawing_report_json`
(0060), crops in R2 under `projects/<id>/crops/` (`worker/lib/drawing/crops.ts`).
The spec forbids persisting `evidenceView` — it stays a recorded known gap.

## 3. Interfaces

### 3.1 DTO — `src/data/lineMeta.ts`

Types only; the worker imports these and builds the object with explicit
allow-list assignments (never a spread of a stored row). Shape:

```ts
export type MetaFactState = "value" | "not_stated" | "not_read";

export interface MetaFact { state: MetaFactState; value: string | null }

export interface MetaSplitUnit {
  role: string; ratio: number;
  operation: string | null; derivedWidthMm: number | null;
}

export interface MetaReading {
  heading: MetaFact;          // orientation_state / orientation
  elevation: MetaFact;
  room: MetaFact;
  split: { state: MetaFactState; axis: string | null; units: MetaSplitUnit[] };
  confidence: "high" | "low" | null;   // rendered verbatim (spec assumption)
  flags: string[];                      // full list, max 7 at source (AC-16)
  gapCode: string | null;
  reasoningParts: string[];  // gap_note split on "|" SERVER-side — AC-15's rule
                             // lives in one place, the DTO builder, not the skin
  source: {
    fileId: string;
    filename: string | null; // LEFT JOIN file_asset; null if file deleted
    pageNo: number | null;
    sheetRef: string | null;
    region: string | null;   // compact "x,y,w,h" built from region_json numbers
  };
}

export interface MetaRunDocument {
  fileId: string;
  steps: {                   // allow-listed copy of DrawingRunStepCounts
    inventory: number; strategy: number; text: number; selectPages: number;
    elevationRegions: number; renderCrop: number; read: number;
    placements: number; northAssumed: number;
  };
  failedPhase: string | null;
  wallMs: number | null;
  modelCalls: number | null;
}

export interface LineMetaDto {
  hasCrop: boolean;          // the crop KEY never leaves the worker (AC-26/30)
  reading: MetaReading | null;   // null = parser produced no reading (AC-7)
  run: {
    startedAt: string;                    // ai_runs.created_at
    outcome: "read" | "not_read" | null;  // this opening in perOpening (AC-17)
    document: MetaRunDocument | null;     // the ONE source document (AC-18)
  } | null;                  // null = no drawing run ever reported
}
```

What the shape forbids by absence (AC-29): no crop key, no R2 paths, no
filenames beyond the reading's own source document, no customer/contact/payout
fields, no price fields, no fields shaped for a future edit (spec: permanent).
`not_stated`/`not_read` travel as the stored words — AC-13 is satisfied by the
DTO, the skin merely prints `state` when it isn't `value`.

### 3.2 Deep module — `worker/lib/drawing/meta.ts`

Two exports, one shared scoped entry. Pattern is
`worker/lib/estimator/rationale.ts` transplanted.

```ts
export async function lineMeta(
  env: Pick<Env, "DB">, ref: { projectId: string; lineId: string },
): Promise<LineMetaDto | null>

export async function lineCropKey(
  env: Pick<Env, "DB">, ref: { projectId: string; lineId: string },
): Promise<string | null>   // null covers every refusal AND "no crop recorded"
```

The single entry SELECT — this is the availability fact, and every refusal
collapses into one `null`:

```sql
SELECT q.external_ref
  FROM quote_line q JOIN project p ON p.id = q.project_id
 WHERE q.id = ?1 AND q.project_id = ?2
   AND q.origin = 'schedule'            -- parsed line, not manual (AC-5)
   AND q.parent_line_id IS NULL         -- readings belong to the parent line
   AND p.status_internal <> 'issued'    -- "the tab dies with the crops" (AC-6)
```

Why `status_internal <> 'issued'` is the whole retention gate: the three purge
triggers are draft clear (`worker/routes/parse.ts` line 261 — which also
`DELETE FROM quote_line`, line 188, so the line lookup 404s naturally), quote
issue (`worker/lib/issue.ts` line 299, which sets `status_internal='issued'` at
line 256), and file delete (`worker/routes/files.ts` line 536 — the crops are
gone but the project is still pre-issue, so the tab survives and the Image
panel's fetch-failure state, AC-11, covers the missing object; the spec's AC-6
trigger list deliberately does not include file delete). Quote delete removes
the lines — natural 404. One status word, one column, no new state.

Latest run (AC-19 — no chooser, no history):

```sql
SELECT id, created_at, drawing_report_json FROM ai_runs
 WHERE project_id = ?1 AND drawing_report_json IS NOT NULL
 ORDER BY created_at DESC, rowid DESC LIMIT 1
```

(`rowid` tiebreak is the established `rationale.ts` precedent for same-second
runs.) Reading row: `SELECT … FROM drawing_reading WHERE project_id=? AND
ai_run_id=? AND external_ref=?` with a `LEFT JOIN file_asset` for the source
filename. No run with a report → `run: null`; no reading row → `reading: null`
— the tab still exists (AC-7), the doors still open (AC-20), the expansions
name what is missing.

Run document resolution (AC-18): parse `drawing_report_json` with the
`parse<T>` helper pattern; the opening's outcome is found by `tag ===
external_ref` across `files[].perOpening`, and the containing file — not an
aggregate — is the `document`. This also answers "which document" when
`reading` is null.

`lineCropKey` runs the same entry SELECT, then returns the latest reading's
`crop_key` (or null). The key never crosses into a response or a log.

### 3.3 Routes — `worker/routes/ops.ts`

Both placed directly after the rationale route; both thin.

```
GET /api/ops/projects/:id/lines/:lineId/meta
  resolveStaff → 403 {error:"forbidden"}          (AC-22/23/24)
  hasAssignedRole → 403 {error:"forbidden_role"}
  lineMeta(...) → dto ? c.json(dto) : c.json({error:"not_found"}, 404)   (AC-5/6/25)

GET /api/ops/projects/:id/lines/:lineId/meta/crop
  same two auth checks
  lineCropKey(...) → null → 404 {error:"not_found"}
  env.FILES.get(key) → null → 404 {error:"not_found"}     (purged: AC-27)
  logEvent(c.env, { actor: staff.id, entityType: "project", entityId: projectId,
    action: `viewed parse crop for ${externalRef}` })      (AC-28; no key in the
                                                            action string, AC-30)
  Response(obj.body, { "Content-Type": "image/png",
    "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer" })
```

`resolveStaff` (`worker/lib/staff.ts` line 155) already returns null for
`role === "manufacturer"`, so AC-22 needs no new code — only its test. No
`console.*` in either route (AC-30).

### 3.4 URL grammar — `src/ops2/projects/lineRoute.ts`

`LineView` gains `"meta" | "metaReading" | "metaRun"`. `parseLineRoute(suffix,
unitCount, hasWhy, hasMeta)` gains the fourth parameter, judged exactly as
`hasWhy` is: while the meta read is unresolved the page does not normalise, and
a `/meta*` suffix on a line with `hasMeta === false` normalises (replace) to
`""`. `/meta/reading` and `/meta/run` are valid whenever `hasMeta` — an empty
expansion is still a served address (AC-20).

New consts: `META_SUFFIX = "/meta"`, `META_READING_SUFFIX = "/meta/reading"`,
`META_RUN_SUFFIX = "/meta/run"`. One new door mark (presence-only, like
`WHY_FROM_LINE`): `META_EXP_FROM_TAB`, with reader `metaDoor(state)` — carried
by the `history.push` that opens an expansion from the Metadata tab, so a warm
dismiss pops and a cold (pasted) `/meta/reading` replaces to `/meta` (AC-21).

Tab switching is **replace, not push**: the two tabs are one page wearing two
faces, so flipping them must not grow history (the same reasoning as
normalise-by-replace, documented at `LinePage.tsx` lines 100–139). Expansions
push, exactly like `/why`.

### 3.5 LinePage wiring — `src/ops2/projects/LinePage.tsx`

- `const { load: meta } = useLineMeta(id, lineId, !!line && !isOrder);` —
  disabled on order records for D2's reason (an order is post-issue; the server
  would 404, so the client never asks). Manual lines are *not* special-cased
  client-side: the record line doesn't carry origin, and it doesn't need to —
  the 404 → `missing` → no tabs chain keeps "no tab" and "no data" one fact.
- Readiness gate becomes `load ready && rationale !== loading && meta !==
  loading`; additionally, while `meta` is loading and the live suffix starts
  with `/meta`, the page renders the existing skeleton instead of the Opening
  body — that is AC-3's "no flash", the same wait-before-normalise reasoning
  already documented at lines 124–133.
- `controls` slot: rendered only when `meta.status === "ready"` (AC-1/5/6) —
  two `.pq-chip` buttons, `data-testid="line-tab"`, `data-tab="opening"/"meta"`,
  `aria-pressed` from the parsed view, **no badge, no dot** (AC-8). Metadata
  press → `history.replace(linePath + META_SUFFIX)`; Opening press →
  `history.replace(linePath)`.
- Body: meta views render `<MetaTab …/>` in place of `<LineReview …/>`; the
  Opening body stays byte-for-byte untouched (AC-1, out-of-scope decision 3).
- `openReading`/`openWhy`-style callbacks push
  `linePath + META_READING_SUFFIX` / `META_RUN_SUFFIX` with `META_EXP_FROM_TAB`
  and record the opener element for focus return (existing `opener` ref, lines
  165–189, reused as-is).
- `closeChild` (lines 234–243): the cold-replace target becomes
  `suffix startsWith "/meta/" ? linePath + META_SUFFIX : linePath`, and
  `metaDoor` joins the `viewerDoor || whyDoor` mark check. One function keeps
  answering the one warm-or-cold question.

### 3.6 MetaTab — `src/ops2/projects/MetaTab.tsx`

Presentation only, no router import (the `DrawingViewer`/`WhyDetail` seam).
Props: `{ dto: LineMetaDto; view: "meta"|"metaReading"|"metaRun"; cropSrc:
string; onOpenReading; onOpenRun; onClose }`.

- **Image panel** (first): plain `ds-surface-card` section. `dto.hasCrop` →
  `<img src={cropSrc}>` inline at panel width, no link, no lightbox (AC-9);
  `onError` flips local state to a stated load failure while the rest of the
  tab stands (AC-11). `!hasCrop` → no `<img>` at all; the reason is
  `dto.reading?.gapCode` printed verbatim, or "no reading exists for this
  opening" when reading is null (AC-10).
- **Reading panel**: `OpenablePanel` with `open` *always* passed (AC-20
  overrides the no-door-on-empty doctrine — say so in a comment citing
  decision 12). Summary rows: heading, elevation, room, confidence, "flags:
  N present"/"none" (AC-4/12); a fact whose state isn't `value` prints the
  state word itself (AC-13). Reading null → the summary states no reading
  exists, naming `gapCode`/`reasoningParts` when recorded (AC-7).
- **Run panel**: `OpenablePanel`, door always present. Summary: `startedAt` +
  this opening's `outcome` (AC-17); `run` null → states no drawing run
  reported.
- **Two `SidePanel` expansions**, `phoneForm="screen"` (520 px desk slide-out
  comes from `SidePanel` itself): Reading expansion shows all four facts with
  states, split units (axis, role, ratio, operation, derived width), every
  flag in full, `reasoningParts` as separate lines (AC-14/15), source file
  (filename or fileId), page, sheet ref, region. Run expansion shows the
  single document's step counts table, failedPhase, wallMs, modelCalls
  (AC-18). Nothing anywhere truncates or says "+N more" (AC-16 — deliberate
  departure from `LineReview`'s Panel budget; comment cites decision 15).
  Empty expansions name what is missing (AC-20).

## 4. Sequencing

1. **T1 — server metadata read.** DTO types, `worker/lib/drawing/meta.ts`,
   the `/meta` route, `meta-api.test.mjs` (red first, per Probity), heavy-tier
   wiring. Everything after this has a real endpoint to stand on.
2. **T2 — crop endpoint.** `lineCropKey`, the `/meta/crop` route, audit row,
   purge/tamper/log tests. Extends T1's module and test file.
3. **T3 — URL grammar.** `lineRoute.ts` views + mark + normalise rules, tested
   in `ops2-navigation.test.mjs`. Pure; parallelisable with T1/T2.
4. **T4 — hook + MetaTab.** `useLineMeta`, `MetaTab.tsx`,
   `ops2-meta.test.mjs`, pure-tier wiring. Needs T1's DTO type only.
5. **T5 — LinePage integration.** Tabs, readiness gate, closeChild, body
   switch; integration cases land in `ops2-meta.test.mjs` and
   `ops2-navigation.test.mjs`. Needs T3 + T4.

## 5. Test plan

| File | Tier | Proves |
|---|---|---|
| `scripts/tests/meta-api.test.mjs` (new) | `test:heavy` (concurrency 2), patterned on `why-rationale-api.test.mjs` | DTO shape incl. verbatim state words and pre-split `reasoningParts` (AC-13/15), nullable reading/run (AC-7), latest-run-only (AC-19), per-document run report (AC-18), 404 for manual line (AC-5), issued project (AC-6), cross-project line = identical body to nonexistent line (AC-25); auth ladder for manufacturer/customer/unauthenticated on both endpoints (AC-22/23/24); crop: bytes + headers on success, audit row in `audit_event` naming staff/project (AC-28), 404 after purge with no bytes (AC-27), key never accepted from client — there is no key parameter to tamper with, asserted by route surface (AC-26); response allow-list has no payout/contact/key fields (AC-29); console capture shows no crop key or reasoning text logged (AC-30). |
| `scripts/tests/ops2-meta.test.mjs` (new) | `test:pure` (concurrency 12) + `test:ops2` | `useLineMeta` four states incl. synchronous `missing` when disabled; MetaTab: panel order and inline `<img>` (AC-9), gap-reason-not-broken-image (AC-10), fetch-failure state leaves tab standing (AC-11), summary facts (AC-4/12), state words verbatim (AC-13), expansion contents incl. split units and separate reasoning lines (AC-14/15), no truncation affordance (AC-16), run summary/expansion (AC-17/18), doors always present with named-missing expansions (AC-20); LinePage integration: tabs render only on `ready`, no badge/dot (AC-1/8), no tabs on `missing` (AC-5/6), Opening body unchanged when tabs present (AC-1). |
| `scripts/tests/ops2-navigation.test.mjs` (extended) | already in `test:pure`/`test:ops2` | Grammar: `/meta`, `/meta/reading`, `/meta/run` parse and normalise under `hasMeta` true/false (AC-2/3/5/6); tab switch replaces, expansions push; `metaDoor` warm pop vs cold replace lands on `/meta` (AC-21). |
| `package.json` | — | `test:pure` += `ops2-meta`, `test:heavy` += `meta-api`, `test:ops2` += `ops2-meta`, new `test:meta` script naming both new files. |

## 6. Security

**Data classification.** Crop evidence and reading facts are fragments and
derivations of a customer's drawings — customer commercial data (`CONTEXT.md`,
*Crop evidence*). No financial PII, no personal PII is touched, stored or
moved; no new data is written at all except one `audit_event` row per crop
view (staff id, project id, opening tag — no key, no filename).

**Trust boundaries.** One boundary: ops ↔ Worker. Validation at the crossing
is the existing staff ladder — `resolveStaff` (Cloudflare Access JWT or dev
session; returns null for manufacturer role) then `hasAssignedRole`. Worker ↔
R2 crosses inside the trust zone with a server-derived key only. Nothing here
is customer-facing; `src/` (customer app) imports nothing from this feature.

**Authorization model per endpoint.**

- `GET /api/ops/projects/:id/lines/:lineId/meta` — staff with an assigned
  role only. Scoping filter, verbatim: `WHERE q.id = :lineId AND q.project_id
  = :projectId AND q.origin = 'schedule' AND q.parent_line_id IS NULL AND
  p.status_internal <> 'issued'` (the entry SELECT in §3.2). The project-id
  bind is in the same WHERE as the line-id bind — the
  auth-present-but-query-unfiltered failure cannot occur, and wrong-project ≡
  nonexistent ≡ manual ≡ issued: one `null`, one 404 body.
- `GET /api/ops/projects/:id/lines/:lineId/meta/crop` — same ladder, same
  entry SELECT. The R2 key is read from the line's own reading row; the
  request carries no key, path or filename parameter, so there is nothing to
  tamper with (AC-26 by construction). Every successful stream writes an
  `audit_event` row (AC-28).

**Abuse cases → mechanism.**

| Abuse | Held by | AC |
|---|---|---|
| Manufacturer partner reads metadata/crop | `resolveStaff` nulls manufacturer role → 403, no fields, no bytes | 22 |
| Customer (incl. project owner) reads either endpoint | ops routes never resolve customer sessions → 403 | 23 |
| Unauthenticated request | same 403 shape as every ops route | 24 |
| Cross-project probe (`lineId` under wrong `projectId`) | single scoped SELECT → indistinguishable 404; no existence disclosure | 25 |
| Crop-key tampering / path traversal | no client-supplied key exists; key derived server-side from the scoped row | 26 |
| Reading purged evidence post-issue | status gate 404s the endpoints; R2 miss 404s with no bytes, no stack | 27, 6 |
| Covert evidence access | `logEvent` audit row per crop view | 28 |
| Data overexposure | DTO allow-list built field-by-field; no spread of stored rows; forbidden facts absent by shape | 29 |
| Sensitive values in logs | no `console.*` in routes/lib; audit action string carries the opening tag, never the key or reasoning; asserted by test | 30 |

**Residual risk.** The crop URL is guessable by staff for any line they can
already see — acceptable: it serves the same audience as the metadata JSON,
behind the same gate, and each view is audited. Enumeration across projects
yields uniform 404s.

## 7. Rejected alternatives

- **200-with-`unavailable` payload instead of 404** for manual/issued lines —
  rejected: two facts ("no tab", "no data") would need keeping in agreement;
  the spec's assumed 404 keeps them one fact (and one code path with
  wrong-project, per the rationale route's precedent).
- **A separate availability flag on the record read (`opsLineDto`)** — rejected:
  it duplicates the endpoint's own answer and fattens a DTO the rationale
  feature deliberately kept byte-identical; the extra GET per line page is the
  cheaper price.
- **Client-side `|`-splitting of `gap_note`** — rejected: AC-15 is a rule about
  the stored encoding (`conflictReason` in `readings.ts` line 112 is the
  writer); its reader belongs beside the other row-decoding in the DTO builder,
  one place per fact.
- **Sending `crop_key` in the DTO and fetching R2 by key** — rejected outright:
  violates AC-26/30 and creates a tamperable parameter for no gain.
- **`IonSegment` or a new Tab component** — forbidden by spec (no new
  components); the record page's `.pq-chips` already are the console's tab
  vocabulary.
- **Push-based tab switching** — rejected: flipping tabs would grow history and
  make back replay tab states; replace matches the page's existing
  same-page-different-face discipline. Expansions still push, so AC-21's back
  behaviour stays a plain pop.
- **Gating availability on run/reading existence** — rejected: AC-7/20 demand
  the tab and doors exist for parsed lines with nothing to show; availability
  is origin + status only.
- **A run chooser data shape "for later"** — rejected: decision 17 forbids run
  history; the DTO carries exactly one run.

## 8. Decisions needed

None. The spec's four `ASSUMED:` items all verified against the code as built:
the audit trail exists and is reachable (`logEvent` → `audit_event`, used by
the staff download route at `ops.ts:2289`); `status_internal <> 'issued'`
expresses "the tab dies with the crops" without new state; the per-opening
outcome list exists in `drawing_report_json` (`DrawingFileReport.perOpening`);
draft clear deletes the quote lines so that trigger needs no gate at all.
`DECISIONS.md` is not created.
