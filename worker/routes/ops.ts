// /api/ops — internal ops console API (staff-gated).
//
// O1: staff auth (domain-allowlisted internal OTP for dev; Cloudflare Access in
// prod), identity, and a dashboard summary. Queues, the quote workspace,
// the merged project record, enquiries, pricing and admin.
import { Hono } from "hono";
import type { Env } from "../types";
import {
  challengeAllowed, challengeSourceAllowed, clearCookie, consumeChallenge, createSession, destroySession,
  isDevEnv, isEmail, normEmail, sessionCookie, sixDigit, storeChallenge, userDto,
} from "../lib/auth";
import { sourceIp } from "../lib/captcha";
import { notify } from "../lib/email";
import { findOrCreateInternalUser, isStaffEmail, resolveOpsUser, resolveStaff } from "../lib/staff";
import { drainLearningOutbox, issueQuote, ISSUABLE_FROM } from "../lib/issue";
import {
  deliveryCost, loadProjectAreaM2, loadZonesAndRanges, normalisePostcode, resolveZone, zoneIsPriced,
  type DeliveryZone,
} from "../lib/delivery";
import { logEvent } from "../lib/activity";
import {
  splitLine, mergeComposite, recomputeComposite,
  updateSegment, addSegment, removeSegment, loadCompositePolicy, compatibilityConflict,
} from "../lib/composite";
import { orderDto, orderLines, applyTransition, markPaid, availableActions, STAGE_LABEL, type Stage, type OrderRow } from "../lib/orders";
import { lifecycleOf, daysSince } from "../lib/lifecycle";
import { actionsFor } from "../lib/ops-actions";
import { uuid, normNote } from "../lib/util";
import { scanFile } from "../lib/scan";
import {
  pricingOptionSlugsFromOptions, runProjectEstimate, toOpeningInput, type OpeningRow,
} from "../lib/estimator/estimate";
import { createCatalogueRepository, sanityExecutor } from "../lib/estimator/catalogue";
import { checkHardRules } from "../lib/estimator/rules";
import { retryCurrentAiExtraction } from "../lib/ai/jobs";
import { isOverrideReason, OVERRIDE_REASONS } from "../lib/ai/schema";
import { refreshLearningExampleEligibility } from "../lib/ai/examples";
import { getProductBySlug, families } from "../../src/data/catalogue";
import { priceItem } from "../lib/lines";
import { MissingSurcharge, priceLine } from "../lib/estimator/pricing";
import { opsPricing } from "./ops-pricing";

export const ops = new Hono<{ Bindings: Env }>();

// The D1 commercial layer's editor (rate cards, option surcharges, modifiers,
// policy) plus catalogue reconciliation. Its own file: it is a distinct surface
// with its own role gates, and ops.ts is already long enough.
ops.route("/pricing", opsPricing);

// Internal workflow state machine (status_internal). 'issued' is reached via
// issue-quote; 'customer_clarification_required' via request-clarification.
//
// There is no approval step. The rules that decided WHICH quotes needed sign-off
// are gone, and with anyone able to approve — including the person who submitted
// it — a mandatory gate would log "approved by the author" and manufacture
// assurance nobody actually gave. A priced quote is issued by whoever works it.
const FLOW: Record<string, string[]> = {
  submitted: ["triage_pending", "estimator_assigned", "customer_clarification_required"],
  triage_pending: ["estimator_assigned", "customer_clarification_required"],
  estimator_assigned: ["technical_review_required", "customer_clarification_required", "issued"],
  technical_review_required: ["estimator_assigned", "customer_clarification_required", "issued"],
  customer_clarification_required: ["estimator_assigned"],
};

export const STATUS_INTERNAL_LABEL: Record<string, string> = {
  draft: "Draft", submitted: "Submitted", triage_pending: "Awaiting triage",
  estimator_assigned: "Assigned", technical_review_required: "Technical review",
  customer_clarification_required: "Awaiting customer", issued: "Quote issued",
};

const safeParse = (s: string): Record<string, any> => {
  try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
};

// ── Access ───────────────────────────────────────────────────────────────────
// FLAT, by owner decision (2026-07-28): every OpenFrame staff user has full
// access. The four personas — estimator / technical_reviewer / manager / admin —
// gated three things inconsistently (a technical_reviewer could not issue a
// quote, which was an accident rather than a policy) and, with two staff who are
// both admins, distinguished nobody.
//
// The perimeter is Cloudflare Access on the ops.* host, not an in-app dropdown.
// That is the honest description of what actually protects this: anyone who
// reaches the console can record a payment, change a rate card and change a
// customer's sign-in email. Where the consequence is irreversible the guard is a
// CONFIRMATION — the rate-card editor's typed-slug tripwire, the payment
// reference — rather than a role that two people both hold.
//
// The one role boundary still worth having is a manufacturer scoped to Enquiries.
// That is a different persona with a different sign-in, not a value of this
// column, and it is not built yet.
// A MANUFACTURER partner signs in through the same console but is not staff.
// They reach the enquiry surface and nothing else — enforced here, per endpoint,
// rather than by hiding a tab, because a partner who guesses a URL must still be
// refused. Every `isStaffUser` gate below therefore excludes them.
const isManufacturer = (staff: { role: string | null } | null) => staff?.role === "manufacturer";
const isStaffUser = (staff: { role: string | null } | null) => !!staff && !isManufacturer(staff);
const hasAssignedRole = isStaffUser;
const canRecordPayment = isStaffUser;
const canManageLearning = isStaffUser;
const canIssueQuote = isStaffUser;
const canAdjudicateThermal = isStaffUser;

async function unresolvedLineCount(env: Env, projectId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT count(*) AS count FROM quote_line
      WHERE project_id=?
        AND (status <> 'ready' OR line_total IS NULL)`,
  ).bind(projectId).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

interface LineRow {
  id: string; project_id: string; external_ref: string | null; room_label: string | null; product_slug: string;
  options_json: string; dims_json: string; qty: number; line_total: number | null; status: string;
  origin?: string | null; review_json?: string | null;
  ai_proposal_line_id?: string | null; selected_variant_id?: string | null;
  configuration_snapshot_json?: string | null; pricing_snapshot_json?: string | null;
  edited_fields?: string | null; edit_version: number;
  owner_user_id?: string | null;
  quote_edit_version?: number;
  // Composite shape. Read through `as` casts before, which is how the PATCH
  // handler came to price a composite parent as if it were a single frame — the
  // discriminator was in the row all along and simply not in the type.
  line_kind?: string | null;
  parent_line_id?: string | null;
  composite_axis?: string | null;
  coverage_delta_mm?: number | null;
}

const opsLineDto = (r: LineRow) => {
  const dims = safeParse(r.dims_json);
  const review = r.review_json ? safeParse(r.review_json) : null;
  return {
    id: r.id,
    code: r.external_ref ?? "",
    room: r.room_label ?? "",
    productSlug: r.product_slug,
    productName: getProductBySlug(r.product_slug)?.name ?? r.product_slug,
    width: String(dims.width ?? ""),
    height: String(dims.height ?? ""),
    options: safeParse(r.options_json),
    qty: r.qty,
    lineTotal: r.line_total,
    status: r.status,
    selectedVariantId: r.selected_variant_id ?? null,
    // Provenance + unresolved technical-review reasons, so staff can see and act
    // on the flags the parser raised (material substitution, out-of-range, glazing…).
    origin: r.origin ?? "manual",
    review: review && Object.keys(review).length ? (review as Record<string, string>) : null,
    // 'simple' | 'composite_parent'. A composite is ONE opening built from several
    // joined frames; its segments are never loose items beside it.
    lineKind: (r as { line_kind?: string }).line_kind ?? "simple",
    compositeAxis: (r as { composite_axis?: string | null }).composite_axis ?? null,
    // 0046 — what the rate card said, when a human has overridden it. NULL is
    // the whole test for "not overridden"; lineTotal is the price either way,
    // so nothing downstream has to know this exists.
    priceCalculated: (r as { price_calculated?: number | null }).price_calculated ?? null,
    priceOverrideAt: (r as { price_override_at?: string | null }).price_override_at ?? null,
  };
};

/** Whether Cloudflare Access is the configured identity for this deployment.
 *
 *  Read by the OTP routes below as well as by resolveInternalUser, because the
 *  two must agree: the perimeter cannot be "Access" for reads and "an emailed
 *  six-digit code" for the write that creates the staff row. */
const accessIsConfigured = (env: Env) => !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);

/** The OTP sign-in seam is LOCAL/STAGING ONLY, and says so by not existing in
 *  production.
 *
 *  These two routes are mounted on the shared /api app, which worker/index.ts
 *  serves on every hostname — `isOps` there only picks which SPA shell to return.
 *  Cloudflare Access is a hostname policy on ops.*, so until this guard existed
 *  `POST https://<customer-host>/api/ops/auth/verify` reached findOrCreateInternalUser
 *  without any assertion at all: an Access-free write into the identity table that
 *  creates the internal user, flips an existing customer row to type='internal',
 *  and fires the admin bootstrap. The comment above ("the perimeter is Cloudflare
 *  Access on the ops.* host") was true for every read and false for that write.
 *
 *  404 rather than 403 because in Access mode the route genuinely is not part of
 *  this deployment's surface. Nothing usable is lost: the session these routes
 *  mint is already ignored for ops reads (resolveInternalUser reads the assertion
 *  and never the cookie), so in production they could only ever write. If Access
 *  is misconfigured the recovery path is `wrangler d1 execute --remote`, which is
 *  the same break-glass the runbook already documents for every ops read. */
const otpDisabledInAccessMode = (c: { env: Env }) => accessIsConfigured(c.env);

// POST /api/ops/auth/challenge { email } — allowlisted staff only; neutral otherwise.
ops.post("/auth/challenge", async (c) => {
  if (otpDisabledInAccessMode(c)) return c.json({ error: "not_found" }, 404);
  // Same per-source cap as the customer challenge, sharing the same counter so
  // rotating between the two endpoints does not buy a second budget. No captcha
  // here: recipients are already bounded to the configured domains, and in
  // production this route does not exist at all (see the guard above), so a
  // widget on the ops sign-in screen would guard a 404.
  if (!(await challengeSourceAllowed(c.env, sourceIp(c.req.raw)))) {
    return c.json({ error: "rate_limited" }, 429);
  }
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(body?.email);
  if (isEmail(email) && isStaffEmail(c.env, email) && (await challengeAllowed(c.env, email))) {
    const code = sixDigit();
    await storeChallenge(c.env, email, code);
    await notify(c.env, {
      recipient: email,
      eventType: "ops.code.requested",
      templateKey: "ops_signin_code",
      vars: { code },
      email: { to: email, subject: "Your OpenFrame ops sign-in code", text: `Your ops console code is ${code}. It expires in 10 minutes.` },
    });
    if (isDevEnv(c.env)) return c.json({ ok: true, devCode: code });
  }
  return c.json({ ok: true });
});

// POST /api/ops/auth/verify { email, code } — starts an internal-user session.
ops.post("/auth/verify", async (c) => {
  if (otpDisabledInAccessMode(c)) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(body?.email);
  const code = String(body?.code ?? "").trim();
  if (!isEmail(email) || !isStaffEmail(c.env, email) || !/^\d{6}$/.test(code)) {
    return c.json({ error: "invalid_code" }, 400);
  }
  if (!(await consumeChallenge(c.env, email, code))) return c.json({ error: "invalid_code" }, 400);

  const user = await findOrCreateInternalUser(c.env, email);
  const token = await createSession(c.env, user);
  c.header("Set-Cookie", sessionCookie(token, c.env), { append: true });
  return c.json({ authenticated: true, user: userDto(user) });
});

ops.post("/auth/logout", async (c) => {
  await destroySession(c.env, c.req.raw);
  c.header("Set-Cookie", clearCookie("apertly_session", c.env));
  // When Access is configured it IS the identity: resolveInternalUser reads the
  // Cf-Access-Jwt-Assertion header and ignores the session cookie entirely. So
  // the two lines above sign NOBODY out in production — they delete a KV session
  // that is not being consulted and clear a cookie that is not being read, and
  // Cloudflare re-injects a valid assertion on the very next request. Only Access
  // can end an Access session, and only from the browser, so hand the client the
  // endpoint to navigate to. Host-relative on purpose: /cdn-cgi/* is handled at
  // the Cloudflare edge before the Worker sees it, and scoping the logout to this
  // hostname signs the user out of ops rather than every Access app in the org.
  return c.json({ ok: true, accessLogout: accessIsConfigured(c.env) ? "/cdn-cgi/access/logout" : null });
});

// GET /api/ops/brand — the logo and business name from Sanity Site Settings.
//
// Deliberately NOT staff-gated: it is served on the sign-in screen, and every
// value in it is already public (the logo is a Sanity CDN URL the marketing site
// serves to anonymous visitors). Gating it would only mean the login screen
// could not be branded.
//
// Never invents a brand. With Sanity unreachable or the field unset it returns
// nulls and the console falls back to its wordmark — the same rule the
// server-rendered <head> follows: carry less rather than a placeholder.
ops.get("/brand", async (c) => {
  const empty = { logo: null as string | null, businessName: null as string | null };
  if (!c.env.SANITY_PROJECT_ID) return c.json(empty);
  const cacheKey = "ops:brand";
  try {
    const cached = await c.env.KV.get(cacheKey);
    if (cached) return c.json(JSON.parse(cached));
    const query = encodeURIComponent(`*[_type=="siteSettings"][0]{businessName, "logo": logo.asset->url}`);
    const res = await fetch(
      `https://${c.env.SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${c.env.SANITY_DATASET || "production"}?query=${query}`,
    );
    const { result } = await res.json<{ result?: { businessName?: string; logo?: string } }>();
    const brand = { logo: result?.logo ?? null, businessName: result?.businessName ?? null };
    // Short TTL: a logo change should reach the console the same day without a
    // deploy, and this is one small request an hour.
    await c.env.KV.put(cacheKey, JSON.stringify(brand), { expirationTtl: 3600 });
    return c.json(brand);
  } catch {
    return c.json(empty);
  }
});

// GET /api/ops/me — the acting staff member, or 401.
ops.get("/me", async (c) => {
  const staff = await resolveOpsUser(c.env, c.req.raw);
  if (!staff) return c.json({ authenticated: false, user: null }, 401);
  return c.json({ authenticated: true, user: userDto(staff) });
});

// GET /api/ops/summary — dashboard counts (staff-gated). Resilient: a query
// failure degrades to zeros rather than 500-ing the whole dashboard.
ops.get("/summary", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);

  try {
    const row = await c.env.DB.prepare(`
      SELECT
        (SELECT count(*) FROM project WHERE status_customer = 'submitted')                       AS submissions,
        (SELECT count(*) FROM project WHERE status_customer = 'under_review')                    AS in_review,
        (SELECT count(*) FROM "order" WHERE stage NOT IN ('after_sales','cancelled'))            AS active_orders,
        (SELECT count(*) FROM "order" WHERE stage IN ('deposit_invoiced','balance_invoiced'))    AS awaiting_payment,
        (SELECT count(*) FROM user WHERE type = 'customer')                                       AS customers,
        (SELECT count(*) FROM project p2 WHERE p2.status_internal IN ('estimator_assigned','technical_review_required')
           AND NOT EXISTS (SELECT 1 FROM quote_line l2 WHERE l2.project_id = p2.id
                            AND (l2.status <> 'ready' OR l2.line_total IS NULL)))                        AS ready_to_issue,
        (SELECT count(*) FROM enquiry WHERE workflow_status = 'new')                              AS new_enquiries
    `).first<Record<string, number>>();

    return c.json({
      submissions: row?.submissions ?? 0,
      inReview: row?.in_review ?? 0,
      activeOrders: row?.active_orders ?? 0,
      awaitingPayment: row?.awaiting_payment ?? 0,
      customers: row?.customers ?? 0,
      readyToIssue: row?.ready_to_issue ?? 0,
      newEnquiries: row?.new_enquiries ?? 0,
    });
  } catch {
    return c.json({ submissions: 0, inReview: 0, activeOrders: 0, awaitingPayment: 0, customers: 0, readyToIssue: 0, newEnquiries: 0, degraded: true });
  }
});

