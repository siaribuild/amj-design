import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { commandExists, makeRunDir, removeRunDir, run, viteCli, wranglerCli } from "./helpers.mjs";

test("customer/ops bundles and the Cloudflare Worker build", { timeout: 120_000 }, async () => {
  const runDir = await makeRunDir("build");
  try {
    const assets = join(runDir, "assets");
    const worker = join(runDir, "worker");
    const vite = await run(process.execPath, [viteCli, "build", "--outDir", assets, "--emptyOutDir"]);
    assert.match(vite.stdout + vite.stderr, /built in/i);
    // Build the container image WHEN DOCKER IS HERE, and say so loudly when it
    // is not.
    //
    // wrangler builds the image during `deploy --dry-run` — "even in dry-run
    // mode", its words — so without Docker this gate fails outright, and on
    // Windows `wrangler dev` refuses containers entirely. But passing
    // --containers-rollout none unconditionally, which is what this did first,
    // means NOTHING ever builds the image: there is no CI running these suites,
    // so its first build would have been a production deploy.
    //
    // So: skip only where it cannot run, and never silently.
    // .github/workflows/container-build.yml is the gate that always runs, on a
    // runner that has Docker.
    const hasDocker = await commandExists("docker", ["version"]);
    if (!hasDocker) {
      console.log(
        "  ! no Docker: the plan-parse image is NOT built by this run. "
        + "container-build.yml is what validates it.",
      );
    }
    const containerArgs = hasDocker ? [] : ["--containers-rollout", "none"];
    const wrangler = await run(process.execPath, [wranglerCli, "deploy", "--dry-run", ...containerArgs, "--assets", assets, "--outdir", worker], {
      env: { WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") },
    });
    assert.match(wrangler.stdout + wrangler.stderr, /Total Upload|dry-run/i);
  } finally {
    await removeRunDir(runDir);
  }
});


test("commandExists answers TRUE for a command that is present", async () => {
  // The bug this exists for: the first version checked `r.code === 0` on a value
  // that carries no `code`, so it returned false for everything — and a build
  // gate that always skips its container build looks identical to one that has
  // no Docker. Docker cannot be tested here, so it is tested with a command that
  // is certainly present and one that certainly is not.
  assert.equal(await commandExists(process.execPath, ["--version"]), true, "node is present");
  assert.equal(await commandExists("definitely-not-a-real-binary-xyz"), false, "and this is not");
});
