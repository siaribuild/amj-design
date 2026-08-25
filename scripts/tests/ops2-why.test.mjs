// "Why this product" — every sentence on the surface, held where it can be read
// without a browser.
//
// The copy module is PURE: it takes the rationale DTO and returns strings. That
// is the whole reason it exists as a module rather than as JSX — R2's ban ("no
// word frames a human's change as an error") is a claim about a string table,
// and a claim about a string table is settled by reading the table.
//
// TS is bundled once with esbuild, as ops2-navigation.test.mjs does.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("ops2-why");
const outfile = join(runDir, "ops2-why-bundle.mjs");
await build({
  stdin: {
    contents: `export * from ${p("src/ops2/projects/whyCopy.ts")};`,
    resolveDir: projectRoot,
    sourcefile: "ops2-why-entry.ts",
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const M = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
test.after(async () => { await removeRunDir(runDir); });

// ── R2, R5, D18: the bans, read off the table itself ────────────────────────
//
// Not a walk of the states — every state this build has, plus every state added
// later, plus every string an editor drops in. That is the point of the copy
// living in one module.
const BANNED = [
  // R2 — no word frames a person's change as an error.
  /\bwrong\b/i, /\bincorrect\b/i, /\bmistake\b/i, /\berror\b/i, /\bcorrection\b/i,
  /should have/i, /failed to/i,
  // R5 — no certification vocabulary, in any phase.
  /\bcertifi/i, /\bWERS\b/i, /indicative estimate/i,
  // D18 — no MONEY anywhere on this surface: no currency symbol, no GST, no
  // ex/inc. Deliberately not the word "price": the approved copy says a pick
  // was made "on fit and price", which names the rule that won and shows no
  // figure. The stronger half of D18 — that no price VALUE can reach the screen
  // — is enforced by the DTO having no price field and asserted on the raw
  // response body in why-rationale-api.test.mjs, which is where it belongs.
  /\$/, /\bGST\b/i, /\bAUD\b/i, /\b(ex|inc)\s+GST\b/i,
];
const stringsIn = (source) => [
  ...source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    .matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g),
].map((m) => m[1] ?? m[2] ?? m[3])
  // A `${…}` hole is CODE, not copy. Scanning it would report the interpolation
  // marker as a currency symbol and — worse — would let a banned word reach the
  // screen through an identifier the ban never looked at.
  .map((s) => (s ?? "").replace(/\$\{[^}]*\}/g, " "))
  .filter((s) => /[a-z]{3}/i.test(s));
const banned = (text) => BANNED.filter((re) => re.test(text)).map(String);

const REQUIREMENT = (o = {}) => ({
  maxUValue: 3.9, minShgc: null, maxShgc: 0.44,
  basis: "explicit_energy_report", absent: false, ...o,
});

test("R2/R5/D18 the banned vocabulary, over this module's WHOLE string table", () => {
  // THE SCANNER FIRST. A predicate that has quietly stopped matching reports a
  // clean table over every table — this feature has now shipped six assertions
  // that could not fail, and none of them looked wrong.
  assert.deepEqual(banned("this was incorrect").length, 1);
  assert.deepEqual(banned("the reviewer should have chosen the other one").length, 1);
  assert.ok(banned("$1,840.00 ex GST").length >= 1);
  assert.ok(banned("certified to WERS").length >= 2);
  assert.deepEqual(banned("nothing met the caps, so the cheapest within 8% of the closest"), []);

  // AND THAT IT IS READING SOMETHING. A regex over a file that failed to load
  // finds nothing and passes.
  const source = readFileSync(join(projectRoot, "src/ops2/projects/whyCopy.ts"), "utf8");
  const table = stringsIn(source);
  assert.ok(table.length >= 15, `only ${table.length} strings found — the extractor has drifted`);
  assert.ok(table.includes("a person chose this product"), "and it reaches the sentences it is meant to hold");
  assert.ok(table.includes("met the caps"));

  for (const s of table) {
    assert.deepEqual(banned(s), [], `whyCopy.ts: "${s}" carries banned vocabulary`);
  }
});

test("WHY-AC-2/3 the caps, and the label saying where they came from", () => {
  // The figures, at the precision the mock shows — two places on both axes, so
  // 3.9 and 3.90 are one number and read as one number.
  assert.equal(M.requirementText(REQUIREMENT()), "Uw ≤ 3.90 · SHGC ≤ 0.44");
  assert.equal(M.requirementText(REQUIREMENT({ maxShgc: null })), "Uw ≤ 3.90");
  assert.equal(M.requirementText(REQUIREMENT({ minShgc: 0.35 })), "Uw ≤ 3.90 · SHGC 0.35–0.44");

  // WHY-AC-3: no cap figure at all, and no em-dash standing in for one. This
  // opening was never given a requirement; a blank row would claim the platform
  // looked and found nothing.
  assert.equal(M.requirementText(REQUIREMENT({ absent: true })), "this opening had no thermal requirement");
  assert.equal(M.requirementText(REQUIREMENT({ absent: true, maxUValue: 3.9 })),
    "this opening had no thermal requirement", "absent wins over a stale cap on the same record");

  // R4: the origin label is a fact about the requirement, one per basis.
  assert.deepEqual(
    ["explicit_energy_report", "plan_derived", "default_envelope", "human_override"]
      .map((b) => M.basisLabel(b)),
    [
      "parsed from an energy report",
      "modelled by the platform from the plan",
      "a default value the platform applies",
      "set by a person",
    ],
  );
  assert.equal(M.basisLabel(null), null, "no basis recorded, so no label — never an invented one");
  assert.equal(M.basisLabel("something_new"), null, "and a basis this build does not know is not guessed at");
});

test("WHY-AC-4 §9.0 a figure that is not a number is never rendered as one", () => {
  assert.equal(M.figuresText({ uValue: 3.72, shgc: 0.41 }), "Uw 3.72 · SHGC 0.41");

  // ONE AXIS MISSING. The other is still worth reading, so the row survives and
  // says which half is absent — never a zero, never a dash, never a dropped row.
  assert.equal(M.figuresText({ uValue: 3.72, shgc: null }), "Uw 3.72 · SHGC not recorded");
  assert.equal(M.figuresText({ uValue: null, shgc: 0.41 }), "Uw not recorded · SHGC 0.41");

  // A REAL ZERO IS A FIGURE. `0` is falsy and this is exactly where a truthiness
  // test would swallow it and report the absence the spec forbids.
  assert.equal(M.figuresText({ uValue: 0, shgc: 0 }), "Uw 0.00 · SHGC 0.00");

  // BOTH ABSENCES SAY THE SAME THING HERE, deliberately. `null` (never
  // captured) and `{null,null}` (captured, no figure) are the same thing to say
  // about a NUMBER; which one it is is said by the panel's foot sentence and by
  // the DTO's kind. This function can only see the figures, and §9.0 is explicit
  // that the figures cannot tell them apart.
  assert.equal(M.figuresText({ uValue: null, shgc: null }), "not recorded");
  assert.equal(M.figuresText(null), "not recorded");
  assert.equal(M.figuresText(undefined), "not recorded");
});

/** A `recommendation` DTO, with the one thing each case turns on overridden. */
const recommendation = (o = {}) => ({
  kind: "recommendation",
  requirement: REQUIREMENT(o.requirement),
  tolerance: o.tolerance ?? 0.08,
  competingTier: o.competingTier ?? "meets",
  recommended: {
    productSlug: "amj67-awning", productName: "AMJ67T Awning", variantId: "v1",
    form: o.form ?? "single", tier: o.competingTier ?? "meets", rank: 1,
    figures: { uValue: 3.41, shgc: 0.39 }, fits: true, units: o.units ?? null,
  },
  alternatives: [],
  selectionChanged: o.selectionChanged ?? null,
  current: { productSlug: "amj67-awning", productName: "AMJ67 Awning", figures: { uValue: 3.72, shgc: 0.41 } },
  composite: o.composite ?? null,
  unsuppliedSplitNote: null,
});

test("R6/D20 three lines when the platform chose, two when a person did — and the structure never moves", () => {
  const labels = (dto) => M.panelCopy(dto).lines.map((l) => l.k);

  // S1: the ordinary machine case.
  const plain = M.panelCopy(recommendation());
  assert.deepEqual(labels(recommendation()), ["Had to meet", "This one", "Chosen"]);
  assert.equal(plain.lines[0].v, "Uw ≤ 3.90 · SHGC ≤ 0.44");
  assert.equal(plain.lines[0].origin, "parsed from an energy report");
  assert.equal(plain.lines[1].v, "Uw 3.72 · SHGC 0.41");
  assert.equal(plain.lines[2].v, "the cheapest of those that met the caps");
  assert.equal(plain.foot, null);
  assert.equal(plain.door, "Why this product — open what else was considered");

  // S3 / D20: A PERSON CHANGED IT. The labels are byte-identical to S1's and
  // only the "Chosen" sentence differs — that is the whole of the ruling, and
  // it is asserted against the unchanged panel rather than against a list
  // written out twice.
  const changed = M.panelCopy(recommendation({ selectionChanged: { product: false, glazing: true } }));
  assert.deepEqual(changed.lines.map((l) => l.k), plain.lines.map((l) => l.k),
    "same three labels, changed or not");
  assert.equal(changed.lines[0].v, plain.lines[0].v, "'Had to meet' is byte-identical — the target does not move");
  assert.equal(changed.lines[1].v, plain.lines[1].v);
  assert.notEqual(changed.lines[2].v, plain.lines[2].v, "and the 'Chosen' sentence is the one thing that does");
  assert.equal(changed.lines[2].v, "a person chose this — the platform had recommended AMJ67T Awning");

  // R12: it must say WHICH of frame or glazing moved, and the qualifier rides
  // on the figures line it explains rather than becoming a fourth line.
  assert.equal(changed.lines[1].qualifier, "glazing changed");
  assert.equal(changed.lines.length, 3, "still three — the qualifier is not a line");
  assert.equal(M.panelCopy(recommendation({ selectionChanged: { product: true, glazing: false } })).lines[1].qualifier,
    "frame changed");
  assert.equal(M.panelCopy(recommendation({ selectionChanged: { product: true, glazing: true } })).lines[1].qualifier,
    "frame and glazing changed");
  // The variant alone moved: something changed, and neither of the two things
  // this surface shows is what did — so no qualifier is invented.
  assert.equal(M.panelCopy(recommendation({ selectionChanged: { product: false, glazing: false } })).lines[1].qualifier,
    null);
  assert.equal(plain.lines[1].qualifier, null, "and an unchanged line carries none");
  assert.equal(changed.door, "Why this product — open the comparison and what else was considered");

  // S6/S7/S8: two lines, no "Had to meet", and NO DOOR — a control drawn for a
  // panel that would open empty is the defect this effort has recorded four
  // times (WHY-AC-41).
  const human = {
    kind: "human", units: null,
    current: { productSlug: "x", productName: "AMJ92 Sliding", figures: { uValue: 4.35, shgc: 0.58 } },
  };
  assert.deepEqual(labels(human), ["This one", "Chosen"]);
  assert.equal(M.panelCopy(human).door, null);
  assert.equal(M.panelCopy(human).lines[1].v, "a person chose this product");
  assert.equal(M.panelCopy(human).foot, null, "its figures WERE captured, so there is nothing to explain");

  // WHY-AC-9, absence 1: the COLUMN is null — saved before the capture existed.
  // The foot sentence is what tells this apart from absence 2, because the
  // figures read the same in both.
  const preCapture = { ...human, current: { ...human.current, figures: null } };
  assert.equal(M.panelCopy(preCapture).lines[0].v, "not recorded");
  assert.equal(M.panelCopy(preCapture).foot,
    "This line was saved before performance figures were kept on a line.");

  // WHY-AC-9, absence 2: captured, and the product has no published figure.
  // Same words in the value, NO foot sentence — and the difference came from
  // the DTO, never from looking at the figures.
  const noFigure = { ...human, current: { ...human.current, figures: { uValue: null, shgc: null } } };
  assert.equal(M.panelCopy(noFigure).lines[0].v, "not recorded");
  assert.equal(M.panelCopy(noFigure).foot, null,
    "captured-and-nothing is a different fact from never-asked, and only one of them gets the sentence");

  // WHY-AC-9's SECOND MEANING, which is a third state and not the same absence
  // at all: the run selected nothing. It arrives as a KIND — the figures here
  // are present-and-null, exactly as in `noFigure` above, and could never have
  // told the two apart.
  const unresolved = { kind: "unresolved", current: { ...human.current, figures: { uValue: null, shgc: null } } };
  assert.deepEqual(labels(unresolved), ["This one", "Chosen"]);
  assert.equal(M.panelCopy(unresolved).lines[0].v, "no selection was made on this line");
  assert.notEqual(M.panelCopy(unresolved).lines[0].v, M.panelCopy(noFigure).lines[0].v,
    "and it must NOT read as 'this product has no published figure'");
  assert.equal(M.panelCopy(unresolved).door, null);

  // S8: a run from an earlier model. Two lines, the line's own figures, no door.
  const unrecorded = { kind: "unrecorded", current: human.current };
  assert.deepEqual(labels(unrecorded), ["This one", "Chosen"]);
  assert.equal(M.panelCopy(unrecorded).lines[0].v, "Uw 4.35 · SHGC 0.58");
  assert.equal(M.panelCopy(unrecorded).lines[1].v, "recorded by an earlier model, whose reasoning was not kept");
  assert.equal(M.panelCopy(unrecorded).door, null);

  // S5: the ops-decided split. "These ones", each unit's own figures, capped at
  // three with the remainder STATED — there is no detail behind this panel, so
  // the fourth unit has nowhere else to live.
  const unit = (code, figures) => ({ code, productSlug: "u", productName: "U", figures, band: null, basis: null, reviewFlag: false });
  const opsSplit = {
    kind: "human",
    current: { productSlug: "x", productName: "X", figures: { uValue: 3.9, shgc: 0.44 } },
    units: [
      unit("W12A", { uValue: 3.72, shgc: 0.41 }),
      unit("W12B", { uValue: 4.1, shgc: 0.52 }),
      unit("W12C", null),
      unit("W12D", { uValue: 3.5, shgc: 0.4 }),
      unit("W12E", { uValue: 3.5, shgc: 0.4 }),
    ],
  };
  const split = M.panelCopy(opsSplit);
  assert.deepEqual(labels(opsSplit), ["These ones", "Chosen"]);
  assert.deepEqual(split.lines[0].units, [
    { code: "W12A", figures: "Uw 3.72 · SHGC 0.41" },
    { code: "W12B", figures: "Uw 4.10 · SHGC 0.52" },
    { code: "W12C", figures: "not recorded" },
  ]);
  assert.equal(split.more, "+2 more units", "the budget bit, and it says so");
  assert.equal(split.lines[1].v, "a person decided this split");
  assert.equal(split.door, null, "R17: a person decided it, so there is no machine rationale to open");
  // Three units exactly does not claim a remainder.
  assert.equal(M.panelCopy({ ...opsSplit, units: opsSplit.units.slice(0, 3) }).more, null);

  // S4: the machine-proposed composite. A parent has no product and no figures
  // of its own, so "This one" names the MAKE-UP — and the door is still there.
  const composite = recommendation({
    form: "split",
    composite: { origin: "ai", beatenSingle: null, units: [unit("W07A", null), unit("W07B", null)] },
  });
  assert.deepEqual(labels(composite), ["Had to meet", "This one", "Chosen"]);
  assert.equal(M.panelCopy(composite).lines[1].v, "made as 2 units");
  assert.equal(M.panelCopy(composite).door,
    "Why this product — open why it was split and what else was considered");
});

test("WHY-AC-12/13/33 the ladder names what it shows and counts nothing beyond it", () => {
  const candidate = (o) => ({
    productSlug: "p", productName: "AMJ67 Awning", variantId: null, form: "single",
    tier: "meets", rank: 2, figures: { uValue: 3.72, shgc: 0.41 }, fits: true, units: null, ...o,
  });

  assert.equal(M.candidateName(candidate()), "AMJ67 Awning");
  assert.equal(M.candidateFigures(candidate()), "Uw 3.72 · SHGC 0.41");

  // A MAKE-UP HAS NO SINGLE ASSEMBLY FIGURE. The cell says what it is rather
  // than a number nobody recorded, and the name comes from the units.
  const split = candidate({
    form: "split",
    units: [
      { productSlug: "a", productName: "A", operationType: "awning" },
      { productSlug: "b", productName: "B", operationType: "fixed" },
    ],
  });
  assert.equal(M.candidateName(split), "Split: awning + fixed");
  assert.equal(M.candidateFigures(split), "2 units");
  // …and with no operation types recorded it still names itself honestly.
  assert.equal(M.candidateName(candidate({ form: "split", units: [{ productSlug: "a", productName: "A", operationType: null }] })),
    "Split: 1 units");

  // R24: the chosen row must not claim to describe the current line.
  assert.equal(M.chosenRowMark(null), "· chosen");
  assert.equal(M.chosenRowMark({ product: false, glazing: true }), "· the platform's pick");

  // WHY-AC-13: fewer than five states what exists and counts NOTHING beyond it.
  assert.match(M.ladderNote(5), /the next four by rank/);
  assert.match(M.ladderNote(3), /^Three candidates were recorded/);
  assert.match(M.ladderNote(1), /^One candidate was recorded/);
  for (const shown of [1, 2, 3, 4]) {
    assert.equal(/remaining|other|not shown|more candidate/i.test(M.ladderNote(shown)), false,
      `${shown} rows: no count of anything beyond the list`);
  }

  // WHY-AC-34/35: a lite's band, and NOTHING computed when none was recorded.
  assert.equal(M.unitBandText({ maxUValue: 3.9, minShgc: 0.37, maxShgc: 0.41 }), "Uw ≤ 3.90 · SHGC 0.37–0.41");
  assert.equal(M.unitBandText({ maxUValue: 3.9, minShgc: null, maxShgc: null }), "Uw ≤ 3.90");
  assert.equal(M.unitBandText(null), null);
  assert.equal(M.unitBandText({ maxUValue: null, minShgc: null, maxShgc: null }), null,
    "a band recorded with no figures in it is no band");

  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21].map(M.rankedText),
    ["ranked 1st", "ranked 2nd", "ranked 3rd", "ranked 4th",
      "ranked 11th", "ranked 12th", "ranked 13th", "ranked 21st"]);
  assert.equal(M.rankedText(null), null);
});

