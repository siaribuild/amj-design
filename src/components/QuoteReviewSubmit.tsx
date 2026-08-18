// ═══════════════════════════════════════════════════════════════════════════════
// REVIEW + SUBMIT — the shared final step of the customer quote, and THE GATE.
//
// Anonymity ends here and nowhere else. Browsing, configuring, live pricing,
// autosave and uploads are all anonymous and unchanged; submitting a project for
// review requires a signed-in account with a name the person typed, an AU-valid
// phone, a full address and an OTP-verified email.
//
// ONE SCREEN, FOUR STAGES. The quote panel never leaves — at every stage the
// customer is looking at the thing they are about to submit:
//
//   0  pre-gate        anonymous, gate not yet opened — postcode + the friction
//                      pre-announcement, so the screen does not open with an
//                      email field in a stranger's face
//   1  sign in/create  the inline OTP flow
//   2  re-resolving    a claim-merge may have replaced the project id; the
//                      details panel and Submit are NOT RENDERED until it lands
//   3  your details    name, phone, address, delivery — one pass, every field a
//                      live input
//
// ⚠️ THERE IS NO NAME STAGE. A fresh account reaches stage 3 with an empty,
// required Full name field; a returning account reaches the same stage with it
// filled. Same panel, different starting values (design §16, MG-1). Asking for
// the name on its own screen and then again in the details form is one question
// asked twice, and the owner removed it.
//
// ⚠️ DELIVERY IS NEVER SEEDED FROM THE ACCOUNT ADDRESS (MG-2). The primary actor
// is a tradie whose delivery destination is their customer's site — different
// nearly every time. A prefill that is wrong nearly every time is worse than
// blank twice over: it is wrong AND it stops the field being read. Precedence is
// the project's stored delivery, else the postcode typed at stage 0, else empty,
// and the two delivery fields carry no autoComplete so browser address autofill
// cannot reintroduce the account address by the back door.
//
// The success screen is shown ONLY on a server-confirmed submission — never
// optimistically — so a failed or lost request surfaces an error instead of a
// false confirmation.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, AlertCircle, CheckCircle, Loader2, Send } from "lucide-react";
import { SAGE, WindowMark, SLabel, Btn, FieldLabel, Input } from "../app/ui";
import {
  type QuoteState, linePriceTotal, fmt, mm, productLabel, lineBlocksSubmission,
} from "../data/configurator";
import { useGstMode, gstAdjust, gstSuffix } from "../data/gst";
import { quoteSummary } from "../data/quoteSummary";
import {
  getDeliveryEstimate, updateProfile, ApiError,
  type AuthUserDto, type SubmitDelivery, type SubmitResult,
} from "../data/api";
import { AU_STATES, DETAIL_LIMITS, submitMissing, type DetailField } from "../data/accountDetails";
import { OtpSignIn, OTP_COPY } from "./OtpSignIn";

export type QuoteUser = {
  name: string;            // RAW stored value ("" when NULL) — never the fallback
  displayName: string;     // display-only derivation, never written back
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  addressSuburb: string;
  addressState: string;
  addressPostcode: string;
  priceGstMode: "inc" | "ex";
  type: string;
} | null;

/** DetailField → prose, one mapping, used by every message on this screen. */
const FIELD_PROSE: Record<DetailField, string> = {
  name: "your full name",
  phone: "your phone number",
  addressLine1: "your street address",
  addressLine2: "your unit or level",
  addressSuburb: "your suburb",
  addressState: "your state",
  addressPostcode: "your postcode",
};
/** The same fields as the "Still needed:" caption says them — form order,
 *  lowercase, the label rather than the sentence. */
