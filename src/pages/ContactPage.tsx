// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT — a switchboard, not a form. An orientation hero, a router band that
// surfaces every intent at a glance (get a price → quote tool; ask a question or
// book a showroom visit → the on-page tablist; plus quick links), and a two-tab
// zone where a question or a showroom-visit request can be finished on the page.
//
// Submits to /api/enquiries (durable OpenFrame reference + server-owned source
// attribution). Showrooms are Sanity-driven (/api/locations) and the map is
// Leaflet/OSM. Layout follows the approved wireframe; tokens are the shared
// design language (ui.tsx).
// ═══════════════════════════════════════════════════════════════════════════════
import { ObfuscatedEmail } from "../components/ObfuscatedEmail";
import { getSiteBrand as getBrandForContact } from "../data/sanity";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText, HelpCircle, MapPin, Phone, Send, Check, ArrowRight, Clock,
  Truck, AlertCircle, CheckCircle,
} from "lucide-react";
import { type Page, SAGE, WindowMark, SLabel, Btn, CtaBanner } from "../app/ui";
import { getPage, imageUrl } from "../data/catalogue";
import { submitEnquiry, getLocations, type ApiLocation, type EnquiryPayload } from "../data/api";
import { LocationMap } from "../components/LocationMap";

const TURNSTILE_SITE_KEY = (import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as string | undefined;

type Intent = "question" | "appointment_request";
type Tab = "ask" | "visit";
type ContactUser = { name: string; email: string; phone: string; company: string; type?: string } | null;

const BEST_TIMES = [["anytime", "Anytime, business hours"], ["morning", "Morning (8am–12pm)"], ["afternoon", "Afternoon (12–5pm)"]];

// Render a Cloudflare Turnstile widget into the active tab's container. Re-runs on
// `dep` (the current tab) so switching panels re-mounts the widget in the newly
// shown container instead of leaving it stranded in the unmounted one. No-op when
// no site key is configured (dev/preview/tests run without a captcha provider).
function useTurnstile(onToken: (t: string) => void, dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current) return;
    let cancelled = false;
    const render = () => {
      const ts = (window as any).turnstile;
      if (cancelled || !ts || !ref.current) return;
      if (widgetId.current != null) { try { ts.remove(widgetId.current); } catch { /* already gone */ } widgetId.current = null; }
      widgetId.current = ts.render(ref.current, { sitekey: TURNSTILE_SITE_KEY, callback: (t: string) => onToken(t), "expired-callback": () => onToken(""), "error-callback": () => onToken("") });
    };
    if ((window as any).turnstile) render();
    else {
      let script = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      if (!script) {
        script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
        script.async = true; script.defer = true; script.setAttribute("data-turnstile", "");
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }
    return () => {
      cancelled = true;
      const ts = (window as any).turnstile;
      if (ts && widgetId.current != null) { try { ts.remove(widgetId.current); } catch { /* noop */ } widgetId.current = null; }
    };
  }, [onToken, dep]);
  return ref;
}

const initialTab = (): Tab => (new URLSearchParams(window.location.search).get("intent") === "appointment" ? "visit" : "ask");

function clientContext(): EnquiryPayload["client_context"] {
  const q = new URLSearchParams(window.location.search);
  const ctx: Record<string, string> = { landing_path: window.location.pathname + window.location.search };
  if (document.referrer) ctx.referrer = document.referrer;
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) { const v = q.get(k); if (v) ctx[k] = v; }
  return ctx;
}

