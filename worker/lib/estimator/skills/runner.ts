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
import { primaryModel, EXTRACTION_TEMPERATURE, EXTRACTION_MAX_TOKENS, thinkingLevel } from "../../ai/versions";
import type { Skill, SkillFailureKind, SkillRun } from "./types";

// collectLog:false enforces §21.1 payload privacy PER-REQUEST — bodies are never
// stored gateway-side even if the dashboard logging toggle is ever re-enabled.
const gatewayOpts = (env: Env) =>
  env.AI_GATEWAY_ID ? { gateway: { id: env.AI_GATEWAY_ID, collectLog: false } } : undefined;
// 18s was too short for a real schedule response. The production run on
// 2026-07-29 died exactly at that fence (`ai_model_timeout_18000ms`), while an
// earlier successful extraction of the same 19-line schedule returned 1,737
// output tokens. The smaller plan-context call completed in roughly 10s.
// 45s bounds a call that is genuinely slow without parking the job on a
// provider hiccup; the observed duration of every call is logged below so this
// can be tightened to a measured number instead of a defensive one.
// A ceiling for a hung call, not a quality budget. At 'medium' thinking (the
// quality-first default) a real schedule call runs comfortably under this; 45s
// used to sever healthy medium-thinking work mid-generation, which was the fault,
// not the model. The customer never waits blindly this long — progress is shown
// per step and only a genuine stall is treated as concerning.
const MODEL_CALL_DEADLINE_MS = 90_000;

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

// The single field behind this project's latency and its variance. gemini-3.6
// defaults to thinkingLevel 'medium', and thinking tokens are drawn serially
// from the same output budget — so a mechanical schedule transcription was
// licensed to deliberate for thousands of tokens before writing a line, which
// is why the same document finished in 8s once and blew past 45s the next time.
//
// Proven against the live binding (see the /api/debug/ai-probe run, 2026-07-30):
// baseline medium ran 8.7–18.3s with 700–1,636 thought tokens; 'low' ran
// 4.3–5.3s — roughly half the median and, more importantly, a collapsed tail.
//
// The SHAPE matters and is not guessable: flat `generationConfig.thinkingLevel`
// is REJECTED with HTTP 400 (7003); only the nested
// `generationConfig.thinkingConfig.thinkingLevel` is accepted by the binding.
// Overridable without a deploy via AI_THINKING_LEVEL (e.g. 'minimal' for more
// speed, 'medium' to restore the old behaviour).
function googleBody(messages: { role: string; content: unknown }[], thinkingLevel: string) {
  const generationConfig: Record<string, unknown> = {
    temperature: EXTRACTION_TEMPERATURE,
    maxOutputTokens: EXTRACTION_MAX_TOKENS,
  };
  // 'medium' is the model's own default, so omitting thinkingConfig reproduces
  // EXACTLY the request the capability probe proved works — no risk of a 7003 on
  // an enum value we never tested. Any non-default level is sent explicitly, in
  // the ONE nested spelling the binding accepts (flat generationConfig.thinkingLevel
  // is rejected with HTTP 400; only generationConfig.thinkingConfig.thinkingLevel
  // is honoured — see the probe run 2026-07-30).
  if (thinkingLevel && thinkingLevel !== "medium") {
    generationConfig.thinkingConfig = { thinkingLevel };
  }
  return {
    // Google has no "assistant" role; the repair turn's prior answer is "model".
    contents: messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: toGoogleParts(m.content),
    })),
    generationConfig,
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

/** Provider errors must retain enough structure for the queue to distinguish a
 * retryable throttle/outage from a permanent malformed request. */
export function classifyProviderFailure(error: unknown): SkillFailureKind {
  const message = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).toLowerCase();
  if (/\b429\b|rate.?limit|too many requests|resource[_ ]exhausted|throttl/.test(message)) return "transient_rate_limit";
  if (/\b(408|500|502|503|504)\b|timed? ?out|timeout|temporar|service unavailable|network|fetch failed|connection reset/.test(message)) {
    return "transient_provider";
  }
  if (/\b(400|401|402|403|404|413|422)\b|\b7003\b|invalid (?:argument|request)|user input error|unsupported/.test(message)) {
    return "permanent_request";
  }
  return "transient_provider";
}

function failureWarning(kind: SkillFailureKind): string {
  if (kind === "transient_rate_limit") return "skill_call_rate_limited";
  if (kind === "transient_provider" || kind === "provider_unavailable") return "skill_call_transient";
  if (kind === "permanent_request") return "skill_call_permanent";
  return "skill_output_invalid";
}

// The schema has to travel IN THE PROMPT, because this provider accepts no
// schema parameter. When response_format was being sent (and rejected), the
// model was never told the field names at all — it answered a plan-context
// request with {project, areasSqm, openings[{reference, room, orientation}]},
// its own invention, while the validator wanted {rooms[], openings[{ref,
// roomId, …}]}. Perfectly good extraction, thrown away for want of a contract.
//
// Appended by the runner so no skill can forget it, and so the instruction
// stays identical across all of them.
export function schemaInstruction(skill: Skill<unknown, unknown>): string {
  return [
    "Return ONLY a JSON object conforming EXACTLY to this JSON Schema.",
    "Use these property names verbatim. Omit no required property.",
    "Unknown values are null — never invent, never rename, never add fields.",
    "No markdown fence, no commentary.",
    JSON.stringify(skill.responseSchema),
  ].join("\n");
}

/** Append the schema to a string prompt, or as a final text part to a
 *  multimodal one. */
export function withSchemaInstruction(prompt: unknown, skill: Skill<unknown, unknown>): unknown {
  const instruction = schemaInstruction(skill);
  if (typeof prompt === "string") return `${prompt}\n\n${instruction}`;
  if (Array.isArray(prompt)) return [...prompt, { type: "text", text: instruction }];
  return prompt;
}

