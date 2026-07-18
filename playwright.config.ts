import { defineConfig } from "@playwright/test";

// E2E against a real local Worker (built SPA + D1/KV/R2 + seed). The webServer
// script builds, migrates, seeds, and starts `wrangler dev` on a fixed port.
const PORT = 8788;

export default defineConfig({
  testDir: "scripts/tests/web",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
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
