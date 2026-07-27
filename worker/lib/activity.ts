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
  // `before` matters wherever the question is "what did it change FROM" — money,
  // above all. The column has existed since 0001 and went unused until the ops
  // Pricing screen made rate edits a routine act rather than a migration.
  before?: unknown;
}): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO audit_event (id, actor, entity_type, entity_id, action, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    uuid(), opts.actor ?? "system", opts.entityType, opts.entityId, opts.action,
    opts.before != null ? JSON.stringify(opts.before) : null,
    opts.after != null ? JSON.stringify(opts.after) : null,
  ).run();
}
