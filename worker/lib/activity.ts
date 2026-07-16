// Immutable activity log (audit_event). State changes and key actions are
// recorded here; human messages live in `comment`. The timeline merges both.
import type { Env } from "../types";
import { uuid } from "./util";

export async function logEvent(env: Env, opts: {
  actor?: string;          // user id, or 'system'
  entityType: string;      // 'project' | 'order' | …
  entityId: string;
  action: string;          // e.g. 'assigned', 'status.technical_review_required'
  after?: unknown;
}): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO audit_event (id, actor, entity_type, entity_id, action, after_json) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(uuid(), opts.actor ?? "system", opts.entityType, opts.entityId, opts.action, opts.after != null ? JSON.stringify(opts.after) : null).run();
}
