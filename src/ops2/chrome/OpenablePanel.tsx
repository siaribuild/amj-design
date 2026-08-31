import type { ReactNode } from "react";

/**
 * A PANEL THAT MIGHT BE A DOOR — ops2 chrome (ADR 0016).
 *
 * Two rules a caller cannot get wrong from here, because this file owns them:
 *
 * 1. The button is a SIBLING of the content, never its parent. A `<button>`
 *    around a `<dl>` is invalid HTML and flattens every term/value pair into
 *    one accessible name, so the panel stays a `<section>` with the button
 *    stretched over it and the focus ring drawn around the card.
 * 2. Openability is the PRESENCE of `open`, not a flag. No `openable` boolean,
 *    no default destination, no chevron on a panel that opens nothing.
 *
 * The component never knows an address — it is handed a closure and a name;
 * the page composes the destination from its own resolved record.
 */
export function OpenablePanel({ title, testId, busy, open, children }: {
  /** The `<h2>` text AND the section's accessible name — one fact, one prop. */
  title: string;
  /** The door's test id is derived (`${testId}-open`), so a second consumer
   *  cannot name it differently. */
  testId: string;
  busy?: boolean;
  /** `label` must state the DESTINATION rather than merely that the panel is
   *  pressable, and comes from the surface's copy module — never a string
   *  typed at the call site. */
  open?: { label: string; onOpen: () => void };
  children: ReactNode;
}) {
  return (
    <section
      className={open ? "lp-panel lp-panel--door" : "lp-panel"}
      data-testid={testId}
      aria-label={title}
      aria-busy={busy ? "true" : undefined}
    >
      {/* THE CHEVRON PRECEDES THE BUTTON so the stretched button paints above
          it and "click anywhere" needs no `pointer-events` rule. */}
      {open && (
        <>
          <svg className="lp-panel__chev" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <button
            type="button"
            className="lp-panel__door"
            data-testid={`${testId}-open`}
            aria-label={open.label}
            onClick={open.onOpen}
          />
        </>
      )}
      <h2 className="lp-panel__title">{title}</h2>
      {children}
    </section>
  );
}
