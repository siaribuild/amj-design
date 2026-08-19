// User registration — Phase 2: trade verification (ABN / ABR).
//
// Spec: docs/specs/user-registration-phase-2.md (AC-P2-20…53, AB-P2-1…16).
// Design: docs/specs/user-registration-phase-2-design.md §11.1.
//
// ⚠️ THE ABUSE CASES HERE ARE ATTEMPTS THAT MUST BE REFUSED, not assertions
// about a helper's return value. The forbidden request is made over HTTP against
// a real Worker and the denial is asserted from the response AND from D1 — a 200
// that wrote nothing and a 403 that quietly wrote something are different
// failures and this file has to be able to tell them apart.
//
// NO TEST IN THIS FILE MAY REACH THE REAL ABR. Every lookup goes to
// scripts/tests/abr-stub.mjs through the ABR_BASE_URL seam, and the stub's hit
// counter is itself an assertion surface: "made no ABR call" is a claim this
// suite can prove rather than infer.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  COMPLETE_ACCOUNT, Session, completeAccount, freePort, login, makeRunDir, projectRoot, removeRunDir, requestJson,
  run, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";
import { ABR_FIXTURES, spareBusiness, startAbrStub } from "./abr-stub.mjs";

const MANUFACTURER_DOMAIN = "partner.example";

test("lookupAbn: the one module that knows ABR exists (design §4)", async (t) => {
  const runDir = await makeRunDir("abr-client");
  const outfile = join(runDir, "abr.mjs");
  await build({
    stdin: {
      contents: `export { lookupAbn } from ${JSON.stringify(join(projectRoot, "worker/lib/abr.ts"))};`,
      resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
    },
    bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  });
  const { lookupAbn } = await import(pathToFileURL(outfile).href);

  const stub = await startAbrStub();
  const env = { ABR_BASE_URL: stub.baseUrl, ABR_GUID: "test-guid-do-not-log" };
  try {
    // An active ABN: the register's entity name AND its trading names come back,
    // because criterion 2 has to consider all of them (E-P2-3).
    const active = await lookupAbn(env, ABR_FIXTURES.active);
    assert.equal(active.outcome, "found");
    assert.equal(active.abnActive, true);
    assert.equal(active.entityName, "SMITH BROTHERS PTY LTD");
    assert.deepEqual(active.businessNames, ["SMITH BROS", "SMITH BROS CONSTRUCTIONS"]);
    assert.equal(active.abnStatusEffectiveFrom, "2014-07-01");
    assert.ok(active.queriedAt, "the lookup timestamp is part of the frozen evidence");

    // A cancelled ABN is FOUND and inactive — not "not found". The distinction is
    // what lets the queue reason say abn_inactive rather than abn_not_found.
    const cancelled = await lookupAbn(env, ABR_FIXTURES.cancelled);
    assert.equal(cancelled.outcome, "found");
    assert.equal(cancelled.abnActive, false);

    // E-P2-4: a GST-only / branch variation is Active and passes. GST
    // registration is not a criterion and is not even read.
    const gstOnly = await lookupAbn(env, ABR_FIXTURES.activeNoGst);
    assert.equal(gstOnly.outcome, "found");
    assert.equal(gstOnly.abnActive, true);

    // The register answered "no such ABN".
    assert.equal((await lookupAbn(env, ABR_FIXTURES.notFound)).outcome, "not_found");

    // Everything that is not an answer is `unavailable` — one outcome, because
    // the engine's response to all of them is identical: queue it (D3).
    assert.equal((await lookupAbn(env, ABR_FIXTURES.serverError)).outcome, "unavailable");
    assert.equal((await lookupAbn(env, ABR_FIXTURES.malformed)).outcome, "unavailable");

    // ABR is outside the trust boundary: a hostile response cannot balloon a row.
    const huge = await lookupAbn(env, ABR_FIXTURES.oversized);
    assert.equal(huge.outcome, "found");
    assert.ok(huge.entityName.length <= 300, "entity name is clamped");
    assert.ok(huge.businessNames.length <= 20, "the trading-name list is capped");
    for (const n of huge.businessNames) assert.ok(n.length <= 300, "each trading name is clamped");

    // AB-P2-8: the credential is never anywhere a caller can see it.
    for (const r of [active, cancelled, huge]) {
      assert.ok(!JSON.stringify(r).includes("test-guid-do-not-log"), "the GUID never reaches a result");
    }
    // ...but it IS sent to the register, or the call would not be authorised.
    assert.equal(stub.hits().every((h) => h.hasGuid), true);

    // E-P2-18: no GUID configured ⇒ unavailable, and NO request is made at all.
    const before = stub.hits().length;
    const noGuid = await lookupAbn({ ABR_BASE_URL: stub.baseUrl }, ABR_FIXTURES.active);
    assert.equal(noGuid.outcome, "unavailable");
    assert.equal(stub.hits().length, before, "a missing GUID spends no ABR call");

    // ASSUMED: P2-ARCH-2 — one attempt, 5s deadline, no retry. The stub holds
    // this request open past the deadline; the client must give up on its own
    // and must not try again.
    await t.test("a slow register times out at 5s, once", async () => {
      const at = Date.now();
      const slow = await lookupAbn(env, ABR_FIXTURES.slow);
      const elapsed = Date.now() - at;
      assert.equal(slow.outcome, "unavailable");
      assert.ok(elapsed >= 4_500 && elapsed < 9_000, `gave up after ${elapsed}ms — one 5s attempt, not a retry`);
      assert.equal(stub.hits().filter((h) => h.abn === ABR_FIXTURES.slow).length, 1, "no retry");
    });
  } finally {
    await stub.close();
    await removeRunDir(runDir);
  }
});

