// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT — slim dark hero + light content, with a working enquiry form.
//
// The form posts to /api/contact (honeypot + Turnstile + throttling + DB record +
// email on the server). Turnstile only renders when VITE_TURNSTILE_SITE_KEY is set;
// otherwise the form submits without a captcha (dev) and the server skips verify.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { Phone, Mail, MapPin, Send, CheckCircle, AlertCircle, ArrowRight } from "lucide-react";
import { type Page, SAGE, WindowMark, GhostMark, Btn, FieldLabel, Input } from "../app/ui";
import { sendContactMessage } from "../data/api";

const TURNSTILE_SITE_KEY = (import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as string | undefined;

// Render a Cloudflare Turnstile widget when configured, surfacing its token.
// No-op (returns an empty ref) when no site key is set, so dev/tests run without it.
function useTurnstile(onToken: (t: string) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    const render = () => {
      const ts = (window as any).turnstile;
      if (!ts || !ref.current || rendered.current) return;
      rendered.current = true;
      ts.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (t: string) => onToken(t),
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };
    if ((window as any).turnstile) { render(); return; }
    let script = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
    if (!script) {
      script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true; script.defer = true; script.setAttribute("data-turnstile", "");
      document.head.appendChild(script);
    }
    const onLoad = () => { if (!cancelled) render(); };
    script.addEventListener("load", onLoad);
    return () => { cancelled = true; script?.removeEventListener("load", onLoad); };
  }, [onToken]);
  return ref;
}

const INFO: { title: string; sub: string | null; rows: React.ReactNode }[] = [
  {
    title: "Contact us", sub: "Melbourne & Victoria · Supply only",
    rows: (
      <div className="space-y-3 text-sm text-[#5c5a56]">
        <a href="tel:0390000000" className="flex items-center gap-2.5 hover:text-[#131311] transition-colors"><Phone className="w-4 h-4 text-[#5A7A6A] flex-shrink-0" />(03) 9000 0000</a>
        <a href="mailto:quotes@amjtradedirect.com.au" className="flex items-center gap-2.5 hover:text-[#131311] transition-colors"><Mail className="w-4 h-4 text-[#5A7A6A] flex-shrink-0" />quotes@amjtradedirect.com.au</a>
        <div className="flex items-start gap-2.5"><MapPin className="w-4 h-4 text-[#5A7A6A] mt-0.5 flex-shrink-0" /><span>Melbourne &amp; Victoria<br /><span className="text-xs">No trade counter — delivery only</span></span></div>
      </div>
    ),
  },
  {
    title: "Office hours", sub: null,
    rows: (
      <div className="text-sm text-[#5c5a56] space-y-2">
        {[["Mon – Fri", "8am – 5pm"], ["Saturday", "By appointment"], ["Sunday", "Closed"]].map(([d, h]) => (
          <div key={d} className="flex justify-between"><span>{d}</span><span className={d === "Mon – Fri" ? "font-semibold text-[#131311]" : ""}>{h}</span></div>
        ))}
      </div>
    ),
  },
];

