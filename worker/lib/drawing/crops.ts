// Crop evidence — the ONE place the R2 prefix and its lifecycle live
// (02-design-v2.md §7). Own prefix, not `runs/`: `runs/` is purged only on
// file-delete, one of the three triggers, and also holds stage archives with
// a different lifecycle.
//
// `purgeProjectCrops`'s interface is `(env, projectId)` and nothing else —
// no request, no session, no Hono context. That is a hard constraint, not
// style: the Worker's `scheduled()` handler (`worker/index.ts`) is the likely
// caller of the still-unbuilt third trigger (voiding a quote, owner-ruled
// 2026-08-29 as in-scope-eventually, out-of-scope here), and a scheduled
// sweep has an `Env` and a project id and nothing more to hand this function.
// When void lands, it attaches in one line; nothing here changes.
//
// THREE TRIGGERS WIRED (§7): draft cleared, quote issued. THE FOURTH IS NOT:
// voiding/cancelling a quote has no route, no status transition and no sweep
// in this codebase today — this feature builds none of them. A control wired
// to nothing is a recorded defect class here, so nothing is wired for it;
// only this seam is.
import type { Env } from "../../types";
import { purgeR2Prefix } from "../../routes/files";

const safeSeg = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);

export function cropKey(projectId: string, runId: string, tag: string): string {
  return `projects/${safeSeg(projectId)}/crops/${safeSeg(runId)}/${safeSeg(tag)}.png`;
}

/** Deletes every crop the project has ever produced, across every run —
 *  the whole review window's worth, which is what "the draft cleared" and
 *  "the quote issued" both mean to end.
 *
 *  AND THE HARVEST CACHE, for the same reason and on the same triggers. The
 *  harvest is not metadata: it holds page text excerpts, the words beside each
 *  tag, room-label candidates and datum strings — verbatim text lifted from the
 *  customer's drawings, across the whole document. A crop is one opening; the
 *  harvest is the drawing set. It was surviving quote-issue and draft-clear,
 *  deleted only when the source PDF itself was deleted, which is not what the
 *  retention ruling says (owner, 2026-08-29; CONTEXT.md "Crop evidence").
 *
 *  `runs/harvest/` and NOT `runs/`: that prefix also holds stage archives with
 *  a different lifecycle, pinned by the test above requiring them to survive.
 *  Worth stating because the fix on the conformance line purges
 *  `projects/<id>/harvest/`, which is where THAT line writes it — copied here
 *  unchanged it would have matched nothing and deleted nothing. */
export async function purgeProjectCrops(env: Env, projectId: string): Promise<void> {
  await purgeR2Prefix(env.FILES, `projects/${safeSeg(projectId)}/crops/`);
  await purgeR2Prefix(env.FILES, `projects/${safeSeg(projectId)}/runs/harvest/`);
}
