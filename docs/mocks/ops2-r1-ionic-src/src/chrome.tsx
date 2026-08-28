// ═══════════════════════════════════════════════════════════════════════════════
// THE BOTTOM-EDGE CONTENTION — every resolution, so it can be chosen by looking
//
// The tab bar and the primary action both want the bottom edge. These are the
// resolutions, each built rather than argued:
//
//   A    bar everywhere, CTA in a panel above it            (the baseline)
//   D    A, plus the bar leaves on scroll down              (reclaims 57px)
//   E    CTA moves to the HEADER, bar keeps the bottom      (the native split)
//   F    CTA becomes a docked FAB above the bar             (Material's answer)
//   G    no persistent CTA on the line at all               (does it dissolve?)
//   H    one bottom app bar carrying places AND a verb      (the hybrid)
//   OFF  no tabs                                            (today)
//
// Each has a cost and none of them is free. What each one gives up is written
// where it is built, not summarised away.
// ═══════════════════════════════════════════════════════════════════════════════
import { IonButton, IonButtons, IonFab, IonFabButton, IonIcon, IonLabel } from "@ionic/react";
import {
  createOutline, ellipsisHorizontal, gridOutline, layersOutline,
  chatbubbleEllipsesOutline, documentTextOutline,
} from "ionicons/icons";
import type { TabVariant } from "./store";

/** Which variants put a persistent action panel on the bottom edge. */
export const hasBottomPanel = (v: TabVariant, screen: "line" | "record") =>
  v === "a" || v === "d" || v === "off" || (v === "g" && screen === "record");

/** Which put the action in the header's trailing slot. */
export const hasHeaderCta = (v: TabVariant) => v === "e";

/** Which float it above the bar. */
export const hasFab = (v: TabVariant) => v === "f";

/** H replaces IonTabBar entirely with a bespoke strip. */
export const isBottomAppBar = (v: TabVariant) => v === "h";

/* ── E — the CTA in the header ────────────────────────────────────────────────
   The dominant native split: the nav bar is what you can DO here, the tab bar is
   where you can GO. It is also the only resolution that leaves the bottom edge
   entirely to navigation.

   WHAT IT COSTS, stated rather than absorbed:
   • On the LINE the header already carries back (52px), the title, and the
     prev/next pair (96px). Adding a labelled action leaves the title ~110px at
     375, so it truncates earlier than anywhere else in the app. The title is the
     one thing here that was already allowed to truncate (§16.2), so it is the
     right thing to spend — but it is a real loss, not a free lunch.
   • On the RECORD the action is `Issue quote` and it is BLOCKED, and R-153 calls
     the footer "the ONE footer allowed a second line" precisely because a blocked
     primary must say why. A header cannot carry that sentence. So E has to put
     the reason back somewhere, and it becomes a slim third bar — the header grows
     by ~28px while the 75px panel goes, which is still a net gain, but the
     "header stays 56px" property from §16 is gone on the record. */
export function HeaderCta({ label, onClick, disabled }: {
  label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <IonButtons slot="end">
      <IonButton onClick={onClick} disabled={disabled}
        className={disabled ? "inert hdr-cta" : "hdr-cta"}>
        {label}
      </IonButton>
    </IonButtons>
  );
}

/* ── F — the docked FAB ───────────────────────────────────────────────────────
   Material's answer, and it is the only one that costs the bottom edge nothing:
   the FAB floats over content rather than reserving a band.

   WHERE IT BREAKS, and it is rendered on the record so the break is visible
   rather than described:
   • `Edit W04` is icon-able — a pencil says it. `Issue quote` is NOT. The record's
     FAB below carries a document icon that could equally mean "save", "export" or
     "new", and its meaning has to be learned rather than read.
   • A blocked primary cannot state its reason. The FAB can be disabled, but "2
     lines have no rate" has nowhere to live, so the record keeps a reason line
     under the header — the same concession E makes.
   • Material says one FAB per screen, so the secondary actions (`···`) cannot sit
     beside it. They move to the header's trailing slot.
   • It covers content. At the bottom-right it sits over the last list row, which
     on the record is a line and on the line plane is the customer's note. */
export function ActionFab({ label, icon, onClick, disabled }: {
  label: string; icon?: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <IonFab slot="fixed" vertical="bottom" horizontal="end" className="ctafab">
      <IonFabButton onClick={onClick} disabled={disabled} aria-label={label}>
        <IonIcon icon={icon ?? createOutline} aria-hidden="true" />
      </IonFabButton>
    </IonFab>
  );
}

/* ── H — one bottom app bar carrying places and a verb ────────────────────────
   THE COMPONENT CHECK, honestly. Ionic has no bottom-app-bar-with-FAB primitive,
   so this is `IonToolbar` in a footer slot with `IonButtons` — real Ionic
   components, but assembled by us into a pattern Ionic does not ship.
   No boundary disqualifier is engaged, because nothing is being REPLACED: the
   four disqualifiers govern choosing light-DOM over an existing Ionic component,
   and there is no Ionic component for this.

   WHAT IT ACTUALLY GIVES UP, which is the real objection:
   • It is not `IonTabBar`, so it loses everything IonTabBar was chosen for — the
     selected state, the per-tab stacks, and the lossless return that killed
     variant B. Those would all have to be rebuilt by hand.
   • LEGIBILITY: mixing places and verbs in one strip makes every element
     ambiguous about which it is. Three icons that navigate and one that acts,
     with nothing but shape to tell them apart, is a row where the user must
     remember rather than read. The divider below helps and does not solve it. */
export function BottomAppBar({ activeTab, onGo, action }: {
  activeTab: string;
  onGo: (tab: string) => void;
  action?: { label: string; icon?: string; onClick: () => void; disabled?: boolean };
}) {
  const tabs = [
    { key: "dashboard", icon: gridOutline, label: "Dashboard" },
    { key: "projects", icon: layersOutline, label: "Projects" },
    { key: "enquiries", icon: chatbubbleEllipsesOutline, label: "Enquiries" },
    { key: "more", icon: ellipsisHorizontal, label: "More" },
  ];
  return (
    <div className="bottomappbar">
      <div className="bab-places" role="tablist" aria-label="Destinations">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab"
            aria-selected={activeTab === t.key} aria-label={t.label}
            onClick={() => onGo(t.key)}>
            <IonIcon icon={t.icon} aria-hidden="true" />
            <IonLabel>{t.label}</IonLabel>
          </button>
        ))}
      </div>
      {action && (
        <>
          {/* The divider is the only thing separating a place from a verb. */}
          <span className="bab-split" aria-hidden="true" />
          <button type="button" className="bab-action" onClick={action.onClick}
            disabled={action.disabled} aria-label={action.label}>
            <IonIcon icon={action.icon ?? createOutline} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}

export const CTA_ICONS = { edit: createOutline, issue: documentTextOutline };
