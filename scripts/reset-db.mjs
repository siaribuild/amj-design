#!/usr/bin/env node
// Reset the OpenFrame database to a known test state: ensure schema, clear all data,
// load default fixtures. Local by default; pass --remote to target Cloudflare.
//
//   npm run db:reset                    # local, lock-safe (DELETE rows + reseed)
//   npm run db:reset -- --hard          # local, also nuke KV sessions/OTP + R2
//   npm run db:reset -- --remote        # the DEPLOYED database — asks first
//   npm run db:reset -- --remote --yes  # …without asking (scripts only)
//
// The default is safe to run while `npm run dev:api` is up. --hard deletes the
// local Miniflare state and therefore needs the dev server stopped (it holds
// file locks on Windows).
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const remote = process.argv.includes("--remote");
const hard = process.argv.includes("--hard") && !remote;
const flag = remote ? "--remote" : "--local";
const DB = "apertly-db";

// --remote points at the DEPLOYED database. clear.sql is a straight DELETE
// across every transactional table — customers, projects, quotes, orders,
// payments, uploads — followed by a reseed with demo fixtures. There is no undo
// here; recovery is a D1 Time Travel restore, which loses everything written
// since. A single mistyped flag on a line that is otherwise routine locally is
// all it takes, so this asks, out loud, naming the database.
//
// The prompt is skippable with --yes for a scripted restore, deliberately: a
// guard nobody can automate around gets removed by the first person who needs to
// automate around it. Without a TTY (CI, a pipe) and without --yes it refuses
// rather than assuming consent.
if (remote && !process.argv.includes("--yes")) {
  const CONFIRM = "reset production";
  if (!stdin.isTTY) {
    console.error(`\n✗ Refusing to reset the REMOTE ${DB} without a terminal.\n  Pass --yes if you really mean it from a script.`);
    process.exit(1);
  }
  const rl = createInterface({ input: stdin, output: stdout });
  console.log(`\n⚠ This DELETES every row in the DEPLOYED ${DB} and reloads demo fixtures.`);
  console.log("  Customers, projects, quotes, orders, payments and uploads all go.");
  const answer = await rl.question(`  Type "${CONFIRM}" to continue: `);
  rl.close();
  if (answer.trim() !== CONFIRM) {
    console.error("\n✗ Aborted — nothing was changed.");
    process.exit(1);
  }
}

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

  Sign in as   demo@openframe.com.au   (passwordless — request an OTP;
  the dev code prints from the challenge / server log).

    • MyProject → "Coburg new build" draft (2 lines)
    • My orders → OF-58001, in manufacturing (deposit paid, balance due)
${hard ? "" : "\n  (KV sessions were kept — run with --hard to clear them too.)\n"}`);
} catch (err) {
  console.error("\n✗ Reset failed.");
  if (hard) console.error("  If files are locked, stop `npm run dev:api` and retry.");
  process.exit(1);
}
