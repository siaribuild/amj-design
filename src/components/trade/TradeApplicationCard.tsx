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
import { useState } from "react";
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

export function TradeApplicationCard({
  user, trade, source, onAuthed, onTradeChanged,
}: {
  user: { company?: string } | null;
  trade: TradeStateDto | null;
  source: "trade_page" | "profile";
  onAuthed?: (u: AuthUserDto) => void;
  onTradeChanged?: () => void;
}) {
  // Business name pre-filled from the account's existing company (AC-P2-8) —
  // read once as the initial value, never bound, so typing is not fought.
  const [draft, setDraft] = useState<Draft>(() => ({ ...EMPTY, businessName: user?.company ?? "" }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Set only by an application this card made, so an auto-pass shows its
   *  outcome immediately rather than waiting on the parent's `me()` refetch. */
  const [outcome, setOutcome] = useState<"verified" | "under_review" | null>(null);

  const verified = trade?.verified ?? false;
  const pending = trade?.pending ?? null;
  const digits = normalizeAbn(draft.abn);
  const abnLooksRight = abnValid(digits);
  const canSubmit = !!draft.businessName.trim() && abnLooksRight && !busy;

  /** The most recent decided outcome, when there is no live state to show. Used
   *  ONLY to say "not active" plainly — never to explain why (rule 3). */
  const lastDecision = trade?.history?.length ? trade.history[trade.history.length - 1].outcome : null;

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
        <Input id="trade-business" value={draft.businessName} placeholder="As it's registered"
          onChange={(e) => { setDraft((d) => ({ ...d, businessName: e.target.value })); if (error) setError(""); }} />
      </div>
      <div>
        <FieldLabel htmlFor="trade-abn">ABN</FieldLabel>
        <Input id="trade-abn" value={draft.abn} placeholder="00 000 000 000" inputMode="numeric"
          onChange={(e) => { setDraft((d) => ({ ...d, abn: e.target.value })); if (error) setError(""); }} />
        {/* The checksum is a CLIENT gate: a transposed digit is caught with zero
            round trips, so a malformed ABN costs the register nothing
            (AC-P2-7). It is re-run server-side; this is not the authority. */}
        {draft.abn.trim() !== "" && !abnLooksRight && (
          <p role="alert" className="text-warning mt-1 t-cap">That ABN doesn't look right — check the digits.</p>
        )}
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

  // ── Signed in. The two live facts render as their own blocks, in order.
  return (
    <div className="card p-6 space-y-5" data-testid="trade-application-card">
      {(verified || outcome === "verified") && (
        <div className="space-y-2">
          <p className="font-semibold text-ink flex items-center gap-2">
            <WindowMark size={12} color={SAGE} />Trade pricing applies to your account
          </p>
          <p className="text-body t-bd-sm">
            The prices you see are already your prices — while you're configuring, not just on the
            quote we send back.
          </p>
          {trade?.abn && (
            <p className="text-body t-cap">ABN {formatAbn(trade.abn)}</p>
          )}
        </div>
      )}

      {(pending || outcome === "under_review") && (
        <div className="space-y-2">
          <p className="font-semibold text-ink">We're checking your ABN</p>
          {/* No reason (rule 3) and no turnaround (rule 2). */}
          <p className="text-body t-bd-sm">
            We'll be in touch. Your account works in the meantime — you can quote, submit and track
            exactly as you do now.
          </p>
          {pending?.abn && <p className="text-body t-cap">ABN {formatAbn(pending.abn)}</p>}
        </div>
      )}

      {/* A refusal costs nothing, and the screen says so plainly rather than
          reading as an error state (P2-UX-6). Never says why (rule 3). */}
      {!verified && !pending && !outcome && lastDecision && lastDecision !== "approved" && (
        <p className="text-body t-bd-sm">
          Trade pricing isn't active on this account. Everything else works as normal, and you're
          welcome to apply again below.
        </p>
      )}

      {/* The form: offered whenever there is no application in flight. A verified
          account keeps it for a CHANGED ABN (E-P2-6) — and because a standing
          grant plus a pending row is a representable state, applying does not
          take the trade pricing away. */}
      {!pending && outcome !== "under_review" && (
        <div className="space-y-4">
          {!verified && !outcome && (
            <div>
              <p className="font-semibold text-ink">Trade pricing</p>
              <p className="text-body mt-1 t-bd-sm">
                Add your ABN and we'll check it against the Australian Business Register. If it
                checks out, trade pricing is on your account straight away.
              </p>
            </div>
          )}
          {verified && <p className="text-quiet t-label">Changed ABN?</p>}
          {fields}
          <Btn variant="sage" size="md" onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? "Checking…" : "Check my ABN"}
            {!busy && <Check className="w-4 h-4" />}
          </Btn>
        </div>
      )}

      {/* Outline only — date and outcome. No reason, no actor, no ABN (AC-P2-13). */}
      {!!trade?.history?.length && (
        <div className="border-t border-line pt-4">
          <p className="text-quiet t-label mb-2">History</p>
          <ul className="space-y-1">
            {trade.history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="text-body flex justify-between t-cap">
                <span>{h.at?.slice(0, 10)}</span>
                <span>{h.outcome === "approved" ? "Approved" : h.outcome === "rejected" ? "Not approved" : "Removed"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
