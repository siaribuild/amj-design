// The Worker's side of the container wire (02-design-v2.md §3.1, §9). Every
// cap is enforced HERE, before any fetch reaches the Durable Object — the
// container re-checks the same numbers itself (server.py) as defence in
// depth, not as the gate (AB-6).
//
// The namespace is an argument, not an import of `env.PLAN_PARSE` — so a
// test can inject a fake that proves a refused call never dispatches.
import type { ContainerFailureCode, CropBoxPt, InspectResponse, RenderResponse } from "./contract";
import { MAX_CROPS_PER_PAGE, MAX_DPI, MAX_PAGES, MAX_PDF_BYTES } from "./contract";

// A stalled DO call must not silently burn the whole job lease (2026-08-29
// incident: a hung fetch consumed the full 240s auto_drawings deadline with
// nothing persisted). 600s while the freshly-provisioned container is being
// tested — tighten once cold-start behaviour is known-good.
export const CONTAINER_CALL_TIMEOUT_MS = 600_000;

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

async function callContainer(
  namespace: DurableObjectNamespace,
  projectId: string,
  path: "/inspect" | "/render",
  header: Record<string, unknown>,
  pdfBytes: Uint8Array,
  timeoutMs: number,
): Promise<unknown> {
  const id = namespace.idFromName(projectId);
  const stub = namespace.get(id);
  // Raced against the signal directly, not just passed to fetch: a
  // conformant fetch aborts itself on the signal, but nothing here should
  // depend on the callee honouring it (defence in depth — AB-6's whole
  // pattern is caps enforced on OUR side of the call).
  const signal = AbortSignal.timeout(timeoutMs);
  const timeout = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(new ContainerClientError("timeout")), { once: true });
  });
  let res: Response;
  try {
    res = await Promise.race([
      stub.fetch(`http://plan-parse${path}`, { method: "POST", body: framedBody(header, pdfBytes) as BodyInit, signal }),
      timeout,
    ]);
  } catch (err) {
    if (err instanceof ContainerClientError) throw err;
    if (err instanceof Error && err.name === "TimeoutError") throw new ContainerClientError("timeout");
    throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const code = (typeof body === "object" && body && "error" in body ? (body as { error: string }).error : null) as ContainerFailureCode | null;
    throw new ContainerClientError(code ?? "render_failed", `container returned ${res.status}`);
  }
  return res.json();
}

export async function inspectPdf(
  namespace: DurableObjectNamespace,
  projectId: string,
  pdfBytes: Uint8Array,
  maxPages: number = MAX_PAGES,
  timeoutMs: number = CONTAINER_CALL_TIMEOUT_MS,
): Promise<InspectResponse> {
  if (pdfBytes.byteLength > MAX_PDF_BYTES) throw new ContainerClientError("too_large");
  return callContainer(namespace, projectId, "/inspect", { maxPages: Math.min(maxPages, MAX_PAGES) }, pdfBytes, timeoutMs) as Promise<InspectResponse>;
}

export async function renderPage(
  namespace: DurableObjectNamespace,
  projectId: string,
  pdfBytes: Uint8Array,
  req: { pageNo: number; dpi: number; crops?: CropBoxPt[] },
  timeoutMs: number = CONTAINER_CALL_TIMEOUT_MS,
): Promise<RenderResponse> {
  if (pdfBytes.byteLength > MAX_PDF_BYTES) throw new ContainerClientError("too_large");
  if (req.dpi > MAX_DPI) throw new ContainerClientError("bad_request", "dpi exceeds cap");
  if (req.crops && req.crops.length > MAX_CROPS_PER_PAGE) throw new ContainerClientError("bad_request", "too many crops requested");
  return callContainer(namespace, projectId, "/render", { pageNo: req.pageNo, dpi: req.dpi, crops: req.crops }, pdfBytes, timeoutMs) as Promise<RenderResponse>;
}
