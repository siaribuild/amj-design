// /api/ops/pricing — the ops console's editor for the D1 commercial layer.
//
// Before this existed, changing any price in the system meant writing a migration
// and shipping a deploy. That is not a workflow a manufacturer can run: supplier
// increases arrive by email, not by pull request.
//
// Roles mirror the console's existing shape (ops.ts §Persona RBAC):
//   read   — any assigned role. An estimator staring at an unpriceable line must
//            be able to see WHY without interrupting a manager.
//   write  — manager | admin. Same bar as recording a payment.
//   policy — admin only (deposit % is contractual, not commercial).
//
// The console hides what a role cannot do; this file refuses it. Both, always.
import { Hono } from "hono";
import type { Env } from "../types";
import { resolveStaff } from "../lib/staff";
import { catalogueStatus, ensureCatalogue } from "../lib/catalogue";
import {
  applyPricingChange, draftExposure, lastReconcileRun, previewSample,
  offeredOptionSlugs, reconcilePricing, sampleSizes, VersionConflict, type SampleSize,
} from "../lib/pricing-admin";
import { loadModifiers, type PricingModifier, type RateCard } from "../lib/estimator/pricing";
import { getCategories, getFamiliesByCategory, products } from "../../src/data/catalogue";
import { uuid } from "../lib/util";

export const opsPricing = new Hono<{ Bindings: Env }>();

// FLAT access (owner decision, 2026-07-28): every OpenFrame staff user has full
// access, here as everywhere else. The three tiers this file used to keep —
// view / edit / policy — distinguished nobody once both staff were admins, and
// the perimeter that actually protects pricing is Cloudflare Access on ops.*.
//
// What survives as a guard is CONCURRENCY rather than role: every write here
// still refuses a save whose expectedVersion is stale (applyPricingChange,
// worker/lib/pricing-admin.ts). Two things this comment used to also claim
// are gone, not merely unenforced: applyPricingChange stopped recording a
// before/after history when 0042 dropped pricing_change (the bespoke audit
// trail nobody asked for), and the console's own ±20% typed-family-slug
// tripwire is gone too — it armed on the ordinary case (a value moving off
// its seeded 0, e.g. a rate card's min_charge) at least as often as a real
// mistake, and the delivery-zone editor (0044) was built without it from the
// start rather than inheriting a gate that was already on its way out.
const isStaffUser = (s: { role: string | null }) => !!s;
const canView = isStaffUser;
const canEdit = isStaffUser;
const canAdmin = isStaffUser;

