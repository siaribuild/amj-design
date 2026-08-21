import { useEffect, useState } from "react";

interface Brand { logo: string | null; businessName: string | null }

const NO_BRAND: Brand = { logo: null, businessName: null };

/**
 * ONE request per document, shared by every caller — the same rule and the same
 * measurement as account.ts: the rail and the content top bar both render the
 * wordmark, and before this the brand was fetched twice on every load.
 *
 * Not staff-gated (worker/routes/ops.ts serves it to the sign-in screen too),
 * so it answers in local dev as well as behind Access — and when Sanity has no
 * settings it answers with two nulls, which is a real state and not an error.
 */
let pending: Promise<Brand> | null = null;

function fetchBrand(): Promise<Brand> {
  pending ??= fetch("/api/ops/brand", { credentials: "same-origin" })
    .then((res) => (res.ok ? (res.json() as Promise<Partial<Brand>>) : null))
    .then((body) => ({ logo: body?.logo ?? null, businessName: body?.businessName ?? null }))
    // The wordmark below is the fallback, not a failure state.
    .catch(() => NO_BRAND);
  return pending;
}

function useBrand(): Brand {
  const [brand, setBrand] = useState<Brand>(NO_BRAND);
  useEffect(() => {
    let live = true;
    void fetchBrand().then((next) => { if (live) setBrand(next); });
    return () => { live = false; };
  }, []);
  return brand;
}

/**
 * The console's identity: a mark, the name, and `OPS` as a smaller suffix.
 *
 * THE LADDER IS logo → business name → the literal word "OpenFrame", and it is
 * not a nicety: register row 4 BANS AN INVENTED MARK. Drawing a frame glyph
 * here because the owner's screenshot shows one would be inventing a logo for a
 * business that has one — so the icon slot renders the real logo when the brand
 * is configured and renders nothing when it is not, rather than a stand-in.
 *
 * `OPS` is always present regardless of which rung the ladder lands on. It is
 * what distinguishes this console from the customer site at a glance, and both
 * are served from the same brand.
 */
export function Wordmark({ className }: { className?: string }) {
  const { logo, businessName } = useBrand();
  return (
    <span className={className ? `ops2-wordmark ${className}` : "ops2-wordmark"}>
      {logo && <img className="ops2-wordmark__logo" src={logo} alt="" aria-hidden="true" />}
      <span className="ops2-wordmark__name">{businessName ?? "OpenFrame"}</span>
      <span className="ops2-wordmark__suffix ds-type-label-md">OPS</span>
    </span>
  );
}
