// ═══════════════════════════════════════════════════════════════════════════════
// REVIEW + SUBMIT — the shared final step of the customer quote
//
// Extracted from QuotePage so the /quote-project A/B arm reuses the SAME
// submission lifecycle, contact gating and technical-review promise rather than
// inventing a second one. The brief is explicit: this route changes the
// presentation of the builder, not the workflow.
//
// The success screen is shown ONLY on a server-confirmed submission — never
// optimistically — so a failed or lost request surfaces an error instead of a
// false confirmation.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { ChevronLeft, AlertCircle, CheckCircle, Send } from "lucide-react";
import { SAGE, WindowMark, SLabel, Btn, FieldLabel, Input } from "../app/ui";
import {
  type QuoteState, linePriceTotal, fmt, mm, productLabel, lineBlocksSubmission,
} from "../data/configurator";
import { useGstMode, gstAdjust, gstSuffix } from "../data/gst";
import { quoteSummary } from "../data/quoteSummary";
import { getDeliveryEstimate, type SubmitContact, type SubmitResult } from "../data/api";

type QuoteUser = { name: string; email: string; phone: string; type: string } | null;

/** Confirmation screen after a submission the server accepted. */
export function QuoteSubmitted({ email, user, onGo }: {
  email: string; user: QuoteUser; onGo: (p: "order" | "track-order" | "home") => void;
}) {
  return (
    <div className="quote-page relative min-h-screen ground-bone pt-24 pb-24 overflow-hidden">
      <div className="max-w-md w-full mx-auto px-6 text-center relative">
        <div className="w-14 h-14 border border-sage/30 bg-sage-wash flex items-center justify-center mx-auto mb-6"><WindowMark size={24} color={SAGE} /></div>
        <h2 className="font-semibold text-ink mb-2 font-display t-hd2">Quote submitted</h2>
        <p className="text-body mb-8 mt-2 t-bd-sm">We've received your project and emailed a confirmation to <span className="text-ink">{email || "your email"}</span>. We'll review dimensions, specifications and manufacturing suitability, then issue a reviewed quote with its reference. Expect a response within 1–2 business days.</p>
        <p className="text-body mb-6 t-cap">No payment at this stage. Deposit only after you approve the reviewed quote.</p>
        <div className="flex gap-3 justify-center">
          <Btn variant="sage" size="md" onClick={() => onGo(user ? "order" : "track-order")}>{user ? "View status" : "Track an order"}</Btn>
          <Btn variant="ghost" size="md" onClick={() => onGo("home")}>Back to home</Btn>
        </div>
      </div>
    </div>
  );
}

