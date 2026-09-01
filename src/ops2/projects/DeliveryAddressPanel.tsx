import { useCallback, useEffect, useState } from "react";
import { IonButton, IonInput, IonSelect, IonSelectOption } from "@ionic/react";
import { OpenablePanel } from "../chrome/OpenablePanel";
import { SidePanel } from "../chrome/SidePanel";
import { AU_STATES } from "../../data/accountDetails";
import { deliveryAddressDoor, type RecordDelivery } from "./record";

/**
 * WHERE THE WINDOWS GO — the project's own delivery address.
 *
 * ── IT BELONGS TO THE PROJECT, NEVER TO THE ACCOUNT ─────────────────────────
 * Owner, 2026-09-01: "Account address is irrelevant — we're not delivering
 * anything to it. And what if there are 2 active orders, what is the account
 * address then?" An account has one address; a customer can have several live
 * projects shipping to several sites. So nothing here reads, prefills, or even
 * placeholders from `user.address_*`. A tradie's destination is their own
 * customer's site, different nearly every time, and a prefill that is wrong
 * nearly every time is worse than a blank field: it is wrong AND it stops the
 * field being read.
 *
 * ── A PARTIAL ADDRESS IS ORDINARY, NOT BROKEN ───────────────────────────────
 * The customer submission form still captures suburb and postcode only, so
 * line1/line2/state arrive NULL on every project until a staffer fills them in.
 * That is the common case for now. Absent parts simply do not render — no
 * marker, no badge, no warning colour, nothing that reads as an error.
 *
 * ── REPLACE-ONLY ────────────────────────────────────────────────────────────
 * A destination that exists cannot be blanked from this console (D14). Line 2
 * is the single exception, because "Unit 3" genuinely stops being true. A field
 * with nothing stored may be left empty and is simply omitted from the body.
 */