// GET /api/ops/queues/submissions — projects awaiting triage / review.
ops.get("/queues/submissions", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const { results } = await c.env.DB.prepare(`
    SELECT p.id, p.title, p.status_customer, p.status_internal, p.updated_at,
           o.name AS org_name, u.name AS customer_name, u.email AS customer_email,
           -- PARENTS ONLY — same rule as loadLines(). A segment must never be
           -- summed beside the parent that already aggregates it.
           (SELECT count(*) FROM quote_line WHERE project_id = p.id AND parent_line_id IS NULL) AS item_count,
           (SELECT COALESCE(SUM(line_total), 0) FROM quote_line WHERE project_id = p.id AND parent_line_id IS NULL) AS total
      FROM project p
      LEFT JOIN organisation o ON o.id = p.organisation_id
      LEFT JOIN user u  ON u.id  = p.owner_user_id
     WHERE p.status_customer IN ('submitted','needs_information','under_review')
     ORDER BY p.updated_at ASC`).all();
  return c.json({ submissions: results });
});

// GET /api/ops/projects/:id — the internal quote workspace.
// GET /api/ops/projects — THE list. One row per job, whatever stage it is at:
// what used to be the Quotes queue and the Orders list are the same set of
// records filtered differently, so they are one query with a derived phase.
//
// Sorted by "ours first, then longest neglected". Deliberately NOT updated_at:
// that moves when the CUSTOMER replies, which buries the thing we have to do
// underneath the thing that just happened.
ops.get("/projects", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const { results } = await c.env.DB.prepare(`
    SELECT p.id, p.title, p.public_ref, p.status_customer, p.status_internal, p.updated_at,
           p.contact_name, p.contact_email, p.delivery_amount,
           o.name AS org_name, u.name AS customer_name, u.email AS customer_email,
           ord.id AS order_id, ord.order_no, ord.stage AS order_stage, ord.total AS order_total,
           (SELECT count(*) FROM quote_line l WHERE l.project_id = p.id AND l.parent_line_id IS NULL) AS line_count,
           (SELECT COALESCE(sum(l.line_total), 0) FROM quote_line l WHERE l.project_id = p.id AND l.parent_line_id IS NULL) AS draft_total,
           (SELECT count(*) FROM quote_line l WHERE l.project_id = p.id AND l.parent_line_id IS NULL AND (l.status <> 'ready' OR l.line_total IS NULL)) AS unresolved
      FROM project p
      LEFT JOIN organisation o ON o.id = p.organisation_id
      LEFT JOIN user u   ON u.id   = p.owner_user_id
      LEFT JOIN "order" ord ON ord.project_id = p.id
     WHERE p.status_customer <> 'draft'
     ORDER BY p.updated_at DESC`).all<any>();

  const projects = (results ?? []).map((r) => {
    const lifecycle = lifecycleOf({
      statusInternal: r.status_internal, statusCustomer: r.status_customer, orderStage: r.order_stage,
    });
    // Three different meanings can occupy the value column. Say which one this is
    // — a number read down a phone with the wrong basis is worse than no number.
    // "issued": lines can't change while status_internal='issued' (the edit
    // lock), so goods (draft_total) + the frozen delivery_amount IS the issued
    // figure — no separate snapshot to read it from any more.
    const issuedNow = r.status_internal === "issued";
    const value = r.order_id ? Number(r.order_total ?? 0)
      : issuedNow ? Number(r.draft_total ?? 0) + Number(r.delivery_amount ?? 0)
      : Number(r.draft_total ?? 0);
    const valueBasis = r.order_id ? "contract" : issuedNow ? "issued" : "est.";
    return {
      id: r.id, ref: r.public_ref ?? r.id, title: r.title ?? "Untitled project",
      customerName: r.customer_name ?? r.contact_name ?? null,
      customerEmail: r.customer_email ?? r.contact_email ?? null,
      org: r.org_name ?? null,
      lineCount: Number(r.line_count ?? 0),
      value, valueBasis,
      unresolved: Number(r.unresolved ?? 0),
      orderNo: r.order_no ?? null,
      ...lifecycle,
      daysInStage: daysSince(r.updated_at),
      updatedAt: r.updated_at,
    };
  });

  // "Ours" first, then the longest-neglected within each group.
  const rank = { Us: 0, Customer: 1, Nobody: 2 } as const;
  projects.sort((a, b) =>
    rank[a.waitingOn] - rank[b.waitingOn] || (b.daysInStage ?? 0) - (a.daysInStage ?? 0));

  return c.json({ projects });
});

// ── Delivery (0044, design doc §6.7/§7.1) ───────────────────────────────────
// The machine estimate is computed LIVE on every read (§5.5) — never stored,
// never staled by a rate edit. `delivery_amount` is the staff-confirmed
// figure, and its NULLABILITY is the gate: NULL means unsettled, 0 means
// settled at zero (the trade-waiver case, D14). Every test on this object
// tests `== null`, never truthiness — see migrations/0044's own warning.
async function buildDeliveryDto(env: Env, p: Record<string, any>) {
  const [{ zones, ranges }, area] = await Promise.all([
    loadZonesAndRanges(env),
    loadProjectAreaM2(env, p.id),
  ]);
  const resolution = resolveZone(p.delivery_postcode ?? null, zones, ranges);
  const zone = resolution.zone;
  const priced = !!zone && zoneIsPriced(zone);
  const pricedZone = priced ? (zone as DeliveryZone & { minCharge: number; ratePerSqm: number; maxCharge: number }) : null;
  const estimate = pricedZone ? deliveryCost(area.areaM2, pricedZone) : null;
  // Which side of the clamp produced the live estimate — the ops panel's own
  // worked-example line ("12.4 m² × $18/m² = $223 -> floored to $250").
  const bound = pricedZone
    ? (area.areaM2 * pricedZone.ratePerSqm <= pricedZone.minCharge ? "min"
      : area.areaM2 * pricedZone.ratePerSqm >= pricedZone.maxCharge ? "max" : "rate")
    : null;
  const settleJson = safeParse(p.delivery_settle_json ?? "{}");
  return {
    postcode: p.delivery_postcode ?? null,
    suburb: p.delivery_suburb ?? null,
    zoneId: zone?.id ?? null,
    zoneLabel: zone?.label ?? null,
    basis: resolution.basis,
    caveats: resolution.caveats,
    areaM2: Math.round(area.areaM2 * 100) / 100,
    ratePerSqm: pricedZone?.ratePerSqm ?? null,
    minCharge: pricedZone?.minCharge ?? null,
    maxCharge: pricedZone?.maxCharge ?? null,
    estimate, bound,               // LIVE, from the current table
    amount: p.delivery_amount ?? null,   // null => NOT SETTLED. 0 is settled.
    settled: p.delivery_amount != null,
    settledEstimate: typeof settleJson.estimate === "number" ? settleJson.estimate : null,
    settledAreaM2: typeof settleJson.areaM2 === "number" ? settleJson.areaM2 : null,
    settledZoneVersion: typeof settleJson.zoneVersion === "string" ? settleJson.zoneVersion : null,
    note: p.delivery_note ?? null,
    settledAt: p.delivery_settled_at ?? null,
    settledBy: p.delivery_settled_by ?? null,
    // Editable set = ISSUABLE_FROM plus draft (§6.3) — once 'issued' the figure
    // is frozen into the revision and a project-level edit would desync the
    // record from the document the customer is reading.
    editable: p.status_internal === "draft" || ISSUABLE_FROM.has(p.status_internal),
  };
}

ops.get("/projects/:id", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const id = c.req.param("id");
  const p = await c.env.DB.prepare(`
    SELECT p.*, o.name AS org_name, u.name AS customer_name, u.email AS customer_email
      FROM project p
      LEFT JOIN organisation o ON o.id = p.organisation_id
      LEFT JOIN user u  ON u.id  = p.owner_user_id
     WHERE p.id = ?`).bind(id).first<any>();
  if (!p) return c.json({ error: "not_found" }, 404);

  // PARENTS ONLY — the reviewer sees the same line list the customer does, with
  // segments nested inside their parent rather than loose beside it.
  const { results: lines } = await c.env.DB.prepare("SELECT * FROM quote_line WHERE project_id = ? AND parent_line_id IS NULL ORDER BY position").bind(id).all<LineRow>();
  // The SEGMENTS of any composite parent. The parents-only query above is right
  // for the item list, but it meant the console could never see, or offer, a
  // split — the split/merge endpoints have existed since the composite work and
  // have never had a caller.
  // Seeded by migration 0028; loadCompositePolicy throws if the row is missing,
  // which is a deployment fault worth surfacing rather than defaulting around.
  const compositePolicy = await loadCompositePolicy(c.env);
  const { results: segments } = await c.env.DB.prepare(
    `SELECT id, parent_line_id, product_slug, options_json, dims_json,
            qty_per_parent, qty, line_total, status, segment_seq, room_label
       FROM quote_line
      WHERE project_id = ? AND parent_line_id IS NOT NULL
      ORDER BY parent_line_id, segment_seq`,
  ).bind(id).all<any>();
  const { results: files } = await c.env.DB.prepare("SELECT id, kind, filename, size, virus_status, created_at FROM file_asset WHERE project_id = ? ORDER BY created_at DESC").bind(id).all();
  const { results: comments } = await c.env.DB.prepare("SELECT cm.id, cm.line_id, cm.kind, cm.body, cm.created_at, u.name AS author FROM comment cm LEFT JOIN user u ON u.id = cm.author_id WHERE cm.project_id = ? ORDER BY cm.created_at DESC").bind(id).all();
  // The order for this project, if it has reached one. A project and its order
  // are one job (order is 1:1 with project); the split is storage, not domain.
  const order = await c.env.DB.prepare(
    // `stage` (0002) is the 12-step journey every other surface reads. `status`
    // is the vestigial 8-value enum from 0001 — reading it here put an order that
    // had reached balance_paid into the "Intake" phase.
    `SELECT id, order_no, stage, payment_status, created_at, updated_at,
            total, delivery_total
       FROM "order" WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`,
  ).bind(id).first<any>();
  const { results: payments } = order
    ? await c.env.DB.prepare("SELECT kind, amount, percent, status, reference, invoiced_at, paid_at FROM payment WHERE order_id = ? ORDER BY kind DESC").bind(order.id).all()
    : { results: [] as any[] };
  // The CONTRACT lines, through the SAME reader the customer's order view uses
  // (worker/lib/orders.ts's orderLines). This was a second query over the same
  // rows and it drifted exactly as a second copy does: it ordered parents by
  // their UUID, so the staff-facing contract could list the openings in a
  // different order from the quote the customer accepted — and, being a UUID
  // sort, differently on different records. A staffer reading line 2 down the
  // phone has to be reading the line the customer is looking at.
  const orderParentLines = order ? await orderLines(c.env, order.id) : [];

  // History spans BOTH entities. It used to filter on entity_type='project' only,
  // while every fulfilment action logs against 'order' — so on a merged plane the
  // entire post-acceptance history would silently disappear.
  const { results: activity } = await c.env.DB.prepare(
    `SELECT a.action, a.occurred_at, a.entity_type, COALESCE(u.name, a.actor) AS actor
       FROM audit_event a LEFT JOIN user u ON u.id = a.actor
      WHERE (a.entity_type = 'project' AND a.entity_id = ?)
         OR (a.entity_type = 'order'   AND a.entity_id = ?)
      ORDER BY a.occurred_at DESC`,
  ).bind(id, order?.id ?? "").all();


  return c.json({
    project: {
      id: p.id, title: p.title ?? "Untitled project",
      // The one reference the merged record is anchored on. "OF-Q-" reads oddly
      // on a job that shipped months ago, but it is printed on every issued PDF
      // and email, so it is never renamed — only ever shown paired with the title.
      publicRef: p.public_ref ?? null,
      statusCustomer: p.status_customer, statusInternal: p.status_internal,
      statusInternalLabel: STATUS_INTERNAL_LABEL[p.status_internal] ?? p.status_internal,
      nextStates: FLOW[p.status_internal] ?? [],
      unresolvedLineCount: lines.filter((line) => line.status !== "ready" || line.line_total == null).length,
      org: p.org_name, customerName: p.customer_name, customerEmail: p.customer_email,
      // Submission contact captured at submit time (persisted even for anon submitters).
      contactName: p.contact_name ?? null, contactEmail: p.contact_email ?? null,
      contactPhone: p.contact_phone ?? null, deliverySuburb: p.delivery_suburb ?? null,
      updatedAt: p.updated_at,
    },
    lines: lines.map((l) => ({
      ...opsLineDto(l),
      segments: (segments ?? []).filter((s2: any) => s2.parent_line_id === l.id).map((s2: any) => {
        const d = safeParse(s2.dims_json ?? "{}");
        return {
          id: s2.id, productSlug: s2.product_slug,
          productName: getProductBySlug(s2.product_slug)?.name ?? s2.product_slug,
          width: String(d.width ?? ""), height: String(d.height ?? ""),
          qtyPerParent: s2.qty_per_parent ?? 1, qty: s2.qty, lineTotal: s2.line_total,
          note: s2.room_label ?? "",
          // Without these the console could not show what a unit IS — only its
          // size and its price. A reviewer checking that unit 2 is the right
          // colour had nothing to read, and no way to tell an unpriced unit from
          // a priced one except by the parent going blank.
          options: safeParse(s2.options_json ?? "{}") as Record<string, string>,
          status: s2.status ?? "ready",
        };
      }),
    })),
    files,
    // The split rules, so the browser stops carrying its own copy of them. The
    // console hardcoded a unit count of [2,3,4] and reimplemented the even-split
    // maths WITHOUT the joiner allowance, so its proposal disagreed with
    // proposeEvenSplit() by joinerMm × (units − 1) before the reviewer typed
    // anything. maxSegments and toleranceMm were unreachable entirely.
    compositePolicy,
    comments,
    activity,
    // ── The merged view's additions (Slice 1) ───────────────────────────────
    // Additive: the existing Quotes workspace ignores these, so both surfaces
    // can read one endpoint while the merge is built.
    lifecycle: lifecycleOf({
      statusInternal: p.status_internal, statusCustomer: p.status_customer,
      orderStage: order?.stage ?? null,
    }),
    daysInStage: daysSince(p.updated_at),
    // What can be done to this job right now, derived server-side so the console
    // cannot offer what the Worker would refuse.
    actions: actionsFor({
      statusInternal: p.status_internal,
      order: (order as any) ?? null,
      unresolvedLines: lines.filter((line) => line.status !== "ready" || line.line_total == null).length,
      customerEmail: p.customer_email ?? p.contact_email ?? null,
      deliveryUnset: p.delivery_amount == null,
    }),
    // The CONTRACT lines. Once the quote is accepted the draft lines are no
    // longer what anyone is building — order_line is. Without these an accepted
    // project renders an empty table, which is how a staffer concludes the record
    // is broken. Segments nest inside their parent, same convention as the draft
    // `lines` above — a split opening is one row on screen either way.
    orderLines: orderParentLines.map((l) => ({
      id: l.id, code: l.code, qty: l.qty, lineTotal: l.lineTotal,
      room: l.location,
      productName: getProductBySlug(l.productSlug)?.name ?? l.productSlug ?? "—",
      width: l.width, height: l.height,
      segments: l.segments.map((s) => ({
        id: s.id,
        productName: getProductBySlug(s.productSlug)?.name ?? s.productSlug ?? "—",
        width: s.width, height: s.height,
        qtyPerParent: s.qtyPerParent, qty: s.qty, lineTotal: s.lineTotal,
      })),
    })),
    order: order ? {
      id: order.id, orderNo: order.order_no, stage: order.stage,
      stageLabel: STAGE_LABEL[order.stage as Stage] ?? order.stage,
      paymentStatus: order.payment_status,
      createdAt: order.created_at,
      // Verified gap (design doc §6.7): this query never selected `total`, and
      // without it the ops record header (ProjectRecord.tsx) keeps summing
      // order_line and understates every contract by the freight, on the same
      // screen as the Payments block showing the correct invoice.
      total: order.total, deliveryTotal: order.delivery_total,
    } : null,
    // The Australian domestic delivery leg (0044) — computed live on every
    // read; see buildDeliveryDto above.
    delivery: await buildDeliveryDto(c.env, p),
    payments,
  });
});

