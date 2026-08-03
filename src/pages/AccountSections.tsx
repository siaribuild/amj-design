// ═══════════════════════════════════════════════════════════════════════════════
// HELP & CONTACT — the demoted Support surface (a help affordance, not a nav
// destination). Reached from the account rail's account/session group. The full
// project list lives on the merged home (AccountDashboard).
// ═══════════════════════════════════════════════════════════════════════════════
import { ObfuscatedEmail } from "../components/ObfuscatedEmail";
import { getSiteBrand } from "../data/sanity";
import { Phone, Mail, MessageSquare, BookOpen } from "lucide-react";
import { type Page, Btn } from "../app/ui";

export function HelpPage({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  return (
    <>
      <header className="mb-[22px]">
        <h1 className="font-semibold text-ink leading-[1.05]" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.7rem,3.6vw,2.15rem)" }}>Help &amp; contact</h1>
        <p className="text-sm text-body mt-[5px]">A person, not a ticket queue — reach the team working on your project.</p>
      </header>
      <div className="grid sm:grid-cols-2 gap-4 max-w-3xl">
        <div className="card p-5">
          <h3 className="text-[13px] uppercase tracking-[0.1em] text-body font-medium mb-3.5 font-data">Talk to us</h3>
          <a href="tel:0390000000" className="flex items-center gap-2.5 text-sm text-ink hover:text-sage mb-2"><Phone className="w-4 h-4 text-sage" />(03) 9000 0000</a>
          <span className="flex items-center gap-2.5 text-sm text-ink"><Mail className="w-4 h-4 text-sage" /><ObfuscatedEmail address={getSiteBrand()?.email} className="hover:text-sage" /></span>
          <p className="text-xs text-body mt-3 pt-3 border-t border-black/[0.07]">Mon–Fri 8am–5pm · Sat by appointment</p>
        </div>
        <div className="card p-5">
          <h3 className="text-[13px] uppercase tracking-[0.1em] text-body font-medium mb-3.5 font-data">Send a message</h3>
          <p className="text-[13px] text-body leading-relaxed mb-4">Product, sizing or pricing questions — a real person replies within one business day. Include your project reference (OF-…) so we open the right record.</p>
          <Btn variant="sage" size="sm" onClick={() => go("contact")}><MessageSquare className="w-4 h-4" />Message us</Btn>
        </div>
        <div className="card p-5 sm:col-span-2">
          <h3 className="text-[13px] uppercase tracking-[0.1em] text-body font-medium mb-3.5 font-data">Guides</h3>
          <div className="flex flex-wrap gap-2.5">
            <Btn variant="outline" size="sm" onClick={() => go("how-it-works")}><BookOpen className="w-4 h-4" />How the quote-to-order process works</Btn>
            <Btn variant="outline" size="sm" onClick={() => go("resources")}><BookOpen className="w-4 h-4" />Measuring & product guides</Btn>
          </div>
          <p className="text-xs text-body mt-4">Order updates (quotes issued, invoices, sign-off requests) always arrive by email — they're not optional notifications you can miss.</p>
        </div>
      </div>
    </>
  );
}
