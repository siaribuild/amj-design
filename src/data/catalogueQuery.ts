// Shared Sanity GROQ for the catalogue — one round-trip returning everything in
// the exact shape hydrateCatalogue() expects. Options are dereferenced from the
// shared `option` documents (so name/price/type live in ONE place), and colours
// come from the "applies to all" option type. Imported by both the client
// (src/data/sanity.ts) and the Worker (worker/lib/catalogue.ts) so the query +
// normalization stay in one place.
import type { Category, Family, Product, ProductOption, CatalogueData, SitePage, SeoMeta, ShowroomLocation } from "./catalogue";

// One definition of the SEO projection. Products, pages AND Site Settings all
// request it; three hand-copies would drift the first time a field is added.
export const SEO_PROJECTION = `seo{
      metaTitle, metaDescription, keywords, canonicalUrl, noIndex, noFollow,
      "openGraph": openGraph{ title, description, type, "image": image{ "url": asset->url, hotspot } },
      "twitter": twitter{ card, title, description, creator, "image": image{ "url": asset->url, hotspot } },
      "advanced": advanced{
        noArchive, noSnippet, noImageIndex, maxSnippet, maxImagePreview, maxVideoPreview,
        "additionalMeta": additionalMeta[]{ name, content }
      },
      "schema": schema{ schemaType, exclude }
    }`;

// NOTE: option PRICES are deliberately absent from this query. Sanity maps which
// options a product offers and which one is standard for it; D1 owns what each
// non-standard option costs (pricing_option_surcharge). The catalogue is served
// publicly to every browser, so a price here is a published price list.
export const CATALOGUE_QUERY = `{
  "categories": *[_type=="category"]|order(name asc){
    "id":_id, "slug":slug.current, name, shortDescription, description
  },
  "families": *[_type=="family"]|order(name asc){
    "id":_id, "slug":slug.current, "categorySlug":category->slug.current, name, aliases, shortDescription, description
  },
  "products": *[_type=="product"]|order(featuredOrder asc){
    "id":_id, "slug":slug.current, name,
    "familySlug":family->slug.current, "categorySlug":category->slug.current,
    shortDescription, descriptionParagraphs, standardGlass, hardware,
    minWidth, minHeight, maxWidth, maxHeight, profileThickness, airTightness,
    waterTightness, windPressure, notes,
    "heroImage": heroImage{ "url": asset->url, hotspot, "lqip": asset->metadata.lqip, "aspect": asset->metadata.dimensions.aspectRatio },
    "gallery": gallery[]{ "url": asset->url, hotspot, "lqip": asset->metadata.lqip },
    keySpecs[]{_key,label,value}, specs[]{_key,label,value},
    "options": options[]{
      availability,
      "typeSlug": option->optionType->slug.current,
      "typeName": option->optionType->name,
      "name": option->name,
      "hex": option->hex
    },
    featuredOrder,
    "seo": ${SEO_PROJECTION}
  },
  "colours": *[_type=="option" && optionType->appliesToAll==true]|order(isDefault desc, name asc){
    "name": name,
    "availability": select(isDefault == true => "standard", "optional"),
    "hex": hex
  },
  "pages": *[_type=="page"]|order(_updatedAt desc){
    pageId,
    "heroImage": heroImage{ "url": asset->url, hotspot, "lqip": asset->metadata.lqip, "aspect": asset->metadata.dimensions.aspectRatio },
    "seo": ${SEO_PROJECTION}
  },
  "locations": *[_type=="showroomLocation"]|order(stateCode asc, suburb asc){
    "id":_id, stateCode, suburb, displayName, lat, lng, appointmentAvailable, status, historicalAliases
  },
  "postCategories": *[_type=="postCategory"]|order(order asc, title asc){
    "id":_id, "slug":slug.current, title, order, description, dateDisplay, allowsProducts
  },
  "posts": *[_type=="post" && defined(slug.current)]|order(publishedAt desc, title asc){
    "id":_id, "slug":slug.current, title, summary,
    // Denormalised deliberately: a card renders the category name and a date,
    // and resolving the reference per card would mean holding the category
    // list in every component that draws one.
    "categorySlug": category->slug.current, "categoryTitle": category->title,
    "categoryDateDisplay": category->dateDisplay,
    "productSlugs": products[]->slug.current,
    "heroImage": heroImage{ "url": asset->url, hotspot, "lqip": asset->metadata.lqip, "aspect": asset->metadata.dimensions.aspectRatio },
    publishedAt, updatedAt,
    "attachment": attachment{
      label, docType, revision, revisedAt, standardRef, note,
      "url": file.asset->url,
      "ext": upper(file.asset->extension),
      "size": file.asset->size
    },
    ${SEO_PROJECTION}
  }
}`;

