// How it works — the buying process.
//
// Presentation follows this site's OWN vocabulary for showing a sequence: the
// hairline-collapsed card track from the home page's Process section, inside
// alternating bone/white sections. Deliberately NOT a table — nothing on this
// site is tabular, and a long run of identical rows reads as a document.
//
// Two axes have to survive without a grid:
//
//  • OWNERSHIP is a card SPECIES, not a column. Your moments are white with a
//    sage-hairline box and a DM Mono numeral; our work is bone with a muted
//    glyph and never a numeral — so your cards sit as figure and ours recede
//    into the section as ground. Four cues (fill, numeral, glyph, word), none
//    of them colour alone, and none of them dependent on a two-column layout —
//    which is what the previous lane version got wrong at 375px.
//  • MONEY is three numerals in the same position in three phase headers, plus
//    one sage band at the only threshold that matters. Scrolling turns the
//    money arc into a rhythm instead of a column nobody reaches.
//
// No total step count is stated anywhere. The verb line under "The shape of it"
// self-verifies — six items are six by inspection — and three artefacts have
// already drifted on a hand-written count.
import { ArrowRight, Camera, ClipboardCheck, FileText, Info, PenLine, Send, Truck, Upload, Factory } from "lucide-react";
import { GhostMark, SLabel, Btn, CtaBanner, type Page } from "../app/ui";
import { getPage, imageUrl, products } from "../data/catalogue";
import { brandName, brandSubject } from "../data/sanity";

const DISPLAY = { fontFamily: "'Space Grotesk', sans-serif" } as const;
const MONO = { fontFamily: "'DM Mono', monospace" } as const;
const GRID_BG = {
  backgroundImage: "linear-gradient(to right,rgba(90,122,106,0.045) 1px,transparent 1px),linear-gradient(to bottom,rgba(90,122,106,0.045) 1px,transparent 1px)",
  backgroundSize: "64px 64px",
};

// Facts live INSIDE the hero as the inline mono strip the home page already
// uses — not as bordered cells butted under it, which was the strongest
// table-echo above the fold and had no precedent on the site.
const HERO_FACTS = ["$0 to get a quote", "~1 minute with a schedule", "50% first payment", "Supply only"];

// The customer's whole job, in order. Placed where the heading gives it
// context rather than in the hero, where bare verbs read as obligations
// before the reader knows what any of them mean.
const VERBS = ["Upload", "Submit", "Accept", "Sign off", "Pay", "Confirm"];

type Card = {
  side: "you" | "us";
  n?: string;          // customer moments only — the numeral is the ownership cue
  icon?: typeof Info;  // our work only
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
  cards: Card[];
  note?: { icon: typeof Info; text: string };
};

const PHASES: Phase[] = [
  {
    id: "phase-quote", label: "Phase 01 — Quote",
    heading: "Get it priced, then checked by a person.",
    paid: "0%", paidNote: "nothing charged", duration: "about 2 business days",
    cards: [
      { side: "you", n: "01", title: "Price it yourself", meta: "about a minute with a schedule",
        body: "Upload your window and door schedule and it prices itself, line by line — no retyping." },
      { side: "us", icon: FileText, title: "An indicative estimate, instantly",
        body: "Every line matched to a product and costed on the spot — a number, not yet a quote." },
      { side: "you", n: "02", title: "Submit it for review",
        body: "One click. If anything is unclear we ask, and you answer." },
      { side: "us", icon: ClipboardCheck, title: "Checked by hand, then quoted", meta: "about 2 business days",
        body: "A person checks specifications, dimensions and buildability, then issues the quote. Nothing is charged." },
    ],
    note: { icon: Info, text: "Instant estimates are indicative and subject to technical review — confirmed before any deposit is invoiced." },
  },
  {
    id: "phase-order", label: "Phase 02 — Order",
    heading: "Approve it, and it gets made.",
    paid: "50%", paidNote: "deposit paid", duration: "about 3–4 weeks",
    cards: [
      { side: "you", n: "03", title: "Accept, and pay 50%", meta: "the first payment",
        body: "The first charge — and the number you pay is the number you accepted." },
      { side: "us", icon: PenLine, title: "Shop drawings prepared",
        body: "Every unit and every dimension, drawn for your approval." },
      { side: "you", n: "04", title: "Sign off the drawings",
        body: "Nothing is made until you do. Changes are free until you sign; dimensions lock then." },
      { side: "us", icon: Factory, title: "Manufactured, then checked", meta: "about 3–4 weeks",
        body: "Nothing needed from you. Every item is checked and photographed before it leaves the factory." },
    ],
  },
  {
    id: "phase-delivery", label: "Phase 03 — Delivery",
    heading: "Pay the balance, then it arrives.",
    paid: "100%", paidNote: "paid in full", duration: "about 2 weeks",
    cards: [
      { side: "you", n: "05", title: "Pay the balance",
        body: "The final 50%, invoiced only after you have seen the photos." },
      { side: "you", n: "06", title: "Confirm you're ready",
        body: "Delivery is booked on your go-ahead, not before." },
      { side: "us", icon: Truck, title: "Delivered to your door", meta: "about 2 weeks after the balance",
        body: "Across Melbourne and Victoria, with after-sales support from there." },
    ],
    note: { icon: Truck, text: "Supply only — your builder or installer fits the frames. We hand over at your address." },
  },
];

