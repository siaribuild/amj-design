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
  // orderRank — the drag-and-drop rank Studio's "Categories" list writes (see
  // sanity.config.ts). Alphabetical alone put Doors ahead of Windows everywhere
  // the catalogue is grouped — the product picker most visibly, where a builder
  // adding a window had to scroll past the doors first.
  "categories": *[_type=="category"]|order(orderRank asc){
    "id":_id, "slug":slug.current, name, orderRank, shortDescription, description
  },
  // orderRank — the drag-and-drop rank Studio's "Families" list writes (see
  // sanity.config.ts). Drives the product picker's family grouping and the
  // family selector on /products.
  "families": *[_type=="family"]|order(orderRank asc){
    "id":_id, "slug":slug.current, "categorySlug":category->slug.current, name, operation, aliases, icon, shortDescription, description, orderRank,
    // What goes NEXT to this window when an opening is too wide for one frame.
    // The infill is dereferenced to its SLUG: the estimator resolves candidates
    // by family slug, and shipping a Sanity document id would make the browser
    // hold a reference it cannot follow.
    "defaultSplit": defaultSplit{
      "infillFamilySlug": infillFamily->slug.current,
      minInfillMm, operableRatio, offsetOperableRatio
    }
  },
  "products": *[_type=="product"]|order(orderRank asc){
    "id":_id, "slug":slug.current, name,
    "familySlug":family->slug.current, "categorySlug":category->slug.current,
    shortDescription, descriptionParagraphs, standardGlass, notes,
    "dimensionRule": dimensionRule{ minWidthMm, maxWidthMm, minHeightMm, maxHeightMm },
    // The extrusion platform and its declared partners — the SAME shape the
    // estimator reads, because the picker that offers a unit's product and the
    // server that accepts it must not be able to disagree about which frames
    // couple. Absent on any product not yet tagged, which is unknown and never
    // excludes anything.
    "frameSystem": frameSystem->{
      "slug": slug.current, name,
      "compatibleWith": compatibleWith[]{ "slug": system->slug.current, severity }
    },
    // The glass a manually-configured / schedule line carries by default. Prefer the
    // frame thermal profile's first glazing (M2/M6); fall back to the legacy variant.
    // The first PUBLISHED row: rows[0] unconditionally made an unpublished glass
    // the default on every new line for that product — selectable by nobody, yet
    // preselected for everybody.
    "defaultGlazingSlug": coalesce(thermalProfile->rows[published != false][0].glazing->slug.current, performanceVariants[0].glazingOption->slug.current),
    // Public thermal ratings (M3): the WERS matrix shown on the product page — one
    // row per glazing the frame offers. Empty for products with no profile yet.
    // PUBLISHED ROWS ONLY. "Published (eligible for selection)" was enforced in
    // the estimator and nowhere else, so an unpublished glazing still appeared in
    // the product page thermal table AND in the customer glazing picker: the
    // machine would not choose it and a person could pick it by hand.
    // The test is "not false", NOT "is true": an absent flag means published,
    // which is the same reading the estimator applies (published !== false).
    // Inverting it would empty the glazing picker for every row an importer
    // left the field off — the shape of the low-E bug, which silently deleted
    // exactly the glass a thermal band needs.
    "thermal": thermalProfile->rows[published != false]{
      "slug": glazing->slug.current,
      "glazingName": coalesce(glazing->longDisplayName, glazing->name),
      "glassSpec": glazing->glassSpecification,
      uValue, shgc, tvw, heatingStars, coolingStars
    },
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
    orderRank,
    disabled,
    "seo": ${SEO_PROJECTION}
  },
  "colours": *[_type=="option" && optionType->appliesToAll==true]|order(isDefault desc, name asc){
    "name": name,
    "availability": select(isDefault == true => "standard", "optional"),
    "hex": hex
  },
  // Which option group (Colour, Hardware, Flyscreen…) shows first in the item
  // builder — see optionGroupsFor in src/data/configurator.ts. Ops-managed in
  // Studio's "Option Types" list (see sanity.config.ts), replacing the
  // hardcoded TYPE_ORDER constant that used to live in configurator.ts.
  "optionTypes": *[_type=="optionType"]{
    "slug": slug.current, orderRank
  },
  "pages": *[_type=="page"]|order(_updatedAt desc){
    pageId,
    "heroImage": heroImage{ "url": asset->url, hotspot, "lqip": asset->metadata.lqip, "aspect": asset->metadata.dimensions.aspectRatio },
    "seo": ${SEO_PROJECTION}
  },
  "locations": *[_type=="showroomLocation"]|order(stateCode asc, suburb asc){
    "id":_id, stateCode, suburb, displayName, lat, lng, appointmentAvailable, status, historicalAliases
  },
  "postCategories": *[_type=="postCategory"]|order(orderRank asc){
    "id":_id, "slug":slug.current, title, orderRank, description, dateDisplay, allowsProducts
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
  optionTypes?: { slug: string; orderRank?: string | null }[];
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
    standardGlass: p.standardGlass ?? "",
    // Single size source: the estimator's dimensionRule (the Content-tab min/max
    // were removed in the 2026-07-31 rationalisation so the two can't diverge).
    minWidth: p.dimensionRule?.minWidthMm ?? null, minHeight: p.dimensionRule?.minHeightMm ?? null,
    maxWidth: p.dimensionRule?.maxWidthMm ?? null, maxHeight: p.dimensionRule?.maxHeightMm ?? null,
    defaultGlazingSlug: p.defaultGlazingSlug ?? null,
    // A system without a slug cannot be compared with anything, so it reads as
    // untagged rather than as a system nothing else can equal. An edge pointing
    // at a deleted or draft-only system dereferences to no slug and is dropped —
    // never carried as a hole in the graph.
    frameSystem: p.frameSystem?.slug
      ? {
          slug: p.frameSystem.slug,
          name: p.frameSystem.name ?? null,
          compatibleWith: (p.frameSystem.compatibleWith ?? [])
            .filter((e: any) => e?.slug && e.slug !== p.frameSystem.slug)
            .map((e: any) => ({ slug: e.slug, severity: e.severity === "preferred" ? "preferred" : "allowed" })),
        }
      : null,
    thermal: Array.isArray(p.thermal) ? p.thermal : [],
    notes: p.notes ?? "", heroImage: normalizeImage(p.heroImage) ?? "",
    gallery: (p.gallery ?? []).map(normalizeImage).filter(Boolean),
    keySpecs: p.keySpecs ?? [], specs: p.specs ?? [],
    options: (p.options ?? []).filter((o: any) => o?.name && o?.typeSlug).map(normalizeOption),
    orderRank: p.orderRank ?? undefined,
    // Absent is AVAILABLE: every product predates the field.
    disabled: p.disabled === true,
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
    // Sorted here as well as in the GROQ, deliberately. The query orders what
    // Sanity sends, but the ordering is a CONTRACT of the catalogue rather than
    // a property of one transport — the built-in fallback, a cached payload and
    // any future caller all have to honour it, and a category picker that lists
    // Doors first is the kind of regression nobody notices for a month.
    //
    // orderRank is the drag-and-drop rank (see sanity.config.ts); a category
    // with no rank yet (a stale cached payload) falls back to name.
    categories: [...(raw.categories ?? [])].sort((a, b) => {
      if (a.orderRank != null && b.orderRank != null) return a.orderRank.localeCompare(b.orderRank);
      if (a.orderRank != null) return -1;
      if (b.orderRank != null) return 1;
      return a.name.localeCompare(b.name);
    }),
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
    // slug -> orderRank, dropping any type not yet ranked so it falls through
    // to the built-in defaults in src/data/catalogue.ts rather than sorting
    // that group to the front with an empty-string rank.
    optionTypeOrder: Object.fromEntries(
      (raw.optionTypes ?? [])
        .filter((t): t is { slug: string; orderRank: string } => !!t?.slug && !!t?.orderRank)
        .map((t) => [t.slug, t.orderRank]),
    ),
  };
}
