import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { makeRunDir, removeRunDir, run, viteCli, wranglerCli } from "./helpers.mjs";

test("customer/ops bundles and the Cloudflare Worker build", { timeout: 120_000 }, async () => {
  const runDir = await makeRunDir("build");
  try {
    const assets = join(runDir, "assets");
    const worker = join(runDir, "worker");
    const vite = await run(process.execPath, [viteCli, "build", "--outDir", assets, "--emptyOutDir"]);
    assert.match(vite.stdout + vite.stderr, /built in/i);
    const wrangler = await run(process.execPath, [wranglerCli, "deploy", "--dry-run", "--outdir", worker], {
      env: { WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") },
    });
    assert.match(wrangler.stdout + wrangler.stderr, /Total Upload|dry-run/i);
  } finally {
    await removeRunDir(runDir);
  }
});
