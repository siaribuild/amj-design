// ═══════════════════════════════════════════════════════════════════════════════
// HOW IT WORKS — the buying process
//
// SCAFFOLD. The section ladder, the data and the routing are in place. Three
// blocks are still stubbed and marked TODO(scaffold): the hero stat strip, the
// two-actor step row, and the homeowner cards. <ProcessRail> carries its own
// TODOs. Everything the plan marked "unchanged" is here verbatim.
//
// GROUND: bone is the page. Sections alternate bone → paper so every seam is a
// change of surface rather than a rule drawn on one:
//
//   night hero → paper (the shape) → bone (phase 01 + homeowner) → paper (the
//   line) → bone (phase 02) → paper (before despatch) → bone (phase 03) →
//   paper (the shared CtaBanner, which always follows a bone section)
//
// Two axes have to survive without a grid:
//
//  • OWNERSHIP is the SHAPE of a row, not a column. Your moments are numbered,
//    on the section ground, with a sage marker; our work is indented, on a
//    recessive fill, with no numeral at all — a dashed rule where the number
//    would be. Four cues (indent, fill, numeral, word), none of them colour
//    alone, and none of them dependent on a two-column layout. The card track
//    this replaces needed four columns to say the same thing and had nowhere to
//    put them at 375px.
//  • MONEY is drawn once, by <ProcessRail>, and then restated as a numeral in
//    the same position in three phase headers. The rail is the reason the page
//    no longer needs a separate strip of six verbs above it: six labelled nodes
//    are six by inspection, which is the self-verification the old verb line
//    existed to provide.
//
// No total step count is stated anywhere — three artefacts have already drifted
// on a hand-written count.
// ═══════════════════════════════════════════════════════════════════════════════
import type { ReactNode } from "react";
import { ArrowRight, Camera, Info, Send, Truck } from "lucide-react";
import { GhostMark, SLabel, Btn, CtaBanner, type Page } from "../app/ui";
import { ProcessRail } from "../components/ProcessRail";
import { getPage, imageUrl, products } from "../data/catalogue";
import { brandName, brandSubject } from "../data/sanity";

const DISPLAY = { fontFamily: "'Space Grotesk', sans-serif" } as const;
const MONO = { fontFamily: "'DM Mono', monospace" } as const;
const GRID_BG = {
  backgroundImage: "linear-gradient(to right,rgba(90,122,106,0.045) 1px,transparent 1px),linear-gradient(to bottom,rgba(90,122,106,0.045) 1px,transparent 1px)",
  backgroundSize: "64px 64px",
};

// The four facts, split into the number and what it counts. They were one inline
// mono run, which reads as a sentence fragment; as value-over-caption pairs the
// numbers line up and can be scanned without being read.
const HERO_STATS: { value: string; caption: string }[] = [
  { value: "$0", caption: "to get a quote" },
  { value: "~1 minute", caption: "with a schedule" },
  { value: "50%", caption: "first payment" },
  { value: "Supply only", caption: "" },
];

type Step = {
  side: "you" | "us";
  n?: string;      // customer moments only — the numeral is the ownership cue
  title: string;
  meta?: string;
  body: string;
};

type Phase = {
  id: string;
  label: string;
  heading: string;
  intro?: string;
  paid: "0%" | "50%" | "100%";
  paidNote: string;
  duration: string;
  steps: Step[];
  note?: { icon: typeof Info; text: string };
  /** Phase 01 only. The one place on the page where intent peaks before the
   *  reader has met a single number they owe. */
  cta?: string;
};

