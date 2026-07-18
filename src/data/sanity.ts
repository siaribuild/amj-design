// Sanity-backed catalogue: the same selectors as src/data/catalogue.ts, sourced
// from Sanity via GROQ. Configured only when the env vars are present; otherwise
// the app keeps using the hardcoded catalogue.ts (see loadCatalogue below).
//
// Env (Vite): VITE_SANITY_PROJECT_ID, VITE_SANITY_DATASET (default "production").
import { createClient } from "@sanity/client";
import type { Category, Family, Product, ProductOption } from "./catalogue";

const projectId = (import.meta as any).env?.VITE_SANITY_PROJECT_ID as string | undefined;
const dataset = ((import.meta as any).env?.VITE_SANITY_DATASET as string | undefined) || "production";

export const sanityConfigured = !!projectId;

const client = projectId
  ? createClient({ projectId, dataset, apiVersion: "2024-01-01", useCdn: true })
  : null;

// GROQ that returns documents already shaped like the catalogue interfaces
// (references dereferenced to their slugs), so pages/types stay unchanged.
const CATEGORY_Q = `*[_type=="category"]{ "id":_id, "slug":slug.current, name, shortDescription, description }`;
const FAMILY_Q = `*[_type=="family"]{ "id":_id, "slug":slug.current, "categorySlug":category->slug.current, name, shortDescription, description }`;
const PRODUCT_Q = `*[_type=="product"]{
  "id":_id, "slug":slug.current, name,
  "familySlug":family->slug.current, "categorySlug":category->slug.current,
  shortDescription, descriptionParagraphs, standardGlass, hardware,
  minWidth, minHeight, maxWidth, maxHeight, profileThickness, airTightness,
  waterTightness, windPressure, notes, heroImage, gallery,
  keySpecs[]{label,value}, specs[]{label,value},
  options[]{typeSlug,typeName,name,availability,hex}, featuredOrder
}`;
const COLOUR_Q = `*[_type=="colour"]{ name, hex, availability }`;

export interface CatalogueData {
  categories: Category[];
  families: Family[];
  products: Product[];
  colours: ProductOption[];
}

// Fetch the whole catalogue from Sanity (one round trip per type). Returns null
// when Sanity isn't configured, so callers fall back to the hardcoded data.
export async function fetchCatalogueFromSanity(): Promise<CatalogueData | null> {
  if (!client) return null;
  const [categories, families, products, coloursRaw] = await Promise.all([
    client.fetch<Category[]>(CATEGORY_Q),
    client.fetch<Family[]>(FAMILY_Q),
    client.fetch<Product[]>(PRODUCT_Q),
    client.fetch<{ name: string; hex?: string; availability: string }[]>(COLOUR_Q),
  ]);
  const colours: ProductOption[] = coloursRaw.map((c) => ({
    typeSlug: "colour", typeName: "Colour", name: c.name, availability: c.availability as any, hex: c.hex,
  }));
  return { categories, families, products, colours };
}
