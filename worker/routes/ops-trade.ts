// /api/ops/trade — the console's trade-verification surfaces.
//
// Staff-only, and separate from ops.ts because that file is already the largest
// route module in the Worker. Routes stay thin and the rules live in
// worker/lib/trade.ts, which the CUSTOMER path uses too — the ops actions call
// the same functions rather than writing rows directly, so a privileged path
// cannot become the way around a gate (the ops-referrals.ts precedent).
//
// This queue carries customer PII — names, business names, ABNs — so it is
// visible only to staff who may already see it. Not admin-only: owner ruling Q4
// is assigned-role staff, and a manufacturer partner signs in through the same
// console and is refused on every endpoint here.
import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { hasAssignedRole, resolveStaff } from "../lib/staff";
import { approveApplication, pendingApplications, rejectApplication, revokeTrade } from "../lib/trade";

export const opsTrade = new Hono<{ Bindings: Env }>();

/** ASSUMED: P2-ARCH-4 — a decision note or a rejection reason is prose a person
 *  reads later, not a document. Clipped rather than refused, because an
 *  over-long note is a slip of the finger, not an attack on the schema. */
const MAX_REASON = 500;

/** The gate every handler in this file opens with, in ONE place.
 *
 *  There is no auth middleware in this Worker (handover §4.5), so a new endpoint
 *  is unauthenticated until it says otherwise — this is how each one says it.
 *
 *  TWO checks, not one. `resolveStaff` already refuses a manufacturer partner,
 *  so `hasAssignedRole` is unreachable today; it is the check that keeps this
 *  queue shut if `resolveStaff` is ever loosened, which is exactly the moment
 *  nobody would think to come back here. */
async function assignedStaff(c: Context<{ Bindings: Env }>) {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return { refusal: c.json({ error: "forbidden" }, 403) };
  if (!hasAssignedRole(staff)) return { refusal: c.json({ error: "forbidden_role" }, 403) };
  return { staff };
}

const reasonFrom = (body: Record<string, unknown>, key: string): string =>
  typeof body?.[key] === "string" ? (body[key] as string).slice(0, MAX_REASON) : "";

// GET /api/ops/trade/applications — the review queue, pending only (AC-P2-35).
opsTrade.get("/applications", async (c) => {
  const gate = await assignedStaff(c);
  if ("refusal" in gate) return gate.refusal;
  return c.json({ applications: await pendingApplications(c.env) });
});

// POST /api/ops/trade/applications/:id/approve { note? }
//
// The 409 is not a nicety: a decided application must be un-decidable, and the
// guarded UPDATE inside the engine is what makes a concurrent second click one
// decision rather than two grants (AC-P2-39, AB-P2-14).
opsTrade.post("/applications/:id/approve", async (c) => {
  const gate = await assignedStaff(c);
  if ("refusal" in gate) return gate.refusal;
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

  const result = await approveApplication(c.env, c.req.param("id"), gate.staff, reasonFrom(body, "note"));
  if (result.ok) return c.json({ ok: true });
  if (result.error === "not_found") return c.json({ error: "not_found" }, 404);
  if (result.error === "already_decided") return c.json({ error: "already_decided" }, 409);
  return c.json({ error: result.error }, 403);
});

// POST /api/ops/trade/applications/:id/reject { reason }
//
// The reason is required, and it is what the customer's record carries forward:
// prose a colleague reads in six months, not a status code. It never travels to
// the customer — the rejection email is deliberately general (AC-P2-44).
opsTrade.post("/applications/:id/reject", async (c) => {
  const gate = await assignedStaff(c);
  if ("refusal" in gate) return gate.refusal;
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

  const result = await rejectApplication(c.env, c.req.param("id"), gate.staff, reasonFrom(body, "reason"));
  if (result.ok) return c.json({ ok: true });
  if (result.error === "not_found") return c.json({ error: "not_found" }, 404);
  if (result.error === "already_decided") return c.json({ error: "already_decided" }, 409);
  return c.json({ error: result.error }, 400);
});

// POST /api/ops/trade/customers/:id/revoke { reason }
//
// Addressed to the ACCOUNT rather than to an application: "stop this customer
// paying trade prices" is what a person means, and making them find the right
// application first would be an invitation to revoke the wrong one.
opsTrade.post("/customers/:id/revoke", async (c) => {
  const gate = await assignedStaff(c);
  if ("refusal" in gate) return gate.refusal;
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

  const result = await revokeTrade(c.env, c.req.param("id"), gate.staff, reasonFrom(body, "reason"));
  if (result.ok) return c.json({ ok: true });
  if (result.error === "not_found") return c.json({ error: "not_found" }, 404);
  if (result.error === "not_verified") return c.json({ error: "not_verified" }, 409);
  return c.json({ error: result.error }, 400);
});
