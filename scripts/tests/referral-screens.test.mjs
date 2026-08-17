// Referral program — what the customer's screens actually render, in each state
// the switch and the payout gate can put them in. Spec §4.7, §5.2, §8.3;
// AC-28, AC-36, AC-62, AC-64.
//
// WHY THESE ARE RENDER TESTS AND NOT SERVER TESTS. Every fact these screens are
// judged on is already correct on the wire — `referrerScreen` returns the holds,
// `publicProgram` returns the figures — and the defects this file was opened for
// were all of the same shape: a value served and rendered by nothing, or a branch
// that replaced a page instead of adding a line to it. That class of fault is
// invisible to an API test by construction. The components are pure functions of
// their props, so `renderToStaticMarkup` is enough: no DOM, no jsdom, no browser,
// and it runs in the same few hundred milliseconds as the other pure suites.
//
// The assertions are about STRUCTURE — which bands exist, which numbers appear —
// never about class names or wording, so ordinary copy and styling work does not
// break them.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

/** Bundle one component module for Node, leaving React itself external so the
 *  renderer and the components share one copy of it. */
async function load(runDir, entry, name) {
  const outfile = join(runDir, `${name}.mjs`);
  await build({
    entryPoints: [join(projectRoot, entry)],
    bundle: true, format: "esm", platform: "node", outfile,
    external: ["react", "react-dom", "lucide-react"],
    jsx: "automatic", loader: { ".css": "empty" }, logLevel: "silent",
  });
  return import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
}

const text = (html) => html
  .replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();
const headings = (html) => (html.match(/<h[123][^>]*>[\s\S]*?<\/h[123]>/g) ?? []).map(text);

const PROGRAM = {
  active: true, ratePercent: 1, discountPercent: 2.5, minOrderAmount: 2000,
  windowMonths: 12, capAmount: null, payoutTimeframeDays: 14, minPayoutBalance: 0,
};

const SCREEN = {
  referrerGate: { complete: true, missing: [] },
  code: "ABC-123", retainedCode: null, shareUrl: "https://openframe.test/r/ABC-123",
  referrals: [{ id: "r1", displayName: "Kirra Glazing", joinedAt: "2026-01-05", status: "ordered" }],
  earnings: { pending: 0, confirmed: 0, paid: 0 },
  earningRows: [],
  payout: {
    abn: "51824753556", abnPresent: true, abnValid: true,
    bsbMasked: "063-***", accountMasked: "****5678", accountName: "A Tradie",
    clearBlocked: null, heldPendingDetails: null, heldUnderThreshold: null,
  },
  payoutHistory: [],
  program: PROGRAM,
};

const screenWith = (over) => ({
  ...SCREEN, ...over,
  payout: { ...SCREEN.payout, ...(over.payout ?? {}) },
  program: { ...PROGRAM, ...(over.program ?? {}) },
});

test("AC-62 — Off adds a banner to /refer; it does not replace the page", async (t) => {
  // Spec §4.7, the owner's own decision and the reason the third state was cut:
  // "`/refer` in Off is the SAME PAGE: same pitch, same figures… No ended-notice
  // variant… One banner appears at the top. That is the entire behavioural
  // difference."
  //
  // The page it replaced the whole thing with was 608 characters against 3,234 —
  // a paused hero and a generic quote CTA. Everything the page exists to say
  // ("what was that referral thing?"), and every figure a returning tradie came
  // back to check, was gone. The banner exists precisely BECAUSE the pitch stays
  // in the present tense: ACL s 18 / s 32(1) is about an offer advertised and not
  // currently open, and a deleted page advertises nothing to correct.
  const runDir = await makeRunDir("refer-page");
  t.after(async () => { await removeRunDir(runDir); });
  const { ReferPageBody } = await load(runDir, "src/pages/ReferPage.tsx", "refer-page");

  const render = (program) => renderToStaticMarkup(
    createElement(ReferPageBody, { program, screen: null, signedIn: false, go: () => {} }),
  );
  const on = render(PROGRAM);
  const off = render({ ...PROGRAM, active: false });

  // Every band still there. Headings rather than a byte comparison: this is the
  // structural claim ("same pitch, same figures"), and it survives copy edits.
  assert.deepEqual(headings(off), headings(on), "Off must serve the same bands as On");
  assert.ok(off.length > on.length, "Off adds a banner; it removes nothing");

  const offText = text(off);
  assert.match(offText, /paused/i, "the banner says joining is paused");
  assert.match(offText, /check back/i, "and that it is worth coming back");
  // "Ended" is a claim about the future that a returning program has to
  // contradict — the exact framing the owner removed when they cut the third
  // state (design §18.6).
  assert.equal(/has ended/i.test(offText), false, "and never that it has ended");

  // Every figure the page advertises is still advertised. A returning tradie's
  // reason to be here is usually one of these numbers.
  for (const figure of ["2.5%", "1%", "14 days", "12 months", "$2,000"]) {
    assert.ok(offText.includes(figure), `Off must still carry ${figure} — it is the same offer, paused`);
  }
});

