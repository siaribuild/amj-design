// Referral program — the §10A abuse cases, as regression tests.
//
// WHY THIS FILE EXISTS, SEPARATELY FROM referral-lifecycle.test.mjs. Independent
// verification executed every criterion in spec §10A (AC-92 … AC-104) against a
// live Worker and recorded every one as correctly denied — and then the probes
// were thrown away. A control verified once and guarded by nothing is a control
// with a shelf life, and the things these criteria protect are financial PII
// (payout BSB, account number, ABN) and money leaving the business.
//
// ⚠️ EVERY TEST HERE IS AN ATTEMPT THAT MUST BE REFUSED, NOT AN ASSERTION ABOUT A
// HELPER'S RETURN VALUE. The spec is explicit and binding on this file: "A
// criterion in this section verified by code inspection alone is NOT verified.
// The forbidden action must be attempted against a running system and the denial
// recorded: status, body, and where stated, the absence of any state change."
// So the requests below are the real forbidden requests, over HTTP, against the
// real Worker, and the denial is asserted from the database as well as from the
// response — a 200 that quietly wrote nothing and a 403 that quietly wrote
// something are both failures this file has to be able to tell apart.
//
// Where the spec and docs/specs/referral-program-revision-14.md disagree, the
// register governs — see AC-98 below, whose rule was amended.
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  Session, freePort, login, makeRunDir, removeRunDir,
  run, staffEmail, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";

// AC-103's third caller has to be REAL. A manufacturer partner is defined by
// their email domain (worker/lib/staff.ts:34) and is pinned to the role on every
// sign-in, so configuring the domain is the only way to provision one through
// the sign-in path rather than by an UPDATE against a row that path never made.
const MANUFACTURER_DOMAIN = "partner.example";

// ATO published test ABNs — real check digits, no real business.
const ABN_A = "51824753556";
const ABN_B = "83914571673";