export function ContactPage({ setPage, user }: { setPage: (p: Page) => void; user?: ContactUser }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const brandContact = getBrandForContact(); // phone/email from Sanity Site Settings
  const zoneRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<Tab>(initialTab);
  // Shared contact fields (persist across tabs)
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  // Ask
  const [message, setMessage] = useState("");
  // Visit
  const [locationId, setLocationId] = useState("");
  const [bestTimeToCall, setBestTimeToCall] = useState("anytime");
  // Spam + status
  const [website, setWebsite] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [sentIntent, setSentIntent] = useState<Intent>("question");
  const [reference, setReference] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [locations, setLocations] = useState<ApiLocation[]>([]);

  const turnstileRef = useTurnstile(setToken, tab);
  useEffect(() => { getLocations().then(r => setLocations(r.locations)).catch(() => setLocations([])); }, []);
  useEffect(() => { if (user) { setName(v => v || user.name); setEmail(v => v || user.email); setPhone(v => v || user.phone); } }, [user]);

  const intent: Intent = tab === "visit" ? "appointment_request" : "question";
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const captchaReady = !TURNSTILE_SITE_KEY || !!token;

  const openTab = (t: Tab) => {
    setTab(t); setErrors({}); setFormError(""); setToken(""); // fresh captcha per panel
    const url = new URL(window.location.href);
    url.searchParams.set("intent", t === "visit" ? "appointment" : "question");
    window.history.replaceState({}, "", url);
    requestAnimationFrame(() => zoneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const selectLocation = (id: string) => { setLocationId(id); clearError("location"); };

  const clearError = (k: string) => setErrors(e => (e[k] ? { ...e, [k]: "" } : e));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Enter your name";
    if (intent === "question") {
      if (!validEmail) e.email = "Enter a valid email address";
      if (!message.trim()) e.message = "Enter your message";
    } else {
      if (!phone.trim()) e.phone = "A phone number is required so we can call you";
      if (!locationId) e.location = "Pick a showroom";
      if (email.trim() && !validEmail) e.email = "Enter a valid email address"; // optional but must be valid
    }
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length || !captchaReady || status === "sending") { setFormError(Object.keys(e).length ? "Please fix the highlighted fields." : ""); return; }
    setStatus("sending"); setFormError("");
    const payload: EnquiryPayload = {
      intent, name: name.trim(), email: email.trim(), phone: phone.trim(),
      privacyConsent: true, token, website, client_context: clientContext(),
      ...(intent === "question"
        ? { message: message.trim() }
        : { locationId, bestTimeToCall }),
    };
    try {
      const r = await submitEnquiry(payload);
      setReference(r.reference); setSentIntent(intent); setStatus("sent");
      requestAnimationFrame(() => zoneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setStatus("idle");
      setFormError(String(err).includes("429")
        ? "You've submitted recently — please wait a moment before trying again."
        : "We couldn't submit your enquiry. Check your details and try again.");
    }
  };

  const grouped = useMemo(() => {
    const by: Record<string, ApiLocation[]> = {};
    for (const l of locations) (by[l.stateCode] ??= []).push(l);
    return by;
  }, [locations]);

  const heroImg = imageUrl(getPage("contact")?.heroImage, { w: 1920, h: 460 });

  return (
    <div className="ground-bone min-h-screen">
      {/* ─── HERO — orientation only ───────────────────────────────────────────── */}
      <section className="relative bg-night overflow-hidden">
        {/* Was a 25%-opacity image with NO scrim at all — the only dark hero on
            the site without one, which is why this page's image read as grey
            wash rather than a photograph. */}
        {heroImg && <img src={heroImg} alt="" aria-hidden="true" className="hero-img" />}
        {heroImg && <div className="hero-scrim" aria-hidden="true" />}
        <div className="relative max-w-6xl mx-auto px-6 pt-[78px] pb-10">
          <div className="flex items-center gap-2 mb-4">
            <WindowMark size={12} color="rgba(255,255,255,0.55)" />
            <span className="text-white/55 font-data t-label">Contact</span>
          </div>
          {/* Two lines each, deliberately. At t-ds1 (56px) the old headline ran
              to three, and the sub to three more — six lines of orientation
              before a single option. The dropped half, "pick the closest match
              below and we'll route you straight to it", is said again by the
              router section's own heading and dek immediately underneath. */}
          <h1 className="text-white mb-3.5 max-w-[16ch] text-balance t-ds1">
            Tell us what you need
          </h1>
          <p className="text-white/70 max-w-[46ch] t-bd-lg">
            Pricing, a product question, an existing order, or a showroom visit.
          </p>
        </div>
      </section>

      {/* ─── ROUTER — every intent at a glance ─────────────────────────────────── */}
      <section className="relative ground-bone border-t border-black/8" aria-labelledby="route-h">
        <div className="max-w-6xl mx-auto px-6 pt-11 pb-9">
          <h2 id="route-h" className="text-ink mb-1.5 t-hd2">What do you need?</h2>
          <p className="text-body mb-6 max-w-[60ch] t-bd">Everything lives on this page — pick the one that matches what you came for.</p>

          {/* FOUR routes, not three plus a footnote. Tracking an order was a
              QuickLink in an "Or jump to" strip below, which made it a smaller
              job than the other three; it is not — it is one of the four reasons
              someone lands on a contact page.
              At md the grid is 2×2 rather than four across: four cards in a
              1152px row leaves ~270px each, which is narrower than the copy
              needs and made the lead card stop reading as the lead. */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            <RouterCard lead icon={<FileText className="w-[18px] h-[18px]" />} title="Get a price" tag="Fastest · start here"
              body="Upload a window schedule and every line comes back priced in about a minute. Or enter sizes by hand. No account."
              cta="Open the quote tool" onClick={() => go("quote")} />
            <RouterCard icon={<HelpCircle className="w-[18px] h-[18px]" />} title="Ask a question"
              body="Products, glass, sizing or a quote you already have. A person replies within one business day."
              cta="Message us" down onClick={() => openTab("ask")} />
            <RouterCard icon={<MapPin className="w-[18px] h-[18px]" />} title="Book a showroom visit"
              body="See the frames in person at one of our showrooms. Pick a spot and we'll call to set a time."
              cta="Choose a location" down onClick={() => openTab("visit")} />
            <RouterCard icon={<Truck className="w-[18px] h-[18px]" />} title="Track an order"
              body="Follow an order from deposit to delivery. Your reference is on the quote we issued."
              cta="Track an order" onClick={() => go("track-order")} />
          </div>

          {/* The "Or jump to" strip is gone. Track an order became a card above;
              Trade account and Guides are both in the footer already, so the
              strip was a third copy of the site's navigation.
              The "Talk to us" pill went with it — it advertised (03) 9000 0000
              while the Reach us panel below showed the brand's real number from
              Sanity, so the page published two different phone numbers. The one
              that survives is the one the CMS actually holds. */}
        </div>
      </section>

      <section className="ground-paper border-t border-black/8 section-pad" aria-labelledby="practicals-h">
        <div className="max-w-6xl mx-auto px-6">
          <SLabel>The practicals</SLabel>
          <h2 id="practicals-h" className="text-ink mb-8 t-hd1">
            Where to find us, and what we do.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-black/10">
            <Fact label="Reach us">{brandContact?.phone && <><a href={`tel:${brandContact.phone.replace(/[^0-9+]/g, "")}`} className="border-b border-black/10 hover:text-ink hover:border-sage">{brandContact.phone}</a>{" · "}</>}<ObfuscatedEmail address={brandContact?.email} className="border-b border-black/10 hover:text-ink hover:border-sage" /></Fact>
            <Fact label="Hours"><span className="text-ink font-semibold">Mon–Fri 8am–5pm</span> · Sat by appointment · Sun closed</Fact>
            <Fact label="Good to know"><b className="text-ink font-semibold font-display">Supply only.</b> Your builder or installer fits the frames — we make and deliver them.</Fact>
          </div>
        </div>
      </section>

      {/* ─── DO IT HERE — tablist ──────────────────────────────────────────────── */}
      <section className="ground-bone border-t border-black/8" aria-labelledby="zone-h">
        <div ref={zoneRef} className="max-w-6xl mx-auto px-6 pt-10 pb-5.5" style={{ scrollMarginTop: "16px" }}>
          <div className="mb-[18px]">
            <div className="flex items-center gap-2 mb-2">
              <WindowMark size={12} color={SAGE} />
              <span className="text-sage font-data t-label">Do it here</span>
            </div>
            <h2 id="zone-h" className="text-ink mb-1.5 t-hd2">Two things you can finish on this page</h2>
            <p className="text-body max-w-[64ch] t-bd">Both options are always shown. Pick one — the form for it opens right below.</p>
          </div>

          {/* Tabs */}
          <div role="tablist" aria-label="Choose what to do on this page" className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3 -mb-px">
            <TabButton id="ask" active={tab === "ask"} onSelect={() => openTab("ask")} icon={<HelpCircle className="w-[19px] h-[19px]" />}
              note="Reply within 1 business day" title="Ask a question" sub="Send a message about products or a quote" />
            <TabButton id="visit" active={tab === "visit"} onSelect={() => openTab("visit")} icon={<MapPin className="w-[19px] h-[19px]" />}
              note="By appointment · we call you" title="Book a showroom visit" sub="Choose a showroom location for your visit" />
          </div>

          {/* Active panel */}
          <div role="tabpanel" aria-labelledby={`tab-${tab}`} className="border border-sage bg-white p-6 md:px-6 md:py-7">
            {status === "sent" ? (
              <SuccessCard intent={sentIntent} reference={reference} name={name} onQuote={() => go("quote")} onAgain={() => { setStatus("idle"); setMessage(""); }} />
            ) : tab === "ask" ? (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <div>
                  <p className="text-body flex items-center gap-1.5 mb-4 t-cap"><Clock className="w-3.5 h-3.5 text-sage" />A real person replies within one business day — no account needed.</p>
                  {errors && Object.values(errors).some(Boolean) && <ErrorSummary errors={errors} />}
                  <div className="space-y-3.5">
                    <div className="grid sm:grid-cols-2 gap-3.5">
                      <FieldR id="name" label="Name" req error={errors.name}><input value={name} onChange={e => { setName(e.target.value); clearError("name"); }} placeholder="Your name" autoComplete="name" className={inputCls} /></FieldR>
                      <FieldR id="email" label="Email" req error={errors.email}><input type="email" value={email} onChange={e => { setEmail(e.target.value); clearError("email"); }} placeholder="you@email.com" autoComplete="email" className={inputCls} /></FieldR>
                    </div>
                    <FieldR id="phone" label="Phone" opt><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Best number" autoComplete="tel" className={inputCls} /></FieldR>
                    <FieldR id="message" label="Message" req error={errors.message}>
                      <textarea rows={4} value={message} onChange={e => { setMessage(e.target.value); clearError("message"); }} placeholder="Rough sizes, product types or your quote reference help us reply usefully." className={`${inputCls} resize-y min-h-[104px]`} />
                    </FieldR>
                  </div>
                  {formError && <p role="alert" className="text-red-700 flex items-center gap-1.5 mt-4 t-bd-sm"><AlertCircle className="w-4 h-4" />{formError}</p>}
                  <Honeypot website={website} setWebsite={setWebsite} />
                  {TURNSTILE_SITE_KEY && <div ref={turnstileRef} className="mt-4" />}
                  <div className="flex flex-wrap items-center gap-3.5 mt-[18px]">
                    <Btn variant="sage" size="md" onClick={submit} className={status === "sending" || !captchaReady ? "opacity-60 pointer-events-none" : ""}>{status === "sending" ? "Sending…" : <>Send message <Send className="w-[15px] h-[15px]" /></>}</Btn>
                    <span className="text-quieter max-w-[30ch] t-cap">Used only to reply — see our <button onClick={() => go("privacy")} className="text-sage underline">Privacy Policy</button>. We don't add you to a list.</span>
                  </div>
                </div>
                <aside className="border border-black/10 ground-bone p-[18px]">
                  <h4 className="text-sage mb-3 font-data t-label">Helps us answer fast</h4>
                  <ul className="space-y-2.5">
                    {["Rough width × height for each opening", "Product type — sliding, awning, fixed, door", "Your quote reference, if you have one"].map(t => (
                      <li key={t} className="flex gap-2.5 text-body t-cap"><Check className="w-[15px] h-[15px] text-sage flex-shrink-0 mt-0.5" />{t}</li>
                    ))}
                  </ul>
                  <div className="border-t border-black/10 my-4" />
                  <p className="text-body t-cap">Chasing a price instead? The <button onClick={() => go("quote")} className="text-sage border-b border-sage/40">quote tool</button> is faster. Existing order? <button onClick={() => go("track-order")} className="text-sage border-b border-sage/40">Track it here</button>.</p>
                </aside>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                {/* Picker + map */}
                <div>
                  <p className="text-body mb-[18px] max-w-[52ch] t-cap">Pick the showroom nearest you. A representative calls to confirm a time. We show the suburb here — the exact address comes with your confirmation.</p>
                  <div className="text-ink-soft mb-2.5 font-data t-label">Choose a location<span className="text-sage ml-1">*</span></div>
                  <div className="flex flex-wrap gap-2 mb-1.5">
                    {locations.length === 0 && <span className="text-quiet t-cap">Loading locations…</span>}
                    {locations.map(l => {
                      const sel = locationId === l.id;
                      return (
                        <button key={l.id} type="button" onClick={() => selectLocation(l.id)} aria-pressed={sel}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 border transition-colors cursor-pointer ${sel ? "border-sage bg-sage-wash text-sage-ink font-medium" : "border-black/12 bg-white text-body hover:border-sage/50"} t-cap`}>
                          {sel && <Check className="w-3 h-3 text-sage" />}{l.suburb} <span className={`${sel ? "text-sage" : "text-quietest"} font-data t-data-sm`}>{l.stateCode}</span>
                        </button>
                      );
                    })}
                  </div>
                  {errors.location && <p className="text-red-600 mb-1.5 t-cap">{errors.location}</p>}
                  <div className="my-3.5">
                    <LocationMap locations={locations} selectedId={locationId || null} onSelect={selectLocation} />
                  </div>
                  <p className="text-quiet t-cap">Suburb shown for privacy. Exact address shared on confirmation.</p>
                </div>
                {/* Visit form */}
                <div>
                  {errors && Object.values(errors).some(Boolean) && <ErrorSummary errors={errors} />}
                  <div className="space-y-3.5">
                    <div className="grid sm:grid-cols-2 gap-3.5">
                      <FieldR id="name" label="Name" req error={errors.name}><input value={name} onChange={e => { setName(e.target.value); clearError("name"); }} placeholder="Your name" autoComplete="name" className={inputCls} /></FieldR>
                      <FieldR id="phone" label="Phone" req error={errors.phone}><input value={phone} onChange={e => { setPhone(e.target.value); clearError("phone"); }} placeholder="Best number to call" autoComplete="tel" className={inputCls} /></FieldR>
                    </div>
                    <FieldR id="email" label="Email" opt error={errors.email}><input type="email" value={email} onChange={e => { setEmail(e.target.value); clearError("email"); }} placeholder="you@email.com — for a written confirmation" autoComplete="email" className={inputCls} /></FieldR>
                    <FieldR id="location" label="Location" req error={errors.location}>
                      <select value={locationId} onChange={e => selectLocation(e.target.value)} className={`${inputCls} ${selectCls}`}>
                        <option value="">Pick a showroom above</option>
                        {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([st, locs]) =>
                          locs.map(l => <option key={l.id} value={l.id}>{l.displayName}</option>))}
                      </select>
                    </FieldR>
                    <FieldR id="bestTime" label="Best time to call">
                      <select value={bestTimeToCall} onChange={e => setBestTimeToCall(e.target.value)} className={`${inputCls} ${selectCls}`}>
                        {BEST_TIMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </FieldR>
                  </div>
                  {formError && <p role="alert" className="text-red-700 flex items-center gap-1.5 mt-4 t-bd-sm"><AlertCircle className="w-4 h-4" />{formError}</p>}
                  <Honeypot website={website} setWebsite={setWebsite} />
                  {TURNSTILE_SITE_KEY && <div ref={turnstileRef} className="mt-4" />}
                  <div className="flex flex-wrap items-center gap-3.5 mt-[18px]">
                    <Btn variant="sage" size="md" onClick={submit} className={status === "sending" || !captchaReady ? "opacity-60 pointer-events-none" : ""}>{status === "sending" ? "Sending…" : <>Request a call to book <Phone className="w-[15px] h-[15px]" /></>}</Btn>
                    <span className="text-quieter max-w-[30ch] t-cap">No obligation — we just agree a time. No appointment is confirmed until we call.</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </section>

      {/* ─── THE PRACTICALS ────────────────────────────────────────────────────
          Was a strip tacked onto the bottom of the "Do it here" section, sharing
          its ground and its padding — so the page's three standing facts (how to
          reach us, when we are open, what we do and do not do) read as a
          footnote to a form rather than as their own answer.
          Now a section on the site's standard rhythm. Ground is paper so it
          alternates against the bone above it, and the three facts sit as
          hairline-divided columns rather than a card — they are a reference, not
          an object to press. */}

      {/* ─── CLOSING CTA ─────────────────────────────────────────────────────
          The shared banner. This one had a GhostMark, its own max-width, and
          pt-2/pb-16 — the asymmetry that made the page look bottom-heavy. */}
      {/* ground="paper": the section above it is bone, so the default is right
          again. It had to be forced to bone while the practicals section (paper)
          sat directly above; moving practicals up to second restored the
          alternation, and with it the seam. */}
      <CtaBanner
        ground="paper"
        title="Already know your sizes?"
        sub="Skip the back-and-forth — get an indicative estimate in about a minute. No account required."
        onQuote={() => go("quote")}
      />
    </div>
  );
}

// ─── Building blocks ──────────────────────────────────────────────────────────
const inputCls = "w-full border border-ink/20 bg-white px-3 py-[11px] text-ink placeholder-quieter focus:outline-none focus:border-sage transition-colors t-bd-sm";
const selectCls = "appearance-none pr-8 bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2214%22%20height=%2214%22%20viewBox=%220%200%2024%2024%22%20fill=%22none%22%20stroke=%22%235c5a56%22%20stroke-width=%222%22%3E%3Cpolyline%20points=%226%209%2012%2015%2018%209%22/%3E%3C/svg%3E')] bg-no-repeat bg-[right_12px_center]";

function RouterCard({ icon, title, body, cta, tag, lead, down, onClick }: { icon: React.ReactNode; title: string; body: string; cta: string; tag?: string; lead?: boolean; down?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`group text-left flex flex-col border card-link p-[17px] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage ${lead ? "border-sage bg-paper" : "border-line bg-paper"}`}>
      {tag && <span className="self-start bg-sage text-white px-2 py-[3px] mb-2.5 font-data t-label">{tag}</span>}
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className={`w-9 h-9 grid place-items-center border transition-colors ${lead ? "border-sage text-sage" : "border-sage/40 text-sage group-hover:bg-sage group-hover:border-sage group-hover:text-white"}`}>{icon}</span>
        <h3 className="text-ink font-semibold font-display t-bd">{title}</h3>
      </div>
      <p className="text-body flex-1 t-cap">{body}</p>
      <span className="mt-2.5 inline-flex items-center gap-1.5 font-medium text-sage font-data t-data-sm">{cta} {down ? "↓" : <ArrowRight className="w-3.5 h-3.5" />}</span>
    </button>
  );
}

function TabButton({ id, active, onSelect, icon, note, title, sub }: { id: string; active: boolean; onSelect: () => void; icon: React.ReactNode; note: string; title: string; sub: string }) {
  return (
    <button role="tab" id={`tab-${id}`} aria-selected={active} tabIndex={active ? 0 : -1} onClick={onSelect}
      className={`tab relative flex items-start gap-3 text-left p-4 cursor-pointer ${active ? "sm:border-b-white z-10" : ""}`}>
      <span className={`w-[38px] h-[38px] grid place-items-center border flex-shrink-0 transition-colors ${active ? "bg-sage border-sage text-white" : "border-sage/40 text-sage"}`}>{icon}</span>
      <span className="flex flex-col gap-[3px]">
        <span className={`${active ? "text-sage" : "text-quietest"} font-data t-label`}>{note}</span>
        <span className="text-ink font-semibold font-display t-bd">{title}</span>
        <span className="text-body t-cap">{sub}</span>
      </span>
    </button>
  );
}

function FieldR({ id, label, req, opt, error, children }: { id: string; label: string; req?: boolean; opt?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div id={`field-${id}`}>
      <label className="block text-ink-soft mb-1.5 font-data t-label">
        {label}{req && <span className="text-sage ml-0.5">*</span>}{opt && <span className="text-quieter font-normal tracking-[0.08em] ml-1">(optional)</span>}
      </label>
      {children}
      {error && <p className="text-red-600 mt-1.5 t-cap">{error}</p>}
    </div>
  );
}

function ErrorSummary({ errors }: { errors: Record<string, string> }) {
  const list = Object.entries(errors).filter(([, v]) => v);
  if (!list.length) return null;
  return (
    <div role="alert" className="border border-red-200 bg-red-50 p-3.5 mb-4">
      <p className="font-semibold text-red-800 flex items-center gap-1.5 t-bd-sm"><AlertCircle className="w-4 h-4" />Please fix the following:</p>
      <ul className="mt-1.5 space-y-1 text-red-700 list-disc pl-5 t-bd-sm">
        {list.map(([k, v]) => <li key={k}><a href={`#field-${k}`} className="underline">{v}</a></li>)}
      </ul>
    </div>
  );
}

function Honeypot({ website, setWebsite }: { website: string; setWebsite: (v: string) => void }) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
      <label>Leave this field empty<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
    </div>
  );
}

// A standing fact. The divider now comes from the parent grid (divide-x), so
// this only owns its padding — it was carrying its own border and a last:border-0
// that only worked while it lived inside a bordered card.
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-5 sm:py-0 sm:px-6 first:sm:pl-0 last:sm:pr-0">
      <div className="text-sage mb-2.5 font-data t-label">{label}</div>
      <div className="text-body t-bd-sm">{children}</div>
    </div>
  );
}

function SuccessCard({ intent, reference, name, onQuote, onAgain }: { intent: Intent; reference: string | null; name: string; onQuote: () => void; onAgain: () => void }) {
  const first = name.trim().split(" ")[0] || "there";
  const appt = intent === "appointment_request";
  return (
    <div className="max-w-xl mx-auto text-center py-4" role="status" aria-live="polite">
      <div className="w-12 h-12 border border-sage/30 bg-sage-wash flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-6 h-6" style={{ color: SAGE }} /></div>
      <h3 className="font-semibold text-ink mb-2 font-display t-bd-lg">{appt ? "Appointment request received" : "Message received"}</h3>
      {reference && <p className="inline-block font-mono bg-bone border border-black/10 px-2.5 py-1 mb-4 t-cap">{reference}</p>}
      <p className="text-body max-w-md mx-auto mb-6 t-bd-sm">
        {appt
          ? <>Thanks {first} — your request is logged as <span className="text-ink font-medium">{reference}</span>. A representative will call you to agree a suitable showroom visit time. <span className="text-ink">No appointment is confirmed yet.</span></>
          : <>Thanks {first} — your question is logged as <span className="text-ink font-medium">{reference}</span>. A real person will reply within one business day.</>}
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Btn variant="outline" size="md" onClick={onQuote}>Start a quote <ArrowRight className="w-4 h-4" /></Btn>
        <Btn variant="ghost" size="md" onClick={onAgain}>Send another</Btn>
      </div>
    </div>
  );
}
