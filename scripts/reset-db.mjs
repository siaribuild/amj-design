#!/usr/bin/env node
// Reset the AMJ database to a known test state: ensure schema, clear all data,
// load default fixtures. Local by default; pass --remote to target Cloudflare.
//
//   npm run db:reset              # local, lock-safe (DELETE rows + reseed)
//   npm run db:reset -- --hard    # local, also nuke KV sessions/OTP + R2
//   npm run db:reset -- --remote  # target the deployed Cloudflare DB
//
// The default is safe to run while `npm run dev:api` is up. --hard deletes the
// local Miniflare state and therefore needs the dev server stopped (it holds
// file locks on Windows).
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const remote = process.argv.includes("--remote");
const hard = process.argv.includes("--hard") && !remote;
const flag = remote ? "--remote" : "--local";
const DB = "amj-db";

const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
};

console.log(`\n▶ Resetting ${DB} (${remote ? "REMOTE" : "local"}${hard ? ", hard" : ""})`);

try {
  if (hard) {
    // Nuke local Miniflare state so KV sessions/OTP and R2 objects reset too.
    rmSync(".wrangler/state", { recursive: true, force: true });
    console.log("✓ cleared local .wrangler/state (D1 + KV + R2)");
  }

  run(`npx wrangler d1 migrations apply ${DB} ${flag}`);
  // A hard reset starts from an empty DB, so only the row-clear path needs it.
  if (!hard) run(`npx wrangler d1 execute ${DB} ${flag} --file scripts/db/clear.sql`);
  run(`npx wrangler d1 execute ${DB} ${flag} --file scripts/db/seed.sql`);

  console.log(`
✓ Database reset complete.

  Sign in as   demo@amjtradedirect.com.au   (passwordless — request an OTP;
  the dev code prints from the challenge / server log).

    • MyProject → "Coburg new build" draft (2 lines)
    • My orders → AMJ-58001, in manufacturing (deposit paid, balance due)
${hard ? "" : "\n  (KV sessions were kept — run with --hard to clear them too.)\n"}`);
} catch (err) {
  console.error("\n✗ Reset failed.");
  if (hard) console.error("  If files are locked, stop `npm run dev:api` and retry.");
  process.exit(1);
}
