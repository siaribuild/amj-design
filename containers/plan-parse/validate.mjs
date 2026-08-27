// What the container will and will not attempt.
//
// Pure and separate so it can be tested in the repo's own suite — the image
// cannot be built on every machine that touches this, and validation is the last
// thing that should only exist inside something nobody can run.
//
// The Worker builds these requests and clamps every box before sending. The
// container checks anyway: "trusted" and "unchecked" are different things, and
// this is the only thing standing between a malformed rectangle and a native
// renderer.

/** Bounds, all of them the same argument: a number that arrives from outside
 *  decides how much memory this process allocates.
 *
 *  `scale` is the sharp one. It multiplies BOTH page dimensions, so an A3 sheet
 *  at scale 50 is not fifty times the work, it is two and a half thousand times
 *  — an instant out-of-memory rather than a slow render. 6 is generous against
 *  the 3 in use.
 *
 *  The page and crop caps are deliberately looser than the Worker's own
 *  MAX_CROPS_PER_CALL. The Worker's cap is the operating limit; these are the
 *  point past which the request did not come from the Worker at all. */
const MAX_SCALE = 6;
const MAX_PAGES = 20;
const MAX_CROPS = 64;

const isBox = (b) =>
  !!b
  && ["left", "top", "width", "height"].every((k) => Number.isInteger(b[k]))
  && b.width > 0 && b.height > 0 && b.left >= 0 && b.top >= 0;

/** @returns {string | null} why it was refused, or null when it is acceptable. */
export function badRequest(job) {
  if (!job || typeof job !== "object") return "not an object";
  if (!(job.scale > 0)) return "scale must be positive";
  if (job.scale > MAX_SCALE) return `scale above ${MAX_SCALE} is an allocation, not a render`;
  if (!Array.isArray(job.pages) || job.pages.length === 0) return "no pages";
  if (job.pages.length > MAX_PAGES) return `more than ${MAX_PAGES} pages in one call`;

  let crops = 0;
  for (const page of job.pages) {
    if (!Number.isInteger(page.pageNo) || page.pageNo < 1) return "bad pageNo";
    if (!Array.isArray(page.crops) || page.crops.length === 0) return "a page with no crops";
    crops += page.crops.length;
    if (crops > MAX_CROPS) return `more than ${MAX_CROPS} crops in one call`;
    for (const c of page.crops) {
      if (typeof c.id !== "string" || !c.id) return "a crop with no id";
      if (!isBox(c.box)) return "a box that is not a positive integer rectangle";
    }
  }
  return null;
}
