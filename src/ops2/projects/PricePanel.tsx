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

export function PricePanel({ line, reload }: {
  line: { id: string; code: string; lineTotal: number | null };
  reload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [uplift, setUplift] = useState(String(DEFAULT_UPLIFT_PCT));
  const [basis, setBasis] = useState<EntryBasis>("ex");
  /** Cleared on OPEN, never on close: a panel that tidies itself afterwards is
   *  still holding the previous line's figures in the meantime, and the record
   *  page's canvas can put a different line behind the same mounted panel. */
  const openFresh = () => {
    setTyped("");
    setUplift(String(DEFAULT_UPLIFT_PCT));
    setBasis("ex");
    setOpen(true);
  };

  const price = Number(typed);
  const pct = Number(uplift);
  const exPrice = price > 0 && pct >= 0 ? manufacturerExGst(price, basis) : null;
  const total = exPrice == null ? null : upliftedLineTotal(exPrice, pct);

  const confirm = async () => {
    if (total == null) return;
    // The existing override endpoint (0046). Nothing new is needed: the
    // calculator's result IS a price a human decided, which is exactly what
    // that endpoint records — inline fetch because ops2 has no client module
    // and every other surface here calls the API the same way.
    const res = await fetch(`/api/ops/lines/${encodeURIComponent(line.id)}/price`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total }),
    });
    if (!res.ok) return;
    setOpen(false);
    reload();
  };

  return (
    <>
      <OpenablePanel
        title="Price"
        testId="line-price"
        open={{ label: "Set this line's price", onOpen: openFresh }}
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
        footer={
          <>
            <div className="lp-mfr__readback" aria-live="polite" data-testid="line-price-readback">
              <span>{line.code} becomes</span>
              <span>
                {total != null && line.lineTotal != null && <s>{money(line.lineTotal)}</s>}
                <b>{money(total ?? line.lineTotal ?? 0)}</b>
              </span>
            </div>
            <IonButton expand="block" disabled={total == null}
              data-testid="line-price-confirm" onClick={confirm}>
              Confirm this price
            </IonButton>
          </>
        }>
        <div className="lp-mfr">
          <span className="lp-mfr__label">Manufacturer's price is</span>
          <IonSegment value={basis} scrollable={false}
            onIonChange={(e) => setBasis((e.detail.value as EntryBasis) ?? "ex")}>
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
              onIonInput={(e) => setTyped(String(e.detail.value ?? ""))} />
            <IonInput label="Uplift %" labelPlacement="stacked" type="number"
              inputMode="decimal" value={uplift}
              data-testid="line-price-uplift"
              onIonInput={(e) => setUplift(String(e.detail.value ?? ""))} />
          </div>

          {/* The working, shown only once it is real. Before that the space
              holds its height with a sentence so nothing jumps when it lands. */}
          {total != null && exPrice != null ? (
            <div className="lp-mfr__work" aria-live="polite" data-testid="line-price-work">
              <div><span>Their price</span><span>{money(exPrice)}</span></div>
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
