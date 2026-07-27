import { ArrowRight, Info, Upload } from "lucide-react";
import { GhostMark, SLabel, Btn, type Page } from "../app/ui";
import { getPage, imageUrl } from "../data/catalogue";
import { brandName, brandSubject } from "../data/sanity";

const DISPLAY = { fontFamily: "'Space Grotesk', sans-serif" } as const;
const MONO = { fontFamily: "'DM Mono', monospace" } as const;

// The four answers a first-time visitor actually arrives with. Deliberately no
// single end-to-end duration: the real span is a quote review, a build and a
// delivery, and one headline number reads as a promise about the whole job.
// Durations live per phase in the ledger, matching what the account area tells
// a paying customer.
const FACTS = [
  { k: "To get a quote", v: "$0", sub: "no account, no card" },
  { k: "First payment", v: "50%", sub: "only after you accept" },
  { k: "Your involvement", v: "6 moments", sub: "the rest is ours" },
  { k: "Model", v: "Supply only", sub: "you arrange installation" },
];

// ── The handover ledger ──────────────────────────────────────────────────────
// Ownership is the LAYOUT AXIS, not a badge on a step. Every moment sits in one
// lane or the other, so a customer action has nowhere to hide — which is exactly
// how earlier drafts lost drawings sign-off and despatch confirmation inside a
// step labelled as ours.
//
// The numbered moments are the SIX customer gates the app itself enforces
// (accountModel.tsx `deriveGates`, worker/lib/orders.ts): submit · accept · pay
// deposit · sign off · pay balance · confirm. Keep this list and that one in
// step — a count stated here and contradicted by the product is worse than no
// count at all.
type Moment = {
  side: "you" | "us";
  n?: string;
  title: string;
  body: string;
  meta?: string;
  /** Cumulative percentage paid AFTER this moment; set only where it changes. */
  paid?: 0 | 50 | 100;
};

const LEDGER: Moment[] = [
  { side: "you", n: "01", title: "Price it", paid: 0,
    body: "Enter your dimensions and options, or upload a window and door schedule. No account needed." },
  { side: "us", title: "Indicative estimate, instantly",
    body: "A number on screen, worked out from your numbers. Not a quote yet." },
  { side: "you", n: "02", title: "Submit it for pricing",
    body: "One click. If anything is unclear we'll ask you, and you answer." },
  { side: "us", title: "Technical review — by a person", meta: "about 2 business days",
    body: "Specifications, dimensions and manufacturing suitability checked by hand." },
  { side: "us", title: "Reviewed quote issued",
    body: "Itemised line by line, with the specification confirmed. Nothing charged yet." },
  { side: "you", n: "03", title: "Accept it, and pay 50%", paid: 50,
    body: "The first time anything is charged — and the number you pay is the number you accepted. Stop before this point and you owe nothing." },
  { side: "us", title: "Shop drawings prepared",
    body: "Every unit and every dimension, drawn for your approval." },
  { side: "you", n: "04", title: "Sign off the drawings",
    body: "Nothing is manufactured until you do. Changes are free up to this point; dimensions lock when you sign." },
  { side: "us", title: "Manufacturing", meta: "about 3–4 weeks",
    body: "Nothing needed from you while your order is built." },
  { side: "us", title: "Quality check before despatch",
    body: "Every item photographed and shared with you — before it leaves the factory." },
  { side: "you", n: "05", title: "Pay the balance", paid: 100,
    body: "The final 50%, invoiced only after you've seen the photos." },
  { side: "you", n: "06", title: "Confirm you're ready",
    body: "Delivery is booked on your go-ahead, not before." },
  { side: "us", title: "Delivered to your door", meta: "about 2 weeks after the balance",
    body: "Across Melbourne and Victoria. After-sales support carries on from there." },
];

/** Paid-so-far meter: two cells, echoing the 50/50 bar in the account area.
 *  Rendered only where the number changes — fewer marks make the change loud. */
function PaidMeter({ paid }: { paid: 0 | 50 | 100 }) {
  const cell = (filled: boolean) => (
    <span className={`block w-2.5 h-2.5 border ${filled ? "bg-[#131311] border-[#131311]" : "border-black/25"}`} />
  );
  return (
    <span className="inline-flex flex-col items-start gap-1" aria-hidden="true">
      <span className="flex gap-1">{cell(paid >= 50)}{cell(paid >= 100)}</span>
      <span className="text-[10px] tracking-[0.1em] text-[#8a8782]" style={MONO}>
        {paid === 0 ? "0%" : paid === 50 ? "50%" : "100%"}
      </span>
    </span>
  );
}

