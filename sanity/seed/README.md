# Sanity seed data

## Showroom locations

`locations.ndjson` holds the verified AMJ showrooms that drive the Contact page
(list + map + appointment requests). These are also the versioned dev/test seed in
`src/data/catalogue.ts`; Sanity is authoritative at runtime once imported.

Import into your dataset (run from the `sanity/` directory):

```bash
npx sanity dataset import seed/locations.ndjson production --replace
```

`--replace` upserts by `_id`, so re-running is safe. QLD and SA showrooms are not
yet published at suburb level by AMJ — add them in the Studio (or extend this file)
once verified; set `status: active` to make them selectable.

Suburb-centroid coordinates only — never a street address. Manufacturer routing is
configured at the env level (`MANUFACTURER_TO`), never per location.
