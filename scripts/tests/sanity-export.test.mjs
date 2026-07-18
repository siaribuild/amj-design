import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { projectRoot, run } from "./helpers.mjs";

const output = join(projectRoot, "sanity", "catalogue.ndjson");

test("Sanity NDJSON export has stable counts, unique ids, and valid references", async () => {
  try {
    await run(process.execPath, ["scripts/sanity-export-ndjson.mjs"]);
    const documents = (await readFile(output, "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(documents.length, 66);
    assert.deepEqual(
      Object.fromEntries(["category", "family", "product", "colour"].map((type) => [type, documents.filter((d) => d._type === type).length])),
      { category: 2, family: 13, product: 27, colour: 24 },
    );
    const ids = new Set(documents.map((document) => document._id));
    assert.equal(ids.size, documents.length);
    for (const document of documents) {
      assert.ok(document._id);
      assert.ok(document._type);
      for (const reference of [document.category, document.family].filter(Boolean)) {
        assert.equal(reference._type, "reference");
        assert.ok(ids.has(reference._ref), `${document._id} references missing ${reference._ref}`);
      }
    }
  } finally {
    await rm(output, { force: true });
  }
});

test("Sanity object-array members have stable _key values", async () => {
  try {
    await run(process.execPath, ["scripts/sanity-export-ndjson.mjs"]);
    const documents = (await readFile(output, "utf8")).trim().split("\n").map(JSON.parse);
    const missing = [];
    for (const product of documents.filter((document) => document._type === "product")) {
      for (const field of ["keySpecs", "specs", "options"]) {
        product[field]?.forEach((member, index) => {
          if (!member._key) missing.push(`${product._id}.${field}[${index}]`);
        });
      }
    }
    assert.equal(missing.length, 0, `${missing.length} object-array members are missing _key values`);
  } finally {
    await rm(output, { force: true });
  }
});