// ── The engine, over HTTP, against a real Worker ────────────────────────────
//
// Runs against `wrangler dev` with the ABR stub wired in through ABR_BASE_URL.
// Decisions are asserted from D1 as well as from the response, because a 200
// that wrote nothing and a 200 that wrote the wrong thing are different failures.
test("trade verification — the decision, the grant, and its abuse cases", { timeout: 1_800_000 }, async (t) => {
  const runDir = await makeRunDir("trade");
  const assets = join(runDir, "assets");
  const state = join(runDir, "state");
  const wranglerEnv = { WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") };
  let server;
  let stub;
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
    const userRow = async (email) => (await sql(`SELECT * FROM user WHERE email = '${esc(email)}'`))[0] ?? null;
    const applications = async (email) => sql(
      `SELECT t.* FROM trade_application t JOIN user u ON u.id = t.user_id WHERE u.email = '${esc(email)}' ORDER BY t.created_at, t.rowid`,
    );

    stub = await startAbrStub();
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    server = start(process.execPath, [
      wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
      "--persist-to", state, "--assets", assets, "--log-level", "warn",
      "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:",
      "--var", "SANITY_PROJECT_ID:", "--var", "AI_EXTRACTION_MODE:manual",
      "--var", `ABR_BASE_URL:${stub.baseUrl}`, "--var", "ABR_GUID:test-guid-do-not-log",
      // A manufacturer partner has to be REAL to be refused for the right
      // reason: the role is derived from the email domain on every sign-in
      // (worker/lib/staff.ts), so configuring the domain is the only way to
      // provision one through the path that actually mints them.
      "--var", `MANUFACTURER_EMAIL_DOMAINS:${MANUFACTURER_DOMAIN}`,
    ], { env: wranglerEnv });
    await waitForUrl(`${baseUrl}/api/health`, server);

    let seq = 0;
    const stamp = Date.now().toString(36);
    // Every account gets its own address: the per-recipient OTP cap is 5 per 15
    // minutes and a shared address silently exhausts it (handover §4.2).
    const freshEmail = (label, domain = "example.com") => `tv-${label}-${stamp}-${seq++}@${domain}`;
    const newAccount = async (label, domain) => {
      const session = new Session(baseUrl);
      const email = freshEmail(label, domain);
      await login(session, "/api/auth", email);
      return { session, email };
    };
    // Every probe gets its OWN source address unless it says otherwise. The
    // per-IP application cap is real (20/hour) and a suite that shared one
    // bucket would start 429-ing partway through — a failure that reads as a
    // broken decision engine rather than as a working control. Documentation
    // range 198.51.100.0/24 and friends, so these can never be a real client.
    let probeSource = 0;
    const testIp = () => {
      const n = probeSource++;
      return `198.51.${(n >> 8) & 255}.${n & 255}`;
    };
    const apply = (session, json, ip) => session.request("/api/trade/application", {
      method: "POST", json, headers: { "X-Forwarded-For": ip ?? testIp() },
    });

    await t.test("AC-P2-20/21/22/23/27: the triple decides, and every queued answer is the same answer", async () => {
      // ALL THREE CRITERIA PASS — approved with no ops action and no queue item.
      const auto = await newAccount("auto", "smithbros.com.au");
      const autoRes = await apply(auto.session, {
        abn: ABR_FIXTURES.active, businessName: "Smith Brothers Pty Ltd", source: "trade_page",
      });
      assert.equal(autoRes.status, 200);
      const autoApps = await applications(auto.email);
      // The reason (if any) is carried into the message on purpose: "expected
      // verified, got under_review" is not a diagnosis, and the reason lives in
      // D1 rather than in the deliberately constant response body.
      assert.deepEqual(await autoRes.clone().json(), { ok: true, status: "verified" },
        `auto-pass queued instead. reasons=${autoApps[0]?.queue_reasons} snapshot=${autoApps[0]?.abr_snapshot}`);

      assert.equal(autoApps.length, 1, "exactly one application row");
      assert.equal(autoApps[0].status, "approved");
      assert.equal(autoApps[0].decided_via, "auto");
      assert.equal(autoApps[0].decided_by, null, "an auto-pass has no deciding staff member");
      assert.equal(JSON.parse(autoApps[0].queue_reasons ?? "[]").length, 0, "AC-P2-20: no queue item");
      assert.equal(autoApps[0].abn, ABR_FIXTURES.active, "the submitted ABN is frozen on the application");
      assert.ok(JSON.parse(autoApps[0].abr_snapshot).evaluated, "the ABR snapshot is frozen evidence (AC-P2-26)");
      const autoUser = await userRow(auto.email);
      assert.equal(Number(autoUser.discount_percent), 5, "AC-P2-28: the business-account default is applied");
      assert.equal(autoUser.abn, ABR_FIXTURES.active);

      // ONE CRITERION FAILS, three different ways. Each queues; none rejects.
      // Each uses a DIFFERENT ABN on purpose: the auto-pass above now holds a
      // standing grant on ABR_FIXTURES.active, and reusing it would add
      // duplicate_abn to the reasons — correct behaviour, and a second variable.
      const inactive = await newAccount("inactive", "smithbros.com.au");
      const inactiveRes = await apply(inactive.session, {
        abn: ABR_FIXTURES.cancelled, businessName: "Smith Brothers Pty Ltd", source: "profile",
      });
      const mismatch = await newAccount("mismatch", "quantumleap.com.au");
      const mismatchRes = await apply(mismatch.session, {
        abn: ABR_FIXTURES.otherEntity, businessName: "Smith Brothers Pty Ltd", source: "profile",
      });
      const freeMail = await newAccount("freemail", "gmail.com");
      const freeMailRes = await apply(freeMail.session, {
        abn: ABR_FIXTURES.northside, businessName: "Northside Building Pty Ltd", source: "profile",
      });

      const queued = { abn_inactive: inactive, name_mismatch: mismatch, email_domain: freeMail };
      for (const [reason, account] of Object.entries(queued)) {
        const apps = await applications(account.email);
        assert.equal(apps.length, 1, `${reason}: one application row`);
        assert.equal(apps[0].status, "pending", `${reason} is QUEUED, never rejected`);
        assert.equal(apps[0].decided_via, null, `${reason}: nothing decided it`);
        assert.deepEqual(JSON.parse(apps[0].queue_reasons ?? "[]"), [reason], `${reason} is the recorded reason`);
        assert.equal(Number((await userRow(account.email)).discount_percent), 0, `${reason}: a queued application grants nothing`);
      }

      // AB-P2-7 / AC-P2-27: the endpoint must not be an oracle for WHICH fact is
      // wrong. Byte-compared, not eyeballed.
      const bodies = await Promise.all([inactiveRes, mismatchRes, freeMailRes].map((r) => r.clone().text()));
      assert.equal(bodies[0], bodies[1], "abn-status and name failures answer identically");
      assert.equal(bodies[1], bodies[2], "name and email-domain failures answer identically");
      assert.equal(bodies[0], JSON.stringify({ ok: true, status: "under_review" }));
      assert.equal(inactiveRes.status, mismatchRes.status);
      assert.equal(mismatchRes.status, freeMailRes.status);
    });

    await t.test("P2-A7 / AC-P2-13: /me carries trade STATUS, and nothing commercial", async () => {
      const me = async (session) => (await requestJson(session, "/api/auth/me")).body;

      // A brand-new account: every trade fact absent, none of them undefined —
      // the client renders five states off this struct and a missing key is a
      // different bug from a false one.
      const fresh = await newAccount("me-fresh", "example.com");
      assert.deepEqual((await me(fresh.session)).trade, {
        verified: false, verifiedSince: null, provenance: null,
        abn: null, pending: null, history: [],
      });

      // Verified.
      const verified = await newAccount("me-verified", "quantumleap.com.au");
      await apply(verified.session, {
        abn: ABR_FIXTURES.otherEntity, businessName: "Quantum Leap Logistics Pty Ltd",
        source: "profile",
      });
      const verifiedTrade = (await me(verified.session)).trade;
      assert.equal(verifiedTrade.verified, true);
      assert.equal(verifiedTrade.provenance, "auto");
      assert.equal(verifiedTrade.abn, ABR_FIXTURES.otherEntity);
      assert.equal(verifiedTrade.pending, null);
      assert.ok(verifiedTrade.verifiedSince, "a verified account knows when it became one");
      // AC-P2-13: the history is an OUTLINE — date and outcome, nothing else.
      assert.equal(verifiedTrade.history.length, 1);
      assert.deepEqual(Object.keys(verifiedTrade.history[0]).sort(), ["at", "outcome"]);
      assert.equal(verifiedTrade.history[0].outcome, "approved");

      // Pending. The submitted ABN comes back (it is the account's own), the
      // reason it queued does NOT (P2-A3).
      const pending = await newAccount("me-pending", "gmail.com");
      await apply(pending.session, {
        abn: ABR_FIXTURES.northside, businessName: "Northside Building Pty Ltd", source: "profile",
      });
      const pendingTrade = (await me(pending.session)).trade;
      assert.equal(pendingTrade.verified, false);
      assert.deepEqual(Object.keys(pendingTrade.pending).sort(), ["abn", "businessName", "createdAt"]);
      assert.equal(pendingTrade.pending.abn, ABR_FIXTURES.northside);

      // P2-A7: no rate, no criterion, no evidence, no other account — on ANY of
      // the three. Asserted over the whole serialised response, because a leak
      // that arrives through a nested key is still a leak.
      for (const session of [fresh.session, verified.session, pending.session]) {
        const raw = JSON.stringify(await me(session));
        for (const forbidden of ["discount", "queue_reasons", "queueReasons", "abr_snapshot",
                                 "abrSnapshot", "duplicate", "entityName", "reasons"]) {
          assert.ok(!raw.toLowerCase().includes(forbidden.toLowerCase()),
            `/api/auth/me must not serialise ${forbidden}: ${raw}`);
        }
      }
      // The anonymous branch is untouched: no trade key at all.
      const anon = await requestJson(new Session(baseUrl), "/api/auth/me");
      assert.equal(anon.body.authenticated, false);
      assert.equal(anon.body.trade, undefined);
    });

    // Characterisation of the duplicate rule already shipped in applyForTrade
    // (design §6.2 step 5) — it has never had a test of its own.
    await t.test("AC-P2-24 / AB-P2-10: a duplicate ABN is queued however well it scores", async () => {
      const abn = ABR_FIXTURES.activeNoGst;
      const first = await newAccount("dupe-a", "smithbros.com.au");
      assert.deepEqual(
        await (await apply(first.session, { abn, businessName: "Smith Brothers Pty Ltd", source: "profile" })).json(),
        { ok: true, status: "verified" },
      );

      // B applies with an EQUALLY perfect triple — same ABN, same business, same
      // domain — and is queued anyway. The duplicate rule outranks the triple.
      const second = await newAccount("dupe-b", "smithbros.com.au");
      const secondRes = await apply(second.session, {
        // Spaced on purpose: the rule compares 11 digits, not typing.
        abn: `${abn.slice(0, 2)} ${abn.slice(2, 5)} ${abn.slice(5, 8)} ${abn.slice(8)}`,
        businessName: "Smith Brothers Pty Ltd", source: "profile",
      });
      const secondApps = await applications(second.email);
      assert.equal(secondApps[0].status, "pending", "AC-P2-24: a duplicate is queued, never auto-approved");
      assert.deepEqual(JSON.parse(secondApps[0].queue_reasons), ["duplicate_abn"]);
      assert.equal(Number((await userRow(second.email)).discount_percent), 0);
      // The other holder is recorded for OPS, in the snapshot only.
      const snapshot = JSON.parse(secondApps[0].abr_snapshot);
      assert.deepEqual(snapshot.evaluated.duplicateOf, [(await userRow(first.email)).id]);

      // AB-P2-10: and B's account never learns any of that. The body is the
      // ordinary under-review constant, byte for byte.
      assert.equal(await secondRes.clone().text(), JSON.stringify({ ok: true, status: "under_review" }));
      const secondMe = JSON.stringify((await requestJson(second.session, "/api/auth/me")).body);
      assert.ok(!secondMe.includes(first.email), "B is never told who holds the ABN");
      assert.ok(!secondMe.includes((await userRow(first.email)).id));
    });

    // Characterisation of the outage path already shipped in lookupAbn +
    // applyForTrade (design §4, §6.2 step 7).
    await t.test("AC-P2-25 / E-P2-2: the register being down queues, never blocks and never approves", async () => {
      for (const [label, abn] of [["timeout", ABR_FIXTURES.slow], ["http-500", ABR_FIXTURES.serverError],
                                  ["garbage", ABR_FIXTURES.malformed]]) {
        const account = await newAccount(`outage-${label}`, "smithbros.com.au");
        const res = await apply(account.session, {
          abn, businessName: "Smith Brothers Pty Ltd", source: "profile",
        });
        // The customer sees the ORDINARY under-review state. An outage is our
        // problem, and the response must not become a status page for it.
        assert.equal(await res.clone().text(), JSON.stringify({ ok: true, status: "under_review" }), label);
        const apps = await applications(account.email);
        assert.equal(apps[0].status, "pending", `${label}: nothing is approved`);
        assert.ok(JSON.parse(apps[0].queue_reasons).includes("abr_unavailable"), `${label}: the reason is recorded`);
        assert.equal(JSON.parse(apps[0].abr_snapshot).outcome, "unavailable",
          `${label}: the snapshot says the criteria were unevaluable rather than guessing at them`);
        assert.equal(Number((await userRow(account.email)).discount_percent), 0);
        // The account keeps working: it can still read its own state.
        assert.equal((await requestJson(account.session, "/api/auth/me")).body.trade.verified, false);
      }
    });

    // Characterisation of the validation and cap order already shipped in
    // applyForTrade (design §6.2 steps 1-4). "Made no ABR call" is asserted from
    // the stub's counter, not inferred from the response.
    await t.test("AC-P2-7 / AB-P2-6 / AB-P2-13 / AB-P2-1 / AB-P2-3: refusals that cost the register nothing", async () => {
      // AC-P2-7: a bad checksum is a FIELD ERROR. No row, no ABR call.
      const bad = await newAccount("badabn", "smithbros.com.au");
      const beforeBad = stub.hits().length;
      const badRes = await apply(bad.session, { abn: "12345678901", businessName: "Smith Brothers", source: "profile" });
      assert.equal(badRes.status, 400);
      assert.deepEqual(await badRes.json(), { error: "invalid_abn" });
      assert.equal((await applications(bad.email)).length, 0, "nothing to reject, because nothing was created");
      assert.equal(stub.hits().length, beforeBad, "a checksum failure spends no ABR call");

      // AB-P2-13: unbounded input is refused with the field named, and nothing
      // unbounded reaches D1.
      const huge = await newAccount("huge", "smithbros.com.au");
      const beforeHuge = stub.hits().length;
      for (const [payload, error] of [
        [{ abn: "5".repeat(1000), businessName: "Smith Brothers" }, "invalid_abn"],
        [{ abn: ABR_FIXTURES.active, businessName: "N".repeat(100_000) }, "invalid_business_name"],
        [{ abn: ABR_FIXTURES.active, businessName: "" }, "invalid_business_name"],
        // Non-ASCII digit lookalikes are simply not digits.
        [{ abn: "５１０００００６８０", businessName: "Smith Brothers" }, "invalid_abn"],
      ]) {
        const res = await apply(huge.session, { ...payload, source: "profile" });
        assert.equal(res.status, 400, JSON.stringify(payload).slice(0, 80));
        assert.deepEqual(await res.json(), { error });
      }
      assert.equal((await applications(huge.email)).length, 0);
      assert.equal(stub.hits().length, beforeHuge, "no malformed application reaches the register");

      // AB-P2-1 / AB-P2-3: crafting the outcome. These keys are not stripped —
      // nothing in the endpoint looks at them.
      const crafty = await newAccount("crafty", "quantumleap.com.au");
      const craftyRes = await apply(crafty.session, {
        abn: ABR_FIXTURES.northside, businessName: "Definitely Not Quantum Leap", source: "profile",
        status: "verified", discountPercent: 40, discount_percent: 40, tradeStatus: "verified",
        trade_verified: 1, decidedBy: "someone", decided_via: "ops", tier: "trade", type: "internal",
        role: "admin", id: "u_staff1", abrSnapshot: { outcome: "found" }, queue_reasons: [],
      });
      assert.deepEqual(await craftyRes.json(), { ok: true, status: "under_review" },
        "the status is whatever the server's own verification decided");
      const craftyRow = await userRow(crafty.email);
      assert.equal(Number(craftyRow.discount_percent), 0);
      assert.equal(craftyRow.type, "customer");
      assert.equal(craftyRow.role, null);
      const craftyApp = (await applications(crafty.email))[0];
      assert.equal(craftyApp.status, "pending");
      assert.equal(craftyApp.decided_via, null);
      assert.equal(craftyApp.decided_by, null);

      // AB-P2-6, cap 1 of 2 — PER ACCOUNT (5/hour), spent BEFORE any ABR call.
      // The pending row is cleared between attempts so the cap is what refuses
      // the sixth, not the one-open-application rule.
      const capped = await newAccount("capped", "smithbros.com.au");
      const cappedId = (await userRow(capped.email)).id;
      for (let i = 0; i < 5; i++) {
        const res = await apply(capped.session, { abn: ABR_FIXTURES.notFound, businessName: `Attempt ${i}`, source: "profile" });
        assert.equal(res.status, 200, `attempt ${i} is under the cap`);
        await sql(`DELETE FROM trade_application WHERE user_id = '${esc(cappedId)}'`);
      }
      const beforeCap = stub.hits().length;
      const cappedRes = await apply(capped.session, { abn: ABR_FIXTURES.notFound, businessName: "Smith Brothers", source: "profile" });
      assert.equal(cappedRes.status, 429);
      assert.deepEqual(await cappedRes.json(), { error: "rate_limited" });
      assert.equal(stub.hits().length, beforeCap, "a rate-limited caller never reaches the register");

      // AB-P2-6, cap 2 of 2 — PER SOURCE (20/hour). Many accounts, one address:
      // the per-account cap says nothing about total volume, which is exactly
      // the axis a bot rotating accounts would use.
      const sharedIp = "203.0.113.77";
      for (let i = 0; i < 20; i++) {
        const account = await newAccount(`ipcap-${i}`, "smithbros.com.au");
        const res = await apply(account.session, { abn: ABR_FIXTURES.notFound, businessName: `Attempt ${i}`, source: "profile" }, sharedIp);
        assert.equal(res.status, 200, `application ${i} from one address is under the cap`);
      }
      const beforeIpCap = stub.hits().length;
      const twentyFirst = await newAccount("ipcap-over", "smithbros.com.au");
      const ipCapRes = await apply(twentyFirst.session, { abn: ABR_FIXTURES.notFound, businessName: "One too many", source: "profile" }, sharedIp);
      assert.equal(ipCapRes.status, 429);
      assert.deepEqual(await ipCapRes.json(), { error: "rate_limited" });
      assert.equal((await applications(twentyFirst.email)).length, 0, "and it created nothing");
      assert.equal(stub.hits().length, beforeIpCap, "nor reached the register");
    });

    // Characterisation of the self-checks already shipped in worker/routes/trade.ts
    // (design §7.1, §9.3). There is no auth middleware in this Worker, so a new
    // endpoint is unauthenticated until it says otherwise — these prove it says so.
    await t.test("AB-P2-5 / AB-P2-4 / AB-P2-11: no session, no subject id, no internal account", async () => {
      // AB-P2-5: anonymous. Refused before any work, and the register is untouched.
      const before = stub.hits().length;
      const anon = new Session(baseUrl);
      const anonRes = await apply(anon, { abn: ABR_FIXTURES.active, businessName: "Smith Brothers", source: "profile" });
      assert.equal(anonRes.status, 401);
      assert.deepEqual(await anonRes.json(), { error: "unauthorized" });
      assert.equal(stub.hits().length, before,
        "an unauthenticated caller can never spend the ABR quota or use the site as an ABN checker");

      // AB-P2-4: there is NO subject id to supply. Not a filter — a 404, because
      // no such route exists to accept one.
      const victim = await newAccount("victim", "smithbros.com.au");
      await apply(victim.session, { abn: ABR_FIXTURES.cancelled, businessName: "Smith Brothers Pty Ltd", source: "profile" });
      const victimId = (await userRow(victim.email)).id;
      const victimApp = (await applications(victim.email))[0];
      const attacker = await newAccount("attacker", "smithbros.com.au");
      for (const path of [
        `/api/trade/application/${victimApp.id}`,
        `/api/trade/application?userId=${victimId}`,
        `/api/trade/applications/${victimId}`,
        `/api/trade/customers/${victimId}`,
      ]) {
        const res = await attacker.session.request(path);
        assert.ok(res.status === 404 || res.status === 405, `${path} must not serve anything: ${res.status}`);
        const body = await res.text();
        assert.ok(!body.includes(ABR_FIXTURES.cancelled), `${path} leaked an ABN`);
        assert.ok(!body.includes(victim.email), `${path} leaked an account`);
      }
      // And a subject id in the BODY is simply not read: the application it
      // creates belongs to the attacker's own session.
      await apply(attacker.session, {
        abn: ABR_FIXTURES.northside, businessName: "Northside Building Pty Ltd", source: "profile",
        userId: victimId, user_id: victimId,
      });
      assert.equal((await applications(victim.email)).length, 1, "the victim gained no application");
      assert.equal((await applications(attacker.email)).length, 1);

      // AB-P2-11: an internal account is refused at the door. Staff-ness is its
      // own axis and ops must never carry a customer discount.
      const staff = new Session(baseUrl);
      const staffAddress = `tv-staff-${stamp}@openframe.com.au`;
      await login(staff, "/api/ops/auth", staffAddress);
      const staffRes = await apply(staff, { abn: ABR_FIXTURES.active, businessName: "Smith Brothers", source: "profile" });
      assert.equal(staffRes.status, 403);
      assert.deepEqual(await staffRes.json(), { error: "forbidden" });
      assert.equal((await applications(staffAddress)).length, 0);
      assert.equal(Number((await userRow(staffAddress)).discount_percent), 0);
    });

    await t.test("AB-P2-12: a verified account cannot swap its ABN through the payout path", async () => {
      const verified = await newAccount("lock-verified", "harbouredge.com.au");
      await apply(verified.session, {
        abn: ABR_FIXTURES.harbour, businessName: "Harbour Edge Joinery Pty Ltd", source: "profile",
      });
      assert.equal((await userRow(verified.email)).abn, ABR_FIXTURES.harbour, "the account is verified first");

      const swap = await verified.session.request("/api/auth/profile", {
        method: "POST", json: { abn: ABR_FIXTURES.notFound },
      });
      assert.equal(swap.status, 400);
      assert.deepEqual(await swap.json(), { error: "abn_locked" });
      assert.equal((await userRow(verified.email)).abn, ABR_FIXTURES.harbour, "the stored ABN is unchanged");
    });

    // Characterisation of the rest of abnWriteAllowed (design §6.6): the two
    // cases the AB-P2-12 probe above does not reach.
    await t.test("E-P2-19 / owner ruling Q7: a private account may still write its ABN; a pending one may not swap", async () => {
      const profile = (session, json) => session.request("/api/auth/profile", { method: "POST", json });

      // A PRIVATE account may still make itself payable here — today's
      // behaviour, unchanged. The lock only narrows a VERIFIED account.
      const priv = await newAccount("lock-private", "example.com");
      assert.equal((await profile(priv.session, { abn: ABR_FIXTURES.notFound })).status, 200);
      assert.equal((await userRow(priv.email)).abn, ABR_FIXTURES.notFound);

      // A PENDING application locks the column too — compared against the
      // application's frozen ABN, since a pending application has written none.
      const pending = await newAccount("lock-pending", "gmail.com");
      await apply(pending.session, {
        abn: ABR_FIXTURES.keystone, businessName: "Keystone Carpentry Pty Ltd", source: "profile",
      });
      assert.equal((await applications(pending.email))[0].status, "pending");
      const swap = await profile(pending.session, { abn: ABR_FIXTURES.notFound });
      assert.equal(swap.status, 400);
      assert.deepEqual(await swap.json(), { error: "abn_locked" });
      assert.equal((await userRow(pending.email)).abn, null, "a pending application still writes nothing");

      // E-P2-19: the ABN already under review is a no-op that passes, and
      // spacing does not make it different digits.
      const spaced = ABR_FIXTURES.keystone.replace(/^(\d\d)(\d\d\d)(\d\d\d)(\d\d\d)$/, "$1 $2 $3 $4");
      assert.equal((await profile(pending.session, { abn: spaced })).status, 200,
        "re-submitting the ABN under review is not a swap");

      // The lock NARROWS what a session may write to its own row; it has not
      // widened the allowlist. discount_percent is still unreachable from here.
      await profile(priv.session, { discountPercent: 40, discount_percent: 40, type: "internal", role: "admin" });
      const after = await userRow(priv.email);
      assert.equal(Number(after.discount_percent), 0);
      assert.equal(after.type, "customer");
      assert.equal(after.role, null);
    });

    await t.test("AC-P2-36: the queue shows a pending application to assigned-role staff", async () => {
      const applicant = await newAccount("queue-a", "gmail.com");
      await apply(applicant.session, {
        abn: ABR_FIXTURES.wattle, businessName: "Wattle Grove Windows Pty Ltd", source: "trade_page",
      });
      const queuedId = (await applications(applicant.email))[0].id;

      // Owner ruling Q4: assigned-role staff, NOT admin-only.
      const staff = new Session(baseUrl);
      const staffAddress = `tv-ops-${stamp}@openframe.com.au`;
      await login(staff, "/api/ops/auth", staffAddress);
      await sql(`UPDATE user SET role = 'estimator' WHERE email = '${esc(staffAddress)}'`);

      const queue = (await requestJson(staff, "/api/ops/trade/applications")).body.applications;
      const item = queue.find((a) => a.id === queuedId);
      assert.ok(item, "the queued application is in the queue");
      assert.equal(item.applicant.email, applicant.email);
      assert.equal(item.abn, ABR_FIXTURES.wattle);
      assert.deepEqual(item.queueReasons, ["email_domain"]);
      assert.equal(item.abrSnapshot.entityName, "WATTLE GROVE WINDOWS PTY LTD",
        "AC-P2-26: the frozen evidence, not a fresh lookup");
    });

    await t.test("AC-P2-37 / AC-P2-42: a non-admin assigned-role staff member approves, and it is attributed", async () => {
      const applicant = await newAccount("approve", "gmail.com");
      await apply(applicant.session, {
        abn: ABR_FIXTURES.keystone, businessName: "Keystone Carpentry Pty Ltd", source: "profile",
      });
      const applicantId = (await userRow(applicant.email)).id;
      const queuedId = (await applications(applicant.email))[0].id;

      // Owner ruling Q4: assigned-role staff, NOT admin-only. This one is not
      // an admin, and it must succeed.
      const staff = new Session(baseUrl);
      const staffAddress = `tv-approver-${stamp}@openframe.com.au`;
      await login(staff, "/api/ops/auth", staffAddress);
      await sql(`UPDATE user SET role = 'estimator' WHERE email = '${esc(staffAddress)}'`);
      const staffId = (await userRow(staffAddress)).id;

      const approve = await staff.request(`/api/ops/trade/applications/${queuedId}/approve`, {
        method: "POST", json: { note: "Spoke to the owner; ABN confirmed." },
      });
      assert.equal(approve.status, 200);
      assert.deepEqual(await approve.json(), { ok: true });

      const decided = (await applications(applicant.email))[0];
      assert.equal(decided.status, "approved");
      assert.equal(decided.decided_via, "ops");
      assert.equal(decided.decided_by, staffId, "the decision records WHO made it");
      assert.ok(decided.decided_at, "and when");
      assert.equal(decided.decision_reason, "Spoke to the owner; ABN confirmed.");

      const granted = await userRow(applicant.email);
      assert.equal(Number(granted.discount_percent), 5, "the §5.5 grant is applied");
      assert.equal(granted.abn, ABR_FIXTURES.keystone);
      const me = (await requestJson(applicant.session, "/api/auth/me")).body.trade;
      assert.equal(me.verified, true);
      assert.equal(me.provenance, "ops");

      // The item leaves the queue.
      const after = (await requestJson(staff, "/api/ops/trade/applications")).body.applications;
      assert.equal(after.some((a) => a.id === queuedId), false);

      // AC-P2-42: attributed in the audit log, and the ABN is NOT in the entry.
      const events = await sql(
        `SELECT actor, action, after_json FROM audit_event WHERE entity_id = '${esc(applicantId)}' AND action LIKE 'trade.%'`,
      );
      const logged = events.find((e) => e.action === "trade.approved");
      assert.ok(logged, `the approval is logged: ${JSON.stringify(events)}`);
      assert.equal(logged.actor, staffId, "with its actor");
      assert.ok(!JSON.stringify(logged).includes(ABR_FIXTURES.keystone), "and without the ABN in the log line");
    });

    await t.test("AC-P2-38: a rejection needs a reason, and leaves a working private account", async () => {
      const staff = new Session(baseUrl);
      const staffAddress = `tv-rejecter-${stamp}@openframe.com.au`;
      await login(staff, "/api/ops/auth", staffAddress);
      await sql(`UPDATE user SET role = 'estimator' WHERE email = '${esc(staffAddress)}'`);
      const staffId = (await userRow(staffAddress)).id;

      const applicant = await newAccount("reject", "gmail.com");
      await apply(applicant.session, {
        abn: ABR_FIXTURES.oversized, businessName: "Something Or Other", source: "profile",
      });
      const rejectId = (await applications(applicant.email))[0].id;

      // A reason is REQUIRED: a rejection someone has to guess at is not a
      // decision, it is a shrug.
      const noReason = await staff.request(`/api/ops/trade/applications/${rejectId}/reject`, {
        method: "POST", json: {},
      });
      assert.equal(noReason.status, 400);
      assert.deepEqual(await noReason.json(), { error: "invalid_reason" });
      assert.equal((await applications(applicant.email))[0].status, "pending", "and nothing was decided");

      const reject = await staff.request(`/api/ops/trade/applications/${rejectId}/reject`, {
        method: "POST", json: { reason: "Could not confirm the business name against the register." },
      });
      assert.equal(reject.status, 200);
      const row = (await applications(applicant.email))[0];
      assert.equal(row.status, "rejected");
      assert.equal(row.decided_via, "ops");
      assert.equal(row.decided_by, staffId);
      assert.equal(row.decision_reason, "Could not confirm the business name against the register.");
      // The account remains a working private account and its rate is untouched.
      assert.equal(Number((await userRow(applicant.email)).discount_percent), 0);
      assert.equal((await requestJson(applicant.session, "/api/auth/me")).body.trade.verified, false);
      const queue = (await requestJson(staff, "/api/ops/trade/applications")).body.applications;
      assert.equal(queue.some((a) => a.id === rejectId), false, "and the item leaves the queue");
    });

    await t.test("AC-P2-30 / AB-P2-15: revoking puts an account back on retail, immediately", async () => {
      const staff = new Session(baseUrl);
      const staffAddress = `tv-revoker-${stamp}@openframe.com.au`;
      await login(staff, "/api/ops/auth", staffAddress);
      await sql(`UPDATE user SET role = 'estimator' WHERE email = '${esc(staffAddress)}'`);
      const staffId = (await userRow(staffAddress)).id;

      const account = await newAccount("revoke", "northsidebuild.com.au");
      await apply(account.session, {
        abn: ABR_FIXTURES.northside, businessName: "Northside Building Pty Ltd", source: "profile",
      });
      const accountId = (await userRow(account.email)).id;
      assert.equal(Number((await userRow(account.email)).discount_percent), 5, "verified first");

      // A reason is required here too — a customer's prices are about to change
      // and somebody will be asked why.
      const noReason = await staff.request(`/api/ops/trade/customers/${accountId}/revoke`, {
        method: "POST", json: {},
      });
      assert.equal(noReason.status, 400);
      assert.equal(Number((await userRow(account.email)).discount_percent), 5, "a refused revoke changes nothing");

      const revoke = await staff.request(`/api/ops/trade/customers/${accountId}/revoke`, {
        method: "POST", json: { reason: "Business sold; the ABN is no longer theirs." },
      });
      assert.equal(revoke.status, 200);
      assert.deepEqual(await revoke.json(), { ok: true });

      const after = await userRow(account.email);
      assert.equal(Number(after.discount_percent), 0, "back to retail");
      assert.equal(after.abn, ABR_FIXTURES.northside, "the ABN stays — the account keeps working as a private one");
      const row = (await applications(account.email))[0];
      assert.ok(row.revoked_at);
      assert.equal(row.revoked_by, staffId);
      assert.equal(row.revoke_reason, "Business sold; the ABN is no longer theirs.");

      // AB-P2-15: the customer's OWN open session already reads the new state.
      // Nothing trade-related is baked into a session or a token.
      const me = (await requestJson(account.session, "/api/auth/me")).body.trade;
      assert.equal(me.verified, false);
      assert.equal(me.history.some((h) => h.outcome === "revoked"), true);

      // A second revoke has nothing to revoke.
      const again = await staff.request(`/api/ops/trade/customers/${accountId}/revoke`, {
        method: "POST", json: { reason: "again" },
      });
      assert.equal(again.status, 409);
      assert.deepEqual(await again.json(), { error: "not_verified" });
    });

    // Characterisation of the resolveStaff self-check already shipped in
    // worker/routes/ops-trade.ts — every handler asks on its own, because there
    // is no middleware and a new endpoint is open until it says otherwise.
    await t.test("AB-P2-2 / AB-P2-11: the authorization matrix for every ops-trade endpoint", async () => {
      const victim = await newAccount("matrix-victim", "gmail.com");
      await apply(victim.session, {
        abn: ABR_FIXTURES.active, businessName: "Smith Brothers Pty Ltd", source: "profile",
      });
      const victimId = (await userRow(victim.email)).id;
      const openId = (await applications(victim.email))[0].id;

      // A MANUFACTURER partner is a real account minted by the sign-in path, not
      // a row someone UPDATEd — the role is re-pinned from the email domain on
      // every sign-in, so this is the only honest way to have one.
      const partner = new Session(baseUrl);
      const partnerAddress = `tv-partner-${stamp}@${MANUFACTURER_DOMAIN}`;
      await login(partner, "/api/ops/auth", partnerAddress);
      assert.equal((await userRow(partnerAddress)).role, "manufacturer", "the partner is genuinely a partner");

      const customer = await newAccount("matrix-customer", "example.com");
      const anonymous = new Session(baseUrl);

      const endpoints = [
        ["GET", "/api/ops/trade/applications", undefined],
        ["POST", `/api/ops/trade/applications/${openId}/approve`, { note: "mine now" }],
        ["POST", `/api/ops/trade/applications/${openId}/reject`, { reason: "no" }],
        ["POST", `/api/ops/trade/customers/${victimId}/revoke`, { reason: "no" }],
      ];
      for (const [who, session] of [["anonymous", anonymous], ["customer", customer.session], ["manufacturer", partner]]) {
        for (const [method, path, json] of endpoints) {
          const res = await session.request(path, json ? { method, json } : { method });
          assert.equal(res.status, 403, `${who} ${method} ${path}`);
          const body = await res.text();
          assert.deepEqual(JSON.parse(body), { error: "forbidden" }, `${who} ${method} ${path} body`);
          // AB-P2-2: 403 "with no body data" — not a redacted payload, none.
          assert.ok(!body.includes(victim.email), `${who} ${path} leaked an account`);
          assert.ok(!body.includes(ABR_FIXTURES.active), `${who} ${path} leaked an ABN`);
        }
      }
      // And nothing moved.
      const untouched = (await applications(victim.email))[0];
      assert.equal(untouched.status, "pending");
      assert.equal(untouched.decided_by, null);
      assert.equal(Number((await userRow(victim.email)).discount_percent), 0);
    });

    // Characterisation of the guarded claim already shipped in
    // approveApplication (design §6.5) — the WHERE clause IS the authorization
    // of the state transition.
    await t.test("AC-P2-39 / AB-P2-14: one decision, however many times it is clicked", async () => {
      const staff = new Session(baseUrl);
      const staffAddress = `tv-racer-${stamp}@openframe.com.au`;
      await login(staff, "/api/ops/auth", staffAddress);
      await sql(`UPDATE user SET role = 'estimator' WHERE email = '${esc(staffAddress)}'`);

      const account = await newAccount("raced", "gmail.com");
      await apply(account.session, {
        abn: ABR_FIXTURES.harbour, businessName: "Harbour Edge Joinery Pty Ltd", source: "profile",
      });
      const racedId = (await applications(account.email))[0].id;

      // Three staff members, same instant, same application.
      const results = await Promise.all([1, 2, 3].map(() =>
        staff.request(`/api/ops/trade/applications/${racedId}/approve`, { method: "POST", json: {} })));
      const codes = results.map((r) => r.status).sort();
      assert.deepEqual(codes, [200, 409, 409], `exactly one approval wins: ${codes}`);
      assert.equal((await applications(account.email)).length, 1, "one decision record");
      assert.equal(Number((await userRow(account.email)).discount_percent), 5,
        "and the rate is applied once, not twice");

      // A later replay, sequentially, is the same refusal.
      const replay = await staff.request(`/api/ops/trade/applications/${racedId}/approve`, { method: "POST", json: {} });
      assert.equal(replay.status, 409);
      assert.deepEqual(await replay.json(), { error: "already_decided" });
      const rejectAfter = await staff.request(`/api/ops/trade/applications/${racedId}/reject`, {
        method: "POST", json: { reason: "changed my mind" },
      });
      assert.equal(rejectAfter.status, 409, "and it cannot be flipped the other way either");
      assert.equal((await applications(account.email))[0].status, "approved");

      // An application that does not exist is a 404, not a 409.
      assert.equal((await staff.request("/api/ops/trade/applications/no-such-id/approve", {
        method: "POST", json: {},
      })).status, 404);
    });

    // Characterisation of grant()'s rate rule (design §6.5.4): discount_percent
    // moves only on a not-verified -> verified transition.
    await t.test("E-P2-6: a verified account re-applies and AUTO-PASSES (F-0 regression)", async () => {
      // THE PATH THE OPS TEST BELOW CANNOT REACH. Its re-application goes to a
      // human, so the second application row exists as `pending` before the
      // grant batch runs. An AUTO-PASS has no such row — it is inserted inside
      // the batch — and that difference is the whole bug: grant()'s supersede
      // guard asked whether the application was already pending, which is only
      // ever true on the ops path. On auto-pass the prior grant was never
      // superseded, the new approved row collided with the
      // trade_application_one_standing partial unique index, and the constraint
      // error was answered as `application_pending` — telling a customer an
      // application is in flight while /api/auth/me reports pending: null.
      //
      // This is the exact journey the account card's "My ABN has changed"
      // affordance exists for, and it is AC-P2-11's own justification for
      // showing the verified ABN as a fact rather than an input.
      const first = spareBusiness(5);
      const second = spareBusiness(6);
      const account = await newAccount("reauto", first.domain);

      const firstRes = await apply(account.session, {
        abn: first.abn, businessName: first.businessName, source: "profile",
      });
      const firstApps = await applications(account.email);
      assert.deepEqual(await firstRes.clone().json(), { ok: true, status: "verified" },
        `the first application must auto-pass. reasons=${firstApps[0]?.queue_reasons}`);

      const reapply = await apply(account.session, {
        abn: second.abn, businessName: second.businessName, source: "profile",
      });
      assert.equal(reapply.status, 200,
        `a verified account may re-apply — 409 here is F-0. body=${JSON.stringify(await reapply.clone().json())}`);
      assert.deepEqual(await reapply.clone().json(), { ok: true, status: "verified" },
        "and the new ABN auto-passes on its own merits");

      // Exactly one standing grant, and it is the NEW one.
      const standing = (await applications(account.email)).filter(
        (a) => a.status === "approved" && !a.revoked_at && !a.superseded_at);
      assert.equal(standing.length, 1, "the prior grant is superseded, not left beside the new one");
      assert.equal(standing[0].abn, second.abn, "the standing grant carries the new ABN");

      // The account still holds trade pricing throughout — a re-application must
      // never drop the customer to retail while the new number is checked.
      const me = (await requestJson(account.session, "/api/auth/me")).body.trade;
      assert.equal(me.verified, true, "still verified after re-applying");
      assert.equal(me.abn, second.abn, "and the account's ABN is the new one");
      assert.equal(Number((await userRow(account.email)).discount_percent), 5,
        "the rate is unchanged by a re-verification (AC-P2-29)");
    });

    await t.test("E-P2-6: re-applying with the ABN already granted is a no-op (N-2)", async () => {
      // Tester finding N-2. Two auto-pass applications for the SAME account
      // both succeeded — one standing grant survived, because the partial index
      // holds, but the ledger gained two approval rows, two audit events and
      // two "your trade account is active" emails from what is, to the person,
      // one double-click.
      //
      // The narrow, honest fix: an ABN this account is ALREADY verified on has
      // nothing to decide. It is not a new application, it is the same fact
      // arriving twice, and re-granting it would re-send the news of something
      // that has not changed.
      const business = spareBusiness(7);
      const account = await newAccount("regrant", business.domain);

      const first = await apply(account.session, {
        abn: business.abn, businessName: business.businessName, source: "profile",
      });
      assert.deepEqual(await first.clone().json(), { ok: true, status: "verified" });

      const again = await apply(account.session, {
        abn: business.abn, businessName: business.businessName, source: "profile",
      });
      assert.equal(again.status, 200, "the same ABN again is not an error");
      assert.deepEqual(await again.clone().json(), { ok: true, status: "verified" },
        "and it still reports the account as verified");

      const rows = await applications(account.email);
      assert.equal(rows.length, 1, "N-2: no second application row for an ABN already granted");
      assert.equal(rows[0].status, "approved");
      assert.equal(Number((await userRow(account.email)).discount_percent), 5,
        "and the rate is untouched");
    });

    await t.test("AC-P2-29 / E-P2-6: a negotiated rate survives a re-approval", async () => {
      const staff = new Session(baseUrl);
      const staffAddress = `tv-rates-${stamp}@openframe.com.au`;
      await login(staff, "/api/ops/auth", staffAddress);
      await sql(`UPDATE user SET role = 'estimator' WHERE email = '${esc(staffAddress)}'`);
      const approve = (id) => staff.request(`/api/ops/trade/applications/${id}/approve`, { method: "POST", json: {} });

      const account = await newAccount("negotiated", "gmail.com");
      await apply(account.session, {
        abn: ABR_FIXTURES.wattle, businessName: "Wattle Grove Windows Pty Ltd", source: "profile",
      });
      const accountId = (await userRow(account.email)).id;
      assert.equal((await approve((await applications(account.email))[0].id)).status, 200);
      assert.equal(Number((await userRow(account.email)).discount_percent), 5);

      // Ops negotiates a different rate. This phase deliberately ships no editor
      // for it, so the negotiation is a direct write — which is exactly the
      // state AC-P2-29 says a later approval must not disturb.
      await sql(`UPDATE user SET discount_percent = 12 WHERE id = '${esc(accountId)}'`);

      // E-P2-6: a verified account re-applies — verified AND pending at once,
      // the case no single status column could ever have expressed.
      assert.equal((await apply(account.session, {
        abn: ABR_FIXTURES.keystone, businessName: "Keystone Carpentry Pty Ltd", source: "profile",
      })).status, 200);
      const reMe = (await requestJson(account.session, "/api/auth/me")).body.trade;
      assert.equal(reMe.verified, true, "still verified while the new application is checked");
      assert.ok(reMe.pending, "and pending at the same time");

      const secondId = (await applications(account.email)).find((a) => a.status === "pending").id;
      assert.equal((await approve(secondId)).status, 200);
      assert.equal(Number((await userRow(account.email)).discount_percent), 12,
        "AC-P2-29: the negotiated rate is untouched by a re-approval");

      // The previous grant is superseded, not left standing beside the new one.
      const standing = (await applications(account.email)).filter(
        (a) => a.status === "approved" && !a.revoked_at && !a.superseded_at);
      assert.equal(standing.length, 1, "exactly one standing grant");
      assert.equal(standing[0].id, secondId);
    });

    // Characterisation of the SECOND staff-ness guard, the one in
    // approveApplication rather than in applyForTrade (design §6.5.2).
    await t.test("AC-P2-34 / AB-P2-11: an internal account cannot be granted trade status by any path", async () => {
      const staff = new Session(baseUrl);
      const staffAddress = `tv-internal-${stamp}@openframe.com.au`;
      await login(staff, "/api/ops/auth", staffAddress);
      const internalId = (await userRow(staffAddress)).id;

      // An internal account cannot hold an application through the API at all,
      // so the row is planted directly — which is precisely the state the
      // second guard exists for. One check would have been a promise; two make
      // it true whichever way the row arrived.
      const plantedId = `planted-${stamp}`;
      await sql(
        `INSERT INTO trade_application (id, user_id, abn, business_name, source, status)
         VALUES ('${esc(plantedId)}', '${esc(internalId)}', '${esc(ABR_FIXTURES.harbour)}', 'Harbour Edge Joinery', 'profile', 'pending')`,
      );

      const admin = new Session(baseUrl);
      await login(admin, "/api/ops/auth", `tv-admin-${stamp}@openframe.com.au`);
      const planted = await admin.request(`/api/ops/trade/applications/${plantedId}/approve`, { method: "POST", json: {} });
      assert.equal(planted.status, 403);
      assert.equal(Number((await userRow(staffAddress)).discount_percent), 0, "and its rate stays 0");
      assert.equal((await sql(`SELECT status FROM trade_application WHERE id = '${esc(plantedId)}'`))[0].status, "pending");
      assert.equal((await userRow(staffAddress)).type, "internal");
    });

    await t.test("AC-P2-35: the pending count is visible without opening the queue", async () => {
      const staff = new Session(baseUrl);
      await login(staff, "/api/ops/auth", `tv-summary-${stamp}@openframe.com.au`);
      const summary = (await requestJson(staff, "/api/ops/summary")).body;
      const pending = (await sql("SELECT count(*) AS n FROM trade_application WHERE status = 'pending'"))[0].n;
      assert.ok(Number(pending) >= 1, "there are applications awaiting a decision");
      assert.equal(Number(summary.tradeApplications), Number(pending));
    });

    await t.test("AC-P2-41: the customer list carries trade status alongside the rate, read-only", async () => {
      const staff = new Session(baseUrl);
      await login(staff, "/api/ops/auth", `tv-list-${stamp}@openframe.com.au`);

      const applicant = await newAccount("console-list", "gmail.com");
      await apply(applicant.session, {
        abn: ABR_FIXTURES.northside, businessName: "Northside Building Pty Ltd", source: "trade_page",
      });
      const applicantId = (await userRow(applicant.email)).id;

      const list = (await requestJson(staff, "/api/ops/customers")).body.customers;
      const row = list.find((r) => r.id === applicantId);
      assert.ok(row, "the applicant is in the customer list");
      assert.equal(row.tradeVerified, false, "an application pending is not a verification");
      assert.equal(Number(row.discountPercent), 0);

      const pendingId = (await applications(applicant.email))[0].id;
      assert.equal((await staff.request(`/api/ops/trade/applications/${pendingId}/approve`, {
        method: "POST", json: {},
      })).status, 200);
      const after = (await requestJson(staff, "/api/ops/customers")).body.customers.find((r) => r.id === applicantId);
      assert.equal(after.tradeVerified, true);
      assert.equal(Number(after.discountPercent), 5);
    });

    await t.test("AC-P2-40: the customer record carries the trade status and the decision history", async () => {
      const staff = new Session(baseUrl);
      const staffAddress = `tv-record-${stamp}@openframe.com.au`;
      await login(staff, "/api/ops/auth", staffAddress);
      const staffId = (await userRow(staffAddress)).id;

      const applicant = await newAccount("console-record", "gmail.com");
      await apply(applicant.session, {
        abn: ABR_FIXTURES.harbour, businessName: "Harbour Edge Joinery Pty Ltd", source: "profile",
      });
      const applicantId = (await userRow(applicant.email)).id;
      const pendingId = (await applications(applicant.email))[0].id;
      assert.equal((await staff.request(`/api/ops/trade/applications/${pendingId}/approve`, {
        method: "POST", json: { note: "Confirmed by phone." },
      })).status, 200);

      const record = (await requestJson(staff, `/api/ops/customers/${applicantId}`)).body;
      assert.equal(record.customer.trade.verified, true);
      assert.equal(record.customer.trade.provenance, "ops");
      assert.equal(Number(record.customer.discountPercent), 5, "read-only, alongside the status");
      assert.equal(record.tradeHistory.length, 1);
      assert.equal(record.tradeHistory[0].outcome, "approved");
      assert.equal(record.tradeHistory[0].decidedBy.id, staffId);
      assert.equal(record.tradeHistory[0].decisionReason, "Confirmed by phone.");
    });

    await t.test("AC-P2-36: a duplicate application names the other holder, to STAFF only", async () => {
      const staff = new Session(baseUrl);
      await login(staff, "/api/ops/auth", `tv-dupes-${stamp}@openframe.com.au`);

      // A business nobody has verified yet, so the ONLY reason the second
      // application queues is the duplicate rule.
      const business = spareBusiness(0);
      const holder = await newAccount("holder", business.domain);
      assert.deepEqual(await (await apply(holder.session, {
        abn: business.abn, businessName: business.businessName, source: "profile",
      })).json(), { ok: true, status: "verified" });
      const holderId = (await userRow(holder.email)).id;

      const second = await newAccount("second-holder", business.domain);
      await apply(second.session, {
        abn: business.abn, businessName: business.businessName, source: "profile",
      });
      const secondAppId = (await applications(second.email))[0].id;

      // The person deciding must be able to SEE the other account — D2.1 lets
      // them knowingly allow two holders, and they cannot decide that blind.
      const item = (await requestJson(staff, "/api/ops/trade/applications")).body
        .applications.find((a) => a.id === secondAppId);
      assert.ok(item);
      assert.deepEqual(item.queueReasons, ["duplicate_abn"]);
      assert.equal(item.duplicateHolders.length, 1);
      assert.equal(item.duplicateHolders[0].id, holderId);
      assert.equal(item.duplicateHolders[0].email, holder.email);

      // Resolved LIVE, not frozen: once the first grant ends, the second
      // applicant is no longer competing with anybody.
      assert.equal((await staff.request(`/api/ops/trade/customers/${holderId}/revoke`, {
        method: "POST", json: { reason: "Test revocation." },
      })).status, 200);
      const after = (await requestJson(staff, "/api/ops/trade/applications")).body
        .applications.find((a) => a.id === secondAppId);
      assert.deepEqual(after.duplicateHolders, [],
        "a holder who has since been revoked stops being shown as one");
    });

    // AC-P2-55 — a Phase-1 seam the owner asked to carry: the phone and address
    // registration started collecting have never been shown to the staff who
    // need them. Same record, same gate, same customer's PII.
    await t.test("AC-P2-55: the ops project record shows the customer's phone and account address", async () => {
      const staff = new Session(baseUrl);
      await login(staff, "/api/ops/auth", `tv-project-${stamp}@openframe.com.au`);

      const customer = await newAccount("record-contact", "example.com");
      const customerId = (await userRow(customer.email)).id;
      await completeAccount(customer.session);
      const projectId = `tv-project-${stamp}`;
      await sql(
        `INSERT INTO project (id, title, owner_user_id, status_customer)
         VALUES ('${esc(projectId)}', 'Contact seam', '${esc(customerId)}', 'submitted')`,
      );

      const record = (await requestJson(staff, `/api/ops/projects/${projectId}`)).body.project;
      assert.equal(record.customerPhone, COMPLETE_ACCOUNT.phone);
      assert.deepEqual(record.customerAddress, {
        line1: COMPLETE_ACCOUNT.addressLine1,
        line2: null,
        suburb: COMPLETE_ACCOUNT.addressSuburb,
        state: COMPLETE_ACCOUNT.addressState,
        postcode: COMPLETE_ACCOUNT.addressPostcode,
      });

      // An account that has filled nothing in reads as absent, not as blanks.
      const bare = await newAccount("record-bare", "example.com");
      const bareProjectId = `tv-project-bare-${stamp}`;
      await sql(
        `INSERT INTO project (id, title, owner_user_id, status_customer)
         VALUES ('${esc(bareProjectId)}', 'No contact', '${esc((await userRow(bare.email)).id)}', 'submitted')`,
      );
      const bareRecord = (await requestJson(staff, `/api/ops/projects/${bareProjectId}`)).body.project;
      assert.equal(bareRecord.customerPhone, null);
      assert.equal(bareRecord.customerAddress, null);
    });

    await t.test("AC-P2-43/44/45/61: every outcome sends its email, with its own dot-free key", async () => {
      const notifications = async (email) => sql(
        `SELECT event_type, template_key, delivery_state FROM notification
          WHERE recipient_subject = '${esc(email)}' AND template_key LIKE 'trade%'
          ORDER BY sent_at, rowid`,
      );
      const staff = new Session(baseUrl);
      await login(staff, "/api/ops/auth", `tv-mail-${stamp}@openframe.com.au`);

      // An auto-pass emails trade_approved and nothing else — the applicant was
      // never under review, so telling them so would be a lie.
      const auto = spareBusiness(1);
      const autoAccount = await newAccount("mail-auto", auto.domain);
      await apply(autoAccount.session, { abn: auto.abn, businessName: auto.businessName, source: "trade_page" });
      assert.deepEqual((await notifications(autoAccount.email)).map((n) => [n.event_type, n.template_key]),
        [["trade.application.approved", "trade_approved"]]);

      // A queued application acknowledges, then the ops decision follows.
      const queued = spareBusiness(2);
      const queuedAccount = await newAccount("mail-queued", "gmail.com");
      await apply(queuedAccount.session, { abn: queued.abn, businessName: queued.businessName, source: "profile" });
      assert.deepEqual((await notifications(queuedAccount.email)).map((n) => n.template_key), ["trade_ack"]);

      const queuedId = (await applications(queuedAccount.email))[0].id;
      assert.equal((await staff.request(`/api/ops/trade/applications/${queuedId}/approve`, {
        method: "POST", json: {},
      })).status, 200);
      assert.deepEqual((await notifications(queuedAccount.email)).map((n) => n.template_key),
        ["trade_ack", "trade_approved"]);

      // Revoking tells them, because their prices are about to change and a
      // silent revocation reads as a bug (owner ruling Q1).
      const queuedUserId = (await userRow(queuedAccount.email)).id;
      assert.equal((await staff.request(`/api/ops/trade/customers/${queuedUserId}/revoke`, {
        method: "POST", json: { reason: "Test." },
      })).status, 200);
      assert.deepEqual((await notifications(queuedAccount.email)).map((n) => n.template_key),
        ["trade_ack", "trade_approved", "trade_revoked"]);

      // And a rejection.
      const rejected = spareBusiness(3);
      const rejectedAccount = await newAccount("mail-rejected", "gmail.com");
      await apply(rejectedAccount.session, { abn: rejected.abn, businessName: rejected.businessName, source: "profile" });
      const rejectedId = (await applications(rejectedAccount.email))[0].id;
      assert.equal((await staff.request(`/api/ops/trade/applications/${rejectedId}/reject`, {
        method: "POST", json: { reason: "Could not confirm." },
      })).status, 200);
      assert.deepEqual((await notifications(rejectedAccount.email)).map((n) => n.template_key),
        ["trade_ack", "trade_rejected"]);

      // AC-P2-62: every key that reached the notification log is dot-free.
      const keys = (await sql("SELECT DISTINCT template_key AS k FROM notification WHERE template_key LIKE 'trade%'"))
        .map((r) => r.k);
      assert.equal(keys.length, 4, `all four keys were exercised: ${keys}`);
      for (const key of keys) assert.ok(!key.includes("."), `${key} must be dot-free`);
    });

    // AC-P2-50…53 — the migration's DATA half, run against a populated database.
    //
    // The harness applies migrations to an EMPTY database and seeds afterwards,
    // so the grandfathering INSERT…SELECTs match nothing at migration time. That
    // is a harness artefact, not the production ordering, and asserting against
    // it would prove nothing. So the data half is extracted from the real
    // migration file and executed here against seeded rows — the same SQL text
    // that will run in production, in the order production will run it.
    await t.test("AC-P2-50/51/52/53: staff pinned, exactly three grandfathered, nothing else touched", async () => {
      const { TRADE_DISCOUNT_DEFAULT } = await import(pathToFileURL(await (async () => {
        const bundlePath = join(runDir, "trade-const.mjs");
        await build({
          stdin: {
            contents: `export { TRADE_DISCOUNT_DEFAULT } from ${JSON.stringify(join(projectRoot, "worker/lib/trade.ts"))};`,
            resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
          },
          bundle: true, format: "esm", platform: "node", outfile: bundlePath, logLevel: "silent",
        });
        return bundlePath;
      })()).href);

      const GRANDFATHERED = [
        "gediminas.bereznevicius@gmail.com",
        "sarah@northsidebuild.com.au",
        "doni@siaribuild.com.au",
      ];

      // AC-P2-52: the file is additive. No rebuild, no DROP — a rebuild in this
      // database has already cascade-deleted production rows.
      const migration = await readFile(join(projectRoot, "migrations/0054_trade_verification.sql"), "utf8");
      assert.equal(/\bDROP\s+TABLE\b/i.test(migration), false, "no DROP TABLE");
      assert.equal(/\bALTER\s+TABLE\s+\w+\s+RENAME\b/i.test(migration), false, "no table rename (rebuild)");
      assert.equal(/\bDROP\s+COLUMN\b/i.test(migration), false, "no DROP COLUMN");

      // AC-P2-51: matching is by explicit address, never "every customer row
      // that exists when the migration runs" — which would silently grandfather
      // anyone who registers between now and the deploy.
      for (const email of GRANDFATHERED) assert.ok(migration.includes(email), `${email} is named explicitly`);
      // Every statement that grants anything must be constrained by ADDRESS.
      // The check is on the text because the danger is a statement that grants
      // correctly today and grants to everyone after one careless edit.
      // A fixed window rather than "up to the next semicolon": the decision
      // reason itself contains one, inside a string literal.
      const windowAfter = (index) => migration.slice(index, index + 900);
      for (const match of migration.matchAll(/UPDATE user SET discount_percent = [1-9]/g)) {
        assert.ok(/email\s+IN\s*\(|email\s*=\s*'/i.test(windowAfter(match.index)),
          "a granting UPDATE must name its addresses");
      }
      const inserts = [...migration.matchAll(/INSERT INTO trade_application/g)];
      assert.equal(inserts.length, 3, "three single-address INSERTs, so the reviewed SQL names each grant");
      for (const match of inserts) {
        assert.ok(/email\s*=\s*'/i.test(windowAfter(match.index)),
          "a grandfathering INSERT must name its address");
      }

      // The rate literal in the migration must equal the code's one named place.
      const literal = /discount_percent\s*=\s*(\d+)\s*\r?\n\s*WHERE type = 'customer'/i.exec(migration);
      assert.ok(literal, "the grandfather rate literal is findable in the migration");
      assert.equal(Number(literal[1]), TRADE_DISCOUNT_DEFAULT,
        "AC-P2-51: the migration's rate and TRADE_DISCOUNT_DEFAULT agree");

      // Production's own record: one of the three holds an ABN and a company.
      await sql(`UPDATE user SET abn = '33629698013', company = 'Motro Constructions'
                  WHERE email = '${esc(GRANDFATHERED[0])}'`);

      // AC-P2-53's six tables. The spec says "payout"; the table is actually
      // `referral_payout` (migrations/0051:146) — there is no table named
      // `payout`, so the criterion is read as naming the payout table.
      const COUNTED = ["user", "membership", "project", "quote_line", "referral_payout", '"order"'];
      const counts = async () => {
        const row = (await sql(`SELECT ${COUNTED.map((t, i) => `(SELECT count(*) FROM ${t}) AS c${i}`).join(", ")}`))[0];
        return COUNTED.map((_, i) => Number(row[`c${i}`]));
      };
      const before = await counts();
      const othersBefore = await sql(
        `SELECT id, discount_percent FROM user WHERE type = 'customer'
           AND email NOT IN (${GRANDFATHERED.map((e) => `'${esc(e)}'`).join(",")}) ORDER BY id`,
      );

      // Run the real SQL, from the real file.
      const marker = "-- ── Staff pinning";
      const at = migration.indexOf(marker);
      assert.ok(at > 0, "the migration's data half is where the test expects it");
      const dataHalf = join(runDir, "0054-data.sql");
      await writeFile(dataHalf, migration.slice(at), "utf8");
      await run(process.execPath, [
        wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--file", dataHalf,
      ], { env: wranglerEnv });

      // AC-P2-50: Phase 1 fixed creation only; this pins the rows that predate it.
      assert.equal(
        Number((await sql("SELECT count(*) AS n FROM user WHERE type = 'internal' AND discount_percent <> 0"))[0].n), 0,
        "no internal account carries a customer discount",
      );

      // AC-P2-51: exactly three, by provenance, with the ABN copied where it
      // exists and NOTHING INVENTED where it does not.
      const rows = await sql(
        `SELECT u.email, u.discount_percent, t.abn, t.status, t.decided_via, t.decided_by, t.decision_reason
           FROM trade_application t JOIN user u ON u.id = t.user_id
          WHERE t.decided_via = 'grandfathered' ORDER BY u.email`,
      );
      assert.equal(rows.length, 3, `exactly three grandfathered rows: ${JSON.stringify(rows.map((r) => r.email))}`);
      assert.deepEqual(rows.map((r) => r.email).sort(), [...GRANDFATHERED].sort());
      for (const row of rows) {
        assert.equal(row.status, "approved");
        assert.equal(row.decided_by, null, "granted by owner decision, not by a person clicking approve");
        assert.equal(Number(row.discount_percent), TRADE_DISCOUNT_DEFAULT);
        assert.ok(/[Gg]randfathered/.test(row.decision_reason), "and the record says so in words");
      }
      assert.equal(rows.find((r) => r.email === GRANDFATHERED[0]).abn, "33629698013", "an ABN on file is copied");
      for (const email of GRANDFATHERED.slice(1)) {
        assert.equal(rows.find((r) => r.email === email).abn, null,
          `${email} holds no ABN and none is invented for it`);
      }

      // ...and no other customer's rate moved.
      const othersAfter = await sql(
        `SELECT id, discount_percent FROM user WHERE type = 'customer'
           AND email NOT IN (${GRANDFATHERED.map((e) => `'${esc(e)}'`).join(",")}) ORDER BY id`,
      );
      assert.deepEqual(othersAfter, othersBefore, "AC-P2-51: nobody else's discount changed");

      // AC-P2-53: the six tables are the same size they were.
      assert.deepEqual(await counts(), before, `AC-P2-53: ${COUNTED.join(", ")} row counts identical`);
    });

    // AC-P2-31 / AC-P2-32 / AB-P2-8 — proven by ABSENCE, twice over: once from
    // the database (nothing stored changed) and once from the source (no code
    // path exists that could have changed it). The Phase-1 AB-12 pattern.
    await t.test("AC-P2-31 / AB-P2-8: approval reprices nothing, and nothing sensitive is logged", async () => {
      const staff = new Session(baseUrl);
      await login(staff, "/api/ops/auth", `tv-noreprice-${stamp}@openframe.com.au`);

      const dump = async () => ({
        lines: await sql("SELECT * FROM quote_line ORDER BY id"),
        orders: await sql('SELECT * FROM "order" ORDER BY id'),
        projects: await sql("SELECT id, title, status_customer, status_internal FROM project ORDER BY id"),
      });
      const before = await dump();
      assert.ok(before.lines.length > 0, "the seeded database has priced rows to protect");

      const business = spareBusiness(4);
      const account = await newAccount("noreprice", "gmail.com");
      await apply(account.session, { abn: business.abn, businessName: business.businessName, source: "profile" });
      const accountId = (await userRow(account.email)).id;
      const applicationId = (await applications(account.email))[0].id;
      assert.equal((await staff.request(`/api/ops/trade/applications/${applicationId}/approve`, {
        method: "POST", json: {},
      })).status, 200);
      assert.deepEqual(await dump(), before, "AC-P2-31: approval changed no stored price, line, quote or order");

      assert.equal((await staff.request(`/api/ops/trade/customers/${accountId}/revoke`, {
        method: "POST", json: { reason: "Test." },
      })).status, 200);
      assert.deepEqual(await dump(), before, "AC-P2-31: nor did revocation");

      // ...and no code path exists that could have. Absence proven, not assumed.
      const sources = Object.fromEntries(await Promise.all(
        ["worker/lib/trade.ts", "worker/lib/abr.ts", "worker/lib/trade-match.ts",
         "worker/routes/trade.ts", "worker/routes/ops-trade.ts"]
          .map(async (rel) => [rel, await readFile(join(projectRoot, rel), "utf8")]),
      ));
      for (const [rel, source] of Object.entries(sources)) {
        for (const forbidden of ["quote_line", '"order"', "estimator/pricing", "repriceReferralDrafts", "issueQuote"]) {
          assert.ok(!source.includes(forbidden), `${rel} must never name ${forbidden}`);
        }
        // AC-P2-60: organisation/membership are untouched by this phase.
        for (const table of ["organisation", "membership"]) {
          assert.ok(!new RegExp(`\\b${table}\\b`).test(source), `${rel} must not reference ${table}`);
        }
      }

      // AB-P2-8: log discipline. Every console.* in the two modules that HANDLE
      // an ABN and a credential must be a fixed string — no interpolation at
      // all, which is the only version of this rule that cannot be got wrong.
      for (const rel of ["worker/lib/abr.ts", "worker/lib/trade.ts"]) {
        const calls = sources[rel].match(/console\.\w+\([^)]*\)/g) ?? [];
        for (const call of calls) {
          // No interpolation AT ALL. A fixed string cannot leak a value, which
          // is the only version of this rule that cannot be got wrong later —
          // "don't log the ABN" invites an argument about which variable is
          // safe, and this does not. (Naming ABR_GUID as a CONFIG KEY in the
          // missing-credential warning is fine and useful; it is the value that
          // must never appear, and a fixed string has no values in it.)
          assert.equal(/\$\{|`|\+/.test(call), false, `${rel}: ${call} interpolates into a log line`);
          assert.equal(/\d{11}/.test(call), false, `${rel}: ${call} contains something ABN-shaped`);
        }
      }
      // The credential is not a VITE_* var, so it cannot reach the client bundle
      // by construction — and nothing else references it either.
      for (const [rel, source] of Object.entries(sources)) {
        if (rel === "worker/lib/abr.ts") continue;
        assert.ok(!source.includes("ABR_GUID"),
          `${rel} must not name the credential — abr.ts is the only module that knows ABR exists`);
      }
      assert.equal(sources["worker/lib/abr.ts"].includes("VITE_"), false,
        "and it is not a VITE_* var, so the client bundle cannot contain it");

      // House rule, one place per fact: the assigned-role predicate has ONE
      // definition. Two spellings of the same rule is how they come to disagree.
      const staffLib = await readFile(join(projectRoot, "worker/lib/staff.ts"), "utf8");
      const opsRoutes = await readFile(join(projectRoot, "worker/routes/ops.ts"), "utf8");
      assert.ok(/export const hasAssignedRole|export function hasAssignedRole/.test(staffLib),
        "hasAssignedRole lives in worker/lib/staff.ts");
      assert.ok(/import[^;]*hasAssignedRole[^;]*from "\.\.\/lib\/staff"/.test(opsRoutes),
        "and worker/routes/ops.ts imports it rather than defining a second copy");
    });
  } finally {
    if (server) await stop(server);
    if (stub) await stub.close();
    await removeRunDir(runDir);
  }
});
