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

## 4. Wire the runtime swap (the remaining integration step)
The catalogue selectors (`getProductBySlug`, `getCategories`, …) are **synchronous**
and used across pages + the Worker pricing engine, so the clean swap is
*load-once-then-serve-sync*:
1. At app bootstrap (before first render), call `fetchCatalogueFromSanity()`.
2. If it returns data, hydrate the catalogue arrays; otherwise keep the hardcoded
   defaults. (Requires making the `categories`/`families`/`products` arrays in
   `catalogue.ts` swappable via a small `hydrateCatalogue()` setter — a mechanical
   change to the generated file + its generator.)
3. The Worker does the same on first request (cache the result).

This step is intentionally left until a live dataset exists, so it can be verified
end to end rather than wired blind.
