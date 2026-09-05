import { test } from "node:test";
import assert from "node:assert/strict";
import { run, resolveToken } from "../catalogue/apply-go-live-min.mjs";
import { plan, assertSafe, DISABLE } from "../catalogue/go-live-plan.mjs";
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

test("assertSafe: the real plan has no violations", () => {
  const { mutations } = plan(makeWorld());
  assert.deepEqual(assertSafe(mutations), []);
});

test("assertSafe: catches a mutation key outside the allow-list (e.g. delete)", () => {
  assert.ok(assertSafe([{ delete: { id: "product-x" } }]).length > 0);
});

test("assertSafe: catches a slug set key", () => {
  assert.ok(assertSafe([{ patch: { id: "product-x", set: { slug: { current: "x" } } } }]).length > 0);
});

test("assertSafe: catches createOrReplace of a product", () => {
  assert.ok(assertSafe([{ createOrReplace: { _id: "product-x", _type: "product" } }]).length > 0);
});

test("assertSafe: catches a patch key outside {id, set} (e.g. unset)", () => {
  assert.ok(assertSafe([{ patch: { id: "product-x", set: {}, unset: ["name"] } }]).length > 0);
});

test("assertSafe: catches a target id starting with drafts.", () => {
  assert.ok(assertSafe([{ patch: { id: "drafts.product-x", set: {} } }]).length > 0);
});

test("disable patch sets exactly {disabled: true}", () => {
  const { mutations } = plan(makeWorld());
  const slug = DISABLE[0];
  const m = mutations.find((m) => m.patch?.id === `product-${slug}`);
  assert.deepEqual(m.patch.set, { disabled: true });
});

test("no set anywhere in the plan carries a slug key", () => {
  const { mutations } = plan(makeWorld());
  for (const m of mutations) {
    if (m.patch?.set) assert.ok(!("slug" in m.patch.set), JSON.stringify(m));
  }
});

test("product with null options and no hardware column: no options key in its patch set", () => {
  const world = makeWorld();
  const slug = "amj72t-fixed-window";
  const p = world.products.get(slug);
  p.options = null;
  const { mutations } = plan(world);
  const m = mutations.find((m) => m.patch?.id === p._id);
  assert.ok(m, "expected a patch mutation for this product");
  assert.ok(!("options" in m.patch.set), JSON.stringify(m.patch.set));
});

test("write: an unsafe plan aborts before any POST", async () => {
  const world = makeWorld();
  const { fetchImpl, requests } = makeTransport(world);
  const savedToken = process.env.SANITY_WRITE_TOKEN;
  process.env.SANITY_WRITE_TOKEN = "fake-token";
  try {
    const planImpl = () => ({ mutations: [{ delete: { id: "product-x" } }], report: [], problems: [], summary: { amend: 0, create: 0 } });
    const code = await run({ write: true, fetchImpl, log: () => {}, error: () => {}, planImpl });
    assert.equal(code, 1);
    assert.equal(requests.filter((r) => r.method === "POST").length, 0);
  } finally {
    if (savedToken === undefined) delete process.env.SANITY_WRITE_TOKEN;
    else process.env.SANITY_WRITE_TOKEN = savedToken;
  }
});