// PUT /api/ops/projects/:id/delivery { amount, postcode?, note? } — E7. Settles,
// un-settles or corrects the delivery figure. `amount: null` un-settles and
// re-arms the issue gate (C7) — the honest way to say "I typed a number and I
// now think it is wrong". Does NOT bump quote_edit_version (§6.3): a bump
// would collide with issueQuote's own concurrency guard and a staffer
// setting delivery while a colleague clicks Issue would be told "delivery is
// not set" immediately after setting it. The issue path guards on the
// delivery figure directly instead (C7), which cannot be misattributed.
ops.put("/projects/:id/delivery", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const id = c.req.param("id");

  const project = await c.env.DB.prepare(
    "SELECT id, status_internal, delivery_postcode FROM project WHERE id = ?",
  ).bind(id).first<{ id: string; status_internal: string; delivery_postcode: string | null }>();
  if (!project) return c.json({ error: "not_found" }, 404);
  // Editable set = ISSUABLE_FROM plus draft (§6.3). Once 'issued' the figure is
  // frozen into the revision and honoured (D12); a project-level edit then
  // would desync the record from the document the customer is reading.
  if (!(project.status_internal === "draft" || ISSUABLE_FROM.has(project.status_internal))) {
    return c.json({ error: "locked" }, 409);
  }

  const body = await c.req.json().catch(() => ({}));
  // A number >= 0, or an explicit null to un-settle. `0` is a decision
  // (D11/D14 — a trade customer arranging their own freight); NULL is the
  // absence of one. Never `?? 0`, never a truthiness check, here or anywhere
  // this column is read.
  let amount: number | null;
  if (body?.amount === null) {
    amount = null;
  } else {
    const n = Number(body?.amount);
    if (!Number.isFinite(n) || n < 0) return c.json({ error: "invalid_amount" }, 400);
    amount = n;
  }

  let postcode = project.delivery_postcode;
  if (typeof body?.postcode === "string" && body.postcode.trim()) {
    const normalised = normalisePostcode(body.postcode);
    if (!normalised) return c.json({ error: "invalid_postcode" }, 400);
    postcode = normalised;
  }
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) || null : null;

  // The machine's answer AT THE INSTANT of settling — delivery_settle_json,
  // stamped once and never touched again until the next settle. Without the
  // area and the zone version, a year of overrides is a scatter of numbers
  // with no independent variable (§4.4a). Cleared (NULL) on un-settle.
  let settleJson: string | null = null;
  let liveEstimate: number | null = null;
  let liveZoneId: string | null = null;
  if (amount != null) {
    const [{ zones, ranges }, area] = await Promise.all([
      loadZonesAndRanges(c.env),
      loadProjectAreaM2(c.env, id),
    ]);
    const resolution = resolveZone(postcode, zones, ranges);
    if (resolution.zone && zoneIsPriced(resolution.zone)) {
      const zone = resolution.zone as DeliveryZone & { minCharge: number; ratePerSqm: number; maxCharge: number; version?: string };
      liveEstimate = deliveryCost(area.areaM2, zone);
      liveZoneId = zone.id;
      settleJson = JSON.stringify({
        estimate: liveEstimate, areaM2: area.areaM2, zoneId: zone.id, zoneVersion: zone.version ?? null,
      });
    }
  }

  await c.env.DB.prepare(
    `UPDATE project SET delivery_amount = ?, delivery_postcode = ?, delivery_note = ?,
        delivery_settled_at = ?, delivery_settled_by = ?, delivery_settle_json = ?
      WHERE id = ?`,
  ).bind(
    amount, postcode, note,
    amount != null ? new Date().toISOString() : null,
    amount != null ? staff.id : null,
    settleJson, id,
  ).run();

  const after = await c.env.DB.prepare("SELECT * FROM project WHERE id = ?").bind(id).first<any>();
  const delivery = await buildDeliveryDto(c.env, after);

  // Lands in the History block for free, with both numbers in it — what makes
  // a staff override a data point rather than an anecdote (D19).
  await logEvent(c.env, {
    actor: staff.id, entityType: "project", entityId: id,
    action: amount == null
      ? "un-set delivery — the quote cannot be issued until it is set again"
      : `set delivery to $${amount.toFixed(2)} (machine estimate ${liveEstimate == null ? "n/a" : `$${liveEstimate.toFixed(2)}`}, zone ${liveZoneId ?? "none"})`,
  });

  return c.json({ ok: true, delivery });
});

// POST /api/ops/projects/:id/assign { userId? } — claim/assign the quote.
// POST /api/ops/projects/:id/start-pricing — move a submitted quote into pricing.
//
// This was /assign, which did double duty: it set internal_owner_id AND performed
// the submitted → estimator_assigned transition. Owners are gone (anyone with ops
// access works any job), but the TRANSITION is load-bearing — FLOW offers no
// other route out of `submitted`, so deleting the endpoint outright would have
// stranded every new submission in the queue forever.
ops.post("/projects/:id/start-pricing", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const res = await c.env.DB.prepare(
    `UPDATE project SET status_internal='estimator_assigned', updated_at=datetime('now')
      WHERE id=? AND status_internal IN (
        'draft','submitted','triage_pending','estimator_assigned',
        'technical_review_required','customer_clarification_required'
      )`,
  ).bind(c.req.param("id")).run();
  if (!res.meta.changes) return c.json({ error: "not_found" }, 404);
  await logEvent(c.env, { actor: staff.id, entityType: "project", entityId: c.req.param("id"), action: "started pricing" });
  return c.json({ ok: true, statusInternal: "estimator_assigned" });
});

// POST /api/ops/projects/:id/status { statusInternal } — a validated workflow move.
ops.post("/projects/:id/status", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const target = String(body?.statusInternal ?? "");
  const project = await c.env.DB.prepare(
    "SELECT status_internal, quote_edit_version FROM project WHERE id = ?",
  ).bind(id).first<{ status_internal: string; quote_edit_version: number }>();
  if (!project) return c.json({ error: "not_found" }, 404);
  // 'issued' / 'customer_clarification_required' have dedicated endpoints.
  if (target === "issued" || target === "customer_clarification_required" || !(FLOW[project.status_internal] ?? []).includes(target)) {
    return c.json({ error: "invalid_transition", from: project.status_internal }, 409);
  }
  const moved = await c.env.DB.prepare(
    `UPDATE project SET status_internal=?, updated_at=datetime('now')
      WHERE id=? AND status_internal=?`,
  ).bind(target, id, project.status_internal).run();
  if (!moved.meta.changes) {
    return c.json({ error: "workflow_changed_retry" }, 409);
  }
  await logEvent(c.env, { actor: staff.id, entityType: "project", entityId: id, action: `moved to ${STATUS_INTERNAL_LABEL[target] ?? target}` });
  return c.json({ statusInternal: target, statusInternalLabel: STATUS_INTERNAL_LABEL[target] ?? target, nextStates: FLOW[target] ?? [] });
});