// The BODY, fetched only when an article page opens. Portable text for every
// post riding the catalogue query would make every page on the site pay for
// a route most visitors never open. One round-trip on the page that needs it.
export const POST_BODY_QUERY = `*[_type=="post" && slug.current==$slug][0]{
  "body": body[]{
    ...,
    _type == "image" => { "url": asset->url, "lqip": asset->metadata.lqip, alt, caption }
  }
}`;

export interface RawCataloguePayload {
  postCategories?: any[];
  posts?: any[];
  categories: Category[];
  families: Family[];
  products: any[];
  colours: { name: string; hex?: string | null; availability: string; price?: number | null }[];
  pages: any[];
  locations?: any[];
}

function normalizeOption(o: any): ProductOption {
  return {
    typeSlug: o.typeSlug ?? "", typeName: o.typeName ?? "", name: o.name ?? "",
    availability: (o.availability as any) ?? "optional",
    hex: o.hex ?? undefined, price: o.price ?? undefined,
  };
}

// A Sanity image projection -> CatalogueImage (url + focal point), or null if the
// asset is missing. imageUrl() consumes this on the frontend for sized URLs.
function normalizeImage(img: any) {
  if (!img?.url) return null;
  const out: any = { url: img.url };
  if (img.hotspot && typeof img.hotspot.x === "number") out.hotspot = { x: img.hotspot.x, y: img.hotspot.y };
  if (img.lqip) out.lqip = img.lqip;
  if (img.aspect) out.aspect = img.aspect;
  return out;
}

// Coerce a raw Sanity product (nullable fields, dereferenced options) into a full
// Product — every field present with the right type, so pages/pricing never see
// undefined. Options with a missing/dangling reference are dropped.
function normalizeProduct(p: any): Product {
  return {
    id: p.id, slug: p.slug, name: p.name ?? "",
    familySlug: p.familySlug ?? "", categorySlug: p.categorySlug ?? "",
    shortDescription: p.shortDescription ?? "",
    descriptionParagraphs: p.descriptionParagraphs ?? [],
    standardGlass: p.standardGlass ?? "", hardware: p.hardware ?? "",
    minWidth: p.minWidth ?? null, minHeight: p.minHeight ?? null,
    maxWidth: p.maxWidth ?? null, maxHeight: p.maxHeight ?? null,
    profileThickness: p.profileThickness ?? "", airTightness: p.airTightness ?? "",
    waterTightness: p.waterTightness ?? "", windPressure: p.windPressure ?? "",
    notes: p.notes ?? "", heroImage: normalizeImage(p.heroImage) ?? "",
    gallery: (p.gallery ?? []).map(normalizeImage).filter(Boolean),
    keySpecs: p.keySpecs ?? [], specs: p.specs ?? [],
    options: (p.options ?? []).filter((o: any) => o?.name && o?.typeSlug).map(normalizeOption),
    featuredOrder: p.featuredOrder ?? 0,
    seo: normalizeSeo(p.seo),
  };
}

export function normalizeSeo(s: any): SeoMeta | undefined {
  if (!s) return undefined;
  const img = (i: any) => normalizeImage(i) ?? undefined;
  return {
    metaTitle: s.metaTitle ?? undefined,
    metaDescription: s.metaDescription ?? undefined,
    keywords: s.keywords ?? undefined,
    canonicalUrl: s.canonicalUrl ?? undefined,
    noIndex: s.noIndex ?? undefined,
    noFollow: s.noFollow ?? undefined,
    openGraph: s.openGraph
      ? { title: s.openGraph.title ?? undefined, description: s.openGraph.description ?? undefined, image: img(s.openGraph.image), type: s.openGraph.type ?? undefined }
      : undefined,
    twitter: s.twitter
      ? { card: s.twitter.card ?? undefined, title: s.twitter.title ?? undefined, description: s.twitter.description ?? undefined, image: img(s.twitter.image), creator: s.twitter.creator ?? undefined }
      : undefined,
    advanced: s.advanced
      ? {
          noArchive: s.advanced.noArchive ?? undefined,
          noSnippet: s.advanced.noSnippet ?? undefined,
          noImageIndex: s.advanced.noImageIndex ?? undefined,
          maxSnippet: typeof s.advanced.maxSnippet === "number" ? s.advanced.maxSnippet : undefined,
          maxImagePreview: s.advanced.maxImagePreview ?? undefined,
          maxVideoPreview: typeof s.advanced.maxVideoPreview === "number" ? s.advanced.maxVideoPreview : undefined,
          // Incomplete rows would render an empty <meta>, so drop them here.
          additionalMeta: (s.advanced.additionalMeta ?? [])
            .filter((m: any) => m?.name && m?.content)
            .map((m: any) => ({ name: m.name, content: m.content })),
        }
      : undefined,
    schema: s.schema
      ? { schemaType: s.schema.schemaType ?? undefined, exclude: s.schema.exclude ?? undefined }
      : undefined,
  };
}

