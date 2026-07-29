import type { Page } from "./ui";

export const PAGE_PATHS: Record<Page, string> = {
  home: "/",
  products: "/products",
  "product-detail": "/products",
  quote: "/quote",
  "how-it-works": "/how-it-works",
  resources: "/resources",
  contact: "/contact",
  admin: "/admin",
  "approved-quote": "/quote/approved",
  trade: "/trade-account",
  login: "/login",
  dashboard: "/projects", // the merged account home ("My Projects")
  account: "/account",
  help: "/help",
  "track-order": "/track-order",
  order: "/order",
  privacy: "/privacy",
  // An article under the resources index. Same relationship product-detail has to
  // /products: a slug route, so it is excluded from the static map below.
  resource: "/resources",
};

// Legacy paths kept working after the account-area IA collapse (Dashboard+Projects
// → one "My Projects" home; Profile+Settings → Account; Support → Help).
const LEGACY_ROUTES = new Map<string, Page>([
  ["/dashboard", "dashboard"],
  ["/orders", "dashboard"],
  ["/quotes", "dashboard"],
  ["/support", "help"],
  ["/profile", "account"],
  ["/account-settings", "account"],
]);

const STATIC_ROUTES = new Map<string, Page>(
  Object.entries(PAGE_PATHS)
    .filter(([page]) => page !== "product-detail" && page !== "resource")
    .map(([page, path]) => [path, page as Page]),
);

function normalizePathname(pathname: string) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

export function routeFromPathname(pathname: string): { page: Page; productSlug?: string; resourceSlug?: string } {
  const normalized = normalizePathname(pathname);
  const staticPage = STATIC_ROUTES.get(normalized) ?? LEGACY_ROUTES.get(normalized);
  if (staticPage) return { page: staticPage };

  const productMatch = normalized.match(/^\/products\/([^/]+)$/);
  if (productMatch) {
    return { page: "product-detail", productSlug: decodeURIComponent(productMatch[1]) };
  }

  const resourceMatch = normalized.match(/^\/resources\/([^/]+)$/);
  if (resourceMatch) {
    return { page: "resource", resourceSlug: decodeURIComponent(resourceMatch[1]) };
  }

  return { page: "home" };
}

/** `slug` is the record slug for the two routes that have one — a product, or a
 *  resource. Everything else ignores it and returns its static path. */
export function pathForPage(page: Page, slug?: string) {
  if (page === "product-detail" && slug) {
    return `/products/${encodeURIComponent(slug)}`;
  }
  if (page === "resource" && slug) {
    return `/resources/${encodeURIComponent(slug)}`;
  }
  return PAGE_PATHS[page];
}
