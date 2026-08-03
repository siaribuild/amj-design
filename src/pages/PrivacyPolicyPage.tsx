// ═══════════════════════════════════════════════════════════════════════════════
// PRIVACY POLICY — slim dark hero + long-form content column.
//
// Linked only from the footer (Service column). Copy reflects the actual planned
// infrastructure: Cloudflare (Workers/D1/KV/R2) hosting + storage, Resend for
// transactional email, Cloudflare Turnstile on the contact form, Cloudflare Access
// for the staff console, and passwordless email-OTP sign-in (no stored passwords).
// ═══════════════════════════════════════════════════════════════════════════════
import { ObfuscatedEmail } from "../components/ObfuscatedEmail";
import { getSiteBrand } from "../data/sanity";
import { Mail, ArrowRight } from "lucide-react";
import { type Page, SAGE, WindowMark, GhostMark, Btn } from "../app/ui";
import { getPage, imageUrl } from "../data/catalogue";

const UPDATED = "19 July 2026";

// A titled section with an anchor, rendered from the list below.
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg md:text-xl font-semibold text-ink mb-3 font-display">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-body">{children}</div>
    </section>
  );
}

export function PrivacyPolicyPage({ setPage }: { setPage: (p: Page) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const li = "flex gap-2.5 before:content-['—'] before:text-sage before:flex-shrink-0";

  return (
    <div className="ground-bone min-h-screen">
      {/* ─── Slim dark hero ──────────────────────────────────────────────────── */}
      <section className="relative bg-night overflow-hidden pt-28 pb-12">
        {imageUrl(getPage("privacy")?.heroImage, { w: 1920, h: 600 }) && (
          <img src={imageUrl(getPage("privacy")?.heroImage, { w: 1920, h: 600 })} alt="" aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover opacity-40" />
        )}
        <GhostMark size={280} opacity={0.06} color="#fff" pos="right-0 bottom-0" />
        <div className="relative max-w-5xl mx-auto px-6">
          <div className="flex items-center gap-2 mb-3">
            <WindowMark size={11} color="rgba(255,255,255,0.55)" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60 font-data">Legal</span>
          </div>
          <h1 className="text-white mb-3 t-ds1">
            Privacy Policy
          </h1>
          <p className="text-white/70 max-w-xl leading-relaxed t-bd">
            How OpenFrame collects, uses, stores and protects your information when
            you use this website to build quotes, place and track orders, or contact us.
          </p>
          <p className="text-white/45 text-xs mt-4 font-data">Last updated {UPDATED}</p>
        </div>
      </section>

      {/* ─── Content ─────────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 section-pad">
          {/* Policy body */}
          <div className="space-y-10">
            <Section id="who-we-are" title="1. Who we are">
              <p>
                OpenFrame ("we", "us", "our") supplies aluminium windows and doors to trade
                and residential customers Australia-wide, on a supply-only basis. This
                policy explains how we handle personal information collected through this website and
                is intended to be consistent with the Australian Privacy Principles (APPs) under the
                <em> Privacy Act 1988</em> (Cth).
              </p>
            </Section>

            <Section id="what-we-collect" title="2. Information we collect">
              <p>We only collect what we need to prepare quotes, fulfil orders, and respond to you:</p>
              <ul className="space-y-2">
                <li className={li}><span><strong className="text-ink font-medium">Contact details</strong> — your name, email address, phone number, company or trade name, and delivery suburb/postcode.</span></li>
                <li className={li}><span><strong className="text-ink font-medium">Quote and project data</strong> — the products, dimensions, options and quantities you configure, and any plans or window/door schedules you upload for review.</span></li>
                <li className={li}><span><strong className="text-ink font-medium">Order and fulfilment records</strong> — reviewed quotes, order status, and manual bank-transfer payment references.</span></li>
                <li className={li}><span><strong className="text-ink font-medium">Enquiries</strong> — the name, email, phone, company and message you send through our contact form.</span></li>
                <li className={li}><span><strong className="text-ink font-medium">Sign-in and technical data</strong> — one-time sign-in codes (temporary), session identifiers, and limited request metadata such as IP address used for security and rate-limiting.</span></li>
              </ul>
              <p>We do not knowingly collect information from children, and the site is not directed at them.</p>
            </Section>

            <Section id="how-we-use" title="3. How we use your information">
              <p>We use your information to:</p>
              <ul className="space-y-2">
                <li className={li}><span>build, review and issue quotes, and create and track orders through to delivery;</span></li>
                <li className={li}><span>send transactional messages — sign-in codes, quote and order updates, invoices and delivery notices;</span></li>
                <li className={li}><span>respond to contact enquiries and provide after-sales support;</span></li>
                <li className={li}><span>protect the service against spam and abuse (bot detection and rate-limiting); and</span></li>
                <li className={li}><span>meet our legal and record-keeping obligations.</span></li>
              </ul>
              <p>We do not sell your personal information, and we do not use it for third-party advertising.</p>
            </Section>

            <Section id="infrastructure" title="4. Where your data is stored">
              <p>
                The website and its data are hosted on <strong className="text-ink font-medium">Cloudflare</strong>'s
                platform. Application data (accounts, quotes, orders, contact enquiries) is stored in Cloudflare's
                D1 database; temporary sign-in codes and sessions are held in Cloudflare KV with automatic expiry;
                and uploaded files (plans and schedules) are stored as private objects in Cloudflare R2.
              </p>
              <p>
                Cloudflare operates a global network, so data may be processed at edge locations outside Australia.
                Our product catalogue content is managed in <strong className="text-ink font-medium">Sanity</strong>,
                which holds product information only — no customer personal data.
              </p>
            </Section>

            <Section id="third-parties" title="5. Service providers we share data with">
              <p>We share personal information only with the providers that help us run the service, and only as needed:</p>
              <ul className="space-y-2">
                <li className={li}><span><strong className="text-ink font-medium">Cloudflare</strong> — hosting, database, file storage, and the Turnstile bot-protection check on our contact form.</span></li>
                <li className={li}><span><strong className="text-ink font-medium">Resend</strong> — delivery of transactional emails such as sign-in codes and quote/order notifications.</span></li>
              </ul>
              <p>
                We may also disclose information where required by law, or to arrange delivery of your order. As a
                supply-only business, installation is arranged by your own builder or installer — we do not share your
                data with installers on your behalf. We do not otherwise sell or rent your information.
              </p>
            </Section>

            <Section id="cookies" title="6. Cookies and sign-in">
              <p>
                We use <strong className="text-ink font-medium">passwordless sign-in</strong>: you receive a
                one-time code by email, so we never ask for or store a password. We use a small number of strictly
                necessary cookies to make this work:
              </p>
              <ul className="space-y-2">
                <li className={li}><span>a secure, http-only <strong className="text-ink font-medium">session cookie</strong> that keeps you signed in;</span></li>
                <li className={li}><span>an http-only <strong className="text-ink font-medium">quote cookie</strong> that lets you save and continue a quote before you sign in; and</span></li>
                <li className={li}><span>short-lived <strong className="text-ink font-medium">guest tracking tokens</strong> when you look up an order without an account.</span></li>
              </ul>
              <p>We do not use advertising or third-party analytics tracking cookies.</p>
            </Section>

            <Section id="payments" title="7. Payments">
              <p>
                Deposits and balances are paid by manual bank transfer. We do <strong className="text-ink font-medium">not</strong> collect
                or store credit-card or bank-account numbers on this website, and there is no online card processing.
                We record only the payment reference you use so we can reconcile your order.
              </p>
            </Section>

            <Section id="retention" title="8. How long we keep your data">
              <p>
                We keep quote, order and enquiry records for as long as needed to provide the service and to meet our
                legal, tax and warranty obligations. Temporary items — sign-in codes, sessions and guest tracking
                tokens — expire automatically. Staff can delete contact enquiries once they have been actioned.
              </p>
            </Section>

            <Section id="security" title="9. Security">
              <p>We take reasonable steps to protect your information, including:</p>
              <ul className="space-y-2">
                <li className={li}><span>passwordless authentication with expiring, single-use codes and rate-limited requests;</span></li>
                <li className={li}><span>encrypted connections (HTTPS) and secure, http-only session cookies;</span></li>
                <li className={li}><span>access-controlled, private file storage; and</span></li>
                <li className={li}><span>a separate staff console protected by Cloudflare Access with enforced multi-factor sign-in.</span></li>
              </ul>
              <p>No online service can be guaranteed completely secure, but we work to protect your data and to respond promptly to any issue.</p>
            </Section>

            <Section id="your-rights" title="10. Your rights">
              <p>
                You may request access to the personal information we hold about you, ask us to correct it, or ask us
                to delete it where we are not required to keep it. To make a request, or to raise a privacy concern,
                contact us using the details below. We will respond within a reasonable time, consistent with the APPs.
              </p>
            </Section>

            <Section id="changes" title="11. Changes to this policy">
              <p>
                We may update this policy as our service and infrastructure evolve. We will post the revised version
                here and update the "last updated" date above. Significant changes will be highlighted where practical.
              </p>
            </Section>

            <Section id="contact" title="12. Contact us">
              <p>To exercise your rights or ask a question about this policy, get in touch:</p>
              <div className="card p-5 mt-2">
                <p className="flex items-center gap-2.5 text-sm text-ink">
                  <Mail className="w-4 h-4" style={{ color: SAGE }} />
                  <ObfuscatedEmail address={getSiteBrand()?.email} className="hover:underline" />
                </p>
                <p className="text-sm text-body mt-1.5">{[getSiteBrand()?.businessName, "Melbourne, Victoria", "Supply only"].filter(Boolean).join(" · ")}</p>
                <div className="mt-4">
                  <Btn variant="outline" size="sm" onClick={() => go("contact")}>Go to contact page <ArrowRight className="w-4 h-4" /></Btn>
                </div>
              </div>
            </Section>

            <p className="text-xs text-quiet border-t border-black/8 pt-6 italic">
              This policy is a draft prepared for the OpenFrame prototype and should be reviewed by a
              qualified legal professional before the site goes live.
            </p>
          </div>
      </section>
    </div>
  );
}