// One ledger row. Ownership is carried THREE ways at once — lane position, a
// filled vs. hollow square, and a text label — so it survives the mobile
// collapse and never depends on colour alone.
function LedgerRow({ m, brand }: { m: Moment; brand: string }) {
  const yours = m.side === "you";
  return (
    <div className="grid grid-cols-[44px_1fr] md:grid-cols-[92px_1fr_1fr] border-b border-black/10 bg-white">
      {/* Money rail — desktop. Only the rows where the total changes carry a mark. */}
      <div className="hidden md:flex items-start justify-center pt-7 border-r border-black/10">
        {m.paid !== undefined && <PaidMeter paid={m.paid} />}
      </div>

      {/* Mobile ownership rail: a solid bar for your moments, a hairline for ours. */}
      <div className="md:hidden flex items-start justify-center pt-7">
        <span className={yours ? "block w-2.5 h-2.5 bg-[#131311]" : "block w-2.5 h-2.5 border border-black/25"} />
      </div>

      {/* YOU lane */}
      <div className={`px-4 py-5 md:px-7 md:py-7 md:border-r border-black/10 ${yours ? "" : "hidden md:block"}`}>
        {yours && <MomentBody m={m} label="You" />}
      </div>

      {/* Company lane. On mobile it shares the single column and is indented, so
          the zig-zag survives as a shape even without two columns. */}
      <div className={`px-4 py-5 pl-8 md:pl-7 md:px-7 md:py-7 ${yours ? "hidden md:block" : ""}`}>
        {!yours && <MomentBody m={m} label={brand} />}
      </div>
    </div>
  );
}

function MomentBody({ m, label }: { m: Moment; label: string }) {
  const yours = m.side === "you";
  return (
    <>
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className={yours ? "w-2.5 h-2.5 bg-[#131311] flex-shrink-0" : "w-2.5 h-2.5 border border-black/30 flex-shrink-0"} aria-hidden="true" />
        {m.n && <span className="text-[11px] tracking-[0.12em] text-[#131311]" style={MONO}>{m.n}</span>}
        {/* Desktop has lane headers, so the per-row label would be noise there;
            on mobile the lanes collapse and it is the primary ownership cue. */}
        <span className="md:hidden text-[10px] uppercase tracking-[0.14em] text-[#8a8782]" style={MONO}>{label}</span>
        {m.paid !== undefined && (
          <span className="md:hidden text-[10px] uppercase tracking-[0.14em] text-[#3f5a4c] border border-[#5A7A6A]/30 bg-[#5A7A6A]/8 px-1.5 py-0.5" style={MONO}>
            {m.paid === 0 ? "Nothing paid" : m.paid === 50 ? "50% paid" : "Paid in full"}
          </span>
        )}
      </div>
      <h3 className={`font-semibold tracking-tight ${yours ? "text-[#131311] text-[17px] md:text-[19px]" : "text-[#3d3b38] text-[15px] md:text-[18px]"}`} style={DISPLAY}>{m.title}</h3>
      {m.meta && <div className="text-[12px] text-[#8a8782] mt-1" style={MONO}>{m.meta}</div>}
      <p className={`text-[#5c5a56] leading-[1.55] mt-1.5 max-w-[46ch] ${yours ? "text-[14.5px]" : "text-[13.5px] md:text-[14px]"}`}>{m.body}</p>
    </>
  );
}