/** Two filled/hollow cells — the same 50/50 glyph the account area uses.
 *  aria-hidden: the percentage is always written out beside it. */
function Meter({ paid }: { paid: "0%" | "50%" | "100%" }) {
  const cell = (on: boolean) => <span className={`block w-2.5 h-2.5 border ${on ? "bg-[#131311] border-[#131311]" : "border-black/25"}`} />;
  return <span className="flex gap-1" aria-hidden="true">{cell(paid !== "0%")}{cell(paid === "100%")}</span>;
}

function ProcessCard({ c, brand, last }: { c: Card; brand: string; last: boolean }) {
  const yours = c.side === "you";
  const Icon = c.icon ?? FileText;
  return (
    <div className={`relative border border-black/10 p-5 md:p-6 flex flex-col
      sm:[&:nth-child(n+2)]:-mt-px lg:[&:nth-child(n+2)]:mt-0 lg:[&:nth-child(n+2)]:-ml-px
      ${yours ? "bg-white" : "bg-[#FAFAF9]"}`}>
      <div className="flex items-center justify-between mb-4">
        <span className={`flex items-center justify-center border
          ${yours ? "w-11 h-11 border-[#5A7A6A]/40 text-[#5A7A6A] text-[15px]" : "w-8 h-8 border-black/12 text-[#8a8782] text-xs"}`} style={MONO}>
          {yours ? c.n : <Icon className="w-4 h-4" aria-hidden="true" />}
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-[#8a8782]" style={MONO}>
          {yours ? "You" : brand}
        </span>
      </div>
      <h3 className={`font-semibold leading-tight mb-1.5 ${yours ? "text-[#131311] text-[18px] md:text-[19px]" : "text-[#3d3b38] text-[15px]"}`} style={DISPLAY}>
        {c.title}
      </h3>
      {c.meta && <div className="text-[11px] text-[#8a8782] mb-1.5" style={MONO}>{c.meta}</div>}
      <p className="text-[#5c5a56] text-[14.5px] leading-relaxed">{c.body}</p>
      {/* Connector punches through the shared hairline. Its fill must match the
          card it sits on, or the join shows a notch. */}
      {!last && (
        <>
          <ArrowRight className={`hidden lg:block absolute -right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A7A6A]/60 z-10 ${yours ? "bg-white" : "bg-[#FAFAF9]"}`} aria-hidden="true" />
          <ArrowRight className={`lg:hidden absolute left-1/2 -translate-x-1/2 -bottom-2.5 w-4 h-4 rotate-90 text-[#5A7A6A]/60 z-10 ${yours ? "bg-white" : "bg-[#FAFAF9]"}`} aria-hidden="true" />
        </>
      )}
    </div>
  );
}

function PhaseSection({ p, brand }: { p: Phase; brand: string }) {
  return (
    <section id={p.id} aria-labelledby={`${p.id}-h`} className="relative bg-[#FAFAF9] py-12 md:py-20 overflow-hidden">
      <GhostMark size={300} opacity={0.04} pos="right-0 bottom-0" />
      <div className="max-w-6xl mx-auto px-6 relative">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-9">
          <div className="max-w-[46ch]">
            <SLabel>{p.label}</SLabel>
            <h2 id={`${p.id}-h`} className="font-semibold text-[#131311] leading-[1.08] tracking-tight" style={{ ...DISPLAY, fontSize: "clamp(1.55rem, 3.2vw, 2.05rem)" }}>
              {p.heading}
            </h2>
            {p.intro && <p className="text-[#5c5a56] text-[15.5px] leading-relaxed mt-2.5">{p.intro}</p>}
          </div>
          {/* Money, in the same place in every phase header. */}
          <div className="md:text-right flex-shrink-0">
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#8a8782] mb-1.5" style={MONO}>Paid so far</div>
            <div className="flex md:justify-end items-center gap-2">
              <Meter paid={p.paid} />
              <span className="font-semibold text-[#3f5a4c] leading-none" style={{ ...DISPLAY, fontSize: "clamp(2rem, 5vw, 2.75rem)" }}>{p.paid}</span>
            </div>
            <div className="text-[12px] text-[#5c5a56] mt-1" style={MONO}>{p.paidNote} · {p.duration}</div>
          </div>
        </div>

        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-0 ${p.cards.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
          {p.cards.map((c, i) => <ProcessCard key={c.title} c={c} brand={brand} last={i === p.cards.length - 1} />)}
        </div>

        {p.note && (
          <div className="mt-4 border border-black/10 bg-white px-5 py-4 flex items-start gap-3">
            <p.note.icon className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#5c5a56]" strokeWidth={1.8} aria-hidden="true" />
            <span className="text-[13px] text-[#5c5a56] leading-relaxed">{p.note.text}</span>
          </div>
        )}
      </div>
    </section>
  );
}

export function HowItWorksPage({ setPage }: { setPage?: (p: Page) => void }) {
  const go = (p: Page) => { setPage?.(p); window.scrollTo(0, 0); };
  // The ownership eyebrow is the one place a company name earns its keep. With
  // Site Settings unset it reads "We" — a pronoun, never an invented brand.
  const brand = brandName() ?? "We";
  // A featured product photograph stands in for the QA shot. Falls back to
  // nothing rather than a placeholder if the catalogue has no imagery.
  const qaShot = imageUrl(products.find((pr) => pr.heroImage)?.heroImage, { w: 900, h: 700 }) || "";

  return (
    <div className="bg-[#FAFAF9] min-h-screen">
      {/* ── Hero (facts live inside it, not butted underneath) ───────────── */}
      <section className="relative bg-[#0c0c0a] overflow-hidden">
        <img src={imageUrl(getPage("how-it-works")?.heroImage, { w: 1600, h: 900 })} alt="Dark aluminium window frames in a contemporary residential interior"
          className="absolute inset-0 w-full h-full object-cover object-center opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c0c0a]/95 via-[#0c0c0a]/80 to-[#0c0c0a]/35" />
        <div className="relative w-full max-w-6xl mx-auto px-6 pt-32 pb-14 md:pt-36 md:pb-16">
          <div className="max-w-2xl">
            <SLabel light>How it works</SLabel>
            <h1 className="font-semibold text-white leading-[1.03] tracking-tight mb-4 max-w-[15ch]" style={{ ...DISPLAY, fontSize: "clamp(2.1rem, 5vw, 3.5rem)" }}>
              From estimate to delivery, without the guesswork.
            </h1>
            <p className="text-white/70 leading-relaxed max-w-xl text-base md:text-lg">
              Upload a schedule and it prices itself. Nothing is charged until you accept a quote a person has checked.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-white/55" style={MONO}>
              {HERO_FACTS.map((f, i) => (
                <span key={f} className="flex items-center gap-3">
                  {i > 0 && <span className="w-px h-3 bg-white/20" aria-hidden="true" />}{f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── The shape of it — the whole page in one screen ────────────────── */}
      <section className="relative bg-white border-t border-black/8 py-10 md:py-16" style={GRID_BG}>
        <div className="max-w-6xl mx-auto px-6 relative">
          <SLabel>The shape of it</SLabel>
          <h2 className="font-semibold text-[#131311] leading-[1.08] tracking-tight mb-3 max-w-[20ch]" style={{ ...DISPLAY, fontSize: "clamp(1.55rem, 3.2vw, 2.05rem)" }}>
            Three phases, and what each one asks of you.
          </h2>
          <p className="text-[#5c5a56] text-[15.5px] leading-relaxed max-w-[54ch] mb-3">
            Numbered steps below are yours. Everything between them is {brandSubject() === "We" ? "ours" : `${brand}'s`}.
          </p>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-[#131311] mb-8" style={MONO}>
            {VERBS.map((v, i) => (
              <span key={v} className="flex items-center gap-2.5">
                {i > 0 && <span className="text-[#c9c6c1]" aria-hidden="true">·</span>}{v}
              </span>
            ))}
          </div>

          {/* 3-across at every breakpoint, 375px included: the money arc has to
              be readable in one glance before any detail is read. */}
          <div className="grid grid-cols-3 border-l border-black/10">
            {PHASES.map((p) => (
              <a key={p.id} href={`#${p.id}`}
                className="border-r border-y border-black/10 bg-white px-3 py-4 md:px-5 md:py-5 hover:bg-[#F7F8F6] transition-colors">
                <div className="text-[10px] uppercase tracking-[0.12em] text-[#8a8782] mb-1" style={MONO}>{p.label.replace(" — ", " · ")}</div>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="font-semibold text-[#3f5a4c] leading-none" style={{ ...DISPLAY, fontSize: "clamp(1.6rem, 6vw, 2.4rem)" }}>{p.paid}</span>
                </div>
                <div className="mb-2"><Meter paid={p.paid} /></div>
                <div className="text-[11.5px] md:text-[12.5px] text-[#5c5a56] leading-snug" style={MONO}>{p.duration}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <PhaseSection p={PHASES[0]} brand={brand} />

      {/* ── The line — the only sage fill on the page, at the one threshold ── */}
      <section className="bg-white border-t border-black/8 py-12 md:py-14">
        <div className="max-w-6xl mx-auto px-6">
          <div className="relative bg-[#5A7A6A] text-white overflow-hidden p-8 md:p-12">
            <GhostMark size={300} opacity={0.08} color="#fff" pos="right-0 bottom-0" />
            <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div className="max-w-[46ch]">
                <SLabel light>The line</SLabel>
                <h2 className="font-semibold leading-[1.08] tracking-tight mb-3" style={{ ...DISPLAY, fontSize: "clamp(1.5rem, 3.2vw, 2rem)" }}>
                  Everything above this line is free.
                </h2>
                <p className="text-white/75 text-[15.5px] leading-relaxed">
                  You have paid nothing and you owe nothing. Walk away here and that stays true. Below the line you have accepted a reviewed quote — and only then does an invoice exist.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 text-white" style={MONO}>
                <span className="flex items-center gap-2"><span className="flex gap-1" aria-hidden="true"><span className="block w-2.5 h-2.5 border border-white/50" /><span className="block w-2.5 h-2.5 border border-white/50" /></span>0%</span>
                <ArrowRight className="w-4 h-4 text-white/60" aria-hidden="true" />
                <span className="flex items-center gap-2"><span className="flex gap-1" aria-hidden="true"><span className="block w-2.5 h-2.5 bg-white border border-white" /><span className="block w-2.5 h-2.5 border border-white/50" /></span>50%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PhaseSection p={PHASES[1]} brand={brand} />

      {/* ── Before despatch — the card section between phases ─────────────── */}
      <section className="relative bg-white border-t border-black/8 py-12 md:py-16" style={GRID_BG}>
        <div className="max-w-6xl mx-auto px-6 relative">
          <SLabel>Before despatch</SLabel>
          <h2 className="font-semibold text-[#131311] leading-[1.08] tracking-tight mb-7 max-w-[20ch]" style={{ ...DISPLAY, fontSize: "clamp(1.55rem, 3.2vw, 2.05rem)" }}>
            You see it before it ships.
          </h2>
          {/* A real photograph of a real unit — this section is literally about
              photographing what you ordered, so product imagery is the subject
              here, not decoration. */}
          <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] border border-black/10 bg-white">
            <div className="relative min-h-[220px] md:min-h-[300px] bg-[#0c0c0a] overflow-hidden">
              {qaShot && <img src={qaShot} alt="A finished aluminium window unit, photographed before despatch" className="absolute inset-0 w-full h-full object-cover" />}
              <span className="absolute left-4 bottom-4 bg-[#131311]/85 text-white text-[11px] uppercase tracking-[0.14em] px-2.5 py-1.5" style={MONO}>
                Pre-despatch QA
              </span>
            </div>
            <div className="divide-y divide-black/10">
              {[
                { icon: Camera, t: "Every item photographed", p: "Photographs of your actual units, shared with you." },
                { icon: Send, t: "Then the balance is invoiced", p: "Not before. If something is wrong, it is wrong on our side of the invoice." },
              ].map((c) => (
                <div key={c.t} className="px-6 py-6 md:px-8 md:py-7">
                  <span className="w-8 h-8 mb-3 flex items-center justify-center border border-[#5A7A6A]/40 text-[#5A7A6A]">
                    <c.icon className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <h3 className="font-semibold text-[#131311] text-[17px] leading-tight mb-1.5" style={DISPLAY}>{c.t}</h3>
                  <p className="text-[#5c5a56] text-[14.5px] leading-relaxed">{c.p}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <PhaseSection p={PHASES[2]} brand={brand} />

      {/* ── CTA ──────────────────────────────────────────────────────────────
          The shared banner. This one was a dark panel with two buttons that both
          went to /quote anyway — a choice with no consequence. */}
      <CtaBanner
        title="Get a number in seconds. A real quote when you're ready."
        sub="Enter a few dimensions, or upload your schedule and we'll prepare it for review."
        onQuote={() => go("quote")}
      />
    </div>
  );
}