// POST /api/ops/projects/:id/request-clarification { message } — ask the customer.
ops.post("/projects/:id/request-clarification", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim();
  if (!message) return c.json({ error: "empty" }, 400);

  const project = await c.env.DB.prepare(
    "SELECT status_internal FROM project WHERE id=?",
  ).bind(id).first<{ status_internal: string }>();
  if (!project) return c.json({ error: "not_found" }, 404);
  if (!(FLOW[project.status_internal] ?? []).includes("customer_clarification_required")) {
    return c.json({ error: "invalid_transition", from: project.status_internal }, 409);
  }
  const cust = await c.env.DB.prepare("SELECT u.email, COALESCE(u.name, p.contact_name) AS name FROM project p JOIN user u ON u.id = p.owner_user_id WHERE p.id = ?").bind(id).first<{ email: string; name: string | null }>();
  const committed = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO comment (id, project_id, author_id, kind, body)
       SELECT ?, ?, ?, 'clarification', ?
        WHERE EXISTS (
          SELECT 1 FROM project WHERE id=? AND status_internal=?
        )`,
    ).bind(uuid(), id, staff.id, message, id, project.status_internal),
    c.env.DB.prepare(
      `UPDATE project SET status_customer='needs_information',
          status_internal='customer_clarification_required',
          updated_at=datetime('now')
        WHERE id=? AND status_internal=?`,
    ).bind(id, project.status_internal),
  ]);
  if (Number(committed[1]?.meta?.changes ?? 0) !== 1) {
    return c.json({ error: "workflow_changed_retry" }, 409);
  }
  await logEvent(c.env, { actor: staff.id, entityType: "project", entityId: id, action: "requested clarification" });
  if (cust?.email) {
    await notify(c.env, { recipient: cust.email, eventType: "clarification.requested", templateKey: "needs_info",
      vars: { name: cust.name || "there", message },
      email: { to: cust.email, subject: "We need a bit more info on your quote", text: message } });
  }
  return c.json({ ok: true, statusInternal: "customer_clarification_required", statusInternalLabel: STATUS_INTERNAL_LABEL.customer_clarification_required });
});

// The set of internal states in which a reviewer may still change a line. The
// record plane renders inputs only in these states, because the server accepts
// edits only in these states — a Save that silently 404s is worse than no Save.
const EDITABLE_STATES = `'submitted','triage_pending','estimator_assigned','technical_review_required','customer_clarification_required'`;

/** Resolve an editable parent opening for a staff caller, or null. */
async function editableParent(env: Env, req: Request, lineId: string) {
  const staff = await resolveStaff(env, req);
  if (!staff || !hasAssignedRole(staff)) return null;
  return env.DB.prepare(
    `SELECT q.* FROM quote_line q JOIN project p ON p.id=q.project_id
      WHERE q.id=? AND q.parent_line_id IS NULL
        AND p.status_internal IN (${EDITABLE_STATES})`,
  ).bind(lineId).first<LineRow & { project_id: string }>();
}

// POST /api/ops/lines/:id/split — plan one opening as several joined units.
//
// Ops only, by design: the customer cannot choose a composite. The AI proposal
// path calls splitLine() directly; this is the human correction surface.
ops.post("/lines/:id/split", async (c) => {
  const parent = await editableParent(c.env, c.req.raw, c.req.param("id"));
  if (!parent) return c.json({ error: "not_found" }, 404);
  // Create-only. splitLine DELETEs every existing segment and recreates them,
  // which was tolerable when a unit was nothing but a width and destroys real
  // work now that a unit carries its own product and spec. Changing an existing
  // composite goes through the per-unit endpoints; the only way back to a blank
  // slate is merge, which is explicit about discarding the units.
  const already = await c.env.DB
    .prepare("SELECT 1 AS x FROM quote_line WHERE parent_line_id=? LIMIT 1")
    .bind(parent.id).first<{ x: number }>();
  if (already) return c.json({ error: "already_composite" }, 409);
  const body = await c.req.json().catch(() => ({}));
  const segments = Array.isArray(body?.segments) ? body.segments : [];
  const axis = body?.axis === "horizontal" ? "horizontal" : "vertical";
  const result = await splitLine(c.env, {
    parentId: parent.id,
    axis,
    origin: "ops",
    segments: segments.map((s: Record<string, unknown>) => ({
      widthMm: Number(s?.widthMm) || 0,
      heightMm: Number(s?.heightMm) || 0,
      productSlug: String(s?.productSlug ?? ""),
      qtyPerParent: Number(s?.qtyPerParent) || 1,
      // undefined, NOT {} — the distinction is the whole point. splitLine reads
      // "no options stated" as "inherit the opening's spec"; collapsing it to an
      // empty object here re-asserted "this unit has no colour, no hardware,
      // no flyscreen" and discarded the customer's selections along with any
      // surcharge attached to them.
      options: s?.options && typeof s.options === "object" && !Array.isArray(s.options)
        ? s.options as Record<string, string>
        : undefined,
    })),
  });
  if (!result.ok) return c.json({ error: "invalid_split", errors: result.errors }, 400);
  await logEvent(c.env, { entityType: "project", entityId: parent.project_id, action: "line.split", after: { lineId: parent.id, units: segments.length } });
  return c.json({ ok: true });
});

// POST /api/ops/lines/:id/merge — undo a split.
//
// The `fit` warning is restored deliberately: the reason the opening was split
// (no single unit is made this wide) is still true, and letting it return as a
// clean line would present an unbuildable single unit as Ready.
ops.post("/lines/:id/merge", async (c) => {
  const parent = await editableParent(c.env, c.req.raw, c.req.param("id"));
  if (!parent) return c.json({ error: "not_found" }, 404);
  await mergeComposite(c.env, parent.id);
  await c.env.DB.prepare(
    `UPDATE quote_line
        SET review_json = json_patch(COALESCE(review_json,'{}'), ?),
            status='technical_review', updated_at=datetime('now')
      WHERE id=?`,
  ).bind(
    JSON.stringify({ fit: "No single unit is made at this size — we will confirm how it is built and price it at technical review." }),
    parent.id,
  ).run();
  await logEvent(c.env, { entityType: "project", entityId: parent.project_id, action: "line.merge", after: { lineId: parent.id } });
  return c.json({ ok: true });
});

ops.patch("/lines/:id", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  // parent_line_id IS NULL: this endpoint is for OPENINGS only. A segment has a
  // derived qty and a parent whose total is Σ(segments), and nothing here
  // recomputes either — so patching a segment through it wrote qty directly
  // (breaking composite.ts's single-writer invariant) and left the parent's
  // total describing a composite that no longer existed. Segments have their own
  // endpoint below, which cannot express either mistake.
  const line = await c.env.DB.prepare(
    `SELECT q.*, p.quote_edit_version, p.owner_user_id FROM quote_line q JOIN project p ON p.id=q.project_id
      WHERE q.id=? AND q.parent_line_id IS NULL
        AND p.status_internal IN (
          'submitted','triage_pending','estimator_assigned',
          'technical_review_required','customer_clarification_required'
        )`,
  ).bind(c.req.param("id")).first<LineRow>();
  if (!line) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));

  const dims = safeParse(line.dims_json);
  const width = body?.width !== undefined ? String(body.width) : String(dims.width ?? "");
  const height = body?.height !== undefined ? String(body.height) : String(dims.height ?? "");
  const options = body?.options && typeof body.options === "object" && !Array.isArray(body.options)
    ? body.options as Record<string, unknown>
    : safeParse(line.options_json);
  const qty = body?.qty !== undefined ? Math.max(1, Math.floor(Number(body.qty) || 1)) : line.qty;
  const productSlug = body?.productSlug !== undefined ? String(body.productSlug) : line.product_slug;
  const code = body?.code !== undefined ? String(body.code) : line.external_ref;
  const room = body?.room !== undefined ? String(body.room) : line.room_label;

  // Technical-review reasons are NOT cleared as a side effect of an edit — an
  // estimator changing qty must not silently mark a substitution/out-of-range line
  // ready. They are resolved only by an explicit request: resolveReview === true
  // clears them all, or an array clears the named keys.
  const existingReview = safeParse(line.review_json ?? "") as Record<string, string>;
  let review: Record<string, string> = { ...existingReview };
  const rr = body?.resolveReview;
  if (rr === true) review = {};
  else if (Array.isArray(rr)) for (const k of rr) delete review[String(k)];
  const hasReview = Object.keys(review).length > 0;
  const resolvedKeys = Object.keys(existingReview).filter((k) => !(k in review));

  let lineTotal: number | null;
  let nextPricingSnapshot: string | null = line.pricing_snapshot_json ?? null;
  let nextConfigurationSnapshot: string | null = line.configuration_snapshot_json ?? null;
  let nextVariantId = line.selected_variant_id ?? null;
  const aiManaged = line.origin === "ai" || !!line.ai_proposal_line_id;
  const requestedVariantId = body?.selectedVariantId !== undefined ? String(body.selectedVariantId) : null;
  if (aiManaged) {
    if (productSlug !== line.product_slug && !requestedVariantId) {
      return c.json({ error: "selected_variant_required" }, 400);
    }
    const effectiveVariantId = requestedVariantId || line.selected_variant_id;
    if (!effectiveVariantId) return c.json({ error: "selected_variant_required" }, 409);
    const opening = await c.env.DB.prepare(
      `SELECT o.* FROM opening_instance o
        WHERE o.quote_line_id=?
           OR o.id=(SELECT opening_id FROM ai_proposal_line WHERE id=?)
        ORDER BY o.created_at DESC LIMIT 1`,
    ).bind(line.id, line.ai_proposal_line_id ?? "").first<OpeningRow>();
    if (!opening) return c.json({ error: "opening_not_found" }, 409);
    const openingInput = {
      ...toOpeningInput(opening),
      widthMm: Number(width) || null, heightMm: Number(height) || null, qty,
    };
    const repo = createCatalogueRepository(sanityExecutor(c.env));
    const candidate = (await repo.queryCandidates(opening.family, opening.operation_type))
      .find((row) => row.slug === productSlug);
    if (!candidate?.pricingRef) return c.json({ error: "exact_pricing_unavailable" }, 409);
    const rule = checkHardRules(openingInput, candidate);
    const variant = candidate.performanceVariants.find((v) =>
      v.variantId === effectiveVariantId && v.published &&
      (!rule.eligibleVariantIds?.length || rule.eligibleVariantIds.includes(v.variantId)));
    if (!rule.passed || !variant) return c.json({ error: "configuration_not_eligible" }, 409);
    // Pricing identifiers are derived from the effective quote options and the
    // validated catalogue variant. The browser never supplies private surcharge
    // identifiers and cannot omit a chargeable selection.
    const pricingOptionSlugs = [...new Set([
      ...pricingOptionSlugsFromOptions(options),
      // Glass identity is a per-m² chargeable option — price it explicitly.
      ...(variant.glazingOptionSlug ? [variant.glazingOptionSlug] : []),
      ...(variant.pricingOptionSlugs ?? []),
    ])];
    // Carry the CAUSE, not just the failure: which option has no price in D1 is
    // what turns "this can't be priced" into something the estimator can hand to
    // a manager, or route around by choosing differently.
    let missingOptions: string[] = [];
    const exact = await priceLine(c.env, {
      family: candidate.pricingRef, widthMm: Number(width), heightMm: Number(height), qty,
      optionSlugs: pricingOptionSlugs, requireExactRate: true, requireAllOptions: true,
    }).catch((e) => {
      if (e instanceof MissingSurcharge) missingOptions = e.missing;
      return null;
    });
    if (!exact?.ok) return c.json({ error: "exact_pricing_unavailable", missingOptions }, 409);
    lineTotal = exact.total;
    nextVariantId = variant.variantId;
    nextPricingSnapshot = JSON.stringify(exact);
    nextConfigurationSnapshot = JSON.stringify({
      productId: candidate.sanityProductId, productSlug: candidate.slug,
      performanceVariantId: variant.variantId, frameType: variant.frameType,
      frameTechnology: variant.frameTechnology, glazing: variant.glazingOptionSlug,
      options, pricingOptionSlugs,
      dimensions: { widthMm: Number(width), heightMm: Number(height) }, quantity: qty,
    });
  } else if (line.line_kind === "composite_parent") {
    // A composite parent is NEVER priced directly — its total is Σ(segments).
    // This branch used to fall through to priceItem, so changing an opening's qty
    // or size from the always-on inputs in the row overwrote the sum of the units
    // with a single-frame price. Verified against a dev database: an opening whose
    // two units totalled $5,400 was rewritten to $1,840 by a qty edit, with the
    // segments left untouched and their derived qty stale.
    //
    // Hold the existing total through the UPDATE and let recomputeComposite below
    // derive the real one — it is the single writer for exactly this reason.
    lineTotal = line.line_total ?? null;
  } else {
    // Same engine as the customer save and the schedule parse — a reviewer edit
    // must never produce a different number from the one the customer saw.
    lineTotal = await priceItem(c.env, { productSlug, width, height, options, qty, ownerUserId: line.owner_user_id ?? null });
  }
  // Readiness is derived, never forced: unpriced ⇒ incomplete; priced but still
  // carrying review flags ⇒ technical_review (submittable, staff must resolve);
  // priced + no flags ⇒ ready.
  const status = lineTotal == null ? "incomplete" : hasReview ? "technical_review" : "ready";

  const locks = new Set<string>();
  try {
    const parsed = JSON.parse(line.edited_fields ?? "[]");
    if (Array.isArray(parsed)) for (const value of parsed) if (typeof value === "string") locks.add(value);
  } catch { /* malformed legacy locks become an empty set */ }
  if (body?.productSlug !== undefined && productSlug !== line.product_slug) locks.add("product_slug");
  if (body?.options !== undefined && JSON.stringify(options) !== JSON.stringify(safeParse(line.options_json))) locks.add("options_json");
  if ((body?.width !== undefined && width !== String(dims.width ?? "")) ||
      (body?.height !== undefined && height !== String(dims.height ?? ""))) locks.add("dims_json");
  if (body?.qty !== undefined && qty !== line.qty) locks.add("qty");

  const mutableStates = [
    "submitted", "triage_pending", "estimator_assigned",
    "technical_review_required", "customer_clarification_required",
  ];
  const updated = await c.env.DB.batch([
    c.env.DB.prepare(
    // A price override is CLEARED here (0046), not carried. This statement runs
    // when the specification changed — product, size, options, qty — so the
    // engine has just produced a different figure and the human number attached
    // to the OLD specification is no longer an answer to anything. Same re-arm
    // the delivery gate performs when the quote it was settled against moves.
    // Silently keeping it would let a price agreed for a 1200mm window ride
    // onto a 2400mm one.
    `UPDATE quote_line SET product_slug=?, dims_json=?, options_json=?, qty=?, external_ref=?, room_label=?,
       line_total=?, status=?, review_json=?, pricing_snapshot_json=?,
       configuration_snapshot_json=?, selected_variant_id=?, edited_fields=?,
       price_calculated=NULL, price_override_by=NULL, price_override_at=NULL,
       edit_version=edit_version+1, updated_at=datetime('now')
       WHERE id=? AND edit_version=?
         AND EXISTS (
           SELECT 1 FROM project WHERE id=? AND quote_edit_version=?
             AND status_internal IN (${mutableStates.map(() => "?").join(",")})
         )`,
    ).bind(
    productSlug, JSON.stringify({ width, height }), JSON.stringify(options), qty, code || null, room || null,
    lineTotal, status, hasReview ? JSON.stringify(review) : null,
    nextPricingSnapshot, nextConfigurationSnapshot, nextVariantId, JSON.stringify([...locks]),
    line.id, line.edit_version, line.project_id, line.quote_edit_version ?? 0, ...mutableStates,
    ),
    c.env.DB.prepare(
      `UPDATE project SET quote_edit_version=quote_edit_version+1, updated_at=datetime('now')
        WHERE id=? AND quote_edit_version=?
          AND status_internal IN (${mutableStates.map(() => "?").join(",")})`,
    ).bind(line.project_id, line.quote_edit_version ?? 0, ...mutableStates),
  ]);
  if (Number(updated[0]?.meta?.changes ?? 0) !== 1 ||
      Number(updated[1]?.meta?.changes ?? 0) !== 1) {
    return c.json({ error: "line_changed_reload_required" }, 409);
  }

  if (resolvedKeys.length) {
    await logEvent(c.env, { actor: staff.id, entityType: "quote_line", entityId: line.id, action: `resolved technical review: ${resolvedKeys.join(", ")}` });
  }

  // Changing the opening changes what its units must add up to: qty is derived
  // from the parent's, and coverage is measured against the opening's size. Both
  // are stale the instant either moves, so the derivation runs after every edit
  // to a composite parent — not only when a unit changes.
  if (line.line_kind === "composite_parent") await recomputeComposite(c.env, line.id);

  const fresh = await c.env.DB.prepare("SELECT * FROM quote_line WHERE id = ?").bind(line.id).first<LineRow>();
  return c.json({ line: opsLineDto(fresh!) });
});

// POST /api/ops/lines/:id/price-preview — the live figure for the editor.
//
// The customer preview (/api/projects/current/price-preview) is scoped to the
// signed-in visitor's OWN project, so it is useless here: a staff member editing
// someone else's line has no "current project", and the figure has to be
// computed against that project's owner or an account discount is either
// invented or dropped. Same engine, correct context.
//
// Read-only and rate-free: it returns a total and nothing about how it was
// reached, so it exposes no rate-card data the console does not already show.
ops.post("/lines/:id/price-preview", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const line = await c.env.DB.prepare(
    `SELECT q.id, p.owner_user_id FROM quote_line q JOIN project p ON p.id=q.project_id WHERE q.id=?`,
  ).bind(c.req.param("id")).first<{ id: string; owner_user_id: string | null }>();
  if (!line) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const options = body?.options && typeof body.options === "object" && !Array.isArray(body.options)
    ? body.options as Record<string, string> : {};
  const total = await priceItem(c.env, {
    productSlug: String(body?.productSlug ?? ""),
    width: String(body?.width ?? ""), height: String(body?.height ?? ""),
    options, qty: Math.max(1, Math.floor(Number(body?.qty) || 1)),
    ownerUserId: line.owner_user_id ?? null,
  });
  return c.json({ ok: total != null, total });
});

// PUT /api/ops/lines/:id/price { total } — the price a human decided (0046).
//
// Review is where a price gets adjusted: a relationship, a job won on margin, a
// number the rate card cannot know about. Before this, ops could only change
// WHAT was quoted and watch the engine reprice it — so the field most likely to
// be edited was the one field with no editor, and the workaround was to distort
// the specification until the total came out right, corrupting the record of
// what is actually being built.
//
// `total: null` clears the override and restores the calculated figure. That is
// why price_calculated is kept: reverting is a local restore, not a re-price
// round trip that could land on a different number if a rate card moved since.
//
// SEGMENTS, NOT PARENTS, for a composite. A parent's total is Σ(segments)
// (composite.ts's single-writer invariant, and recomputeComposite would
// overwrite anything written here on the next edit anyway). Refused explicitly
// rather than silently ignored — a save that appears to work and is erased
// later is worse than one that says no.
ops.put("/lines/:id/price", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);

  // Same mutable-state window as PATCH /lines/:id: once a revision is issued the
  // figures are frozen, and a price is no more editable than a dimension.
  const line = await c.env.DB.prepare(
    `SELECT q.id, q.line_kind, q.line_total, q.price_calculated, q.parent_line_id
       FROM quote_line q JOIN project p ON p.id=q.project_id
      WHERE q.id=?
        AND p.status_internal IN (
          'submitted','triage_pending','estimator_assigned',
          'technical_review_required','customer_clarification_required'
        )`,
  ).bind(c.req.param("id")).first<any>();
  if (!line) return c.json({ error: "not_found" }, 404);
  if (line.line_kind === "composite_parent") return c.json({ error: "composite_parent" }, 409);

  const body = await c.req.json().catch(() => ({}));
  const clearing = body?.total === null;
  const total = clearing ? null : Number(body?.total);
  // 0 is a legitimate price (a line absorbed into the job), a negative one is a
  // typo that pays the customer — the same rule the delivery override applies.
  if (!clearing && (!Number.isFinite(total as number) || (total as number) < 0)) {
    return c.json({ error: "invalid_amount" }, 400);
  }

  // The engine's figure, captured the first time it is overridden and preserved
  // through later adjustments — so "calculated" keeps meaning what the rate card
  // said, not what the previous override said.
  const calculated = line.price_calculated ?? line.line_total;
  if (clearing && line.price_calculated == null) return c.json({ ok: true, unchanged: true });

  await c.env.DB.prepare(
    clearing
      ? `UPDATE quote_line SET line_total=?, price_calculated=NULL, price_override_by=NULL,
           price_override_at=NULL, edit_version=edit_version+1, updated_at=datetime('now') WHERE id=?`
      : `UPDATE quote_line SET line_total=?, price_calculated=?, price_override_by=?,
           price_override_at=datetime('now'), edit_version=edit_version+1, updated_at=datetime('now') WHERE id=?`,
  ).bind(...(clearing ? [calculated, line.id] : [total, calculated, staff.id, line.id])).run();

  // A segment's price change moves its parent's total, which is Σ(segments).
  if (line.parent_line_id) await recomputeComposite(c.env, line.parent_line_id);

  await logEvent(c.env, {
    actor: staff.id, entityType: "quote_line", entityId: line.id,
    action: clearing ? "line.price.override.cleared" : "line.price.override",
    before: { lineTotal: line.line_total },
    after: { lineTotal: clearing ? calculated : total, calculated },
  });

  const fresh = await c.env.DB.prepare("SELECT * FROM quote_line WHERE id = ?").bind(line.id).first<LineRow>();
  return c.json({ ok: true, line: opsLineDto(fresh!) });
});

// ── Per-unit management of a composite ───────────────────────────────────────
// Openings use PATCH /lines/:id; units use these. The split is deliberate: a
// unit has no code and no room (one opening, one architect tag), its qty is
// derived rather than set, and every write has to re-derive the parent. None of
// these endpoints accepts `qty` or `external_ref`.

/** The opening a unit belongs to, if its project is still editable by staff. */
async function editableSegmentParent(env: Env, req: Request, segmentId: string) {
  const row = await env.DB.prepare(
    `SELECT q.id, q.parent_line_id, q.product_slug, p.id AS project_id
       FROM quote_line q
       JOIN quote_line par ON par.id = q.parent_line_id
       JOIN project p ON p.id = q.project_id
      WHERE q.id=? AND q.parent_line_id IS NOT NULL
        AND p.status_internal IN (
          'submitted','triage_pending','estimator_assigned',
          'technical_review_required','customer_clarification_required'
        )`,
  ).bind(segmentId).first<{ id: string; parent_line_id: string; product_slug: string; project_id: string }>();
  if (!row) return null;
  const staff = await resolveStaff(env, req);
  if (!staff || !hasAssignedRole(staff)) return null;
  return row;
}

ops.patch("/segments/:id", async (c) => {
  const seg = await editableSegmentParent(c.env, c.req.raw, c.req.param("id"));
  if (!seg) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));

  const patch: {
    productSlug?: string; options?: Record<string, string>;
    alongMm?: number; acrossMm?: number; qtyPerParent?: number; note?: string;
  } = {};
  if (body?.productSlug !== undefined) patch.productSlug = String(body.productSlug);
  if (body?.options && typeof body.options === "object" && !Array.isArray(body.options)) {
    patch.options = Object.fromEntries(
      Object.entries(body.options as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]),
    );
  }
  if (body?.alongMm !== undefined) patch.alongMm = Number(body.alongMm) || 0;
  // ACROSS the split, accepted here as it already is on the customer route.
  // Ops rendered this field editable, captioned it "cannot be changed here",
  // and then had nowhere to send it — the parameter did not exist at any layer.
  // An across mismatch is a hard submission blocker for the customer, so this
  // was the estimator's only repair and it was inert. updateSegment falls back
  // to what the unit already stores, so accepting it changes nothing for a
  // caller that omits it.
  if (body?.acrossMm !== undefined) patch.acrossMm = Number(body.acrossMm) || 0;
  if (body?.qtyPerParent !== undefined) patch.qtyPerParent = Number(body.qtyPerParent) || 1;
  if (body?.note !== undefined) patch.note = normNote(body.note);

  // STAFF ARE WARNED, NOT BLOCKED (owner, 2026-08-08). A frame that cannot
  // couple with its siblings is a real fault, and it is also occasionally the
  // right answer — an engineer who has decided how to detail the joint should
  // not be stopped by a default. So the same sentence the customer route refuses
  // with is stamped on the opening for review, and the save proceeds. Read
  // BEFORE the update, while the unit still holds its old product.
  const conflict = patch.productSlug !== undefined && patch.productSlug !== seg.product_slug
    ? await compatibilityConflict(c.env, { parentId: seg.parent_line_id, segmentId: seg.id, productSlug: patch.productSlug })
    : null;

  const result = await updateSegment(c.env, { segmentId: seg.id, patch });
  if (!result.ok) return c.json({ error: "invalid_segment", errors: result.errors }, 400);
  if (conflict) {
    await c.env.DB.prepare(
      `UPDATE quote_line SET status='technical_review',
         review_json=json_patch(COALESCE(review_json,'{}'), ?), updated_at=datetime('now')
       WHERE id=?`,
    ).bind(JSON.stringify({ compatibility: conflict }), seg.parent_line_id).run();
  }
  await logEvent(c.env, {
    entityType: "project", entityId: seg.project_id, action: "line.unit.edit",
    after: { lineId: seg.parent_line_id, unitId: seg.id, fields: Object.keys(patch), compatibility: conflict ?? undefined },
  });
  return c.json({ ok: true, compatibility: conflict });
});

ops.post("/lines/:id/segments", async (c) => {
  const parent = await editableParent(c.env, c.req.raw, c.req.param("id"));
  if (!parent) return c.json({ error: "not_found" }, 404);
  const result = await addSegment(c.env, parent.id);
  if (!result.ok) return c.json({ error: "invalid_segment", errors: result.errors }, 400);
  await logEvent(c.env, { entityType: "project", entityId: parent.project_id, action: "line.unit.add", after: { lineId: parent.id, unitId: result.id } });
  return c.json({ ok: true, id: result.id });
});

ops.delete("/segments/:id", async (c) => {
  const seg = await editableSegmentParent(c.env, c.req.raw, c.req.param("id"));
  if (!seg) return c.json({ error: "not_found" }, 404);
  const result = await removeSegment(c.env, seg.id);
  if (!result.ok) return c.json({ error: "invalid_segment", errors: result.errors }, 400);
  await logEvent(c.env, { entityType: "project", entityId: seg.project_id, action: "line.unit.remove", after: { lineId: result.parentId, unitId: seg.id } });
  return c.json({ ok: true });
});

// POST /api/ops/projects/:id/note { body, lineId? } — technical-review note.
ops.post("/projects/:id/note", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const text = String(body?.body ?? "").trim();
  if (!text) return c.json({ error: "empty" }, 400);
  const id = uuid();
  await c.env.DB.prepare(
    "INSERT INTO comment (id, project_id, line_id, author_id, kind, body) VALUES (?, ?, ?, ?, 'note', ?)",
  ).bind(id, c.req.param("id"), typeof body?.lineId === "string" ? body.lineId : null, staff.id, text).run();
  return c.json({ comment: { id, body: text, author: staff.name, kind: "note", created_at: new Date().toISOString() } });
});

// POST /api/ops/projects/:id/issue-quote — issue the reviewed quote + notify customer.
ops.post("/projects/:id/issue-quote", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!canIssueQuote(staff)) return c.json({ error: "forbidden_role" }, 403);
  const id = c.req.param("id");
  const result = await issueQuote(c.env, id);
  if (!result.ok) return c.json({ error: result.error }, result.error === "not_found" ? 404 : 409);
  await logEvent(c.env, { actor: staff?.id, entityType: "project", entityId: id, action: "issued quote" });
  const cust = await c.env.DB.prepare("SELECT u.email, COALESCE(u.name, p.contact_name) AS name FROM project p JOIN user u ON u.id = p.owner_user_id WHERE p.id = ?").bind(id).first<{ email: string; name: string | null }>();
  if (cust?.email) {
    await notify(c.env, {
      recipient: cust.email, eventType: "quote.issued", templateKey: "quote_issued",
      vars: { name: cust.name || "there" },
      email: { to: cust.email, subject: "Your OpenFrame quote is ready", text: "Your reviewed quote is ready to review and accept." },
    });
  }
  return c.json({ total: result.total, goods: result.goods, delivery: result.delivery });
});

// ═══════════════════════════════════════════════════════════════════════════
// O5 — Orders operations
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/ops/orders — all orders with customer + stage + payments.
ops.get("/orders", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const { results } = await c.env.DB.prepare(`
    SELECT o.*, p.title, u.name AS customer_name, org.name AS org_name
      FROM "order" o
      JOIN project p ON p.id = o.project_id
      LEFT JOIN user u ON u.id = p.owner_user_id
      LEFT JOIN organisation org ON org.id = p.organisation_id
     ORDER BY o.created_at DESC`).all<any>();
  const list = await Promise.all(results.map(async (o) => ({
    ...(await orderDto(c.env, o as OrderRow)),
    title: o.title, customerName: o.customer_name, orgName: o.org_name,
  })));
  return c.json({ orders: list });
});

// GET /api/ops/orders/:id — order detail + lines + the actions staff can take.
ops.get("/orders/:id", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const o = await c.env.DB.prepare(`
    SELECT o.*, p.title, u.name AS customer_name, u.email AS customer_email, org.name AS org_name
      FROM "order" o
      JOIN project p ON p.id = o.project_id
      LEFT JOIN user u ON u.id = p.owner_user_id
      LEFT JOIN organisation org ON org.id = p.organisation_id
     WHERE o.id = ?`).bind(c.req.param("id")).first<any>();
  if (!o) return c.json({ error: "not_found" }, 404);
  const { results: lines } = await c.env.DB.prepare("SELECT external_ref, product_snapshot_json, qty, line_total FROM order_line WHERE order_id = ?").bind(o.id).all();
  return c.json({
    order: { ...(await orderDto(c.env, o as OrderRow)), title: o.title, customerName: o.customer_name, customerEmail: o.customer_email, orgName: o.org_name, lines },
    actions: availableActions(o as OrderRow),
  });
});

// POST /api/ops/orders/:id/advance { action } — any fulfilment transition (the
// internal console can also record customer-side confirmations by phone).
ops.post("/orders/:id/advance", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const order = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(c.req.param("id")).first<OrderRow>();
  if (!order) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const err = await applyTransition(c.env, order, String(body?.action ?? ""));
  if (err) return c.json({ error: err }, 409);
  await logEvent(c.env, { actor: staff.id, entityType: "order", entityId: order.id, action: `advanced: ${body?.action}` });
  const fresh = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(order.id).first<OrderRow>();
  return c.json({ order: await orderDto(c.env, fresh!), actions: availableActions(fresh!) });
});

// POST /api/ops/orders/:id/pay { kind, reference } — record a manual payment.
ops.post("/orders/:id/pay", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!canRecordPayment(staff)) return c.json({ error: "forbidden_role" }, 403);
  const order = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(c.req.param("id")).first<OrderRow>();
  if (!order) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const kind = body?.kind === "balance" ? "balance" : "deposit";
  const err = await markPaid(c.env, order, kind, typeof body?.reference === "string" ? body.reference : null);
  if (err) return c.json({ error: err, stage: order.stage }, 409);
  await logEvent(c.env, { actor: staff.id, entityType: "order", entityId: order.id, action: `recorded ${kind} payment` });
  const fresh = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(order.id).first<OrderRow>();
  return c.json({ order: await orderDto(c.env, fresh!), actions: availableActions(fresh!) });
});

// ═══════════════════════════════════════════════════════════════════════════
// O5 — Customers 360
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/ops/customers — registered customers (real accounts are user rows;
// the organisation layer isn't wired, so this is user-centric). Business name +
// ABN come from the customer's own profile (see /auth/profile).
ops.get("/customers", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.company, u.abn, u.created_at,
           (SELECT count(*) FROM project WHERE owner_user_id = u.id) AS projects,
           (SELECT count(*) FROM "order" o JOIN project p ON p.id = o.project_id WHERE p.owner_user_id = u.id) AS orders
      FROM user u
     WHERE u.type = 'customer'
     ORDER BY u.created_at DESC`).all();
  // Attribution is the compensating control for flat access — every staff action
  // is meant to be answerable later. It was not applied to the READS, which is
  // where the customer data actually leaves: this endpoint returns every
  // customer's name, email, phone, company and ABN in one response and left no
  // trace that anyone had asked for it.
  await logEvent(c.env, {
    actor: staff.id, entityType: "user", entityId: "*",
    action: `viewed the customer list (${results.length} record(s))`,
  });
  return c.json({ customers: results });
});

