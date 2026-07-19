import { ArrowRight, Camera, Check, ClipboardCheck, Info, Upload } from "lucide-react";
import { GhostMark, SAGE, SLabel, WindowMark, Btn, type Page } from "../app/ui";

const GRID_BG = {
  backgroundImage: "linear-gradient(to right,rgba(90,122,106,0.045) 1px,transparent 1px),linear-gradient(to bottom,rgba(90,122,106,0.045) 1px,transparent 1px)",
  backgroundSize: "64px 64px",
};
const HERO_IMAGE = "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1600&h=900&fit=crop&auto=format";
const DISPLAY = { fontFamily: "'Space Grotesk', sans-serif" } as const;
const MONO = { fontFamily: "'DM Mono', monospace" } as const;

const FACTS = [
  { k: "Model", v: "Supply only", sub: "— no installation" },
  { k: "Payment", v: "50% / 50%", sub: "deposit + balance" },
  { k: "Your checkpoint", v: "Sign off before build", sub: "" },
  { k: "Delivery", v: "≈ 2 weeks", sub: "door-to-door, VIC" },
];

const STEPS = [
  {
    n: "01", verb: "Price", sub: "— your number, then your quote",
    desc: "Start with an instant indicative estimate on the website. When you're ready, submit your job and OpenFrame reviews it and issues a detailed, final quote for your specifications.",
    micro: ["Instant online estimate", "Submit full quote request", "OpenFrame issues final quote"],
  },
  {
    n: "02", verb: "Approve", sub: "— accept, then 50% to begin",
    desc: "Happy with the quote? Accept it and we invoice a 50% deposit to start your order. Nothing is charged until your quote has been reviewed and confirmed by OpenFrame.",
    micro: ["Accept final quote", "50% deposit invoiced", "Payment starts your order"],
  },
  {
    n: "03", verb: "Confirm", sub: "— you sign off before anything is made", checkpoint: true,
    desc: "OpenFrame prepares shop drawings showing every window, door and dimension in your order. You review and sign off — so what gets built is exactly what you approved, down to the millimetre.",
    micro: ["Shop drawings prepared", "You review every item", "Sign off to release for build"],
  },
  {
    n: "04", verb: "Build", sub: "— checked in front of you", checkpoint: true,
    desc: "Your order goes into manufacturing. Before anything is despatched, we share quality-assurance photos of every item — so you can see it's right before it leaves the factory.",
    micro: ["Manufacturing", "Pre-despatch QA, every item", "Photos shared with you"],
  },
  {
    n: "05", verb: "Deliver", sub: "— balance, final OK, door-to-door",
    desc: "Settle the remaining 50%, give the final go-ahead, and we deliver door-to-door across Melbourne and Victoria — around two weeks. After-sales support carries on from there.",
    micro: ["Final 50% balance", "You confirm OK", "Delivery ≈ 2 weeks", "After-sales support"],
  },
];

function Microstep({ children }: { children: string }) {
  return (
    <span className="text-[11px] tracking-[0.02em] text-[#3f5a4c] bg-[#5A7A6A]/8 border border-[#5A7A6A]/20 px-2.5 py-1.5" style={MONO}>
      {children}
    </span>
  );
}