interface SkillTelemetry {
  aiRunId: string;
  projectId: string;
}

async function callModel(
  env: Env,
  model: string,
  skill: Skill<unknown, unknown>,
  messages: { role: string; content: unknown }[],
  telemetry: SkillTelemetry | undefined,
  attempt: "primary" | "repair",
) {
  // NOTE: Google's structured-output fields (responseMimeType / responseSchema)
  // are NOT in Cloudflare's documented parameter set for this model, so they are
  // deliberately not sent — an undocumented field is how we got here. The guard
  // that actually matters is unchanged and always was: skill.validate() on the
  // untrusted output, plus the single §22.3 repair pass. toVendorSchema() is
  // kept for the day a provider does accept a schema.
  const body = isGoogleModel(model)
    ? googleBody(messages, thinkingLevel(env))
    : {
        messages,
        temperature: EXTRACTION_TEMPERATURE,
        max_tokens: EXTRACTION_MAX_TOKENS,
        response_format: { type: "json_schema", json_schema: toVendorSchema(skill.responseSchema) },
      };
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Wall-clock around the provider call. Unlike the sync-work timings we tried
  // to take earlier, this one is meaningful: the clock advances across I/O, so
  // it reports what the model actually cost us.
  const startedAt = Date.now();
  let outcome: "completed" | "timeout" | "failed" = "completed";
  try {
    return await Promise.race([
      (env.AI as any).run(model, body, gatewayOpts(env)),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`ai_model_timeout_${MODEL_CALL_DEADLINE_MS}ms`)),
          MODEL_CALL_DEADLINE_MS,
        );
      }),
    ]);
  } catch (error) {
    outcome = error instanceof Error && error.message.includes("ai_model_timeout_")
      ? "timeout"
      : "failed";
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    if (telemetry) {
      console.log({
        event: "ai_model_call",
        aiRunId: telemetry.aiRunId,
        projectId: telemetry.projectId,
        skill: skill.id,
        model,
        attempt,
        outcome,
        durationMs: Date.now() - startedAt,
      });
    }
  }
}

export async function runSkill<I, O>(
  env: Env,
  skill: Skill<I, O>,
  input: I,
  opts?: { model?: string; telemetry?: SkillTelemetry },
): Promise<SkillRun<O>> {
  const model = opts?.model ?? primaryModel(env);
  if (!env.AI) {
    return {
      ok: false, data: null, warnings: ["skill_call_failed", "skill_call_transient", "skill_call_error:ai_unavailable"],
      modelId: model, promptVersion: skill.promptVersion, outputHash: null, repaired: false,
      inputTokens: 0, outputTokens: 0, failureKind: "provider_unavailable",
    };
  }
  const warnings: string[] = [];
  let inputTokens = 0, outputTokens = 0;
  let rawText = "";
  let repaired = false;

  // Multimodal skills supply content parts (text + images); text skills a string.
  const prompt: unknown = withSchemaInstruction(
    skill.buildContent ? skill.buildContent(input) : skill.buildPrompt(input),
    skill,
  );
  try {
    const out: any = await callModel(
      env,
      model,
      skill as Skill<unknown, unknown>,
      [{ role: "user", content: prompt }],
      opts?.telemetry,
      "primary",
    );
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
    const failureKind = classifyProviderFailure(e);
    warnings.push(failureWarning(failureKind));
    return {
      ok: false, data: null, warnings, modelId: model, promptVersion: skill.promptVersion,
      outputHash: null, repaired, inputTokens, outputTokens, failureKind,
    };
  }

  // The load-bearing safety step: validate the untrusted output.
  let data = skill.validate(rawText);
  let failureKind: SkillFailureKind | null = null;

  // §22.3 repair policy: exactly ONE repair call on schema failure, feeding the
  // invalid response back. Transport failure of the repair keeps the original miss.
  if (data == null) {
    try {
      // Repair the structure, not the source extraction. Re-sending a 30-page
      // document (and its images) doubled input spend while adding no information
      // needed to rename fields, close JSON, or remove prose.
      const repairPrompt = [
        "Repair the following model response so it conforms exactly to the schema.",
        "Return ONLY corrected JSON. Preserve extracted values; do not add facts.",
        schemaInstruction(skill as Skill<unknown, unknown>),
        "INVALID RESPONSE:",
        rawText.slice(0, 16000),
      ].join("\n\n");
      const out: any = await callModel(
        env,
        model,
        skill as Skill<unknown, unknown>,
        [{ role: "user", content: repairPrompt }],
        opts?.telemetry,
        "repair",
      );
      const usage = readModelUsage(out);
      inputTokens += usage.input; outputTokens += usage.output;
      const repairedText = readModelText(out);
      const repairedData = skill.validate(repairedText);
      if (repairedData != null) { data = repairedData; rawText = repairedText; repaired = true; }
    } catch (e) {
      failureKind = classifyProviderFailure(e);
      warnings.push(failureWarning(failureKind));
      warnings.push(`skill_repair_error:${failureKind}`);
    }
    if (data == null) {
      warnings.push("skill_output_invalid");
      failureKind ??= "invalid_output";
    }
    else warnings.push("skill_output_repaired");
  }

  const outputHash = await sha256hex(new TextEncoder().encode(rawText)).catch(() => null);
  return {
    ok: data != null, data, warnings, modelId: model, promptVersion: skill.promptVersion,
    outputHash, repaired, inputTokens, outputTokens, failureKind: data != null ? null : failureKind,
    ...(data == null ? { rejectedRaw: rawText.slice(0, 20000) } : {}),
  };
}
