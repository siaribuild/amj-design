import { hydrateFromSanity } from "../data/sanity";

/**
 * THE CATALOGUE, STARTED AT BOOT AND AWAITED ONLY WHERE IT IS NEEDED.
 *
 * Every row of a project record draws its opening — `Elevation` resolves the
 * family through `getProductBySlug(productSlug)` — so a record rendered before
 * the catalogue lands draws the fallback frame on every line, which is a
 * picture of eighteen identical windows for a job that has none. That is a real
 * problem and it is why the first version of this AWAITED HYDRATION BEFORE
 * MOUNTING THE CONSOLE.
 *
 * Measured, that cost every page load of ops2 ~2.9 seconds before anything
 * rendered at all — `hydrateFromSanity()` races a 2500ms timeout, and an
 * environment that cannot reach Sanity pays the whole cap every time. The
 * console showing nothing for three seconds because a CMS is slow is a worse
 * failure than the one being prevented, and it punished every destination for a
 * dependency only one surface has.
 *
 * So the request STARTS at boot and the console mounts immediately; the record
 * waits for this promise before it leaves its loading state. Nothing flips
 * after paint, because the surface that would flip has not painted yet — and
 * Attention, Products, Pricing and the queue open at once, as they always did.
 *
 * It never rejects: `hydrateFromSanity` swallows its own failures and this
 * catches anything left, so a waiter is a delay and never a broken screen. The
 * console then runs on the built-in catalogue, which resolves every slug the
 * snapshot knows and falls through to a fixed frame for one it does not.
 */
export const catalogueReady: Promise<void> = hydrateFromSanity()
  .then(() => undefined)
  .catch(() => undefined);
