import { useState } from "react";
import { IonButton, IonInput, IonSegment, IonSegmentButton, IonLabel } from "@ionic/react";
import { OpenablePanel } from "../chrome/OpenablePanel";
import { SidePanel } from "../chrome/SidePanel";
import {
  DEFAULT_UPLIFT_PCT, manufacturerExGst, upliftedLineTotal, type EntryBasis,
} from "../../data/manufacturerPrice";
import { money as whole } from "./record";

/**
 * THE PRICE PANEL, AND THE CALCULATOR BEHIND IT.
 *
 * Ops gets a price per line from the manufacturer and has to reach a customer
 * price from it. Before this the only way in was to do the margin arithmetic by
 * hand and type the finished number — so the panel exists to save reaching for
 * a calculator, and for nothing else.
 *
 * ── IT KEEPS NOTHING ────────────────────────────────────────────────────────
 * The manufacturer's figure and the uplift are not stored (owner, 2026-08-31:
 * "it's one price per line — price"). They are the working on the way to a
 * number, and the number is the fact. So this panel writes `line_total` through
 * the SAME endpoint a typed override uses, and a line priced here is
 * indistinguishable from any other priced line — a price is a price.
 *
 * That is also why re-opening starts empty: there is nothing to prefill,
 * because nothing was kept.
 *
 * The arithmetic lives in `src/data/manufacturerPrice.ts` rather than here, so
 * the figure shown while typing and the figure committed are the same function.
 */

/** THE SWITCH SAYS "TAX", NEVER THE THREE LETTERS. The owner's standing ruling
 *  for this console is that it references no tax name anywhere, because ex/inc
 *  is a CUSTOMER ACCOUNT's display preference and ops2 has no account to read
 *  one from (ops2-record.test.mjs greps for it). That rationale is about how
 *  prices are DISPLAYED; this control is about what a supplier quoted, which is
 *  a different question and one the owner asked for — so the fact is stated and
 *  the banned word is not.
 */

/** Cents, unlike `record.ts`'s whole-dollar `money()` — this is the one ops
 *  surface where the arithmetic has to add up on screen. */
