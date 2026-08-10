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

// The tests above only ever fed the scanner an UNPREFIXED container, which is
// what let the sniff window survive: it read the first 8 KB, so eight kilobytes
// of ASCII in front of any of these sniffed as 'text' and was stored clean and
// served to staff. A prefixed archive is not inconvenienced — ZIP and OOXML are
// read from the End-of-Central-Directory record at the tail, so the file still
// opens normally. Every case here passed as 'clean' before the window was removed.
const PREFIX = "A".repeat(8192);
for (const [what, tail] of [
  ["a ZIP", "\x50\x4b\x03\x04\x14\x00\x00\x00"],
  ["a Windows executable", "\x4d\x5a\x90\x00\x03\x00\x00\x00"],
  ["an OOXML macro document", "\x50\x4b\x03\x04word/vbaProject.bin"],
  ["a legacy OLE document", "\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"],
  ["a RAR archive", "\x52\x61\x72\x21\x1a\x07\x00"],
]) {
  test(`${what} behind 8 KB of ASCII is still rejected`, async () => {
    const r = await scan(`${PREFIX}${tail}`, { SCAN_ENGINE: "structural" }, "plans.pdf", "application/pdf");
    assert.equal(r.verdict, "infected", `${what} sniffed as text and was stored`);
  });
}

test("the sniffer reads past the old 8 KB window", () => {
  // Genuine text stays text however long it is — the fix is scope, not paranoia.
  assert.equal(sniffType(bytes("schedule line\n".repeat(2000))), "text");
  // A single NUL anywhere is enough to disqualify it, at any offset.
  assert.equal(sniffType(bytes(`${PREFIX}${"B".repeat(50000)}\x00`)), null);
});

test("SCAN_ENGINE is validated, and an unknown value fails closed", async () => {
  // A typo used to degrade silently to structural-only, so a misconfigured
  // deployment read as a working AV one.
  const r = await scan(minimalPdf(), { SCAN_ENGINE: "clamav" });
  assert.equal(r.verdict, "unknown");
  assert.equal(r.reason, "scanner_misconfigured");
});

test("'remote' still enforces the structural type allowlist", async () => {
  // 'remote' used to skip structural entirely, so acting on "deploy AV" with the
  // obvious value newly permitted executables on an AV verdict alone.
  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
  const r = await scan(exe, { SCAN_ENGINE: "remote", SCAN_ENDPOINT: "https://av.invalid/scan" });
  assert.equal(r.verdict, "infected");
  assert.equal(r.engine, "structural");
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

// ═══════════════════════════════════════════════════════════════════════════════
// A STREAM BODY IS NOT A DICTIONARY
//
// A real 5.9 MB architectural plan set was refused as "infected" on a single
// `/JS` at byte 5,606,079 — inside an 80 KB compressed stream, at 38% printable,
// in a document pdf.js confirms has no JavaScript anywhere: no document actions,
// no page actions, no annotation actions. The customer was told their drawings
// "contain embedded scripts".
//
// It was never going to be rare. A specific three-byte sequence turns up by
// chance about once per 16.7 MB of arbitrary bytes, so a spurious `/JS` runs at
// roughly 8% for a 2 MB PDF, 23% at 6 MB and 49% at the 15 MB upload cap — and
// the biggest files are real builders' plan sets.
// ═══════════════════════════════════════════════════════════════════════════════

test("an active-content token inside a compressed stream is not a verdict", async () => {
  // The exact shape of the production false positive: the token sits in the
  // content stream, where compressed image data lives, not in any dictionary.
  const r = await scan(minimalPdf("", "(x) Tj \x8a\x1f/JS\x00\x93q"));
  assert.equal(r.verdict, "clean", "a byte coincidence in stream data is not active content");
  assert.equal(r.reason, "type_pdf");
});

test("the same token in a DICTIONARY is still infected", async () => {
  // The pass exists for this and must keep doing it — the fix narrows where it
  // looks, never what it looks for.
  for (const [extra, reason] of [
    ["/Names << /JavaScript 6 0 R >> ", "pdf_javascript"],
    ["/OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >> ", "pdf_javascript"],
    ["/OpenAction << /S /Launch /F (cmd.exe) >> ", "pdf_launch_action"],
    ["/AcroForm << /XFA 6 0 R >> ", "pdf_xfa"],
  ]) {
    const r = await scan(minimalPdf(extra));
    assert.equal(r.verdict, "infected", extra);
    assert.equal(r.reason, reason, extra);
  }
});

test("a truncated stream cannot smuggle a dictionary past the scan", async () => {
  // outsideStreams drops everything after an unterminated `stream`, so omitting
  // `endstream` hides the tail from the raw pass. It must not become a bypass:
  // pdf.js then fails to parse and the scan fails CLOSED.
  const truncated = bytes("%PDF-1.4\n1 0 obj << /Length 9 >>\nstream\n/JS (app.alert\\(1\\))");
  const r = await scan(truncated);
  assert.notEqual(r.verdict, "clean", "an unparseable PDF is never clean");
});

test("a PDF carrying an attached file is still refused", async () => {
  // A real attachment: a filespec pointing at an /Type /EmbeddedFile stream,
  // reachable from the catalogue's EmbeddedFiles name tree. The subtype sits in
  // an object DICTIONARY — outside any stream — so the narrowed raw pass still
  // sees it.
  //
  // Note the token is `/EmbeddedFile`, the stream subtype, not `/EmbeddedFiles`,
  // the name-tree key: the trailing `s` fails the delimiter lookahead, which is
  // correct and is why this fixture carries the real object rather than just the
  // name tree.
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(payload.txt) 6 0 R] >> >> >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>",
    "<< /Length 20 >>\nstream\nBT (hi) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Filespec /F (payload.txt) /EF << /F 7 0 R >> >>",
    "<< /Type /EmbeddedFile /Length 5 >>\nstream\nhello\nendstream",
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

  const r = await scan(bytes(pdf));
  assert.equal(r.verdict, "infected");
  assert.equal(r.reason, "pdf_embedded_file");
});

test("statusForVerdict maps onto the virus_status CHECK constraint", () => {
  assert.equal(statusForVerdict("clean"), "clean");
  assert.equal(statusForVerdict("infected"), "infected");
  // 'unknown' must never become a status that reads as scanned-and-safe.
  assert.equal(statusForVerdict("unknown"), "pending");
});

test.after(() => removeRunDir(runDir));
