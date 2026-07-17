// Rule-driven approvals. On "submit for approval" the rules are evaluated against
// the project; matching rules become approval steps the right role must clear.
// No match = auto-approved (straight to approved_for_issue).
import type { Env } from "../types";
import type { UserRow } from "./auth";
import { uuid } from "./util";
import { logEvent } from "./activity";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;

// A user can act on a step if their role matches, or they're an admin.
export const canApprove = (user: UserRow, role: string) => user.role === "admin" || user.role === role;

interface RuleRow { id: string; name: string; trigger_family: string; condition_json: string; approver_role: string }
interface EvalStep { ruleId: string; family: string; role: string; reason: string }

// Evaluate active rules; return the steps that fire.
export async function evaluateApprovals(env: Env, projectId: string): Promise<EvalStep[]> {
  const project = await env.DB.prepare("SELECT status_internal FROM project WHERE id = ?").bind(projectId).first<{ status_internal: string }>();
  const { results: lines } = await env.DB.prepare("SELECT line_total FROM quote_line WHERE project_id = ? AND revision_id IS NULL").bind(projectId).all<{ line_total: number | null }>();
  const total = lines.reduce((s, l) => s + (l.line_total || 0), 0);
  const isTechnical = project?.status_internal === "technical_review_required";

  const { results: rules } = await env.DB.prepare("SELECT * FROM approval_rule WHERE active = 1").all<RuleRow>();
  const steps: EvalStep[] = [];
  for (const rule of rules) {
    let cond: any = {};
    try { cond = JSON.parse(rule.condition_json); } catch { /* skip */ }
    if (cond.type === "total_gt" && total > cond.value) {
      steps.push({ ruleId: rule.id, family: rule.trigger_family, role: rule.approver_role, reason: `Total ${money(total)} over ${money(cond.value)}` });
    } else if (cond.type === "status_technical" && isTechnical) {
      steps.push({ ruleId: rule.id, family: rule.trigger_family, role: rule.approver_role, reason: "Flagged for technical review" });
    }
  }
  return steps;
}

// Create a pending approval instance with the given steps.
export async function createApprovalInstance(env: Env, projectId: string, steps: EvalStep[]): Promise<string> {
  const instanceId = uuid();
  const stmts = [
    env.DB.prepare("INSERT INTO approval_instance (id, project_id, state) VALUES (?, ?, 'pending')").bind(instanceId, projectId),
    ...steps.map((s) =>
      env.DB.prepare("INSERT INTO approval_step (id, instance_id, rule_id, trigger_family, reason, approver_role, state) VALUES (?, ?, ?, ?, ?, ?, 'pending')")
        .bind(uuid(), instanceId, s.ruleId, s.family, s.reason, s.role),
    ),
    env.DB.prepare("UPDATE project SET status_internal = 'approval_pending', updated_at = datetime('now') WHERE id = ?").bind(projectId),
  ];
  await env.DB.batch(stmts);
  return instanceId;
}

// After a step acts, resolve the instance: all approved -> project ready to issue;
// any rejected -> instance rejected, project back to the estimator.
export async function resolveInstance(env: Env, instanceId: string): Promise<"pending" | "approved" | "rejected"> {
  const inst = await env.DB.prepare("SELECT project_id FROM approval_instance WHERE id = ?").bind(instanceId).first<{ project_id: string }>();
  if (!inst) return "pending";
  const { results: steps } = await env.DB.prepare("SELECT state FROM approval_step WHERE instance_id = ?").bind(instanceId).all<{ state: string }>();

  if (steps.some((s) => s.state === "rejected")) {
    await env.DB.batch([
      env.DB.prepare("UPDATE approval_instance SET state = 'rejected', resolved_at = datetime('now') WHERE id = ?").bind(instanceId),
      env.DB.prepare("UPDATE project SET status_internal = 'estimator_assigned', updated_at = datetime('now') WHERE id = ?").bind(inst.project_id),
    ]);
    await logEvent(env, { entityType: "project", entityId: inst.project_id, action: "approval rejected — returned to estimator" });
    return "rejected";
  }
  if (steps.every((s) => s.state === "approved" || s.state === "skipped")) {
    await env.DB.batch([
      env.DB.prepare("UPDATE approval_instance SET state = 'approved', resolved_at = datetime('now') WHERE id = ?").bind(instanceId),
      env.DB.prepare("UPDATE project SET status_internal = 'approved_for_issue', updated_at = datetime('now') WHERE id = ?").bind(inst.project_id),
    ]);
    await logEvent(env, { entityType: "project", entityId: inst.project_id, action: "approvals cleared — ready to issue" });
    return "approved";
  }
  return "pending";
}
