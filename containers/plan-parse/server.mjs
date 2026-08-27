// The container's HTTP surface: one endpoint, one job, no state.
//
// It receives a PDF and a list of rectangles and returns PNGs. It holds no
// credentials, reaches no network, and keeps nothing between requests — the
// Worker owns R2, D1, the model call and every decision.
import { createServer } from "node:http";
import { renderCrops } from "./render.mjs";

const PORT = Number(process.env.PORT ?? 8080);
// A plan set is megabytes and arrives inline because the container has no R2
// credentials. The cap is a refusal, not a truncation: half a PDF renders as
// garbage rather than failing, which is the worse outcome.
const MAX_BODY_BYTES = 32 * 1024 * 1024;

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BODY_BYTES) { reject(new Error("payload_too_large")); req.destroy(); return; }
    chunks.push(c);
  });
  req.on("end", () => resolve(Buffer.concat(chunks)));
  req.on("error", reject);
});

/** Validate what arrived. The Worker builds this request and is trusted to have
 *  clamped the boxes, but "trusted" and "unchecked" are different things, and a
 *  malformed box reaches sharp.extract as a throw either way. */
function badRequest(job) {
  if (!job || typeof job !== "object") return "not an object";
  if (!(job.scale > 0)) return "scale must be positive";
  if (!Array.isArray(job.pages) || job.pages.length === 0) return "no pages";
  for (const page of job.pages) {
    if (!Number.isInteger(page.pageNo) || page.pageNo < 1) return "bad pageNo";
    if (!Array.isArray(page.crops) || page.crops.length === 0) return "a page with no crops";
    for (const c of page.crops) {
      if (typeof c.id !== "string" || !c.id) return "a crop with no id";
      const b = c.box;
      if (!b || !["left", "top", "width", "height"].every((k) => Number.isInteger(b[k]))) return "a box that is not integer pixels";
      if (b.width <= 0 || b.height <= 0 || b.left < 0 || b.top < 0) return "a box outside the page";
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  const send = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET") return send(200, { ok: true });
  if (req.method !== "POST") return send(405, { error: "method_not_allowed" });

  try {
    const body = await readBody(req);
    const boundary = body.indexOf(0x0a); // first newline: JSON header, then PDF bytes
    if (boundary < 1) return send(400, { error: "malformed_body" });
    const job = JSON.parse(body.subarray(0, boundary).toString("utf8"));
    const pdfBytes = body.subarray(boundary + 1);

    const why = badRequest(job);
    if (why) return send(400, { error: "bad_request", detail: why });
    if (pdfBytes.length === 0) return send(400, { error: "no_pdf" });

    const { crops, failures } = await renderCrops(pdfBytes, job);
    send(200, {
      crops: crops.map((c) => ({ id: c.id, width: c.width, height: c.height, png: c.png.toString("base64") })),
      failures,
    });
  } catch (err) {
    if (err.message === "payload_too_large") return send(413, { error: "payload_too_large" });
    // The message goes to the log, not the response. A pdf.js or sharp internal
    // string tells a caller about the inside of this process and tells the
    // Worker nothing it can act on — it retries or reports the opening unread
    // either way.
    console.error("render_failed:", err.stack ?? err.message);
    send(500, { error: "render_failed" });
  }
});

server.listen(PORT, () => console.log(`plan-parse listening on ${PORT}`));

// EXIT HARD, ON PURPOSE.
//
// sharp and @napi-rs/canvas each account for their own native allocations, and
// on teardown V8 trips "Check failed: static_cast<int64_t>(amount_before) >=
// -delta" — an external-memory counter going negative. Measured: the work itself
// is fine and repeatable, four consecutive renders with a flat heap, and the
// crash lands only when the process exits.
//
// Containers are sent SIGTERM when they scale down, so without this a healthy
// container would die with a fatal error and a non-zero code every single time,
// which is indistinguishable from one that actually broke. Close the listener so
// in-flight requests finish, then leave before teardown can assert.
const bye = () => server.close(() => process.exit(0));
process.on("SIGTERM", bye);
process.on("SIGINT", bye);
