// Exercises the container's real logic against a real plan set, WITHOUT Docker.
//
// This exists because Docker is not available on every machine that will touch
// this, and because the thing worth checking is the rendering and cropping, not
// the HTTP wrapper around it. Being Node is what makes it possible at all: the
// Python scaffold this replaced could only be run as a built image.
//
//   node containers/plan-parse/verify.mjs
//
// Needs the fixture at scripts/research/plan-geometry/plans.pdf (see that
// directory's README for how to fetch it — it is a customer document and is not
// in the repo), and @napi-rs/canvas resolvable:
//
//   npm install @napi-rs/canvas --no-save
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { workerdBuiltins } from "../../scripts/tests/helpers.mjs";
import { renderCrops } from "./render.mjs";

// @napi-rs/canvas is not a repo dependency — it belongs to the image. Installed
// here with --no-save, ANY later `npm install` prunes it as extraneous, and the
// failure then surfaces from inside the container as a page_render_failed with a
// module-not-found buried in a log. Say it plainly instead.
try {
  await import("@napi-rs/canvas");
} catch {
  console.error("@napi-rs/canvas is not installed (a later `npm install` prunes a --no-save package).");
  console.error("  npm install @napi-rs/canvas --no-save");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const PDF = join(repo, "scripts", "research", "plan-geometry", "plans.pdf");
const OUT = join(here, "out");

// The Worker's half, compiled the way the test suite compiles it.
const bundle = await build({
  stdin: { contents: `export * from "./worker/lib/drawing/index.ts";`, resolveDir: repo, loader: "ts" },
  // The drawing surface now reaches @cloudflare/containers, which imports the
  // workerd-only `cloudflare:workers`. Same stub the test suites use.
  bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
  plugins: [workerdBuiltins],
});
const W = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

const PAGE_W = 1190.52, PAGE_H = 841.92, SCALE = 3;
// Regions measured by the geometric decoder, plus one deliberately out of range.
const openings = [
  ["W1", 6, [0.5748, 0.2952, 0.6236, 0.3660]],
  ["W14", 6, [0.5747, 0.1918, 0.6273, 0.2626]],
  ["W4", 7, [0.2185, 0.3585, 0.2947, 0.4293]],
  ["D1", 6, [1.4, 0.2, 0.5, 0.6]],
];
const req = W.buildCropRequest(
  openings.map(([id, pageNo, region]) => ({ id, pageNo, box: W.cropBoxFor(region, PAGE_W, PAGE_H, SCALE) })),
  SCALE,
);
console.log(`request : ${req.pages.length} pages, ${req.pages.reduce((n, p) => n + p.crops.length, 0)} crops`);
console.log(`gaps    : [${req.gaps}]  (D1's region is out of range and is refused, not clamped)`);

const t0 = Date.now();
const { crops, failures } = await renderCrops(new Uint8Array(await readFile(PDF)), req);
await mkdir(OUT, { recursive: true });
for (const c of crops) await writeFile(join(OUT, `${c.id}.png`), c.png);
console.log(`rendered: ${crops.length} crops in ${Date.now() - t0}ms, peak heap ${Math.round(process.memoryUsage().heapUsed / 1e6)}MB`);
for (const c of crops) console.log(`  ${c.id.padEnd(4)} ${c.width}x${c.height}  ${(c.png.length / 1024).toFixed(0)} KB  → out/${c.id}.png`);
if (failures.length) { console.log("failures:", failures); process.exitCode = 1; }
if (crops.length !== 3 || req.gaps.length !== 1) {
  console.log("UNEXPECTED: three crops and one gap is the known-good result for this fixture");
  process.exitCode = 1;
}
