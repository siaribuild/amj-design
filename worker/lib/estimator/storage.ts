// R2 object-key policy for the estimator (spec §5.2). Keys are NEVER public URLs —
// access is always mediated by an authenticated Worker (existing file download
// path). Centralising the layout keeps the prefix scheme consistent and auditable.
//
// projects/{projectId}/source/{documentId}/{filename}
// projects/{projectId}/pages/{documentId}/page-{0001}.png
// projects/{projectId}/text/{documentId}/page-{0001}.json
// projects/{projectId}/extractions/{runId}/openings.json
// projects/{projectId}/extractions/{runId}/energy-constraints.json
// projects/{projectId}/reconciliation/{runId}/evidence-map.json
// projects/{projectId}/generated/estimate-{revision}.pdf
// orders/{orderId}/accepted/{documentId}/{filename}

const pad4 = (n: number) => String(n).padStart(4, "0");
// Defence-in-depth: keep keys free of traversal / control characters.
const safe = (s: string) => String(s).replace(/[^\w.\-]+/g, "_").replace(/\.\.+/g, "_");

export const r2Keys = {
  source: (projectId: string, documentId: string, filename: string) =>
    `projects/${safe(projectId)}/source/${safe(documentId)}/${safe(filename)}`,
  page: (projectId: string, documentId: string, page: number) =>
    `projects/${safe(projectId)}/pages/${safe(documentId)}/page-${pad4(page)}.png`,
  pageText: (projectId: string, documentId: string, page: number) =>
    `projects/${safe(projectId)}/text/${safe(documentId)}/page-${pad4(page)}.json`,
  extraction: (projectId: string, runId: string, name: "openings" | "energy-constraints") =>
    `projects/${safe(projectId)}/extractions/${safe(runId)}/${name}.json`,
  reconciliation: (projectId: string, runId: string) =>
    `projects/${safe(projectId)}/reconciliation/${safe(runId)}/evidence-map.json`,
  generated: (projectId: string, revision: string | number) =>
    `projects/${safe(projectId)}/generated/estimate-${safe(String(revision))}.pdf`,
  orderAccepted: (orderId: string, documentId: string, filename: string) =>
    `orders/${safe(orderId)}/accepted/${safe(documentId)}/${safe(filename)}`,
};
