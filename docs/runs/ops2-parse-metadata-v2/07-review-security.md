# Security Review — `feat/ops2-parse-metadata-v2` (base `4374270e`)

**Scope reviewed:** the 9 branch commits, 29 changed files. Code surface is small: `worker/lib/drawing/meta.ts` (new), `worker/routes/ops.ts` (+42), `src/data/lineMeta.ts`, `src/ops2/projects/{MetaTab.tsx,useLineMeta.ts,LinePage.tsx,lineRoute.ts}`, one CSS block, plus test/docs/mock files. (The harness `FILES MODIFIED` list enumerated the whole tree; the actual diff against `4374270e` is the list above.)

## Findings

**No HIGH or MEDIUM severity findings.**

## What was checked and cleared

**Authorization — new endpoints `GET /api/ops/projects/:id/lines/:lineId/meta` and `.../meta/crop`** (`worker/routes/ops.ts:752-790`)
Both open with the repo's established staff ladder — `resolveStaff` then `hasAssignedRole`, 403 on either — identical to the adjacent `/rationale` route. No unauthenticated path, no role gap.

**IDOR / object-scoping on the crop stream** (`worker/routes/ops.ts:770-790`, `worker/lib/drawing/meta.ts` `lineCropKey`)
The R2 key is never accepted from the request. It is resolved server-side through `entryLine` (line scoped by `q.id = ?1 AND q.project_id = ?2`, plus `origin='schedule'`, `parent_line_id IS NULL`, `p.status_internal <> 'issued'`), then `latestRun` scoped by `project_id`, then `canonicalReading` scoped by `project_id + ai_run_id + external_ref`. A caller cannot address another project's object, and cross-project confusion is closed by both endpoints sharing one `canonicalReading`. Missing object → 404, not a key echo.

**SQL injection** (`worker/lib/drawing/meta.ts`)
All four statements are `prepare(...).bind(...)` with positional parameters. No string interpolation into SQL anywhere in the diff.

**Response headers on the streamed PNG** (`worker/routes/ops.ts:783-789`)
`Content-Type: image/png`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`. Content sniffing and shared-cache leakage of the parse crop are both closed.

**Data exposure via the DTO** (`worker/lib/drawing/meta.ts` `documentOf`)
Field-by-field allow-list rather than a spread-plus-cast, with the crop **key** deliberately excluded from the response (only `hasCrop`). Stored blobs (`split_json`, `flags_json`, `region_json`, `drawing_report_json`) are parsed and re-projected, never forwarded raw. `parse<T>` swallows malformed JSON to `null` instead of throwing — no stack/500 leakage.

**XSS** (`MetaTab.tsx`, `LinePage.tsx`)
All parser-derived strings (`gapCode`, `reasoningParts`, flags, correction reasons, filenames, `failureKind`, warnings) render as React text children. No `dangerouslySetInnerHTML`, no `href`/`src` built from parser output. `cropSrc` is composed only from route params, each `encodeURIComponent`-wrapped (`LinePage.tsx`, `useLineMeta.ts`).

**Client-side route gating** (`lineRoute.ts`, `useLineMeta.ts`)
`hasMeta`/`hasWhy` govern rendering only; every read is re-authorized server-side. Client validators (`isLineMetaDto`) are crash-avoidance, not a trust boundary — correct placement.

**Credentials** (`scripts/tests/helpers.mjs:53-60`)
Adds `CLOUDFLARE_API_TOKEN: "wrangler-local-dev-not-a-real-credential"` and a Cloudflare account ID for `wrangler --local`. Test-harness only, token is a placeholder, account ID is the public hash already present in the committed container image ref in `wrangler.jsonc`. Not a secret.