/** Resolve the acting staffer at the required level, or the response to return. */
async function gate(c: any, level: "view" | "edit" | "admin") {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return { staff: null, deny: c.json({ error: "forbidden" }, 403) };
  const ok = level === "view" ? canView(staff) : level === "edit" ? canEdit(staff) : canAdmin(staff);
  if (!ok) return { staff: null, deny: c.json({ error: "forbidden_role" }, 403) };
  return { staff, deny: null };
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const rowToCard = (r: any): RateCard => ({
  id: r.id, perimRate: r.perim_rate, areaRate: r.area_rate, minCharge: r.min_charge ?? 0, version: r.version,
});

// ── Rate cards ───────────────────────────────────────────────────────────────

/** The index. Read-only by design: no worked-example total here any more (it
 *  used to price a shared 1200×1200 sample per row for at-rest scanning) —
 *  editing opens the detail view, where the live worked example lives beside
 *  the fields that produce it, which is where a wrong figure is legible
 *  against a real before/after rather than a lone number in a dense table. */
opsPricing.get("/rate-cards", async (c) => {
  const { staff, deny } = await gate(c, "view");
  if (!staff) return deny;

  const { results } = await c.env.DB.prepare(
    "SELECT id, perim_rate, area_rate, min_charge, version, updated_at FROM pricing_rate_card WHERE active = 1 ORDER BY id",
  ).all<any>();

  const cards = await Promise.all((results ?? []).map(async (r) => {
    const modifiers = await loadModifiers(c.env, r.id);
    return {
      id: r.id, perimRate: r.perim_rate, areaRate: r.area_rate, minCharge: r.min_charge ?? 0,
      version: r.version, updatedAt: r.updated_at, modifierCount: modifiers.length,
      // Cards are keyed on the product slug (0031), so the row can name the
      // product and the family it belongs to.
      productName: products.find((p) => p.slug === r.id)?.name ?? null,
      familySlug: products.find((p) => p.slug === r.id)?.familySlug ?? null,
    };
  }));

  // BY PRODUCT NAME — the SQL fetch above is `ORDER BY id`, but id is the
  // product slug (0031), which a staffer scanning the table does not read by.
  // productName only exists after the join above, so the sort has to happen
  // here rather than in SQL. A card with no matching product (deleted/renamed
  // since) sorts after every named one, then by id among its own kind — the
  // "default" fallback card included, never mixed in ahead of a real product.
  cards.sort((a, b) => {
    if (a.productName && b.productName) return a.productName.localeCompare(b.productName);
    if (a.productName) return -1;
    if (b.productName) return 1;
    return a.id.localeCompare(b.id);
  });

  return c.json({ canEdit: canEdit(staff), cards });
});

/** No special screen — just a new row, seeded from the 'default' card's
 *  current rates (so nothing prices at $0 the moment it exists — it prices
 *  exactly like an unmapped product would, until someone edits it) and
 *  'default's active modifiers, matching how every product card in this
 *  system has been seeded since 0031/0040. */
opsPricing.post("/rate-cards", async (c) => {
  const { staff, deny } = await gate(c, "edit");
  if (!staff) return deny;

  const body = await c.req.json().catch(() => ({}));
  const id = String(body?.id ?? "").trim();
  if (!id) return c.json({ error: "invalid_id" }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM pricing_rate_card WHERE id = ?").bind(id).first<any>();
  if (existing) return c.json({ error: "id_taken" }, 409);

  const base = await c.env.DB.prepare(
    "SELECT perim_rate, area_rate, min_charge FROM pricing_rate_card WHERE id = 'default'",
  ).first<any>();
  const perimRate = base?.perim_rate ?? 0, areaRate = base?.area_rate ?? 0, minCharge = base?.min_charge ?? 0;

  await c.env.DB.prepare(
    "INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active) VALUES (?, ?, ?, ?, 'v1', 1)",
  ).bind(id, perimRate, areaRate, minCharge).run();

  const baseModifiers = await loadModifiers(c.env, "default");
  for (const m of baseModifiers) {
    await c.env.DB.prepare(
      `INSERT INTO pricing_modifier (id, rate_card_id, seq, label, when_field, when_op, when_value, then_type, then_value, version, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'v1', 1, datetime('now'))`,
    ).bind(uuid(), id, m.seq, m.label, m.whenField, m.whenOp, m.whenValue, m.thenType, m.thenValue).run();
  }

  return c.json({ ok: true, id });
});

opsPricing.get("/rate-cards/:id", async (c) => {
  const { staff, deny } = await gate(c, "view");
  if (!staff) return deny;
  const id = c.req.param("id");

  const row = await c.env.DB.prepare(
    "SELECT id, perim_rate, area_rate, min_charge, version, updated_at FROM pricing_rate_card WHERE id = ?",
  ).bind(id).first<any>();
  if (!row) return c.json({ error: "not_found" }, 404);

  const [modifiers, sizes, exposure] = await Promise.all([
    loadModifiers(c.env, id),
    sampleSizes(c.env, id),
    draftExposure(c.env, id),
  ]);

  return c.json({
    canEdit: canEdit(staff),
    card: rowToCard(row), updatedAt: row.updated_at,
    modifiers, samples: sizes.samples, samplesFromHistory: sizes.fromHistory, sampleLineCount: sizes.lineCount,
    draftExposure: exposure,
  });
});

/** Price samples against values that have NOT been saved. This is what makes the
 *  editor teachable: the operator sees the effect before committing, decomposed
 *  into the arithmetic the engine actually performs — including the steps that
 *  did nothing. No write, so it is available to anyone who can view. */
opsPricing.post("/preview", async (c) => {
  const { staff, deny } = await gate(c, "view");
  if (!staff) return deny;
  const body = await c.req.json().catch(() => ({}));

  const id = String(body?.rateCardId ?? "");
  const stored = await c.env.DB.prepare(
    "SELECT id, perim_rate, area_rate, min_charge, version FROM pricing_rate_card WHERE id = ?",
  ).bind(id).first<any>();
  if (!stored) return c.json({ error: "not_found" }, 404);

  const rate: RateCard = {
    id: stored.id,
    perimRate: num(body?.perimRate) ?? stored.perim_rate,
    areaRate: num(body?.areaRate) ?? stored.area_rate,
    minCharge: num(body?.minCharge) ?? stored.min_charge ?? 0,
    version: stored.version,
  };
  const modifiers: PricingModifier[] = Array.isArray(body?.modifiers)
    ? body.modifiers.map(toModifier).filter(Boolean) as PricingModifier[]
    : await loadModifiers(c.env, id);

  const samples: SampleSize[] = Array.isArray(body?.samples) && body.samples.length
    ? body.samples.map((s: any, i: number) => ({
      key: (s?.key ?? ["small", "typical", "large"][i] ?? "typical") as SampleSize["key"],
      widthMm: num(s?.widthMm) ?? 0, heightMm: num(s?.heightMm) ?? 0, qty: Math.max(1, num(s?.qty) ?? 1),
    }))
    : (await sampleSizes(c.env, id)).samples;

  const priced = await Promise.all(samples.map(async (sample) => ({
    sample, snapshot: await previewSample(c.env, { rate, modifiers, sample }),
  })));
  return c.json({ samples: priced });
});

const FIELDS = new Set(["width", "height", "area", "qty"]);
const OPS = new Set([">", ">=", "<", "<=", "=="]);

/** Validate one rule against the closed grammar in migration 0026. The grammar
 *  has no AND, no OR, no grouping and no nesting — the editor must therefore not
 *  offer any of those, and this must not accept them. */
function toModifier(m: any, i = 0): PricingModifier | null {
  const whenValue = num(m?.whenValue), thenValue = num(m?.thenValue);
  if (!FIELDS.has(m?.whenField) || !OPS.has(m?.whenOp)) return null;
  if (whenValue == null || thenValue == null) return null;
  if (m?.thenType !== "percent" && m?.thenType !== "fixed") return null;
  return {
    id: typeof m?.id === "string" && m.id ? m.id : uuid(),
    seq: num(m?.seq) ?? i * 10,
    label: typeof m?.label === "string" && m.label.trim() ? m.label.trim() : null,
    whenField: m.whenField, whenOp: m.whenOp, whenValue, thenType: m.thenType, thenValue,
  };
}

opsPricing.put("/rate-cards/:id", async (c) => {
  const { staff, deny } = await gate(c, "edit");
  if (!staff) return deny;
  const id = c.req.param("id");

  const before = await c.env.DB.prepare(
    "SELECT id, perim_rate, area_rate, min_charge, version FROM pricing_rate_card WHERE id = ?",
  ).bind(id).first<any>();
  if (!before) return c.json({ error: "not_found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const perimRate = num(body?.perimRate) ?? before.perim_rate;
  const areaRate = num(body?.areaRate) ?? before.area_rate;
  const minCharge = num(body?.minCharge) ?? before.min_charge ?? 0;
  // A negative rate is not a low price, it is a typo that pays the customer.
  if (perimRate < 0 || areaRate < 0 || minCharge < 0) return c.json({ error: "invalid_amount" }, 400);

  try {
    const version = await applyPricingChange(c.env, {
      table: "pricing_rate_card", rowId: id, actor: staff.id,
      expectedVersion: body?.expectedVersion ?? null,
      before: { perimRate: before.perim_rate, areaRate: before.area_rate, minCharge: before.min_charge ?? 0, version: before.version },
      after: { perimRate, areaRate, minCharge },
      write: (v) => c.env.DB.prepare(
        "UPDATE pricing_rate_card SET perim_rate=?, area_rate=?, min_charge=?, version=?, updated_at=datetime('now') WHERE id=?",
      ).bind(perimRate, areaRate, minCharge, v, id).run().then(() => undefined),
    });
    return c.json({ ok: true, version });
  } catch (e) {
    if (e instanceof VersionConflict) return c.json({ error: "version_conflict" }, 409);
    throw e;
  }
});

/** Modifiers are written as one ORDERED list, never row by row: their order IS
 *  part of their meaning (a percentage applies to the running total, so two 10%
 *  rules make 21%), and a per-row endpoint would let an interrupted reorder
 *  persist an order nobody chose. */
opsPricing.put("/rate-cards/:id/modifiers", async (c) => {
  const { staff, deny } = await gate(c, "edit");
  if (!staff) return deny;
  const id = c.req.param("id");

  const card = await c.env.DB.prepare("SELECT id, version FROM pricing_rate_card WHERE id = ?").bind(id).first<any>();
  if (!card) return c.json({ error: "not_found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const incoming = Array.isArray(body?.modifiers) ? body.modifiers : [];
  const modifiers = incoming.map((m: any, i: number) => toModifier(m, i));
  if (modifiers.some((m: PricingModifier | null) => m === null)) return c.json({ error: "invalid_rule" }, 400);

  const before = await loadModifiers(c.env, id);
  try {
    const version = await applyPricingChange(c.env, {
      table: "pricing_modifier", rowId: id, actor: staff.id,
      expectedVersion: body?.expectedVersion ?? null,
      before: { modifiers: before, version: card.version },
      after: { modifiers },
      write: async (v) => {
        // Replace wholesale so a removed rule is genuinely gone. Deactivate rather
        // than DELETE: a modifier id appears in the appliedModifiers array of every
        // snapshot it ever priced, and those must stay resolvable.
        await c.env.DB.prepare("UPDATE pricing_modifier SET active = 0 WHERE rate_card_id = ?").bind(id).run();
        for (const [i, m] of (modifiers as PricingModifier[]).entries()) {
          await c.env.DB.prepare(
            `INSERT INTO pricing_modifier (id, rate_card_id, seq, label, when_field, when_op, when_value, then_type, then_value, version, active, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET seq=excluded.seq, label=excluded.label,
               when_field=excluded.when_field, when_op=excluded.when_op, when_value=excluded.when_value,
               then_type=excluded.then_type, then_value=excluded.then_value,
               version=excluded.version, active=1, updated_at=datetime('now')`,
          ).bind(m.id, id, i * 10, m.label, m.whenField, m.whenOp, m.whenValue, m.thenType, m.thenValue, v).run();
        }
        await c.env.DB.prepare("UPDATE pricing_rate_card SET version = ? WHERE id = ?").bind(v, id).run();
      },
    });
    return c.json({ ok: true, version });
  } catch (e) {
    if (e instanceof VersionConflict) return c.json({ error: "version_conflict" }, 409);
    throw e;
  }
});

/** No downstream-dependency checks — a confirm dialog is the only gate, by
 *  design (owner). 'default' is the one exception: every unmapped product
 *  prices through it, so losing it breaks pricing for all of them at once
 *  rather than just the one product a normal delete affects. */
opsPricing.delete("/rate-cards/:id", async (c) => {
  const { staff, deny } = await gate(c, "edit");
  if (!staff) return deny;
  const id = c.req.param("id");
  if (id === "default") return c.json({ error: "cannot_delete_default" }, 400);

  const row = await c.env.DB.prepare("SELECT id FROM pricing_rate_card WHERE id = ?").bind(id).first<any>();
  if (!row) return c.json({ error: "not_found" }, 404);

  // Modifiers cascade — pricing_modifier.rate_card_id is ON DELETE CASCADE.
  await c.env.DB.prepare("DELETE FROM pricing_rate_card WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

/** Renames the card's id — its primary key, and the product slug it prices.
 *  'default' cannot be renamed away (nor anything renamed TO 'default') for
 *  the same reason it cannot be deleted: code elsewhere looks it up by that
 *  literal string.
 *
 *  COPY, REPOINT, DELETE — not a plain UPDATE of the primary key.
 *  pricing_modifier.rate_card_id is a foreign key with ON DELETE CASCADE but
 *  no ON UPDATE, and foreign_keys is ON: renaming the parent first orphans
 *  every child mid-statement and the write fails. Inserting the new parent
 *  before the children move means no row is ever without one, and dropping
 *  the old parent last cascades to nothing because nothing points at it. */
opsPricing.put("/rate-cards/:id/rename", async (c) => {
  const { staff, deny } = await gate(c, "edit");
  if (!staff) return deny;
  const id = c.req.param("id");
  if (id === "default") return c.json({ error: "cannot_rename_default" }, 400);

  const body = await c.req.json().catch(() => ({}));
  const newId = String(body?.newId ?? "").trim();
  if (!newId) return c.json({ error: "invalid_id" }, 400);
  if (newId === "default") return c.json({ error: "cannot_rename_to_default" }, 400);
  if (newId === id) return c.json({ ok: true, id });

  const row = await c.env.DB.prepare(
    "SELECT perim_rate, area_rate, min_charge, version, active FROM pricing_rate_card WHERE id = ?",
  ).bind(id).first<any>();
  if (!row) return c.json({ error: "not_found" }, 404);
  const collision = await c.env.DB.prepare("SELECT id FROM pricing_rate_card WHERE id = ?").bind(newId).first<any>();
  if (collision) return c.json({ error: "id_taken" }, 409);

  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
    ).bind(newId, row.perim_rate, row.area_rate, row.min_charge, row.version, row.active),
    c.env.DB.prepare("UPDATE pricing_modifier SET rate_card_id = ? WHERE rate_card_id = ?").bind(newId, id),
    c.env.DB.prepare("DELETE FROM pricing_rate_card WHERE id = ?").bind(id),
  ]);
  return c.json({ ok: true, id: newId });
});

// ── Option surcharges ────────────────────────────────────────────────────────

/** Options are inline-editable where rate cards are not, and the contrast is
 *  deliberate: an option surcharge is a flat amount whose effect is linear,
 *  obvious and bounded, so density wins. A rate card's effect is dimensional and
 *  non-obvious, so comprehension wins. Same console, opposite answer. */
opsPricing.get("/options", async (c) => {
  const { staff, deny } = await gate(c, "view");
  if (!staff) return deny;

  const [{ results }, reconcile] = await Promise.all([
    c.env.DB.prepare("SELECT id, surcharge, version, basis FROM pricing_option_surcharge WHERE active = 1 ORDER BY id").all<any>(),
    lastReconcileRun(c.env),
  ]);

  // "Offered by" comes from the SAME function the reconciler compares against —
  // not a second walk of the catalogue. A first attempt here rebuilt the map
  // inline, missed that `colour` resolves against the global Colorbond list, and
  // rendered every colour as "no product offers it" while the reconciler counted
  // them as offered. Two implementations of one comparison is the bug this whole
  // screen exists to make impossible; it does not get to reappear inside it.
  await ensureCatalogue(c.env);
  const offered = offeredOptionSlugs();

  return c.json({
    canEdit: canEdit(staff),
    reconcile,
    options: (results ?? []).map((r) => ({
      slug: r.id, surcharge: r.surcharge, version: r.version,
      basis: r.basis === "per_sqm" ? "per_sqm" : "per_unit",
      offeredBy: offered.get(r.id)?.length ?? 0,
    })),
  });
});

opsPricing.put("/options/:slug", async (c) => {
  const { staff, deny } = await gate(c, "edit");
  if (!staff) return deny;
  const slug = c.req.param("slug");
  const body = await c.req.json().catch(() => ({}));
  const surcharge = num(body?.surcharge);
  if (surcharge == null || surcharge < 0) return c.json({ error: "invalid_amount" }, 400);

  const before = await c.env.DB.prepare(
    "SELECT surcharge, version, basis FROM pricing_option_surcharge WHERE id = ?",
  ).bind(slug).first<any>();
  // Basis is sticky: keep the row's current basis unless the caller changes it, and
  // default a brand-new row to per_unit (the safe, flat default).
  const basis = body?.basis === "per_sqm" ? "per_sqm"
    : body?.basis === "per_unit" ? "per_unit"
    : (before?.basis === "per_sqm" ? "per_sqm" : "per_unit");

  // M5/D9 safeguard: a non-zero per-m² (glass) surcharge must not go live while any
  // active rate card still bakes glass into its area_rate — that would double-charge
  // glass. Block it until every card is trimmed to frame/labour (glass_excluded_from_area_rate=1).
  if (basis === "per_sqm" && surcharge > 0) {
    const untrimmed = await c.env.DB.prepare(
      "SELECT count(*) AS n FROM pricing_rate_card WHERE active = 1 AND COALESCE(glass_excluded_from_area_rate, 0) = 0",
    ).first<{ n: number }>();
    if (Number(untrimmed?.n ?? 0) > 0) {
      return c.json({ error: "area_rate_still_includes_glass",
        detail: `Trim each rate card's area rate to frame/labour and mark glass excluded before setting a per-m² glass price (${untrimmed?.n} card(s) not yet trimmed).` }, 409);
    }
  }

  // Closing a reconciliation gap is an INSERT, not an update — and it must be
  // possible here rather than in a migration, because a context switch to a
  // deploy is exactly how the empty-table state survived twelve migrations.
  // $0 is stored as a ROW: a missing row means "unknown option", which is an
  // error, not a free one.
  try {
    const version = await applyPricingChange(c.env, {
      table: "pricing_option_surcharge", rowId: slug, actor: staff.id,
      expectedVersion: before ? (body?.expectedVersion ?? null) : null,
      before: before ? { surcharge: before.surcharge, basis: before.basis ?? "per_unit", version: before.version } : { surcharge: null, basis: null, version: "v0" },
      after: { surcharge, basis },
      write: (v) => c.env.DB.prepare(
        `INSERT INTO pricing_option_surcharge (id, surcharge, basis, version, active) VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, basis=excluded.basis, version=excluded.version, active=1`,
      ).bind(slug, surcharge, basis, v).run().then(() => undefined),
    });
    return c.json({ ok: true, version });
  } catch (e) {
    if (e instanceof VersionConflict) return c.json({ error: "version_conflict" }, 409);
    throw e;
  }
});

// ── Reconciliation ───────────────────────────────────────────────────────────

opsPricing.get("/reconcile", async (c) => {
  const { staff, deny } = await gate(c, "view");
  if (!staff) return deny;
  // Never invents a result: null means nothing has ever checked, which the banner
  // must be able to say instead of showing an unearned green.
  return c.json({ run: await lastReconcileRun(c.env) });
});

opsPricing.post("/reconcile", async (c) => {
  const { staff, deny } = await gate(c, "view");
  if (!staff) return deny;
  return c.json({ run: await reconcilePricing(c.env) });
});

// ── Policy ───────────────────────────────────────────────────────────────────

// Deposit % is no longer read here — there is one deposit percentage in this
// codebase (0043), DEPOSIT_PERCENT in worker/lib/orders.ts, and it is not a
// policy row nobody could edit correctly without also fixing the three other
// places that used to disagree with it. This endpoint survives as the read of
// `version` (optimistic-concurrency plumbing other pricing screens expect to
// exist) and `gst_mode`, which nothing has ever read either — see the PUT this
// used to sit above, deleted with the deposit control it edited.
opsPricing.get("/policy", async (c) => {
  const { staff, deny } = await gate(c, "view");
  if (!staff) return deny;
  const row = await c.env.DB.prepare("SELECT gst_mode, version FROM pricing_policy WHERE id='default'").first<any>();
  return c.json({
    canEdit: canAdmin(staff),
    policy: { version: row?.version ?? "v1" },
  });
});

// ── Delivery zones (0044) ────────────────────────────────────────────────────
// The Australian domestic delivery leg (design doc §4.4/§6.2) — port cartage,
// warehouse handling, last mile, tailgate. Same conventions as PUT
// /rate-cards/:id exactly: gate() in two lines, read `before` -> 404,
// num() coercion with fall-back-to-stored, negative -> 400 invalid_amount,
// applyPricingChange with expectedVersion, VersionConflict -> 409
// version_conflict, canEdit on every GET.
//
// Zones are edited inline as a SET, against each other (§7.3) rather than
// behind a detail view like a rate card — a zone has one dimension and one
// rate, and the comparisons across zones (WA metro above SA metro, regional
// above metro) are what make a guessed number look right or wrong.

const rowToZone = (r: any) => ({
  id: r.id, label: r.label,
  minCharge: r.min_charge, ratePerSqm: r.rate_per_sqm, maxCharge: r.max_charge,
  isFallback: !!r.is_fallback, sortOrder: r.sort_order, version: r.version,
  active: !!r.active, updatedAt: r.updated_at,
});

/** PARTIAL overlap only — two ranges that intersect without one fully
 *  containing the other. Full containment is the layering mechanism the
 *  seed relies on (§4.4) and must never be reported as a conflict. */
const rangesPartiallyOverlap = (a: { from: number; to: number }, b: { from: number; to: number }): boolean => {
  if (a.from > b.to || b.from > a.to) return false; // no intersection at all
  const aContainsB = a.from <= b.from && b.to <= a.to;
  const bContainsA = b.from <= a.from && a.to <= b.to;
  return !aContainsB && !bContainsA;
};

/** E1. Every zone with its postcode ranges, plus a summary and any partial
 *  overlaps in the table — pairwise over a few dozen rows, not a scale where
 *  O(n²) matters. */
opsPricing.get("/delivery-zones", async (c) => {
  const { staff, deny } = await gate(c, "view");
  if (!staff) return deny;

  const [{ results: zoneRows }, { results: rangeRows }] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, label, min_charge, rate_per_sqm, max_charge, is_fallback, sort_order, version, active, updated_at FROM delivery_zone ORDER BY sort_order",
    ).all<any>(),
    c.env.DB.prepare("SELECT id, zone_id, pc_from, pc_to, note FROM delivery_postcode_range ORDER BY pc_from").all<any>(),
  ]);

  const rangesByZone = new Map<string, { id: number; pcFrom: number; pcTo: number; note: string | null }[]>();
  for (const r of rangeRows ?? []) {
    const list = rangesByZone.get(r.zone_id) ?? [];
    list.push({ id: r.id, pcFrom: r.pc_from, pcTo: r.pc_to, note: r.note });
    rangesByZone.set(r.zone_id, list);
  }
  const zones = (zoneRows ?? []).map((r) => ({ ...rowToZone(r), ranges: rangesByZone.get(r.id) ?? [] }));

  const all = (rangeRows ?? []).map((r) => ({ id: r.id, zoneId: r.zone_id, from: r.pc_from, to: r.pc_to }));
  const overlaps: { a: typeof all[number]; b: typeof all[number] }[] = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (rangesPartiallyOverlap(all[i], all[j])) overlaps.push({ a: all[i], b: all[j] });
    }
  }

  const postcodeCount = (rangeRows ?? []).reduce((s, r) => s + (r.pc_to - r.pc_from + 1), 0);
  const unpricedCount = zones.filter((z) => z.minCharge == null || z.ratePerSqm == null || z.maxCharge == null).length;

  return c.json({
    canEdit: canEdit(staff),
    zones,
    summary: { zoneCount: zones.length, unpricedCount, postcodeCount },
    overlaps,
  });
});

/** E2. Seeds NULL rates, never the fallback's numbers — copying `unmapped`'s
 *  deliberately-high figures into a new zone would produce a plausible-
 *  looking wrong price, and a NULL zone is visibly unfinished. */
opsPricing.post("/delivery-zones", async (c) => {
  const { staff, deny } = await gate(c, "edit");
  if (!staff) return deny;
  const body = await c.req.json().catch(() => ({}));
  const id = String(body?.id ?? "").trim();
  const label = String(body?.label ?? "").trim();
  if (!id || !label) return c.json({ error: "invalid_id" }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM delivery_zone WHERE id = ?").bind(id).first<any>();
  if (existing) return c.json({ error: "id_taken" }, 409);

  const sortRow = await c.env.DB.prepare("SELECT COALESCE(MAX(sort_order),0) AS m FROM delivery_zone").first<{ m: number }>();
  await c.env.DB.prepare(
    "INSERT INTO delivery_zone (id, label, sort_order, version, active) VALUES (?, ?, ?, 'v1', 1)",
  ).bind(id, label, (sortRow?.m ?? 0) + 10).run();

  return c.json({ ok: true, id });
});

/** E3. */
opsPricing.put("/delivery-zones/:id", async (c) => {
  const { staff, deny } = await gate(c, "edit");
  if (!staff) return deny;
  const id = c.req.param("id");

  const before = await c.env.DB.prepare(
    "SELECT id, label, min_charge, rate_per_sqm, max_charge, active, version FROM delivery_zone WHERE id = ?",
  ).bind(id).first<any>();
  if (!before) return c.json({ error: "not_found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const label = typeof body?.label === "string" && body.label.trim() ? body.label.trim() : before.label;
  const minCharge = "minCharge" in (body ?? {}) ? num(body.minCharge) : before.min_charge;
  const ratePerSqm = "ratePerSqm" in (body ?? {}) ? num(body.ratePerSqm) : before.rate_per_sqm;
  const maxCharge = "maxCharge" in (body ?? {}) ? num(body.maxCharge) : before.max_charge;
  const active = typeof body?.active === "boolean" ? (body.active ? 1 : 0) : before.active;

  // A negative delivery charge is not a discount, it is a typo that pays the
  // customer to receive their windows (schema CHECK, restated so the console
  // gets a clean 400 rather than a raw SQLite constraint error).
  if ((minCharge != null && minCharge < 0) || (ratePerSqm != null && ratePerSqm < 0) || (maxCharge != null && maxCharge < 0)) {
    return c.json({ error: "invalid_amount" }, 400);
  }
  // A cap under a floor is a formula that always returns the floor.
  if (minCharge != null && maxCharge != null && maxCharge < minCharge) {
    return c.json({ error: "max_below_min" }, 400);
  }

  try {
    const version = await applyPricingChange(c.env, {
      table: "delivery_zone", rowId: id, actor: staff.id,
      expectedVersion: body?.expectedVersion ?? null,
      before: {
        label: before.label, minCharge: before.min_charge, ratePerSqm: before.rate_per_sqm,
        maxCharge: before.max_charge, active: !!before.active, version: before.version,
      },
      after: { label, minCharge, ratePerSqm, maxCharge, active: !!active },
      write: (v) => c.env.DB.prepare(
        "UPDATE delivery_zone SET label=?, min_charge=?, rate_per_sqm=?, max_charge=?, active=?, version=?, updated_at=datetime('now') WHERE id=?",
      ).bind(label, minCharge, ratePerSqm, maxCharge, active, v, id).run().then(() => undefined),
    });
    return c.json({ ok: true, version });
  } catch (e) {
    if (e instanceof VersionConflict) return c.json({ error: "version_conflict" }, 409);
    throw e;
  }
});

/** E4. No downstream-dependency check, by design (§6.2): the estimate is
 *  computed live from the postcode, so a deleted zone's postcodes simply
 *  fall to the fallback — the dearest row — on the next read. Ranges cascade
 *  (delivery_postcode_range.zone_id is ON DELETE CASCADE). */
opsPricing.delete("/delivery-zones/:id", async (c) => {
  const { staff, deny } = await gate(c, "edit");
  if (!staff) return deny;
  const id = c.req.param("id");
  if (id === "unmapped") return c.json({ error: "cannot_delete_fallback" }, 400);

  const row = await c.env.DB.prepare("SELECT id FROM delivery_zone WHERE id = ?").bind(id).first<any>();
  if (!row) return c.json({ error: "not_found" }, 404);

  await c.env.DB.prepare("DELETE FROM delivery_zone WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

/** Postcode ranges. Not one of E1-E5 by name, but under the same prefix and
 *  needing no route registration either. Row-by-row (the id is a bare rowid,
 *  "a postcode band has no natural key") rather than the whole-list-replace
 *  pattern the modifier editor uses — ranges are independently addressable
 *  and there is no ordering within a zone for an interrupted write to lose. */
opsPricing.post("/delivery-zones/:zoneId/ranges", async (c) => {
  const { staff, deny } = await gate(c, "edit");
  if (!staff) return deny;
  const zoneId = c.req.param("zoneId");

  const zone = await c.env.DB.prepare("SELECT id FROM delivery_zone WHERE id = ?").bind(zoneId).first<any>();
  if (!zone) return c.json({ error: "not_found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const pcFrom = num(body?.pcFrom), pcTo = num(body?.pcTo);
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  if (pcFrom == null || pcTo == null || pcFrom < 200 || pcFrom > 9999 || pcTo < 200 || pcTo > 9999 || pcTo < pcFrom) {
    return c.json({ error: "invalid_range" }, 400);
  }

  const { results: existing } = await c.env.DB.prepare("SELECT id, zone_id, pc_from, pc_to FROM delivery_postcode_range").all<any>();
  const candidate = { from: pcFrom, to: pcTo };
  const conflict = (existing ?? []).find((r) => rangesPartiallyOverlap(candidate, { from: r.pc_from, to: r.pc_to }));
  if (conflict) {
    return c.json({
      error: "range_overlap",
      conflict: { id: conflict.id, zoneId: conflict.zone_id, pcFrom: conflict.pc_from, pcTo: conflict.pc_to },
    }, 409);
  }

  const result = await c.env.DB.prepare(
    "INSERT INTO delivery_postcode_range (zone_id, pc_from, pc_to, note) VALUES (?, ?, ?, ?)",
  ).bind(zoneId, pcFrom, pcTo, note).run();
  return c.json({ ok: true, id: Number(result.meta?.last_row_id) });
});

opsPricing.delete("/delivery-zones/:zoneId/ranges/:rangeId", async (c) => {
  const { staff, deny } = await gate(c, "edit");
  if (!staff) return deny;
  const zoneId = c.req.param("zoneId");
  const rangeId = Number(c.req.param("rangeId"));

  const row = await c.env.DB.prepare("SELECT id FROM delivery_postcode_range WHERE id = ? AND zone_id = ?").bind(rangeId, zoneId).first<any>();
  if (!row) return c.json({ error: "not_found" }, 404);

  await c.env.DB.prepare("DELETE FROM delivery_postcode_range WHERE id = ?").bind(rangeId).run();
  return c.json({ ok: true });
});

// ── Catalogue mirror (read-only, but honest) ─────────────────────────────────

/** What the ENGINE loaded, not what the browser bundle happens to contain.
 *
 *  The previous Catalogue screen imported src/data/catalogue directly — the
 *  build-time xlsx artefact — while the Worker hydrates from Sanity every 5
 *  minutes. The screen could therefore show something other than what production
 *  prices against, with nothing to indicate it. `source` makes the difference
 *  legible, and "builtin" when Sanity is unreachable is itself worth knowing. */
opsPricing.get("/catalogue", async (c) => {
  const { staff, deny } = await gate(c, "view");
  if (!staff) return deny;
  await ensureCatalogue(c.env);

  const { results: cards } = await c.env.DB.prepare("SELECT id FROM pricing_rate_card WHERE active = 1").all<{ id: string }>();
  const haveCard = new Set((cards ?? []).map((r) => r.id));

  return c.json({
    ...catalogueStatus(),
    productCount: products.length,
    categories: getCategories().map((cat) => ({
      slug: cat.slug, name: cat.name,
      families: getFamiliesByCategory(cat.slug).map((fam) => {
        const fp = products.filter((p) => p.familySlug === fam.slug);
        return {
          slug: fam.slug, name: fam.name,
          productCount: fp.length,
          optionCount: new Set(fp.flatMap((p) => p.options.map((o) => `${o.typeSlug}:${o.name}`))).size,
          // Cards are per product now: a family is covered when every product in
          // it has one, and partial coverage is worth seeing.
          hasRateCard: fp.length > 0 && fp.every((p) => haveCard.has(p.slug)),
          productsWithoutCard: fp.filter((p) => !haveCard.has(p.slug)).map((p) => p.slug),
        };
      }),
    })),
  });
});
