/* A small global store: selection is global (R-149), the index filter feeds
   the line scroller's run (R-155). Neither belongs to one page.

   NOTE — what used to be here and is not any more: `openLenses` / `lensesTouched`,
   the session memory R-48 needed so a section a reviewer opened or closed by hand
   stayed that way. Nothing is collapsible now, so there is no state to remember.
   The rule dies with the mechanism it governed, and that is a saving, not a
   regression. */
import { useEffect, useState, useSyncExternalStore } from "react";
import { LINES, type Line } from "./data";

export type Draft = { heightMm: number; widthMm: number; from: string } | null;

type S = {
  selectedId: string | null;
  filterUnpriced: boolean;
  /** ≥768: which line the docked editor holds open. Null = closed. */
  editing: string | null;
  /** R-50 — the unsaved figures the canvas plate must draw, and say it is
   *  drawing. Only ever set at ≥1280, where the plate is not covered. */
  draft: Draft;
};

let state: S = {
  selectedId: null, filterUnpriced: false, editing: null, draft: null,
};
const subs = new Set<() => void>();

export function setStore(patch: Partial<S>) {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
export function useStore(): S {
  return useSyncExternalStore(
    (cb) => (subs.add(cb), () => subs.delete(cb)),
    () => state
  );
}

/** R-155 — the filtered run the scroller moves through. */
export function visibleLines(filterUnpriced: boolean): Line[] {
  return filterUnpriced ? LINES.filter((l) => l.priceCents === null) : LINES;
}

/* ─────────────────────────────────────────────────────────────────────────────
   C1 — width, not device. The class is MEASURED, moment to moment, because the
   Fold 7 changes width mid-session with other apps beside it. Nothing in this
   mock branches on a media query or a user-agent.

     phone     < 768    plane stack
     tabletp   768–1023 one column, summoned rail, docked edit panel
     desktop  1024–1279 persistent rail, list + canvas, docked edit panel
     wide     ≥ 1280    as desktop, and the in-form drawing drops to xs (R-87)
   ───────────────────────────────────────────────────────────────────────── */
export type WidthClass = "phone" | "tabletp" | "desktop" | "wide";

function classify(w: number): WidthClass {
  if (w >= 1280) return "wide";
  if (w >= 1024) return "desktop";
  if (w >= 768) return "tabletp";
  return "phone";
}

export function useWidthClass(): WidthClass {
  const [wc, setWc] = useState(() => classify(window.innerWidth));
  useEffect(() => {
    const read = () => setWc(classify(window.innerWidth));
    const ro = new ResizeObserver(read);
    ro.observe(document.documentElement);
    window.addEventListener("resize", read);
    return () => { ro.disconnect(); window.removeEventListener("resize", read); };
  }, []);
  useEffect(() => { document.documentElement.dataset.widthClass = wc; }, [wc]);
  return wc;
}

/** Height is a first-class input too (LEARNINGS §1.9 / R-17.2). It changes what
 *  the plate COSTS, never whether it is there: below 700px of viewport height —
 *  a cover screen, or a phone with the keyboard up — the plate opens at `md`
 *  (188px) instead of the 248px hero. It is never the thing that starts hidden.
 *  Every phone is shorter than 900px, so the old 900px rule would have meant the
 *  highest-praised element in the product was never seen at rest. */
export function useShortViewport(): boolean {
  const read = () => window.innerHeight < 700;
  const [short, setShort] = useState(read);
  useEffect(() => {
    const on = () => setShort(read());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return short;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Can the editor be a PANE rather than an overlay?

   R-50 and R-87 both put the live-redraw editor at "≥1280, where the pane is a
   persistent column". That threshold was measured on a workspace WITHOUT the
   permanent navigation column ops2 now has, and it does not survive the addition:
   at 1440 with Ionic's split-pane side at its default 28% (403px), a 380px rail
   and a 520px panel, the canvas was left 137px — the plate the pane exists to
   keep visible could not be drawn at all.

   So the rule is kept and its threshold is MEASURED instead of asserted, which is
   what C1 asks for anyway: the editor is a pane exactly when the canvas can still
   hold a full `md` plate beside it. On the numbers below that lands at 1420px, so
   a 1440 laptop gets the pane and a 1280 one gets the overlay with R-51's in-form
   drawing — which is precisely the fallback R-51 was written for.
   ───────────────────────────────────────────────────────────────────────── */
const NAV_W = 260;        // ion-split-pane --side-width, pinned in ops2.css
const RAIL_EDITING = 300; // the rail's width while the editor holds a column
const PANE_W = 520;       // min(88vw, 520px), the frontpage's own cap
const CANVAS_MIN = 340;   // an md plate (242px) plus its gutters

export function useEditorPane(): boolean {
  const read = () =>
    window.innerWidth - NAV_W - RAIL_EDITING - PANE_W >= CANVAS_MIN;
  const [can, setCan] = useState(read);
  useEffect(() => {
    const on = () => setCan(read());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return can;
}

/* ─────────────────────────────────────────────────────────────────────────────
   THE TAB BAR — three variants, switchable, because "I won't know before I see
   it". Nothing here decides which one wins; it decides what each one costs.

     a    the bar is present everywhere, the action panel sits above it
     b    the bar is hidden on the record and line planes, where `< Projects`
          and `< Lines` are already the way out
     c    as (a), but the bar is compact — the same everywhere-ness at less height
     off  today's mock, for comparison

   Two attributes are written on <html> and everything else keys off them:
   `data-tabs` is the chosen variant, `data-tabbar` is whether a bar is ACTUALLY
   showing right now. The second is what the safe-area rule needs: when a bar is
   below the action panel, the BAR owns the home-indicator inset and the panel
   must not add a second one. Two stacked elements both padding for the same
   34px is the fiddly bit, and it is settled here rather than per component. */
export type TabVariant = "a" | "d" | "e" | "f" | "g" | "h" | "off";


export function useTabBar(): { variant: TabVariant; visible: boolean } {
  const wc = useWidthClass();
  const [variant, setV] = useState<TabVariant>(
    () => (localStorage.getItem("ops2-tabs") as TabVariant) || "a");

  useEffect(() => {
    const onVar = (e: Event) => setV((e as CustomEvent).detail as TabVariant);
    window.addEventListener("ops2-tabs", onVar as EventListener);
    return () => window.removeEventListener("ops2-tabs", onVar as EventListener);
  }, []);

  /* Desktop keeps the persistent left nav and never shows a bar. */
  const desktop = wc === "desktop" || wc === "wide";
  /* H replaces IonTabBar with its own strip, so the Ionic bar is not shown for
     it either. Everything else with tabs shows it. */
  const visible = !desktop && variant !== "off" && variant !== "h";

  useEffect(() => {
    document.documentElement.dataset.tabs = variant;
    document.documentElement.dataset.tabbar = visible ? "on" : "off";
  }, [variant, visible]);

  return { variant, visible };
}

export function setTabVariant(v: TabVariant) {
  localStorage.setItem("ops2-tabs", v);
  window.dispatchEvent(new CustomEvent("ops2-tabs", { detail: v }));
}

/* -----------------------------------------------------------------------------
   VARIANT D - the bar leaves on scroll down and returns on scroll up.

   WHOSE IS IT? Ionic has no scroll-away for the tab bar, so the COUPLING is
   ours. It needs no boundary disqualifier - nothing is rebuilt, the component is
   still IonTabBar untouched. What the boundary governs is WHERE the listening
   lives: disqualifier 4 keeps scroll in the shell, which is why R-18's plate
   pinning gets a shell channel rather than reaching for IonContent itself. This
   listens in the shell and no body knows it exists.

   -- THE BUG THIS REPLACES, because it is worth not repeating -----------------
   The first version listened for raw `scroll` in the capture phase and read
   `e.target.scrollTop`. ion-content scrolls inside its SHADOW DOM, and a scroll
   event crossing a shadow boundary is RETARGETED to the host - so `e.target` was
   always <ion-content>, whose own scrollTop is permanently 0. Every event
   therefore looked like "at the top", tripped the `y < 24` guard and told the bar
   to show. The bar never moved, and the +57px first reported came from measuring
   the two states directly rather than from a gesture that never fired.

   The fix is Ionic's published API. `ionScroll` is a Stencil @Event, so it
   bubbles AND is composed: it reaches a document listener with `detail.scrollTop`
   already resolved against the real inner scroller. No shadow root is touched.
   It only fires on an IonContent that opted in with `scrollEvents`, which the
   pages now do - the scaffold is theirs to opt in with (disqualifier 4 puts
   IonContent in the host, not the body).

   A plain-element fallback is kept for non-Ionic scrollers, and it takes the
   real target from composedPath()[0] rather than the retargeted e.target. */
export function useScrollAwayBar(active: boolean) {
  useEffect(() => {
    if (!active) {
      document.documentElement.dataset.tabhide = "off";
      return;
    }
    let last = 0;
    let hidden = false;
    document.documentElement.dataset.tabhide = "off";
    const set = (h: boolean) => {
      if (h === hidden) return;
      hidden = h;
      document.documentElement.dataset.tabhide = h ? "on" : "off";
    };
    const apply = (y: number, dy: number) => {
      /* Near the top the bar is always available: arriving at a screen must
         never require a scroll gesture to reach navigation. */
      if (y < 24) return set(false);
      /* 8px of deadband, so a thumb resting on the glass does not flicker it. */
      if (dy > 8) set(true);
      else if (dy < -8) set(false);
    };
    /* Ionic's own event. detail.scrollTop is the real offset; detail.deltaY is
       the movement since the last emission. */
    const onIonScroll = (e: Event) => {
      const d = (e as CustomEvent).detail as { scrollTop?: number; deltaY?: number } | null;
      if (!d || typeof d.scrollTop !== "number") return;
      const dy = typeof d.deltaY === "number" ? d.deltaY : d.scrollTop - last;
      last = d.scrollTop;
      apply(d.scrollTop, dy);
    };
    /* Anything that is not an ion-content. composedPath()[0] is the element that
       actually scrolled, before retargeting rewrote e.target. */
    const onRawScroll = (e: Event) => {
      const path = e.composedPath ? e.composedPath() : [];
      const t = (path[0] ?? e.target) as HTMLElement | null;
      if (!t || typeof t.scrollTop !== "number") return;
      if (t.tagName === "ION-CONTENT") return;   // ionScroll owns those
      const y = t.scrollTop;
      const dy = y - last;
      last = y;
      apply(y, dy);
    };
    document.addEventListener("ionScroll", onIonScroll);
    document.addEventListener("scroll", onRawScroll, true);
    return () => {
      document.removeEventListener("ionScroll", onIonScroll);
      document.removeEventListener("scroll", onRawScroll, true);
      document.documentElement.dataset.tabhide = "off";
    };
  }, [active]);
}


/* ─────────────────────────────────────────────────────────────────────────────
   THE HEADER TREATMENT — who gets the width, the back label or the title.

   His argument, which reframes it: in a strict hierarchy the back DESTINATION is
   structurally determined — from a line, back goes to the list; from the list, to
   the project. You cannot be surprised by it. What you cannot infer is WHICH
   project and WHICH line you are on. So the width should go to the non-inferable
   thing.

   That reverses his earlier lean ("We used `< Projects`… the earlier, if you ask
   me"), knowingly — he made the counter-argument himself. Both positions are in
   the spec so the reversal reads as a decision rather than drift.

     labelled  `< Projects` / `< Lines`. Two levels across two controls.
     bare      `<` alone, aria-label still naming the destination. Eye spends
               nothing; the screen reader still hears "Back to Lines".
     path      `<` bare, and the title carries the path: OF-Q-10482 > W04.

   Consistency holds in all three — the rule was one idiom, not one word. */
export type HeaderStyle = "labelled" | "bare" | "path";

export function useHeaderStyle(): HeaderStyle {
  const [hs, setHs] = useState<HeaderStyle>(
    () => (localStorage.getItem("ops2-hdr") as HeaderStyle) || "labelled");
  useEffect(() => {
    const on = (e: Event) => setHs((e as CustomEvent).detail as HeaderStyle);
    window.addEventListener("ops2-hdr", on as EventListener);
    return () => window.removeEventListener("ops2-hdr", on as EventListener);
  }, []);
  useEffect(() => { document.documentElement.dataset.hdr = hs; }, [hs]);
  return hs;
}

export function setHeaderStyle(v: HeaderStyle) {
  localStorage.setItem("ops2-hdr", v);
  window.dispatchEvent(new CustomEvent("ops2-hdr", { detail: v }));
}
