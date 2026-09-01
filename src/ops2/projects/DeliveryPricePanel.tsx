import { useCallback, useEffect, useState } from "react";
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
  /** In-flight guard. Without it a second click on a slow network starts a
   *  second PUT: the two can land out of order, so the figure the customer is
   *  charged becomes whichever request happened to finish last rather than
   *  whichever the staffer typed last, and the audit log grows a duplicate
   *  saying a price was set twice. On a money path that is not a nicety. */
  const [saving, setSaving] = useState(false);

  /** Seeded when the panel OPENS, not when it closes: a panel that tidies
   *  itself afterwards is still holding the last figure while it animates away,
   *  and the record page can put a different project behind the same mounted
   *  panel. A settled figure prefills so a correction is an edit; an unsettled
   *  one starts empty — never "0.00", which would be a price nobody chose. */
  useEffect(() => {
    if (!open) return;
    setTyped(amount == null ? "" : amount.toFixed(2));
    setError("");
    setSaving(false);
  }, [open, amount]);

  /** FOCUS ON THE FIELD, not on the card behind the modal. SidePanel transfers
   *  focus only for its back form; these panels use the default dismiss, so
   *  without this a keyboard user opens the panel and focus stays on the
   *  stretched card button underneath — which, as SidePanel's own header
   *  records, can also swallow Escape. The trigger is the CONTROL'S OWN MOUNT
   *  for the same reason documented there: no present event fires. */
  const focusField = useCallback((el: HTMLIonInputElement | null) => {
    if (!el) return;
    // FOCUS THE FIELD, NOT THE CARD BEHIND THE MODAL. SidePanel transfers focus
    // only for its back form; these panels use the default dismiss, so without
    // this a keyboard user opens the panel and focus stays on the stretched
    // card button underneath — which, as SidePanel's header records, can also
    // swallow Escape.
    //
    // The trigger is the control's own MOUNT, for the reason documented there:
    // no present event fires. But mount is earlier than presentation, and
    // `setFocus()` on an unpresented overlay is a no-op — so it retries by
    // frame until it takes. Bounded at 20 frames (~a third of a second): if the
    // panel never presents, this stops rather than spinning.
    let frames = 0;
    const take = () => {
      if (!el.isConnected || frames++ > 20) return;
      // STOP AS SOON AS THE PANEL HAS FOCUS — and stop if anything else took
      // it. `contains` rather than node identity so this holds however the
      // input is composed, and the second clause means a staffer who tabs or
      // dismisses inside the retry window is not dragged back.
      const active = document.activeElement;
      if (el.contains(active)) return;
      if (active && active !== document.body && !el.contains(active)) return;
      void el.setFocus();
      requestAnimationFrame(take);
    };
    requestAnimationFrame(take);
  }, []);

  const trimmed = typed.trim();
  /** ROUNDED TO CENTS BEFORE IT IS ANYTHING ELSE. A price is a number of cents;
   *  `250.123` is not one. Left raw it also broke the unchanged check both
   *  ways — the field prefills with `toFixed(2)`, so a stored `250.123` came
   *  back as `250.12`, the panel read that as an edit, and pressing save
   *  rewrote the settle stamps and logged a repricing nobody performed. */
  const value = Math.round(Number(trimmed) * 100) / 100;
  /** UNCHANGED IS NOT A SAVE. Pressing Save on a settled figure nobody edited
   *  would rewrite `delivery_settled_at`, `delivery_settled_by` and the machine
   *  snapshot, and log "set delivery to $X" — commercial history recording a
   *  repricing that did not happen. The control is disabled instead. */
  const unchanged = amount != null && trimmed !== "" && Number.isFinite(value) && value === amount;

  const save = async () => {
    if (saving || unchanged) return;
    // Refused HERE, with no request: an empty field is not a zero, and the one
    // thing this panel must never do is send something that un-settles.
    if (!trimmed || !Number.isFinite(value) || value < 0) {
      setError("Enter the delivery price — 0 or more.");
      return;
    }
    setError("");
    setSaving(true);
    const res = await fetch(`/api/ops/projects/${encodeURIComponent(projectId)}/delivery`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: value }),
    }).catch(() => null);
    // A price that silently does not save is the worst failure available here:
    // the panel would close on a figure that never landed, and delivery is the
    // gate the whole quote is waiting on.
    setSaving(false);
    // 409 IS NOT TRANSIENT. It means a colleague issued the quote while this
    // panel was open, so the project is locked and every retry must fail —
    // inviting one would be a lie. Close and re-read instead, which is what the
    // record page already does with a conflict.
    if (res && res.status === 409) {
      // Only a LOCKED project is permanent. A destination moved by a colleague
      // is recoverable, so the panel keeps the figure that was typed rather
      // than discarding a staffer's work — pressing again re-prices against
      // the new address.
      const body = await res.json().catch(() => null);
      if (body?.error === "destination_changed") {
        setError("The delivery address changed while this was open. Press save again to price it.");
        return;
      }
      onClose(); onSaved(); return;
    }
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
          <IonButton expand="block" disabled={saving || unchanged} data-testid="delivery-price-confirm" onClick={save}>
            Save delivery price
          </IonButton>
        </>
      }
    >
      <div className="lp-mfr">
        <IonInput
          ref={focusField}
          label="Delivery price"
          labelPlacement="stacked"
          type="number"
          inputMode="decimal"
          value={typed}
          // FROZEN WHILE SAVING. The body is captured at the press; a figure
          // typed after that would be silently discarded when the response
          // closes the panel, and the customer charged the older one.
          disabled={saving}
          data-testid="delivery-price-figure"
          onIonInput={(e) => { setTyped(String(e.detail.value ?? "")); setError(""); }}
        />
      </div>
    </SidePanel>
  );
}