const PHASES: Phase[] = [
  {
    id: "phase-quote", label: "Phase 01 — Quote",
    heading: "Get it priced, then checked by a person.",
    // The phase clock is what the phase COSTS YOU in waiting, which is about a
    // minute — the schedule prices itself and you are done. The two business
    // days belong to the review step below, where they are stated, and they run
    // without you. ProcessRail states this same number; keep the two in step.
    paid: "0%", paidNote: "nothing charged", duration: "about 1 minute",
    steps: [
      { side: "you", n: "01", title: "Price it yourself", meta: "about a minute with a schedule",
        body: "Upload your window and door schedule and it prices itself, line by line — no retyping." },
      { side: "us", title: "An indicative estimate, instantly",
        body: "Every line matched to a product and costed on the spot — a number, not yet a quote." },
      { side: "you", n: "02", title: "Submit it for review",
        body: "One click. If anything is unclear we ask, and you answer." },
      { side: "us", title: "Checked by hand, then quoted", meta: "about 2 business days",
        body: "A person checks specifications, dimensions and buildability, then issues the quote. Nothing is charged." },
    ],
    note: { icon: Info, text: "Instant estimates are indicative and subject to technical review — confirmed before any deposit is invoiced." },
    cta: "Get a quote",
  },
  {
    id: "phase-order", label: "Phase 02 — Order",
    heading: "Approve it, and it gets made.",
    paid: "50%", paidNote: "deposit paid", duration: "about 3–4 weeks",
    steps: [
      { side: "you", n: "03", title: "Accept, and pay 50%", meta: "the first payment",
        body: "The first charge — and the number you pay is the number you accepted." },
      { side: "us", title: "Shop drawings prepared",
        body: "Every unit and every dimension, drawn for your approval." },
      { side: "you", n: "04", title: "Sign off the drawings",
        body: "Nothing is made until you do. Changes are free until you sign; dimensions lock then." },
      { side: "us", title: "Manufactured, then checked", meta: "about 3–4 weeks",
        body: "Nothing needed from you. Every item is checked and photographed before it leaves the factory." },
    ],
  },
  {
    id: "phase-delivery", label: "Phase 03 — Delivery",
    heading: "Pay the balance, then it arrives.",
    paid: "100%", paidNote: "paid in full", duration: "about 2 weeks",
    steps: [
      { side: "you", n: "05", title: "Pay the balance",
        body: "The final 50%, invoiced only after you have seen the photos." },
      { side: "you", n: "06", title: "Confirm you're ready",
        body: "Delivery is booked on your go-ahead, not before." },
      { side: "us", title: "Delivered to your door", meta: "about 2 weeks after the balance",
        body: "Australia-wide, with after-sales support from there." },
    ],
  },
];

// The supply-only fact closes the sequence rather than sitting inside phase 03,
// because it is true of the whole page and not of that phase.
const FOOTNOTE = "Supply only — your builder or installer fits the frames. We hand over at your address.";

/** Two filled/hollow cells — the same 50/50 glyph the account area uses.
 *  aria-hidden: the percentage is always written out beside it. */
function Meter({ paid }: { paid: "0%" | "50%" | "100%" }) {
  const cell = (on: boolean) => <span className={`block w-2.5 h-2.5 border ${on ? "bg-ink border-ink" : "border-black/25"}`} />;
  return <span className="flex gap-1" aria-hidden="true">{cell(paid !== "0%")}{cell(paid === "100%")}</span>;
}

// ─── Hero stat strip ──────────────────────────────────────────────────────────
// Hairline-divided cells, never boxed: four boxes butted under a hero is the
// strongest table-echo a page can make above the fold, and nothing else on this
// site is tabular. Rules only, so the strip reads as a continuation of the hero
// rather than as an object sitting on it.
//
// A <dl>, because that is what this is: four terms and their definitions. The
// value is the term and the caption defines it, which is also the order they
// are read in.
function StatStrip() {
  return (
    <dl className="mt-9 md:mt-10 grid grid-cols-2 sm:grid-cols-4 border-t border-b border-white/15">
      {HERO_STATS.map((s, i) => (
        <div key={s.value}
          className={`py-4 pr-5 sm:pr-6 ${
            // The divider belongs to the cell on its LEFT edge, so the first
            // cell in each row must lose it — otherwise a rule floats at the
            // start of row two once the grid wraps to 2-up.
            i > 0 ? "sm:border-l sm:border-l-white/15 sm:pl-6" : ""
          } ${i % 2 === 1 ? "border-l border-l-white/15 pl-5 sm:pl-6" : ""} ${
            // Row two needs its own top rule at the 2-up breakpoint only.
            i >= 2 ? "border-t border-t-white/15 sm:border-t-0" : ""
          }`}>
          <dt className="text-white text-[15px] md:text-base font-data">{s.value}</dt>
          {s.caption && <dd className="text-white/55 text-[13px] leading-snug mt-0.5">{s.caption}</dd>}
        </div>
      ))}
    </dl>
  );
}

