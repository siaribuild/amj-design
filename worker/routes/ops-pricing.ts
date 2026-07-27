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
  applyPricingChange, draftExposure, lastReconcileRun, loadHistory, previewSample,
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
// What survives as a guard is CONFIRMATION rather than role: the rate-card editor
// still refuses a save whose expectedVersion is stale, still records before/after
// on every write, and the console still makes a change past ±20% type the family
// slug. Those catch the mistake a role never would.
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

// A rate card's own typical example, so the index column is comparable row to row.
const INDEX_SAMPLE: SampleSize = { key: "typical", widthMm: 1200, heightMm: 1200, qty: 1 };

// ── Rate cards ───────────────────────────────────────────────────────────────

/** The index. Read-only by design: two numbers with only a total for feedback is
 *  exactly the mistyped-rate scenario, so editing opens the detail view where the
 *  worked example lives. The `example` column earns its place by making a wrong
 *  row visible AT REST — $237 in a column of four-figure numbers jumps out in a
 *  way that "13.00" in a rate cell never does. */
opsPricing.get("/rate-cards", async (c) => {
  const { staff, deny } = await gate(c, "view");
  if (!staff) return deny;

  const { results } = await c.env.DB.prepare(
    "SELECT id, perim_rate, area_rate, min_charge, version, updated_at FROM pricing_rate_card WHERE active = 1 ORDER BY id",
  ).all<any>();

  const cards = await Promise.all((results ?? []).map(async (r) => {
    const modifiers = await loadModifiers(c.env, r.id);
    const snap = await previewSample(c.env, { rate: rowToCard(r), modifiers, sample: INDEX_SAMPLE });
    return {
      id: r.id, perimRate: r.perim_rate, areaRate: r.area_rate, minCharge: r.min_charge ?? 0,
      version: r.version, updatedAt: r.updated_at, modifierCount: modifiers.length,
      exampleTotal: snap.total,
      // Cards are keyed on the product slug (0031), so the row can name the
      // product and the family it belongs to.
      productName: products.find((p) => p.slug === r.id)?.name ?? null,
      familySlug: products.find((p) => p.slug === r.id)?.familySlug ?? null,
    };
  }));

  return c.json({ canEdit: canEdit(staff), sample: INDEX_SAMPLE, cards });
});

