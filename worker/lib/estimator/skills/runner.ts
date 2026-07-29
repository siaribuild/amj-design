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

// collectLog:false enforces §21.1 payload privacy PER-REQUEST — bodies are never
// stored gateway-side even if the dashboard logging toggle is ever re-enabled.
const gatewayOpts = (env: Env) =>
  env.AI_GATEWAY_ID ? { gateway: { id: env.AI_GATEWAY_ID, collectLog: false } } : undefined;

// Google's structured-output schema is an OpenAPI 3.0 SUBSET, not JSON Schema:
// it takes one `type` plus `nullable`, and rejects the JSON-Schema union
// `type: ["string","null"]` with an HTTP 400 before a single token is spent.
// Every skill here writes optional fields that way — 34 of them — so every call
// through Vertex failed at the provider with no output and no usage.
//
// Normalising HERE rather than rewriting each schema keeps the skills written in
// plain JSON Schema (what their validators and tests speak) and means a new
// skill cannot reintroduce the fault by being written the same way.
export function toVendorSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toVendorSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "type" && Array.isArray(v)) {
      const types = v.filter((t) => t !== "null");
      // ["string","null"] → string + nullable. A union of two REAL types has no
      // OpenAPI 3.0 equivalent; leave it untouched rather than silently pick one.
      if (types.length === 1 && v.length !== types.length) {
        out.type = types[0];
        out.nullable = true;
        continue;
      }
      out.type = v.length === 1 ? v[0] : v;
      continue;
    }
    out[k] = toVendorSchema(v);
  }
  return out;
}

async function callModel(env: Env, model: string, skill: Skill<unknown, unknown>, messages: { role: string; content: unknown }[]) {
  return await (env.AI as any).run(model, {
    messages,
    temperature: EXTRACTION_TEMPERATURE,
    max_tokens: EXTRACTION_MAX_TOKENS,
    response_format: { type: "json_schema", json_schema: toVendorSchema(skill.responseSchema) },
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

  // Multimodal skills supply content parts (text + images); text skills a string.
  const prompt: unknown = skill.buildContent ? skill.buildContent(input) : skill.buildPrompt(input);
  try {
    const out: any = await callModel(env, model, skill as Skill<unknown, unknown>, [{ role: "user", content: prompt }]);
    inputTokens += Number(out?.usage?.prompt_tokens ?? 0);
    outputTokens += Number(out?.usage?.completion_tokens ?? 0);
    rawText = textOf(out);
  } catch (e) {
    // `skill_call_failed` is load-bearing — stage.ts classifies on it. Keep it,
    // and add the provider's own words beside it.
    //
    // "Never surface raw provider errors" means never to the CUSTOMER. Throwing
    // them away entirely cost a day: every call was 400ing at Vertex over a
    // schema construct, and the record said only that something failed. This
    // string lands in ai_runs.summary_json, which is server-side, and is capped
    // because a provider message is diagnostics, not a place for document text.
    warnings.push("skill_call_failed");
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    warnings.push(`skill_call_error:${msg.slice(0, 200)}`);
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