export function ContactPage({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const turnstileRef = useTurnstile(setToken);

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const captchaReady = !TURNSTILE_SITE_KEY || !!token;
  const canSend = name.trim() && validEmail && message.trim() && captchaReady && status !== "sending";

  const submit = async () => {
    if (!canSend) return;
    setStatus("sending"); setError("");
    try {
      await sendContactMessage({
        name: name.trim(), email: email.trim(), phone: phone.trim(),
        company: company.trim(), message: message.trim(), token, website,
      });
      setStatus("sent");
    } catch (e) {
      setStatus("idle");
      const is429 = String(e).includes("429");
      setError(is429
        ? "You've sent a message recently — please wait a moment before trying again."
        : "We couldn't send your message. Check your details and try again.");
    }
  };

  return (
    <div className="bg-[#FAFAF9] min-h-screen">
      {/* ─── Slim dark hero ──────────────────────────────────────────────────── */}
      <section className="relative bg-[#0c0c0a] overflow-hidden pt-28 pb-12">
        <GhostMark size={280} opacity={0.06} color="#fff" pos="right-0 bottom-0" />
        <div className="relative max-w-5xl mx-auto px-6">
          <div className="flex items-center gap-2 mb-3">
            <WindowMark size={11} color="rgba(255,255,255,0.55)" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60" style={{ fontFamily: "'DM Mono', monospace" }}>Contact</span>
          </div>
          <h1 className="font-semibold text-white leading-tight tracking-tight mb-3"
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(2rem, 4.5vw, 3rem)" }}>
            Get in touch
          </h1>
          <p className="text-white/70 max-w-lg text-[15px] leading-relaxed">
            Questions about a product, a quote or delivery? Send us a message and our
            Melbourne team will get back to you within one business day.
          </p>
        </div>
      </section>

      {/* ─── Content ─────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Form */}
          <div className="md:col-span-2">
            {status === "sent" ? (
              <div className="bg-white border border-[#5A7A6A]/30 p-8 text-center">
                <div className="w-12 h-12 border border-[#5A7A6A]/30 bg-[#5A7A6A]/8 flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-6 h-6" style={{ color: SAGE }} /></div>
                <h3 className="text-lg font-semibold text-[#131311] mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Message sent</h3>
                <p className="text-sm text-[#5c5a56] max-w-sm mx-auto mb-6">Thanks {name.trim().split(" ")[0] || "for reaching out"} — we've received your enquiry and will reply to <span className="text-[#131311]">{email.trim()}</span> shortly.</p>
                <Btn variant="outline" size="md" onClick={() => go("quote")}>Start a quote <ArrowRight className="w-4 h-4" /></Btn>
              </div>
            ) : (
              <div className="bg-white border border-black/8 p-6">
                <h3 className="font-semibold text-[#131311] mb-5">Send a message</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div><FieldLabel>Name</FieldLabel><Input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" /></div>
                  <div><FieldLabel>Email</FieldLabel><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" /></div>
                  <div><FieldLabel>Phone (optional)</FieldLabel><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(03) 9000 0000" /></div>
                  <div><FieldLabel>Company (optional)</FieldLabel><Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Business or trade name" /></div>
                </div>
                <div className="mb-4">
                  <FieldLabel>Message</FieldLabel>
                  <textarea rows={5} value={message} onChange={e => setMessage(e.target.value)}
                    placeholder="Describe your project or question…"
                    className="w-full border border-[#131311]/20 px-3 py-2.5 text-sm text-[#131311] placeholder-[#9a9894] focus:outline-none focus:border-[#5A7A6A] bg-white resize-none transition-colors" />
                </div>

                {/* Honeypot — hidden from users; bots that fill it are silently dropped. */}
                <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
                  <label>Leave this field empty
                    <input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
                  </label>
                </div>

                {/* Turnstile widget (only when configured). */}
                {TURNSTILE_SITE_KEY && <div ref={turnstileRef} className="mb-4" />}

                {error && <p role="alert" className="text-sm text-red-700 flex items-center gap-1.5 mb-3"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</p>}

                <div className="flex flex-wrap gap-3 items-center">
                  <Btn variant="sage" size="md" onClick={submit} className={!canSend ? "opacity-50 pointer-events-none" : ""}>
                    {status === "sending" ? "Sending…" : <>Send message <Send className="w-4 h-4" /></>}
                  </Btn>
                  <Btn variant="outline" size="md" onClick={() => go("quote")}>Get a quote instead</Btn>
                </div>
                <p className="text-xs text-[#8b8880] mt-4">We only use your details to respond to this enquiry.</p>
              </div>
            )}
          </div>

          {/* Info cards */}
          <div className="space-y-4">
            {INFO.map(w => (
              <div key={w.title} className="border border-black/10 bg-white overflow-hidden">
                <div className="bg-[#131311] px-5 py-3.5 flex items-center gap-2">
                  <WindowMark size={12} color={SAGE} />
                  <div>
                    <h4 className="font-semibold text-white text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{w.title}</h4>
                    {w.sub && <p className="text-white/50 text-xs">{w.sub}</p>}
                  </div>
                </div>
                <div className="p-5">{w.rows}</div>
              </div>
            ))}
            <div className="border border-black/10 bg-[#F2F0EC] p-5">
              <p className="text-sm text-[#5c5a56] leading-relaxed"><span className="font-semibold text-[#131311]">Supply only.</span> We don't provide installation — please work with your builder or installer for products supplied by AMJ Trade Direct.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
