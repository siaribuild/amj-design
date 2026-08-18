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

    const validDetails = {
      name: "Sam Taylor", phone: "0412 345 678",
      addressLine1: "12 Bridge Street", addressLine2: "Unit 4",
      addressSuburb: "Preston", addressState: "vic", addressPostcode: "3072",
    };

    await t.test("AC-18 / AB-10 / AB-11 / AB-13: the profile endpoint is the one writer, and it is narrow", async () => {
      const who = await newAccount("profile");

      // AB-14 / the endpoint's own auth self-check: no session, no data.
      const anon = new Session(baseUrl);
      const unauth = await anon.request("/api/auth/profile", { method: "POST", json: validDetails });
      assert.equal(unauth.status, 401);
      assert.deepEqual(await unauth.json(), { error: "unauthorized" });

      // The happy path stores every field, and the DTO hands them back.
      const saved = await who.session.request("/api/auth/profile", { method: "POST", json: validDetails });
      assert.equal(saved.status, 200);
      const dto = (await saved.json()).user;
      assert.equal(dto.addressLine1, "12 Bridge Street");
      assert.equal(dto.addressSuburb, "Preston");
      assert.equal(dto.addressState, "VIC", "state is stored uppercase");
      assert.equal(dto.addressPostcode, "3072");
      const row = await userRow(who.email);
      assert.equal(row.address_line1, "12 Bridge Street");
      assert.equal(row.address_state, "VIC");

      // AB-10 — mass assignment. The allowlist is what makes this structural: the
      // handler never reads these keys, so there is nothing to filter.
      const before = await userRow(who.email);
      const massAssign = await who.session.request("/api/auth/profile", {
        method: "POST",
        json: {
          addressSuburb: "Preston",
          discountPercent: 25, discount_percent: 25, type: "internal", role: "admin",
          referral_code: "AAA-BBB", id: "u_demo", email: "victim@example.com", session_epoch: 99,
        },
      });
      assert.equal(massAssign.status, 200);
      const after = await userRow(who.email);
      assert.equal(Number(after.discount_percent), Number(before.discount_percent), "discount is unwritable here");
      assert.equal(after.type, before.type);
      assert.equal(after.role, before.role);
      assert.equal(after.email, before.email, "the sign-in identity is not editable");
      assert.equal(after.session_epoch, before.session_epoch);
      // AB-9: a referral code posted as an extra body field falls on the floor.
      const referrals = await sql(`SELECT count(*) AS n FROM referral WHERE referred_user_id = '${esc(after.id)}'`);
      assert.equal(Number(referrals[0].n), 0, "no referral can be created by posting a code to a form");

      // AB-11 — no subject id exists anywhere. Neither in the body (above) nor in
      // a path: the route simply does not exist.
      const victim = await newAccount("victim");
      const victimBefore = await userRow(victim.email);
      const byPath = await who.session.request(`/api/auth/profile/${victimBefore.id}`, {
        method: "POST", json: { name: "Hijacked" },
      });
      assert.equal(byPath.status, 404, "there is no per-subject profile route to find");
      assert.equal((await userRow(victim.email)).name, victimBefore.name, "B's row is unchanged");

      // AB-13 / AC-22 / AC-23 — refused by name, not clipped, and nothing stored.
      for (const [patch, fields] of [
        [{ phone: "12345" }, ["phone"]],
        [{ addressPostcode: "307" }, ["addressPostcode"]],
        [{ addressState: "XX" }, ["addressState"]],
        [{ name: "x".repeat(100_000) }, ["name"]],
        [{ addressLine1: "x".repeat(100_000) }, ["addressLine1"]],
      ]) {
        const refused = await who.session.request("/api/auth/profile", { method: "POST", json: patch });
        assert.equal(refused.status, 400, `${JSON.stringify(patch)} must be refused`);
        const body = await refused.json();
        assert.equal(body.error, "invalid_fields");
        assert.deepEqual(body.fields, fields, "the refusal names the field");
      }
      const untouched = await userRow(who.email);
      assert.equal(untouched.name, "Sam Taylor", "a refused patch stores nothing");
      assert.equal(untouched.address_line1, "12 Bridge Street");
      assert.ok(untouched.name.length < 200, "nothing unbounded reached D1");
    });

    void newAccount;
  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