test("WHY-AC-27 the comparison verdict, in WHY-AC-17's vocabulary and never attempted without figures", () => {
  const v = (figures, tolerance = 0.08, req = REQUIREMENT()) => M.comparisonVerdict(figures, req, tolerance);

  assert.equal(v({ uValue: 3.7, shgc: 0.41 }), "met the caps");
  // Uw ≤ 3.90 with an 8% band tops out at 4.212.
  assert.equal(v({ uValue: 4.1, shgc: 0.41 }), "within the 8% band");
  assert.equal(v({ uValue: 4.3, shgc: 0.41 }), "missed the Uw cap");
  assert.equal(v({ uValue: 3.7, shgc: 0.52 }), "missed the SHGC cap");
  assert.equal(v({ uValue: 4.3, shgc: 0.52 }), "missed both caps");

  // THE BAND IS THE RUN'S HERE TOO. One variable moves — the tolerance — and
  // the same figures change their verdict, which is what a hardcoded 5 could
  // never do.
  assert.equal(v({ uValue: 4.1, shgc: 0.41 }, 0.02), "missed the Uw cap");
  assert.equal(v({ uValue: 4.1, shgc: 0.41 }, 0.2), "within the 8% band".replace("8", "20"));

  // WHY-AC-27's second limb: the comparison is NOT ATTEMPTED when the figures
  // are not numbers. The row is omitted rather than guessed — and both absences
  // behave the same here, because neither is a number to compare.
  assert.equal(v(null), null);
  assert.equal(v({ uValue: null, shgc: null }), null);
  // A requirement that was never set has nothing to compare against either.
  assert.equal(v({ uValue: 3.7, shgc: 0.41 }, 0.08, REQUIREMENT({ absent: true })), null);

  // One axis recorded, one not: still answerable on the axis that exists.
  assert.equal(v({ uValue: 4.3, shgc: null }), "missed the Uw cap");
  assert.equal(v({ uValue: null, shgc: 0.41 }), "met the caps");
});

