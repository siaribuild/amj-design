import { defineConfig, enforceTdd } from '@nizos/probity'

// TDD guardrails (Probity). Scope chosen deliberately:
// - worker/**, src/data/** and src/ops2/** carry the business logic covered by
//   scripts/tests/*.mjs
// - scripts/tests/** is included so test writes are held to one-failing-test-at-a-time
// - the customer site's components (src/ outside data/ and ops2/), migrations,
//   docs, and config stay exempt.
//
// WHY THE WINDOW IS WIDENED (2026-08-15, referral program build)
//
// The validator judges a pending write against a window of recent session
// events. It ships with maxEvents: 10, and that default does not survive this
// repo's cycle time. A single suite run here takes ~75s and the work between a
// red and its implementation is rarely one step: read the failing file, grep the
// call site, edit, sometimes commit. At ten events the red run scrolls out of
// the window before the write it justifies arrives, and the validator refuses a
// write whose evidence it simply cannot see any more.
//
// The failure is self-reinforcing, which is what made it hard to read from the
// inside. A refused write is itself a session event, and the refusal text quotes
// the stale assertion it anchored on. So each refusal pushes the real evidence
// one slot further out AND injects a fresh restatement of the wrong anchor. Seven
// refusals in, the window held nothing but its own denials. During the referral
// pricing ticket it kept citing `5 !== 7.5` at referral-pricing.test.mjs:58 as
// outstanding, in a turn where the immediately preceding run reported 40/40 green.
//
// The two "conditions" that appeared to unblock it — wiring the suite into a
// test:* script, and naming the symbol in the assertion message — were most
// likely proximity, not attribution: those attempts happened to put the red run
// directly before the write. The real variable is how many tool calls separate
// the two.
//
// maxEvents: 40 covers a full read-grep-edit-commit cycle with the red still in
// frame. maxContentChars: 12000 is for node --test output specifically: it clips
// head + tail, and a suite reporting 40 tests puts the failing assertion and the
// summary far enough apart that 6000 can drop one of them.
//
// Upstream defaults are not wrong, they are tuned for faster suites. If the
// validator starts missing recent events or breaking its response format, this
// is the first thing to wind back — the plugin's own docs warn that an
// over-stuffed prompt degrades both.
//
// fastPath lets a write that adds exactly one new test node pass deterministically,
// with no AI call. It is off upstream because a free pass at the green->red
// boundary is where the validator would otherwise notice an unmade refactor. That
// is a real trade and it is taken knowingly: test-writing cycles were paying an
// AI round-trip each, and this repo has three later reviewers — the Codex stop-gate,
// an independent tester, and an architect conformance pass — that all look at
// structure. Set it back to false if refactor discipline slips.
export default defineConfig({
  rules: [
    {
      // WIDENED 2026-09-06, owner's instruction, after the ops2-attention run.
      //
      // `src/ops2/**` was exempt under "UI components (src/ outside data/)", a
      // convention written before ops2 existed. It is wrong for what ops2
      // became: `attention.ts`, `queue.ts` and `record.ts` are pure model files
      // carrying as much business rule as anything in `src/data/` — which is
      // exactly why each has its own node suite. The path said "components";
      // the contents are logic.
      //
      // What it cost: the whole Attention feature was built with no TDD
      // enforcement on the implementation, only on its tests. A row promising
      // "1 ready to issue" shipped opening a queue of everything waiting on us,
      // and the acceptance criterion that forbade it was edited to match the
      // code instead — in `docs/`, which stays exempt and always will, because
      // a doc cannot be red.
      //
      // `.tsx` is included deliberately rather than only `.ts`. The split
      // between "model" and "component" is the same judgement call that
      // produced this gap; a page that decides what to render from a count is
      // making a decision, and the file extension is not evidence either way.
      files: ['worker/**', 'src/data/**', 'src/ops2/**', 'scripts/tests/**'],
      rules: [
        enforceTdd({
          maxEvents: 40,
          maxContentChars: 12000,
          fastPath: true,
        }),
      ],
    },
  ],
})
