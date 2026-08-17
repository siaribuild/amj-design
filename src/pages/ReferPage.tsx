// ═══════════════════════════════════════════════════════════════════════════════
// /refer — the referral program's public page.
//
// ⚠️ ACL s 49 GOVERNS THE COPY ON THIS PAGE. Referral selling is a strict-liability
// offence with penalties to $100m, and what keeps this program outside it is that
// the referrer's reward is not an inducement to BUY: any registered account can
// refer, with no order required. So no line here may couple the reward to the
// referrer's own purchasing. "Place your first order and earn 1% on every mate"
// is inside s 49; "any account can join — you don't need to have ordered" is not.
//
// And the two facts stay SEPARATE. "No purchase needed" belongs to the offer;
// "we need an ABN and bank details" belongs to the conditions and the join flow.
// Merged into one sentence they read as "you have to be a customer to refer",
// which is the shape the whole design exists to avoid.
//
// ⚠️ DISCLOSURE SITS BESIDE THE CLAIM, NOT IN A FOOTER (ACL s 32(2); the ACCC's
// position on fine print). The minimum order, what the rate is calculated on,
// payment on full payment, the lapse window and the ABN requirement are all in
// body-weight type within a band of the headline offer. Fine print cannot cure a
// misleading headline, so none of it may be shrunk to a caption, moved below the
// join band, put behind a link or collapsed into an accordion.
//
// ⚠️ EVERY FIGURE COMES FROM CONFIG. Not one number is typed into a string here.
// The owner kept these editable precisely so the rate could move without a
// deploy; a hard-coded "2.5%" would make the page advertise one figure while the
// engine applied another.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import { type Page, Btn, SLabel, CtaBanner } from "../app/ui";
import { getReferralProgram, getReferrerScreen, type ReferralProgramPublic, type ReferrerScreen } from "../data/referrals";
import { pct, moneyRound, months, days } from "../components/referral/format";
import { JoinProgramFlow } from "../components/referral/JoinProgramFlow";
import { CodeCard } from "../components/referral/ReferrerBlock";

export function ReferPage({ setPage, signedIn }: { setPage: (p: Page) => void; signedIn: boolean }) {
  const [program, setProgram] = useState<ReferralProgramPublic | null>(null);
  const [screen, setScreen] = useState<ReferrerScreen | null>(null);
  const [loading, setLoading] = useState(true);
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };

  const load = () => {
    setLoading(true);
    Promise.allSettled([getReferralProgram(), signedIn ? getReferrerScreen() : Promise.resolve(null)])
      .then(([p, s]) => {
        setProgram(p.status === "fulfilled" ? p.value : null);
        setScreen(s.status === "fulfilled" ? s.value : null);
        setLoading(false);
      });
  };
  useEffect(load, [signedIn]);

  if (loading || !program) return <div className="min-h-screen ground-bone pt-16" />;
  return <ReferPageBody program={program} screen={screen} signedIn={signedIn} go={go} onJoined={load} />;
}

/** The page itself, as a pure function of what was fetched.
 *
 *  ⚠️ SPLIT FROM THE FETCHING SHELL SO THE OFF STATE CAN BE TESTED. What Off does
 *  to this page is the whole of the owner's decision in §4.7, and it is a claim
 *  about rendered output ("the same page, plus one banner") that no API test can
 *  reach. Given props, this renders synchronously under
 *  `renderToStaticMarkup` — see `scripts/tests/referral-screens.test.mjs`. */
