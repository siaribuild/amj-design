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
import { type Page, SAGE, Btn, SLabel, CtaBanner } from "../app/ui";
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

  const discount = pct(program.discountPercent);
  const rate = pct(program.ratePercent);
  const payout = days(program.payoutTimeframeDays);

  // ── Program off ──────────────────────────────────────────────────────────
  // One off-state, not two. The hero carries the notice and every other band is
  // suppressed — no rate, no discount, no code, in any variant. The page itself
  // stays up, indexed and in the sitemap: it is still the answer to "what was
  // that referral thing?", and an offer advertised in the present tense that
  // nobody can take up is the s 18 / s 32(1) exposure the notice exists to close.
  if (!program.active) {
    return (
      <div className="min-h-screen">
        <section className="ground-night section-pad relative pt-[104px]">
          <div className="max-w-6xl mx-auto px-6 relative">
            <SLabel light>Refer a mate</SLabel>
            <h1 className="c-white mt-3 t-hd1 font-display max-w-[20ch]">This program has ended.</h1>
            <p className="c-white/70 mt-4 t-bd-lg max-w-[52ch]">
              We're no longer taking new referrals. Anything you'd already earned is in your account and will
              still be paid, and any discount already given still runs to the date it was given.
            </p>
          </div>
        </section>
        <CtaBanner
          title="Got a schedule sitting on your desk?"
          sub="Upload it and every line comes back priced in about a minute. No account needed to start."
          onQuote={() => go("quote")}
        />
      </div>
    );
  }

  const member = Boolean(screen?.code);

  return (
    <div className="min-h-screen">
      {/* ── Hero — one read ─────────────────────────────────────────────── */}
      <section className="ground-night section-pad relative pt-[104px]">
        <div className="max-w-6xl mx-auto px-6 relative">
          <SLabel light>Refer a mate</SLabel>
          <h1 className="c-white mt-3 t-ds2 font-display max-w-[20ch]">Refer a mate. You both win.</h1>
          <p className="c-white mt-4 t-bd-lg max-w-[52ch]">
            Your mate gets <b>{discount} off their first order</b>. When they've paid it in full, we pay you{" "}
            <b>{rate} of it</b>, within <b>{payout}</b>.
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
          <p className="c-white/55 mt-4 t-cap">Any account can join — you don't need to have ordered.</p>
        </div>
      </section>

      {/* ── How it works — Track A, three cards ─────────────────────────── */}
      <section className="ground-paper border-t border-black/8 section-pad">
        <div className="max-w-6xl mx-auto px-6">
          <SLabel>How it works</SLabel>
          <h2 className="text-ink mt-3 mb-8 t-ds2 font-display max-w-[24ch]">Three steps, and only one of them is yours.</h2>
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
                <span className="w-8 h-8 border border-sage/40 flex items-center justify-center text-sage font-data t-data-sm mb-3">{i + 1}</span>
                <h3 className="font-semibold text-ink mb-1.5 font-display t-bd">{heading}</h3>
                <p className="text-body leading-relaxed t-bd">{body}</p>
                {i < 2 && <ChevronRight className="hidden lg:block absolute -right-2 top-1/2 w-4 h-4 text-sage/50" aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The conditions — three fact rows, body weight ───────────────── */}
      <section className="ground-bone border-t border-black/8 section-pad">
        <div className="max-w-6xl mx-auto px-6">
          <SLabel>The conditions</SLabel>
          <h2 className="text-ink mt-3 mb-8 t-ds2 font-display">Before you share it.</h2>
          <div className="flex flex-col">
            {[
              [moneyRound(program.minOrderAmount), <>Their first order has to be at least <b className="text-ink">{moneyRound(program.minOrderAmount)}</b> ex GST, before delivery. Below that, nothing is earned on it.</>],
              ["First order only", <>You're paid on their <b className="text-ink">first order</b> — one payment per mate, not a cut of everything they buy afterwards.</>],
              ["An ABN", <>You'll need an <b className="text-ink">ABN</b> and bank details on your account before your code is issued. That's the account we pay into.</>],
              ...(program.capAmount != null
                ? [[`Capped at ${moneyRound(program.capAmount)}`, <>That's the most you can earn on any one referral.</>] as const]
                : []),
            ].map(([key, prose]) => (
              <div key={String(key)} className="flex flex-col md:flex-row md:items-baseline gap-2 md:gap-6 py-4 border-b border-black/[0.08]">
                <span className="flex-shrink-0 font-data t-data md:w-[150px]" style={{ color: "var(--sage-deep)" }}>{key}</span>
                <p className="text-body t-bd max-w-[62ch]">{prose}</p>
              </div>
            ))}
          </div>
          {/* Caption size, and deliberately carrying NO condition — only a tax
              note and two pointers. If a new condition is ever needed it becomes
              a fourth row at body weight, never an addition to this sentence. */}
          <p className="text-body mt-5 t-cap measure">
            Amounts include any GST payable, and we don't give tax advice. Self-referral, cancelled orders and
            second businesses are in the{" "}
            <button onClick={() => go("resources")} className="text-sage hover:text-sage-deep cursor-pointer">full rules and terms →</button>
          </p>
        </div>
      </section>

      {/* ── The join band — dark when prompting, light when working ─────── */}
      <section id="refer-join" className={signedIn ? "ground-paper border-t border-black/8 section-pad" : "bg-night section-pad"}>
        <div className="max-w-6xl mx-auto px-6">
          {!signedIn ? (
            <div className="flex flex-col gap-4 items-start">
              <SLabel light>Joining</SLabel>
              <h2 className="c-white t-ds2 font-display max-w-[24ch]">Sign in and you're two minutes from a code.</h2>
              <p className="c-white/70 t-bd max-w-[52ch]">
                Accept the conditions, tell us where to send the money, and your code is issued on the spot.
              </p>
              <Btn variant="sage" size="lg" onClick={() => go("login")}>Sign in to join →</Btn>
            </div>
          ) : member && screen ? (
            <CodeCard code={screen.code!} shareUrl={screen.shareUrl ?? ""} program={program} onHowItWorks={() => go("referrals")} />
          ) : (
            <JoinProgramFlow program={program} onJoined={load} onReadTerms={() => go("resources")} />
          )}
        </div>
      </section>

      {/* ── Good to know — Track B, the questions tradies actually ask ──── */}
      <section className="ground-bone border-t border-black/8 section-pad">
        <div className="max-w-6xl mx-auto px-6">
          <SLabel>Good to know</SLabel>
          <h2 className="text-ink mt-3 mb-8 t-ds2 font-display">The questions tradies actually ask.</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
            {[
              ["Can I refer someone if I've never ordered?", <>Yes. Any registered account can join and refer. Your own order history has nothing to do with it.</>],
              ["What does my mate actually see?", <>Their quote is {discount} lower from the first price they're shown. There's no code to enter at checkout and nothing for them to apply.</>],
              ["What do I get to see about them?", <>Their business name and how far along they are — signed up, ordered, paid. Never their prices, their address or what's on their job.</>],
              ["Do I earn on the mates they go on to refer?", <>No. You get paid for the mates you refer, and that's it. No chains, no levels, no tiers.</>],
            ].map(([q, a], i) => (
              <div key={String(q)} className={`card p-6 flex flex-col ${i % 2 === 1 ? "sm:-ml-px" : ""} ${i > 1 ? "sm:-mt-px" : ""}`}>
                <h3 className="font-semibold text-ink mb-1.5 font-display t-bd">{q}</h3>
                <p className="text-body leading-relaxed t-bd">{a}</p>
              </div>
            ))}
          </div>
          <button onClick={() => go("resources")} className="flex items-center gap-1.5 mt-6 text-sage hover:text-sage-deep cursor-pointer t-bd-sm">
            The full referral FAQ <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      <CtaBanner
        title="Got a schedule sitting on your desk?"
        sub="Upload it and every line comes back priced in about a minute. No account needed to start."
        onQuote={() => go("quote")}
      />
    </div>
  );
}
