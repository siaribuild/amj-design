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
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";
import { ABR_FIXTURES, startAbrStub } from "./abr-stub.mjs";

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