// PATCH /api/ops/customers/:id { name?, phone?, company?, abn?, email? } — staff
// edit of a customer's profile. Profile fields need an assigned role (same gate as
// seeing the PII); the sign-in EMAIL is the unique login ID — customers can never
// edit it themselves and only an ADMIN may change it here. Sessions stay valid
// (keyed by user id); the next OTP sign-in simply uses the new address.
ops.patch("/customers/:id", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const id = c.req.param("id");
  const u = await c.env.DB.prepare("SELECT id, email FROM user WHERE id = ? AND type = 'customer'").bind(id).first<{ id: string; email: string }>();
  if (!u) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));

  const sets: string[] = []; const binds: unknown[] = []; const changed: string[] = [];
  const strField = (key: string, col: string, max: number) => {
    if (body?.[key] !== undefined) {
      const v = String(body[key]).trim().slice(0, max);
      sets.push(`${col} = ?`); binds.push(v || null); changed.push(col);
    }
  };
  strField("name", "name", 200);
  strField("phone", "phone", 60);
  strField("company", "company", 200);
  strField("abn", "abn", 40);

  let emailNote = "";
  if (body?.email !== undefined) {
    if (staff.role !== "admin") return c.json({ error: "admin_only" }, 403);
    const email = normEmail(body.email);
    if (!isEmail(email)) return c.json({ error: "invalid_email" }, 400);
    if (email !== u.email) {
      const taken = await c.env.DB.prepare("SELECT 1 FROM user WHERE email = ?").bind(email).first();
      if (taken) return c.json({ error: "email_in_use" }, 409);
      sets.push("email = ?"); binds.push(email); changed.push("email");
      emailNote = ` (${u.email} → ${email})`;
    }
  }

  if (sets.length) {
    await c.env.DB.prepare(`UPDATE user SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
    await logEvent(c.env, { actor: staff.id, entityType: "user", entityId: id, action: `updated customer profile: ${changed.join(", ")}${emailNote}` });
  }
  const fresh = await c.env.DB.prepare("SELECT id, name, email, phone, company, abn, created_at FROM user WHERE id = ?").bind(id).first<any>();
  return c.json({
    ok: true,
    customer: { id: fresh.id, name: fresh.name, email: fresh.email, phone: fresh.phone, company: fresh.company, abn: fresh.abn, createdAt: fresh.created_at },
  });
});

// GET /api/ops/customers/:id — 360: the customer, their projects, and orders.
ops.get("/customers/:id", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const id = c.req.param("id");
  const u = await c.env.DB.prepare("SELECT * FROM user WHERE id = ? AND type = 'customer'").bind(id).first<any>();
  if (!u) return c.json({ error: "not_found" }, 404);
  const { results: projects } = await c.env.DB.prepare("SELECT id, title, status_customer, status_internal, updated_at FROM project WHERE owner_user_id = ? ORDER BY updated_at DESC").bind(id).all();
  const { results: ordersRows } = await c.env.DB.prepare('SELECT o.id, o.order_no, o.stage, o.total FROM "order" o JOIN project p ON p.id = o.project_id WHERE p.owner_user_id = ? ORDER BY o.created_at DESC').bind(id).all();
  await logEvent(c.env, { actor: staff.id, entityType: "user", entityId: id, action: "viewed customer record" });
  return c.json({
    customer: {
      id: u.id, name: u.name, email: u.email, phone: u.phone,
      company: u.company, abn: u.abn, createdAt: u.created_at,
    },
    projects, orders: ordersRows,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O6 — Admin (rules, files, audit, staff/roles, search)
// ═══════════════════════════════════════════════════════════════════════════

const isAdmin = (staff: { role: string | null }) => staff.role === "admin";

// GET /api/ops/files — all uploaded files across projects.
ops.get("/files", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const { results } = await c.env.DB.prepare(`
    SELECT fa.id, fa.kind, fa.filename, fa.size, fa.virus_status, fa.scan_engine, fa.scanned_at, fa.created_at,
           p.title AS project_title, u.name AS customer_name
      FROM file_asset fa
      LEFT JOIN project p ON p.id = fa.project_id
      LEFT JOIN user u ON u.id = p.owner_user_id
     ORDER BY fa.created_at DESC`).all();
  return c.json({ files: results });
});

// POST /api/ops/files/:id/rescan — run the scanner over a stored file and record
// the verdict. This is how the pre-scanning backlog ('skipped') and any file whose
// inline scan failed ('pending') get cleared for download; an infected verdict
// moves the bytes off the serving key into quarantine/ rather than leaving them
// parked where a route could reach them.
ops.post("/files/:id/rescan", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const id = c.req.param("id");
  const fa = await c.env.DB.prepare("SELECT id, r2_key, filename FROM file_asset WHERE id = ?").bind(id)
    .first<{ id: string; r2_key: string; filename: string }>();
  if (!fa) return c.json({ error: "not_found" }, 404);

  const obj = await c.env.FILES.get(fa.r2_key);
  if (!obj) return c.json({ error: "gone" }, 404);
  const contentType = obj.httpMetadata?.contentType ?? "application/octet-stream";
  const bytes = new Uint8Array(await obj.arrayBuffer());
  const result = await scanFile(c.env, { bytes, filename: fa.filename, contentType });

  const status = result.verdict === "clean" ? "clean" : result.verdict === "infected" ? "infected" : "pending";
  // QUARANTINE, never delete. On the upload path an infected verdict discards
  // bytes that were never stored — nothing is lost, the customer still has their
  // file. Here the stored copy is the ONLY copy: worker/routes/files.ts is the
  // sole R2 write, there is no soft-delete and no second bucket. A rescan that
  // deletes therefore destroys a customer's evidence the moment the scanner gets
  // stricter or an AV service returns a false positive on a legitimate 6 MB plan
  // set — and this endpoint exists precisely to be re-run after such a change.
  // Moving the object off the serving key gets the bytes out of reach (both
  // download routes already refuse a non-clean row) without making the tightening
  // itself a data-loss event.
  let quarantined = false;
  if (result.verdict === "infected") {
    try {
      await c.env.FILES.put(`quarantine/${fa.r2_key}`, bytes, {
        httpMetadata: { contentType },
        customMetadata: { fileAssetId: id, reason: result.reason ?? "", quarantinedBy: staff.id },
      });
      await c.env.FILES.delete(fa.r2_key);
      quarantined = true;
    } catch {
      // Could not park a copy — then do NOT delete. Leaving the object on a key
      // no route will serve is strictly better than losing it.
    }
  }
  await c.env.DB.prepare("UPDATE file_asset SET virus_status = ?, scan_engine = ?, scanned_at = datetime('now') WHERE id = ?")
    .bind(status, result.engine, id).run();
  await logEvent(c.env, {
    actor: staff.id, entityType: "file", entityId: id,
    action: `rescanned file → ${status}${result.reason ? ` (${result.reason})` : ""}${result.verdict === "infected" ? (quarantined ? " — moved to quarantine/" : " — quarantine FAILED, bytes left in place") : ""}`,
  });
  return c.json({ ok: true, status, engine: result.engine, reason: result.reason ?? null, quarantined });
});

// ═══════════════════════════════════════════════════════════════════════════
// Estimator (CPQ) — the deterministic selection engine's support seam. There is
// no ops review surface for it: selection happens inside the customer's draft, so
// the first staff touchpoint is the submitted quote, in Quotes.
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/ops/projects/:id/estimate — select + price every opening_instance.
// SUPPORT LEVER ONLY (never in the ops UI): the pipeline estimates automatically
// on upload; this remains for support/debugging and for AI_EXTRACTION_MODE='manual'.
ops.post("/projects/:id/estimate", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const projectId = c.req.param("id");
  const project = await c.env.DB.prepare("SELECT id FROM project WHERE id = ?").bind(projectId).first();
  if (!project) return c.json({ error: "not_found" }, 404);
  const summary = await runProjectEstimate(c.env, projectId);
  await logEvent(c.env, { actor: staff.id, entityType: "project", entityId: projectId, action: `estimator run — ${summary.selected}/${summary.openings} openings selected` });
  return c.json(summary);
});


// GET /api/ops/lines/:id/configurations — exact, currently eligible catalogue
// configurations for a review line. Loaded on demand to avoid a Sanity request
// per row when opening the quote workspace.
ops.get("/lines/:id/configurations", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const line = await c.env.DB.prepare(
    "SELECT * FROM quote_line WHERE id=?",
  ).bind(c.req.param("id")).first<LineRow>();
  if (!line) return c.json({ error: "not_found" }, 404);
  const opening = await c.env.DB.prepare(
    `SELECT o.* FROM opening_instance o
      WHERE o.quote_line_id=?
         OR o.id=(SELECT opening_id FROM ai_proposal_line WHERE id=?)
      ORDER BY o.created_at DESC LIMIT 1`,
  ).bind(line.id, line.ai_proposal_line_id ?? "").first<OpeningRow>();
  if (!opening) return c.json({ error: "opening_not_found" }, 409);
  const dims = safeParse(line.dims_json);
  const input = {
    ...toOpeningInput(opening),
    widthMm: Number(dims.width) || null,
    heightMm: Number(dims.height) || null,
    qty: Math.max(1, Math.floor(line.qty || 1)),
  };
  const repo = createCatalogueRepository(sanityExecutor(c.env));
  const candidates = await repo.queryCandidates(opening.family, opening.operation_type);
  const configurations = candidates.flatMap((candidate) => {
    if (!candidate.pricingRef) return [];
    const rule = checkHardRules(input, candidate);
    if (!rule.passed) return [];
    return candidate.performanceVariants
      .filter((variant) => variant.published &&
        (!rule.eligibleVariantIds?.length || rule.eligibleVariantIds.includes(variant.variantId)))
      .map((variant) => ({
        productSlug: candidate.slug,
        productName: candidate.name,
        variantId: variant.variantId,
        frameTechnology: variant.frameTechnology,
        glazing: variant.glazingOptionSlug,
        uValue: variant.uValue,
        shgc: variant.shgc,
      }));
  });
  return c.json({ configurations });
});

// PATCH /api/ops/recommendation-outcomes/:id — explicitly adjudicate a
// finalized human adjustment before it can influence future recommendations.
// Physical/thermal corrections remain a separate signal from commercial
// preference learning.
ops.patch("/recommendation-outcomes/:id", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  if (action === "reject") {
    const changed = await c.env.DB.prepare(
      `UPDATE recommendation_outcome
          SET quality_state='rejected', recommendation_eligible=0, thermal_eligible=0,
              reviewed_by=?, reviewed_at=datetime('now')
        WHERE id=? AND quality_state='pending' RETURNING id, project_id`,
    ).bind(staff.id, c.req.param("id")).first<{ id: string; project_id: string }>();
    if (!changed) return c.json({ error: "not_found_or_final" }, 409);
    await refreshLearningExampleEligibility(c.env, changed.project_id).catch(() => false);
    return c.json({ ok: true, qualityState: "rejected" });
  }
  const reasonCode = String(body?.reasonCode ?? "").trim();
  if (action !== "approve" || !isOverrideReason(reasonCode)) {
    return c.json({ error: "invalid_reason_code" }, 400);
  }
  const policy = OVERRIDE_REASONS[reasonCode];
  if (policy.thermal && !canAdjudicateThermal(staff)) {
    return c.json({ error: "thermal_review_role_required" }, 403);
  }
  let reviewedThermal: string | null = null;
  if (policy.thermal) {
    const raw = body?.thermalTarget && typeof body.thermalTarget === "object" ? body.thermalTarget : {};
    const maxUValue = Number(raw.maxUValue);
    const minShgc = raw.minShgc == null ? null : Number(raw.minShgc);
    const maxShgc = raw.maxShgc == null ? null : Number(raw.maxShgc);
    if (!Number.isFinite(maxUValue) || maxUValue < 0.5 || maxUValue > 10 ||
        (minShgc != null && (!Number.isFinite(minShgc) || minShgc < 0 || minShgc > 1)) ||
        (maxShgc != null && (!Number.isFinite(maxShgc) || maxShgc < 0 || maxShgc > 1)) ||
        (minShgc != null && maxShgc != null && minShgc > maxShgc)) {
      return c.json({ error: "valid_thermal_target_required" }, 400);
    }
    reviewedThermal = JSON.stringify({ maxUValue, minShgc, maxShgc });
  }
  const changed = await c.env.DB.prepare(
    `UPDATE recommendation_outcome
        SET reason_code=?, quality_state='approved',
            recommendation_eligible=?, thermal_eligible=?,
            reviewed_thermal_json=?, reviewed_by=?, reviewed_at=datetime('now')
      WHERE id=? AND decision='adjusted' AND quality_state='pending'
      RETURNING id, project_id`,
  ).bind(
    reasonCode, policy.ranker ? 1 : 0, policy.thermal ? 1 : 0,
    reviewedThermal, staff.id, c.req.param("id"),
  ).first<{ id: string; project_id: string }>();
  if (!changed) return c.json({ error: "not_found_or_final" }, 409);
  await refreshLearningExampleEligibility(c.env, changed.project_id).catch(() => false);
  await logEvent(c.env, {
    actor: staff.id, entityType: "recommendation_outcome", entityId: changed.id,
    action: `adjudicated recommendation outcome: ${reasonCode}`,
  });
  return c.json({
    ok: true, qualityState: "approved",
    recommendationEligible: policy.ranker, thermalEligible: policy.thermal,
  });
});

ops.get("/projects/:id/recommendation-outcomes", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT id, quote_line_id, ai_proposal_line_id, external_ref,
            context_key, context_json, proposed_config_json, final_config_json,
            proposed_product_slug, proposed_variant_id, proposed_line_total,
            final_product_slug, final_variant_id, final_line_total, price_delta,
            decision, reason_code, recommendation_eligible, thermal_eligible,
            quality_state, reviewed_by, reviewed_at, created_at
       FROM recommendation_outcome
      WHERE project_id=? ORDER BY created_at DESC`,
  ).bind(c.req.param("id")).all();
  return c.json({
    outcomes: results ?? [],
    reasonOptions: Object.entries(OVERRIDE_REASONS).map(([code, policy]) => ({
      code,
      layer: policy.layer,
      learnsProductPreference: policy.ranker,
      learnsThermalTarget: policy.thermal,
    })),
  });
});