const FIELD_LABEL: Record<DetailField, string> = {
  name: "full name",
  phone: "phone",
  addressLine1: "street address",
  addressLine2: "unit or level",
  addressSuburb: "suburb",
  addressState: "state",
  addressPostcode: "postcode",
};
const FIELD_ERROR: Record<DetailField, string> = {
  name: "Enter your full name.",
  phone: "Enter a phone number we can reach you on.",
  addressLine1: "Enter your street address.",
  addressLine2: "",
  addressSuburb: "Enter your suburb.",
  addressState: "Choose your state.",
  addressPostcode: "Enter a 4-digit postcode.",
};
const PHONE_INVALID =
  "That doesn't look like an Australian number. Try a mobile (0412 345 678), a landline (03 9000 0000) or a service number (1300 123 456).";

/** "your phone number, street address and suburb" — a list a person reads. */
function prose(fields: DetailField[], map: Record<DetailField, string>): string {
  const parts = fields.map((f) => map[f]);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** A field message carries a MARK as well as a colour — the product's own rule
 *  (StatusPill: icon + word, never colour alone), applied to inline field errors.
 *  The colour is `--attention-ink` on paper, the pairing §16.9 names; Tailwind's
 *  `red-700` is a different red that belongs to no token on this site. */
function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} role="alert" className="text-attention-ink flex items-start gap-1.5 mt-1 t-cap">
      <AlertCircle className="w-3 h-3 flex-shrink-0 mt-[3px]" aria-hidden="true" />{children}
    </p>
  );
}

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
  quote, user, projectId, backLabel = "Back to MyProject", aiReading, projectResolving = false,
  storedDelivery, onBack, onSubmit, onSubmitted, onFixBlocked, onAuthed,
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
  /** A sign-in just happened and the current project is being re-resolved. The
   *  claim-merge may have DELETED the id this screen was holding, so nothing may
   *  be rendered — or requested — against it until the answer lands (AC-26/27). */
  projectResolving?: boolean;
  /** The project's own delivery destination, if it already has one. Precedence
   *  #1 for the delivery fields; the ACCOUNT ADDRESS IS NEVER PRECEDENCE. */
  storedDelivery?: { suburb: string | null; postcode: string | null } | null;
  onBack: () => void;
  onSubmit?: (delivery: SubmitDelivery) => Promise<SubmitResult>;
  /** Server-confirmed; carries the address the confirmation went to. */
  onSubmitted: (email: string) => void;
  /** Blocking lines exist — send the customer back to fix them. */
  onFixBlocked: () => void;
  /** A fresh user from the inline sign-in or a profile save — App owns identity. */
  onAuthed?: (user: AuthUserDto) => void;
}) {
  const gstMode = useGstMode();
  const { total, pendingPriceCount, attentionCount } = quoteSummary(quote);

  // Component-local, never persisted: no stale stage can survive an auth change
  // elsewhere in the app, because every other stage is derived from props.
  const [gateOpened, setGateOpened] = useState(false);

  // ── Account details, as live inputs ────────────────────────────────────────
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [addressLine1, setAddressLine1] = useState(user?.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(user?.addressLine2 ?? "");
  const [addressSuburb, setAddressSuburb] = useState(user?.addressSuburb ?? "");
  const [addressState, setAddressState] = useState(user?.addressState ?? "");
  const [addressPostcode, setAddressPostcode] = useState(user?.addressPostcode ?? "");
  const [touched, setTouched] = useState<Partial<Record<DetailField, boolean>>>({});

  // Adopt the account's values when identity arrives (the inline sign-in) or
  // changes. Only fields the customer has not touched are overwritten, so typing
  // is never undone by a late fetch.
  const adoptedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!user || adoptedFor.current === user.email) return;
    adoptedFor.current = user.email;
    setName(user.name); setPhone(user.phone);
    setAddressLine1(user.addressLine1); setAddressLine2(user.addressLine2);
    setAddressSuburb(user.addressSuburb); setAddressState(user.addressState);
    setAddressPostcode(user.addressPostcode);
    setTouched({});
  }, [user]);

  // ── Delivery for THIS project ──────────────────────────────────────────────
  // Precedence: the project's stored destination, else the postcode typed before
  // the gate, else empty. There is no fourth entry, and the account address is
  // not one of them.
  const [suburb, setSuburb] = useState(storedDelivery?.suburb ?? "");
  const [postcode, setPostcode] = useState(storedDelivery?.postcode ?? "");
  const [postcodeError, setPostcodeError] = useState("");
  // The pre-gate value, remembered so the details form can say where it came
  // from. It is the ONLY thing that ever pre-fills a delivery field, and a value
  // that appears on its own — with no account address anywhere near it — is
  // exactly the kind of thing a person assumes the site guessed (§16.5.1).
  const [carriedPostcode, setCarriedPostcode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // ── The merge moment ───────────────────────────────────────────────────────
  // WHICH lines just arrived, not merely how many. The count alone cannot mark a
  // row, but the client does not need the server to tell it: it was holding the
  // anonymous draft's own line ids before it signed in, and claimAnonProjectForUser
  // RE-PARENTS those rows rather than recreating them (`UPDATE quote_line SET
  // project_id = ?`), so the ids survive the merge untouched. Nothing new crosses
  // the wire for this, and /verify is not asked for anything extra.
  const anonLineIds = useRef<Set<string>>(new Set());
  const linesBeforeAuth = useRef<number | null>(null);
  const [mergedCount, setMergedCount] = useState(0);
  const wasResolving = useRef(false);
  useEffect(() => {
    if (projectResolving) { wasResolving.current = true; return; }
    if (!wasResolving.current) return;
    wasResolving.current = false;
    const before = linesBeforeAuth.current;
    if (before != null && quote.items.length > before) setMergedCount(quote.items.length - before);
  }, [projectResolving, quote.items.length]);

  // ── GST (AC-35) ────────────────────────────────────────────────────────────
  // Nothing to wire: GstContext reads the account's mode, so every price on this
  // screen re-renders the instant the user lands. The caption exists only so a
  // visible ~9% drop reads as a preference rather than a bug.
  const [gstFlipped, setGstFlipped] = useState(false);

  const stage: "pregate" | "signin" | "resolving" | "details" =
    !user ? (gateOpened ? "signin" : "pregate")
      : projectResolving ? "resolving"
        : "details";

  const details = useMemo(() => ({
    name, phone,
    addressLine1, addressLine2, addressSuburb, addressState, addressPostcode,
  }), [name, phone, addressLine1, addressLine2, addressSuburb, addressState, addressPostcode]);
  const missing = useMemo(() => submitMissing(details), [details]);

  // The delivery figure at submit — shown once four digits are entered, labelled
  // as an estimate a person will check. Never called while the customer is
  // building (D8), and never while the project id may be about to be replaced by
  // a merge (E6).
  const [delivery, setDelivery] = useState<{ amount: number; conservative: boolean } | null>(null);
  useEffect(() => {
    if (!projectId || projectResolving || postcode.length !== 4) { setDelivery(null); return; }
    let cancelled = false;
    getDeliveryEstimate(projectId, postcode)
      .then((r) => { if (!cancelled) setDelivery(r.ok && typeof r.amount === "number" ? { amount: r.amount, conservative: !!r.conservative } : null); })
      .catch(() => { if (!cancelled) setDelivery(null); });
    return () => { cancelled = true; };
  }, [projectId, postcode, projectResolving]);

  const openGate = () => {
    if (attentionCount > 0) { onFixBlocked(); return; }
    linesBeforeAuth.current = quote.items.length;
    anonLineIds.current = new Set(
      quote.items.map((it) => it.serverId).filter((id): id is string => !!id),
    );
    // Only a value the visitor typed here counts as carried; a project's own
    // stored destination was already theirs and needs no explaining.
    if (/^\d{4}$/.test(postcode) && !storedDelivery?.postcode) setCarriedPostcode(postcode);
    setGateOpened(true);
  };

  const handleAuthed = (fresh: AuthUserDto) => {
    if (fresh.priceGstMode === "ex" && gstMode !== "ex") setGstFlipped(true);
    onAuthed?.(fresh);
  };

  // §16.5.3's per-field over-limit message has no branch here on purpose: every
  // input carries its own `maxLength`, so a value cannot exceed the stated
  // maximum from this form. The server still refuses one — that is the point of
  // a server floor — and a refusal it should never have had to make is reported
  // at panel level rather than pretending to know which field a crafted request
  // carried.
  const fieldError = (field: DetailField): string => {
    if (!touched[field] || !missing.includes(field)) return "";
    if (field === "phone" && phone.trim()) return PHONE_INVALID;
    return FIELD_ERROR[field];
  };
  const markTouched = (field: DetailField) => setTouched((t) => ({ ...t, [field]: true }));

  const handleSubmit = async () => {
    if (submitting || !user) return;
    if (aiReading) {
      setSubmitError("Please wait while we finish refining this estimate from your documents.");
      return;
    }
    if (attentionCount > 0) { onFixBlocked(); return; }
    if (missing.length) {
      setTouched(Object.fromEntries(missing.map((f) => [f, true])));
      return;
    }
    if (!/^\d{4}$/.test(postcode)) { setPostcodeError("Enter your 4-digit delivery postcode."); return; }

    setSubmitting(true); setSubmitError(""); setPostcodeError("");
    try {
      // The account is the single home of these facts, and the profile endpoint
      // is its single writer. Only the changed ones are sent, and the button
      // never narrates the save as a separate step.
      const patch: Record<string, string> = {};
      if (name.trim() !== user.name) patch.name = name.trim();
      if (phone.trim() !== user.phone) patch.phone = phone.trim();
      if (addressLine1.trim() !== user.addressLine1) patch.addressLine1 = addressLine1.trim();
      if (addressLine2.trim() !== user.addressLine2) patch.addressLine2 = addressLine2.trim();
      if (addressSuburb.trim() !== user.addressSuburb) patch.addressSuburb = addressSuburb.trim();
      if (addressState.trim() !== user.addressState) patch.addressState = addressState.trim();
      if (addressPostcode.trim() !== user.addressPostcode) patch.addressPostcode = addressPostcode.trim();
      if (Object.keys(patch).length) {
        try {
          const saved = await updateProfile(patch);
          onAuthed?.(saved.user);
        } catch (e) {
          if (e instanceof ApiError && e.code === "invalid_fields") {
            setSubmitError("We couldn't save your details — check them, then try again.");
          } else {
            setSubmitError("Couldn't save your details. Please try again.");
          }
          return;
        }
      }

      const result = await onSubmit?.({ suburb: suburb.trim(), postcode });
      if (!result || result.ok) { onSubmitted(user.email); return; } // no handler = design preview
      if (result.error === "missing_postcode" || result.error === "invalid_postcode") {
        setPostcodeError("Enter your 4-digit delivery postcode.");
        return;
      }
      if (result.error === "incomplete_profile") {
        setSubmitError(`We still need ${prose(missing.length ? missing : ["name"], FIELD_PROSE)} before this can go to review.`);
        return;
      }
      if (result.error === "unauthorized") {
        setSubmitError("Your sign-in expired. Sign in again to send this quote for review.");
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

  const submitDisabled =
    submitting || aiReading || projectResolving || postcode.length !== 4 ||
    (stage === "details" && missing.length > 0);

  const errId = (field: DetailField) => `detail-err-${field}`;

  return (
    <div className="quote-page min-h-screen ground-bone pt-16">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <button onClick={onBack} className="text-body hover:text-ink mb-5 flex items-center gap-1 cursor-pointer t-bd-sm"><ChevronLeft className="w-4 h-4" />{backLabel}</button>
        <SLabel>Review quote</SLabel>
        <h1 className="font-semibold text-ink mb-2 font-display t-hd1">Review and submit</h1>
        <p className="text-body mb-6 t-bd-sm">No payment at this stage. A reviewed quote is issued after manual technical review.</p>

        {/* A merge is a CONVENIENCE, not a fault — so this is built out of the
            sage "this changed for the better" vocabulary the product already
            owns (`.quote-item-card[data-state="added"]`: a 55%-mixed sage border
            plus a 3px inset spine) and a CheckCircle, never a warning colour.
            Sage-wash on its own was too weak to carry the moment: with no spine
            and no mark it read as a neutral grey box. */}
        {mergedCount > 0 && (
          <div
            className="flex items-start gap-3 bg-sage-wash border p-4 pl-[17px] mb-4"
            style={{
              borderColor: "color-mix(in oklab, var(--sage) 55%, var(--line))",
              boxShadow: "inset 3px 0 0 var(--sage)",
            }}>
            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-sage" aria-hidden="true" />
            <div>
              <p className="font-semibold text-sage-ink font-display t-bd-sm">Your quotes have been combined</p>
              <p className="text-ink-soft mt-0.5 max-w-[58ch] t-cap">
                You already had a saved quote on this account, so the {mergedCount} item{mergedCount === 1 ? "" : "s"} you
                just built have been added to it. The list below is the whole project — have a look before you submit.
              </p>
            </div>
          </div>
        )}

        <div className="quote-panel p-5 mb-4">
          <SLabel>{mergedCount > 0 ? `Your quote · ${quote.items.length} items` : "Your quote"}</SLabel>
          {projectResolving ? (
            <div className="flex flex-col items-center gap-1.5 py-8 text-center">
              <p className="text-ink flex items-center gap-2 t-bd-sm">
                <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin motion-reduce:animate-none text-sage" aria-hidden="true" />
                Updating your project…
              </p>
              <p className="text-body t-cap">We're checking for anything already saved to your account.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 mb-3">
                {quote.items.map((it, i) => {
                  const justAdded = mergedCount > 0 && !!it.serverId && anonLineIds.current.has(it.serverId);
                  return (
                  <div key={it.id} data-line-row className="flex justify-between gap-3 border-b border-black/6 last:border-0 py-1.5 t-bd-sm">
                    <span className="text-ink min-w-0 truncate">
                      {String(i + 1).padStart(2, "0")} · {productLabel(it.productSlug)} — {mm(it.height)} × {mm(it.width)} ×{it.qty}
                      {justAdded && (
                        <span className="ml-2 align-middle whitespace-nowrap bg-sage-wash text-sage-ink border border-sage/25 px-1.5 py-0.5 t-label">
                          Just added
                        </span>
                      )}
                    </span>
                    <span className="text-body flex-shrink-0 font-data">
                      {it.review?.customerConfigurationChanged && (typeof it.lineTotal !== "number" || !Number.isFinite(it.lineTotal))
                        ? "Pending final price"
                        : lineBlocksSubmission(it) ? "Review" : fmt(gstAdjust(linePriceTotal(it), gstMode))}
                    </span>
                  </div>
                  );
                })}
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
              {gstFlipped && gstMode === "ex" && (
                <p className="text-body mt-2 t-cap">Now showing prices ex GST, the setting on your account.</p>
              )}
              {pendingPriceCount > 0 && <p className="mt-2 text-amber-800 t-cap">{pendingPriceCount} customer-changed configuration{pendingPriceCount === 1 ? "" : "s"} will be added after we confirm the exact product and price.</p>}
            </>
          )}
        </div>

        {/* ── Stage 0: pre-gate ─────────────────────────────────────────────── */}
        {stage === "pregate" && (
          <div className="quote-panel p-5 space-y-4 mb-4">
            {/* A four-digit field is four digits wide-ish, not 320px: an input
                sized far past its longest possible value reads as an invitation
                to type something longer. */}
            <div className="max-w-[180px]">
              <FieldLabel htmlFor="delivery-postcode">Delivery postcode</FieldLabel>
              <Input id="delivery-postcode" value={postcode} inputMode="numeric" maxLength={4}
                aria-invalid={!!postcodeError || undefined}
                aria-describedby={postcodeError ? "postcode-err" : "postcode-help"}
                onChange={(e) => { setPostcode(e.target.value.replace(/\D/g, "").slice(0, 4)); setPostcodeError(""); }}
                onBlur={() => { if (postcode && postcode.length !== 4) setPostcodeError("Enter your 4-digit delivery postcode."); }}
                placeholder="3072" />
              {postcodeError
                ? <FieldError id="postcode-err">{postcodeError}</FieldError>
                : <p id="postcode-help" className="text-body mt-1 t-cap">We price delivery from this.</p>}
            </div>
          </div>
        )}

        {/* ── Stage 1: sign in or create ────────────────────────────────────── */}
        {/* The active-step treatment, at the strength the product actually draws
            it: `.quote-item-card[data-state="added"]` mixes sage 55% into the
            hairline rather than swapping it for full-strength sage, which was
            louder than anything else on the screen. */}
        {stage === "signin" && (
          <div
            className="quote-panel p-5 mb-4"
            style={{
              borderColor: "color-mix(in oklab, var(--sage) 55%, var(--line))",
              boxShadow: "inset 3px 0 0 var(--sage)",
            }}>
            <OtpSignIn
              heading={OTP_COPY.gate.heading}
              subcopy={OTP_COPY.gate.subcopy}
              layout="inline"
              stepBadge="1"
              onAuthed={handleAuthed}
              onCancel={() => setGateOpened(false)}
              cancelLabel="Back to my quote"
            />
          </div>
        )}

        {/* ── Stage 3: your details ─────────────────────────────────────────── */}
        {stage === "details" && user && (
          <div className="quote-panel p-5 space-y-4 mb-4">
            <div>
              {/* Numbered only for someone who actually went through the sign-in.
                  A returning customer never saw a step 1, so they are not on step
                  2 of anything — the approved mock's surface 6 carries no badge. */}
              <div className="flex items-baseline gap-2.5">
                {gateOpened && (
                  <span aria-hidden="true" data-testid="stage-badge"
                    className="w-6 h-6 flex-shrink-0 grid place-items-center self-start mt-0.5 bg-sage text-white font-data t-data">
                    2
                  </span>
                )}
                <h2 className="font-semibold text-ink font-display t-hd2">Your details</h2>
              </div>
              <p className="text-body mt-1 t-bd-sm">So we can quote you properly and get the delivery right. We'll keep these on your account — next quote, they're already filled in.</p>
              {user.name && (
                <p className="text-sage flex items-center gap-1.5 mt-2 t-bd-sm"><CheckCircle className="w-4 h-4" />From your account — edit if anything's changed.</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel htmlFor="detail-name">Full name</FieldLabel>
                <Input id="detail-name" value={name} autoComplete="name" maxLength={DETAIL_LIMITS.name}
                  autoFocus={!user.name}
                  aria-invalid={!!fieldError("name") || undefined}
                  aria-describedby={fieldError("name") ? errId("name") : undefined}
                  onChange={(e) => setName(e.target.value)} onBlur={() => markTouched("name")}
                  placeholder="e.g. Sam Taylor" />
                {fieldError("name") && <FieldError id={errId("name")}>{fieldError("name")}</FieldError>}
              </div>
              <div>
                <FieldLabel htmlFor="detail-phone">Phone</FieldLabel>
                <Input id="detail-phone" value={phone} autoComplete="tel" maxLength={DETAIL_LIMITS.phone}
                  aria-invalid={!!fieldError("phone") || undefined}
                  aria-describedby={fieldError("phone") ? errId("phone") : "detail-phone-help"}
                  onChange={(e) => setPhone(e.target.value)} onBlur={() => markTouched("phone")}
                  placeholder="0412 345 678" />
                {fieldError("phone")
                  ? <FieldError id={errId("phone")}>{fieldError("phone")}</FieldError>
                  : <p id="detail-phone-help" className="text-body mt-1 t-cap">Mobile, landline or 1300/1800.</p>}
              </div>
            </div>

            {/* Email is a read-only ROW, not an input: it is the sign-in identity
                and an accidental edit is a lockout. */}
            <div>
              <FieldLabel>Email</FieldLabel>
              {/* A read-only ROW, sized and bordered like the inputs around it,
                  rather than loose text that a long address wraps mid-domain and
                  that leaves the chip floating. `.chip` was never a class in this
                  codebase; `.quote-chip--ready` is the real one, and it carries
                  sage-INK, which clears AA on sage-wash where `--sage` does not. */}
              <div className="border border-line bg-recessive flex items-center justify-between gap-2.5 px-3 py-2.5">
                <span className="text-ink min-w-0 truncate t-bd-sm">{user.email}</span>
                <span className="quote-chip quote-chip--ready flex-shrink-0 t-cap">Verified</span>
              </div>
              <p className="text-body mt-1 t-cap">This is your sign-in email. Contact us if you need it changed.</p>
            </div>

            <div className="border-t border-black/8 pt-4">
              <p className="text-sage mb-3 t-label">Your address</p>
              <div className="space-y-4">
                <div>
                  <FieldLabel htmlFor="detail-address1">Street address</FieldLabel>
                  <Input id="detail-address1" value={addressLine1} autoComplete="address-line1" maxLength={DETAIL_LIMITS.addressLine1}
                    aria-invalid={!!fieldError("addressLine1") || undefined}
                    aria-describedby={fieldError("addressLine1") ? errId("addressLine1") : undefined}
                    onChange={(e) => setAddressLine1(e.target.value)} onBlur={() => markTouched("addressLine1")}
                    placeholder="12 Bridge Street" />
                  {fieldError("addressLine1") && <FieldError id={errId("addressLine1")}>{fieldError("addressLine1")}</FieldError>}
                </div>
                <div>
                  <FieldLabel htmlFor="detail-address2">Unit, level or building (optional)</FieldLabel>
                  <Input id="detail-address2" value={addressLine2} autoComplete="address-line2" maxLength={DETAIL_LIMITS.addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)} />
                </div>
                {/* State and postcode stay side by side at 375 (§16.10): both are
                    short, and giving each its own full-width row wastes most of a
                    phone screen. Suburb takes the full row above them. */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <FieldLabel htmlFor="detail-suburb">Suburb</FieldLabel>
                    <Input id="detail-suburb" value={addressSuburb} autoComplete="address-level2" maxLength={DETAIL_LIMITS.addressSuburb}
                      aria-invalid={!!fieldError("addressSuburb") || undefined}
                      aria-describedby={fieldError("addressSuburb") ? errId("addressSuburb") : undefined}
                      onChange={(e) => setAddressSuburb(e.target.value)} onBlur={() => markTouched("addressSuburb")}
                      placeholder="Preston" />
                    {fieldError("addressSuburb") && <FieldError id={errId("addressSuburb")}>{fieldError("addressSuburb")}</FieldError>}
                  </div>
                  <div>
                    <FieldLabel htmlFor="detail-state">State</FieldLabel>
                    <select id="detail-state" value={addressState} autoComplete="address-level1"
                      aria-invalid={!!fieldError("addressState") || undefined}
                      aria-describedby={fieldError("addressState") ? errId("addressState") : undefined}
                      onChange={(e) => setAddressState(e.target.value)} onBlur={() => markTouched("addressState")}
                      // 43px is exactly what the sibling Inputs compute to
                      // (21px line box + 10px padding + 1px border, doubled): a
                      // native select derives its own line box and came out ~3px
                      // short, which threw the error messages under Suburb /
                      // State / Postcode onto three different baselines.
                      className="field-control w-full h-[43px] border px-3 py-2.5 text-ink focus:outline-none transition-colors aria-[invalid=true]:border-attention aria-[invalid=true]:bg-attention/6 t-bd-sm">
                      <option value="">Choose…</option>
                      {AU_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {fieldError("addressState") && <FieldError id={errId("addressState")}>{fieldError("addressState")}</FieldError>}
                  </div>
                  <div>
                    <FieldLabel htmlFor="detail-postcode">Postcode</FieldLabel>
                    <Input id="detail-postcode" value={addressPostcode} inputMode="numeric" maxLength={4} autoComplete="postal-code"
                      aria-invalid={!!fieldError("addressPostcode") || undefined}
                      aria-describedby={fieldError("addressPostcode") ? errId("addressPostcode") : undefined}
                      onChange={(e) => setAddressPostcode(e.target.value.replace(/\D/g, "").slice(0, 4))} onBlur={() => markTouched("addressPostcode")}
                      placeholder="3072" />
                    {fieldError("addressPostcode") && <FieldError id={errId("addressPostcode")}>{fieldError("addressPostcode")}</FieldError>}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-black/8 pt-4">
              <p className="text-sage mb-1 t-label">Delivery for this project</p>
              <p className="text-body mb-3 t-cap">Where these windows and doors go — usually a site, not an office. We don't assume it, so it starts blank each time.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel htmlFor="delivery-suburb">Delivery suburb</FieldLabel>
                  {/* No autoComplete on either delivery field: browser address
                      autofill would reintroduce exactly the wrong-address-by-
                      default failure this precedence exists to prevent. */}
                  <Input id="delivery-suburb" value={suburb}
                    onChange={(e) => setSuburb(e.target.value)}
                    placeholder="e.g. Craigieburn VIC" />
                </div>
                <div>
                  <FieldLabel htmlFor="delivery-postcode">Delivery postcode</FieldLabel>
                  <Input id="delivery-postcode" value={postcode} inputMode="numeric" maxLength={4}
                    aria-invalid={!!postcodeError || undefined}
                    aria-describedby={postcodeError ? "postcode-err" : "postcode-help"}
                    onChange={(e) => { setPostcode(e.target.value.replace(/\D/g, "").slice(0, 4)); setPostcodeError(""); }}
                    onBlur={() => { if (postcode && postcode.length !== 4) setPostcodeError("Enter your 4-digit delivery postcode."); }}
                    placeholder="3072" />
                  {postcodeError
                    ? <FieldError id="postcode-err">{postcodeError}</FieldError>
                    : <p id="postcode-help" className="text-body mt-1 t-cap">
                        {carriedPostcode && postcode === carriedPostcode
                          ? "Carried over from the postcode you used above."
                          : "We price delivery from this."}
                      </p>}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="quote-notice--info border border-info/30 flex items-start gap-2 p-4 mb-6 t-cap"><AlertCircle className="w-3 h-3 flex-shrink-0 mt-[3px]" aria-hidden="true" /><span>Delivery is priced from your postcode and confirmed on technical review. Estimated totals are confirmed on that same review. No deposit until you approve the reviewed quote. Supply only — tailgate to the kerb, and installation is not included.</span></div>

        {/* A panel-level refusal is a notice, not a floating red sentence: it had
            a danger tint and no padding at all, so the fill sat flush against the
            glyphs, and right-justifying it left the message ragged on the edge a
            reader starts from. */}
        {submitError && (
          <div role="alert" className="quote-notice--danger border border-destructive/35 text-attention-ink flex items-start gap-2 p-3.5 mb-4 t-cap">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />{submitError}
          </div>
        )}

        {/* Submit is NOT RENDERED while re-resolving — not merely disabled — so no
            keyboard or scripted path reaches it against a merge-deleted id. */}
        {stage !== "resolving" && (
          <>
            {stage === "pregate" && (
              <p className="text-body mb-2 text-center sm:text-right t-cap">
                Submitting needs an account — we'll email you a code. About a minute.
              </p>
            )}
            {stage === "details" && missing.length > 0 && (
              <p className="text-body mb-2 text-center sm:text-right t-cap">
                Still needed: {missing.map((f) => FIELD_LABEL[f]).join(", ")}.
              </p>
            )}
            {/* Full-width on a phone, right-aligned on desktop (§16.10): the one
                action on the screen should not be a 230px target floating against
                the right gutter of a 375px viewport. */}
            {stage !== "signin" && (
              <div className="flex justify-end">
                <Btn variant="sage" size="lg" disabled={submitDisabled}
                  className="w-full sm:w-auto justify-center"
                  onClick={stage === "pregate" ? openGate : handleSubmit}>
                  {submitting ? "Submitting…" : aiReading ? "Refining estimate…" : <>Submit for technical review <Send className="w-4 h-4" /></>}
                </Btn>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
