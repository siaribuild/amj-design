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