// POST /api/ops/projects/:id/ai-runs — run the LLM building-modelling pipeline
// (strategy §19.1): ingest documents, extract via the single primary model,
// persist the evidence-linked building model, then deterministic selection.
// SUPPORT LEVER ONLY (not in the ops UI): extraction fires automatically on
// upload; this is the manual trigger for AI_EXTRACTION_MODE='manual' incidents.
// Retry durable finalized-quote learning delivery after transient D1/R2 errors.
ops.post("/learning-outbox/drain", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!canManageLearning(staff)) return c.json({ error: "forbidden_role" }, 403);
  const result = await drainLearningOutbox(c.env);
  await logEvent(c.env, {
    actor: staff.id, entityType: "learning_outbox", entityId: "batch",
    action: `retried learning delivery: ${result.completed}/${result.attempted} completed`,
  });
  return c.json(result);
});

ops.post("/projects/:id/ai-runs", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const projectId = c.req.param("id");
  const project = await c.env.DB.prepare("SELECT id FROM project WHERE id = ?").bind(projectId).first();
  if (!project) return c.json({ error: "not_found" }, 404);
  if (!c.env.AI) return c.json({ error: "ai_unavailable" }, 409);
  try {
    const queued = await retryCurrentAiExtraction(c.env, c.executionCtx, projectId);
    await logEvent(c.env, {
      actor: staff.id,
      entityType: "project",
      entityId: projectId,
      action: queued.alreadyQueued
        ? `AI extraction already queued for generation ${queued.job.generation}`
        : `AI extraction retry queued for generation ${queued.job.generation}`,
    });
    return c.json({
      accepted: true,
      alreadyQueued: queued.alreadyQueued,
      generation: queued.job.generation,
      status: queued.alreadyQueued ? "in_progress" : "queued",
    }, 202);
  } catch (error) {
    const code = error instanceof Error ? error.message : "ai_retry_failed";
    if (code === "project_not_mutable") return c.json({ error: "project_not_mutable" }, 409);
    if (code === "ai_generation_conflict") return c.json({ error: "project_changed_retry" }, 409);
    throw error;
  }
});

