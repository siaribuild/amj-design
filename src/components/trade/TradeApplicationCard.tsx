// ═══════════════════════════════════════════════════════════════════════════════
// TRADE VERIFICATION — one card, two doors (registration Phase 2, design §8.1).
//
// ONE component renders door (a) `/trade-account` and door (b) the account page,
// which is what makes AC-P2-10's "no behavioural difference attributable to the
// entry point" STRUCTURAL rather than a thing two call sites happen to agree on.
// The only entry-point-specific behaviour in the whole phase is whether the
// optional group starts revealed (P2-UX-10) — one boolean, no forked flow.
//
// THE CLIENT STORES NO STATUS WORD. Everything below is derived from `trade`
// (ADR-0002): a standing grant and a pending application are two INDEPENDENT
// facts, and a verified account re-applying with a new ABN is both at once
// (E-P2-6). That pair renders as two blocks, never as a merged third word — the
// customer's pricing is not in doubt and the screen must not suggest it is.
//
// COPY RULES THIS FILE OBEYS (all owner rulings, §18.0):
//   1. No percentage, and no pair of figures one could subtract to recover the
//      rate. "Trade pricing" is the NAME of the thing — never "better",
//      "cheaper", "lower", "discount" or "you save".
//   2. No timeframe, ever. "We'll be in touch" is the strongest promise allowed.
//   3. The customer is NEVER told which criterion failed. Two applications
//      queued for different reasons produce identical screens.
//   4. No builder/tradie control exists on any surface (P2-D5).
//   5. No repricing promise.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check } from "lucide-react";
import { Btn, FieldLabel, Input, WindowMark, SAGE } from "../../app/ui";
import { OtpSignIn } from "../OtpSignIn";
import { abnValid, formatAbn, normalizeAbn } from "../../data/abn";
import { applyForTrade, ApiError, type AuthUserDto, type TradeStateDto } from "../../data/api";

/** What the person typed, held across the OTP round trip on door (a).
 *
 *  This is the mechanism behind AC-P2-3: no unauthenticated endpoint in this
 *  system accepts an ABN, so a cold visitor's business details live in browser
 *  state until a session exists and are posted the moment it does. */
interface Draft { businessName: string; abn: string }

const EMPTY: Draft = { businessName: "", abn: "" };

/** The status pill (§18.3). Three tones and no more: positive for a live grant,
 *  work for something being looked at, mute for rejected/revoked — because
 *  nothing failed and nothing broke, and attention/danger colour would say it
 *  did (P2-UX-6). */
