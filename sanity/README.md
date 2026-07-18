# AMJ Catalogue — Sanity

The catalogue content model + a one-shot import of the current hardcoded
catalogue. This lets the product catalogue move from `src/data/catalogue.ts` to
Sanity **without touching pages or types** — the selectors just fetch via GROQ
(`src/data/sanity.ts`) instead of reading the in-repo arrays.

## What's here
- `schemaTypes.ts` — the content model (category, family, product, colour),
  mirroring the interfaces in `src/data/catalogue.ts`.
- `sanity.config.ts` — Studio config skeleton.
- `catalogue.ndjson` — generated from the current catalogue (`npm run sanity:ndjson`).

## 1. Create the project (your Sanity account)
```bash
cd sanity
npx sanity@latest init --project-plan free   # creates project + dataset; note the projectId
# add studio deps if init didn't: npm i sanity @sanity/vision
```
Set `projectId`/`dataset` in `sanity.config.ts` (or via SANITY_STUDIO_PROJECT_ID).

## 2. Import the catalogue
```bash
# from repo root — regenerate the NDJSON from the current catalogue:
npm run sanity:ndjson
# then import it:
cd sanity && npx sanity dataset import catalogue.ndjson production
```
Document ids are deterministic (`product-<slug>`, `family-<slug>`, …) so re-imports upsert.

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
