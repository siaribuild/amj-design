// Shared Sanity GROQ for the catalogue — one round-trip returning everything in
// the exact shape hydrateCatalogue() expects. Options are dereferenced from the
// shared `option` documents (so name/price/type live in ONE place), and colours
// come from the "applies to all" option type. Imported by both the client
// (src/data/sanity.ts) and the Worker (worker/lib/catalogue.ts) so the query +
// normalization stay in one place.
import type { Category, Family, Product, ProductOption, CatalogueData } from "./catalogue";

export const CATALOGUE_QUERY = `{
  "categories": *[_type=="category"]|order(name asc){
    "id":_id, "slug":slug.current, name, shortDescription, description
  },
  "families": *[_type=="family"]|order(name asc){
    "id":_id, "slug":slug.current, "categorySlug":category->slug.current, name, shortDescription, description
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
    featuredOrder
  },
  "colours": *[_type=="option" && optionType->appliesToAll==true]|order(isDefault desc, name asc){
    "name": name,
    "availability": select(isDefault == true => "standard", "optional"),
    "hex": hex,
    "price": pricingComponent
  }
}`;

export interface RawCataloguePayload {
  categories: Category[];
  families: Family[];
  products: any[];
  colours: { name: string; hex?: string | null; availability: string; price?: number | null }[];
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
  };
}
