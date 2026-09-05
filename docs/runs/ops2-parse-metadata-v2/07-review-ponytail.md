`package.json:L42: delete: duplicate `"test:meta"` key — identical to L19. Second silently wins in every JSON parser. Nothing replaces it.`

`useLineMeta.ts:L101-119: delete: the "THE DECODING SEAM" doc block is written twice, L29-43 and L101-119, same three paragraphs reworded. Keep one, on `isLineMetaDto`.`

`useLineMeta.ts:L44-131: yagni: 88 lines re-declaring a contract that already exists as `LineMetaDto` and is built field-by-field by `worker/lib/drawing/meta.ts`. Two predicates deep (`isSteps`, `isDocument`, `objArray`, `STEP_GROUPS`) is a second copy of the DTO that must be edited in lockstep — the comments admit it has already drifted twice, which argues against it, not for it. Keep the top-level `obj(dto) && typeof dto.hasCrop === "boolean"` guard; guard the four dereferences in `MetaTab` that actually throw (`reading.flags`, `split.units`, `steps.*`, `corrections`) with `?.`/`?? []`.`

`worker/lib/drawing/meta.ts:L263-287: shrink: 25 comment lines, three stacked revision narratives ("A DECLINED ROW…", "A GAP CODE IS…", "THE RUN'S OWN VERDICT…"), for one 2-line rule. One paragraph: "decline = a gap code plus either nothing read off the drawing or the run's own `not_read`."`

`worker/lib/drawing/meta.ts:L248-250: delete: second "EVERY FIELD ON EVERY RETURN" paragraph restates L244-247 verbatim. Nothing replaces it.`

`lineRoute.ts:L204-217: shrink: three identical `if (suffix === X) return hasMeta ? at(…) : at("line",…)` branches. `const META = {[META_SUFFIX]:"meta",[META_READING_SUFFIX]:"metaReading",[META_RUN_SUFFIX]:"metaRun"} as const;` then one branch, 3 lines.`

`lineRoute.ts:L193-196: delete: `hasMeta: boolean = false` and its comment "LinePage does not feed this yet (next task)" — LinePage.tsx:L116-120 feeds it now. Comment is false; make the param required like `hasWhy`.`

`MetaTab.tsx:L18,L24-32: shrink: `ImagePanelView` discriminated union for a four-branch function. Return `string | null` — null shows the image, a string is the reason. Drops the type, the `view.img` branch and two of the three single-use message constants.`

Scope, not lines: `docs/mocks/ai-parse-monitoring.html` + `docs/runs/ai-parse-monitoring/*` — 2449 lines of a **different** feature's grill/spec/design/tasks/UX, one commit (d894fb25), riding this branch. Not this feature's record; belongs on its own branch.

`net: -113 lines possible.` (plus 2449 lines of unrelated docs off this branch)