test("AC-62(b) — the join journey stops after login, and only after login", async (t) => {
  // §4.7's second limb. Signed OUT the page is unchanged work: the pitch and a
  // sign-in CTA, because that journey ends at a screen that will itself say
  // joining is paused. Signed IN the entry step is where the pause becomes
  // actionable, so it is the entry step that gives way — to a forward-looking
  // message, not an error and not a dead button.
  const runDir = await makeRunDir("refer-join");
  t.after(async () => { await removeRunDir(runDir); });
  const { ReferPageBody } = await load(runDir, "src/pages/ReferPage.tsx", "refer-join");

  const off = { ...PROGRAM, active: false };
  const signedOut = text(renderToStaticMarkup(
    createElement(ReferPageBody, { program: off, screen: null, signedIn: false, go: () => {} }),
  ));
  assert.match(signedOut, /sign in/i, "signed out, the sign-in CTA is untouched");

  const render = (screen) => renderToStaticMarkup(
    createElement(ReferPageBody, { program: off, screen, signedIn: true, go: () => {} }),
  );

  // Not yet a member: the entry step is replaced. Asserted on CONTROLS rather
  // than on words — "bank details" is also a line in the conditions band, which
  // is part of the page Off leaves alone, and matching prose would fail the test
  // for describing the program correctly.
  const joining = render(screenWith({ code: null, shareUrl: null, program: off }));
  assert.match(text(joining), /paused/i, "the entry step gives way to the pause");
  assert.equal(
    /<input|<form/.test(joining), false,
    "no entry step while joining is paused — there is nothing to join",
  );

  // Already a member: the code/share affordance goes too. §4.7 names both, and
  // for the same reason — a copyable link that records nothing is worse than no
  // link, because the tradie hands it to a mate and neither of them finds out.
  const member = render(screenWith({ program: off }));
  assert.match(text(member), /paused/i, "a member sees the pause in the same place");
  assert.equal(member.includes("ABC-123"), false, "and is not handed a code that would record nothing");
});

test("AC-64 — while Off, a referrer with history can still see and correct the account we pay into", async (t) => {
  // Money keeps flowing while Off (AC-65, limb 1): pending earnings still confirm
  // and confirmed ones are still paid on the timetable they were promised on. The
  // Off branch rendered the notice, the earnings, the list and the payments — and
  // then stopped, omitting the one panel that holds the bank details, Edit and
  // Leave. So we went on paying into details the referrer could no longer read,
  // let alone correct, for as long as the switch stayed off.
  //
  // AC-64 says their "referrals, earnings, holds, details and history" are all
  // still working. Details are the half that was missing, and it is the half with
  // money moving through it.
  const runDir = await makeRunDir("referrer-off");
  t.after(async () => { await removeRunDir(runDir); });
  const { ReferrerBlock } = await load(runDir, "src/components/referral/ReferrerBlock.tsx", "referrer-off");

  const html = renderToStaticMarkup(createElement(ReferrerBlock, {
    screen: screenWith({
      program: { active: false },
      earnings: { pending: 0, confirmed: 120.5, paid: 300 },
      payoutHistory: [{ paidAt: "2026-02-01", amount: 300, reference: "PAY-1", status: "paid", referralIds: ["r1"] }],
    }),
  }));
  const body = text(html);

  assert.match(body, /paused/i, "the pause is still stated");
  assert.match(body, /Kirra Glazing/, "their referrals are still listed");
  assert.match(body, /PAY-1/, "and their payment history");
  assert.ok(body.includes("063-***"), "the account we are still paying into is visible");
  assert.ok(body.includes("****5678"), "masked, as everywhere else");
  assert.match(body, /Edit details/i, "and correctable — money is still going into it");
  assert.match(body, /Leave the program/i, "leaving is still theirs to choose");
});

