// TESTER FINDING (ops2 "Why this product" Phase 1) — the orphaned reader.
//
// `OpsThermalProposed.source` (src/ops/api.ts) was rendered by
// src/ops/ProjectRecord.tsx as an "estimated" caption beneath the thermal
// figures. worker/routes/ops.ts filled it from exactly two producers:
//
//   perf.source      <- performance_json,             worker/lib/ai/proposal.ts
//   snapshot.source  <- configuration_snapshot_json,  worker/lib/estimator/splitCandidates.ts
//
// Phase 1 removed the key from BOTH, which would have left the caption
// rendering only for rows written before the deploy — the same column meaning
// two different things depending on when it was written, and a staff reader
// unable to tell "not estimated" from "written after the deploy".
//
// RESOLVED BY DELETING THE READER, not by restoring a producer. `source` is
// `certified | estimated`: the exact vocabulary the owner ruled has no value
// ("products have a single source! That's in their thermal properties").
// Keeping a producer alive would preserve, inside legacy ops, the concept this
// phase exists to remove — so the caption goes with it. R18 is not in tension
// with this: history keeps its stored values, and no run rewrites a row. What
// is removed is a SURFACE that could no longer tell two states apart.
//
// This suite is that claim, executed from both ends: nothing reads the field,
// nothing serves it, nothing declares it, and nothing writes it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { projectRoot } from "./helpers.mjs";

const read = (rel) => readFile(join(projectRoot, rel), "utf8");
// Only live code counts: the reasoning above is recorded in the source on
// purpose, and a scan that punished the explanation would teach people to
// delete it.
const live = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("no ops surface renders a thermal `source` caption", async () => {
  const record = live(await read("src/ops/ProjectRecord.tsx"));
  // Non-vacuity: the table the caption sat in is still here, so a pass means
  // the caption was removed rather than the whole surface.
  assert.match(record, /perfText\(r\.proposed\)/, "the thermal table still renders the proposed figures");
  assert.ok(!/proposed\?\.source/.test(record), "and no longer branches on a data source");
  assert.ok(!/>estimated</.test(record), "and draws no estimated caption");
});

test("the ops thermal route serves no `source`, because nothing writes one", async () => {
  const route = live(await read("worker/routes/ops.ts"));
  assert.match(route, /uw: \(perf \? n\(perf\.uw\) : null\)/, "the route still serves the figures themselves");
  assert.ok(!/source: \(perf \? s\(perf\.source\)/.test(route), "but resolves no data source");
});

test("the ops API contract declares no `source` on a proposed configuration", async () => {
  const api = live(await read("src/ops/api.ts"));
  const block = /export interface OpsThermalProposed \{([\s\S]*?)\}/.exec(api);
  assert.ok(block, "OpsThermalProposed is still declared");
  assert.match(block[1], /uw: number \| null/, "and still carries the figures");
  assert.ok(!/\bsource\b/.test(block[1]), "but declares no `source` member");
});

test("neither producer writes a `source` key back into a stored snapshot", async () => {
  // The removal that started this, asserted from the writing end so a future
  // change cannot re-introduce a producer with no reader, or a reader with no
  // producer — the split that made this a finding in the first place.
  const perfObject = /const performance = variant \? \{([\s\S]*?)\} : null;/.exec(
    await read("worker/lib/ai/proposal.ts"));
  assert.ok(perfObject, "found the performance_json builder");
  assert.ok(!/\bsource\s*:/.test(perfObject[1]), "performance_json carries no data source");
  assert.match(perfObject[1], /certificationRef/, "the WERS reference, which STAYS, is still written");

  const snapshotBlock = /variantId: variant\?\.variantId \?\? null,([\s\S]{0,400})/.exec(
    await read("worker/lib/estimator/splitCandidates.ts"));
  assert.ok(snapshotBlock, "found the configurationSnapshot builder");
  assert.ok(!/\bsource\s*:/.test(snapshotBlock[1]), "the unit snapshot carries no data source");
});