opsPricing.get("/rate-cards/:id", async (c) => {
  const { staff, deny } = await gate(c, "view");
  if (!staff) return deny;
  const id = c.req.param("id");

  const row = await c.env.DB.prepare(
    "SELECT id, perim_rate, area_rate, min_charge, version, updated_at FROM pricing_rate_card WHERE id = ?",
  ).bind(id).first<any>();
  if (!row) return c.json({ error: "not_found" }, 404);

  const [modifiers, sizes, history, exposure] = await Promise.all([
    loadModifiers(c.env, id),
    sampleSizes(c.env, id),
    loadHistory(c.env, "pricing_rate_card", id),
    draftExposure(c.env, id),
  ]);

  return c.json({
    canEdit: canEdit(staff), canRevert: canAdmin(staff),
    card: rowToCard(row), updatedAt: row.updated_at,
    modifiers, samples: sizes.samples, samplesFromHistory: sizes.fromHistory, sampleLineCount: sizes.lineCount,
    draftExposure: exposure,
    history: history.map((h) => ({
      id: h.id, fromVersion: h.from_version, toVersion: h.to_version,
      before: h.before_json, after: h.after_json, note: h.note,
      actor: h.actor_name || h.actor, createdAt: h.created_at,
    })),
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
      table: "pricing_rate_card", rowId: id, actor: staff.id, note: body?.note,
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
      table: "pricing_modifier", rowId: id, actor: staff.id, note: body?.note,
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

/** Revert to an earlier version — as a NEW forward change, never a rewind.
 *
 *  Cheap undo is what makes it defensible not to gate rate edits behind a second
 *  person's approval: in a four-person shop an approval queue resolves to either
 *  self-approval or a verbal yes clicked on someone else's behalf, which is worse
 *  than no gate because it looks like a control. */
opsPricing.post("/rate-cards/:id/revert", async (c) => {
  const { staff, deny } = await gate(c, "admin");
  if (!staff) return deny;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const change = await c.env.DB.prepare(
    "SELECT before_json, from_version FROM pricing_change WHERE table_name='pricing_rate_card' AND row_id=? AND to_version=?",
  ).bind(id, String(body?.toVersion ?? "")).first<any>();
  if (!change) return c.json({ error: "not_found" }, 404);

  let target: any;
  try { target = JSON.parse(change.before_json || "{}"); } catch { return c.json({ error: "unreadable_history" }, 422); }
  const perimRate = num(target?.perimRate), areaRate = num(target?.areaRate), minCharge = num(target?.minCharge) ?? 0;
  if (perimRate == null || areaRate == null) return c.json({ error: "unreadable_history" }, 422);

  const before = await c.env.DB.prepare(
    "SELECT perim_rate, area_rate, min_charge, version FROM pricing_rate_card WHERE id = ?",
  ).bind(id).first<any>();
  if (!before) return c.json({ error: "not_found" }, 404);

  const version = await applyPricingChange(c.env, {
    table: "pricing_rate_card", rowId: id, actor: staff.id,
    note: `Reverted to ${change.from_version ?? "an earlier version"}`,
    before: { perimRate: before.perim_rate, areaRate: before.area_rate, minCharge: before.min_charge ?? 0, version: before.version },
    after: { perimRate, areaRate, minCharge },
    write: (v) => c.env.DB.prepare(
      "UPDATE pricing_rate_card SET perim_rate=?, area_rate=?, min_charge=?, version=?, updated_at=datetime('now') WHERE id=?",
    ).bind(perimRate, areaRate, minCharge, v, id).run().then(() => undefined),
  });
  return c.json({ ok: true, version });
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
    c.env.DB.prepare("SELECT id, surcharge, version FROM pricing_option_surcharge WHERE active = 1 ORDER BY id").all<any>(),
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
      slug: r.id, surcharge: r.surcharge, version: r.version, offeredBy: offered.get(r.id)?.length ?? 0,
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
    "SELECT surcharge, version FROM pricing_option_surcharge WHERE id = ?",
  ).bind(slug).first<any>();

  // Closing a reconciliation gap is an INSERT, not an update — and it must be
  // possible here rather than in a migration, because a context switch to a
  // deploy is exactly how the empty-table state survived twelve migrations.
  // $0 is stored as a ROW: a missing row means "unknown option", which is an
  // error, not a free one.
  try {
    const version = await applyPricingChange(c.env, {
      table: "pricing_option_surcharge", rowId: slug, actor: staff.id, note: body?.note,
      expectedVersion: before ? (body?.expectedVersion ?? null) : null,
      before: before ? { surcharge: before.surcharge, version: before.version } : { surcharge: null, version: "v0" },
      after: { surcharge },
      write: (v) => c.env.DB.prepare(
        `INSERT INTO pricing_option_surcharge (id, surcharge, version, active) VALUES (?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET surcharge=excluded.surcharge, version=excluded.version, active=1`,
      ).bind(slug, surcharge, v).run().then(() => undefined),
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

opsPricing.get("/policy", async (c) => {
  const { staff, deny } = await gate(c, "view");
  if (!staff) return deny;
  const row = await c.env.DB.prepare("SELECT deposit_percent, gst_mode, version FROM pricing_policy WHERE id='default'").first<any>();
  const history = await loadHistory(c.env, "pricing_policy", "default");
  return c.json({
    canEdit: canAdmin(staff),
    policy: { depositPercent: row?.deposit_percent ?? 40, version: row?.version ?? "v1" },
    history: history.map((h) => ({ id: h.id, toVersion: h.to_version, before: h.before_json, after: h.after_json, note: h.note, actor: h.actor_name || h.actor, createdAt: h.created_at })),
  });
});

// Deposit % only. `pricing_policy.gst_mode` is deliberately NOT editable: nothing
// reads it — customer-facing GST comes from user.price_gst_mode via gstAdjust —
// so a control bound to it would be a knob that appears to work and does nothing,
// which is strictly worse than its absence.
opsPricing.put("/policy", async (c) => {
  const { staff, deny } = await gate(c, "admin");
  if (!staff) return deny;
  const body = await c.req.json().catch(() => ({}));
  const depositPercent = num(body?.depositPercent);
  if (depositPercent == null || depositPercent < 0 || depositPercent > 100) return c.json({ error: "invalid_amount" }, 400);

  const before = await c.env.DB.prepare("SELECT deposit_percent, version FROM pricing_policy WHERE id='default'").first<any>();
  if (!before) return c.json({ error: "not_found" }, 404);

  try {
    const version = await applyPricingChange(c.env, {
      table: "pricing_policy", rowId: "default", actor: staff.id, note: body?.note,
      expectedVersion: body?.expectedVersion ?? null,
      before: { depositPercent: before.deposit_percent, version: before.version },
      after: { depositPercent },
      write: (v) => c.env.DB.prepare("UPDATE pricing_policy SET deposit_percent=?, version=? WHERE id='default'")
        .bind(depositPercent, v).run().then(() => undefined),
    });
    return c.json({ ok: true, version });
  } catch (e) {
    if (e instanceof VersionConflict) return c.json({ error: "version_conflict" }, 409);
    throw e;
  }
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
