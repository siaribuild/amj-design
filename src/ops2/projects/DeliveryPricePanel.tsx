import { useEffect, useState } from "react";
import { IonButton, IonInput } from "@ionic/react";
import { SidePanel } from "../chrome/SidePanel";

/**
 * THE DELIVERY PRICE, SET BY A HUMAN.
 *
 * The door is the totals card itself (`ProjectRecordPage`), not this file —
 * this is only what is behind it.
 *
 * ── ONE FIGURE, AND NO SECOND ONE ───────────────────────────────────────────
 * Owner's ruling, 2026-09-01: "single price, always. responsibility of ops to
 * ensure correctness." So there is no machine estimate beside the field, no
 * delta, no percentage, no "the table now says". If the postcode moves and the
 * zone with it, the settled figure stays exactly where a person put it and
 * nobody is prompted. The legacy console shows a delta; this deliberately does
 * not, and that is not an omission to be helpfully restored.
 *
 * ── AND NO TAX WORDING, ANYWHERE ────────────────────────────────────────────
 * `PricePanel.tsx` is this file's mechanical template, but its entry-basis
 * segment is the one part that must NOT be copied. That control describes what
 * a supplier quoted; this is an ops figure being displayed, and ops has one way
 * of showing figures. The stored column is already tax-inclusive, so the
 * staffer types what the customer is charged and the field says nothing about
 * tax — because no figure in this console ever does. A bundle-wide grep
 * enforces it.
 *
 * ── IT CANNOT UN-SETTLE ─────────────────────────────────────────────────────
 * `delivery_amount = NULL` is the issue gate, and the endpoint still accepts
 * null so the legacy console can re-arm it. Nothing HERE can: there is no clear
 * control, and an empty field is refused rather than sent. The body this panel
 * builds is always `{ amount: <number> }`.
 */
export function DeliveryPricePanel({ projectId, amount, open, onClose, onSaved }: {
  projectId: string;
  /** The settled figure, or `null` for not settled. `0` is settled. */
  amount: number | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [typed, setTyped] = useState("");
  /** ONE error slot. A refusal this panel decided and a save the server lost
   *  are both "the price did not go in", they clear at the same two moments,
   *  and they render the same line — two states said one thing twice. */
  const [error, setError] = useState("");

  /** Seeded when the panel OPENS, not when it closes: a panel that tidies
   *  itself afterwards is still holding the last figure while it animates away,
   *  and the record page can put a different project behind the same mounted
   *  panel. A settled figure prefills so a correction is an edit; an unsettled
   *  one starts empty — never "0.00", which would be a price nobody chose. */
  useEffect(() => {
    if (!open) return;
    setTyped(amount == null ? "" : amount.toFixed(2));
    setError("");
  }, [open, amount]);

  const save = async () => {
    const trimmed = typed.trim();
    const value = Number(trimmed);
    // Refused HERE, with no request: an empty field is not a zero, and the one
    // thing this panel must never do is send something that un-settles.
    if (!trimmed || !Number.isFinite(value) || value < 0) {
      setError("Enter the delivery price — 0 or more.");
      return;
    }
    setError("");
    const res = await fetch(`/api/ops/projects/${encodeURIComponent(projectId)}/delivery`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: value }),
    }).catch(() => null);
    // A price that silently does not save is the worst failure available here:
    // the panel would close on a figure that never landed, and delivery is the
    // gate the whole quote is waiting on.
    if (!res || !res.ok) { setError("That price was not saved. Try again."); return; }
    onClose();
    onSaved();
  };

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Delivery price"
      testId="delivery-price-sheet"
      // A price you go in to set is a screen, not a phone gesture.
      phoneForm="side"
      footer={
        <>
          {error && (
            <p className="lp-mfr__failed" role="alert" data-testid="delivery-price-error">{error}</p>
          )}
          <IonButton expand="block" data-testid="delivery-price-confirm" onClick={save}>
            Save delivery price
          </IonButton>
        </>
      }
    >
      <div className="lp-mfr">
        <IonInput
          label="Delivery price"
          labelPlacement="stacked"
          type="number"
          inputMode="decimal"
          value={typed}
          data-testid="delivery-price-figure"
          onIonInput={(e) => { setTyped(String(e.detail.value ?? "")); setError(""); }}
        />
      </div>
    </SidePanel>
  );
}