test("WHY-AC-17 a ladder row's verdict is derived from its tier and its own figures", () => {
  const row = (o) => ({
    productSlug: "x", productName: "X", variantId: null, form: "single",
    tier: "meets", rank: 2, figures: { uValue: 3.4, shgc: 0.39 }, fits: true, units: null, ...o,
  });
  const req = REQUIREMENT();
  const verdict = (o) => M.verdictWord(row(o), req, 0.08);

  assert.equal(verdict({ tier: "meets" }), "met the caps");
  assert.equal(verdict({ tier: "within_tolerance" }), "within the 8% band");
  assert.equal(verdict({ tier: "thermal_unknown" }), "no figure on the constrained axis");
  assert.equal(verdict({ tier: "does_not_fit", fits: false }), "would not fit at this size");

  // WHICH cap was missed is a fact about two numbers against the recorded caps
  // — the requirement is Uw ≤ 3.90, SHGC ≤ 0.44.
  assert.equal(verdict({ tier: "misses", figures: { uValue: 4.1, shgc: 0.42 } }), "missed the Uw cap");
  assert.equal(verdict({ tier: "misses", figures: { uValue: 3.7, shgc: 0.52 } }), "missed the SHGC cap");
  assert.equal(verdict({ tier: "misses", figures: { uValue: 4.1, shgc: 0.52 } }), "missed both caps");
  // A miss with a figure absent on one axis names only the axis it can name.
  assert.equal(verdict({ tier: "misses", figures: { uValue: null, shgc: 0.52 } }), "missed the SHGC cap");
  // …and one it cannot name at all does not invent an axis.
  assert.equal(verdict({ tier: "misses", figures: { uValue: null, shgc: null } }), "missed the caps");

  // The band is the RUN's here too — the same hardcoded-5 trap, one level down.
  assert.equal(M.verdictWord(row({ tier: "within_tolerance" }), req, 0.05), "within the 5% band");

  // R2: no verdict word calls anything wrong. "Missed a cap" is arithmetic.
  for (const tier of ["meets", "within_tolerance", "misses", "thermal_unknown", "does_not_fit"]) {
    assert.equal(/wrong|incorrect|mistake|error|correction|should have|failed to/i.test(verdict({ tier })), false);
  }
});

