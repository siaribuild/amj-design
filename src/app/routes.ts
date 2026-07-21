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
  dashboard: "/dashboard",
  quotes: "/quotes",
  "projects-orders": "/projects",
  support: "/support",
  "track-order": "/track-order",
  profile: "/profile",
  "account-settings": "/account-settings",
  order: "/order",
  privacy: "/privacy",
};

// Legacy paths kept working after the account-area IA change.
const LEGACY_ROUTES = new Map<string, Page>([["/orders", "projects-orders"]]);

const STATIC_ROUTES = new Map<string, Page>(
  Object.entries(PAGE_PATHS)
    .filter(([page]) => page !== "product-detail")
    .map(([page, path]) => [path, page as Page]),
);

function normalizePathname(pathname: string) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

export function routeFromPathname(pathname: string): { page: Page; productSlug?: string } {
  const normalized = normalizePathname(pathname);
  const staticPage = STATIC_ROUTES.get(normalized) ?? LEGACY_ROUTES.get(normalized);
  if (staticPage) return { page: staticPage };

  const productMatch = normalized.match(/^\/products\/([^/]+)$/);
  if (productMatch) {
    return { page: "product-detail", productSlug: decodeURIComponent(productMatch[1]) };
  }

  return { page: "home" };
}

export function pathForPage(page: Page, productSlug?: string) {
  if (page === "product-detail" && productSlug) {
    return `/products/${encodeURIComponent(productSlug)}`;
  }
  return PAGE_PATHS[page];
}
