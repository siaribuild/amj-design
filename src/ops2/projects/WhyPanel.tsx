import { IonButton, IonSkeletonText } from "@ionic/react";
import { NOT_RECORDED, panelCopy, type PanelLine } from "./whyCopy";
import type { RationaleLoad } from "./useLineRationale";

/**
 * "WHY THIS PRODUCT" — three lines when the platform chose, two when a person
 * did, and never a fourth (R6).
 *
 * The words are all `./whyCopy.ts`'s; this file is placement. That split is what
 * makes R2's ban checkable without a browser, and it is why nothing here builds
 * a sentence — a string assembled in JSX is a string no node test can walk.
 *
 * ── THE DOOR IS A STRETCHED BUTTON, NOT A WRAPPING ONE ──────────────────────
 * A `<button>` around a `<dl>` is invalid HTML and flattens every term/value
 * pair into one accessible name, so the panel stays a `<section>` and the button
 * is positioned over it. The focus ring is drawn around the CARD rather than
 * around an invisible control.
 *
 * ── AND IT IS ALWAYS THERE (FB-AC-38, superseding WHY-AC-41) ────────────────
 * WHY-AC-41 gave a panel with no recorded run no control at all. The owner
 * reversed it — "for consistency and less 'what-if' scenarios in the code" —
 * and the detail behind the door names what was not recorded rather than
 * opening empty, which is what makes the door honest on every kind.
 *
 * The words still come from `panelCopy`, which is the one place that decides
 * what the door SAYS; this component has never decided whether it exists.
 */
export function WhyPanel({ load, onOpen, reload }: {
  load: RationaleLoad;
  /** Navigate to the detail. The panel does not know what that MEANS — the page
   *  owns the address, exactly the seam the drawing viewer already uses. */
  onOpen: () => void;
  reload: () => void;
}) {
  if (load.status === "missing") return null;

  if (load.status === "loading") {
    return (
      <section className="lp-panel" data-testid="line-why" aria-label="Why this product" aria-busy="true">
        <h2 className="lp-panel__title">Why this product</h2>
        {/* Three bars at the widths the three lines will occupy, so the page
            does not jump when the data lands. */}
        <div className="lp-why__skeleton">
          <IonSkeletonText animated style={{ width: "70%" }} />
          <IonSkeletonText animated style={{ width: "55%" }} />
          <IonSkeletonText animated style={{ width: "85%" }} />
        </div>
      </section>
    );
  }

  if (load.status === "error") {
    // NEVER "not recorded" HERE. A missing fact and an unreachable one are
    // different things and only one of them is worth retrying; saying the first
    // when the second happened would state something nobody established.
    return (
      <section className="lp-panel" data-testid="line-why" aria-label="Why this product">
        <h2 className="lp-panel__title">Why this product</h2>
        <p className="lp-why__error">The reasoning for this line could not be read just now.</p>
        <IonButton className="lp-why__retry" size="small" fill="outline" onClick={reload} data-testid="line-why-retry">
          Try again
        </IonButton>
      </section>
    );
  }

  const copy = panelCopy(load.dto);
  const body = (
    <>
      {/* THE HEAD IS ONE SHAPE NOW. Both branches of a `copy.door` test lived
          here — one with the chevron and one without — and the second carried a
          duplicate of this very `<h2>`. `panelCopy` returns a door on all four
          kinds since FB-AC-38, so the no-door branch was unreachable: exactly
          the "what-if scenario in the code" the owner's ruling removed, left
          behind by the ruling that removed it. */}
      <span className="lp-panel__head">
        <h2 className="lp-panel__title">Why this product</h2>
        <svg className="lp-panel__chev" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <dl className="lp-panel__lines">
        {copy.lines.map((line) => (
          <div key={line.k} className="lp-panel__line">
            <dt>{line.k}</dt>
            <dd><Value line={line} /></dd>
          </div>
        ))}
      </dl>
      {copy.foot && <p className="lp-panel__more" data-testid="line-why-foot">{copy.foot}</p>}
    </>
  );

  return (
    <section
      className="lp-panel lp-panel--door"
      data-testid="line-why"
      aria-label="Why this product"
    >
      <button
        type="button"
        className="lp-panel__door"
        data-testid="line-why-open"
        aria-label={copy.door}
        onClick={onOpen}
      />
      {body}
    </section>
  );
}

function Value({ line }: { line: PanelLine }) {
  if (line.units) {
    return (
      <>
        {line.units.map((u) => (
          <span key={u.code} className="lp-why__unit">
            <span className="lp-why__unit-code">{u.code}</span>
            <span className={u.figures === NOT_RECORDED ? "lp-why__fig ops2-absent" : "lp-why__fig"}>
              {u.figures}
            </span>
          </span>
        ))}
        {/* THE LAST ENTRY IN THIS VALUE, immediately beneath the units it
            continues — it arrives on the line rather than beside it, so there
            is nowhere else to put it (WHY-AC-37). */}
        {line.more && (
          <span className="lp-why__unit lp-why__more" data-testid="line-why-more">{line.more}</span>
        )}
      </>
    );
  }
  return (
    <>
      <span className={valueClass(line)}>{line.v}</span>
      {/* R12's qualifier rides on the figures line it explains — not a fourth
          line, not a badge (D20 keeps the three labels exactly as they are). */}
      {line.qualifier && <span className="lp-why__qual"> {line.qualifier}</span>}
      {line.origin && <span className="lp-why__origin">{line.origin}</span>}
    </>
  );
}

const valueClass = (line: PanelLine): string => {
  const classes = ["lp-why__fig"];
  if (line.absent) classes.push("ops2-absent");
  // `warn` in this console means "ours to resolve, the human proceeds". NEVER
  // attention/red: nothing on this surface is an error, least of all a person's
  // decision. Figures themselves are never coloured.
  if (line.tone === "warn") classes.push("lp-why__warn");
  if (line.tone === "absent") classes.push("ops2-absent");
  return classes.join(" ");
};