export function QuoteReviewSubmit({
  quote, user, projectId, backLabel = "Back to MyProject", aiReading, onBack, onSubmit, onSubmitted, onFixBlocked,
}: {
  quote: QuoteState;
  user: QuoteUser;
  /** Null until the draft's first autosave. The delivery estimate preview
   *  (E9) needs it; without one yet, the preview simply does not show —
   *  submission itself is gated on the postcode field, not on this. */
  projectId: string | null;
  backLabel?: string;
  /** Documents are still being read — submitting now would race the estimate. */
  aiReading: boolean;
  onBack: () => void;
  onSubmit?: (contact: SubmitContact) => Promise<SubmitResult>;
  /** Server-confirmed; carries the address the confirmation went to. */
  onSubmitted: (email: string) => void;
  /** Blocking lines exist — send the customer back to fix them. */
  onFixBlocked: () => void;
}) {
  const gstMode = useGstMode();
  const { total, pendingPriceCount, attentionCount } = quoteSummary(quote);
  const [contactName, setContactName] = useState(user?.name || "");
  const [contactEmail, setContactEmail] = useState(user?.email || "");
  const [contactPhone, setContactPhone] = useState(user?.phone || "");
  const [suburb, setSuburb] = useState("");
  const [postcode, setPostcode] = useState("");
  const [postcodeError, setPostcodeError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // The delivery figure at submit (design doc §8.3, Q1 recommendation (a)) —
  // shown once four digits are entered, labelled as an estimate a person will
  // check. Never called while the customer is building (D8); this effect only
  // runs on THIS screen, and only once a project id and a complete postcode
  // both exist.
  const [delivery, setDelivery] = useState<{ amount: number; conservative: boolean } | null>(null);
  useEffect(() => {
    if (!projectId || postcode.length !== 4) { setDelivery(null); return; }
    let cancelled = false;
    getDeliveryEstimate(projectId, postcode)
      .then((r) => { if (!cancelled) setDelivery(r.ok && typeof r.amount === "number" ? { amount: r.amount, conservative: !!r.conservative } : null); })
      .catch(() => { if (!cancelled) setDelivery(null); });
    return () => { cancelled = true; };
  }, [projectId, postcode]);

  const handleSubmit = async () => {
    if (submitting) return;
    if (aiReading) {
      setSubmitError("Please wait while we finish refining this estimate from your documents.");
      return;
    }
    if (attentionCount > 0) { onFixBlocked(); return; }
    if (!contactName.trim() || !contactEmail.trim()) { setSubmitError("Add your name and email to submit."); return; }
    if (!/^\d{4}$/.test(postcode)) { setPostcodeError("Enter your 4-digit delivery postcode."); return; }
    setSubmitting(true); setSubmitError(""); setPostcodeError("");
    try {
      const result = await onSubmit?.({
        name: contactName.trim(), email: contactEmail.trim(), phone: contactPhone.trim(),
        suburb: suburb.trim(), postcode,
      });
      if (!result || result.ok) { onSubmitted(contactEmail); return; } // no handler = design preview
      if (result.error === "missing_postcode" || result.error === "invalid_postcode") {
        setPostcodeError("Enter your 4-digit delivery postcode.");
        return;
      }
      setSubmitError(
        result.error === "rejected"
          ? "We couldn't submit this quote — check that every line is priced and your item codes are unique."
          : result.error === "no_project"
            ? "Add at least one item before submitting."
            : "Something went wrong submitting. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="quote-page min-h-screen ground-bone pt-16">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <button onClick={onBack} className="text-body hover:text-ink mb-5 flex items-center gap-1 cursor-pointer t-bd-sm"><ChevronLeft className="w-4 h-4" />{backLabel}</button>
        <SLabel>Review quote</SLabel>
        <h1 className="font-semibold text-ink mb-2 font-display t-hd1">Review and submit</h1>
        <p className="text-body mb-6 t-bd-sm">No payment at this stage. A reviewed quote is issued after manual technical review.</p>
        <div className="quote-panel p-5 mb-4">
          <SLabel>Your quote</SLabel>
          <div className="space-y-2 mb-3">
            {quote.items.map((it, i) => (
              <div key={it.id} className="flex justify-between gap-3 border-b border-black/6 last:border-0 py-1.5 t-bd-sm">
                <span className="text-ink min-w-0 truncate">{String(i + 1).padStart(2, "0")} · {productLabel(it.productSlug)} — {mm(it.height)} × {mm(it.width)} ×{it.qty}</span>
                <span className="text-body flex-shrink-0 font-data">
                  {it.review?.customerConfigurationChanged && (typeof it.lineTotal !== "number" || !Number.isFinite(it.lineTotal))
                    ? "Pending final price"
                    : lineBlocksSubmission(it) ? "Review" : fmt(gstAdjust(linePriceTotal(it), gstMode))}
                </span>
              </div>
            ))}
            {quote.files.length > 0 && <p className="text-body pt-1 t-cap">+ {quote.files.length} uploaded file{quote.files.length !== 1 ? "s" : ""} for review</p>}
          </div>
          {delivery ? (
            <>
              <div className="flex justify-between border-t border-black/8 pt-3 t-bd-sm"><span className="text-body">{pendingPriceCount ? "Priced-items subtotal" : "Windows and doors"}</span><span className="text-ink font-data">{fmt(gstAdjust(total, gstMode))} {gstSuffix(gstMode)}</span></div>
              <div className="flex justify-between t-bd-sm"><span className="text-body">Delivery to {postcode}</span><span className="text-ink font-data">{fmt(gstAdjust(delivery.amount, gstMode))} {gstSuffix(gstMode)}</span></div>
              <div className="flex justify-between border-t border-black/8 pt-2 t-bd-sm"><span className="font-semibold text-ink">Project total</span><span className="font-semibold text-ink font-data">{fmt(gstAdjust(total + delivery.amount, gstMode))} {gstSuffix(gstMode)}</span></div>
              <p className="text-body t-cap">
                {delivery.conservative
                  ? "That postcode is outside our usual runs, so we've allowed generously. "
                  : "An estimate. "}A person checks the delivery against real freight before your quote is issued.
              </p>
            </>
          ) : (
            <div className="flex justify-between border-t border-black/8 pt-3 t-bd-sm"><span className="text-body">{pendingPriceCount ? "Priced-items subtotal" : "Estimated total"}</span><span className="font-semibold text-ink font-data">{fmt(gstAdjust(total, gstMode))} {gstSuffix(gstMode)}</span></div>
          )}
          {pendingPriceCount > 0 && <p className="mt-2 text-amber-800 t-cap">{pendingPriceCount} customer-changed configuration{pendingPriceCount === 1 ? "" : "s"} will be added after we confirm the exact product and price.</p>}
        </div>
        <div className="quote-panel p-5 space-y-4 mb-4">
          {user && <p className="text-sage flex items-center gap-1.5 t-bd-sm"><CheckCircle className="w-4 h-4" />Pre-filled from your account — edit if needed.</p>}
          <div><FieldLabel htmlFor="contact-name">Full name</FieldLabel><Input id="contact-name" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Your name" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><FieldLabel htmlFor="contact-email">Email</FieldLabel><Input id="contact-email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="your@email.com" /></div>
            <div><FieldLabel htmlFor="contact-phone">Phone</FieldLabel><Input id="contact-phone" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="(03) 9000 0000" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><FieldLabel htmlFor="delivery-suburb">Delivery suburb</FieldLabel><Input id="delivery-suburb" value={suburb} onChange={e => setSuburb(e.target.value)} placeholder="e.g. Preston VIC" /></div>
            <div>
              <FieldLabel htmlFor="delivery-postcode">Delivery postcode</FieldLabel>
              <Input id="delivery-postcode" value={postcode} inputMode="numeric" maxLength={4}
                autoComplete="postal-code"
                aria-invalid={!!postcodeError || undefined}
                aria-describedby={postcodeError ? "postcode-err" : "postcode-help"}
                onChange={e => { setPostcode(e.target.value.replace(/\D/g, "").slice(0, 4)); setPostcodeError(""); }}
                onBlur={() => { if (postcode && postcode.length !== 4) setPostcodeError("Enter your 4-digit delivery postcode."); }}
                placeholder="3072" />
              {postcodeError
                ? <p id="postcode-err" role="alert" className="text-red-700 mt-1 t-cap">{postcodeError}</p>
                : <p id="postcode-help" className="text-body mt-1 t-cap">We price delivery from this.</p>}
            </div>
          </div>
        </div>
        <div className="quote-notice--info border border-line p-4 mb-6 text-body t-cap"><AlertCircle className="w-3 h-3 inline mr-1" />Delivery is priced from your postcode and confirmed on technical review. Estimated totals are confirmed on that same review. No deposit until you approve the reviewed quote. Supply only — tailgate to the kerb, and installation is not included.</div>
        {submitError && <p role="alert" className="text-red-700 flex items-center gap-1.5 mb-3 justify-end t-bd-sm"><AlertCircle className="w-4 h-4" />{submitError}</p>}
        <div className="flex justify-end"><Btn variant="sage" size="lg" disabled={!contactName || !contactEmail || postcode.length !== 4 || submitting || aiReading} onClick={handleSubmit}>{submitting ? "Submitting…" : aiReading ? "Refining estimate…" : <>Submit for technical review <Send className="w-4 h-4" /></>}</Btn></div>
      </div>
    </div>
  );
}
