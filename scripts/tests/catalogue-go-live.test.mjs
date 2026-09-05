import { test } from "node:test";
import assert from "node:assert/strict";
import { run, resolveToken } from "../catalogue/apply-go-live-min.mjs";
import { makeWorld, makeTransport } from "./fixtures/go-live-world.mjs";

test("dry run: zero writes, correct summary line", async () => {
  const world = makeWorld();
  const { fetchImpl, requests } = makeTransport(world);
  const lines = [];
  const code = await run({ write: false, fetchImpl, log: (l) => lines.push(l), error: (l) => lines.push(l) });
  assert.equal(code, 0);
  assert.equal(requests.filter((r) => r.method === "POST").length, 0);
  assert.ok(lines.includes("21 amend target(s), 1 create target(s)"), lines.join("\n"));
});

test("write with no token: refuses before any network request", async () => {
  const world = makeWorld();
  const { fetchImpl, requests } = makeTransport(world);
  const savedToken = process.env.SANITY_WRITE_TOKEN;
  const savedHome = process.env.HOME;
  const savedProfile = process.env.USERPROFILE;
  delete process.env.SANITY_WRITE_TOKEN;
  process.env.HOME = "/nonexistent-go-live-test-home";
  process.env.USERPROFILE = "/nonexistent-go-live-test-home";
  try {
    assert.equal(resolveToken(), null);
    const code = await run({ write: true, fetchImpl, log: () => {}, error: () => {} });
    assert.equal(code, 1);
    assert.equal(requests.length, 0);
  } finally {
    if (savedToken === undefined) delete process.env.SANITY_WRITE_TOKEN;
    else process.env.SANITY_WRITE_TOKEN = savedToken;
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedProfile;
  }
});
