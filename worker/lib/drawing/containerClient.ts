// The Worker's side of the container wire (02-design-v2.md §3.1, §9). Every
// cap is enforced HERE, before any fetch reaches the Durable Object — the
// container re-checks the same numbers itself (server.py) as defence in
// depth, not as the gate (AB-6).
//
// The namespace is an argument, not an import of `env.PLAN_PARSE` — so a
// test can inject a fake that proves a refused call never dispatches.
import type { ContainerFailureCode, InspectResponse, RenderRequest, RenderResponse } from "./contract";
import { MAX_CONTAINER_INFLIGHT_BYTES, MAX_CROPS_PER_PAGE, MAX_DPI, MAX_INSPECT_RESPONSE_BYTES, MAX_PAGES, MAX_PDF_BYTES, MAX_RENDER_RESPONSE_BYTES } from "./contract";

/** What a caller may say about one call: the most it may answer with (the
 * mode's cap by default), and whether it draws on the face-mapped engine's
 * memory budget (contract.ts). The other modes' calls do not, so their
 * behaviour is what it was. */
export interface CallLimits {
  responseCap?: number;
  budgeted?: boolean;
}

// Each endpoint must fail with enough lease left to persist the attributable
// gap and continue the estimate. Inspect is heavier than a page render, but
// neither may consume the 600 s job deadline by itself.
export const INSPECT_TIMEOUT_MS = 120_000;
export const RENDER_TIMEOUT_MS = 60_000;

export class ContainerClientError extends Error {
  code: ContainerFailureCode;
  constructor(code: ContainerFailureCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

function framedBody(header: Record<string, unknown>, pdfBytes: Uint8Array): Uint8Array {
  const headerBytes = new TextEncoder().encode(`${JSON.stringify(header)}\n`);
  const body = new Uint8Array(headerBytes.length + pdfBytes.length);
  body.set(headerBytes, 0);
  body.set(pdfBytes, headerBytes.length);
  return body;
}

/** The face-mapped engine's budget (contract.ts): the file whose PDF is held
 * - one at a time, so two files cannot both be at their peak - and the bytes
 * its calls in flight hold, with the waiters for each in the order they asked.
 * Module state, because the isolate's memory is what it bounds. */
let leasedBytes = 0;
let callBytes = 0;
type Waiter = { bytes: number; admit: () => void; admitted: boolean };
const fileQueue: Waiter[] = [];
const callQueue: Waiter[] = [];
/** How long a file may wait for another face-mapped file to finish with the
 * budget before its own run is a timeout: the AI job's own deadline. */
export const LEASE_TIMEOUT_MS = 600_000;
// A call fits beside the file and the other calls in flight.
const callFits = (bytes: number) => leasedBytes + callBytes + bytes <= MAX_CONTAINER_INFLIGHT_BYTES;

/** Admits the next file if none is held, and every call from the head of its
 * queue that fits; the first that does not keeps its place, and everything
 * behind it waits with it. */
function admitWaiting() {
  if (fileQueue.length && leasedBytes === 0) {
    const next = fileQueue.shift()!;
    leasedBytes += next.bytes;
    next.admitted = true;
    next.admit();
  }
  while (callQueue.length && callFits(callQueue[0].bytes)) {
    const next = callQueue.shift()!;
    callBytes += next.bytes;
    next.admitted = true;
    next.admit();
  }
}

/** Room for `bytes`, once everything ahead in its queue has had its turn;
 * raced against `deadline` where the caller has one, and a waiter whose
 * deadline passes leaves the queue - and whatever fits behind it is admitted
 * then, not at the next release. Resolves to the release. */
async function acquire(kind: "file" | "call", bytes: number, deadline?: Promise<never>): Promise<() => void> {
  // A call the budget could never hold beside the file it belongs to is
  // refused now, not queued for room that will not come.
  if (kind === "call" && leasedBytes + bytes > MAX_CONTAINER_INFLIGHT_BYTES) {
    throw new ContainerClientError("too_large", `a call holding ${bytes} bytes cannot fit beside the file's ${leasedBytes}`);
  }
  const queue = kind === "file" ? fileQueue : callQueue;
  const take = () => { if (kind === "file") leasedBytes += bytes; else callBytes += bytes; };
  const release = () => { if (kind === "file") leasedBytes -= bytes; else callBytes -= bytes; admitWaiting(); };
  if (!queue.length && (kind === "file" ? leasedBytes === 0 : callFits(bytes))) {
    take();
    return release;
  }
  const waiter: Waiter = { bytes, admit: () => {}, admitted: false };
  const admitted = new Promise<void>((resolve) => { waiter.admit = resolve; });
  queue.push(waiter);
  try {
    await (deadline ? Promise.race([admitted, deadline]) : admitted);
  } catch (error) {
    if (waiter.admitted) release();
    else {
      queue.splice(queue.indexOf(waiter), 1);
      admitWaiting();
    }
    throw error;
  }
  return release;
}

/** A face-mapped file's PDF, held for the file's whole life through the
 * budget its calls draw on; one file at a time, each waiting its turn for at
 * most `timeoutMs`. Resolves to the release. */
export async function reserveContainerMemory(bytes: number, timeoutMs: number = LEASE_TIMEOUT_MS): Promise<() => void> {
  if (bytes > MAX_CONTAINER_INFLIGHT_BYTES) {
    throw new ContainerClientError("too_large", `${bytes} bytes is more than the budget holds`);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ContainerClientError("timeout", "waited for the budget")), timeoutMs);
  });
  deadline.catch(() => {});
  try {
    return await acquire("file", bytes, deadline);
  } finally {
    clearTimeout(timer);
  }
}

