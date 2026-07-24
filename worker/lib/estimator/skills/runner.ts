// Skill runner — executes an AI skill through the AI Gateway, then RUNTIME-VALIDATES
// the untrusted output before returning it. Inert unless env.AI is bound and the
// skill is explicitly invoked (the deterministic path never calls this).
//
// SPEND + PRIVACY: routes through AI_GATEWAY_ID when set (caching, rate limiting,
// spend visibility). The owner provisions the gateway + spend caps in the
// dashboard; without AI_GATEWAY_ID the call still works but has none of those
// controls — so production should set it. Never logs document content (spec §14):
// only model id, versions and an output HASH.
import type { Env } from "../../types";
import { sha256hex } from "../parse";
import type { Skill, SkillRun } from "./types";

const gatewayOpts = (env: Env) => (env.AI_GATEWAY_ID ? { gateway: { id: env.AI_GATEWAY_ID } } : undefined);

export async function runSkill<I, O>(env: Env, skill: Skill<I, O>, input: I): Promise<SkillRun<O>> {
  if (!env.AI) throw new Error("ai_unavailable");
  const warnings: string[] = [];
  let inputTokens = 0, outputTokens = 0;
  let rawText = "";
  try {
    const out: any = await (env.AI as any).run(skill.model, {
      messages: [{ role: "user", content: skill.buildPrompt(input) }],
      response_format: { type: "json_schema", json_schema: skill.responseSchema },
    }, gatewayOpts(env));
    inputTokens = Number(out?.usage?.prompt_tokens ?? 0);
    outputTokens = Number(out?.usage?.completion_tokens ?? 0);
    rawText = typeof out?.response === "string" ? out.response : JSON.stringify(out?.response ?? out ?? {});
  } catch {
    warnings.push("skill_call_failed"); // never surface raw provider errors
    return { ok: false, data: null, warnings, modelId: skill.model, outputHash: null, inputTokens, outputTokens };
  }

  const outputHash = await sha256hex(new TextEncoder().encode(rawText)).catch(() => null);
  // The load-bearing safety step: validate the untrusted output.
  const data = skill.validate(rawText);
  if (data == null) warnings.push("skill_output_invalid");
  return { ok: data != null, data, warnings, modelId: skill.model, outputHash, inputTokens, outputTokens };
}
