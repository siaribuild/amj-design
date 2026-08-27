// ═══════════════════════════════════════════════════════════════════════════════
// THE WIRE TO THE PLAN-PARSE CONTAINER
//
// THE CONSTRUCTION RULE, and it is the reason this file exists rather than a
// one-line fetch at the call site:
//
//   The Worker BUILDS the container request. It never forwards one.
//
// `@cloudflare/containers` proxies the entire forwarded Request to the
// container's port. So a route that passed a customer's request through to
// `env.PLAN_PARSE` would hand that caller the method, path and body of a call to
// an endpoint which by design has no authorization — the container is safe
// because it is unreachable, not because it checks who is asking. Everything
// crossing this boundary is therefore a value the Worker chose: a CropRequest it
// built, and PDF bytes it read from R2 under `WHERE project_id = ?`.
//
// The framing and the decode are pure and exported separately so both ends of a
// contract that types cannot check are covered by tests.
// ═══════════════════════════════════════════════════════════════════════════════
import { getContainer } from "@cloudflare/containers";
import type { Env } from "../../types";
import type { CropRequest } from "./container";

/** Why one opening produced no crop. A CLOSED set: the container also logs the
 *  underlying error, and its message is neither useful to the Worker — which
 *  either retries or records the opening unread — nor safe on a staff surface,
 *  where a sharp or pdf.js internal reads as if it meant something. */
export type CropFailureReason =
  | "page_render_failed"
  | "crop_failed"
  /** The container said nothing about this opening — neither a crop nor a
   *  failure. Its own code, not folded into `unknown`, because it means the
   *  CONTAINER is broken rather than the drawing: an opening it never mentioned
   *  is a different fault from one it tried and could not cut. */
  | "not_returned"
  | "unknown";
const KNOWN_REASONS: readonly string[] = ["page_render_failed", "crop_failed"];

export interface DecodedCrop {
  id: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface DecodedCropResponse {
  crops: DecodedCrop[];
  failures: { id: string; reason: CropFailureReason }[];
}

/**
 * Frame a request: one line of JSON, a newline, then the PDF verbatim.
 *
 * The container splits on the FIRST newline (`server.mjs`), which is what lets
 * the payload keep its own — a PDF is full of them, and of 0xFF bytes besides.
 * Nothing re-encodes the document: base64 here would inflate a 2 MB upload by a
 * third for no reason, since the body is already binary.
 */
export function encodeCropRequest(request: CropRequest, pdfBytes: Uint8Array): Uint8Array<ArrayBuffer> {
  // `gaps` and `deferred` are the Worker's own bookkeeping — the container has
  // no use for them and no business knowing which openings were declined.
  const header = new TextEncoder().encode(
    `${JSON.stringify({ scale: request.scale, pages: request.pages })}\n`,
  );
  // Backed by a plain ArrayBuffer explicitly: a Uint8Array over a SharedArrayBuffer
  // is not a BodyInit, and `new Uint8Array(n)` alone widens to ArrayBufferLike.
  const body = new Uint8Array(new ArrayBuffer(header.length + pdfBytes.length));
  body.set(header, 0);
  body.set(pdfBytes, header.length);
  return body;
}

/**
 * Read a response, and refuse anything that was not asked about.
 *
 * `sentIds` is the set of openings this call actually requested. An id outside
 * it means the container answered a question nobody asked — a bug, or a response
 * belonging to a different call — and attaching those pixels to an opening would
 * produce a confident, wrong reading of a window, which is the only failure this
 * whole reader has. It throws rather than dropping: silently ignoring a foreign
 * id hides the same fault.
 */
export function decodeCropResponse(payload: unknown, sentIds: readonly string[]): DecodedCropResponse {
  const body = payload as { crops?: unknown; failures?: unknown } | null;
  if (!body || typeof body !== "object") throw new Error("plan-parse: response is not an object");
  // A wrong TYPE is malformed — a broken container, or something else answering
  // on that port. That is not a per-opening condition and must not be smoothed
  // into one. An ABSENT list is different: it is handled by the accounting below,
  // which names what went missing.
  if (body.crops !== undefined && !Array.isArray(body.crops)) {
    throw new Error("plan-parse: response crops is not an array");
  }
  if (body.failures !== undefined && !Array.isArray(body.failures)) {
    throw new Error("plan-parse: response failures is not an array");
  }
  const asked = new Set(sentIds);
  const seen = new Set<string>();

  const crops: DecodedCrop[] = [];
  for (const raw of (body.crops as unknown[]) ?? []) {
    const c = raw as { id?: unknown; png?: unknown; width?: unknown; height?: unknown };
    if (typeof c.id !== "string" || !asked.has(c.id)) {
      throw new Error(`plan-parse: response names an opening that was not requested: ${String(c.id)}`);
    }
    if (seen.has(c.id)) throw new Error(`plan-parse: two crops for ${c.id}`);
    seen.add(c.id);
    if (typeof c.png !== "string" || typeof c.width !== "number" || typeof c.height !== "number") {
      throw new Error(`plan-parse: malformed crop for ${c.id}`);
    }
    crops.push({ id: c.id, bytes: base64ToBytes(c.png), width: c.width, height: c.height });
  }

  const failures: { id: string; reason: CropFailureReason }[] = [];
  for (const raw of (body.failures as unknown[]) ?? []) {
    const f = raw as { id?: unknown; reason?: unknown };
    if (typeof f.id !== "string" || !asked.has(f.id)) {
      throw new Error(`plan-parse: failure names an opening that was not requested: ${String(f.id)}`);
    }
    const reason = typeof f.reason === "string" && KNOWN_REASONS.includes(f.reason)
      ? (f.reason as CropFailureReason)
      : "unknown";
    if (seen.has(f.id)) throw new Error(`plan-parse: ${f.id} is both cropped and failed`);
    seen.add(f.id);
    failures.push({ id: f.id, reason });
  }

  // EVERY OPENING SENT COMES BACK ACCOUNTED FOR. Output spec §7: an opening that
  // could not be read is reported unread, never omitted, because a silently
  // missing opening is indistinguishable from a house with fewer windows. A
  // partial response used to lose whatever it did not mention.
  //
  // Named rather than thrown: failure granularity is the OPENING, never the
  // document, so the batch keeps the crops it did produce and the rest go to the
  // fallback visibly.
  for (const id of sentIds) {
    if (!seen.has(id)) failures.push({ id, reason: "not_returned" });
  }
  return { crops, failures };
}

/**
 * Call the container for one batch.
 *
 * Instance key `projectId:sourceGeneration`: a job makes several calls when its
 * openings exceed one batch, and they should land on the same warm instance
 * rather than paying a cold start each. Keyed on the generation too, so a
 * re-parse after a re-upload does not inherit an instance mid-flight.
 */
export async function callPlanParse(
  env: Env,
  key: { projectId: string; sourceGeneration: number },
  request: CropRequest,
  pdfBytes: Uint8Array,
): Promise<DecodedCropResponse> {
  const instance = getContainer(env.PLAN_PARSE, `${key.projectId}:${key.sourceGeneration}`);
  // Constructed here, never forwarded — see the rule at the top of this file.
  const res = await instance.fetch(
    new Request("http://plan-parse/", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: encodeCropRequest(request, pdfBytes),
    }),
  );
  if (!res.ok) throw new Error(`plan-parse: container returned ${res.status}`);
  const sent = request.pages.flatMap((p) => p.crops.map((c) => c.id));
  return decodeCropResponse(await res.json(), sent);
}

/** workerd has atob; Node's test bundle has it too since v16. */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