function normalizePage(p: any): SitePage {
  return { pageId: p.pageId, heroImage: normalizeImage(p.heroImage) ?? undefined, seo: normalizeSeo(p.seo) };
}

// The slug is the join key between a Sanity record and a rendered page, so two
// records claiming one slug is a content error. The Studio rejects it at
// authoring time; this is the runtime half, for duplicates that predate the
// validation or arrive by direct API write. Records come back newest-first, so
// keeping the first is "most recently edited wins" — a stated rule rather than
// whatever the query happened to return — and the loser is named in the console
// so the cause is findable instead of silently ignored.
function dedupePages(list: SitePage[]): SitePage[] {
  const bySlug = new Map<string, SitePage>();
  const shadowed: string[] = [];
  for (const p of list) {
    if (bySlug.has(p.pageId)) shadowed.push(p.pageId);
    else bySlug.set(p.pageId, p);
  }
  if (shadowed.length) {
    console.warn(
      `[sanity] duplicate page slug(s): ${[...new Set(shadowed)].join(", ")}. ` +
      "Using the most recently edited record for each; delete or re-slug the others.",
    );
  }
  return [...bySlug.values()];
}

// Coerce a raw Sanity showroomLocation into a full ShowroomLocation. Suburb-level
// only; never carries a street address or contact email.
function normalizeLocation(l: any): ShowroomLocation {
  return {
    id: l.id,
    stateCode: l.stateCode ?? "",
    suburb: l.suburb ?? "",
    displayName: l.displayName || [l.suburb, l.stateCode].filter(Boolean).join(", "),
    lat: typeof l.lat === "number" ? l.lat : 0,
    lng: typeof l.lng === "number" ? l.lng : 0,
    appointmentAvailable: l.appointmentAvailable !== false,
    status: (l.status as ShowroomLocation["status"]) ?? "active",
    historicalAliases: Array.isArray(l.historicalAliases) && l.historicalAliases.length ? l.historicalAliases : undefined,
  };
}

export function toCatalogueData(raw: RawCataloguePayload): CatalogueData {
  return {
    categories: raw.categories ?? [],
    families: raw.families ?? [],
    products: (raw.products ?? []).map(normalizeProduct),
    colours: (raw.colours ?? []).map((c) => ({
      typeSlug: "colour", typeName: "Colour", name: c.name,
      availability: (c.availability as any) ?? "optional",
      hex: c.hex ?? undefined, price: c.price ?? undefined,
    })),
    pages: dedupePages((raw.pages ?? []).filter((p) => p?.pageId).map(normalizePage)),
    locations: (raw.locations ?? []).filter((l) => l?.id).map(normalizeLocation),
    postCategories: (raw.postCategories ?? []).filter((c: any) => c?.slug),
    // A post with no category cannot be filtered to; the schema requires one, so
    // this only guards a draft-mode fetch. The body is not projected here at
    // all — it is fetched per post.
    posts: (raw.posts ?? [])
      .filter((p: any) => p?.slug && p?.categorySlug)
      .map((p: any) => ({
        ...p,
        productSlugs: (p.productSlugs ?? []).filter(Boolean),
        heroImage: normalizeImage(p.heroImage) ?? undefined,
        // A half-uploaded attachment (no asset, or no label) is dropped rather
        // than rendered as a row that downloads nothing.
        attachment: p.attachment?.url && p.attachment?.label ? p.attachment : undefined,
        seo: normalizeSeo(p.seo),
      })),
  };
}
