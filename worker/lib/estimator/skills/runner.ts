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

// ── Provider request/response shapes ─────────────────────────────────────────
// `env.AI.run("google/…")` speaks Google's native Generate Content schema, NOT
// the OpenAI chat shape: `contents[]` of `{role, parts[]}` and a
// `generationConfig{temperature, maxOutputTokens}`. We were sending
// `{messages, temperature, max_tokens, response_format}` — every field wrong —
// which the gateway rejected as `7003: User Input Error` with an HTTP 400 at
// Vertex, before a single token was billed. That is why no AI credit ever moved.
//
// The translation lives here and is keyed on the model id, so the skills keep
// writing one neutral shape and swapping models does not rewrite them.
const isGoogleModel = (model: string) => model.startsWith("google/");

/** OpenAI-ish content (string, or parts with type/text/image_url) → Google parts. */
function toGoogleParts(content: unknown): unknown[] {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: String(content ?? "") }];
  const parts: unknown[] = [];
  for (const raw of content) {
    const part = raw as { type?: string; text?: string; image_url?: { url?: string } };
    if (part?.type === "text" && typeof part.text === "string") { parts.push({ text: part.text }); continue; }
    const url = part?.image_url?.url;
    if (typeof url === "string") {
      // data:<mime>;base64,<payload> → inlineData. A remote URL has no Google
      // equivalent here and is dropped rather than sent as meaningless text.
      const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
      if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
    }
  }
  return parts.length ? parts : [{ text: "" }];
}

function googleBody(messages: { role: string; content: unknown }[]) {
  return {
    // Google has no "assistant" role; the repair turn's prior answer is "model".
    contents: messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: toGoogleParts(m.content),
    })),
    generationConfig: {
      temperature: EXTRACTION_TEMPERATURE,
      maxOutputTokens: EXTRACTION_MAX_TOKENS,
    },
  };
}

/** The generated text, whichever provider produced it. */
export function readModelText(out: any): string {
  const google = out?.candidates?.[0]?.content?.parts;
  if (Array.isArray(google)) {
    const joined = google.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");
    if (joined) return joined;
  }
  return typeof out?.response === "string" ? out.response : JSON.stringify(out?.response ?? out ?? {});
}

/** Token usage, whichever provider produced it. */
export function readModelUsage(out: any): { input: number; output: number } {
  const g = out?.usageMetadata;
  if (g) return { input: Number(g.promptTokenCount ?? 0), output: Number(g.candidatesTokenCount ?? 0) };
  return { input: Number(out?.usage?.prompt_tokens ?? 0), output: Number(out?.usage?.completion_tokens ?? 0) };
}

async function callModel(env: Env, model: string, skill: Skill<unknown, unknown>, messages: { role: string; content: unknown }[]) {
  // NOTE: Google's structured-output fields (responseMimeType / responseSchema)
  // are NOT in Cloudflare's documented parameter set for this model, so they are
  // deliberately not sent — an undocumented field is how we got here. The guard
  // that actually matters is unchanged and always was: skill.validate() on the
  // untrusted output, plus the single §22.3 repair pass. toVendorSchema() is
  // kept for the day a provider does accept a schema.
  const body = isGoogleModel(model)
    ? googleBody(messages)
    : {
        messages,
        temperature: EXTRACTION_TEMPERATURE,
        max_tokens: EXTRACTION_MAX_TOKENS,
        response_format: { type: "json_schema", json_schema: toVendorSchema(skill.responseSchema) },
      };
  return await (env.AI as any).run(model, body, gatewayOpts(env));
}

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
    const usage = readModelUsage(out);
    inputTokens += usage.input; outputTokens += usage.output;
    rawText = readModelText(out);
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
      const usage = readModelUsage(out);
      inputTokens += usage.input; outputTokens += usage.output;
      const repairedText = readModelText(out);
      const repairedData = skill.validate(repairedText);
      if (repairedData != null) { data = repairedData; rawText = repairedText; repaired = true; }
    } catch { /* repair is best-effort; the original failure stands */ }
    if (data == null) warnings.push("skill_output_invalid");
    else warnings.push("skill_output_repaired");
  }

  const outputHash = await sha256hex(new TextEncoder().encode(rawText)).catch(() => null);
  return {
    ok: data != null, data, warnings, modelId: model, promptVersion: skill.promptVersion,
    outputHash, repaired, inputTokens, outputTokens,
    ...(data == null ? { rejectedRaw: rawText.slice(0, 20000) } : {}),
  };
}
