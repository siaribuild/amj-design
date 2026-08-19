// Playwright webServer: build the SPA, migrate + seed an isolated local D1, and
// run `wrangler dev` in the foreground on WEB_PORT. Kept alive for the E2E run.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { projectRoot, run, viteCli, wranglerCli } from "./helpers.mjs";
import { startAbrStub } from "./abr-stub.mjs";

const PORT = process.env.WEB_PORT || "8788";
// Registration Phase 2: NO test in this repo may reach the real ABN Lookup
// register (design §11.6). The stub lives in THIS process for the life of the
// run and the Worker is pointed at it below; the browser specs read its hit
// counter over HTTP, which is why the port is fixed rather than ephemeral —
// "this journey made no ABR call" is an acceptance criterion (AC-P2-7/17) and
// the counter is how it is proved rather than inferred.
const ABR_PORT = process.env.ABR_PORT || "8789";
const abr = await startAbrStub(Number(ABR_PORT));
const base = join(projectRoot, ".codex-tmp");
await mkdir(base, { recursive: true });
const runDir = await mkdtemp(join(base, "web-"));
const assets = join(runDir, "assets");
const state = join(runDir, "state");
const env = { WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") };

// Build WITHOUT the Turnstile site key (.env.production bakes the real one in;
// process env overrides it): the real key can't verify on localhost, which would
// leave the contact form's submit disabled and dead-lock the e2e run.
await run(process.execPath, [viteCli, "build", "--outDir", assets, "--emptyOutDir"], { env: { VITE_TURNSTILE_SITE_KEY: "" } });
await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "apertly-db", "--local", "--persist-to", state], { env });
await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--file", "scripts/db/seed.sql"], { env });

const wrangler = spawn(process.execPath, [
  wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", PORT,
  "--persist-to", state, "--assets", assets, "--log-level", "warn",
  // Local/E2E env: dev OTP codes on, Cloudflare Access off (staff session fallback),
  // and Sanity off so the catalogue is the deterministic built-in data. Production
  // values live in wrangler.jsonc (used by cf:deploy).
  "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:", "--var", "SANITY_PROJECT_ID:", "--var", "AI_EXTRACTION_MODE:manual",
  // The ABR seam. A GUID must be present or every application queues for manual
  // review with reason `abr_unavailable` and no journey can ever auto-pass — the
  // value itself is never checked by the stub, only its presence.
  "--var", `ABR_BASE_URL:${abr.baseUrl}`, "--var", "ABR_GUID:test-guid-do-not-log",
], { cwd: projectRoot, env: { ...process.env, ...env }, stdio: "inherit" });

wrangler.on("exit", (code) => { void abr.close(); process.exit(code ?? 0); });
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { void abr.close(); wrangler.kill(); });
