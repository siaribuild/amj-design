// Shared Sanity GROQ for the catalogue — one round-trip returning everything in
// the exact shape hydrateCatalogue() expects. Options are dereferenced from the
// shared `option` documents (so name/price/type live in ONE place), and colours
// come from the "applies to all" option type. Imported by both the client
// (src/data/sanity.ts) and the Worker (worker/lib/catalogue.ts) so the query +
// normalization stay in one place.
import type { Category, Family, Product, ProductOption, CatalogueData, SitePage, SeoMeta, ShowroomLocation } from "./catalogue";

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
      "price": option->pricingComponent,
      "hex": option->hex
    },
    featuredOrder,
    "seo": seo{
      metaTitle, metaDescription, keywords, canonicalUrl, noIndex, noFollow,
      "openGraph": openGraph{ title, description, "image": image{ "url": asset->url, hotspot } },
      "twitter": twitter{ card, title, description, "image": image{ "url": asset->url, hotspot } }
    }
  },
  "colours": *[_type=="option" && optionType->appliesToAll==true]|order(isDefault desc, name asc){
    "name": name,
    "availability": select(isDefault == true => "standard", "optional"),
    "hex": hex,
    "price": pricingComponent
  },
  "pages": *[_type=="page"]{
    pageId,
    "heroImage": heroImage{ "url": asset->url, hotspot, "lqip": asset->metadata.lqip, "aspect": asset->metadata.dimensions.aspectRatio },
    "seo": seo{
      metaTitle, metaDescription, keywords, canonicalUrl, noIndex, noFollow,
      "openGraph": openGraph{ title, description, "image": image{ "url": asset->url, hotspot } },
      "twitter": twitter{ card, title, description, "image": image{ "url": asset->url, hotspot } }
    }
  },
  "locations": *[_type=="showroomLocation"]|order(stateCode asc, suburb asc){
    "id":_id, stateCode, suburb, displayName, lat, lng, appointmentAvailable, status, historicalAliases
  }
}`;

export interface RawCataloguePayload {
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

function normalizeSeo(s: any): SeoMeta | undefined {
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
      ? { title: s.openGraph.title ?? undefined, description: s.openGraph.description ?? undefined, image: img(s.openGraph.image) }
      : undefined,
    twitter: s.twitter
      ? { card: s.twitter.card ?? undefined, title: s.twitter.title ?? undefined, description: s.twitter.description ?? undefined, image: img(s.twitter.image) }
      : undefined,
  };
}

function normalizePage(p: any): SitePage {
  return { pageId: p.pageId, heroImage: normalizeImage(p.heroImage) ?? undefined, seo: normalizeSeo(p.seo) };
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
    pages: (raw.pages ?? []).filter((p) => p?.pageId).map(normalizePage),
    locations: (raw.locations ?? []).filter((l) => l?.id).map(normalizeLocation),
  };
}
