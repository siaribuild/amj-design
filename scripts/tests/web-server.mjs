// Playwright webServer: build the SPA, migrate + seed an isolated local D1, and
// run `wrangler dev` in the foreground on WEB_PORT. Kept alive for the E2E run.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { projectRoot, run, viteCli, wranglerCli } from "./helpers.mjs";

const PORT = process.env.WEB_PORT || "8788";
const base = join(projectRoot, ".codex-tmp");
await mkdir(base, { recursive: true });
const runDir = await mkdtemp(join(base, "web-"));
const assets = join(runDir, "assets");
const state = join(runDir, "state");
const env = { WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") };

await run(process.execPath, [viteCli, "build", "--outDir", assets, "--emptyOutDir"]);
await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "amj-db", "--local", "--persist-to", state], { env });
await run(process.execPath, [wranglerCli, "d1", "execute", "amj-db", "--local", "--persist-to", state, "--file", "scripts/db/seed.sql"], { env });

const wrangler = spawn(process.execPath, [
  wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", PORT,
  "--persist-to", state, "--assets", assets, "--log-level", "warn",
], { cwd: projectRoot, env: { ...process.env, ...env }, stdio: "inherit" });

wrangler.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => wrangler.kill());