test("WHY-AC-5/6 the 'Chosen' sentence names the winning rule, and reads the band off the run", () => {
  const chosen = (o) => M.chosenLine(recommendation(o));

  assert.equal(chosen({ competingTier: "meets" }).text, "the cheapest of those that met the caps");
  assert.equal(chosen({ competingTier: "within_tolerance" }).text,
    "nothing met the caps, so the cheapest within 8% of the closest");
  assert.equal(chosen({ competingTier: "misses" }).text,
    "nothing came within the 8% band, so the closest was taken");
  assert.equal(chosen({ competingTier: "thermal_unknown" }).text,
    "no figure existed on the constrained axis, so it was chosen on fit and price");
  assert.equal(chosen({ competingTier: "does_not_fit" }).text,
    "nothing fitted this opening, so the best fit was taken");

  // WHY-AC-6: THE BAND IS THE RUN'S. A run stamped 0.05 says 5% on the same
  // sentence a run stamped 0.08 says 8% on — this is the assertion that catches
  // a hardcoded 5, which is what the number was for the whole life of the model.
  assert.match(chosen({ competingTier: "within_tolerance", tolerance: 0.05 }).text, /within 5% of/);
  assert.match(chosen({ competingTier: "misses", tolerance: 0.125 }).text, /the 12.5% band/);
  assert.match(chosen({ competingTier: "within_tolerance", tolerance: 0.1 }).text, /within 10% of/);

  // R7: the band is NAMED, never paraphrased as "the closest available".
  for (const tier of ["within_tolerance", "misses"]) {
    assert.match(chosen({ competingTier: tier }).text, /\d+(\.\d+)?%/, `${tier} states the band as a figure`);
  }

  // WHY-AC-3's other half: with no requirement, the sentence claims no thermal
  // victory — every candidate meets by definition and saying so would be a
  // boast about nothing.
  assert.equal(chosen({ requirement: { absent: true } }).text, "the cheapest that fitted the opening");
  assert.equal(chosen({ requirement: { absent: true } }).text.includes("cap"), false);

  // TONE. `warn` in this console means "ours to resolve, the human proceeds" —
  // never attention/red, because nothing on this surface is an error.
  assert.equal(chosen({ competingTier: "meets" }).tone, "plain");
  for (const tier of ["within_tolerance", "misses", "thermal_unknown", "does_not_fit"]) {
    assert.equal(chosen({ competingTier: tier }).tone, "warn", `${tier} is unresolved, so it is toned`);
  }
});
