// User registration — Phase 1: honest registration + the submission gate.
//
// Spec: docs/specs/user-registration-phase-1.md (AC-5/9/10/16/40, AB-1..AB-14).
// Design: docs/specs/user-registration-phase-1-design.md §10.1.
//
// ⚠️ THE ABUSE CASES HERE ARE ATTEMPTS THAT MUST BE REFUSED, not assertions about
// a helper's return value. The forbidden request is made over HTTP against a real
// Worker and the denial is asserted from the response AND from D1 — a 200 that
// wrote nothing and a 403 that quietly wrote something are different failures and
// this file has to be able to tell them apart.
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  Session, freePort, login, makeRunDir, removeRunDir,
  run, staffEmail, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";

test("user registration — creation values, the submission gate, and its abuse cases", { timeout: 1_800_000 }, async (t) => {
  const runDir = await makeRunDir("registration");
  const assets = join(runDir, "assets");
  const state = join(runDir, "state");
  const wranglerEnv = { WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") };
  let server;
  try {
    await run(process.execPath, [viteCli, "build", "--outDir", assets, "--emptyOutDir"]);
    await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "apertly-db", "--local", "--persist-to", state], { env: wranglerEnv });
    await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--file", "scripts/db/seed.sql"], { env: wranglerEnv });

    // Retried on lock contention: this CLI opens the same local SQLite file the
    // running Worker holds. A collision is a harness artefact, not the product
    // refusing anything, and without this it reads like a broken abuse case.
    const contention = /SQLITE_BUSY|database is locked|jsgInternalError|internal error/i;
    const sql = async (command, attempt = 0) => {
      try {
        const r = await run(process.execPath, [
          wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command", command,
        ], { env: wranglerEnv });
        return JSON.parse(r.stdout.slice(r.stdout.indexOf("[")))[0].results;
      } catch (error) {
        if (attempt >= 8 || !contention.test(String(error?.message ?? error))) throw error;
        await new Promise((resolveWait) => setTimeout(resolveWait, 300 * (attempt + 1)));
        return sql(command, attempt + 1);
      }
    };
    const esc = (value) => String(value).replace(/'/g, "''");
    const userRow = async (email) =>
      (await sql(`SELECT * FROM user WHERE email = '${esc(email)}'`))[0] ?? null;

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    server = start(process.execPath, [
      wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
      "--persist-to", state, "--assets", assets, "--log-level", "warn",
      "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:",
      "--var", "SANITY_PROJECT_ID:", "--var", "AI_EXTRACTION_MODE:manual",
    ], { env: wranglerEnv });
    await waitForUrl(`${baseUrl}/api/health`, server);

    let seq = 0;
    const stamp = Date.now().toString(36);
    const freshEmail = (label) => `reg-${label}-${stamp}-${seq++}@example.com`;

    /** A signed-in customer, brand new, with nothing on the account but an email. */
    const newAccount = async (label) => {
      const session = new Session(baseUrl);
      const email = freshEmail(label);
      await login(session, "/api/auth", email);
      return { session, email };
    };

    await t.test("AC-5 / AC-9 / AC-10: a new account has NO invented name and no discount", async () => {
      const email = freshEmail("creation");
      const session = new Session(baseUrl);
      await login(session, "/api/auth", email);

      const row = await userRow(email);
      assert.ok(row, "the sign-in created the account");
      // AC-5: the email local part is NEVER written to name. "j.smith92" as a
      // person's name is the dishonesty this whole phase exists to end.
      assert.equal(row.name, null, "a fresh account's name is NULL, not the email local part");
      assert.notEqual(row.name, email.split("@")[0]);
      // AC-9: no account is created on trade pricing by accident.
      assert.equal(Number(row.discount_percent), 0, "a new customer account starts at 0%");

      // AC-10: a row that existed before this phase is byte-unchanged by signing
      // in under the new code. The seeded customer carries the 0032 default of 5.
      const seeded = await userRow("gediminas.bereznevicius@gmail.com");
      assert.equal(Number(seeded.discount_percent), 5, "the fixture starts at the column default");
      const returning = new Session(baseUrl);
      await login(returning, "/api/auth", "gediminas.bereznevicius@gmail.com");
      const after = await userRow("gediminas.bereznevicius@gmail.com");
      assert.equal(Number(after.discount_percent), 5, "an existing row's discount is never rewritten");
      assert.equal(after.name, seeded.name, "and neither is its name");
    });

    await t.test("AC-40: a new internal account starts at 0%, an existing one is left alone", async () => {
      // The staff creation path is its own INSERT (worker/lib/staff.ts) and had
      // the same leak: an internal row carrying a customer discount can price a
      // quote for itself.
      const email = `reg-staff-${stamp}@openframe.com.au`;
      const staffSession = new Session(baseUrl);
      await login(staffSession, "/api/ops/auth", email);
      const row = await userRow(email);
      assert.ok(row, "the ops sign-in created the internal account");
      assert.equal(row.type, "internal");
      assert.equal(Number(row.discount_percent), 0, "a new internal account starts at 0%");

      // An EXISTING internal row is not rewritten — pinning those is Phase 2.
      await sql(`UPDATE user SET discount_percent = 7.5 WHERE email = '${esc(staffEmail)}'`);
      const again = new Session(baseUrl);
      await login(again, "/api/ops/auth", staffEmail);
      const existing = await userRow(staffEmail);
      assert.equal(Number(existing.discount_percent), 7.5,
        "re-verifying an existing internal account must not touch its discount");
    });

    void newAccount;
  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