test("AC-28 — both reachable holds are stated plainly, each naming its amount and its release", async (t) => {
  // Two ways a referrer's money sits still, and neither said so anywhere:
  // `heldPendingDetails` and `heldUnderThreshold` were computed by the server,
  // typed on the client, and rendered by nothing at all — in every state, not
  // only while Off. The referrer saw a figure that would not move and no sentence
  // explaining why, which is the shape a complaint takes.
  //
  // "What releases it" is the load-bearing half. A held amount with no stated
  // remedy reads as a decision made about them rather than as a step they can
  // take — and one of these two IS a step they can take, in about a minute.
  const runDir = await makeRunDir("referrer-holds");
  t.after(async () => { await removeRunDir(runDir); });
  const { ReferrerBlock } = await load(runDir, "src/components/referral/ReferrerBlock.tsx", "referrer-holds");

  // Held because the details were cleared (ADR-8c). The account is a former
  // member with history, so this is state D — the one a departing referrer lands
  // on, and the one where money can be stranded without anyone saying so.
  const held = text(renderToStaticMarkup(createElement(ReferrerBlock, {
    screen: screenWith({
      code: null, retainedCode: "ABC-123",
      referrerGate: { complete: false, missing: ["bank_details"] },
      earnings: { pending: 90.91, confirmed: 0, paid: 0 },
      payoutHistory: [{ paidAt: "2026-02-01", amount: 300, reference: "PAY-1", status: "paid", referralIds: ["r1"] }],
      payout: { bsbMasked: null, accountMasked: null, heldPendingDetails: { amount: 90.91 } },
    }),
  })));
  assert.ok(held.includes("$90.91"), `the held amount is named — got: ${held.slice(0, 400)}`);
  assert.match(held, /details/i, "and what is holding it");

  // Held under the payout threshold. Different hold, different remedy: nothing to
  // fix, just more to come — so the sentence must not read as a problem.
  const under = text(renderToStaticMarkup(createElement(ReferrerBlock, {
    screen: screenWith({
      earnings: { pending: 0, confirmed: 45, paid: 0 },
      program: { minPayoutBalance: 100 },
      payout: { heldUnderThreshold: { balance: 45, threshold: 100 } },
    }),
  })));
  assert.ok(under.includes("$45"), `the balance waiting is named — got: ${under.slice(0, 400)}`);
  assert.ok(under.includes("$100"), "and the threshold that releases it");

  // At a zero threshold there is no threshold, so there is no threshold language
  // anywhere (AC-61). The server says so by sending null, and the screen must not
  // invent the sentence from the balance alone.
  const noThreshold = text(renderToStaticMarkup(createElement(ReferrerBlock, {
    screen: screenWith({ earnings: { pending: 0, confirmed: 45, paid: 0 } }),
  })));
  assert.equal(/threshold|minimum payout/i.test(noThreshold), false, "no threshold, no threshold language");
});

test("§5.5 — leaving is refused before it is attempted, not after", async (t) => {
  // `clearBlocked` is the third value the server computed and nothing rendered.
  // It is not a hold on money — it is the reason the Leave button is about to
  // refuse — and the refusal already arrives from the API carrying its amount.
  // Rendering it beside the button turns a rejected click into a sentence read
  // before clicking, which is the difference between a rule and a rebuff.
  //
  // It also answers the obvious next question unprompted. The reason is
  // temporary: the money goes out, and then leaving works. A bare refusal on
  // click reads as permanent.
  const runDir = await makeRunDir("referrer-leave");
  t.after(async () => { await removeRunDir(runDir); });
  const { ReferrerBlock } = await load(runDir, "src/components/referral/ReferrerBlock.tsx", "referrer-leave");

  // Scoped to the panel that owns the Leave control, not to the whole screen:
  // "$124" is also the Confirmed cell in the strip above, and a page-wide match
  // would pass without the warning existing at all.
  const leavePanel = (screen) => {
    const html = renderToStaticMarkup(createElement(ReferrerBlock, { screen }));
    const start = html.indexOf("How you get paid");
    assert.notEqual(start, -1, "the payout panel must be on screen");
    return text(html.slice(start));
  };

  const blocked = leavePanel(screenWith({
    earnings: { pending: 0, confirmed: 124, paid: 0 },
    payout: { clearBlocked: { amount: 124 } },
  }));
  assert.ok(blocked.includes("$124"), `the figure that refuses it is named beside the control — got: ${blocked}`);
  assert.match(blocked, /leav/i, "beside the thing it refuses");

  // And with nothing confirmed, no warning at all — a caution that is always on
  // is furniture, and stops being read on the day it means something.
  const free = leavePanel(screenWith({ earnings: { pending: 0, confirmed: 0, paid: 300 } }));
  assert.equal(/\$/.test(free.replace(/[^$]*Leave the program/, "")), false,
    "nothing waiting, nothing to warn about");
});
