// Shared Sanity GROQ for the catalogue — one round-trip returning everything in
// the exact shape hydrateCatalogue() expects (references dereferenced to slugs).
// Imported by both the client (src/data/sanity.ts) and the Worker
// (worker/lib/catalogue.ts) so the query + normalization stay in one place.
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
    waterTightness, windPressure, notes, heroImage, gallery,
    keySpecs[]{label,value}, specs[]{label,value},
    options[]{typeSlug,typeName,name,availability,hex}, featuredOrder
  },
  "colours": *[_type=="colour"]{ name, hex, availability }
}`;

export interface RawCataloguePayload {
  categories: Category[];
  families: Family[];
  products: any[];
  colours: { name: string; hex?: string | null; availability: string }[];
}

// Coerce a raw Sanity product (nullable fields) into a full Product — every
// field present with the right type, so pages/pricing never see undefined.
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
    notes: p.notes ?? "", heroImage: p.heroImage ?? "", gallery: p.gallery ?? [],
    keySpecs: p.keySpecs ?? [], specs: p.specs ?? [],
    options: (p.options ?? []) as ProductOption[], featuredOrder: p.featuredOrder ?? 0,
  };
}

export function toCatalogueData(raw: RawCataloguePayload): CatalogueData {
  return {
    categories: raw.categories ?? [],
    families: raw.families ?? [],
    products: (raw.products ?? []).map(normalizeProduct),
    colours: (raw.colours ?? []).map((c) => ({
      typeSlug: "colour", typeName: "Colour", name: c.name,
      availability: (c.availability as any) ?? "optional", hex: c.hex ?? undefined,
    })),
  };
}