const money = (n: number) =>
  `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "No rate" is what an unpriced line says everywhere in this console — never
 *  $0, which is a priced-at-nothing claim about work nobody has costed. One
 *  place decides it. */
const priceText = (n: number | null) => (n == null ? "No rate" : money(n));

/** The form's initial value AND its reset, so the two cannot drift apart. */
const FRESH = {
  typed: "",
  uplift: String(DEFAULT_UPLIFT_PCT),
  basis: "ex" as EntryBasis,
  failed: false,
};

export function PricePanel({ line, reload, editable }: {
  line: { id: string; code: string; lineTotal: number | null };
  reload: () => void;
  /** Whether this line can actually be repriced. A door onto a screen whose
   *  Confirm can never succeed is worse than no door: the endpoint refuses a
   *  composite parent outright (its total is the sum of its segments) and finds
   *  no line at all once a quote is issued. `OpenablePanel` takes openability
   *  as the PRESENCE of `open`, so a non-editable line simply gets the static
   *  panel it had before this feature — no chevron, no tab stop. */
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(FRESH);
  const { typed, uplift, basis, failed } = form;
  /** Cleared on OPEN, never on close: a panel that tidies itself afterwards is
   *  still holding the previous line's figures in the meantime, and the record
   *  page's canvas can put a different line behind the same mounted panel.
   *  The reset IS the initial value, so the two cannot drift apart. */
  const openFresh = () => { setForm(FRESH); setOpen(true); };

  const price = Number(typed);
  // `Number("")` is 0, so an emptied uplift field would silently mean "no
  // uplift" and let Confirm through. Absence is not zero on either field.
  const pct = uplift.trim() === "" ? NaN : Number(uplift);
  const exPrice = price > 0 && pct >= 0 ? manufacturerExGst(price, basis) : null;
  const total = exPrice == null ? null : upliftedLineTotal(exPrice, pct);

  const confirm = async () => {
    if (total == null) return;
    setForm((f) => ({ ...f, failed: false }));
    // The existing override endpoint (0046). Nothing new is needed: the
    // calculator's result IS a price a human decided, which is exactly what
    // that endpoint records — inline fetch because ops2 has no client module
    // and every other surface here calls the API the same way.
    const res = await fetch(`/api/ops/lines/${encodeURIComponent(line.id)}/price`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total }),
    }).catch(() => null);
    // A pricing action that silently does not save is the worst of the failure
    // modes available here: the panel would close on a price that never landed.
    if (!res || !res.ok) { setForm((f) => ({ ...f, failed: true })); return; }
    setOpen(false);
    reload();
  };

  return (
    <>
      <OpenablePanel
        title="Price"
        testId="line-price"
        open={editable ? { label: "Set this line's price", onOpen: openFresh } : undefined}
      >
        <dl className="lp-panel__lines">
          <div className="lp-panel__line">
            {/* NEVER $0. An opening nobody has priced is the thing this console
                exists to find, and a zero is a priced-at-nothing claim about
                work nobody has costed. */}
            <dd>{line.lineTotal == null ? "No rate" : whole(line.lineTotal)}</dd>
          </div>
        </dl>
      </OpenablePanel>

      <SidePanel open={open} onClose={() => setOpen(false)}
        title="Set this line's price" testId="line-price-sheet"
        // A price you go in to set is a screen, not a phone gesture — it comes
        // from the right at every width, the way the Why detail does.
        phoneForm="side"
        footer={
          <>
            <div className="lp-mfr__readback" aria-live="polite" data-testid="line-price-readback">
              <span>{line.code} becomes</span>
              <span>
                {total != null && line.lineTotal != null && <s>{money(line.lineTotal)}</s>}
                <b>{priceText(total ?? line.lineTotal)}</b>
              </span>
            </div>
            {failed && (
              <p className="lp-mfr__failed" role="alert" data-testid="line-price-failed">
                That price was not saved. Try again.
              </p>
            )}
            <IonButton expand="block" disabled={total == null}
              data-testid="line-price-confirm" onClick={confirm}>
              Confirm this price
            </IonButton>
          </>
        }>
        <div className="lp-mfr">
          <span className="lp-mfr__label">Manufacturer's price is</span>
          <IonSegment value={basis} scrollable={false}
            onIonChange={(e) => setForm((f) => ({ ...f, basis: (e.detail.value as EntryBasis) ?? "ex" }))}>
            <IonSegmentButton value="ex" data-testid="line-price-basis-ex">
              <IonLabel>excludes tax</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="inc" data-testid="line-price-basis-inc">
              <IonLabel>includes tax</IonLabel>
            </IonSegmentButton>
          </IonSegment>

          <div className="lp-mfr__pair">
            <IonInput label="Manufacturer's price" labelPlacement="stacked" type="number"
              inputMode="decimal" placeholder="0.00" value={typed}
              data-testid="line-price-figure"
              onIonInput={(e) => setForm((f) => ({ ...f, typed: String(e.detail.value ?? "") }))} />
            <IonInput label="Uplift %" labelPlacement="stacked" type="number"
              inputMode="decimal" value={uplift}
              data-testid="line-price-uplift"
              onIonInput={(e) => setForm((f) => ({ ...f, uplift: String(e.detail.value ?? "") }))} />
          </div>

          {/* The working, shown only once it is real. Before that the space
              holds its height with a sentence so nothing jumps when it lands. */}
          {total != null ? (
            <div className="lp-mfr__work" aria-live="polite" data-testid="line-price-work">
              <div><span>Their price</span><span>{money(exPrice!)}</span></div>
              <div><span>+ {pct}% uplift</span><span>{money(total - exPrice)}</span></div>
              <div className="lp-mfr__total"><span>{line.code} price</span><span>{money(total)}</span></div>
            </div>
          ) : (
            <p className="lp-mfr__empty">The arithmetic appears here once you enter their figure.</p>
          )}

          <p className="lp-mfr__note">
            Confirming does not change the project's “waiting on the manufacturer”
            state — that is set on Progress.
          </p>
        </div>

      </SidePanel>
    </>
  );
}
