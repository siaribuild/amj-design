# Catalogue data (`catalogue.ts`)

Single hardcoded source of truth for the **Products catalogue** and **Product detail**
pages. Generated from `products.xlsx` (the AMJ product database) and deliberately shaped
to mirror the future Sanity content model, so migration is a swap of the data source —
not a rewrite of the pages.

## Shape

| Export | Sanity equivalent (planned) | Notes |
|---|---|---|
| `categories: Category[]` | `category` document | `slug` is `windows` / `doors` |
| `families: Family[]` | `family` document | references category by `categorySlug` |
| `products: Product[]` | `product` document | references family by `familySlug`; carries specs, options, images |
| `ProductOption` (inline on product) | reference to `option` + `optionType` | `availability: "standard" | "optional"` came from the xlsx Mapping matrix |

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

When moving to Sanity, reimplement **only these functions** as GROQ queries (ideally
async). The page components in `src/pages/` and the types in this file stay unchanged.

## Regenerating from the spreadsheet

The data was produced from `products.xlsx` by `scripts/generate-catalogue.cjs`:

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

- **Images** (`heroImage`, `gallery`) are generic Unsplash architectural photos assigned per
  family. The spreadsheet ships no images yet. Replace with real product photography (or
  Sanity image assets) when available.
- **Specifications** are taken verbatim from the spreadsheet. A few source rows are flagged in
  their own `notes`/description (e.g. a tilt-turn dimension the source says to verify). Do not
  invent missing values.
