import { Check, CheckCircle, FileText, Lock, Search, Truck, Upload } from "lucide-react";
import { GhostMark, SAGE, SLabel, WindowMark } from "../app/ui";

const GRID_BG = {
  backgroundImage: "linear-gradient(to right,rgba(90,122,106,0.04) 1px,transparent 1px),linear-gradient(to bottom,rgba(90,122,106,0.04) 1px,transparent 1px)",
  backgroundSize: "72px 72px",
};

const HERO_IMAGE = "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1600&h=900&fit=crop&auto=format";

const steps = [
  { n: "01", title: "Start your quote", eyebrow: "Build or upload", body: "Enter product types and dimensions step by step, or upload your window and door schedule for review. No account required.", note: "Plans and supporting files can be added at the start.", Icon: Upload },
  { n: "02", title: "See an indicative estimate", eyebrow: "Early cost guidance", body: "We generate an indicative estimate range from the information supplied, giving you an early view before detailed review.", note: "Indicative only — not a final price or construction budget.", Icon: FileText },
  { n: "03", title: "Technical review", eyebrow: "Checked by our team", body: "We review dimensions, specifications and manufacturing suitability, and contact you if anything needs clarification.", note: "Incomplete details are resolved before final pricing.", Icon: Search },
  { n: "04", title: "Reviewed quote issued", eyebrow: "Price and spec confirmed", body: "You receive a reviewed quote with confirmed pricing, product specifications and the details needed to make a decision.", note: "A clear, verified quote before you commit.", Icon: CheckCircle },
  { n: "05", title: "Approve and pay deposit", eyebrow: "You stay in control", body: "Approve the reviewed quote and pay the required deposit only when you are comfortable with the confirmed scope.", note: "No deposit is requested before the reviewed quote.", Icon: Lock },
  { n: "06", title: "Manufacture and delivery", eyebrow: "Made for your project", body: "Your order moves into manufacturer-backed production, with lead times confirmed and delivery coordinated for your site.", note: "Door-to-door delivery across Melbourne and Victoria.", Icon: Truck },
];

export function HowItWorksPage() {
  return (
    <div className="bg-[#FAFAF9] min-h-screen">
      <section className="relative bg-[#0c0c0a] overflow-hidden">
        <img src={HERO_IMAGE} alt="Dark aluminium window frames in a contemporary residential interior" className="absolute inset-0 w-full h-full object-cover object-center opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c0c0a]/95 via-[#0c0c0a]/80 to-[#0c0c0a]/35" />
        <div className="relative w-full max-w-6xl mx-auto px-6 pt-32 pb-12 md:pt-36 md:pb-14">
          <div className="max-w-2xl">
            <SLabel light>Process</SLabel>
            <h1 className="font-semibold text-white leading-tight tracking-tight mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(2rem, 4vw, 3rem)" }}>How it works</h1>
            <p className="text-white/70 leading-relaxed max-w-xl text-base md:text-lg">From indicative estimate to reviewed quote, manufacture and delivery — the full process in six clear steps.</p>
          </div>
        </div>
      </section>

      <section className="relative bg-white py-20 md:py-28 overflow-hidden border-b border-black/8" style={GRID_BG}>
        <GhostMark size={340} opacity={0.025} pos="right-0 bottom-0" />
        <div className="max-w-6xl mx-auto px-6 relative">
          <div className="grid grid-cols-1 lg:grid-cols-[0.72fr_1fr] gap-8 lg:gap-16 items-end mb-12">
            <div>
              <SLabel>Quote to order</SLabel>
              <h2 className="font-semibold text-[#131311] leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.9rem, 3.4vw, 2.5rem)" }}>Six considered steps.<br />No surprises.</h2>
            </div>
            <p className="text-[#5c5a56] text-base leading-relaxed max-w-xl lg:justify-self-end">Begin with the information you have. We turn it into a technically reviewed, confirmed quote before production begins.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-l border-t border-black/10">
            {steps.map((step) => (
              <article key={step.n} className="group relative bg-white border-r border-b border-black/10 p-6 md:p-7 min-h-[300px] flex flex-col hover:bg-[#FAFAF9] transition-colors">
                <div className="flex items-start justify-between gap-4 mb-8">
                  <span className="text-[#5A7A6A] text-xs font-medium tracking-wider" style={{ fontFamily: "'DM Mono', monospace" }}>{step.n}</span>
                  <span className="w-10 h-10 border border-[#5A7A6A]/35 flex items-center justify-center group-hover:bg-[#5A7A6A] transition-colors"><step.Icon className="w-4 h-4 text-[#5A7A6A] group-hover:text-white transition-colors" aria-hidden="true" /></span>
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5A7A6A] mb-2">{step.eyebrow}</p>
                <h3 className="font-semibold text-[#131311] text-xl leading-tight mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{step.title}</h3>
                <p className="text-[#5c5a56] text-[15px] leading-relaxed mb-6">{step.body}</p>
                <div className="mt-auto pt-4 border-t border-black/8 flex items-start gap-2.5"><WindowMark size={10} color={SAGE} /><p className="text-xs text-[#5c5a56] leading-relaxed -mt-0.5">{step.note}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-[#131311] py-16 md:py-20 overflow-hidden">
        <GhostMark size={280} opacity={0.025} color="#fff" pos="right-0 top-1/2 -translate-y-1/2" />
        <div className="max-w-6xl mx-auto px-6 relative grid grid-cols-1 lg:grid-cols-[0.72fr_1fr] gap-8 lg:gap-16">
          <div><SLabel light>Know before you order</SLabel><h2 className="text-white font-semibold leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.75rem, 3vw, 2.35rem)" }}>Clear scope from day one.</h2></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/10 border border-white/10">
            {[["Supply only", "Installation is arranged by your builder or installer."], ["Reviewed pricing", "Indicative estimates are confirmed through technical review."], ["Confirmed lead times", "Production and delivery timing is set at quote stage."]].map(([title, body]) => (
              <div key={title} className="bg-[#131311] p-5"><Check className="w-4 h-4 text-[#8CA99B] mb-4" aria-hidden="true" /><h3 className="text-white font-semibold text-sm mb-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{title}</h3><p className="text-white/50 text-xs leading-relaxed">{body}</p></div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
