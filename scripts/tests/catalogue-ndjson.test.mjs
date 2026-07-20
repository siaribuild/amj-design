// Validate the committed Sanity import (sanity/catalogue.ndjson) — the normalized
// seed for the catalogue. Guards the single-source-of-truth model: shared option
// documents, product option references that resolve, and image assets.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "./helpers.mjs";

const docs = readFileSync(join(projectRoot, "sanity", "catalogue.ndjson"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));
const byId = new Map(docs.map((d) => [d._id, d]));
const resolves = (r) => !!r && r._type === "reference" && byId.has(r._ref);

test("catalogue NDJSON: unique ids and every reference resolves", () => {
  assert.equal(byId.size, docs.length, "duplicate _id in export");
  const counts = {};
  for (const d of docs) counts[d._type] = (counts[d._type] ?? 0) + 1;
  assert.ok(counts.category >= 1 && counts.family >= 1 && counts.product >= 1);
  assert.ok(counts.optionType >= 1 && counts.option >= 1, "has shared optionType + option docs");

  for (const d of docs) {
    if (d._type === "family") assert.ok(resolves(d.category), `${d._id} -> category`);
    if (d._type === "option") assert.ok(resolves(d.optionType), `${d._id} -> optionType`);
    if (d._type === "product") {
      assert.ok(resolves(d.family) && resolves(d.category), `${d._id} -> family/category`);
      for (const po of d.options ?? []) {
        assert.equal(po._type, "productOption");
        assert.ok(po._key, `${d._id} option needs _key`);
        assert.ok(resolves(po.option), `${d._id} option ref ${po.option?._ref} missing`);
        assert.ok(["standard", "optional"].includes(po.availability));
      }
    }
  }
});

test("catalogue NDJSON: single shared Colour type, priced options, image assets", () => {
  const colour = docs.find((d) => d._type === "optionType" && d.slug?.current === "colour");
  assert.ok(colour?.appliesToAll === true, "colour is the shared applies-to-all type");
  assert.equal(docs.find((d) => d._type === "optionType" && d.slug?.current === "finish"), undefined, "no finish type");

  for (const o of docs.filter((d) => d._type === "option")) {
    assert.ok(resolves(o.optionType), `${o._id} -> optionType`);
    assert.equal(typeof o.pricingComponent, "number", `${o._id} has a numeric price`);
  }
  // exactly one default colour (the preselected swatch)
  assert.equal(docs.filter((d) => d._type === "option" && d.isDefault).length, 1);

  const withHero = docs.find((d) => d._type === "product" && d.heroImage);
  assert.ok(withHero, "a product has a hero image");
  assert.ok(String(withHero.heroImage._sanityAsset).startsWith("image@"), "hero uploads as a Sanity asset");
});
