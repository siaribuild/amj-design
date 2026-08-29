// The Worker's side of the container wire (02-design-v2.md §3.1, §9). Every
// cap is enforced HERE, before any fetch reaches the Durable Object — the
// container re-checks the same numbers itself (server.py) as defence in
// depth, not as the gate (AB-6).
//
// The namespace is an argument, not an import of `env.PLAN_PARSE` — so a
// test can inject a fake that proves a refused call never dispatches.
import type { ContainerFailureCode, CropBoxPt, InspectResponse, RenderResponse } from "./contract";
import { MAX_CROPS_PER_PAGE, MAX_DPI, MAX_PAGES, MAX_PDF_BYTES } from "./contract";

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
): Promise<unknown> {
  const id = namespace.idFromName(projectId);
  const stub = namespace.get(id);
  const res = await stub.fetch(`http://plan-parse${path}`, { method: "POST", body: framedBody(header, pdfBytes) as BodyInit });
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
): Promise<InspectResponse> {
  if (pdfBytes.byteLength > MAX_PDF_BYTES) throw new ContainerClientError("too_large");
  return callContainer(namespace, projectId, "/inspect", { maxPages: Math.min(maxPages, MAX_PAGES) }, pdfBytes) as Promise<InspectResponse>;
}

export async function renderPage(
  namespace: DurableObjectNamespace,
  projectId: string,
  pdfBytes: Uint8Array,
  req: { pageNo: number; dpi: number; crops?: CropBoxPt[] },
): Promise<RenderResponse> {
  if (pdfBytes.byteLength > MAX_PDF_BYTES) throw new ContainerClientError("too_large");
  if (req.dpi > MAX_DPI) throw new ContainerClientError("bad_request", "dpi exceeds cap");
  if (req.crops && req.crops.length > MAX_CROPS_PER_PAGE) throw new ContainerClientError("bad_request", "too many crops requested");
  return callContainer(namespace, projectId, "/render", { pageNo: req.pageNo, dpi: req.dpi, crops: req.crops }, pdfBytes) as Promise<RenderResponse>;
}