export function HowItWorksPage({ setPage }: { setPage?: (p: Page) => void }) {
  const go = (p: Page) => { setPage?.(p); window.scrollTo(0, 0); };
  return (
    <div className="bg-[#FAFAF9] min-h-screen">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative bg-[#0c0c0a] overflow-hidden">
        <img src={HERO_IMAGE} alt="Dark aluminium window frames in a contemporary residential interior"
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

      {/* ── Process ──────────────────────────────────────────────────────── */}
      <section className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-[60ch] mb-11">
            <SLabel>The process</SLabel>
            <h2 className="font-semibold text-[#131311] leading-[1.08] tracking-tight mb-3" style={{ ...DISPLAY, fontSize: "clamp(1.6rem, 3.4vw, 2.15rem)" }}>
              Five steps. Two are yours to approve.
            </h2>
            <p className="text-[#5c5a56] text-[15.5px] leading-relaxed max-w-[54ch]">
              The full job runs through drawings, manufacturing and quality checks behind the scenes — but from your side it's five clear stages, and nothing gets built or shipped until you've signed off.
            </p>
          </div>

          <div className="border-t border-black/10">
            {STEPS.map((s) => (
              <div key={s.n}
                className={`grid grid-cols-[56px_1fr] md:grid-cols-[88px_1fr] border-b border-black/10 ${s.checkpoint ? "bg-gradient-to-r from-[#5A7A6A]/[0.06] to-white" : "bg-white"}`}>
                {/* rail */}
                <div className={`flex flex-col items-center py-7 md:py-8 border-r ${s.checkpoint ? "bg-[#5A7A6A] border-[#5A7A6A]" : "border-black/10"}`}
                  style={!s.checkpoint ? { backgroundImage: "linear-gradient(180deg, transparent, rgba(90,122,106,0.08))" } : undefined}>
                  <span className="text-[12px] font-medium" style={{ ...MONO, color: s.checkpoint ? "#fff" : "#3f5a4c" }}>{s.n}</span>
                  <span className="mt-3.5" style={{ opacity: s.checkpoint ? 0.9 : 0.55 }}>
                    <WindowMark size={22} color={s.checkpoint ? "#fff" : SAGE} />
                  </span>
                </div>
                {/* body */}
                <div className="px-6 py-7 md:px-8 md:py-8">
                  {s.checkpoint && (
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5A7A6A]" />
                      <span className="text-[10px] uppercase tracking-[0.12em] text-[#3f5a4c]" style={MONO}>Your checkpoint</span>
                    </div>
                  )}
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <h3 className="font-semibold text-[#131311] tracking-tight" style={{ ...DISPLAY, fontSize: "clamp(1.3rem, 2.6vw, 1.6rem)" }}>{s.verb}</h3>
                    <span className="text-[15px] text-[#5c5a56]">{s.sub}</span>
                  </div>
                  <p className="text-[#5c5a56] text-[15px] leading-[1.6] mt-3 mb-4 max-w-[60ch]">{s.desc}</p>
                  <div className="flex flex-wrap gap-2">
                    {s.micro.map((m) => <Microstep key={m}>{m}</Microstep>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust / low-risk ─────────────────────────────────────────────── */}
      <section className="relative bg-white border-t border-b border-black/10 py-16 md:py-24" style={GRID_BG}>
        <GhostMark size={320} opacity={0.025} pos="right-0 bottom-0" />
        <div className="max-w-6xl mx-auto px-6 relative">
          <div className="max-w-[60ch] mb-11">
            <SLabel>Why it's low-risk</SLabel>
            <h2 className="font-semibold text-[#131311] leading-[1.08] tracking-tight mb-3" style={{ ...DISPLAY, fontSize: "clamp(1.6rem, 3.4vw, 2.15rem)" }}>
              Two points where you're in control.
            </h2>
            <p className="text-[#5c5a56] text-[15.5px] leading-relaxed max-w-[54ch]">
              Made-to-measure supply only works if what arrives is right. Two sign-offs make sure of it.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { Icon: ClipboardCheck, h: "You sign off the drawings", p: "Nothing is manufactured until you've reviewed shop drawings showing every unit and dimension and approved them. No surprises off a misread schedule." },
              { Icon: Camera, h: "You see QA photos before despatch", p: "Every item is photographed during a pre-despatch quality check and shared with you. You confirm it's right before it leaves the factory — not after it's on your site." },
            ].map(({ Icon, h, p }) => (
              <div key={h} className="relative bg-white border border-black/10 p-6 md:p-7 overflow-hidden">
                <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-[#5A7A6A]/35" />
                <Icon className="w-8 h-8 text-[#5A7A6A]" strokeWidth={1.5} aria-hidden="true" />
                <h3 className="font-semibold text-[#131311] text-lg mt-3 mb-2 tracking-tight" style={DISPLAY}>{h}</h3>
                <p className="text-[#5c5a56] text-[14.5px] leading-[1.6]">{p}</p>
              </div>
            ))}
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
              <span>Instant estimates are indicative only and subject to technical review. Final pricing, manufacturing suitability and delivery timing are confirmed by OpenFrame before any deposit is invoiced. Supply only — installation is not included.</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Provide / Handle ─────────────────────────────────────────────── */}
      <section className="pb-16 md:pb-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-black/10 bg-white p-6 md:p-7">
              <h4 className="text-[11px] uppercase tracking-[0.12em] text-[#9a9894] mb-4" style={MONO}>What you provide</h4>
              <ul className="flex flex-col gap-3">
                {[
                  "Product types, sizes and quantities — or a window schedule / plans to upload",
                  "Dimensions confirmed by a qualified builder or installer",
                  "Delivery suburb and site access details",
                  "Sign-off on shop drawings before manufacture",
                ].map((t) => (
                  <li key={t} className="flex gap-3 text-[14.5px] text-[#131311]">
                    <Check className="w-4 h-4 text-[#5A7A6A] flex-shrink-0 mt-0.5" strokeWidth={2} aria-hidden="true" />{t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-black/10 bg-white p-6 md:p-7">
              <h4 className="text-[11px] uppercase tracking-[0.12em] text-[#9a9894] mb-4" style={MONO}>What OpenFrame handles</h4>
              <ul className="flex flex-col gap-3">
                {[
                  "Technical review of every specification and dimension",
                  "Shop drawings, manufacturing and compliance documentation",
                  "Pre-despatch quality assurance on every item",
                  "Door-to-door delivery across Melbourne and Victoria",
                ].map((t) => (
                  <li key={t} className="flex gap-3 text-[14.5px] text-[#131311]">
                    <Check className="w-4 h-4 text-[#131311] flex-shrink-0 mt-0.5" strokeWidth={2} aria-hidden="true" />{t}
                  </li>
                ))}
              </ul>
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
