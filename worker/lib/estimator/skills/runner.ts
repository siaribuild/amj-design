// Skill runner — executes an AI skill through the AI Gateway, then RUNTIME-VALIDATES
// the untrusted output before returning it. Inert unless env.AI is bound and the
// skill is explicitly invoked (the deterministic path never calls this).
//
// MODEL POLICY (LLM strategy §13, owner decision 2026-07-25): every skill runs on
// the ONE env-resolved primary model (google/gemini-3.6-flash by default) — no
// per-skill model shopping, no silent escalation to a dearer model. The stage
// layer may pass an explicit model override only when real escalation has been
// turned on (AI_ESCALATION_MODE='on'); otherwise escalation is shadow-logged.
//
// DETERMINISM (§13.4): near-zero temperature, strict JSON schema, bounded output,
// and retries only as the single §22.3 repair pass — never an unbounded loop.
//
// SPEND + PRIVACY: routes through AI_GATEWAY_ID when set (caching, rate limiting,
// spend visibility). The owner provisions the gateway + spend caps in the
// dashboard; without AI_GATEWAY_ID the call still works but has none of those
// controls — so production should set it. Never logs document content (§21.1):
// only model id, versions and an output HASH.
import type { Env } from "../../../types";
import { sha256hex } from "../../ai/hash";
import { primaryModel, EXTRACTION_TEMPERATURE, EXTRACTION_MAX_TOKENS } from "../../ai/versions";
import type { Skill, SkillRun } from "./types";

const gatewayOpts = (env: Env) => (env.AI_GATEWAY_ID ? { gateway: { id: env.AI_GATEWAY_ID } } : undefined);

async function callModel(env: Env, model: string, skill: Skill<unknown, unknown>, messages: { role: string; content: string }[]) {
  return await (env.AI as any).run(model, {
    messages,
    temperature: EXTRACTION_TEMPERATURE,
    max_tokens: EXTRACTION_MAX_TOKENS,
    response_format: { type: "json_schema", json_schema: skill.responseSchema },
  }, gatewayOpts(env));
}

const textOf = (out: any): string =>
  typeof out?.response === "string" ? out.response : JSON.stringify(out?.response ?? out ?? {});

export async function runSkill<I, O>(
  env: Env,
  skill: Skill<I, O>,
  input: I,
  opts?: { model?: string },
): Promise<SkillRun<O>> {
  if (!env.AI) throw new Error("ai_unavailable");
  const model = opts?.model ?? primaryModel(env);
  const warnings: string[] = [];
  let inputTokens = 0, outputTokens = 0;
  let rawText = "";
  let repaired = false;

  const prompt = skill.buildPrompt(input);
  try {
    const out: any = await callModel(env, model, skill as Skill<unknown, unknown>, [{ role: "user", content: prompt }]);
    inputTokens += Number(out?.usage?.prompt_tokens ?? 0);
    outputTokens += Number(out?.usage?.completion_tokens ?? 0);
    rawText = textOf(out);
  } catch {
    warnings.push("skill_call_failed"); // never surface raw provider errors
    return { ok: false, data: null, warnings, modelId: model, promptVersion: skill.promptVersion, outputHash: null, repaired, inputTokens, outputTokens };
  }

  // The load-bearing safety step: validate the untrusted output.
  let data = skill.validate(rawText);

  // §22.3 repair policy: exactly ONE repair call on schema failure, feeding the
  // invalid response back. Transport failure of the repair keeps the original miss.
  if (data == null) {
    try {
      const out: any = await callModel(env, model, skill as Skill<unknown, unknown>, [
        { role: "user", content: prompt },
        { role: "assistant", content: rawText.slice(0, 16000) },
        { role: "user", content: "That response failed schema validation. Return ONLY corrected JSON that conforms exactly to the required schema. No prose." },
      ]);
      inputTokens += Number(out?.usage?.prompt_tokens ?? 0);
      outputTokens += Number(out?.usage?.completion_tokens ?? 0);
      const repairedText = textOf(out);
      const repairedData = skill.validate(repairedText);
      if (repairedData != null) { data = repairedData; rawText = repairedText; repaired = true; }
    } catch { /* repair is best-effort; the original failure stands */ }
    if (data == null) warnings.push("skill_output_invalid");
    else warnings.push("skill_output_repaired");
  }

  const outputHash = await sha256hex(new TextEncoder().encode(rawText)).catch(() => null);
  return { ok: data != null, data, warnings, modelId: model, promptVersion: skill.promptVersion, outputHash, repaired, inputTokens, outputTokens };
}
