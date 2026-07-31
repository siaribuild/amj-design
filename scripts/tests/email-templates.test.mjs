// Unit tests for the email-template renderer + safe-fallback loader
// (worker/lib/emailTemplates.ts). The wiring guarantee is: render from Sanity
// when a template exists, otherwise fall back to the built-in copy — a CMS blip
// must never block a transactional email.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const runDir = await makeRunDir("email-templates");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `export { applyPlaceholders, loadEmailTemplate } from ${JSON.stringify(join(projectRoot, "worker/lib/emailTemplates.ts"))};`,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { applyPlaceholders, loadEmailTemplate } = await import(pathToFileURL(outfile).href);

test("applyPlaceholders substitutes known tokens and leaves unknown ones intact", () => {
  const out = applyPlaceholders("Hi [name], your code is [code].", { name: "Sam", code: 123 });
  assert.equal(out, "Hi Sam, your code is 123.");
  // An unknown token is an editor mistake worth SEEING — not silently blanked.
  assert.equal(applyPlaceholders("ref [ref] / [mystery]", { ref: "OF-Q-1" }), "ref OF-Q-1 / [mystery]");
});

test("a provided null/undefined value collapses to empty (optional lines disappear)", () => {
  // [scheduleNote] is the conditional-line case: present-but-empty ⇒ nothing shown.
  assert.equal(applyPlaceholders("done.[scheduleNote]\n\nnext", { scheduleNote: "" }), "done.\n\nnext");
  assert.equal(applyPlaceholders("a[x]b", { x: null }), "ab");
  assert.equal(applyPlaceholders("a[x]b", { x: undefined }), "ab");
});

test("a repeated token is replaced everywhere; a token with no value is left intact", () => {
  assert.equal(applyPlaceholders("[ref] … reference [ref]", { ref: "R1" }), "R1 … reference R1");
  // Any [word] is a token by syntax; when the caller supplies no value it stays
  // verbatim rather than becoming blank (so a stray bracket is visible, not lost).
  assert.equal(applyPlaceholders("array[0] stays", {}), "array[0] stays");
});

test("loadEmailTemplate returns null (⇒ built-in fallback) without project id or read token", async () => {
  // No project id ⇒ no network call, immediate fallback. This is the guarantee
  // that a sign-in OTP is never gated on the CMS.
  assert.equal(await loadEmailTemplate({}, "signin_code"), null);
  assert.equal(await loadEmailTemplate({ SANITY_PROJECT_ID: "" }, "signin_code"), null);
  // Templates are internal content behind the read token; without it, no fetch.
  assert.equal(await loadEmailTemplate({ SANITY_PROJECT_ID: "xjtrm1ex" }, "signin_code"), null);
});

test.after(async () => { if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir); });