// ─── One step ─────────────────────────────────────────────────────────────────
// The two actors are two different objects, and FOUR cues carry it — none of
// them colour, so the distinction survives greyscale, a colour-vision
// difference, and a 375px column alike:
//
//   1. INDENT   ours starts further right. Yours are the spine of the list;
//               ours literally sit between them.
//   2. FILL     ours is --recessive, which sits below BOTH paper and bone, so
//               it recedes on either ground. Yours carry no fill at all — they
//               are the page, which is what makes the inset read as an inset.
//   3. NUMERAL  ours has none. A short dashed rule occupies the position where
//               your numeral would be, which says "this one is not yours"
//               without borrowing a number from your six.
//   4. WORD     "You" against the brand name, stated on every single row.
//
// A left bar closes the inset. It is neutral, never sage: sage on this site
// means chosen or resolved, and our own work in progress is neither.
function StepRow({ s, brand }: { s: Step; brand: string }) {
  const yours = s.side === "you";
  return (
    <li className={`flex gap-4 md:gap-5 py-6 border-b border-b-black/10 ${
      yours ? "" : "ml-6 md:ml-12 px-4 md:px-5 bg-recessive border-l-[3px] border-l-black/15"
    }`}>
      {yours ? (
        <span className="flex-shrink-0 w-10 h-10 flex items-center justify-center border border-sage/40 bg-sage-wash text-sage-deep text-[15px] font-data">
          {s.n}
        </span>
      ) : (
        <span className="flex-shrink-0 w-10 h-10 flex items-center justify-center" aria-hidden="true">
          <span className="w-4 border-t border-dashed border-black/30" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        {/* Baseline-aligned so the timing sits on the actor word's baseline
            rather than hanging off the cap-height of a 10px label. */}
        <p className="flex items-baseline flex-wrap gap-x-4 gap-y-1 mb-1.5">
          <span className={`text-[10px] uppercase tracking-[0.14em] ${yours ? "text-sage" : "text-quiet"} font-data`}>
            {yours ? "You" : brand}
          </span>
          {/* Announced, not drawn: the numeral beside it is a graphic to a
              screen reader, and "01" alone does not say what it counts. Kept
              OUT of the label span above, whose uppercase would shout it. */}
          {yours && <span className="sr-only">step {s.n}</span>}
          {s.meta && <span className="text-[11px] text-quiet font-data">{s.meta}</span>}
        </p>
        <h3 className={`font-semibold leading-tight mb-1.5 ${yours ? "text-ink text-[18px] md:text-[19px]" : "text-ink-soft text-[16px]"} font-display`}>
          {s.title}
        </h3>
        <p className="text-body text-[14.5px] leading-relaxed split-prose">{s.body}</p>
      </div>
    </li>
  );
}

// ─── One phase ────────────────────────────────────────────────────────────────
function PhaseSection({ p, brand, onQuote, children }: {
  p: Phase; brand: string; onQuote: () => void; children?: ReactNode;
}) {
  return (
    <section id={p.id} aria-labelledby={`${p.id}-h`} className="relative ground-bone py-12 md:py-20 overflow-hidden">
      <GhostMark size={300} opacity={0.04} pos="right-0 bottom-0" />
      <div className="max-w-6xl mx-auto px-6 relative">
        <div className="split-row mb-9">
          <div className="max-w-[46ch]">
            <SLabel>{p.label}</SLabel>
            <h2 id={`${p.id}-h`} className="font-semibold text-ink leading-[1.08] tracking-tight" style={{ ...DISPLAY, fontSize: "clamp(1.55rem, 3.2vw, 2.05rem)" }}>
              {p.heading}
            </h2>
            {p.intro && <p className="text-body text-[15.5px] leading-relaxed mt-2.5">{p.intro}</p>}
          </div>
          {/* Money, in the same place in every phase header. */}
          <div className="md:text-right flex-shrink-0">
            <div className="text-[10px] uppercase tracking-[0.14em] text-quiet mb-1.5 font-data">Paid so far</div>
            <div className="flex md:justify-end items-center gap-2">
              <Meter paid={p.paid} />
              <span className="figure">{p.paid}</span>
            </div>
            <div className="text-[12px] text-body mt-1 font-data">{p.paidNote} · {p.duration}</div>
          </div>
        </div>

        <ol className="border-t border-black/10">
          {p.steps.map((s) => <StepRow key={s.title} s={s} brand={brand} />)}
        </ol>

        {p.note && (
          <div className="mt-4 card px-5 py-4 flex items-start gap-3">
            <p.note.icon className="w-4 h-4 flex-shrink-0 mt-0.5 text-body" strokeWidth={1.8} aria-hidden="true" />
            <span className="text-[13px] text-body leading-relaxed">{p.note.text}</span>
          </div>
        )}

        {/* Sage, because "Get a quote" is THE action on this site and it wears
            one colour everywhere it appears — the hero, here, and nowhere else
            on the page. Ink would make it look like a secondary control. */}
        {p.cta && (
          <div className="mt-7">
            <Btn variant="sage" onClick={onQuote}>{p.cta} <ArrowRight className="w-4 h-4" aria-hidden="true" /></Btn>
          </div>
        )}

        {children}
      </div>
    </section>
  );
}

export function HowItWorksPage({ setPage }: { setPage?: (p: Page, path?: string) => void }) {
  const go = (p: Page) => { setPage?.(p); window.scrollTo(0, 0); };

  // The ownership eyebrow is the one place a company name earns its keep. With
  // Site Settings unset it reads "We" — a pronoun, never an invented brand.
  const brand = brandName() ?? "We";
  // A featured product photograph stands in for the QA shot. Falls back to
  // nothing rather than a placeholder if the catalogue has no imagery.
  const qaShot = imageUrl(products.find((pr) => pr.heroImage)?.heroImage, { w: 900, h: 700 }) || "";

  return (
    <div className="ground-bone min-h-screen">
      {/* ── Hero ─────────────────────────────────────────────────────────────
          The prototype's page head, folded into the site's dark photographic
          hero: eyebrow, headline, one line of copy, the actions, then the four
          facts. ONE fill on a hero — the sage button — and the second action is
          a text link, which is the pairing /products and the home page already
          use over a photograph. */}
      <section className="relative bg-night overflow-hidden">
        <img src={imageUrl(getPage("how-it-works")?.heroImage, { w: 1600, h: 900 })} alt="Dark aluminium window frames in a contemporary residential interior"
          className="hero-img object-center" />
        <div className="hero-scrim" aria-hidden="true" />
        <div className="relative w-full max-w-6xl mx-auto px-6 pt-32 pb-14 md:pt-36 md:pb-16">
          <div className="max-w-2xl">
            <SLabel light>How it works</SLabel>
            <h1 className="font-semibold text-white leading-[1.03] tracking-tight mb-4 max-w-[15ch]" style={{ ...DISPLAY, fontSize: "clamp(2.1rem, 5vw, 3.5rem)" }}>
              Nothing gets made until you sign it off.
            </h1>
            <p className="text-white/70 leading-relaxed max-w-xl text-base md:text-lg">
              Upload a schedule and it prices itself. Nothing is charged until you accept a quote a person has checked.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Btn variant="sage" onClick={() => go("quote")}>Get a quote <ArrowRight className="w-4 h-4" aria-hidden="true" /></Btn>
              <button onClick={() => go("contact")}
                className="text-sage-light hover:text-white text-sm inline-flex items-center gap-1.5 cursor-pointer">
                Ask a question <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
          <StatStrip />
        </div>
      </section>

      {/* ── The shape of it — the whole page in one drawing ───────────────── */}
      <section className="relative ground-paper border-t border-black/8 py-10 md:py-16" style={GRID_BG}>
        <div className="max-w-6xl mx-auto px-6 relative">
          <SLabel>The shape of it</SLabel>
          <h2 className="font-semibold text-ink leading-[1.08] tracking-tight mb-3 max-w-[20ch]" style={{ ...DISPLAY, fontSize: "clamp(1.55rem, 3.2vw, 2.05rem)" }}>
            Three phases, and what each one asks of you.
          </h2>
          <p className="text-body text-[15.5px] leading-relaxed split-prose mb-8">
            Numbered steps below are yours. Everything between them is {brandSubject() === "We" ? "ours" : `${brand}'s`}.
          </p>

          <ProcessRail className="mb-9" />

          {/* 3-across at every breakpoint, 375px included: the money arc has to
              be readable in one glance before any detail is read. */}
          <div className="grid grid-cols-3 border-l border-black/10">
            {PHASES.map((p) => (
              <a key={p.id} href={`#${p.id}`}
                className="border-r border-y border-black/10 bg-white px-3 py-4 md:px-5 md:py-5 hover:bg-sage-veil transition-colors">
                <div className="text-[10px] uppercase tracking-[0.12em] text-quiet mb-1 font-data">{p.label.replace(" — ", " · ")}</div>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="figure">{p.paid}</span>
                </div>
                <div className="mb-2"><Meter paid={p.paid} /></div>
                <div className="text-[11.5px] md:text-[12.5px] text-body leading-snug font-data">{p.duration}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <PhaseSection p={PHASES[0]} brand={brand} onQuote={() => go("quote")} />

      {/* ── The line ──────────────────────────────────────────────────────────
          A full-bleed DARK BAND, not a panel on a light section. This is the
          most commercially important sentence on the site, so it is the one
          place on the page where the GROUND itself changes — the line in the
          sentence and the line on the page are the same line. A coloured box
          placed on an unchanged ground can only ever illustrate a threshold;
          changing the ground IS one.

          It was a sage panel — which is the closing CtaBanner's exact
          treatment. The page's central promise was wearing the advert's
          clothes, and the repetition cost the banner its distinctiveness too.
          Sage survives here as two things only: the rule across the top, and
          the money marker at the foot.

          Bone above, night here, bone below: no two like grounds meet, and the
          break is the hardest on the page, which is correct — it is the only
          threshold that changes what you owe. */}
      <section id="the-line" aria-labelledby="the-line-h" className="relative bg-night overflow-hidden py-14 md:py-20">
        <span className="absolute inset-x-0 top-0 h-0.5 bg-sage" aria-hidden="true" />
        <GhostMark size={320} opacity={0.06} color="#fff" pos="right-0 bottom-0" />
        <div className="relative max-w-6xl mx-auto px-6">
          <SLabel light>The line</SLabel>
          <h2 id="the-line-h" className="font-semibold text-white leading-[1.06] tracking-tight mb-4 max-w-[20ch]"
            style={{ ...DISPLAY, fontSize: "clamp(1.7rem, 3.6vw, 2.3rem)" }}>
            Everything above this line is free.
          </h2>
          <p className="text-white/70 leading-relaxed max-w-[58ch] text-[15.5px] md:text-base">
            You have paid nothing and you owe nothing. Walk away here and that stays true. Below the line you have accepted a reviewed quote — and only then does an invoice exist.
          </p>
          {/* The money marker, centred in a rule that spans the band. The
              meters are the account area's 50/50 glyph, recoloured for a dark
              ground; the percentage beside each one is written out, so the
              meaning is never carried by the glyph alone. */}
          <div className="mt-9 md:mt-11 flex items-center gap-4 md:gap-6">
            <span className="flex-1 h-px bg-white/15" aria-hidden="true" />
            <span className="flex items-center gap-3 flex-shrink-0 text-sage-light text-[13px] md:text-sm font-data">
              <span className="flex items-center gap-2">
                <span className="flex gap-1" aria-hidden="true">
                  <span className="block w-2.5 h-2.5 border border-white/40" />
                  <span className="block w-2.5 h-2.5 border border-white/40" />
                </span>0%
              </span>
              <ArrowRight className="w-4 h-4 text-white/40" aria-hidden="true" />
              <span className="flex items-center gap-2">
                <span className="flex gap-1" aria-hidden="true">
                  <span className="block w-2.5 h-2.5 bg-sage-light border border-sage-light" />
                  <span className="block w-2.5 h-2.5 border border-white/40" />
                </span>50%
              </span>
            </span>
            <span className="flex-1 h-px bg-white/15" aria-hidden="true" />
          </div>
        </div>
      </section>

      <PhaseSection p={PHASES[1]} brand={brand} onQuote={() => go("quote")} />

      {/* ── Before despatch — the card section between phases ─────────────── */}
      <section className="relative ground-paper border-t border-black/8 py-12 md:py-16" style={GRID_BG}>
        <div className="max-w-6xl mx-auto px-6 relative">
          <SLabel>Before despatch</SLabel>
          <h2 className="font-semibold text-ink leading-[1.08] tracking-tight mb-7 max-w-[20ch]" style={{ ...DISPLAY, fontSize: "clamp(1.55rem, 3.2vw, 2.05rem)" }}>
            You see it before it ships.
          </h2>
          {/* A real photograph of a real unit — this section is literally about
              photographing what you ordered, so product imagery is the subject
              here, not decoration. */}
          <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] card">
            <div className="relative min-h-[220px] md:min-h-[300px] bg-night overflow-hidden">
              {qaShot && <img src={qaShot} alt="A finished aluminium window unit, photographed before despatch" className="absolute inset-0 w-full h-full object-cover" />}
              <span className="absolute left-4 bottom-4 bg-ink/85 text-white text-[11px] uppercase tracking-[0.14em] px-2.5 py-1.5 font-data">
                Pre-despatch QA
              </span>
            </div>
            <div className="divide-y divide-black/10">
              {[
                { icon: Camera, t: "Every item photographed", p: "Photographs of your actual units, shared with you." },
                { icon: Send, t: "Then the balance is invoiced", p: "Not before. If something is wrong, it is wrong on our side of the invoice." },
              ].map((c) => (
                <div key={c.t} className="px-6 py-6 md:px-8 md:py-7">
                  <span className="w-8 h-8 mb-3 flex items-center justify-center border border-sage/40 text-sage">
                    <c.icon className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <h3 className="font-semibold text-ink text-[17px] leading-tight mb-1.5 font-display">{c.t}</h3>
                  <p className="text-body text-[14.5px] leading-relaxed">{c.p}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <PhaseSection p={PHASES[2]} brand={brand} onQuote={() => go("quote")}>
        <div className="mt-4 card px-5 py-4 flex items-start gap-3">
          <Truck className="w-4 h-4 flex-shrink-0 mt-0.5 text-body" strokeWidth={1.8} aria-hidden="true" />
          <span className="text-[13px] text-body leading-relaxed">{FOOTNOTE}</span>
        </div>
      </PhaseSection>

      {/* ── CTA — the shared banner, on paper after a bone section ─────────── */}
      <CtaBanner
        title="Get a number in about a minute. A reviewed quote when you're ready."
        sub="Enter a few dimensions, or upload your schedule and we'll prepare it for review."
        onQuote={() => go("quote")}
      />
    </div>
  );
}
