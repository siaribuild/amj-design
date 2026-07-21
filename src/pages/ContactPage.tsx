// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT — a lead-routing surface, not a generic message form.
//
// Two jobs (progressive disclosure): ask a question, or request a showroom
// appointment. Common details are shared; branch fields appear only for the chosen
// intent. Submits to /api/enquiries, which issues a durable OpenFrame reference and
// owns the source attribution. Showrooms come from one registry (/api/locations)
// driving both the list and the Leaflet map below the form.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Phone, Mail, Send, CheckCircle, AlertCircle, ArrowRight, HelpCircle, CalendarClock, MapPin, Check,
} from "lucide-react";
import { type Page, SAGE, WindowMark, GhostMark, Btn, FieldLabel, Input } from "../app/ui";
import { getPage, imageUrl } from "../data/catalogue";
import { submitEnquiry, getLocations, type ApiLocation, type EnquiryPayload } from "../data/api";
import { LocationMap } from "../components/LocationMap";

const TURNSTILE_SITE_KEY = (import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as string | undefined;

type Intent = "question" | "appointment_request";
type ContactUser = { name: string; email: string; phone: string; company: string; type?: string } | null;

const TOPICS = ["Products & specifications", "Pricing & quotes", "Measurements & sizing", "An existing quote or order", "Delivery", "Something else"];
const CUSTOMER_TYPES = ["Homeowner", "Builder or trade", "Owner-builder", "Architect or designer", "Other"];
const PRODUCTS_INTEREST = [["windows", "Windows"], ["doors", "Doors"], ["both", "Both"], ["not_sure", "Not sure"]];
const BEST_TIMES = [["morning", "Morning"], ["afternoon", "Afternoon"], ["evening", "Evening"]];
const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"]];
const STATE_NAMES: Record<string, string> = { VIC: "Victoria", NSW: "New South Wales", WA: "Western Australia", QLD: "Queensland", SA: "South Australia", TAS: "Tasmania", NT: "Northern Territory", ACT: "Australian Capital Territory" };

// Render a Cloudflare Turnstile widget when configured (no-op in dev/tests).
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
      ts.render(ref.current, { sitekey: TURNSTILE_SITE_KEY, callback: (t: string) => onToken(t), "expired-callback": () => onToken(""), "error-callback": () => onToken("") });
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

const initialIntent = (): Intent =>
  (new URLSearchParams(window.location.search).get("intent") === "appointment" ? "appointment_request" : "question");

// The client analytics/attribution context. The SERVER owns source_owner — this is
// only landing/referrer/UTM signal.
function clientContext(): EnquiryPayload["client_context"] {
  const q = new URLSearchParams(window.location.search);
  const ctx: Record<string, string> = { landing_path: window.location.pathname + window.location.search };
  if (document.referrer) ctx.referrer = document.referrer;
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    const v = q.get(k); if (v) ctx[k] = v;
  }
  return ctx;
}

