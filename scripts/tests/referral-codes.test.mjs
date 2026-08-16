// Referral program — code issuance under collision (AC-3). Spec §4.6, design §6.2.
//
// generateReferralCode draws at random from a ~8.9 × 10⁸ space, so a collision is
// rare. Rare is not never, and the failure it would otherwise produce is the worst
// kind: a tradie who completes their bank details and gets a 500 from a UNIQUE
// constraint, with nothing to retry and no way to tell that trying again would work.
//
// The guard is deliberately NOT an exception handler. Matching on D1's error text
// would couple this module to a message string we do not own, and a version bump
// that reworded it would turn a handled collision back into a 500 silently. Instead
// the UPDATE declines to take when the code is already held, the read-back returns
// null, and null means "try again" — one control flow for a collision and for any
// other reason the row did not take.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));

/** A payable user: the D18 gate is not what this file is about. */
const PAYABLE = {
  id: "u-collide",
  referral_code: null,
  abn: "51 824 753 556",
  payout_bsb: "063000",
  payout_account_number: "12345678",
  payout_account_name: "A Tradie",
};

/**
 * An Env whose UPDATE takes only when the drawn code is free.
 *
 * `held` is the set of codes other users already own. The fake models the OUTCOME
 * the real statement produces — the row updates, or it does not — rather than
 * re-implementing SQL, so it cannot drift into testing itself.
 */
function fakeEnv(held) {
  const state = { code: null, updates: 0 };
  return {
    state,
    DB: {
      prepare(sql) {
        const binder = { sql, args: [] };
        return {
          bind(...args) { binder.args = args; return this; },
          async run() {
            state.updates += 1;
            const [drawn] = binder.args;
            if (!held.has(drawn) && state.code === null) state.code = drawn;
            return { success: true };
          },
          async first() {
            // Issuance is paused while the program is off, so the resolver asks.
            // Answering every SELECT with a user row would have this fake quietly
            // reporting "program off" and the collision behaviour would never run.
            if (/referral_program/.test(binder.sql)) return { active: 1 };
            return { referral_code: state.code };
          },
        };
      },
    },
  };
}

test("AC-3 — a drawn code that is already held is redrawn, never surfaced as an error", async (t) => {
  const runDir = await makeRunDir("referral-codes");
  t.after(async () => { await removeRunDir(runDir); });
  const outfile = join(runDir, "referrals-bundle.mjs");
  await build({
    stdin: {
      contents: `export * from ${p("worker/lib/referrals.ts")};`,
      resolveDir: projectRoot,
      sourcefile: "referral-codes-entry.ts",
      loader: "ts",
    },
    bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  });
  const { ensureReferralCode } = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);

  // Two draws: the first is a code another tradie already holds, the second is free.
  const draws = ["AAA-111", "BBB-222"];
  const env = fakeEnv(new Set(["AAA-111"]));
  const issued = await ensureReferralCode(env, { ...PAYABLE }, () => draws.shift());

  assert.equal(issued, "BBB-222", "a collision must be redrawn, not returned and not thrown");
  assert.equal(env.state.updates, 2, "and the redraw must actually reach the database");
});

test("a refused claim returns its reason, rather than throwing it", async (t) => {
  // The six refusal codes each map to a sentence a tradie reads. A thrown Error
  // would collapse them into one "something went wrong", and the field's whole
  // job is to say WHICH thing — "that's your own code" and "a code can only be
  // added before your first order" are different problems with different fixes.
  const runDir = await makeRunDir("referral-client");
  t.after(async () => { await removeRunDir(runDir); });
  const outfile = join(runDir, "client-bundle.mjs");
  await build({
    stdin: {
      contents: `export * from ${p("src/data/referrals.ts")};`,
      resolveDir: projectRoot,
      sourcefile: "referral-client-entry.ts",
      loader: "ts",
    },
    bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  });
  const { claimReferralCode } = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);

  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });

  globalThis.fetch = async () => new Response(JSON.stringify({ error: "has_order" }), { status: 400 });
  assert.equal(await claimReferralCode("ABC-123"), "has_order", "the reason reaches the caller");

  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  assert.equal(await claimReferralCode("ABC-123"), null, "and null means it worked");
});

test("a refused leave carries the amount that refused it", async (t) => {
  // §5.5's refusal names the figure — "$124 is confirmed and hasn't gone out
  // yet." A bare failure would leave the screen unable to say why, on the one
  // screen where why IS the message: the person is being told they cannot do
  // something, and the number is the reason it will resolve itself shortly.
  const runDir = await makeRunDir("referral-leave");
  t.after(async () => { await removeRunDir(runDir); });
  const outfile = join(runDir, "leave-bundle.mjs");
  await build({
    stdin: {
      contents: `export * from ${p("src/data/referrals.ts")};`,
      resolveDir: projectRoot,
      sourcefile: "referral-leave-entry.ts",
      loader: "ts",
    },
    bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  });
  const { leaveProgram } = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);

  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "clear_blocked", amount: 124.5 }), { status: 409 });

  const refused = await leaveProgram();
  assert.equal(refused.ok, false);
  assert.equal(refused.amount, 124.5, "the figure the refusal is about reaches the screen");
});

test("saving payout details answers with the gate, so the screen knows it joined", async (t) => {
  // Completing these details IS joining, so the response has to say whether the
  // gate is now open — the screen that called it needs to know a code exists,
  // and re-fetching to find out would let it render a half-joined moment that
  // does not exist in the model.
  const runDir = await makeRunDir("referral-save");
  t.after(async () => { await removeRunDir(runDir); });
  const outfile = join(runDir, "save-bundle.mjs");
  await build({
    stdin: {
      contents: `export * from ${p("src/data/referrals.ts")};`,
      resolveDir: projectRoot,
      sourcefile: "referral-save-entry.ts",
      loader: "ts",
    },
    bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  });
  const { savePayoutDetails } = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);

  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ referrerGate: { complete: true, missing: [] } }), { status: 200 });

  const saved = await savePayoutDetails({ bsb: "063000", accountNumber: "12345678", accountName: "A Tradie" });
  assert.equal(saved.referrerGate.complete, true, "the gate comes back with the save");
});

test("AC-3 — exhausting the redraws is an error, not a quiet null", async (t) => {
  // null is ALREADY the answer to "this user may not hold a code" — the D18
  // gate's answer. Reusing it for exhaustion would tell a tradie who has
  // completed their bank details that they are not in the program, and the
  // account screen has no way to tell those two apart. Five collisions in a
  // ~8.9 × 10⁸ space is a broken generator, not bad luck, so it should fail
  // loudly where someone will see it rather than quietly where nobody will.
  const runDir = await makeRunDir("referral-codes-exhaust");
  t.after(async () => { await removeRunDir(runDir); });
  const outfile = join(runDir, "referrals-bundle.mjs");
  await build({
    stdin: {
      contents: `export * from ${p("worker/lib/referrals.ts")};`,
      resolveDir: projectRoot,
      sourcefile: "referral-codes-exhaust-entry.ts",
      loader: "ts",
    },
    bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  });
  const { ensureReferralCode } = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);

  const stuck = fakeEnv(new Set(["ZZZ-999"]));
  await assert.rejects(
    () => ensureReferralCode(stuck, { ...PAYABLE }, () => "ZZZ-999"),
    /could not issue a referral code/i,
    "exhaustion must throw rather than return the gate's own null",
  );
});
