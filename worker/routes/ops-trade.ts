// /api/ops/trade — the console's trade-verification surfaces.
//
// Staff-only, and separate from ops.ts because that file is already the largest
// route module in the Worker. Routes stay thin and the rules live in
// worker/lib/trade.ts, which the CUSTOMER path uses too — the ops actions call
// the same functions rather than writing rows directly, so a privileged path
// cannot become the way around a gate (the ops-referrals.ts precedent).
//
// This queue carries customer PII — names, addresses of business, ABNs — so it
// is visible only to staff who may already see it. Not admin-only: owner ruling
// Q4 is assigned-role staff, which is what `resolveStaff` answers (a
// manufacturer partner signs in through the same console and is refused here).
import { Hono } from "hono";
import type { Env } from "../types";
import { resolveStaff } from "../lib/staff";
import { approveApplication, pendingApplications } from "../lib/trade";

export const opsTrade = new Hono<{ Bindings: Env }>();

/** ASSUMED: P2-ARCH-4 — a decision note or a rejection reason is prose a person
 *  reads later, not a document. Clipped here rather than refused, because an
 *  over-long note is a slip of the finger, not an attack on the schema. */
const MAX_REASON = 500;

// GET /api/ops/trade/applications — the review queue, pending only (AC-P2-35).
opsTrade.get("/applications", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  return c.json({ applications: await pendingApplications(c.env) });
});

// POST /api/ops/trade/applications/:id/approve { note? }
//
// The 409 is not a nicety: a decided application must be un-decidable, and the
// guarded UPDATE inside the engine is what makes a concurrent second click one
// decision rather than two grants (AC-P2-39, AB-P2-14).
opsTrade.post("/applications/:id/approve", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const note = typeof body?.note === "string" ? body.note.slice(0, MAX_REASON) : undefined;

  const result = await approveApplication(c.env, c.req.param("id"), staff, note);
  if (result.ok) return c.json({ ok: true });
  if (result.error === "not_found") return c.json({ error: "not_found" }, 404);
  if (result.error === "already_decided") return c.json({ error: "already_decided" }, 409);
  return c.json({ error: result.error }, 403);
});
