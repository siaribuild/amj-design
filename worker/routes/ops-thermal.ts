// /api/ops/thermal — the calibration read, and nothing else.
//
// ONE ROUTE, ONE VERB. There is deliberately no write path for the default band
// in this release: setting it is a privileged DB act (a wrangler remote execute,
// behind the auto-mode gate) until the ops screen that would justify an
// authenticated writer exists. A write endpoint with no screen behind it is an
// authorization surface bought for nobody, and this file's shape is what makes
// that absence testable rather than merely intended.
//
// The calibration is deliberately UNSCOPED across accounts — a cross-account
// aggregate is precisely what it is for — so the guard is not a scoping filter
// but the payload: the two D1 statements select no identifier column,
// `project_id` appears only inside a COUNT(DISTINCT …), and axis 3 reads
// catalogue documents rather than customer data.
import { Hono } from "hono";
import type { Env } from "../types";
import { resolveStaff } from "../lib/staff";
import { readCalibration } from "../lib/estimator/thermal/calibration";

export const opsThermal = new Hono<{ Bindings: Env }>();

opsThermal.get("/calibration", async (c) => {
  // Cloudflare Access is the perimeter on ops.*; this is the in-route gate, so
  // the refusal holds even where the perimeter does not run.
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  return c.json(await readCalibration(c.env));
});
