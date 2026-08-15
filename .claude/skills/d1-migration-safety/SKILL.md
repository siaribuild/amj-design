---
name: d1-migration-safety
description: Safety procedure for writing and applying D1 migrations in this repo. Load BEFORE authoring any file in migrations/ and before any remote apply. Exists because a table rebuild once fired ON DELETE CASCADE in production and silently deleted 20 order_line and 4 payment rows — a clean local run had proven nothing.
---

# D1 migration safety

Database: `apertly-db` (Cloudflare D1 / SQLite). Migrations are append-only, numbered after the highest existing file in `migrations/`. This schema currently declares **53 `ON DELETE CASCADE` clauses** — treat every structural change as happening inside a minefield.

## The incident this skill encodes

A migration rebuilt a parent table using the standard SQLite recipe (`CREATE new` → `INSERT SELECT` → `DROP old` → `RENAME`). The `DROP` fired `ON DELETE CASCADE` on child tables, silently deleting 20 `order_line` and 4 `payment` rows in production. The migration had applied cleanly locally — **local success is not evidence of remote safety**, because local data doesn't have the child rows that die.

## Rules when AUTHORING a migration

1. **Additive changes** (CREATE TABLE, ADD COLUMN, CREATE INDEX) — no special ceremony.
2. **Any DROP TABLE or table rebuild** (the CREATE/INSERT/DROP/RENAME recipe — see `migrations/0030`, `0042`, `0047` for prior art):
   - First run `SELECT sql FROM sqlite_master WHERE sql LIKE '%REFERENCES <table>%'` (or grep `migrations/` for `REFERENCES <table>`) and list every child table with a CASCADE onto the table you're touching.
   - If any exist, the migration MUST begin with `PRAGMA defer_foreign_keys = true;` (precedent: `migrations/0033`) so the drop/rename does not fire cascades mid-transaction.
   - State the expected effect on child-table row counts in a comment at the top of the migration file: `-- children affected: none expected (order_line, payment reference this table)`.
3. **Column drops via rebuild**: carry EVERY existing column explicitly in the `INSERT SELECT` — never `SELECT *`, which silently misaligns when local and remote schema drift.

## Rules when APPLYING remotely

Remote apply (`npm run db:migrate:remote` or any `wrangler d1 execute --remote`) is gated by auto-mode — that gate exists on purpose; never look for a way around it. When it is approved:

1. **Export first, every time** — `npx wrangler d1 export apertly-db --remote --output backup-<date>-<migration-number>.sql`. No export, no apply. Cheap insurance; the incident above was unrecoverable without one.
2. **Count before/after** — for every table with a CASCADE onto anything the migration touches: `SELECT COUNT(*)` remote before and after. Any unexpected delta = stop, report, restore from the export.
3. **Verify locally against realistic data when the change is structural** — seed child rows locally (`scripts/db/seed.sql`) so the cascade path is actually exercised, not vacuously green.

## Who loads this

- **architect**: when a design includes any `migrations/` change — the design must name the cascade-affected children and the rebuild strategy.
- **developer**: before writing the migration file.
- **anyone**: before any remote apply.
