# plan-parse-method — decisions

Owner answers to the product-manager's gate, 2026-08-28. Binding on the design
and the build.

---

**D-1 — Coverage bar.** The gate is **19 of 19, or it has not worked.**

A: The owner's standing bar applied literally — *"the fallback already works
ok-ish, so anything short of 100% is waste of time."* Zero wrong readings and
zero wrong placements remain absolute and automatic on top of it.

*Consequence the PM raised and the owner has now overruled:* four of the 19 are
doors, and nobody has yet verified that all 19 are drawn on an external
elevation. If some opening is genuinely not drawn, 19-of-19 is unreachable for a
reason that is not the reader's fault. **That does not lower the bar.** It makes
"which openings are actually drawn" a fact the label sheet must establish, and if
the answer is fewer than 19 the owner is told, in those words, rather than the
gate being quietly relaxed.

---

**D-2 — Ground truth.** A: *"We can use the pdf i've been using for testing as a
reference."*

The reference document — `20016_Lot 312 Banjo Boulevard_Plans.pdf`, the set
already used for every test run — is the fixture. Ground truth is derived from
it: 19 rows, each with its elevation letter, left-to-right position on that
elevation, and true composition.

**Still outstanding, and it must not be assumed:** the owner has named the
source, not confirmed the truth table. The label sheet is derived from that PDF
and shown to the owner once before the gate is judged against it. A gate scored
against an unconfirmed truth table measures agreement with ourselves.

---

**D-3 — Pass A does not read tags. REMOVE.** A: *"Remove it — back to the
design."*

Design §4.1 stands: Pass A is asked for window-shaped objects and **names
nothing**. The tag-reading added to `elevation_inventory` earlier in this
session (promptVersion v2) is withdrawn, and with it the tag-first path in
`assign` — including the tag key, `duplicate_tag`, and the tag/proportion
precedence in `preferLocation` / `locationVerdict`.

Dead machinery goes with it rather than being left "in case": with no tags, the
`by` discriminator has one value, and a field with one value is not a signal.
The architect specifies exactly what is deleted; nothing survives commented out.

---

**D-4 — Order along the wall is ASKED of the model.** A: *"Ask the model."*

Consistent with the owner's 2026-08-27 ruling: *"I don't want to reinvent that
and all edge cases if the result can be achieved by utilising more clever and
expensive at runtime model."* Arithmetic on a single wall axis cannot handle an
L-shaped wall with windows on both legs, and re-deriving that geometry per
drafter is the work the owner declined.

So the floor-plan pass answers **both** §4.2 signals it owns — which elevation a
tag belongs to, and its order along that wall — in one call per plan page. The
tag list from the text layer remains the closed vocabulary: the model places and
orders openings, it never invents one.

---

**Taken on the PM's recommendation, no owner objection raised:**

- Read wall-clock held to **90 s** on the reference document, with per-run call
  counts and timings recorded.
- **No generalisation** to other drafters' conventions yet. A set with no
  recognised elevation labels reports "no elevation labels recognised"; the
  second real plan set is what says what the second convention is.