async function callContainer(
  namespace: DurableObjectNamespace,
  projectId: string,
  path: "/inspect" | "/render",
  header: Record<string, unknown>,
  pdfBytes: Uint8Array,
  timeoutMs: number,
  limits: CallLimits,
): Promise<unknown> {
  const cap = limits.responseCap ?? (path === "/inspect" ? MAX_INSPECT_RESPONSE_BYTES : MAX_RENDER_RESPONSE_BYTES);
  // Raced against the signal directly, not just passed to fetch: a
  // conformant fetch aborts itself on the signal, but nothing here should
  // depend on the callee honouring it (defence in depth — AB-6's whole
  // pattern is caps enforced on OUR side of the call). One deadline for the
  // whole call - the wait for room, the headers, the body - cleared when the
  // call is over.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const timeout = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(new ContainerClientError("timeout")), { once: true });
  });
  timeout.catch(() => {});
  // What one call holds at its peak: the framed copy of the PDF the request
  // is, the response bytes as they arrive, and the string they decode to.
  let release = () => {};
  try {
  if (limits.budgeted) release = await acquire("call", pdfBytes.byteLength + 2 * cap, timeout);
  const id = namespace.idFromName(projectId);
  const stub = namespace.get(id);
    let res: Response;
    try {
      res = await Promise.race([
        stub.fetch(`http://plan-parse${path}`, { method: "POST", body: framedBody(header, pdfBytes) as BodyInit, signal: controller.signal }),
        timeout,
      ]);
    } catch (err) {
      if (err instanceof ContainerClientError) throw err;
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) throw new ContainerClientError("timeout");
      throw err;
    }
    if (!res.ok) {
      // A body that stalls or is too big is that failure; only a body that is
      // not JSON is an error with no more to say.
      const body = await boundedJson(res, timeout, cap).catch((error: unknown) => {
        if (error instanceof ContainerClientError) throw error;
        return {} as Record<string, unknown>;
      });
      const code = (typeof body === "object" && body && "error" in body ? (body as { error: string }).error : null) as ContainerFailureCode | null;
      throw new ContainerClientError(code ?? "render_failed", `container returned ${res.status}`);
    }
    return await boundedJson(res, timeout, cap);
  } finally {
    clearTimeout(timer);
    release();
  }
}

/** The body, read against the cap as it arrives - refused by its declared
 * length where it declares one, and by count where it does not - and against
 * the call's own deadline, so a renderer that answers its headers and then
 * stalls is a timeout rather than a job held open. The Worker never holds an
 * answer it cannot afford in order to learn its size. */
async function boundedJson(res: Response, deadline: Promise<never>, cap: number): Promise<unknown> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > cap) {
    // Let go, not awaited: a stream that will not settle its own cancellation
    // is not this call's problem once the call has refused it.
    void res.body?.cancel().catch(() => {});
    throw new ContainerClientError("too_large", `container response declares ${declared} bytes`);
  }
  if (!res.body) return res.json();
  const reader = res.body.getReader();
  // Decoded as it arrives, so the bytes are not held beside the text they
  // become: the response is in memory once as bytes in flight, once as text.
  const decoder = new TextDecoder();
  let text = "";
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      received += value.byteLength;
      if (received > cap) {
        throw new ContainerClientError("too_large", `container response exceeds ${cap} bytes`);
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    // The aborted fetch's own stream can reject before the deadline promise
    // does. It is the same deadline.
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) throw new ContainerClientError("timeout");
    throw error;
  }
  return JSON.parse(text + decoder.decode());
}

export async function inspectPdf(
  namespace: DurableObjectNamespace,
  projectId: string,
  pdfBytes: Uint8Array,
  maxPages: number = MAX_PAGES,
  timeoutMs: number = INSPECT_TIMEOUT_MS,
  limits: CallLimits = {},
): Promise<InspectResponse> {
  if (pdfBytes.byteLength > MAX_PDF_BYTES) throw new ContainerClientError("too_large");
  return callContainer(namespace, projectId, "/inspect", { maxPages: Math.min(maxPages, MAX_PAGES) }, pdfBytes, timeoutMs, limits) as Promise<InspectResponse>;
}

export async function renderPage(
  namespace: DurableObjectNamespace,
  projectId: string,
  pdfBytes: Uint8Array,
  req: RenderRequest,
  timeoutMs: number = RENDER_TIMEOUT_MS,
  limits: CallLimits = {},
): Promise<RenderResponse> {
  if (pdfBytes.byteLength > MAX_PDF_BYTES) throw new ContainerClientError("too_large");
  if (req.dpi > MAX_DPI) throw new ContainerClientError("bad_request", "dpi exceeds cap");
  if (req.crops && req.crops.length > MAX_CROPS_PER_PAGE) throw new ContainerClientError("bad_request", "too many crops requested");
  if (req.threshold != null && (!Number.isInteger(req.threshold) || req.threshold < 0 || req.threshold > 255)) {
    throw new ContainerClientError("bad_request", "threshold outside 0..255");
  }
  return callContainer(namespace, projectId, "/render", { pageNo: req.pageNo, dpi: req.dpi, crops: req.crops, threshold: req.threshold }, pdfBytes, timeoutMs, limits) as Promise<RenderResponse>;
}
