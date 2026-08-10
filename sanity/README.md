# OpenFrame Catalogue — Sanity

Internal Studio/infrastructure codename: **apertly-catalogue**.

The catalogue content model + a one-shot import of the current hardcoded
catalogue. This lets the product catalogue move from `src/data/catalogue.ts` to
Sanity **without touching pages or types** — the selectors just fetch via GROQ
(`src/data/sanity.ts`) instead of reading the in-repo arrays.

## Content model (single source of truth)
- `category` → `family` → `product` (references by slug).
- **`optionType`** — a shared category of options (Hardware, Flyscreen, Installation,
  Finish, Colour). `appliesToAll` types (Colour) are offered on every product.
- **`option`** — one shared option value. Carries its **own price** (`pricingComponent`)
  and optional `hex` swatch. Edit a name/price here **once** → every product that
  references it updates.
- **`product.options`** — an array of `{ option → reference, availability }`. Products
  reference shared options; they never copy option text.
- **Images** — `heroImage` + `gallery` are real Sanity image assets (hotspot/crop),
  so the frontend requests on-demand sizes and honours focal points.

## What's here
- `schemaTypes.ts` — the content model above.
- `sanity.config.ts` — Studio config skeleton.
- `catalogue.ndjson` — normalized import data, built from `products.xlsx`.

## Regenerate the import data (from the spreadsheet)
```bash
# unzip the workbook, then build the NDJSON:
mkdir -p /tmp/xlsx && unzip -o products.xlsx -d /tmp/xlsx
node scripts/build-catalogue-ndjson.cjs /tmp/xlsx sanity/catalogue.ndjson
```
Image fields use `_sanityAsset: "image@<url>"`, so `sanity dataset import` uploads
the placeholder images into your project on import (swap for real photos in Studio
afterwards). Document ids are deterministic, so re-imports upsert.

## 1. Create the project (your Sanity account)
```bash
cd sanity
npx sanity@latest init --project-plan free   # creates project + dataset; note the projectId
# add studio deps if init didn't: npm i sanity @sanity/vision
```
Copy `.env.example` to `.env` and fill in `SANITY_STUDIO_PROJECT_ID`. Both it and
`SANITY_STUDIO_DATASET` are required — the config and the CLI each throw without
them, so no command can act on a project or dataset nobody named. Do not put the
values back in `sanity.config.ts`; that is the pattern being removed.

## 2. Import the catalogue
```bash
# the committed sanity/catalogue.ndjson already holds the normalized data;
# import it (uploads placeholder images too — needs network):
cd sanity && npx sanity dataset import catalogue.ndjson production
```
Re-generate it from an updated spreadsheet with `scripts/build-catalogue-ndjson.cjs`
(see above). Document ids are deterministic (`product-<slug>`, `option-<type>-<slug>`,
`optiontype-<slug>`, …) so re-imports upsert.

## 3. Point the app at Sanity
Set Vite env (e.g. `.env`):
```
VITE_SANITY_PROJECT_ID=<your-project-id>
VITE_SANITY_DATASET=production
```
`src/data/sanity.ts` exposes `sanityConfigured` + `fetchCatalogueFromSanity()`.

## 4. Runtime swap — already wired ✅
The catalogue selectors (`getProductBySlug`, `getCategories`, …) are **synchronous**
and used across pages + the Worker pricing engine, so the swap is
*load-once-then-serve-sync*, and it's already in place:
- `catalogue.ts` arrays are `let` bindings with a `hydrateCatalogue()` setter.
- Client (`src/main.tsx`, `src/ops/main.tsx`) call `hydrateFromSanity()` before
  first render; the Worker (`worker/index.ts`) awaits `ensureCatalogue(env)` once
  per isolate. Both no-op until the env vars are set.
- `src/data/catalogueQuery.ts` normalizes the GROQ result so every field is typed.

So once you complete steps 1–3 (create project, import, set env vars), the app
serves the catalogue from Sanity with **no further code changes**. Until then it
uses the built-in `catalogue.ts`.

### Fields
The model covers the full Product type (dimensions, glass, hardware, ratings,
key/full spec rows, options, hero/gallery image paths, featured order). Images
are string paths for parity with the current data; switch them to Sanity `image`
assets later if you want managed uploads (would also update the GROQ + pages).
