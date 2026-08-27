// ═══════════════════════════════════════════════════════════════════════════════
// THE PLAN-PARSE CONTAINER — the Worker's side of the contract
//
// The container renders pages and cuts rectangles. That is all it does, and the
// division is deliberate: every judgement lives here, in the Worker, where it is
// testable without Docker and where the machinery for retries, escalation and
// run records already exists.
//
// WHAT THE CONTAINER DOES NOT HAVE, and must not be given:
//   - R2 or D1 credentials. The Worker holds both bindings natively; a container
//     doing its own I/O needs keys, which is a new blast radius in a product
//     holding payout details. The PDF goes in over the wire, the crops come back
//     over the wire, and the Worker writes both ends.
//   - The vision call. It stays in the Worker so it reuses jobs/stage/escalation
//     and so progress reaches D1 without the container reaching D1 — and because
//     a container awaiting a model bills a GiB-second per second at zero CPU.
//   - An opinion. A crop it cannot make is reported, never substituted.
// ═══════════════════════════════════════════════════════════════════════════════
import type { CropBox } from "./crop";

/** One opening's crop, as the Worker knows it before asking. `box` is null when
 *  `cropBoxFor` would not vouch for the region — which is a gap, not a default. */
export interface CropIntent {
  /** The opening's tag. Echoed back so a crop can be matched to its row. */
  id: string;
  pageNo: number;
  box: CropBox | null;
}

export interface CropPage {
  pageNo: number;
  crops: { id: string; box: CropBox }[];
}

export interface CropRequest {
  scale: number;
  pages: CropPage[];
  /** Openings with no usable box. Named so they can be recorded as `not read`
   *  rather than disappearing between two systems. */
  gaps: string[];
  /** Openings beyond this call's cap, for the caller's next batch. */
  deferred: string[];
}

// There is no `shouldCall` helper. `req.pages.length > 0` is the check, and it
// matters: a container call is a cold start and a bill, so a batch that came out
// all gaps — a document whose drawings show none of its openings — must not pay
// either to be told so.

/** How many crops one call may return.
 *
 *  The response carries PNG bytes per crop, and the Worker has 128 MB. At the
 *  ~900px-wide crops this pipeline produces that is a few hundred KB each, so a
 *  document with hundreds of openings would build a response nothing can hold.
 *  Batching is the caller's job; discovering the limit in production is not.
 *
 *  ponytail: one number, not a byte budget. A byte budget needs the sizes before
 *  they exist, which means asking the container to guess, which is the thing
 *  this file exists to avoid. */
export const MAX_CROPS_PER_CALL = 24;

/**
 * Group one batch of openings into a request the container can serve.
 *
 * Grouped BY PAGE because rendering is the expensive half: an A3 elevation at
 * working DPI is the cost, and cutting four rectangles out of it afterwards is
 * free. Sending four independent crop requests for one page renders it four
 * times.
 *
 * Ordered by page then by the caller's order, so the same batch produces a
 * byte-identical request every time — which is what makes a retry safe to
 * deduplicate and a response safe to cache.
 */
export function buildCropRequest(intents: CropIntent[], scale: number): CropRequest {
  const gaps: string[] = [];
  const usable: CropIntent[] = [];
  for (const intent of intents) {
    if (intent.box) usable.push(intent);
    else gaps.push(intent.id);
  }

  const taken = usable.slice(0, MAX_CROPS_PER_CALL);
  const deferred = usable.slice(MAX_CROPS_PER_CALL).map((i) => i.id);

  const byPage = new Map<number, { id: string; box: CropBox }[]>();
  for (const { id, pageNo, box } of taken) {
    const page = byPage.get(pageNo) ?? [];
    page.push({ id, box: box as CropBox });
    byPage.set(pageNo, page);
  }

  const pages = [...byPage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pageNo, crops]) => ({ pageNo, crops }));

  return { scale, pages, gaps, deferred };
}
