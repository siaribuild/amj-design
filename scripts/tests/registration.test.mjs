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
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  Session, completeAccount, freePort, login, makeRunDir, projectRoot, removeRunDir,
  run, staffEmail, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";

/** Every .ts file under worker/, for the absence assertion (AB-12). */
async function workerSources(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await workerSources(full));
    else if (entry.name.endsWith(".ts")) found.push(full);
  }
  return found;
}

test("user registration — creation values, the submission gate, and its abuse cases", { timeout: 1_800_000 }, async (t) => {
  const runDir = await makeRunDir("registration");
  const assets = join(runDir, "assets");
  const state = join(runDir, "state");
  const wranglerEnv = { CLOUDFLARE_API_TOKEN: "wrangler-local-dev-not-a-real-credential", WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") };
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

    /** A draft with one priced line, built anonymously. Returns the anon session
     *  (which holds the claim cookie) and the project id. */
    const anonDraft = async (title) => {
      const session = new Session(baseUrl);
      const saved = await session.request("/api/projects/current/lines", {
        method: "PUT",
        json: {
          title,
          items: [{
            code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
            width: "1200", height: "900", qty: 1,
            options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
            lineTotal: 1,
          }],
        },
      });
      assert.equal(saved.status, 200, "the anonymous draft was built");
      return { session, id: (await saved.json()).project.id };
    };

    const statusOf = async (projectId) =>
      (await sql(`SELECT status_customer FROM project WHERE id = '${esc(projectId)}'`))[0]?.status_customer ?? null;

    await t.test("AB-1 / AB-4 / AB-12 / AB-14: nothing without a session can submit", async () => {
      const draft = await anonDraft("AB-1 draft");

      // AB-1 — a valid claim cookie for a complete draft is a CART capability. It
      // used to be a submit capability, which is the hole this phase closes.
      const refused = await draft.session.request(`/api/projects/${draft.id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072", suburb: "Preston" } },
      });
      assert.equal(refused.status, 401, "the claim cookie cannot submit");
      assert.deepEqual(await refused.json(), { error: "unauthorized" });
      assert.equal(await statusOf(draft.id), "draft", "and nothing moved");

      // AB-12 — the deleted anonymous shape, exactly as it used to be sent.
      const oldShape = await draft.session.request(`/api/projects/${draft.id}/submit`, {
        method: "POST", json: { contact: { name: "Sam", email: "sam@example.com", postcode: "3072" } },
      });
      assert.equal(oldShape.status, 401, "the old name+email+postcode body is not an identity");
      assert.equal(await statusOf(draft.id), "draft");

      // AB-14 — no session at all, no cookie of any kind.
      const stranger = new Session(baseUrl);
      const bare = await stranger.request(`/api/projects/${draft.id}/submit`, { method: "POST", json: {} });
      assert.equal(bare.status, 401);
      assert.deepEqual(await bare.json(), { error: "unauthorized" });

      // AB-4 — a guest-tracking grant is a READ capability. Granted directly in
      // D1 against this draft so the probe tests the authorisation rule and not
      // the tracking flow's own (correct) refusal to issue one for a draft.
      const guestToken = `guest-ab4-${stamp}`;
      await sql(`INSERT INTO guest_grant (id, record_type, record_id, email, token, expires_at) VALUES ('gg-ab4-${esc(stamp)}', 'project', '${esc(draft.id)}', 'guest@example.com', '${esc(guestToken)}', datetime('now','+12 hours'))`);
      const guest = new Session(baseUrl);
      guest.cookies.set("apertly_guest", guestToken);
      const guestSubmit = await guest.request(`/api/projects/${draft.id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      assert.equal(guestSubmit.status, 401, "a tracking grant is never a submit capability");
      assert.equal(await statusOf(draft.id), "draft");
    });

    await t.test("AB-2 / AB-3 / AC-16: identity comes from the session, never the request", async () => {
      const owner = await newAccount("owner");
      await completeAccount(owner.session);
      const draft = await anonDraft("AB-2 draft");
      // The owner signs in on the anonymous session — the claim-merge bridge
      // attaches the draft, exactly as the gate does.
      await login(draft.session, "/api/auth", owner.email);

      // AB-2 — a second customer, with a real session, aiming at someone else's id.
      const attacker = await newAccount("attacker");
      await completeAccount(attacker.session);
      const crossAccount = await attacker.session.request(`/api/projects/${draft.id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      assert.equal(crossAccount.status, 404, "ownership is in the SQL, not a post-check");
      assert.deepEqual(await crossAccount.json(), { error: "not_found" },
        "and the refusal leaks no project data");
      assert.equal(await statusOf(draft.id), "draft", "B's project is unchanged");

      // AB-3 / AC-16 — the owner submits, supplying somebody else's identity.
      const submitted = await draft.session.request(`/api/projects/${draft.id}/submit`, {
        method: "POST",
        json: {
          delivery: { postcode: "3072", suburb: "Preston" },
          contact: { name: "Someone Else", email: "victim@example.com", phone: "0400 000 000" },
        },
      });
      assert.equal(submitted.status, 200, "the submission itself succeeds");
      assert.equal((await submitted.json()).status, "submitted");

      const row = (await sql(`SELECT contact_name, contact_email, contact_phone, delivery_postcode, delivery_suburb FROM project WHERE id = '${esc(draft.id)}'`))[0];
      assert.equal(row.contact_email, owner.email, "the account's email, never the body's");
      assert.notEqual(row.contact_email, "victim@example.com");
      assert.equal(row.contact_name, "Sam Taylor", "the account's name");
      assert.notEqual(row.contact_name, "Someone Else");
      assert.equal(row.contact_phone, "0412 345 678");
      assert.equal(row.delivery_postcode, "3072", "delivery IS a per-project fact and still comes from the body");
      assert.equal(row.delivery_suburb, "Preston");
      assert.equal(await userRow("victim@example.com"), null,
        "posting an email at submit does not conjure an account");
    });

    await t.test("AC-17 / AC-22 / AC-23 server floor: an incomplete account cannot submit", async () => {
      const who = await newAccount("incomplete");
      const draft = await anonDraft("incomplete draft");
      await login(draft.session, "/api/auth", who.email);

      // Nothing on the account but a verified email — the fresh-account case.
      const refused = await draft.session.request(`/api/projects/${draft.id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      assert.equal(refused.status, 400);
      const body = await refused.json();
      assert.equal(body.error, "incomplete_profile");
      assert.deepEqual(body.missing,
        ["name", "phone", "addressLine1", "addressSuburb", "addressState", "addressPostcode"],
        "every outstanding field is named");
      assert.equal(await statusOf(draft.id), "draft");

      // A stored-but-invalid phone is treated as missing, not waved through: a
      // legacy row carrying junk must be corrected at the gate, not submitted
      // around. Written straight to D1 because the profile endpoint refuses it.
      await completeAccount(draft.session);
      await sql(`UPDATE user SET phone = '12345' WHERE email = '${esc(who.email)}'`);
      const junkPhone = await draft.session.request(`/api/projects/${draft.id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      assert.equal(junkPhone.status, 400);
      assert.deepEqual((await junkPhone.json()).missing, ["phone"]);
      assert.equal(await statusOf(draft.id), "draft");

      // A service number is a valid contact phone (owner ruling Q2).
      await completeAccount(draft.session, { phone: "1300 123 456" });
      const ok = await draft.session.request(`/api/projects/${draft.id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      assert.equal(ok.status, 200, "a 1300 number is accepted");
      assert.equal(await statusOf(draft.id), "submitted");
    });
    await t.test("AB-5 / AB-6 / AB-7: the relabel changed no OTP property", async () => {
      // AB-5 — anti-enumeration. The two responses must be indistinguishable. In
      // a development env the body carries the dev code, so the comparison masks
      // the six digits and compares everything else byte for byte: status, header
      // set, key set and every other value.
      const known = "gediminas.bereznevicius@gmail.com";  // seeded account
      const unknown = `reg-nobody-${stamp}@example.com`;  // no account, ever
      const probe = async (email) => {
        const s = new Session(baseUrl);
        const response = await s.request("/api/auth/challenge", {
          method: "POST", json: { email },
          headers: { "X-Forwarded-For": `198.19.${seq % 255}.${(seq += 1) % 255}` },
        });
        const text = (await response.text()).replace(/\d{6}/g, "######");
        return { status: response.status, type: response.headers.get("content-type"), text };
      };
      const a = await probe(known);
      const b = await probe(unknown);
      assert.deepEqual(a, b, "an address with an account and one without answer identically");

      // AB-6 — the per-source cap. One source address, more than the ceiling.
      const flooded = "198.19.250.250";
      let sawRateLimit = false;
      for (let i = 0; i < 65 && !sawRateLimit; i += 1) {
        const s = new Session(baseUrl);
        const response = await s.request("/api/auth/challenge", {
          method: "POST",
          json: { email: `reg-flood-${stamp}-${i}@example.com` },
          headers: { "X-Forwarded-For": flooded },
        });
        if (response.status === 429) {
          assert.deepEqual(await response.json(), { error: "rate_limited" });
          sawRateLimit = true;
        }
      }
      assert.ok(sawRateLimit, "the per-source cap still returns 429");

      // AB-7 — wrong codes burn the challenge and the answer never says whether
      // the account exists.
      const burnEmail = freshEmail("burn");
      const burner = new Session(baseUrl);
      const challenge = await burner.request("/api/auth/challenge", {
        method: "POST", json: { email: burnEmail },
        headers: { "X-Forwarded-For": "198.19.200.7" },
      });
      const devCode = (await challenge.json()).devCode;
      assert.match(String(devCode), /^\d{6}$/);
      for (let i = 0; i < 6; i += 1) {
        const wrong = await burner.request("/api/auth/verify", {
          method: "POST", json: { email: burnEmail, code: "000000" },
        });
        assert.equal(wrong.status, 400);
        assert.deepEqual(await wrong.json(), { error: "invalid_code" },
          "the refusal never says whether the account existed");
      }
      const afterBurn = await burner.request("/api/auth/verify", {
        method: "POST", json: { email: burnEmail, code: devCode },
      });
      assert.equal(afterBurn.status, 400, "the challenge was burned, so even the right code fails");
      assert.equal(await userRow(burnEmail), null, "and no account was created");
    });

    await t.test("AC-29 / AC-30 / AC-31 / AB-8 / AB-9: the referral seam is untouched by the gate", async () => {
      // A payable referrer, provisioned straight in D1 — this file is about the
      // GATE, not about how a code is minted, and the referral suites own that.
      const referrer = await newAccount("referrer");
      const referrerId = (await userRow(referrer.email)).id;
      const code = "REG-SEA";
      await sql(`UPDATE user SET referral_code = '${code}', abn = '51824753556', payout_bsb = '063000', payout_account_number = '91234567', payout_account_name = 'Referrer Pty Ltd' WHERE id = '${esc(referrerId)}'`);

      const referralsFor = async (email) => {
        const row = await userRow(email);
        return sql(`SELECT id, code, status FROM referral WHERE referred_user_id = '${esc(row.id)}'`);
      };

      // AC-29 / AB-8 — a brand-new account created at the gate. `redirect:
      // "manual"` is load-bearing: the of_ref cookie is set on the 302 and a
      // followed redirect drops it before the jar sees it.
      const mate = new Session(baseUrl);
      const landing = await mate.request(`/r/${code}`, { redirect: "manual" });
      assert.equal(landing.status, 302);
      const mateEmail = freshEmail("mate");
      await login(mate, "/api/auth", mateEmail);
      assert.equal((await referralsFor(mateEmail)).length, 1, "exactly one referral row");
      assert.equal(mate.cookies.get("of_ref"), undefined, "the attribution cookie is cleared");

      // AB-8 second half — sign out, sign in again on a fresh link; still one.
      await mate.request("/api/auth/logout", { method: "POST" });
      const again = new Session(baseUrl);
      await again.request(`/r/${code}`, { redirect: "manual" });
      await login(again, "/api/auth", mateEmail);
      await completeAccount(again);
      assert.equal((await referralsFor(mateEmail)).length, 1, "a second sign-in attributes nothing");

      // AC-30 — an EXISTING account arriving on a link is never attributed.
      const established = await newAccount("established");
      const returning = new Session(baseUrl);
      await returning.request(`/r/${code}`, { redirect: "manual" });
      await login(returning, "/api/auth", established.email);
      assert.equal((await referralsFor(established.email)).length, 0,
        "the created branch is the only attributing branch");

      // AC-31 — attribution is never worth a sign-in. A code that resolves to
      // nobody must cost the customer nothing: they are signed in, and they can
      // submit.
      const orphan = new Session(baseUrl);
      await orphan.request("/r/ZZZ-ZZZ", { redirect: "manual" });
      const orphanEmail = freshEmail("orphan");
      const verified = await login(orphan, "/api/auth", orphanEmail);
      assert.equal(verified.body.authenticated, true, "a dud code does not cost the sign-in");
      assert.equal((await referralsFor(orphanEmail)).length, 0);
      await completeAccount(orphan);
      const orphanDraft = await anonDraft("orphan draft");
      await login(orphanDraft.session, "/api/auth", orphanEmail);
      const submitted = await orphanDraft.session.request(`/api/projects/${orphanDraft.id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" } },
      });
      assert.equal(submitted.status, 200, "and it does not cost the submission either");

      // AB-9 — a referral code posted to the gate's own endpoints is ignored.
      const smuggler = await newAccount("smuggler");
      await smuggler.session.request("/api/auth/profile", {
        method: "POST", json: { ...validDetails, referralCode: code, referral_code: code },
      });
      const smuggled = await anonDraft("smuggled draft");
      await login(smuggled.session, "/api/auth", smuggler.email);
      await smuggled.session.request(`/api/projects/${smuggled.id}/submit`, {
        method: "POST", json: { delivery: { postcode: "3072" }, referralCode: code, referral_code: code },
      });
      assert.equal((await referralsFor(smuggler.email)).length, 0,
        "no code is accepted anywhere outside the /r/<CODE> link path");
    });

    await t.test("AB-12 absence: the submit route is the ONLY writer of status_customer='submitted'", async () => {
      // Absence is the half a diff review cannot see. A second route that could
      // move a project to submitted would make every refusal above decorative,
      // and it would not show up as a failing assertion anywhere else.
      const files = await workerSources(join(projectRoot, "worker"));
      const writers = [];
      for (const file of files) {
        const source = await readFile(file, "utf8");
        // A WRITE is an assignment in a SET clause; the same text inside a WHERE
        // or an AND is a read, and there are many of those.
        if (/SET[^;]*status_customer\s*=\s*'submitted'/s.test(source)) {
          writers.push(file.slice(projectRoot.length + 1).replace(/\\/g, "/"));
        }
      }
      assert.deepEqual(writers, ["worker/routes/quote.ts"],
        "exactly one route may submit a project, and it is the session-gated one");
    });

  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
