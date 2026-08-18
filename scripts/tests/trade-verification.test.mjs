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
import {
  Session, freePort, login, makeRunDir, projectRoot, removeRunDir, requestJson,
  run, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";
import { ABR_FIXTURES, startAbrStub } from "./abr-stub.mjs";

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
        abn: ABR_FIXTURES.active, businessName: "Smith Brothers Pty Ltd", label: "builder", source: "trade_page",
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
      assert.equal(autoUser.trade_label, "builder");

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
        label: null, abn: null, pending: null, history: [],
      });

      // Verified.
      const verified = await newAccount("me-verified", "quantumleap.com.au");
      await apply(verified.session, {
        abn: ABR_FIXTURES.otherEntity, businessName: "Quantum Leap Logistics Pty Ltd",
        label: "tradie", source: "profile",
      });
      const verifiedTrade = (await me(verified.session)).trade;
      assert.equal(verifiedTrade.verified, true);
      assert.equal(verifiedTrade.provenance, "auto");
      assert.equal(verifiedTrade.label, "tradie");
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
        [{ abn: ABR_FIXTURES.active, businessName: "Smith Brothers", label: "wholesaler" }, "invalid_label"],
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

    await t.test("owner ruling Q5: the builder/tradie label is self-declared and set from the profile", async () => {
      const account = await newAccount("label", "example.com");
      const res = await account.session.request("/api/auth/profile", {
        method: "POST", json: { tradeLabel: "tradie" },
      });
      assert.equal(res.status, 200);
      assert.equal((await userRow(account.email)).trade_label, "tradie");
      assert.equal((await requestJson(account.session, "/api/auth/me")).body.trade.label, "tradie");

      const bad = await account.session.request("/api/auth/profile", {
        method: "POST", json: { tradeLabel: "wholesaler" },
      });
      assert.equal(bad.status, 400);
      assert.deepEqual((await bad.json()).fields, ["tradeLabel"], "refused by name, never coerced");
      assert.equal((await userRow(account.email)).trade_label, "tradie", "the stored value survives the refusal");

      const cleared = await account.session.request("/api/auth/profile", { method: "POST", json: { tradeLabel: "" } });
      assert.equal(cleared.status, 200, "and it can be cleared");
      assert.equal((await userRow(account.email)).trade_label, null);
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
        abn: ABR_FIXTURES.wattle, businessName: "Wattle Grove Windows Pty Ltd", label: "builder", source: "trade_page",
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
        abn: ABR_FIXTURES.keystone, businessName: "Keystone Carpentry Pty Ltd", label: "tradie", source: "profile",
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
      assert.equal(granted.trade_label, "tradie");
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
  } finally {
    if (server) await stop(server);
    if (stub) await stub.close();
    await removeRunDir(runDir);
  }
});