function Pill({ tone, children }: { tone: "positive" | "work" | "mute"; children: ReactNode }) {
  const skin = tone === "positive" ? "text-ink border-[color:var(--sage)]"
    : tone === "work" ? "text-ink border-black/25"
    : "text-body border-black/15";
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 rounded-full t-label ${skin}`}>
      {children}
    </span>
  );
}

export function TradeApplicationCard({
  user, trade, source, onAuthed, onTradeChanged,
}: {
  user: { company?: string } | null;
  trade: TradeStateDto | null;
  source: "trade_page" | "profile";
  onAuthed?: (u: AuthUserDto) => void;
  onTradeChanged?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Set only by an application this card made, so an auto-pass shows its
   *  outcome immediately rather than waiting on the parent's `me()` refetch. */
  const [outcome, setOutcome] = useState<"verified" | "under_review" | null>(null);
  /** A VERIFIED account re-applying with a changed ABN (E-P2-6).
   *
   *  Disclosed rather than always open, and the distinction is the whole point:
   *  a verified account's ABN must not sit on screen as an editable box
   *  (AC-P2-11) — that is the shape P2-A4 exists to prevent, and the Worker
   *  refuses the write anyway. But re-applying has to stay POSSIBLE, because an
   *  ABN really does change. So the fact is displayed, and changing it is a
   *  deliberate act behind an affordance rather than a text cursor. */
  const [reapplying, setReapplying] = useState(false);

  // AC-P2-8: the account's business name is already known, so it is already in
  // the field.
  //
  // This CANNOT be a `useState` initializer, which is where it started and why
  // it was broken (F-1). On `/trade-account` the card mounts while App is still
  // resolving the session, so `user` is null on that first render and the
  // initial value would be "" forever after. Door (b) hid the bug entirely: the
  // account page only renders once `user` exists.
  //
  // Prefill happens at most ONCE and never overwrites a non-empty field, so a
  // cold visitor who types a business name before signing in keeps what they
  // typed — the values held across the OTP (AC-P2-3) outrank the stored one.
  const prefilled = useRef(false);
  useEffect(() => {
    const company = user?.company?.trim();
    if (prefilled.current || !company) return;
    prefilled.current = true;
    setDraft((d) => (d.businessName.trim() ? d : { ...d, businessName: company }));
  }, [user?.company]);

  const pending = trade?.pending ?? null;
  const digits = normalizeAbn(draft.abn);
  const abnLooksRight = abnValid(digits);
  const canSubmit = !!draft.businessName.trim() && abnLooksRight && !busy;

  /** The most recent decided outcome, when there is no live state to show. Used
   *  ONLY to say "not active" plainly — never to explain why (rule 3). */
  const lastDecision = trade?.history?.length ? trade.history[trade.history.length - 1].outcome : null;

  /** Holds trade pricing right now — either the server said so, or this card
   *  just auto-passed and the parent's `me()` refetch has not landed yet. One
   *  name for the condition so the panels cannot disagree about it mid-refresh. */
  const isVerified = (trade?.verified ?? false) || outcome === "verified";

  /** A malformed ABN blocks the step it sits on (§18.2.3) — the same rule the
   *  gate applies to Submit. An EMPTY ABN never blocks: the group is optional
   *  and clearing the field always releases it. */
  const abnMalformed = draft.abn.trim() !== "" && !abnLooksRight;
  const nameMissing = draft.abn.trim() !== "" && !draft.businessName.trim();
  const blocked = abnMalformed || nameMissing;

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const status = await applyForTrade({
        abn: digits, businessName: draft.businessName.trim(), source,
      });
      setOutcome(status);
      setDraft(EMPTY);
      setReapplying(false);
      onTradeChanged?.();
    } catch (e) {
      // The server's refusals, said in the person's language. `application_pending`
      // is not an error the customer caused — it means the card is out of date,
      // so it asks for a refresh rather than blaming the input.
      const code = e instanceof ApiError ? e.code : "";
      setError(
        code === "invalid_abn" ? "That ABN doesn't look right — check the digits and try again."
        : code === "invalid_business_name" ? "Add the business name as it's registered."
        : code === "application_pending" ? "There's already an application on this account."
        : code === "rate_limited" ? "That's a few attempts in a row. Try again a little later."
        : "We couldn't send that just now. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  // ── The optional field group. THE SAME two fields at every door and at the
  //    submit gate (§18.2.1) — business name, then ABN, and nothing else. There
  //    is no builder/tradie control here or anywhere (rule 4).
  const fields = (
    <div className="space-y-3">
      <div>
        <FieldLabel htmlFor="trade-business">Business name</FieldLabel>
        <Input id="trade-business" value={draft.businessName} placeholder="ABC Constructions"
          maxLength={200} autoComplete="organization"
          onChange={(e) => { setDraft((d) => ({ ...d, businessName: e.target.value })); if (error) setError(""); }} />
        <p className="text-body mt-1 t-cap">As it's registered against the ABN.</p>
        {nameMissing && (
          <p role="alert" className="text-warning mt-1 t-cap">Enter the business name registered to this ABN.</p>
        )}
      </div>
      <div>
        <FieldLabel htmlFor="trade-abn">ABN</FieldLabel>
        <Input id="trade-abn" value={draft.abn} placeholder="00 000 000 000" inputMode="numeric"
          maxLength={32}
          onChange={(e) => { setDraft((d) => ({ ...d, abn: e.target.value })); if (error) setError(""); }} />
        {/* The checksum is a CLIENT gate: a transposed digit is caught with zero
            round trips, so a malformed ABN costs the register nothing
            (AC-P2-7). It is re-run server-side; this is not the authority. */}
        {abnMalformed
          ? <p role="alert" className="text-warning mt-1 t-cap">That ABN doesn't look right. Check the 11 digits, or clear the field to continue without it.</p>
          : <p className="text-body mt-1 t-cap">11 digits. Spaces are fine.</p>}
      </div>
      {error && (
        <p role="alert" className="text-warning flex items-start gap-2 t-cap">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
        </p>
      )}
    </div>
  );

  // ── Door (a), cold. The ORDINARY signup, with the optional group mounted
  //    inside step 1 — not a second registration flow (owner ruling, §18.2).
  if (!user) {
    return (
      <div className="card p-6" data-testid="trade-application-card">
        <OtpSignIn
          heading="Sign in or create your account"
          subcopy="We'll email you a 6-digit code — no password. If you don't have an account yet, this creates one."
          onAuthed={(u) => {
            onAuthed?.(u);
            // The fork, and the ONLY one: an ABN was entered, so verification
            // runs now that a session exists. Nothing was entered ⇒ an ordinary
            // private account, exactly as Phase 1 shipped it.
            if (abnValid(normalizeAbn(draft.abn)) && draft.businessName.trim()) void submit();
          }}
          emailStepBlocked={blocked}
          emailStepExtra={
            <div className="border-t border-line pt-4 space-y-3">
              <div>
                <p className="text-quiet t-label">Your business (optional)</p>
                <p className="text-body mt-1 t-cap">
                  Add your ABN and we'll check it against the Australian Business Register as soon
                  as you're signed in. If it checks out, trade pricing is on your account straight
                  away. You can also add it later from your account.
                </p>
              </div>
              {fields}
            </div>
          }
        />
      </div>
    );
  }

  // ── Signed in. The two live facts render as their own BLOCKS, in order, and
  //    a verified account re-applying is both at once (E-P2-6, §18.3.4) — never
  //    merged into a third status word.
  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-4 t-cap">
      <span className="text-quiet">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );

  return (
    <div className="card p-6 space-y-5" data-testid="trade-application-card">
      {isVerified && (
        <div className="space-y-3">
          <Pill tone="positive"><Check className="w-3 h-3" />Active</Pill>
          <p className="text-ink t-bd-sm">Trade pricing applies to your account.</p>
          <div className="space-y-1">
            {user?.company ? row("Business", user.company) : null}
            {trade?.abn ? row("ABN", formatAbn(trade.abn)) : null}
          </div>
        </div>
      )}

      {(pending || outcome === "under_review") && (
        isVerified ? (
          // §18.3.4 — the pair. The customer's pricing is NOT in doubt and the
          // screen must not suggest it is.
          <div className="space-y-2 border-t border-line pt-4">
            <Pill tone="work">New details under review</Pill>
            <p className="text-body t-bd-sm">
              {pending
                ? `We're checking ABN ${formatAbn(pending.abn)} for ${pending.businessName}.`
                : "We're checking the details you sent."}{" "}
              Your trade pricing is unaffected while we do — nothing changes on your account unless
              we tell you.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Pill tone="work">Under review</Pill>
            {/* No reason (rule 3) and no turnaround (rule 2). */}
            <p className="text-body t-bd-sm">
              We're checking the details you sent. We'll email you when it's done — your account
              works as normal in the meantime.
            </p>
            <div className="space-y-1">
              {pending?.businessName ? row("Business", pending.businessName) : null}
              {pending?.abn ? row("ABN", formatAbn(pending.abn)) : null}
              {pending?.createdAt ? row("Sent", pending.createdAt.slice(0, 10)) : null}
            </div>
            <p className="text-body t-cap">You can send new details once this one's been looked at.</p>
          </div>
        )
      )}

      {/* §18.3.5 — rejected and revoked are DIFFERENT things and read
          differently. Both mute: nothing failed and nothing broke. Neither names
          a reason, and a duplicate-ABN rejection never discloses that another
          account holds it (AC-P2-44). */}
      {!isVerified && !pending && !outcome && lastDecision === "rejected" && (
        <div className="space-y-2">
          <Pill tone="mute">Not approved</Pill>
          <p className="font-semibold text-ink t-bd-sm">We couldn't set up trade pricing from those details</p>
          <p className="text-body t-bd-sm">
            Your account still works exactly as before — you can price jobs, submit them, track them
            and use Refer &amp; earn. You're welcome to try again with updated details, or reply to
            our email and we'll help.
          </p>
        </div>
      )}
      {!isVerified && !pending && !outcome && lastDecision === "revoked" && (
        <div className="space-y-2">
          <Pill tone="mute">Not active</Pill>
          <p className="font-semibold text-ink t-bd-sm">Trade pricing no longer applies</p>
          <p className="text-body t-bd-sm">
            You're seeing our standard prices from now on. Everything else on your account is
            unchanged. If you think that's a mistake, get in touch and we'll sort it out.
          </p>
        </div>
      )}

      {/* A verified account's re-apply affordance, CLOSED by default: the ABN
          above is a displayed fact, not an input. Because a standing grant plus a
          pending row is a representable state, re-applying never takes the
          existing trade pricing away while the new ABN is checked (E-P2-6). */}
      {isVerified && !pending && outcome !== "under_review" && !reapplying && (
        <div className="border-t border-line pt-4">
          <p className="text-body t-cap">
            Changed ABN or trading name?{" "}
            <button type="button" onClick={() => setReapplying(true)}
              className="text-ink underline underline-offset-2 cursor-pointer">
              Send us the new details
            </button>{" "}
            — your trade pricing stays while we check them.
          </p>
        </div>
      )}

      {/* The form: offered when there is no application in flight, and — for a
          verified account — only once re-applying has been asked for. */}
      {!pending && outcome !== "under_review" && (!isVerified || reapplying) && (
        <div className="space-y-4">
          {!isVerified && !outcome && (
            <div>
              <p className="font-semibold text-ink t-bd-sm">Trade account</p>
              {/* Spec §7.2, VERBATIM — the owner's words, which this stage may
                  place but not rewrite. "You may qualify" is load-bearing: the
                  reader may be a private customer who holds an ABN and does not
                  know they qualify, and nothing may promise an outcome before
                  verification (AC-P2-9). */}
              <p className="text-body mt-1 t-bd-sm">
                Have an ABN? You may qualify for trade pricing. Add it and we'll check it against
                the Australian Business Register.
              </p>
            </div>
          )}
          {isVerified && <p className="text-quiet t-label">Your new details</p>}
          {fields}
          <div className="flex items-center gap-4">
            <Btn variant="sage" size="md" onClick={() => void submit()} disabled={!canSubmit}>
              {busy ? "Checking your details…" : "Apply for trade pricing"}
              {!busy && <Check className="w-4 h-4" />}
            </Btn>
            {isVerified && (
              <button type="button" onClick={() => { setReapplying(false); setDraft(EMPTY); setError(""); }}
                className="text-body hover:text-ink cursor-pointer t-bd-sm">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Outline only — date and outcome. No reason, no actor, no ABN (AC-P2-13). */}
      {!!trade?.history?.length && (
        <div className="border-t border-line pt-4">
          <p className="text-quiet t-label mb-2">History</p>
          {/* Newest first (§18.6). The server returns the ledger oldest-first
              because that is the order it happened in; a person reading their own
              account wants the latest state at the top. */}
          <ul className="space-y-1">
            {[...trade.history].reverse().map((h, i) => (
              <li key={`${h.at}-${i}`} className="text-body flex justify-between t-cap">
                <span>{h.at?.slice(0, 10)}</span>
                <span>{h.outcome === "approved" ? "Trade pricing approved"
                  : h.outcome === "rejected" ? "Not approved" : "Trade pricing removed"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
