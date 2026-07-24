// Upload-scanner tests. Pure logic — no server: the Worker's scanner is bundled
// with esbuild (same approach as unit.test.mjs) and driven directly.
//
// The contract under test is fail-closed: only an explicit 'clean' verdict lets
// bytes be stored, so every ambiguous case must come back 'infected' or 'unknown'.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("scan");
const outfile = join(runDir, "scan-bundle.mjs");
await build({
  stdin: {
    contents: `
      export { scanFile, sniffType, statusForVerdict } from ${p("worker/lib/scan/index.ts")};
    `,
    resolveDir: projectRoot,
    sourcefile: "scan-entry.ts",
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { scanFile, sniffType, statusForVerdict } = await import(pathToFileURL(outfile).href);

const bytes = (s) => new Uint8Array(Buffer.from(s, "latin1"));
const scan = (data, env = { SCAN_ENGINE: "structural" }, name = "f.pdf", type = "application/pdf") =>
  scanFile(env, { bytes: data instanceof Uint8Array ? data : bytes(data), filename: name, contentType: type });

// A minimal but structurally real PDF, so the parser pass has something to read.
function minimalPdf(extraCatalog = "", content = "(hello) Tj") {
  const objs = [
    `<< /Type /Catalog /Pages 2 0 R ${extraCatalog}>>`,
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length 40 >>\nstream\nBT /F1 12 Tf 10 100 Td ${content} ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return bytes(pdf);
}

test("sniffType identifies formats from bytes, not the declared type", () => {
  assert.equal(sniffType(bytes("%PDF-1.7\n...")), "pdf");
  assert.equal(sniffType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "png");
  assert.equal(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "jpeg");
  assert.equal(sniffType(bytes("GIF89a")), "gif");
  assert.equal(sniffType(bytes("plain text schedule")), "text");
  // Windows executable — not on the allowlist.
  assert.equal(sniffType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00])), null);
});

test("a clean PDF passes", async () => {
  const r = await scan(minimalPdf());
  assert.equal(r.verdict, "clean");
  assert.equal(r.engine, "structural");
});

test("executables are rejected even when declared as a PDF", async () => {
  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
  const r = await scan(exe, { SCAN_ENGINE: "structural" }, "schedule.pdf", "application/pdf");
  assert.equal(r.verdict, "infected");
  assert.equal(r.reason, "type_not_allowed");
});

test("a ZIP/Office container is rejected (macro carrier)", async () => {
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  assert.equal((await scan(zip)).verdict, "infected");
});

test("PDF with embedded JavaScript is rejected", async () => {
  const r = await scan(minimalPdf("/Names << /JavaScript 6 0 R >> "));
  assert.equal(r.verdict, "infected");
  assert.equal(r.reason, "pdf_javascript");
});

test("PDF with a /Launch action is rejected", async () => {
  const r = await scan(minimalPdf("/OpenAction << /S /Launch /F (calc.exe) >> "));
  assert.equal(r.verdict, "infected");
  assert.equal(r.reason, "pdf_launch_action");
});

test("PDF with an embedded file is rejected", async () => {
  const r = await scan(minimalPdf("/Names << /EmbeddedFiles 6 0 R >> /EmbeddedFile 7 0 R "));
  assert.equal(r.verdict, "infected");
  assert.equal(r.reason, "pdf_embedded_file");
});

test("benign /OpenAction alone does NOT trip the scanner", async () => {
  // Ordinary CAD exports set a view action; flagging it would reject real plans.
  const r = await scan(minimalPdf("/OpenAction [3 0 R /XYZ null null 0] "));
  assert.equal(r.verdict, "clean");
});

test("/JS does not false-positive on similarly named keys", async () => {
  const r = await scan(minimalPdf("/JSName (harmless) "));
  assert.equal(r.verdict, "clean");
});

test("a truncated/unreadable PDF is 'unknown', never clean", async () => {
  const r = await scan("%PDF-1.4\nthis is not a real pdf body");
  assert.equal(r.verdict, "unknown");
  assert.equal(r.reason, "pdf_unreadable");
});

test("an empty file is 'unknown', never clean", async () => {
  const r = await scan(new Uint8Array(0));
  assert.equal(r.verdict, "unknown");
});

test("remote engine without an endpoint fails closed", async () => {
  const r = await scan(minimalPdf(), { SCAN_ENGINE: "remote" });
  assert.equal(r.verdict, "unknown");
  assert.equal(r.reason, "scanner_not_configured");
});

test("'both' requires the structural pass before AV is consulted", async () => {
  // Structural rejection is final — AV is never called, so the missing endpoint
  // cannot turn this into a scanner-availability error.
  const r = await scan(minimalPdf("/Names << /JavaScript 6 0 R >> "), { SCAN_ENGINE: "both" });
  assert.equal(r.verdict, "infected");
  assert.equal(r.reason, "pdf_javascript");
});

test("scanning leaves the caller's bytes intact", async () => {
  // pdf.js detaches any typed array handed to it. The scanner runs BEFORE the R2
  // write, so if it consumed the buffer we would store a zero-length object and
  // every later parse/download would see an empty file.
  const pdf = minimalPdf();
  const size = pdf.length;
  const copy = Uint8Array.from(pdf);
  const r = await scan(pdf);
  assert.equal(r.verdict, "clean");
  assert.equal(pdf.length, size, "buffer was detached by the scanner");
  assert.deepEqual(Array.from(pdf.subarray(0, 8)), Array.from(copy.subarray(0, 8)));
});

test("statusForVerdict maps onto the virus_status CHECK constraint", () => {
  assert.equal(statusForVerdict("clean"), "clean");
  assert.equal(statusForVerdict("infected"), "infected");
  // 'unknown' must never become a status that reads as scanned-and-safe.
  assert.equal(statusForVerdict("unknown"), "pending");
});

test.after(() => removeRunDir(runDir));