// GET /api/ops/projects/:id/building-model — the latest evidence-linked building
// model + its run status (strategy §19.2 review surface).
ops.get("/projects/:id/building-model", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const projectId = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT b.id, b.schema_version, b.status, b.model_json, b.confidence_json, b.created_at,
            r.status AS run_status, r.pipeline_version, r.primary_model, r.input_mode
       FROM building_models b JOIN ai_runs r ON r.id = b.ai_run_id
      WHERE b.project_id = ? ORDER BY b.created_at DESC LIMIT 1`,
  ).bind(projectId).first<any>();
  if (!row) return c.json({ error: "not_found" }, 404);
  const { results: evidence } = await c.env.DB.prepare(
    "SELECT entity_path, file_id, page_no, extracted_text, origin, confidence, review_state FROM evidence_items WHERE project_id = ? ORDER BY entity_path",
  ).bind(projectId).all<any>();
  return c.json({
    id: row.id, schemaVersion: row.schema_version, status: row.status, createdAt: row.created_at,
    run: { status: row.run_status, pipelineVersion: row.pipeline_version, primaryModel: row.primary_model, inputMode: row.input_mode },
    model: safeParse(row.model_json ?? "{}"),
    confidence: safeParse(row.confidence_json ?? "{}"),
    evidence: evidence ?? [],
  });
});
// GET /api/ops/projects/:id/thermal — the THERMAL AUDIT for one project: per
// line, the thermal target that was parsed from the source documents, next to the
// product and glass the machine proposed for it.
//
// A SNAPSHOT OF THE PARSE. Every value here is read from a record no later action
// can move — not the live line, not the live catalogue:
//
//   target    ai_proposal_line.ranking_context_json.requirements  (the band as it
//             stood when the decision was made), or for a unit the matched
//             building_models component's own requirement. Both are INSERT-only.
//   proposal  ai_proposal_line — append-only across the whole worker.
//   labels    building_models.model_json component refs, matched by the stored
//             segment_seq. No product lookup, so no catalogue and no edited slug.
//
// It follows that a human edit cannot change what this returns, and neither can a
// WERS re-import or a product being withdrawn. That is the whole point: it records
// what the parse decided, not what the order looks like today.
//
// Driven from quote_line, not opening_instance, deliberately: a schedule-only or
// anonymous project has quote_line rows and NO opening_instance, so an
// opening-driven query would report those positions as absent rather than as
// never having been thermally parsed at all.
ops.get("/projects/:id/thermal", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const projectId = c.req.param("id");

  const project = await c.env.DB.prepare("SELECT id FROM project WHERE id = ?")
    .bind(projectId).first<{ id: string }>();
  if (!project) return c.json({ error: "not_found" }, 404);

  const { results } = await c.env.DB.prepare(
    `SELECT ql.id, ql.external_ref, ql.line_kind, ql.parent_line_id, ql.segment_seq, ql.dims_json,
            ql.configuration_snapshot_json,
            o.requirements_json, o.requirement_basis, o.operation_type, o.width_mm, o.height_mm,
            apl.performance_json, apl.ranking_context_json,
            -- ALIASED, and it must stay aliased: apl.product_slug collides with a
            -- quote_line column of the same name and D1 resolves a duplicate result
            -- name last-wins, which would silently substitute one for the other.
            apl.product_slug AS ai_product_slug, apl.performance_variant_id AS ai_variant_id
       FROM quote_line ql
       LEFT JOIN opening_instance o ON o.quote_line_id = ql.id
       LEFT JOIN ai_proposal_line apl ON apl.id = ql.ai_proposal_line_id
      WHERE ql.project_id = ?`,
  ).bind(projectId).all<any>();

  const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  // Dimensions are written as STRINGS by every quote_line writer ({"width":"905"}),
  // so a number-only coercion silently blanked the size of every unit and every
  // schedule line. Accept both shapes.
  const dim = (v: unknown): number | null => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string" && v.trim()) { const p = Number(v); return Number.isFinite(p) ? p : null; }
    return null;
  };

  // ── the parse's own component schedule ──────────────────────────────────────
  // Where the energy report named the units of a composite it also gave them their
  // OWN codes and OWN bands. Nothing writes either onto the segment row, so both
  // are read back off the building model, which is INSERT-only.
  const bm = await c.env.DB.prepare(
    "SELECT model_json FROM building_models WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(projectId).first<{ model_json: string }>();
  type Component = { ref: string; operationType: string | null; requirement: any };
  const componentsByOpening = new Map<string, Component[]>();
  if (bm?.model_json) {
    const model = safeParse(bm.model_json) as any;
    for (const o of Array.isArray(model?.openings) ? model.openings : []) {
      const comps = Array.isArray(o?.thermalComponents) ? o.thermalComponents : [];
      if (o?.externalRef && comps.length) {
        componentsByOpening.set(String(o.externalRef), comps.map((cp: any) => ({
          ref: String(cp?.ref ?? ""),
          operationType: s(cp?.operationType),
          requirement: cp?.requirement ?? null,
        })).filter((cp: Component) => cp.ref));
      }
    }
  }
  // Units are matched to components POSITIONALLY, on the stored segment_seq. The
  // split is built from the component schedule in its own order, so position is
  // the correspondence the parse itself created. It was previously matched on the
  // unit's current product — which made a label move when someone changed that
  // product, and let two units swap codes while their frozen bands stayed put.
  // A, B, C… — the convention a schedule uses for the units of one opening, so a
  // split we invented reads the way the trade writes it. The previous positional
  // form (W1·1) was an attempt not to imply the report had named the unit; the
  // basis column already says whether a document did, and a dot-number is not a
  // code anybody uses.
  const unitLetter = (seq: number | null): string => {
    const i = Math.max(0, seq ?? 0);
    return i < 26 ? String.fromCharCode(65 + i) : `-${i + 1}`;
  };
  const componentFor = (parentRef: string | null, seq: number | null): Component | null => {
    const comps = parentRef ? componentsByOpening.get(parentRef) : null;
    if (!comps?.length || seq == null) return null;
    return comps[seq] ?? null;
  };

  const refById = new Map<string, string | null>();
  const unitsByParent = new Map<string, number>();
  for (const r of results ?? []) {
    refById.set(r.id, r.external_ref);
    if (r.line_kind === "segment" && r.parent_line_id) {
      unitsByParent.set(r.parent_line_id, (unitsByParent.get(r.parent_line_id) ?? 0) + 1);
    }
  }

  const bandOf = (raw: any, basis: string | null) => {
    if (!raw || typeof raw !== "object") return null;
    const maxUValue = n(raw.maxUValue);
    // The building model spells its SHGC bounds shgcMin/shgcMax; the estimator's
    // own band spells them minShgc/maxShgc. Read both rather than lose one.
    const minShgc = n(raw.minShgc) ?? n(raw.shgcMin);
    const maxShgc = n(raw.maxShgc) ?? n(raw.shgcMax);
    if (maxUValue == null && minShgc == null && maxShgc == null) return null;
    return { maxUValue, minShgc, maxShgc, basis: s(raw.basis) ?? basis };
  };

  // An opening's OWN band: the one the proposal was actually ranked against,
  // falling back to the opening row. ranking_context_json is preferred because the
  // pipeline rewrites requirements_json on every re-run — reading only the latter
  // could pit a newer target against an older, frozen proposal.
  const ownBand = (r: any) => {
    const ctx = r.ranking_context_json ? safeParse(r.ranking_context_json) as any : null;
    return bandOf(ctx?.requirements, s(r.requirement_basis))
      ?? bandOf(safeParse(r.requirements_json ?? "null"), s(r.requirement_basis));
  };
  const bandByLine = new Map<string, ReturnType<typeof bandOf>>();
  for (const r of results ?? []) if (r.line_kind !== "segment") bandByLine.set(r.id, ownBand(r));

  const rows = (results ?? []).map((r) => {
    const dims = safeParse(r.dims_json ?? "{}") as Record<string, unknown>;
    const isSegment = r.line_kind === "segment";
    const parentRef = isSegment && r.parent_line_id ? refById.get(r.parent_line_id) ?? null : null;
    const component = isSegment ? componentFor(parentRef, r.segment_seq) : null;

    // ── target ────────────────────────────────────────────────────────────────
    // A unit the report NAMED takes the band the report gave it. A unit we split
    // ourselves takes the band of the opening it came out of — the owner's rule:
    // the split is our manufacturing constraint, so it must not become a weaker
    // requirement on the customer's job. Neither is read from the unit row, whose
    // segment_requirements_json is deleted and rewritten by every re-split.
    const target = isSegment
      ? (component ? bandOf(component.requirement, "explicit_energy_report") : null)
        ?? (r.parent_line_id ? bandByLine.get(r.parent_line_id) ?? null : null)
      : ownBand(r);
    const hasTarget = !!target;

    // ── proposal ──────────────────────────────────────────────────────────────
    // From the machine's own frozen record, never from the line: a human edit
    // overwrites the line's product and drops its glass while deliberately keeping
    // the pointer to this row, so reading the product from one and the performance
    // from the other manufactured a window that never existed.
    // A UNIT carries its own frozen record on the line. It can never have an
    // ai_proposal_line — that table requires an opening_instance and a unit has
    // none — so reading only the proposal table reported a blank beside a unit
    // whose chosen product is plainly on the row, and blanked its verdict with
    // it. configuration_snapshot_json is written once by the estimator at split
    // time and no human path updates it, so it is a frozen proposal in every
    // sense this surface needs.
    const snapshot = isSegment && r.configuration_snapshot_json
      ? safeParse(r.configuration_snapshot_json) as Record<string, unknown>
      : null;
    const perf = r.performance_json ? safeParse(r.performance_json) as Record<string, unknown> : null;
    const aiProductSlug = s(r.ai_product_slug) ?? (snapshot ? s(snapshot.productSlug) : null);
    const proposed = aiProductSlug ? {
      productSlug: aiProductSlug,
      variantId: s(r.ai_variant_id) ?? (snapshot ? s(snapshot.variantId) : null),
      uw: (perf ? n(perf.uw) : null) ?? (snapshot ? n(snapshot.uw) : null),
      shgc: (perf ? n(perf.shgc) : null) ?? (snapshot ? n(snapshot.shgc) : null),
      source: (perf ? s(perf.source) : null) ?? (snapshot ? s(snapshot.source) : null),
    } : null;

    // ── verdict ───────────────────────────────────────────────────────────────
    let verdict: "met" | "missed" | "no_target" | "unknown" | "no_record" = "unknown";
    let miss: { uw: number | null; shgc: number | null } | null = null;
    // A unit has no ai_proposal_line — the segment INSERT omits the column — so
    // there is no frozen record of what was proposed for it. Saying so beats
    // resolving it live, which would give a figure that moves under the reader.
    if (isSegment && !proposed) verdict = "no_record";
    else if (!hasTarget) verdict = "no_target";
    else if (!proposed || (proposed.uw == null && proposed.shgc == null)) verdict = "unknown";
    else {
      const uwOver = target!.maxUValue != null && proposed.uw != null && proposed.uw > target!.maxUValue
        ? Math.round((proposed.uw - target!.maxUValue) * 1000) / 1000 : null;
      let shgcOff: number | null = null;
      if (proposed.shgc != null) {
        if (target!.minShgc != null && proposed.shgc < target!.minShgc) shgcOff = Math.round((proposed.shgc - target!.minShgc) * 1000) / 1000;
        else if (target!.maxShgc != null && proposed.shgc > target!.maxShgc) shgcOff = Math.round((proposed.shgc - target!.maxShgc) * 1000) / 1000;
      }
      // Unknown, not met: an unmeasured axis against a real constraint is not a pass.
      const uwUnknown = target!.maxUValue != null && proposed.uw == null;
      const shgcUnknown = (target!.minShgc != null || target!.maxShgc != null) && proposed.shgc == null;
      if (uwOver != null || shgcOff != null) { verdict = "missed"; miss = { uw: uwOver, shgc: shgcOff }; }
      else verdict = uwUnknown || shgcUnknown ? "unknown" : "met";
    }

    // A composite parent groups its units; it never proposes. Its own product is
    // the pre-split single unit that is not being built, and its band is a lossy
    // collapse of the components' — strictest Uw, and the SHGC pair dropped when
    // the components' ranges cannot both hold.
    const unitCount = unitsByParent.get(r.id) ?? 0;
    const isHeader = r.line_kind === "composite_parent" && unitCount > 0;

    return {
      lineId: r.id,
      ref: s(r.external_ref) ?? component?.ref ?? (parentRef ? `${parentRef}${unitLetter(r.segment_seq)}` : null),
      kind: isSegment ? "segment" : isHeader ? "composite" : "line",
      unitCount,
      operation: component?.operationType ?? s(r.operation_type),
      widthMm: n(r.width_mm) ?? dim(dims.width) ?? dim(dims.widthMm),
      heightMm: n(r.height_mm) ?? dim(dims.height) ?? dim(dims.heightMm),
      target,
      // The report did not name this unit, so it takes what the whole opening was
      // asked to meet. The CONSERVATIVE reading — a miss here is a flag to check,
      // not proof: the assembly can still average out.
      targetInherited: isSegment && hasTarget && !component,
      proposed: isHeader ? null : proposed,
      verdict: isHeader ? "header" : verdict,
      miss: isHeader ? null : miss,
      // Sort keys only; stripped before the response.
      _parentId: isSegment ? r.parent_line_id : null,
      _seq: r.segment_seq ?? 0,
    };
  });

  // ── order by ID ─────────────────────────────────────────────────────────────
  // By the item's own code, naturally sorted, with a composite's units directly
  // under their parent. quote_line.position cannot do this: it is a project-wide
  // counter for a line but a per-parent index for a unit, so ordering by it
  // interleaved units into unrelated openings.
  const naturalKey = (ref: string | null): [string, number, string] => {
    const m = /^([A-Za-z]*)(\d*)(.*)$/.exec((ref ?? "").trim());
    return [(m?.[1] ?? "").toUpperCase(), m?.[2] ? Number(m[2]) : Number.MAX_SAFE_INTEGER, (m?.[3] ?? "").toUpperCase()];
  };
  const byRef = (a: typeof rows[number], b: typeof rows[number]) => {
    const [ap, an, as_] = naturalKey(a.ref), [bp, bn, bs] = naturalKey(b.ref);
    return ap.localeCompare(bp) || an - bn || as_.localeCompare(bs) || a.lineId.localeCompare(b.lineId);
  };
  const unitsOf = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row._parentId) continue;
    const list = unitsOf.get(row._parentId) ?? [];
    list.push(row);
    unitsOf.set(row._parentId, list);
  }
  const ordered = rows
    .filter((row) => !row._parentId)
    .sort(byRef)
    .flatMap((row) => [row, ...(unitsOf.get(row.lineId) ?? []).sort((a, b) => a._seq - b._seq || byRef(a, b))]);
  // A unit whose parent is missing from the set would otherwise vanish.
  const seen = new Set(ordered.map((row) => row.lineId));
  const orphans = rows.filter((row) => !seen.has(row.lineId)).sort(byRef);

  return c.json({
    rows: [...ordered, ...orphans].map(({ _parentId, _seq, ...row }) => row),
  });
});
// The Estimator review workspace and its reviewer-correction capture were
// removed (2026-07-27, owner decision). They served a stage that does not exist:
// the AI proposal is built into the CUSTOMER's draft, so there is no staff review
// before submission — and after submission the work happens in the Quotes
// workspace. Learning now comes only from a REVIEWED QUOTE: outcomes are captured
// at issue (captureRecommendationOutcomes) and adjudicated afterwards via
// PATCH /recommendation-outcomes/:id. `candidate_result` still persists the full
// candidate set for audit, with or without a screen to render it.

// GET /api/ops/files/:id/download — staff download (any file).
ops.get("/files/:id/download", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const fa = await c.env.DB.prepare("SELECT r2_key, filename, virus_status FROM file_asset WHERE id = ?").bind(c.req.param("id")).first<{ r2_key: string; filename: string; virus_status: string }>();
  if (!fa) return c.json({ error: "not_found" }, 404);
  // Same gate as the customer path — staff are the likelier malware target, since
  // they open customer uploads on managed desktops. Unscanned files need a rescan.
  if (fa.virus_status === "infected") return c.json({ error: "quarantined" }, 403);
  if (fa.virus_status !== "clean") return c.json({ error: "scan_pending" }, 409);
  const obj = await c.env.FILES.get(fa.r2_key);
  if (!obj) return c.json({ error: "gone" }, 404);
  // A customer's uploaded documents leaving the building is the single most
  // consequential read in this console, and it was the one with no audit row.
  await logEvent(c.env, {
    actor: staff.id, entityType: "file", entityId: c.req.param("id"),
    action: `downloaded ${fa.filename}`,
  });
  // Parity with the customer download (routes/files.ts). This one interpolated
  // fa.filename raw — a name that comes from the client's multipart upload and is
  // stored verbatim, so a quote or a newline in it lands in a response header —
  // and it omitted Cache-Control, leaving staff-downloaded customer PII
  // shared-cacheable.
  const safe = fa.filename.replace(/[\r\n"\\]/g, "_").replace(/[\x00-\x1f]/g, "");
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(fa.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
});

// GET /api/ops/audit — recent audit events (optionally ?entity=project|order).
ops.get("/audit", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const entity = c.req.query("entity");
  const base = "SELECT a.entity_type, a.entity_id, a.action, a.occurred_at, COALESCE(u.name, a.actor) AS actor FROM audit_event a LEFT JOIN user u ON u.id = a.actor";
  const q = entity ? `${base} WHERE a.entity_type = ? ORDER BY a.occurred_at DESC LIMIT 200` : `${base} ORDER BY a.occurred_at DESC LIMIT 200`;
  const stmt = entity ? c.env.DB.prepare(q).bind(entity) : c.env.DB.prepare(q);
  const { results } = await stmt.all();
  return c.json({ events: results });
});

// GET /api/ops/staff — internal users + roles.
ops.get("/staff", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const { results } = await c.env.DB.prepare("SELECT id, email, name, role, last_verified_at FROM user WHERE type = 'internal' ORDER BY name").all();
  return c.json({ staff: results, roles: ["estimator", "technical_reviewer", "manager", "admin"] });
});

// PATCH /api/ops/staff/:id { role } — change a staff member's role (admin only).
ops.patch("/staff/:id", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!isAdmin(staff)) return c.json({ error: "admin_only" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const role = String(body?.role ?? "").trim();
  const valid = ["estimator", "technical_reviewer", "manager", "admin"];
  if (!valid.includes(role)) return c.json({ error: "invalid_role" }, 400);
  // Never demote the last admin — including yourself.
  //
  // Access is flat, so 'estimator', 'technical_reviewer' and 'manager' are the
  // same privilege; 'admin' is the only value that gates anything (this endpoint,
  // and changing a customer's sign-in email). Demoting the only admin therefore
  // does not reduce anyone's access — it removes the ability to ever grant it
  // again, and re-arms the empty-database bootstrap on a live system, where the
  // next authenticated request claims admin rather than the next sign-in.
  // Single statement, so two admins demoting each other at once cannot both win.
  const res = await c.env.DB.prepare(
    `UPDATE user SET role = ? WHERE id = ? AND type = 'internal'
      AND (? = 'admin' OR role IS NOT 'admin'
           OR EXISTS (SELECT 1 FROM user WHERE type = 'internal' AND role = 'admin' AND id <> ?))`,
  ).bind(role, c.req.param("id"), role, c.req.param("id")).run();
  if (!res.meta.changes) {
    const target = await c.env.DB.prepare("SELECT role FROM user WHERE id = ? AND type = 'internal'")
      .bind(c.req.param("id")).first<{ role: string | null }>();
    if (!target) return c.json({ error: "not_found" }, 404);
    return c.json({ error: "last_admin" }, 409);
  }
  await logEvent(c.env, { actor: staff.id, entityType: "user", entityId: c.req.param("id"), action: `set role ${role}` });
  return c.json({ ok: true, role });
});

// ═══════════════════════════════════════════════════════════════════════════
// Enquiries — Contact-page leads (questions + showroom appointments). Every lead
// carries a durable OpenFrame reference + immutable source_owner; four independent
// status dimensions; manufacturer handoff + downstream reconciliation. Contains
// customer PII, so gated behind an assigned role like Customers/Files.
// ═══════════════════════════════════════════════════════════════════════════
const ENQUIRY_DIMENSIONS: Record<string, string[]> = {
  workflow_status: ["new", "assigned", "in_progress", "waiting_on_customer", "closed"],
  contact_outcome: ["not_contacted", "attempted", "contacted", "no_response"],
  appointment_status: ["not_applicable", "requested", "proposed", "confirmed", "completed", "cancelled", "no_show"],
  commercial_outcome: ["unknown", "manufacturer_quote_created", "order_placed", "lost", "not_applicable"],
};

const enquiryRowDto = (r: any) => ({
  id: r.id, reference: r.public_reference, intent: r.intent,
  name: r.name, company: r.company,
  email: r.email_display || r.email, phone: r.phone_display || r.phone,
  locationSuburb: r.location_suburb, locationState: r.location_state,
  sourceOwner: r.source_owner, sourceEntryPoint: r.source_entry_point,
  workflowStatus: r.workflow_status, contactOutcome: r.contact_outcome,
  appointmentStatus: r.appointment_status, commercialOutcome: r.commercial_outcome,
  assignedUser: r.assigned_user, assignedName: r.assigned_name,
  createdAt: r.created_at,
});

const enquiryDetailDto = (r: any) => ({
  ...enquiryRowDto(r),
  customerType: r.customer_type, topic: r.topic, message: r.message,
  locationId: r.location_id, productsInterest: r.products_interest,
  bestTimeToCall: r.best_time_to_call, preferredDays: safeParse(r.preferred_days_json || "[]"),
  appointmentNotes: r.appointment_notes,
  accountId: r.account_id, projectId: r.project_id,
  landingPath: r.landing_path, referrer: r.referrer, utm: safeParse(r.utm_json || "{}"),
  formVersion: r.form_version, privacyVersion: r.privacy_version, marketingOptIn: !!r.marketing_opt_in,
  manufacturerQuoteRef: r.manufacturer_quote_ref, manufacturerOrderRef: r.manufacturer_order_ref,
  handedOffAt: r.handed_off_at, manufacturerAckAt: r.manufacturer_ack_at,
  updatedAt: r.updated_at,
});

// GET /api/ops/enquiries — filterable list, newest first.
ops.get("/enquiries", async (c) => {
  const staff = await resolveOpsUser(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  // Enquiries are the ONE surface a manufacturer partner reaches.
  if (!hasAssignedRole(staff) && !isManufacturer(staff)) return c.json({ error: "forbidden_role" }, 403);
  const q = c.req.query();
  const where: string[] = []; const binds: unknown[] = [];
  const eq = (param: string, col: string) => { if (q[param]) { where.push(`e.${col} = ?`); binds.push(q[param]); } };
  eq("intent", "intent"); eq("status", "workflow_status"); eq("state", "location_state");
  eq("contact", "contact_outcome"); eq("appointment", "appointment_status");
  eq("commercial", "commercial_outcome"); eq("assigned", "assigned_user");
  if (q.from) { where.push("e.created_at >= ?"); binds.push(q.from); }
  if (q.to) { where.push("e.created_at <= ?"); binds.push(q.to); }
  const sql = `SELECT e.*, u.name AS assigned_name FROM enquiry e LEFT JOIN user u ON u.id = e.assigned_user
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY e.created_at DESC LIMIT 300`;
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ enquiries: results.map(enquiryRowDto) });
});

// GET /api/ops/enquiries/:id — full lead + attribution + activity trail.
ops.get("/enquiries/:id", async (c) => {
  const staff = await resolveOpsUser(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  // Enquiries are the ONE surface a manufacturer partner reaches.
  if (!hasAssignedRole(staff) && !isManufacturer(staff)) return c.json({ error: "forbidden_role" }, 403);
  const e = await c.env.DB.prepare(
    "SELECT e.*, u.name AS assigned_name FROM enquiry e LEFT JOIN user u ON u.id = e.assigned_user WHERE e.id = ?",
  ).bind(c.req.param("id")).first<any>();
  if (!e) return c.json({ error: "not_found" }, 404);
  const { results: activity } = await c.env.DB.prepare(
    "SELECT a.action, a.occurred_at, COALESCE(u.name, a.actor) AS actor FROM audit_event a LEFT JOIN user u ON u.id = a.actor WHERE a.entity_type = 'enquiry' AND a.entity_id = ? ORDER BY a.occurred_at DESC",
  ).bind(c.req.param("id")).all();
  return c.json({ enquiry: enquiryDetailDto(e), activity });
});

// PATCH /api/ops/enquiries/:id — assign, move any status dimension, reconcile with
// a downstream AMJ quote/order, or acknowledge the handoff. source_owner is never
// settable here (server-owned).
ops.patch("/enquiries/:id", async (c) => {
  const staff = await resolveOpsUser(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  // Enquiries are the ONE surface a manufacturer partner reaches.
  if (!hasAssignedRole(staff) && !isManufacturer(staff)) return c.json({ error: "forbidden_role" }, 403);
  const id = c.req.param("id");
  const exists = await c.env.DB.prepare("SELECT id FROM enquiry WHERE id = ?").bind(id).first();
  if (!exists) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));

  const sets: string[] = []; const binds: unknown[] = [];
  const dim = (key: string, col: string) => {
    if (body?.[key] !== undefined && ENQUIRY_DIMENSIONS[col].includes(String(body[key]))) { sets.push(`${col} = ?`); binds.push(String(body[key])); }
  };
  dim("workflowStatus", "workflow_status");
  dim("contactOutcome", "contact_outcome");
  dim("appointmentStatus", "appointment_status");
  dim("commercialOutcome", "commercial_outcome");
  if (body?.assignedUser !== undefined) { sets.push("assigned_user = ?"); binds.push(body.assignedUser ? String(body.assignedUser) : null); }
  if (body?.manufacturerQuoteRef !== undefined) { sets.push("manufacturer_quote_ref = ?"); binds.push(String(body.manufacturerQuoteRef).trim().slice(0, 120) || null); }
  if (body?.manufacturerOrderRef !== undefined) { sets.push("manufacturer_order_ref = ?"); binds.push(String(body.manufacturerOrderRef).trim().slice(0, 120) || null); }
  if (body?.manufacturerAck === true) sets.push("manufacturer_ack_at = datetime('now')");
  if (!sets.length) return c.json({ error: "no_changes" }, 400);

  sets.push("updated_at = datetime('now')");
  await c.env.DB.prepare(`UPDATE enquiry SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
  await logEvent(c.env, { actor: staff.id, entityType: "enquiry", entityId: id, action: "updated enquiry" });
  const fresh = await c.env.DB.prepare(
    "SELECT e.*, u.name AS assigned_name FROM enquiry e LEFT JOIN user u ON u.id = e.assigned_user WHERE e.id = ?",
  ).bind(id).first<any>();
  return c.json({ enquiry: enquiryDetailDto(fresh) });
});