export function ContactPage({ setPage, user }: { setPage: (p: Page) => void; user?: ContactUser }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };

  const [intent, setIntent] = useState<Intent>(initialIntent);
  // Common
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [company, setCompany] = useState(user?.company ?? "");
  const [customerType, setCustomerType] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  // Question
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  // Appointment
  const [locationId, setLocationId] = useState("");
  const [productsInterest, setProductsInterest] = useState("");
  const [bestTimeToCall, setBestTimeToCall] = useState("");
  const [preferredDays, setPreferredDays] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  // Spam + status
  const [website, setWebsite] = useState(""); // honeypot
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [reference, setReference] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [locations, setLocations] = useState<ApiLocation[]>([]);

  const turnstileRef = useTurnstile(setToken);

  useEffect(() => { getLocations().then(r => setLocations(r.locations)).catch(() => setLocations([])); }, []);
  // Keep prefill in step with sign-in state.
  useEffect(() => { if (user) { setName(v => v || user.name); setEmail(v => v || user.email); setPhone(v => v || user.phone); setCompany(v => v || user.company); } }, [user]);

  // Deep-linkable intent.
  const chooseIntent = (i: Intent) => {
    setIntent(i);
    const url = new URL(window.location.href);
    url.searchParams.set("intent", i === "appointment_request" ? "appointment" : "question");
    window.history.replaceState({}, "", url);
  };

  // Selecting a showroom (from the list or the map) sets the field AND implies an
  // appointment. Switching intent never clears data — branch fields just hide.
  const selectLocation = (id: string) => { setLocationId(id); if (intent !== "appointment_request") chooseIntent("appointment_request"); };

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const captchaReady = !TURNSTILE_SITE_KEY || !!token;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Enter your name";
    if (!validEmail) e.email = "Enter a valid email address";
    if (!privacyConsent) e.consent = "Please acknowledge the privacy policy";
    if (intent === "question") {
      if (!message.trim()) e.message = "Enter your question";
    } else {
      if (!locationId) e.location = "Choose a showroom below";
      if (!phone.trim()) e.phone = "A phone number is required so we can call you";
      if (!bestTimeToCall) e.bestTimeToCall = "Choose the best time to call";
    }
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length || !captchaReady || status === "sending") { setFormError(Object.keys(e).length ? "Please fix the highlighted fields." : ""); return; }
    setStatus("sending"); setFormError("");
    const payload: EnquiryPayload = {
      intent, name: name.trim(), email: email.trim(), phone: phone.trim(), company: company.trim(),
      customerType: customerType || undefined, privacyConsent, marketingOptIn,
      token, website, client_context: clientContext(),
      ...(intent === "question"
        ? { topic: topic || undefined, message: message.trim() }
        : { locationId, bestTimeToCall, preferredDays, productsInterest: productsInterest || undefined, notes: notes.trim() || undefined }),
    };
    try {
      const r = await submitEnquiry(payload);
      setReference(r.reference); setStatus("sent"); window.scrollTo(0, 0);
    } catch (err) {
      setStatus("idle");
      setFormError(String(err).includes("429")
        ? "You've submitted recently — please wait a moment before trying again."
        : "We couldn't submit your enquiry. Check your details and try again.");
    }
  };

  const toggleDay = (d: string) => setPreferredDays(days => days.includes(d) ? days.filter(x => x !== d) : [...days, d]);
  const clearError = (k: string) => setErrors(e => (e[k] ? { ...e, [k]: "" } : e));

  const grouped = useMemo(() => {
    const by: Record<string, ApiLocation[]> = {};
    for (const l of locations) (by[l.stateCode] ??= []).push(l);
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
  }, [locations]);
  const errorList = Object.entries(errors).filter(([, v]) => v);

  const heroImg = imageUrl(getPage("contact")?.heroImage, { w: 1920, h: 500 });

  return (
    <div className="bg-[#FAFAF9] min-h-screen">
      {/* ─── Compact hero ────────────────────────────────────────────────────── */}
      <section className="relative bg-[#0c0c0a] overflow-hidden pt-28 pb-10">
        {heroImg && <img src={heroImg} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-30" />}
        <GhostMark size={260} opacity={0.06} color="#fff" pos="right-0 bottom-0" />
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-2 mb-3">
            <WindowMark size={11} color="rgba(255,255,255,0.55)" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60" style={{ fontFamily: "'DM Mono', monospace" }}>Contact</span>
          </div>
          <h1 className="font-semibold text-white leading-tight tracking-tight mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.9rem, 4vw, 2.8rem)" }}>Contact OpenFrame</h1>
          <p className="text-white/70 max-w-2xl text-[15px] leading-relaxed">
            Ask a product or ordering question, or request a visit to an AMJ showroom. For appointment
            requests, a representative will call you to agree on a suitable time.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-10 md:py-14">
        {status === "sent" ? (
          <SuccessCard intent={intent} reference={reference} name={name} onQuote={() => go("quote")} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Intent fork */}
              <div>
                <h2 className="text-sm font-semibold text-[#131311] mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>What can we help with?</h2>
                <div role="radiogroup" aria-label="What can we help with?" className="grid sm:grid-cols-2 gap-3">
                  <IntentCard active={intent === "question"} onSelect={() => chooseIntent("question")}
                    icon={<HelpCircle className="w-5 h-5" />} title="Ask a question"
                    body="Get help with products, pricing, measurements, projects or an existing quote/order." />
                  <IntentCard active={intent === "appointment_request"} onSelect={() => chooseIntent("appointment_request")}
                    icon={<CalendarClock className="w-5 h-5" />} title="Request a showroom appointment"
                    body="Choose a location and tell us when you're easiest to reach. A representative will call to confirm a visit time." />
                </div>
              </div>

              {/* Error summary */}
              {errorList.length > 0 && (
                <div role="alert" className="border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-800 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />Please fix the following:</p>
                  <ul className="mt-2 space-y-1 text-sm text-red-700 list-disc pl-5">
                    {errorList.map(([k, v]) => <li key={k}><a href={`#field-${k}`} className="underline">{v}</a></li>)}
                  </ul>
                </div>
              )}

              {/* Common details */}
              <div className="bg-white border border-black/8 p-6">
                <h3 className="font-semibold text-sm text-[#131311] mb-4">Your details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field id="name" label="Full name" error={errors.name}><Input value={name} onChange={e => { setName(e.target.value); clearError("name"); }} placeholder="Your name" /></Field>
                  <Field id="email" label="Email address" error={errors.email}><Input type="email" value={email} onChange={e => { setEmail(e.target.value); clearError("email"); }} placeholder="you@email.com" /></Field>
                  <Field id="phone" label={intent === "appointment_request" ? "Phone number" : "Phone number (optional)"} error={errors.phone}><Input value={phone} onChange={e => { setPhone(e.target.value); clearError("phone"); }} placeholder="(03) 9000 0000" /></Field>
                  <Field id="customerType" label="I'm enquiring as (optional)">
                    <Select value={customerType} onChange={e => setCustomerType(e.target.value)}>
                      <option value="">Select…</option>
                      {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </Field>
                  <Field id="company" label="Company / trade name (optional)"><Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Business or trade name" /></Field>
                </div>
              </div>

              {/* Branch fields — progressive disclosure */}
              {intent === "question" ? (
                <div className="bg-white border border-black/8 p-6" aria-live="polite">
                  <h3 className="font-semibold text-sm text-[#131311] mb-4">Your question</h3>
                  <div className="space-y-4">
                    <Field id="topic" label="What is your question about? (optional)">
                      <Select value={topic} onChange={e => setTopic(e.target.value)}>
                        <option value="">Select a topic…</option>
                        {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                      </Select>
                    </Field>
                    <Field id="message" label="Message" error={errors.message}>
                      <textarea id="field-message" rows={5} value={message} onChange={e => { setMessage(e.target.value); clearError("message"); }} placeholder="Describe your project or question…"
                        className="w-full border border-[#131311]/20 px-3 py-2.5 text-sm text-[#131311] placeholder-[#9a9894] focus:outline-none focus:border-[#5A7A6A] bg-white resize-none transition-colors" />
                    </Field>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-black/8 p-6" aria-live="polite">
                  <h3 className="font-semibold text-sm text-[#131311] mb-1">Your appointment request</h3>
                  <p className="text-xs text-[#8b8880] mb-4">No visit time is booked here — a representative will call to arrange a suitable time.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field id="location" label="Preferred showroom" error={errors.location}>
                      <Select value={locationId} onChange={e => { setLocationId(e.target.value); clearError("location"); }}>
                        <option value="">Select a location…</option>
                        {grouped.map(([st, locs]) => (
                          <optgroup key={st} label={STATE_NAMES[st] ?? st}>
                            {locs.map(l => <option key={l.id} value={l.id}>{l.displayName}</option>)}
                          </optgroup>
                        ))}
                      </Select>
                    </Field>
                    <Field id="productsInterest" label="Products of interest (optional)">
                      <Select value={productsInterest} onChange={e => setProductsInterest(e.target.value)}>
                        <option value="">Select…</option>
                        {PRODUCTS_INTEREST.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <div className="mt-4">
                    <FieldLabel>Best time to call</FieldLabel>
                    <div id="field-bestTimeToCall" className="flex flex-wrap gap-2 mt-1">
                      {BEST_TIMES.map(([v, l]) => (
                        <button key={v} type="button" onClick={() => { setBestTimeToCall(v); clearError("bestTimeToCall"); }}
                          aria-pressed={bestTimeToCall === v}
                          className={`px-4 py-2 text-sm border transition-colors cursor-pointer ${bestTimeToCall === v ? "border-[#5A7A6A] bg-[#5A7A6A]/10 text-[#355344] font-medium" : "border-black/15 text-[#5c5a56] hover:border-[#5A7A6A]/50"}`}>{l}</button>
                      ))}
                    </div>
                    {errors.bestTimeToCall && <p className="text-xs text-red-600 mt-1.5">{errors.bestTimeToCall}</p>}
                  </div>
                  <div className="mt-4">
                    <FieldLabel>Preferred days (optional)</FieldLabel>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {DAYS.map(([v, l]) => (
                        <button key={v} type="button" onClick={() => toggleDay(v)} aria-pressed={preferredDays.includes(v)}
                          className={`px-3.5 py-2 text-sm border transition-colors cursor-pointer ${preferredDays.includes(v) ? "border-[#5A7A6A] bg-[#5A7A6A]/10 text-[#355344] font-medium" : "border-black/15 text-[#5c5a56] hover:border-[#5A7A6A]/50"}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4">
                    <FieldLabel>Anything the representative should know? (optional)</FieldLabel>
                    <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Project context, accessibility needs, products to see…"
                      className="w-full border border-[#131311]/20 px-3 py-2.5 text-sm text-[#131311] placeholder-[#9a9894] focus:outline-none focus:border-[#5A7A6A] bg-white resize-none transition-colors" />
                  </div>
                </div>
              )}

              {/* Consent + submit */}
              <div className="bg-white border border-black/8 p-6">
                <label className="flex items-start gap-2.5 text-sm text-[#5c5a56] cursor-pointer">
                  <input type="checkbox" checked={privacyConsent} onChange={e => { setPrivacyConsent(e.target.checked); clearError("consent"); }} className="mt-0.5 w-4 h-4 accent-[#5A7A6A]" id="field-consent" />
                  <span>I acknowledge the <button type="button" onClick={() => go("privacy")} className="text-[#5A7A6A] underline">Privacy Policy</button> and consent to OpenFrame using these details to respond to my enquiry. <span className="text-red-600">*</span></span>
                </label>
                {errors.consent && <p className="text-xs text-red-600 mt-1.5 pl-6">{errors.consent}</p>}
                <label className="flex items-start gap-2.5 text-sm text-[#5c5a56] cursor-pointer mt-3">
                  <input type="checkbox" checked={marketingOptIn} onChange={e => setMarketingOptIn(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#5A7A6A]" />
                  <span>Keep me updated with occasional OpenFrame product news (optional).</span>
                </label>

                {/* Honeypot */}
                <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
                  <label>Leave this field empty<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
                </div>
                {TURNSTILE_SITE_KEY && <div ref={turnstileRef} className="mt-4" />}

                {formError && <p role="alert" className="text-sm text-red-700 flex items-center gap-1.5 mt-4"><AlertCircle className="w-4 h-4 flex-shrink-0" />{formError}</p>}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Btn variant="sage" size="md" onClick={submit} className={status === "sending" || !captchaReady ? "opacity-60 pointer-events-none" : ""}>
                    {status === "sending" ? "Submitting…" : intent === "question" ? <>Send question <Send className="w-4 h-4" /></> : <>Request appointment <ArrowRight className="w-4 h-4" /></>}
                  </Btn>
                  <span className="text-xs text-[#8b8880]">We only use your details to respond to this enquiry.</span>
                </div>
              </div>
            </div>

            {/* Prefer to talk */}
            <aside className="space-y-4">
              <div className="border border-black/10 bg-white overflow-hidden">
                <div className="bg-[#131311] px-5 py-3.5 flex items-center gap-2">
                  <WindowMark size={12} color={SAGE} />
                  <h4 className="font-semibold text-white text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Prefer to talk?</h4>
                </div>
                <div className="p-5 space-y-3 text-sm text-[#5c5a56]">
                  <a href="tel:0390000000" className="flex items-center gap-2.5 hover:text-[#131311]"><Phone className="w-4 h-4 text-[#5A7A6A]" />(03) 9000 0000</a>
                  <a href="mailto:quotes@openframe.com.au" className="flex items-center gap-2.5 hover:text-[#131311]"><Mail className="w-4 h-4 text-[#5A7A6A]" />quotes@openframe.com.au</a>
                  <p className="text-xs pt-1 border-t border-black/6">Mon–Fri 8am–5pm. Showroom visits are in-person and by appointment.</p>
                </div>
              </div>
              <div className="border border-black/10 bg-[#F2F0EC] p-5">
                <p className="text-sm text-[#5c5a56] leading-relaxed"><span className="font-semibold text-[#131311]">Supply only.</span> We don't provide installation — please work with your builder or installer for products supplied by OpenFrame.</p>
              </div>
            </aside>
          </div>
        )}
      </section>

      {/* ─── Locations (below the form) ──────────────────────────────────────── */}
      {status !== "sent" && (
        <section className="border-t border-black/8 bg-white/60">
          <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
            <div className="flex items-center gap-2 mb-1"><MapPin className="w-4 h-4 text-[#5A7A6A]" /><span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5A7A6A]" style={{ fontFamily: "'DM Mono', monospace" }}>Our locations</span></div>
            <h2 className="text-2xl font-semibold text-[#131311] mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Showrooms across Australia</h2>
            <p className="text-sm text-[#5c5a56] max-w-xl mb-6">Meet our team at one of our AMJ showrooms. Visits are in-person and by appointment — pick a location to add it to your request.</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* State-grouped list (primary, accessible) */}
              <div className="space-y-4">
                {grouped.length === 0 && <p className="text-sm text-[#8b8880]">Loading locations…</p>}
                {grouped.map(([st, locs]) => (
                  <div key={st}>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#8b8880] mb-1.5">{STATE_NAMES[st] ?? st}</p>
                    <div className="flex flex-wrap gap-2">
                      {locs.map(l => {
                        const active = locationId === l.id;
                        return (
                          <button key={l.id} type="button" onClick={() => selectLocation(l.id)} aria-pressed={active}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border transition-colors cursor-pointer ${active ? "border-[#5A7A6A] bg-[#5A7A6A]/10 text-[#355344] font-medium" : "border-black/12 text-[#5c5a56] hover:border-[#5A7A6A]/50"}`}>
                            {active && <Check className="w-3.5 h-3.5 text-[#5A7A6A]" />}{l.suburb}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-[#8b8880] pt-2">More locations opening across Australia. Suburb shown — exact address is shared when your visit is confirmed.</p>
              </div>
              {/* Map (enhancement) */}
              <LocationMap locations={locations} selectedId={locationId || null} onSelect={selectLocation} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Small building blocks ────────────────────────────────────────────────────
function IntentCard({ active, onSelect, icon, title, body }: { active: boolean; onSelect: () => void; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div role="radio" aria-checked={active} tabIndex={0} onClick={onSelect}
      onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onSelect(); } }}
      className={`text-left p-5 border cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A] ${active ? "border-[#5A7A6A] bg-[#5A7A6A]/8" : "border-black/12 bg-white hover:border-[#5A7A6A]/50"}`}>
      <div className="flex items-center gap-2.5 mb-2">
        <span className={`w-9 h-9 grid place-items-center border ${active ? "border-[#5A7A6A] text-[#5A7A6A]" : "border-black/15 text-[#5c5a56]"}`}>{icon}</span>
        <span className="flex items-center gap-2 font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          <span className={`w-3.5 h-3.5 rounded-full border grid place-items-center ${active ? "border-[#5A7A6A]" : "border-black/25"}`}>{active && <span className="w-2 h-2 rounded-full bg-[#5A7A6A]" />}</span>
          {title}
        </span>
      </div>
      <p className="text-xs text-[#5c5a56] leading-relaxed">{body}</p>
    </div>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div id={`field-${id}`}>
      <FieldLabel>{label}</FieldLabel>
      {children}
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
}

function Select({ value, onChange, children }: { value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={onChange}
      className="w-full border border-[#131311]/20 bg-white px-3 py-2.5 text-sm text-[#131311] focus:outline-none focus:border-[#5A7A6A] transition-colors">
      {children}
    </select>
  );
}

function SuccessCard({ intent, reference, name, onQuote }: { intent: Intent; reference: string | null; name: string; onQuote: () => void }) {
  const first = name.trim().split(" ")[0] || "there";
  return (
    <div className="max-w-xl mx-auto bg-white border border-[#5A7A6A]/30 p-8 text-center" role="status" aria-live="polite">
      <div className="w-12 h-12 border border-[#5A7A6A]/30 bg-[#5A7A6A]/8 flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-6 h-6" style={{ color: SAGE }} /></div>
      <h2 className="text-lg font-semibold text-[#131311] mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        {intent === "appointment_request" ? "Appointment request received" : "Question received"}
      </h2>
      {reference && <p className="inline-block text-xs font-mono bg-[#F2F0EC] border border-black/10 px-2.5 py-1 mb-4">{reference}</p>}
      <p className="text-sm text-[#5c5a56] max-w-md mx-auto mb-6 leading-relaxed">
        {intent === "appointment_request"
          ? <>Thanks {first} — your appointment request has been logged as <span className="text-[#131311] font-medium">{reference}</span>. A representative will call you to agree on a suitable showroom visit time. <span className="text-[#131311]">No appointment is confirmed yet.</span></>
          : <>Thanks {first} — your question has been logged as <span className="text-[#131311] font-medium">{reference}</span>. We've emailed you a copy and will respond using the contact details provided.</>}
      </p>
      <Btn variant="outline" size="md" onClick={onQuote}>Start a quote <ArrowRight className="w-4 h-4" /></Btn>
    </div>
  );
}