export function ReferPageBody({ program, screen, signedIn, go, onJoined }: {
  program: ReferralProgramPublic;
  screen: ReferrerScreen | null;
  signedIn: boolean;
  go: (p: Page) => void;
  onJoined?: () => void;
}) {
  const discount = pct(program.discountPercent);
  const rate = pct(program.ratePercent);
  const payout = days(program.payoutTimeframeDays);
  const member = Boolean(screen?.code);

  return (
    <div className="min-h-screen">
      {/* ── Off: ONE BANNER, AND THAT IS THE WHOLE DIFFERENCE ─────────────
          Spec §4.7. This used to return an entirely different page — a paused
          hero and a generic quote CTA, 608 characters against 3,234 — which threw
          away every figure and every answer a returning tradie came here for, and
          told them the program "has ended", the one framing the owner removed
          when they cut the third state.

          The banner is not a softer version of that page; it is the reason the
          page can stay as it is. The pitch below speaks in the present tense, and
          ACL s 18 / s 32(1) bite on an offer advertised while nobody can take it
          up — so the correction has to sit ON the offer, where the offer is read.
          A deleted page advertises nothing, and corrects nothing either.

          Above the hero rather than inside it: the hero is the offer, and a line
          that qualifies the offer has to be readable before it, not woven into
          it. It carries no heading of its own — it is a status, not a band.

          The top padding is the fixed header (56px, 64px from md) plus 16px — the
          same arithmetic the hero's own padding uses, with a status strip's gap
          rather than a band's. At the hero's 56px it floated in the middle of a
          field of nothing and read as a band in its own right. */}
      {!program.active && (
        <div role="status" className="bg-sage/10 border-b border-sage/30 pt-[72px] md:pt-[80px] pb-4">
          <div className="max-w-6xl mx-auto px-6">
            <p className="text-ink t-bd">
              <b className="text-ink">Joining is paused</b> while we rework the program — check back soon.
              Anything already earned will still be paid, and any discount already given still runs to
              the date it was given.
            </p>
          </div>
        </div>
      )}
      {/* ── Hero — one read ─────────────────────────────────────────────── */}
      {/* Hero padding is 56px, not the 96px `section-pad` — an offer this short
          in an oversized band reads as a page with nothing on it (spec §3.2).
          The top figure is that 56px plus the fixed header's height — unless the
          Off banner is above it, in which case the banner has already cleared the
          header and the hero takes its 56px alone. */}
      <section className={`bg-night relative pb-14 ${program.active ? "pt-[112px] md:pt-[120px]" : "pt-14"}`}>
        <div className="max-w-6xl mx-auto px-6 relative">
          <SLabel light>Refer a mate</SLabel>
          <h1 className="text-white mt-3 t-ds2 font-display max-w-[20ch]">Refer a mate. You both win.</h1>
          {/* The three figures carry the whole offer, so they are the one thing
              lifted off the sentence — in --sage-light, the token that exists for
              exactly this (sage on a dark ground). White-on-white bold made them
              indistinguishable from the prose they sit in. */}
          <p className="text-white mt-4 t-bd-lg max-w-[52ch]">
            Your mate gets <b className="text-sage-light">{discount} off their first order</b>. When they've paid
            it in full, we pay you <b className="text-sage-light">{rate} of it</b>, within{" "}
            <b className="text-sage-light">{payout}</b>.
          </p>
          <div className="mt-6">
            <Btn variant="sage" size="lg" onClick={() => {
              if (!signedIn) return go("login");
              document.getElementById("refer-join")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}>
              {signedIn ? "Join the program →" : "Sign in to join →"}
            </Btn>
          </div>
          {/* s 49: the reward is not conditioned on the referrer having bought.
              This line says so, and it never sits beside the ABN requirement. */}
          <p className="text-white/55 mt-4 t-cap">Any account can join — you don't need to have ordered.</p>
        </div>
      </section>

      {/* ── How it works — Track A, three cards ───────────────────────────
          BONE, and it is the first band after the hero on purpose: that is the
          site's own sequence and the one the owner approved. The grounds then
          alternate night → bone → paper → night → paper → bone, so every seam
          draws itself and no two neighbours share a fill. No border-top here —
          the night/bone seam is already a hard edge and a black hairline on it
          is invisible work. */}
      <section className="ground-bone section-pad">
        <div className="max-w-6xl mx-auto px-6">
          <SLabel>How it works</SLabel>
          <h2 className="text-ink mt-3 mb-6 t-ds2 font-display max-w-[24ch]">Three steps, and only one of them is yours.</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0">
            {[
              ["Share your code.", <>Text it, say it over the phone, send the link. However you'd normally tell someone.</>],
              ["They save.", <>Your mate gets <b className="text-ink">{discount} off their first order</b> — on their quote from the start, and it's theirs for <b className="text-ink">{months(program.windowMonths)}</b>. Nothing to enter, nothing to apply.</>],
              // The basis disclosure (spec §4.4) lives here and nowhere else on
              // the page: it is the basis of the headline claim, so it belongs
              // inside the claim rather than in a list beneath it.
              ["You get paid.", <>Once they've paid that order in full, we transfer <b className="text-ink">{rate} of the goods</b> — excluding GST and delivery — to your bank account within <b className="text-ink">{payout}</b>.</>],
            ].map(([heading, body], i) => (
              <div key={String(heading)} className="relative card p-6 flex flex-col sm:[&:nth-child(n+2)]:-mt-px lg:[&:nth-child(n+2)]:mt-0 lg:[&:nth-child(n+2)]:-ml-px">
                <span className="w-8 h-8 flex-none border border-sage/40 flex items-center justify-center text-sage font-data t-data-sm mb-4">{i + 1}</span>
                <h3 className="font-semibold text-ink mb-1.5 font-display t-bd">{heading}</h3>
                <p className="text-body leading-relaxed t-bd">{body}</p>
                {/* Centred on the seam, and painted on the card fill so it masks
                    the hairline instead of straddling it. Without the Y offset it
                    sat half its own height below centre. */}
                {i < 2 && (
                  <ChevronRight
                    className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-sage/60"
                    style={{ background: "var(--card-fill)" }} aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The conditions — three fact rows, body weight ───────────────── */}
      <section className="ground-paper border-t border-black/8 section-pad">
        <div className="max-w-6xl mx-auto px-6 relative">
          <SLabel>The conditions</SLabel>
          <h2 className="text-ink mt-3 mb-5 t-ds2 font-display">Before you share it.</h2>
          {/* Closed top and bottom: the rows are a list, and a list that is ruled
              between its items but open at the head reads as a fragment of a
              longer one that has been cut off. */}
          <div className="flex flex-col border-t border-black/[0.08]">
            {[
              [moneyRound(program.minOrderAmount), <>Their first order has to be at least <b className="text-ink">{moneyRound(program.minOrderAmount)}</b> ex GST, before delivery. Below that, nothing is earned on it.</>],
              ["First order only", <>You're paid on their <b className="text-ink">first order</b> — one payment per mate, not a cut of everything they buy afterwards.</>],
              ["An ABN", <>You'll need an <b className="text-ink">ABN</b> and bank details on your account before your code is issued. That's the account we pay into.</>],
              ...(program.capAmount != null
                ? [[`Capped at ${moneyRound(program.capAmount)}`, <>That's the most you can earn on any one referral.</>] as const]
                : []),
            ].map(([key, prose]) => (
              <div key={String(key)} className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-6 py-3.5 border-b border-black/[0.08]">
                <span className="flex-shrink-0 font-data t-data md:w-[180px]" style={{ color: "var(--sage-deep)" }}>{key}</span>
                <p className="text-body t-bd max-w-[62ch]">{prose}</p>
              </div>
            ))}
          </div>
          {/* Caption size, and deliberately carrying NO condition — only a tax
              note and two pointers. If a new condition is ever needed it becomes
              a fourth row at body weight, never an addition to this sentence. */}
          {/* Underlined, not sage-only: a link inside running prose distinguished
              by colour alone fails WCAG 1.4.1, and at caption size the sage/body
              difference is the smallest it gets anywhere on the site. */}
          <p className="text-body mt-4 t-cap measure">
            Amounts include any GST payable, and we don't give tax advice. Self-referral, cancelled orders and
            second businesses are in the{" "}
            <button onClick={() => go("resources")}
              className="text-sage hover:text-sage-deep cursor-pointer underline underline-offset-2">full rules and terms →</button>
          </p>
        </div>
      </section>

      {/* ── The join band — dark when prompting, light when working ─────── */}
      {/* Signed out this is the one band on the page whose whole job is to be
          acted on, so it takes the site's dark-section treatment plus the 2px
          sage top rule (HowItWorksPage.tsx:295) — the rule is what stops a black
          band reading as a gap between two light ones. Signed in it goes light:
          a form is a working surface, not a prompt. */}
      <section id="refer-join"
        className={signedIn ? "ground-bone border-t border-black/8 section-pad" : "relative bg-night section-pad"}>
        {!signedIn && <span className="absolute inset-x-0 top-0 h-0.5 bg-sage" aria-hidden="true" />}
        <div className="max-w-6xl mx-auto px-6">
          {!signedIn ? (
            <div className="split-row is-center">
              <div className="split-prose">
                <SLabel light>Joining</SLabel>
                <h2 className="text-white mt-3 mb-2 t-hd1 font-display">Sign in and you're two minutes from a code.</h2>
                <p className="text-white/70 t-bd">
                  Accept the conditions, tell us where to send the money, and your code is issued on the spot.
                </p>
              </div>
              <div className="md:flex-shrink-0">
                <Btn variant="sage" size="lg" onClick={() => go("login")}>Sign in to join →</Btn>
              </div>
            </div>
          ) : !program.active ? (
            /* §4.7's second limb, and the ONLY thing Off changes below the banner:
               "the join journey stops after login… in place of the entry step or
               the code/share affordance". Above the fold the page is unchanged
               because the pitch is still true — this is where it stops being
               actionable, so this is where the pause is restated, once, in the
               band whose job was to be acted on.

               Forward-looking, not an error and not a disabled button: there is
               nothing wrong with this reader, and a greyed-out control invites
               them to keep trying it. Their earnings, referrals and details all
               live on the account screen, which keeps working while Off (AC-64) —
               so this points there rather than restating any of it. */
            <div className="split-row is-center">
              <SLabel>Joining</SLabel>
              <div className="split-prose">
                <h2 className="text-ink mt-3 mb-2 t-hd1 font-display">Joining is paused just now.</h2>
                <p className="text-body t-bd">
                  We're not issuing new codes while we rework the program — check back soon. If you've
                  already referred someone, nothing changes: your earnings are in your account and will
                  still be paid on the timetable you were given.
                </p>
              </div>
              <div className="md:flex-shrink-0">
                <Btn variant="outline" size="lg" onClick={() => go("referrals")}>Go to your account →</Btn>
              </div>
            </div>
          ) : member && screen ? (
            <CodeCard code={screen.code!} shareUrl={screen.shareUrl ?? ""} program={program} onHowItWorks={() => go("referrals")} />
          ) : (
            <JoinProgramFlow program={program} onJoined={onJoined} onReadTerms={() => go("resources")} />
          )}
        </div>
      </section>

      {/* ── Good to know — Track B, the questions tradies actually ask ──── */}
      <section className="ground-paper border-t border-black/8 section-pad">
        <div className="max-w-6xl mx-auto px-6 relative">
          <SLabel>Good to know</SLabel>
          <h2 className="text-ink mt-3 mb-6 t-ds2 font-display">The questions tradies actually ask.</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
            {[
              ["Can I refer someone if I've never ordered?", <>Yes. Any registered account can join and refer. Your own order history has nothing to do with it.</>],
              ["What does my mate actually see?", <>Their quote is {discount} lower from the first price they're shown. There's no code to enter at checkout and nothing for them to apply.</>],
              ["What do I get to see about them?", <>Their business name and how far along they are — signed up, ordered, paid. Never their prices, their address or what's on their job.</>],
              ["Do I earn on the mates they go on to refer?", <>No. You get paid for the mates you refer, and that's it. No chains, no levels, no tiers.</>],
            ].map(([q, a], i) => (
              <div key={String(q)} className={`card p-6 flex flex-col ${i % 2 === 1 ? "sm:-ml-px" : ""} ${i > 1 ? "sm:-mt-px" : ""}`}>
                {/* The question is the card's heading and has to outrank the
                    answer it sits on — at t-bd both were the same size and the
                    card had no first read. */}
                <h3 className="font-semibold text-ink mb-2 font-display t-bd-lg">{q}</h3>
                <p className="text-body leading-relaxed t-bd flex-1">{a}</p>
                {/* Track B's own in-card link, on the card whose answer it
                    continues — outside the track it read as a page-level action
                    and left the fourth card looking unfinished. */}
                {i === 3 && (
                  <button onClick={() => go("resources")}
                    className="self-start flex items-center gap-1.5 mt-3 text-sage hover:text-sage-deep cursor-pointer t-bd-sm">
                    The full referral FAQ <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bone, because the FAQ above it is paper — the banner's own default
          assumes it follows a bone section, which is true everywhere but here. */}
      <CtaBanner
        ground="bone"
        title="Got a schedule sitting on your desk?"
        sub="Upload it and every line comes back priced in about a minute. No account needed to start."
        onQuote={() => go("quote")}
      />
    </div>
  );
}
