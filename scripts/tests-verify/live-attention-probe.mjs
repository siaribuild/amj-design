// One-off tester probe: drive the REAL Attention gate against the REAL
// /api/ops/projects on a live local Worker — no route stubs anywhere. Fills the
// gap that every shipped browser assertion for criteria 1-4 is stubbed.
//
//   node scripts/tests-verify/live-attention-probe.mjs
//
// Expects a Worker already listening on WEB_PORT (default 8799) with the seed
// applied plus the p_probe_c7 row (status_customer under_review, no lines).
import { chromium } from "playwright";
import assert from "node:assert/strict";

const PORT = process.env.WEB_PORT ?? "8799";
const OPS = `http://ops.localhost:${PORT}/ops2`;
const STAFF = "ged@openframe.com.au";

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(OPS);
const signIn = await page.evaluate(async (email) => {
  const c = await fetch("/api/ops/auth/challenge", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const { devCode } = await c.json();
  if (!devCode) return "no dev code";
  const v = await fetch("/api/ops/auth/verify", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code: devCode }),
  });
  return v.ok ? null : `verify ${v.status}`;
}, STAFF);
assert.equal(signIn, null, "staff sign-in");

// What the endpoint actually returns, computed here with the spec's predicates.
const rows = await page.evaluate(async () => {
  const r = await fetch("/api/ops/projects", { credentials: "same-origin" });
  return (await r.json()).projects;
});
const expected = {
  submissions: rows.filter((r) => r.statusCustomer === "submitted").map((r) => r.ref),
  inReview: rows.filter((r) => r.statusCustomer === "under_review").map((r) => r.ref),
  readyToIssue: rows.filter((r) => r.issuable).map((r) => r.ref),
  awaitingPayment: rows.filter((r) => ["deposit_invoiced", "balance_invoiced"].includes(r.orderStage)).map((r) => r.ref),
};
console.log("live endpoint predicates:", expected);

await page.goto(`${OPS}/attention`);
await page.getByRole("heading", { name: "Attention", level: 1 }).waitFor();

for (const [key, refs] of Object.entries(expected)) {
  const row = page.getByTestId(`attention-row-${key}`);
  if (refs.length === 0) {
    assert.equal(await row.count(), 0, `criterion 14: ${key} matched nothing, so no row may be drawn`);
    console.log(`  ${key}: 0 matches, no row drawn — OK`);
    continue;
  }
  const text = await row.innerText();
  assert.ok(text.startsWith(String(refs.length)), `${key}: gate says "${text}", predicate says ${refs.length}`);

  await row.click();
  await page.waitForURL(`${OPS}/projects`);
  const listed = page.getByTestId("queue-row");
  await listed.first().waitFor();
  assert.equal(await listed.count(), refs.length, `${key}: listed rows must equal the count`);
  for (const ref of refs) {
    assert.equal(await listed.filter({ hasText: ref }).count(), 1, `${key}: ${ref} must be listed`);
  }
  for (const other of rows.map((r) => r.ref).filter((r) => !refs.includes(r))) {
    assert.equal(await listed.filter({ hasText: other }).count(), 0, `${key}: ${other} must NOT be listed`);
  }
  await page.getByTestId("queue-active-filters").getByRole("button", { name: "Clear" }).click();
  console.log(`  ${key}: count ${refs.length} == list ${refs.join(",")} — OK`);
  await page.goto(`${OPS}/attention`);
}

// Criterion 7 on real data: the old summary SQL counts a project the issue gate
// refuses. The gate must not show it.
const summary = await page.evaluate(async () => (await fetch("/api/ops/summary", { credentials: "same-origin" })).json());
console.log("old summary readyToIssue =", summary.readyToIssue, "| gate's issuable count =", expected.readyToIssue.length);
assert.notEqual(summary.readyToIssue, expected.readyToIssue.length, "the probe row must make the two disagree");
assert.equal(await page.getByTestId("attention-row-readyToIssue").count(), 0,
  "criterion 7: a project the issue gate refuses must not be counted as ready to issue");

console.log("LIVE PROBE PASS");
await browser.close();