export function DeliveryAddressPanel({ projectId, delivery, onSaved }: {
  projectId: string;
  delivery: RecordDelivery;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ line1: "", line2: "", suburb: "", state: "", postcode: "" });
  /** ONE error slot — see DeliveryPricePanel: a refusal this panel decided and
   *  a save the server lost are the same sentence to the person reading it. */
  const [error, setError] = useState("");
  /** In-flight guard — see DeliveryPricePanel. Two overlapping PUTs can land
   *  out of order, and the address that sticks becomes whichever finished
   *  last rather than whichever was typed last. */
  const [saving, setSaving] = useState(false);

  /** Seeded from the PROJECT on open, and from nothing else. */
  useEffect(() => {
    if (!open) return;
    setForm({
      line1: delivery.line1 ?? "",
      line2: delivery.line2 ?? "",
      suburb: delivery.suburb ?? "",
      state: delivery.state ?? "",
      postcode: delivery.postcode ?? "",
    });
    setError("");
    setSaving(false);
  }, [open, delivery]);

  /** Focus the first field on open — SidePanel only transfers focus for its
   *  back form, and these panels use the default dismiss. Keyed to the
   *  control's own mount, the trigger SidePanel documents as the only one that
   *  actually fires. */
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
      if (el.querySelector("input") === document.activeElement) return;
      void el.setFocus();
      requestAnimationFrame(take);
    };
    requestAnimationFrame(take);
  }, []);

  const field = (key: keyof typeof form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError("");
  };

  /** The body carries only what CHANGED, so a save can never reach a column the
   *  staffer did not touch — and never an `amount` key, which belongs to a
   *  different panel and a different decision. */
  const changes = (): Record<string, string> | string => {
    const body: Record<string, string> = {};
    const pairs: [keyof typeof form, string | null, string][] = [
      ["line1", delivery.line1, "Address line 1"],
      ["suburb", delivery.suburb, "Suburb"],
      ["state", delivery.state, "State"],
      ["postcode", delivery.postcode, "Postcode"],
    ];
    for (const [key, stored, label] of pairs) {
      const value = form[key].trim();
      // Replace-only: a stored value may be changed but not removed.
      if (!value) {
        if (stored) return `${label} cannot be emptied — replace it instead.`;
        continue;
      }
      if (value !== (stored ?? "")) body[key] = value;
    }
    if (body.postcode && !/^\d{4}$/.test(body.postcode)) return "Enter a 4-digit postcode.";
    // Line 2 is the one field that can go away, because it genuinely can.
    const line2 = form.line2.trim();
    if (line2 !== (delivery.line2 ?? "")) body.line2 = line2;
    return body;
  };

  /** Computed during render so the control can be DISABLED when there is
   *  nothing to send, rather than enabled and then scolding the person who
   *  pressed it (03-ux.md § the no-op save). A refusal is different: an
   *  illegally emptied field still enables the button, because the message
   *  telling you why belongs to a press. */
  const draft = changes();
  const nothingToSave = typeof draft !== "string" && Object.keys(draft).length === 0;

  const save = async () => {
    if (saving || nothingToSave) return;
    const body = draft;
    if (typeof body === "string") { setError(body); return; }
    setError("");
    setSaving(true);
    const res = await fetch(`/api/ops/projects/${encodeURIComponent(projectId)}/delivery`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) { setError("That address was not saved. Try again."); return; }
    setOpen(false);
    onSaved();
  };

  // "Suburb STATE 3000" — one line, no commas, the way an address is written on
  // a parcel. Any part may be missing and the line closes up around it.
  const locality = [delivery.suburb, delivery.state, delivery.postcode].filter(Boolean).join(" ");
  const lines = [delivery.line1, delivery.line2, locality].filter(Boolean);

  return (
    <>
      <OpenablePanel
        title="Delivery address"
        testId="delivery-address"
        open={delivery.editable ? { label: deliveryAddressDoor, onOpen: () => setOpen(true) } : undefined}
      >
        {lines.length ? (
          <div data-testid="delivery-address-lines">
            {lines.map((line) => <div key={line}>{line}</div>)}
          </div>
        ) : (
          <div data-testid="delivery-address-lines">Not set</div>
        )}
      </OpenablePanel>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title="Delivery address"
        testId="delivery-address-sheet"
        phoneForm="side"
        footer={
          <>
            {error && (
              <p className="lp-mfr__failed" role="alert" data-testid="delivery-address-error">{error}</p>
            )}
            <IonButton expand="block" disabled={saving || nothingToSave} data-testid="delivery-address-confirm" onClick={save}>
              Save address
            </IonButton>
          </>
        }
      >
        <div className="lp-mfr">
          <IonInput ref={focusField} label="Address line 1" labelPlacement="stacked" maxlength={120}
            value={form.line1} data-testid="delivery-address-line1"
            onIonInput={(e) => field("line1")(String(e.detail.value ?? ""))} />
          <IonInput label="Address line 2" labelPlacement="stacked" maxlength={120}
            value={form.line2} data-testid="delivery-address-line2"
            onIonInput={(e) => field("line2")(String(e.detail.value ?? ""))} />
          <IonInput label="Suburb" labelPlacement="stacked" maxlength={80}
            value={form.suburb} data-testid="delivery-address-suburb"
            onIonInput={(e) => field("suburb")(String(e.detail.value ?? ""))} />
          <IonSelect label="State" labelPlacement="stacked" value={form.state}
            data-testid="delivery-address-state"
            onIonChange={(e) => field("state")(String(e.detail.value ?? ""))}>
            {/* The blank option exists only while nothing is stored — once a
                state is set, replace-only means there is nothing to go back to. */}
            {!delivery.state && <IonSelectOption value="">—</IonSelectOption>}
            {AU_STATES.map((code) => <IonSelectOption key={code} value={code}>{code}</IonSelectOption>)}
          </IonSelect>
          <IonInput label="Postcode" labelPlacement="stacked" inputMode="numeric" maxlength={4}
            value={form.postcode} data-testid="delivery-address-postcode"
            onIonInput={(e) => field("postcode")(String(e.detail.value ?? ""))} />
        </div>
      </SidePanel>
    </>
  );
}