test("referral program — §10A abuse cases", { timeout: 1_800_000 }, async (t) => {
  const runDir = await makeRunDir("referral-security");
  const assets = join(runDir, "assets");
  const state = join(runDir, "state");
  const wranglerEnv = { WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") };
  let server;
  try {
    await run(process.execPath, [viteCli, "build", "--outDir", assets, "--emptyOutDir"]);
    await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "apertly-db", "--local", "--persist-to", state], { env: wranglerEnv });
    await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--file", "scripts/db/seed.sql"], { env: wranglerEnv });

    // RETRIED, deliberately. This CLI opens the same local SQLite file the running
    // Worker holds, and under load the two collide — `SQLITE_BUSY`, "database is
    // locked", or Workerd's internal error. That is a harness collision, not the
    // product refusing anything, and without this it surfaces as an abuse test
    // "failing" for a reason that has nothing to do with the abuse. Bounded, so a
    // genuinely broken statement still fails rather than looping.
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

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    server = start(process.execPath, [
      wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
      "--persist-to", state, "--assets", assets, "--log-level", "warn",
      "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:",
      "--var", "SANITY_PROJECT_ID:", "--var", "AI_EXTRACTION_MODE:manual",
      "--var", `MANUFACTURER_EMAIL_DOMAINS:${MANUFACTURER_DOMAIN}`,
    ], { env: wranglerEnv });
    await waitForUrl(`${baseUrl}/api/health`, server);

    // ONE staff session for the whole file. The OTP challenge is capped per
    // address per window, and a fresh staff login per test trips it partway
    // through — which surfaces as "no development OTP returned" and reads like a
    // broken harness rather than a rate limit doing its job.
    const staff = new Session(baseUrl);
    await login(staff, "/api/auth", staffEmail);
    const staffId = (await sql(`SELECT id FROM user WHERE email = '${esc(staffEmail)}'`))[0].id;

    let seq = 0;
    const stamp = Date.now().toString(36);
    const freshEmail = (label) => `sec-${label}-${stamp}-${seq++}@example.com`;

    /** A signed-in customer, with the id the database gave them. */
    const newAccount = async (label) => {
      const session = new Session(baseUrl);
      const email = freshEmail(label);
      await login(session, "/api/auth", email);
      const id = (await sql(`SELECT id FROM user WHERE email = '${esc(email)}'`))[0].id;
      return { session, email, id };
    };

    /** A referrer who joined the way a real one does — profile ABN, then the
     *  payout details that open the D18 gate and mint the code.
     *
     *  The bank values are UNIQUE PER ACCOUNT and deliberately so: half this file
     *  asserts that one account's digits never appear on another account's
     *  surface, and a shared fixture number would make every one of those
     *  assertions unable to fail. */
    const joinProgram = async (label, { abn = ABN_A } = {}) => {
      const who = await newAccount(label);
      const business = `Biz-${label}-${stamp}`;
      const bank = {
        bsb: "063000",
        accountNumber: `9${String(1_000_000 + seq).padStart(7, "0")}`,
        accountName: `Acct-${label}-${stamp}`,
      };
      const profile = await who.session.request("/api/auth/profile", { method: "POST", json: { abn, company: business } });
      assert.equal(profile.status, 200, `${label} could not store an ABN`);
      const saved = await who.session.request("/api/account/payout-details", { method: "PUT", json: bank });
      const gate = await saved.json();
      assert.equal(gate.referrerGate?.complete, true, `${label} did not clear the D18 gate: ${JSON.stringify(gate)}`);
      const screen = await (await who.session.request("/api/account/referrals")).json();
      assert.match(String(screen.code), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}$/,
        `${label} was not issued a code: ${JSON.stringify(screen)}`);
      return { ...who, business, abn, bank, code: screen.code };
    };

    /** A brand-new account that arrived on `code`'s link. `redirect: "manual"` is
     *  load-bearing — the attribution cookie is set on the 302, and a followed
     *  redirect drops it before the jar ever sees it. */
    const newReferredAccount = async (label, code) => {
      const session = new Session(baseUrl);
      const landing = await session.request(`/r/${code}`, { redirect: "manual" });
      assert.equal(landing.status, 302, `/r/${code} did not redirect`);
      const email = freshEmail(label);
      await login(session, "/api/auth", email);
      const id = (await sql(`SELECT id FROM user WHERE email = '${esc(email)}'`))[0].id;
      return { session, email, id };
    };

    const bankOf = async (userId) => (await sql(
      `SELECT payout_bsb, payout_account_number, payout_account_name FROM user WHERE id = '${esc(userId)}'`,
    ))[0];

    /** Every value that belongs to somebody else and must therefore never appear
     *  in a response served to the caller under test. Built from the fixture
     *  rather than listed by hand at each call site, because the one that gets
     *  forgotten is the one that leaks. */
    const secretsOf = (...parties) => parties.flatMap((p) => [
      p.id, p.email, p.code, p.business, p.bank?.accountNumber, p.bank?.accountName, p.abn,
    ].filter(Boolean));

    await t.test("AC-92/AC-95 — a tampered subject id on the referrer screen returns the caller's own data and nothing of anyone else's", async () => {
      const alpha = await joinProgram("ac92-alpha");
      const bravo = await joinProgram("ac92-bravo", { abn: ABN_B });
      const mateAlpha = await newReferredAccount("ac92-mate-alpha", alpha.code);
      const mateBravo = await newReferredAccount("ac92-mate-bravo", bravo.code);
      const alphaOwn = await (await alpha.session.request("/api/account/referrals")).json();
      assert.equal(alphaOwn.referrals.length, 1, "the caller must hold a referral of their own to be scoped to");
      // Identified by REFERRAL ID rather than by the mate's address: the screen
      // masks a referred account's email to `se****@example.com` (referrals.ts:645),
      // so matching on the address would be matching on a string the endpoint
      // deliberately never emits.
      const alphaReferralId = alphaOwn.referrals[0].id;
      assert.notEqual(alphaReferralId, undefined, "the caller's referral must be identifiable");
      void mateAlpha;

      // Guard the guard. If Bravo's screen were empty, "no value of Bravo's
      // appears in Alpha's response" would hold for a system that had lost
      // Bravo's data entirely, and the test would be passing for the wrong
      // reason on every run thereafter.
      const bravoOwn = await (await bravo.session.request("/api/account/referrals")).json();
      assert.equal(bravoOwn.code, bravo.code, "the fixture's second referrer must hold real data to leak");
      assert.equal(bravoOwn.referrals.length, 1, "the fixture's second referrer must hold a referral to leak");

      const forbidden = [...secretsOf(bravo), bravoOwn.referrals[0].id, mateBravo.email, mateBravo.id];
      const attempts = [
        [`/api/account/referrals?userId=${bravo.id}`, {}],
        [`/api/account/referrals?user_id=${bravo.id}`, {}],
        [`/api/account/referrals?email=${encodeURIComponent(bravo.email)}`, {}],
        [`/api/account/referrals?code=${bravo.code}`, {}],
        [`/api/account/referrals?referralId=${bravoOwn.referrals[0].id}`, {}],
        [`/api/account/referrals?id=${bravo.id}&subjectUserId=${bravo.id}&referrerUserId=${bravo.id}`, {}],
        // AC-95's header limb: a subject id supplied out of band rather than in
        // the query string. Same rule, different envelope.
        ["/api/account/referrals", { headers: { "X-User-Id": bravo.id } }],
      ];

      for (const [path, options] of attempts) {
        const response = await alpha.session.request(path, options);
        const text = await response.text();
        assert.equal(response.status, 200, `${path} answered ${response.status}: ${text.slice(0, 200)}`);
        for (const secret of forbidden) {
          assert.equal(text.includes(secret), false, `${path} disclosed ${secret} — a value belonging to the other account`);
        }
        // Session-scoped, NOT refused-and-empty: the criterion is that the
        // response contains only Alpha's data, and a blank body would satisfy
        // "nothing of Bravo's" while telling us nothing about the scoping.
        const body = JSON.parse(text);
        assert.equal(body.code, alpha.code, `${path} did not return the caller's own code`);
        assert.equal(body.referrals.length, 1, `${path} did not return the caller's own referral`);
        assert.equal(body.referrals[0].id, alphaReferralId,
          `${path} returned a referral that is not the caller's: ${JSON.stringify(body.referrals[0])}`);
      }
    });

    await t.test("AC-93/AC-95 — a tampered subject id on the offer panel names only the caller's own referrer", async () => {
      const alpha = await joinProgram("ac93-alpha");
      const bravo = await joinProgram("ac93-bravo", { abn: ABN_B });
      const mateAlpha = await newReferredAccount("ac93-mate-alpha", alpha.code);
      const mateBravo = await newReferredAccount("ac93-mate-bravo", bravo.code);

      // Guard the guard: the other party's panel must actually name their own
      // referrer, or "Bravo's business name is absent from Alpha's mate's
      // response" would be true of a system that had lost the offer entirely.
      const bravoOwn = await (await mateBravo.session.request("/api/account/referral-offer")).json();
      assert.equal(bravoOwn.offer?.referrerName, bravo.business, "the fixture's second mate must hold a real offer to leak");

      const forbidden = [...secretsOf(bravo), mateBravo.id, mateBravo.email];
      const attempts = [
        [`/api/account/referral-offer?userId=${mateBravo.id}`, {}],
        [`/api/account/referral-offer?user_id=${mateBravo.id}`, {}],
        [`/api/account/referral-offer?email=${encodeURIComponent(mateBravo.email)}`, {}],
        [`/api/account/referral-offer?code=${bravo.code}`, {}],
        [`/api/account/referral-offer?referralId=${mateBravo.id}&earningId=${mateBravo.id}`, {}],
        ["/api/account/referral-offer", { headers: { "X-User-Id": mateBravo.id } }],
      ];

      for (const [path, options] of attempts) {
        const response = await mateAlpha.session.request(path, options);
        const text = await response.text();
        assert.equal(response.status, 200, `${path} answered ${response.status}: ${text.slice(0, 200)}`);
        for (const secret of forbidden) {
          assert.equal(text.includes(secret), false, `${path} disclosed ${secret} — a value belonging to the other party`);
        }
        assert.equal(JSON.parse(text).offer?.referrerName, alpha.business,
          `${path} did not answer with the caller's own referrer`);
      }
    });

    await t.test("AC-94 — a payout-details write carrying someone else's id writes only the caller's row", async () => {
      const alpha = await joinProgram("ac94-alpha");
      const bravo = await joinProgram("ac94-bravo", { abn: ABN_B });
      const bravoBefore = await bankOf(bravo.id);
      const countFor = async (userId) =>
        (await sql(`SELECT COUNT(*) AS n FROM payout_details_access WHERE subject_user_id = '${esc(userId)}'`))[0].n;
      const alphaLogBefore = await countFor(alpha.id);
      const bravoLogBefore = await countFor(bravo.id);

      const hijack = { bsb: "013006", accountNumber: "87651234", accountName: `Hijack-ac94-${stamp}` };
      const response = await alpha.session.request("/api/account/payout-details", {
        method: "PUT",
        json: {
          // Every shape of "act on that account instead" the endpoint could
          // plausibly be tricked into honouring, in one body.
          userId: bravo.id, id: bravo.id, subjectUserId: bravo.id, referrerUserId: bravo.id,
          email: bravo.email, code: bravo.code,
          ...hijack,
        },
      });
      const text = await response.text();
      assert.equal(response.status, 200, `the write must be session-scoped, not refused: ${response.status} ${text.slice(0, 200)}`);

      // The caller's own row DID move. Without this the criterion could be met by
      // an endpoint that had stopped writing at all.
      assert.deepEqual(await bankOf(alpha.id), {
        payout_bsb: hijack.bsb, payout_account_number: hijack.accountNumber, payout_account_name: hijack.accountName,
      }, "the caller's own payout details were not written");
      // BYTE-UNCHANGED, compared field by field against the row read before the
      // attempt rather than against the fixture's expectations.
      assert.deepEqual(await bankOf(bravo.id), bravoBefore, "the other account's bank fields moved");
      assert.equal(
        (await sql(`SELECT COUNT(*) AS n FROM user WHERE payout_account_name = 'Hijack-ac94-${esc(stamp)}'`))[0].n, 1,
        "the hijack payload landed on more than the caller's own row",
      );

      assert.equal(await countFor(alpha.id), alphaLogBefore + 1, "the caller's write did not log exactly one access row");
      assert.equal(await countFor(bravo.id), bravoLogBefore, "the attempt logged an access row against the other account");
      const mismatched = await sql(
        `SELECT id FROM payout_details_access
          WHERE subject_user_id = '${esc(alpha.id)}' AND actor_user_id <> '${esc(alpha.id)}'`,
      );
      assert.deepEqual(mismatched, [], "actor and subject diverged on a customer's own write");
      const written = await sql(
        `SELECT action, actor_user_id, subject_user_id FROM payout_details_access
          WHERE subject_user_id = '${esc(alpha.id)}' ORDER BY at DESC, id DESC LIMIT 1`,
      );
      assert.equal(written[0].action, "change");
      assert.equal(written[0].actor_user_id, alpha.id);
      assert.equal(written[0].subject_user_id, alpha.id);
    });

    await t.test("AC-98 — /r/<CODE> tells a stranger nothing about a code's owner", async () => {
      // ⚠️ THE AMENDED RULE (docs/specs/referral-program-revision-14.md §AC-98),
      // which the register says governs where it and §10A disagree. The cookie IS
      // set for any code that exists — live or dormant — precisely so that the
      // response cannot be used to observe whether someone's banking is on file.
      // The old rule (cookie only for a payable code) would make a dormant
      // referrer's account state readable over unauthenticated HTTP, and a test
      // written to it would now be asserting the vulnerability.
      const snapshot = async (code) => {
        const response = await fetch(`${baseUrl}/r/${code}`, { redirect: "manual" });
        const body = await response.text();
        return {
          status: response.status,
          headers: [...response.headers]
            // `date` is the wall clock and `set-cookie` is compared separately
            // below, normalised — the code itself differs between two codes that
            // must otherwise be indistinguishable.
            .filter(([name]) => name !== "date" && name !== "set-cookie")
            .sort(([a], [b]) => a.localeCompare(b)),
          setCookie: (response.headers.getSetCookie?.() ?? []).map((raw) => raw.replace(/of_ref=[^;]+/, "of_ref=<CODE>")),
          body,
        };
      };

      const live = await joinProgram("ac98-live");
      const dormant = await joinProgram("ac98-dormant", { abn: ABN_B });
      const left = await dormant.session.request("/api/account/payout-details", { method: "DELETE" });
      assert.equal(left.status, 200, `the dormant fixture could not leave the program: ${await left.text()}`);
      const dormantScreen = await (await dormant.session.request("/api/account/referrals")).json();
      assert.equal(dormantScreen.code, null, "the dormant fixture is still a payable referrer");
      assert.equal(dormantScreen.retainedCode, dormant.code, "the dormant fixture's code was destroyed, so there is nothing to probe");

      // The staff-owned case. Staff hold no code at all (D18 refuses to mint one
      // into an internal row), so per revision 14 it collapses into the
      // never-existed case — and THAT is the fact worth asserting, because if a
      // staff row ever gained a code this test would be quietly testing nothing.
      const staffCodes = await sql("SELECT COUNT(*) AS n FROM user WHERE type = 'internal' AND referral_code IS NOT NULL");
      assert.equal(staffCodes[0].n, 0, "a staff account holds a referral code — the staff-owned case is no longer the not-found case");
      for (const code of ["ZZZ-ZZZ", "ZZZ-ZZY"]) {
        assert.equal((await sql(`SELECT COUNT(*) AS n FROM user WHERE referral_code = '${esc(code)}'`))[0].n, 0,
          `${code} must not exist for the never-existed case to mean anything`);
      }

      const liveShot = await snapshot(live.code);
      const dormantShot = await snapshot(dormant.code);
      const neverShot = await snapshot("ZZZ-ZZZ");
      const staffOwnedShot = await snapshot("ZZZ-ZZY");

      assert.deepEqual(dormantShot, liveShot,
        "a dormant code answers differently from a live one — the difference reports whether its owner can be paid");
      assert.deepEqual(staffOwnedShot, neverShot,
        "a staff-owned code answers differently from one that never existed");

      // Positive controls, so neither half can pass by both sides being empty.
      assert.equal(liveShot.setCookie.length, 1, "an existing code must set the attribution cookie");
      assert.match(liveShot.setCookie[0], /^of_ref=<CODE>;.*HttpOnly/, `unexpected cookie: ${liveShot.setCookie[0]}`);
      assert.deepEqual(neverShot.setCookie, [], "a code that never existed must set no cookie");
      assert.equal(liveShot.status, 302);

      // And the cookie is the ONLY difference: status, headers and body say
      // nothing about whether the code exists, who owns it, or why.
      assert.deepEqual({ ...liveShot, setCookie: [] }, { ...neverShot, setCookie: [] },
        "the response body or headers differ between a real code and an invented one");
    });

    await t.test("AC-100 — a payout write cannot land without its access-log row, proved by making the log insert fail", async () => {
      const who = await joinProgram("ac100");
      const baseline = await bankOf(who.id);
      const logRows = await sql(
        `SELECT action, actor_user_id, subject_user_id FROM payout_details_access WHERE subject_user_id = '${esc(who.id)}'`,
      );
      // Limb 1 — the happy path always writes both halves.
      assert.equal(logRows.length, 1, "storing payout details must write exactly one access row");
      assert.equal(logRows[0].action, "change");
      assert.equal(baseline.payout_account_number, who.bank.accountNumber);

      // Limb 2 — the only limb that actually proves the batch. Everything else
      // shows the two rows arriving together, which a pair of sequential writes
      // would also show. Removing the log table makes the INSERT half fail, and
      // the question is whether the UPDATE half survives it.
      let status = 0;
      let threw = "";
      await sql("ALTER TABLE payout_details_access RENAME TO payout_details_access_hidden");
      try {
        const response = await who.session.request("/api/account/payout-details", {
          method: "PUT",
          json: { bsb: "013006", accountNumber: "99998888", accountName: `Unlogged-${stamp}` },
        });
        status = response.status;
        await response.text();
      } catch (error) {
        threw = String(error);
      } finally {
        // ALWAYS, or every test after this one runs against a database with no
        // access log and quietly stops testing the thing it was written for.
        await sql("ALTER TABLE payout_details_access_hidden RENAME TO payout_details_access");
      }

      assert.equal(status >= 500 || threw !== "", true,
        `the write must fail with its log: status ${status} ${threw}`);
      assert.deepEqual(await bankOf(who.id), baseline,
        "the payout details were stored even though the access-log row could not be — an unlogged change to a bank account");
      assert.equal(
        (await sql(`SELECT COUNT(*) AS n FROM user WHERE payout_account_name = 'Unlogged-${esc(stamp)}'`))[0].n, 0,
        "the unlogged payload landed on some row",
      );
      // The log is back, and no row appeared for the attempt.
      assert.equal(
        (await sql(`SELECT COUNT(*) AS n FROM payout_details_access WHERE subject_user_id = '${esc(who.id)}'`))[0].n, 1,
        "the restored log gained a row for a write that did not happen",
      );
    });

    /** A referrer with money owed to them, without driving a whole order through
     *  the pipeline.
     *
     *  ⚠️ THE EARNING IS SEEDED, THE BANKING IS NOT. What these tests exercise is
     *  the READ path — who may see a bank account, and whether seeing it is
     *  recorded — and that path reads `user`, which was written for real through
     *  the payout-details endpoint by joinProgram. How an earning came to be
     *  confirmed is the lifecycle suite's subject and is asserted there against
     *  real orders; re-driving eight ops actions per fixture here would buy this
     *  file nothing and cost it minutes per node. */
    const owedReferrer = async (label, { amount = 200, status = "confirmed", daysWaiting = 1, abn = ABN_A } = {}) => {
      const referrer = await joinProgram(label, { abn });
      const mate = await newReferredAccount(`${label}-mate`, referrer.code);
      const referral = await sql(`SELECT id FROM referral WHERE referred_user_id = '${esc(mate.id)}'`);
      assert.equal(referral.length, 1, `${label}'s referral was not recorded, so there is nothing to owe on`);
      const earningId = `e-${stamp}-${seq++}`;
      await sql(
        `INSERT INTO referral_earning
           (id, referral_id, order_id, base_amount, rate_percent, amount, status, confirmed_at)
         VALUES ('${esc(earningId)}', '${esc(referral[0].id)}', 'o-${esc(earningId)}', ${amount * 100}, 1, ${amount},
                 '${esc(status)}', datetime('now', '-${Number(daysWaiting)} days'))`,
      );
      return { ...referrer, mate, referralId: referral[0].id, earningId, amount };
    };

    await t.test("AC-102 — bank values appear on the payouts queue and its CSV, and on no other surface", async () => {
      const referrer = await owedReferrer("ac102");
      const { bsb, accountNumber } = referrer.bank;

      // (c) the referrer's OWN screen — the surface most likely to be argued into
      // showing "their own" details in full.
      const own = await (await referrer.session.request("/api/account/referrals")).text();
      assert.equal(own.includes(accountNumber), false, "the referrer's own screen carried their full account number");
      assert.equal(own.includes(bsb), false, "the referrer's own screen carried an unmasked BSB");
      const ownJson = JSON.parse(own);
      assert.equal(ownJson.payout.accountMasked, `${"*".repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}`,
        "the referrer's own screen showed no masked account at all — the check above passed vacuously");
      assert.equal(ownJson.payout.bsbMasked, "063-***");

      // (b) the ops referrals list, and the payout history beside it.
      for (const path of ["/api/ops/referrals", "/api/ops/referrals/payouts/history"]) {
        const text = await (await staff.request(path)).text();
        assert.equal(text.includes(accountNumber), false, `${path} carried a full account number`);
        assert.equal(text.includes(bsb), false, `${path} carried an unmasked BSB`);
      }

      // The two surfaces that DO — without which every assertion above could be
      // satisfied by a feature that had simply stopped storing bank details.
      const queue = await (await staff.request("/api/ops/referrals/payouts")).json();
      const group = [...queue.ready, ...queue.accruing].find((g) => g.userId === referrer.id);
      assert.equal(group?.accountNumber, accountNumber, "the payouts queue did not carry the unmasked account number");
      assert.equal(group?.bsb, bsb, "the payouts queue did not carry the unmasked BSB");

      const csv = await (await staff.request("/api/ops/referrals/payouts/export.csv")).text();
      assert.equal(csv.includes(accountNumber), true, "the CSV export did not carry the unmasked account number");
      assert.equal(csv.includes(bsb), true, "the CSV export did not carry the unmasked BSB");
    });

    await t.test("AC-104 — each unmasked staff read is recorded against the staff member and the referrer", async () => {
      const referrer = await owedReferrer("ac104");
      const views = async () => sql(
        `SELECT actor_user_id, subject_user_id, action, context FROM payout_details_access
          WHERE subject_user_id = '${esc(referrer.id)}' AND action = 'view' ORDER BY at, id`,
      );
      assert.deepEqual(await views(), [], "the fixture starts with no staff read against it");

      const queue = await (await staff.request("/api/ops/referrals/payouts")).json();
      assert.equal([...queue.ready, ...queue.accruing].some((g) => g.userId === referrer.id), true,
        "the referrer was not in the run, so nothing of theirs was actually read");
      const afterQueue = await views();
      assert.equal(afterQueue.length, 1, "opening the payouts queue did not record the read");
      assert.equal(afterQueue[0].actor_user_id, staffId, "the read was not attributed to the staff member who made it");
      assert.equal(afterQueue[0].subject_user_id, referrer.id, "the read was not attributed to the referrer whose details were shown");
      assert.notEqual(afterQueue[0].actor_user_id, afterQueue[0].subject_user_id, "actor and subject must diverge on a staff read");
      // The surface is recorded too: "who downloaded everyone's banking" is a
      // different question from "who opened the run", and one context value for
      // both would make them unanswerable apart.
      assert.equal(afterQueue[0].context, "ops_payouts");

      const csv = await (await staff.request("/api/ops/referrals/payouts/export.csv")).text();
      assert.equal(csv.includes(referrer.bank.accountNumber), true, "the export returned nothing of this referrer's to record");
      const afterCsv = await views();
      assert.equal(afterCsv.length, 2, "exporting the CSV did not record the read");
      assert.equal(afterCsv[1].context, "ops_csv");
      assert.equal(afterCsv[1].actor_user_id, staffId);
      assert.equal(afterCsv[1].subject_user_id, referrer.id);

      for (const row of afterCsv) {
        for (const secret of [referrer.bank.bsb, referrer.bank.accountNumber, referrer.bank.accountName, referrer.abn]) {
          assert.equal(JSON.stringify(row).includes(secret), false, `a view row carried ${secret}`);
        }
      }
    });

    await t.test("AC-103 — the ops referral endpoints refuse an anonymous caller, a customer, and a real manufacturer partner", async () => {
      const referrer = await owedReferrer("ac103");
      const target = await newAccount("ac103-target");
      const customer = await newAccount("ac103-customer");

      // A REAL PARTNER, provisioned through the console's own sign-in. Demoting a
      // staff row with an UPDATE would test the gate against a row the sign-in
      // path never produces — and the sign-in path is where the role is pinned
      // (worker/lib/staff.ts:93).
      const partner = new Session(baseUrl);
      const partnerEmail = `partner-${stamp}@${MANUFACTURER_DOMAIN}`;
      const partnerHeaders = { "X-Forwarded-For": `198.19.0.${(seq++ % 250) + 1}` };
      const challenge = await partner.request("/api/ops/auth/challenge", {
        method: "POST", json: { email: partnerEmail }, headers: partnerHeaders,
      });
      const { devCode } = await challenge.json();
      assert.match(String(devCode ?? ""), /^\d{6}$/, "the manufacturer domain was not accepted by the ops sign-in");
      const verified = await partner.request("/api/ops/auth/verify", {
        method: "POST", json: { email: partnerEmail, code: devCode }, headers: partnerHeaders,
      });
      assert.equal(verified.status, 200, `the partner could not sign in: ${await verified.text()}`);
      const partnerRow = (await sql(`SELECT type, role FROM user WHERE email = '${esc(partnerEmail)}'`))[0];
      assert.deepEqual(partnerRow, { type: "internal", role: "manufacturer" },
        "the fixture is not a manufacturer partner, so this test is not the case AC-103 names");

      const programBefore = (await sql("SELECT * FROM referral_program WHERE id = 'default'"))[0];
      const viewsBefore = (await sql("SELECT COUNT(*) AS n FROM payout_details_access WHERE action = 'view'"))[0].n;

      const calls = [
        ["GET", "/api/ops/referrals/payouts", null],
        ["GET", "/api/ops/referrals/payouts/history", null],
        ["GET", "/api/ops/referrals/payouts/export.csv", null],
        ["GET", "/api/ops/referrals", null],
        ["GET", "/api/ops/referrals/program", null],
        ["PUT", "/api/ops/referrals/program", { active: false, ratePercent: 99 }],
        ["POST", "/api/ops/referrals/link", { email: target.email, code: referrer.code }],
        ["POST", "/api/ops/referrals/payouts/mark-paid", { userIds: [referrer.id], reference: `THEFT-${stamp}` }],
        ["POST", `/api/ops/referrals/${referrer.referralId}/void`, { reason: `theft ${stamp}` }],
        ["POST", `/api/ops/referrals/${referrer.referralId}/unvoid`, {}],
        ["POST", `/api/ops/referrals/payouts/no-such-payout-${stamp}/failed`, { note: "x" }],
      ];

      for (const [who, session] of [["anonymous", new Session(baseUrl)], ["customer", customer.session], ["manufacturer", partner]]) {
        for (const [method, path, json] of calls) {
          const response = await session.request(path, json ? { method, json } : { method });
          const text = await response.text();
          // 403 SPECIFICALLY, not merely ">= 400". A mistyped path 404s, and a
          // test that accepted any error status would report a gate as working
          // while pointing at a route that does not exist.
          assert.equal(response.status, 403,
            `${who} ${method} ${path} must be refused with 403, got ${response.status}: ${text.slice(0, 200)}`);
          for (const secret of [referrer.bank.bsb, referrer.bank.accountNumber, referrer.bank.accountName, referrer.business, referrer.code, referrer.abn]) {
            assert.equal(text.includes(secret), false, `${who} ${method} ${path} disclosed ${secret} in its refusal`);
          }
        }
      }

      // "And no state changes" — the half a status-code sweep cannot see.
      assert.deepEqual((await sql("SELECT * FROM referral_program WHERE id = 'default'"))[0], programBefore,
        "a refused caller changed the program configuration");
      assert.equal((await sql(`SELECT status FROM referral WHERE id = '${esc(referrer.referralId)}'`))[0].status, "recorded",
        "a refused caller voided a referral");
      assert.equal((await sql(`SELECT COUNT(*) AS n FROM referral WHERE referred_user_id = '${esc(target.id)}'`))[0].n, 0,
        "a refused caller linked a code to an account");
      assert.equal((await sql(`SELECT COUNT(*) AS n FROM referral_payout WHERE referrer_user_id = '${esc(referrer.id)}'`))[0].n, 0,
        "a refused caller recorded a payout");
      assert.equal((await sql("SELECT COUNT(*) AS n FROM payout_details_access WHERE action = 'view'"))[0].n, viewsBefore,
        "a refused caller's read reached the one function that returns unmasked banking");
    });

    await t.test("payout tampering — mark-paid with smuggled earning ids pays only what is legitimately owed", async () => {
      const payee = await owedReferrer("mp-payee", { amount: 200 });
      const other = await owedReferrer("mp-other", { amount: 500, abn: ABN_B });

      // The same referrer's OTHER money, in every state that must not move. One
      // earning per referral is a schema constraint (migration 0052), so each
      // needs a mate of its own — which is also what makes them real rows rather
      // than a shape invented for the test.
      const priorPayoutId = `p-prior-${stamp}`;
      await sql(
        `INSERT INTO referral_payout (id, referrer_user_id, amount, status, reference, paid_at, paid_by)
         VALUES ('${esc(priorPayoutId)}', '${esc(payee.id)}', 75, 'paid', 'EARLIER-${esc(stamp)}', datetime('now','-30 days'), '${esc(staffId)}')`,
      );
      const untouchable = {};
      for (const [state, extra] of [
        ["pending", "'pending', NULL, NULL"],
        ["void", "'void', NULL, NULL"],
        ["paid", `'paid', '${esc(priorPayoutId)}', datetime('now','-31 days')`],
      ]) {
        const mate = await newReferredAccount(`mp-${state}`, payee.code);
        const referralId = (await sql(`SELECT id FROM referral WHERE referred_user_id = '${esc(mate.id)}'`))[0].id;
        const id = `e-${state}-${stamp}`;
        await sql(
          `INSERT INTO referral_earning
             (id, referral_id, order_id, base_amount, rate_percent, amount, status, payout_id, confirmed_at)
           VALUES ('${esc(id)}', '${esc(referralId)}', 'o-${esc(id)}', 7500, 1, 75, ${extra})`,
        );
        untouchable[state] = id;
      }

      const stateOf = async (earningId) => (await sql(
        `SELECT status, payout_id FROM referral_earning WHERE id = '${esc(earningId)}'`,
      ))[0];
      const before = {
        pending: await stateOf(untouchable.pending),
        void: await stateOf(untouchable.void),
        paid: await stateOf(untouchable.paid),
        other: await stateOf(other.earningId),
      };

      const response = await staff.request("/api/ops/referrals/payouts/mark-paid", {
        method: "POST",
        json: {
          userIds: [payee.id],
          reference: `RUN-${stamp}`,
          // Every plausible name for "and pay these too", carrying money that is
          // not payable and money that belongs to somebody else.
          earningIds: [untouchable.pending, untouchable.void, untouchable.paid, other.earningId],
          earnings: [untouchable.pending, other.earningId],
          ids: [other.earningId],
          payeeUserIds: [other.id],
        },
      });
      const body = await response.json();
      assert.equal(response.status, 200, `the legitimate half of the run must succeed: ${JSON.stringify(body)}`);

      // What was owed, and only that.
      assert.equal(body.paid.length, 1, `the run paid more than the one referrer named: ${JSON.stringify(body.paid)}`);
      assert.equal(body.paid[0].userId, payee.id);
      assert.equal(body.paid[0].amount, payee.amount, "the run paid an amount other than the confirmed balance");

      const payouts = await sql(
        `SELECT id, amount, status, reference FROM referral_payout
          WHERE referrer_user_id = '${esc(payee.id)}' AND reference = 'RUN-${esc(stamp)}'`,
      );
      assert.equal(payouts.length, 1, "the run wrote more than one payout row for the referrer");
      assert.equal(payouts[0].amount, payee.amount, "the payout row claims an amount that was not owed");
      assert.deepEqual(await stateOf(payee.earningId), { status: "paid", payout_id: payouts[0].id },
        "the legitimately owed earning was not attached to the payout");

      // And nothing else moved.
      assert.deepEqual(await stateOf(untouchable.pending), before.pending, "money not yet payable was paid");
      assert.deepEqual(await stateOf(untouchable.void), before.void, "voided money was paid");
      assert.deepEqual(await stateOf(untouchable.paid), before.paid, "money already paid was re-attached and paid twice");
      assert.deepEqual(await stateOf(other.earningId), before.other, "another referrer's money was paid into this run");
      assert.equal(
        (await sql(`SELECT COUNT(*) AS n FROM referral_payout WHERE referrer_user_id = '${esc(other.id)}'`))[0].n, 0,
        "a payout row was written for a referrer the run never named",
      );
    });

    await t.test("AC-88 — money held under the threshold for 334 days is force-promoted into the payable run", async () => {
      // The compliance control behind the Victorian twelve-month unclaimed-money
      // rule: the long stop fires a clear month early. It is built, and until now
      // no test touched it — `min_payout_balance` ships at 0, so the state it
      // guards only exists once somebody deliberately turns the threshold on.
      const setThreshold = async (value) => {
        const current = await (await staff.request("/api/ops/referrals/program")).json();
        const saved = await staff.request("/api/ops/referrals/program", {
          method: "PUT", json: { minPayoutBalance: value, expectedVersion: current.version },
        });
        assert.equal(saved.status, 200, `the threshold could not be set to ${value}: ${await saved.text()}`);
      };

      const held = await owedReferrer("ac88-held", { amount: 200, daysWaiting: 340 });
      const edge = await owedReferrer("ac88-edge", { amount: 200, daysWaiting: 333, abn: ABN_B });
      const recent = await owedReferrer("ac88-recent", { amount: 200, daysWaiting: 2 });

      await setThreshold(1000);
      try {
        const queue = await (await staff.request("/api/ops/referrals/payouts")).json();
        const inReady = (id) => queue.ready.find((g) => g.userId === id);
        const inAccruing = (id) => queue.accruing.find((g) => g.userId === id);

        const promoted = inReady(held.id);
        assert.notEqual(promoted, undefined,
          `money waiting 340 days under the threshold stayed out of the run: ${JSON.stringify(queue.accruing.map((g) => g.userId))}`);
        assert.equal(promoted.forcedByLongStop, true, "the promoted group is not flagged as forced, so nobody is told why it is payable");
        assert.equal(promoted.amount, held.amount, "the promoted group carries an amount other than what is owed");
        assert.equal(promoted.daysWaiting >= 334, true, `daysWaiting reads ${promoted.daysWaiting}`);
        assert.equal(queue.readyTotal >= held.amount, true, "the run's total excludes the force-promoted money it is about to pay");

        // The boundary, from the other side. Without these the test would pass
        // against an implementation that had simply stopped applying the
        // threshold at all — which is the same screen with the control removed.
        assert.equal(inReady(edge.id), undefined, "money one day short of the long stop was promoted anyway");
        assert.equal(inAccruing(edge.id)?.forcedByLongStop, undefined, "a group still accruing is flagged as forced");
        assert.equal(inReady(recent.id), undefined, "money under the threshold and freshly confirmed was promoted");
        assert.notEqual(inAccruing(recent.id), undefined, "freshly confirmed money under the threshold left the queue entirely");
      } finally {
        // The threshold is global. Leaving it raised would silently change what
        // every later reader of the queue sees.
        await setThreshold(0);
      }
    });

    await t.test("AC-96 — every account referral endpoint refuses an anonymous or tampered caller, and writes nothing", async () => {
      const referrer = await joinProgram("ac96");
      const logBefore = (await sql("SELECT COUNT(*) AS n FROM payout_details_access"))[0].n;
      const bankBefore = await bankOf(referrer.id);

      const anonymous = new Session(baseUrl);
      const tampered = new Session(baseUrl);
      // A forged token, not a missing one: "no cookie" and "a cookie that does
      // not resolve" are different code paths, and only one of them was ever the
      // obvious case to write.
      tampered.cookies.set("apertly_session", `forged-${stamp}`);

      const calls = [
        ["GET", "/api/account/referrals", null],
        ["PUT", "/api/account/payout-details", { bsb: "013006", accountNumber: "87654321", accountName: `Hijack-${stamp}` }],
        ["GET", "/api/account/referral-offer", null],
      ];
      for (const [who, session] of [["anonymous", anonymous], ["tampered-cookie", tampered]]) {
        for (const [method, path, json] of calls) {
          const response = await session.request(path, json ? { method, json } : { method });
          const text = await response.text();
          assert.equal(response.status, 401,
            `${who} ${method} ${path} must be refused with 401, got ${response.status}: ${text.slice(0, 200)}`);
          for (const secret of [referrer.code, referrer.email, referrer.business, referrer.bank.accountNumber, referrer.bank.accountName]) {
            assert.equal(text.includes(secret), false, `${who} ${method} ${path} disclosed ${secret}`);
          }
        }
      }

      // "No row is created or modified" is half the criterion, and it is the half
      // a status-code-only test cannot see.
      assert.equal((await sql("SELECT COUNT(*) AS n FROM payout_details_access"))[0].n, logBefore,
        "a refused call wrote a payout_details_access row");
      assert.deepEqual(await bankOf(referrer.id), bankBefore,
        "a refused call changed a stored bank detail");
      assert.equal(
        (await sql(`SELECT COUNT(*) AS n FROM user WHERE payout_account_name = 'Hijack-${esc(stamp)}'`))[0].n, 0,
        "the anonymous PUT's payload landed on somebody's row",
      );
    });

    await t.test("AC-101 — the access log never becomes a second copy of the data", async () => {
      // LAST ON PURPOSE, so it runs over everything every node above wrote. The
      // schema-level half of this criterion is already covered in
      // referral-lifecycle.test.mjs; what is left is that a permissive `context`
      // could carry at runtime what the DDL does not forbid, and the value it
      // would carry is whatever the write that produced the row had in hand.
      // ONE QUERY PER COLUMN, not one UNION of seven. D1's local engine refuses a
      // compound SELECT past six terms — "too many terms in compound SELECT" — and
      // it is a static parser limit, so the union form failed on an empty database
      // as readily as a full one. Seven round trips against a test database costs
      // nothing; a query that cannot parse costs the whole assertion.
      const SECRET_COLUMNS = [
        ["user", "payout_bsb"],
        ["user", "payout_account_number"],
        ["user", "payout_account_name"],
        ["user", "abn"],
        ["referral_payout", "bsb"],
        ["referral_payout", "account_number"],
        ["referral_payout", "account_name"],
      ];
      const secrets = [];
      for (const [table, column] of SECRET_COLUMNS) {
        const rows = await sql(
          `SELECT DISTINCT ${column} AS v FROM "${table}"`
          + ` WHERE ${column} IS NOT NULL AND trim(${column}) <> ''`,
        );
        for (const row of rows) secrets.push(String(row.v));
      }
      // Read out of the database rather than listed from the fixtures, so a value
      // a future test stores is covered without anyone remembering to add it —
      // and guarded, because an empty list would make the loop below vacuous.
      assert.equal(secrets.length > 5, true, `only ${secrets.length} stored bank values to look for`);

      const rows = await sql("SELECT id, subject_user_id, actor_user_id, action, context FROM payout_details_access");
      assert.equal(rows.length > 5, true, `only ${rows.length} access rows to inspect`);
      assert.equal(rows.some((row) => row.action === "view"), true, "no staff read is represented in the log");
      assert.equal(rows.some((row) => row.action === "change"), true, "no customer write is represented in the log");

      for (const row of rows) {
        const context = String(row.context ?? "");
        for (const secret of secrets) {
          assert.equal(context.includes(secret), false, `payout_details_access.context carried ${secret}`);
        }
        // The masked fingerprint keeps a BSB's first three digits and an account's
        // last four. Anything longer is a real number that got through.
        assert.equal(/\d{5,}/.test(context), false, `payout_details_access.context carried a run of digits: ${context}`);
        assert.equal(["view", "change"].includes(row.action), true, `unexpected action ${row.action}`);
      }

      // The remaining columns hold ids, and the honest way to say "no bank value
      // hides in an id column" is to show that every value in them resolves to a
      // real person — a smuggled account number would not.
      const dangling = await sql(
        "SELECT a.id FROM payout_details_access a"
        + " LEFT JOIN user s ON s.id = a.subject_user_id LEFT JOIN user t ON t.id = a.actor_user_id"
        + " WHERE s.id IS NULL OR t.id IS NULL",
      );
      assert.deepEqual(dangling, [], "an access row names a subject or actor that is not a user");
    });
  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