export function HowItWorksPage({ setPage }: { setPage?: (p: Page) => void }) {
  const go = (p: Page) => { setPage?.(p); window.scrollTo(0, 0); };
  // The lane header is the one place a company name earns its keep. When Site
  // Settings has none, "Us" is a pronoun rather than an invented brand.
  const brand = brandName() ?? "Us";
  return (
    <div className="bg-[#FAFAF9] min-h-screen">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
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
              A structured, verified path from an online estimate to windows on your site. You approve the drawings before anything is made, and you see quality-check photos before anything is despatched.
            </p>
          </div>
        </div>
      </section>

      {/* ── Facts strip ──────────────────────────────────────────────────── */}
      <section className="bg-white border-b border-black/10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 border-l border-black/10">
            {FACTS.map((f) => (
              <div key={f.k} className="border-r border-b lg:border-b-0 border-black/8 px-5 py-5">
                <div className="text-[10px] uppercase tracking-[0.12em] text-[#9a9894] mb-1.5" style={MONO}>{f.k}</div>
                <div className="font-medium text-[15px] text-[#131311]" style={DISPLAY}>
                  {f.v}{f.sub && <span className="text-[#5c5a56] font-normal text-[13px]"> {f.sub}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The process: the handover ledger ─────────────────────────────── */}
      <section className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-[60ch] mb-9">
            <SLabel>The process</SLabel>
            <h2 className="font-semibold text-[#131311] leading-[1.08] tracking-tight mb-3" style={{ ...DISPLAY, fontSize: "clamp(1.6rem, 3.4vw, 2.15rem)" }}>
              Six moments are yours. Everything between them is ours.
            </h2>
            <p className="text-[#5c5a56] text-[15.5px] leading-relaxed max-w-[54ch]">
              Follow it top to bottom. Filled squares are the moments you act; hollow squares are the work {brandSubject().toLowerCase() === "we" ? "we do" : `${brand} does`} in between. Nothing is charged until you accept a quote a person has reviewed.
            </p>
          </div>

          {/* Lane headers — desktop only; on mobile every row carries its own label. */}
          <div className="hidden md:grid grid-cols-[92px_1fr_1fr] border-t border-l border-r border-black/10 bg-[#F2F0EC]">
            <div className="px-3 py-2.5 border-r border-black/10 text-[10px] uppercase tracking-[0.14em] text-[#8a8782] text-center" style={MONO}>Paid</div>
            <div className="px-7 py-2.5 border-r border-black/10 text-[10px] uppercase tracking-[0.14em] text-[#131311]" style={MONO}>You</div>
            <div className="px-7 py-2.5 text-[10px] uppercase tracking-[0.14em] text-[#8a8782]" style={MONO}>{brand}</div>
          </div>

          <div className="border-t md:border-t-0 border-l border-r border-black/10">
            {LEDGER.map((m, i) => <LedgerRow key={`${m.side}-${i}`} m={m} brand={brand} />)}
          </div>

          {/* The one thing that is NOT in this process — kept adjacent to the
              ledger rather than as a footnote four screens down. */}
          <div className="border-l border-r border-b border-black/10 bg-[#F2F0EC] px-5 py-5 md:px-7">
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#8a8782] mb-1.5" style={MONO}>Not in this process</div>
            <p className="text-[#5c5a56] text-[14.5px] leading-[1.6] max-w-[60ch]">
              Installation. Supply only — your builder or installer fits the frames on site. We hand over at your address.
            </p>
          </div>
        </div>
      </section>


      {/* ── Payment ──────────────────────────────────────────────────────── */}
      <section className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-[60ch] mb-11">
            <SLabel>Payment</SLabel>
            <h2 className="font-semibold text-[#131311] leading-[1.08] tracking-tight mb-3" style={{ ...DISPLAY, fontSize: "clamp(1.6rem, 3.4vw, 2.15rem)" }}>
              50% to begin. 50% before it ships.
            </h2>
            <p className="text-[#5c5a56] text-[15.5px] leading-relaxed max-w-[54ch]">
              Clear and staged. You never pay before your quote is verified, and the balance falls due only once your order has passed its quality check.
            </p>
          </div>
          <div className="border border-black/10 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-2">
              {[
                { lab: "Deposit — to proceed", p: "Invoiced only after you accept a reviewed, final quote. This releases your order into shop drawings and manufacturing." },
                { lab: "Balance — before despatch", p: "Due after manufacturing and the pre-despatch quality check, once you've seen the photos and confirmed. Then we deliver." },
              ].map((c, i) => (
                <div key={c.lab} className={`px-6 py-7 md:px-8 ${i === 0 ? "border-b md:border-b-0 md:border-r border-black/8" : ""}`}>
                  <div className="font-semibold text-[#3f5a4c] tracking-tight" style={{ ...DISPLAY, fontSize: "34px" }}>50%</div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[#9a9894] my-2" style={MONO}>{c.lab}</div>
                  <p className="text-[#5c5a56] text-[14px] leading-[1.55]">{c.p}</p>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2.5 px-6 md:px-8 py-4 bg-[#F2F0EC] text-[12.5px] text-[#5c5a56] leading-relaxed">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#5c5a56]" strokeWidth={1.8} aria-hidden="true" />
              <span>Instant estimates are indicative only and subject to technical review. Final pricing, manufacturing suitability and delivery timing are confirmed on technical review before any deposit is invoiced. Supply only — installation is not included.</span>
            </div>
          </div>
        </div>
      </section>


      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="pb-20 md:pb-28">
        <div className="max-w-6xl mx-auto px-6">
          <div className="relative bg-[#131311] text-white overflow-hidden p-10 md:p-14">
            <GhostMark size={320} opacity={0.025} color="#fff" pos="right-0 bottom-0" />
            <div className="relative">
              <h2 className="font-semibold tracking-tight mb-3 max-w-[20ch]" style={{ ...DISPLAY, fontSize: "clamp(1.5rem, 3.4vw, 2rem)" }}>
                Get a number in seconds. A real quote when you're ready.
              </h2>
              <p className="text-white/60 text-[15px] max-w-[46ch] mb-7 leading-relaxed">
                Enter a few dimensions for an instant estimate, or upload your window schedule and we'll prepare it for review.
              </p>
              <div className="flex flex-wrap gap-3">
                <Btn variant="sage" size="lg" onClick={() => go("quote")}>Build an estimate <ArrowRight className="w-4 h-4" /></Btn>
                <Btn variant="white" size="lg" onClick={() => go("quote")}><Upload className="w-4 h-4" />Upload plans / schedule</Btn>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
