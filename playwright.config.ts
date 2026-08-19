import { defineConfig } from "@playwright/test";

// E2E against a real local Worker (built SPA + D1/KV/R2 + seed). The webServer
// script builds, migrates, seeds, and starts `wrangler dev` on a fixed port.
const PORT = 8788;

export default defineConfig({
  testDir: "scripts/tests/web",
  testMatch: "**/*.spec.ts",
  // File-level parallelism on a 16-core/32-thread box (2026-08-19).
  //
  // `fullyParallel: false` is KEPT deliberately: Playwright then parallelises
  // across FILES while preserving order WITHIN a file, which is what these specs
  // assume — several walk a customer through a sequence where step 2 depends on
  // step 1. Turning it on would interleave those and break them for reasons that
  // look like product bugs.
  //
  // The old `workers: 1` predates the CPU upgrade and, more importantly, predates
  // the RAM-leak fix: while the GPU driver leaked a process object per exited
  // process, more concurrency meant a shorter session, not a faster one. That is
  // resolved, so the constraint is now live RAM (16 GB) rather than cores.
  fullyParallel: false,
  workers: Number(process.env.PW_WORKERS ?? 4),
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
  },
  webServer: {
    command: "node scripts/tests/web-server.mjs",
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { WEB_PORT: String(PORT) },
  },
  // Use the system Chrome/Edge by default (PLAYWRIGHT_CHANNEL, defaults to
  // "chrome") so no browser download is required; unset it to use Playwright's
  // bundled chromium after `npx playwright install`.
  projects: [{
    name: "chromium",
    use: { browserName: "chromium", channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" },
  }],
});
