# Catalogue data (`catalogue.ts`)

**Offline fallback** for the **Products catalogue** and **Product detail** pages. The live
source of truth is now **Sanity** — the app hydrates from it at bootstrap (`hydrateCatalogue`,
via `src/data/sanity.ts` on the client and `worker/lib/catalogue.ts` in the Worker) and only
falls back to the arrays in this file when Sanity is unconfigured or unreachable. The arrays
mirror the Sanity shape exactly, so the pages/selectors are identical either way. Safe to
delete once you're happy with the content in Sanity.

## Shape

| Export | Sanity source (live) | Notes |
|---|---|---|
| `categories: Category[]` | `category` document | `slug` is `windows` / `doors` |
| `families: Family[]` | `family` document | references category by `categorySlug` |
| `products: Product[]` | `product` document | references family by `familySlug`; carries specs, options, images |
| `ProductOption` (flattened) | `option` + `optionType` documents | GROQ dereferences the shared option → `{typeSlug,typeName,name,availability,price,hex}`; `availability` came from the xlsx Mapping matrix |

Relationships are expressed by **slug strings** (`categorySlug`, `familySlug`) rather than
object nesting, matching how Sanity references resolve in GROQ.

## Selectors = the query boundary

Pages never touch the arrays directly; they call selectors:

- `getCategories()`, `getCategory(slug)`
- `getFamiliesByCategory(categorySlug)`, `getFamily(slug)`
- `getProductBySlug(slug)`
- `getProductsByCategory(categorySlug)`, `getProductsByFamily(familySlug)`
- `getRelatedProducts(slug, limit)`
- `familyProductCount(familySlug)`

This selector boundary is why the Sanity swap needed no page changes: the GROQ result
(`src/data/catalogueQuery.ts`) is normalized into these same arrays and hydrated once at
bootstrap. The page components in `src/pages/` and the types in this file are unchanged.

## Regenerating from the spreadsheet

> The **live** catalogue is in Sanity. To rebuild the Sanity import from an updated
> spreadsheet use `scripts/build-catalogue-ndjson.cjs` (see `sanity/README.md`). The
> generator below only rebuilds this **fallback** file, and can be retired once
> `catalogue.ts` is deleted.

This fallback was produced from `products.xlsx` by `scripts/generate-catalogue.cjs`:

```bash
# 1. unzip products.xlsx into a folder (xlsx is a zip of XML)
# 2. point the generator at the unpacked folder
node scripts/generate-catalogue.cjs <unpacked-xlsx-dir> src/data/catalogue.ts
```

It:

- reads the `Categories`, `Families`, `Products`, `Options`, `Option Types`, `Mapping` sheets;
- corrects obvious export typos in family display names (e.g. `Casament → Casement`,
  `Bi-Fold Dooor → Bi-Fold Door`, `Lif-Sliding → Lift-Slide`);
- derives compact `keySpecs` (chips) and a full `specs` table from the raw fields;
- resolves the `Mapping` matrix (`S`/`O`) into per-product `options` grouped by option type.

## Placeholder data — replace before launch

- **Images** (`heroImage`, `gallery`) in this fallback are generic Unsplash architectural
  photos. In Sanity they are real image assets (uploaded on import) — replace them with real
  product photography in Studio and set focal points; the frontend requests sized/cropped URLs.
- **Specifications** are taken verbatim from the spreadsheet. A few source rows are flagged in
  their own `notes`/description (e.g. a tilt-turn dimension the source says to verify). Do not
  invent missing values.
