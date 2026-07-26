// schema.org JSON-LD, GENERATED from the data we already hold rather than
// hand-authored in the CMS — hand-written structured data drifts from the content
// it describes the first time someone edits one and not the other. Editors only
// declare what a record IS (seoMeta → Schema.org → "This record is a…").
//
// Output is a single @graph so the nodes can reference each other by @id: the
// page/product node points at the organisation, the organisation is stated once.
//
// Adding a record kind (e.g. a future `post`) means adding one entry to
// KIND_DEFAULTS and, if it has its own fields, one branch in buildRecordNode —
// nothing else in the pipeline is kind-aware.
import type { SeoMeta } from "./catalogue";

export type RecordKind = "page" | "product" | "post";

/** What each record kind is, absent an explicit choice on the record. */
const KIND_DEFAULTS: Record<RecordKind, string> = {
  page: "WebPage",
  product: "Product",
  post: "Article",
};

export interface OrgIdentity {
  name?: string | null;
  url?: string | null;
  logoUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Profile URLs — how search engines tie the accounts to the business. */
  sameAs?: string[] | null;
  /** Organization | LocalBusiness | Corporation. */
  type?: string | null;
}

export interface RecordFacts {
  kind: RecordKind;
  url: string;
  name: string;
  description?: string;
  image?: string;
  /** Product only. */
  brand?: string;
  sku?: string;
  /** Post only, ISO-8601. */
  datePublished?: string;
  dateModified?: string;
  author?: string;
}

export interface Breadcrumb { name: string; url: string }

type Node = Record<string, any>;

/** Drops empty/blank members so no key is emitted with a meaningless value. */
function compact(node: Node): Node {
  const out: Node = {};
  for (const [k, v] of Object.entries(node)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

const ORG_ID = "#organization";
const SITE_ID = "#website";

export function buildOrganization(org: OrgIdentity): Node | null {
  if (!org.name) return null;   // no invented business identity
  return compact({
    "@type": org.type || "Organization",
    "@id": ORG_ID,
    name: org.name,
    url: org.url || undefined,
    logo: org.logoUrl || undefined,
    email: org.email || undefined,
    telephone: org.phone || undefined,
    sameAs: (org.sameAs ?? []).filter(Boolean),
  });
}

export function buildWebSite(org: OrgIdentity): Node | null {
  if (!org.name || !org.url) return null;
  return compact({
    "@type": "WebSite",
    "@id": SITE_ID,
    name: org.name,
    url: org.url,
    publisher: { "@id": ORG_ID },
  });
}

export function buildBreadcrumbs(trail: Breadcrumb[]): Node | null {
  if (trail.length < 2) return null;   // a single crumb is not a trail
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => compact({
      "@type": "ListItem", position: i + 1, name: c.name, item: c.url,
    })),
  };
}

/** The node for the record itself. `schemaType` overrides the kind default. */
export function buildRecordNode(facts: RecordFacts, schemaType?: string): Node {
  const type = schemaType && schemaType !== "auto" ? schemaType : KIND_DEFAULTS[facts.kind];
  const base = compact({
    "@type": type,
    "@id": facts.url,
    name: facts.name,
    description: facts.description,
    image: facts.image,
    url: facts.url,
  });

  if (type === "Product") {
    // NOTE: deliberately no `offers`. Pricing lives in private D1 and must never
    // reach the public catalogue — publishing a price here would leak it into
    // search results and contradict the quote-on-review model.
    return compact({ ...base, sku: facts.sku, brand: facts.brand ? { "@type": "Brand", name: facts.brand } : undefined });
  }
  if (type === "Article") {
    return compact({
      ...base,
      headline: facts.name,
      datePublished: facts.datePublished,
      dateModified: facts.dateModified || facts.datePublished,
      author: facts.author ? { "@type": "Person", name: facts.author } : { "@id": ORG_ID },
      publisher: { "@id": ORG_ID },
    });
  }
  return compact({ ...base, isPartOf: { "@id": SITE_ID } });
}

/** The whole graph for one page render, or null when there is nothing to say. */
export function buildJsonLd(args: {
  org: OrgIdentity;
  facts?: RecordFacts | null;
  seo?: SeoMeta | null;
  breadcrumbs?: Breadcrumb[];
}): Node | null {
  const graph: Node[] = [];
  const organization = buildOrganization(args.org);
  const website = buildWebSite(args.org);
  if (organization) graph.push(organization);
  if (website) graph.push(website);

  // A record can opt out of its OWN node; the organisation still stands, since
  // that describes the business rather than the page.
  if (args.facts && !args.seo?.schema?.exclude) {
    graph.push(buildRecordNode(args.facts, args.seo?.schema?.schemaType));
    const crumbs = buildBreadcrumbs(args.breadcrumbs ?? []);
    if (crumbs) graph.push(crumbs);
  }

  if (!graph.length) return null;
  return { "@context": "https://schema.org", "@graph": graph };
}