// POST /api/ops/enquiries/:id/contact-log — record a contact attempt/outcome.
ops.post("/enquiries/:id/contact-log", async (c) => {
  const staff = await resolveOpsUser(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  // Enquiries are the ONE surface a manufacturer partner reaches.
  if (!hasAssignedRole(staff) && !isManufacturer(staff)) return c.json({ error: "forbidden_role" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const outcome = ENQUIRY_DIMENSIONS.contact_outcome.includes(String(body?.outcome)) ? String(body.outcome) : "attempted";
  const note = String(body?.note ?? "").trim().slice(0, 500);
  const res = await c.env.DB.prepare("UPDATE enquiry SET contact_outcome = ?, updated_at = datetime('now') WHERE id = ?").bind(outcome, id).run();
  if (!res.meta.changes) return c.json({ error: "not_found" }, 404);
  await logEvent(c.env, { actor: staff.id, entityType: "enquiry", entityId: id, action: `contact ${outcome}${note ? `: ${note}` : ""}` });
  return c.json({ ok: true, contactOutcome: outcome });
});

// GET /api/ops/search?q= — omnibox across projects, orders, orgs, customers.
ops.get("/search", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) return c.json({ results: [] });
  const like = `%${q}%`;
  const projects = (await c.env.DB.prepare("SELECT id, title, status_customer FROM project WHERE title LIKE ? LIMIT 8").bind(like).all()).results;
  const orders = (await c.env.DB.prepare('SELECT id, order_no, stage FROM "order" WHERE order_no LIKE ? LIMIT 8').bind(like).all()).results;
  const orgs = (await c.env.DB.prepare("SELECT id, name FROM organisation WHERE name LIKE ? LIMIT 8").bind(like).all()).results;
  const customers = (await c.env.DB.prepare("SELECT id, name, email FROM user WHERE type = 'customer' AND (name LIKE ? OR email LIKE ?) LIMIT 8").bind(like, like).all()).results;
  return c.json({
    results: [
      ...projects.map((p: any) => ({ type: "project", id: p.id, label: p.title ?? "Untitled", hint: p.status_customer })),
      ...orders.map((o: any) => ({ type: "order", id: o.id, label: o.order_no, hint: o.stage })),
      ...orgs.map((o: any) => ({ type: "organisation", id: o.id, label: o.name, hint: "organisation" })),
      ...customers.map((u: any) => ({ type: "customer", id: u.id, label: u.name ?? u.email, hint: u.email })),
    ],
  });
});
