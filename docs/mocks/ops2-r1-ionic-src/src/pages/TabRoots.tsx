// The two tab roots that did not exist before the tab bar needed them.
// Deliberately thin — they are here so the bar has somewhere real to go and so
// the variants can be judged on a live stack, not so this pass designs them.
import { useState } from "react";
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem,
  IonLabel, IonBadge, IonNote, IonListHeader, IonButton, IonButtons, IonIcon,
  IonSegment, IonSegmentButton, IonSearchbar,
} from "@ionic/react";
import { searchOutline, funnelOutline } from "ionicons/icons";
import { useHistory } from "react-router-dom";
import { PROJECTS, RECORD } from "../data";
import { Money } from "../ui";

/** D12 — the attention surface: what needs a person, and what is critically
 *  wrong in the catalogue. Explicitly not a metrics page. */
export function DashboardPage() {
  const history = useHistory();
  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>Dashboard</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent scrollEvents>
        <IonList lines="full">
          <IonListHeader><IonLabel>Needs us</IonLabel></IonListHeader>
          <IonItem button detail={false} onClick={() => history.push("/projects/record/OF-Q-10482")}>
            <IonLabel className="ion-text-wrap">
              <strong>2 projects waiting on us</strong>
              <p>Oldest 3 days · {RECORD.title}</p>
            </IonLabel>
            <IonBadge color="warning" slot="end">2</IonBadge>
          </IonItem>
          <IonItem button detail={false} onClick={() => history.push("/projects")}>
            <IonLabel className="ion-text-wrap">
              <strong>4 lines with no rate</strong>
              <p>Across 2 projects</p>
            </IonLabel>
            <IonBadge color="warning" slot="end">4</IonBadge>
          </IonItem>
          <IonItem button detail={false}>
            <IonLabel className="ion-text-wrap">
              <strong>Delivery is unpriced on every zone</strong>
              <p>15 zones configured, none with rates</p>
            </IonLabel>
            <IonBadge color="danger" slot="end">15</IonBadge>
          </IonItem>
          <IonListHeader><IonLabel>Catalogue</IonLabel></IonListHeader>
          <IonItem button detail={false}>
            <IonLabel className="ion-text-wrap">
              <strong>3 products missing pricing</strong>
              <p>They cannot be recommended until they price</p>
            </IonLabel>
            <IonBadge color="warning" slot="end">3</IonBadge>
          </IonItem>
        </IonList>
        <div className="section">
          <IonNote className="fact basis">
            What needs doing, or is critically wrong. Not a metrics page — money
            made is not on it by design.
          </IonNote>
        </div>
      </IonContent>
    </IonPage>
  );
}

/** Enquiries — the pre-account concept CONTEXT.md keeps separate from Project on
 *  purpose. "enquiry" is on Project's _Avoid_ line precisely because it is not a
 *  synonym for one, which is what makes it a legitimate sibling tab. */
export function EnquiriesPage() {
  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>Enquiries</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent scrollEvents>
        <IonList lines="full">
          {[
            { who: "Dan Whelan", what: "Showroom visit — Frankston", when: "Today 08:41", state: "new" },
            { who: "Priya Nair", what: "Asked about bi-fold sizes", when: "Yesterday", state: "new" },
            { who: "Salt & Co Builders", what: "Wants a trade account", when: "Mon", state: "answered" },
          ].map((e) => (
            <IonItem key={e.who} button detail={false}>
              <IonLabel className="ion-text-wrap">
                <strong>{e.who}</strong>
                <p>{e.what} · {e.when}</p>
              </IonLabel>
              {e.state === "new" && <IonBadge color="warning" slot="end">new</IonBadge>}
            </IonItem>
          ))}
        </IonList>
        <div className="section">
          <IonNote className="fact basis">
            Enquiries are pre-account: nobody here has a project yet. An enquiry
            that becomes one stops being an enquiry.
          </IonNote>
        </div>
      </IonContent>
    </IonPage>
  );
}

/* Two axes, because they answer different questions. WHO IS WAITING is the
   queue's reason for existing and lives in the segment, always visible.
   Everything else is a refinement and lives behind the funnel, which shows
   how many are on - hidden filter state is how an empty list gets misread. */
type WaitFilter = "all" | "us" | "customer" | "nobody";
type ExtraFilter = "unpriced" | "production";
type ProjectRow = {
  ref: string; title: string; customer: string; phase: string;
  waitingOn: "us" | "customer" | "nobody"; totalCents: number | null;
  lineCount: number; daysInStage: number; unpricedCount: number; flagged: boolean;
};

const PROJECT_QUEUE: ProjectRow[] = [
  { ...PROJECTS[0], totalCents: RECORD.totalCents, waitingOn: "us", lineCount: 18, daysInStage: 3, unpricedCount: 2 },
  { ...PROJECTS[2], waitingOn: "us", lineCount: 12, daysInStage: 1, unpricedCount: 3 },
  { ref: "OF-Q-10468", title: "Northcote House", customer: "Manna Developments", phase: "Quoted", waitingOn: "customer", totalCents: 1879300, lineCount: 9, daysInStage: 7, unpricedCount: 0, flagged: false },
  { ...PROJECTS[1], waitingOn: "customer", lineCount: 14, daysInStage: 2, unpricedCount: 0 },
  { ref: "OF-Q-10454", title: "Harbourview - Townhouse 6", customer: "Vista Residential", phase: "Production", waitingOn: "nobody", totalCents: 7348800, lineCount: 21, daysInStage: 4, unpricedCount: 0, flagged: false },
];

/* Four segments, not three. The owner's sketch showed All / Needs us /
   Customer, which leaves "waiting on nobody" reachable only through All - and
   that is the bucket a project falls into once it is in production, so it is
   the one you look for when a customer rings about work already underway.
   Four still fit without scrolling at 320, so nothing is bought by dropping it.

   NOTE for D10: when "with the manufacturer" lands, waitingOn gains a fifth
   value and five segments will NOT fit at 320. That is the moment this control
   has to change shape, and it is worth knowing before it arrives rather than
   after. */
const WAIT_FILTERS: { key: WaitFilter; label: string }[] = [
  { key: "all", label: "All" }, { key: "us", label: "Needs us" },
  { key: "customer", label: "Customer" }, { key: "nobody", label: "Nobody" },
];

const EXTRA: Record<ExtraFilter, { label: string; test: (p: ProjectRow) => boolean }> = {
  unpriced: { label: "Unpriced lines", test: (p) => p.unpricedCount > 0 },
  production: { label: "In production", test: (p) => p.phase === "Production" },
};
const sortProjects = (a: ProjectRow, b: ProjectRow) => {
  const priority = { us: 0, customer: 1, nobody: 2 };
  return priority[a.waitingOn] - priority[b.waitingOn] || b.daysInStage - a.daysInStage;
};
const waitingCopy = (p: ProjectRow) => p.waitingOn === "customer" ? "the customer" : p.waitingOn;

/** The Projects root is an attention queue, rebuilt 2026-08-21 from the owner's
 *  own design.
 *
 *  Two earlier decisions his design overturns, recorded rather than overwritten:
 *
 *  1. "There is deliberately no search" - his header carries one. With five
 *     fixtures it is pointless and with two hundred projects it is not, so it is
 *     built and it works, rather than being drawn and inert (the defect the
 *     Files controls had).
 *  2. The leading edge used to mark `flagged`. It now marks WAITING ON US - the
 *     row's headline status - because the chips already say what is wrong, and
 *     an edge that repeats a chip earns nothing. In the Needs-us filter every
 *     row carries it, which is redundant but harmless; in All it is the thing
 *     that makes the list scannable.
 *
 *  The filter row splits in two, also his: a segment over WHO IS WAITING, which
 *  is the question the queue exists to answer, and everything else behind a
 *  funnel that carries a COUNT OF ACTIVE FILTERS - so hidden filter state is
 *  visible, which is what stops a wrong empty list being read as good news.
 *
 *  Order is fixed and not user-sortable: Us, Customer, Nobody; then longest wait
 *  (worker/routes/ops.ts:398 already sorts this way server-side). */
export function ProjectsPage() {
  const history = useHistory();
  const [wait, setWait] = useState<WaitFilter>("all");
  const [extra, setExtra] = useState<ExtraFilter[]>([]);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const rows = PROJECT_QUEUE
    .filter((p) => wait === "all" || p.waitingOn === wait)
    .filter((p) => extra.every((f) => EXTRA[f].test(p)))
    .filter((p) => !q || (p.ref + " " + p.title + " " + p.customer).toLowerCase().includes(q))
    .sort(sortProjects);
  const waitCount = (k: WaitFilter) =>
    k === "all" ? PROJECT_QUEUE.length : PROJECT_QUEUE.filter((p) => p.waitingOn === k).length;
  const open = (ref: string) => history.push("/projects/record/" + ref);

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>Projects</IonTitle>
          <IonButtons slot="end">
            <IonButton aria-label={searching ? "Close search" : "Search projects"}
              onClick={() => { if (searching) setQuery(""); setSearching(!searching); }}>
              <IonIcon slot="icon-only" icon={searchOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
        {searching && (
          <IonToolbar>
            <IonSearchbar value={query} placeholder="Reference, project or customer"
              onIonInput={(e) => setQuery(e.detail.value ?? "")} />
          </IonToolbar>
        )}
        <IonToolbar className="project-filterbar">
          <div className="project-filters">
            {/* Who is waiting - the question the queue exists to answer. Never
                scrollable, so no state can hide off the edge. */}
            <IonSegment scrollable={false} value={wait}
              onIonChange={(e) => setWait((e.detail.value as WaitFilter) ?? "all")}>
              {WAIT_FILTERS.map((f) => (
                <IonSegmentButton key={f.key} value={f.key}>
                  <IonLabel>{f.label}<span className="pf-count">{waitCount(f.key)}</span></IonLabel>
                </IonSegmentButton>
              ))}
            </IonSegment>
            {/* Everything else, carrying the count of what is on. A filter you
                cannot see is how an empty list gets read as good news. */}
            <IonButton className="pf-funnel" fill="outline" size="small"
              aria-label={extra.length ? "Filters, " + extra.length + " active" : "Filters"}
              onClick={() => setExtra(extra.length ? [] : ["unpriced"])}>
              <IonIcon slot="icon-only" icon={funnelOutline} />
              {extra.length > 0 && <IonBadge className="pf-badge" color="primary">{extra.length}</IonBadge>}
            </IonButton>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent scrollEvents>
        {extra.length > 0 && (
          <div className="project-escape">
            <IonButton fill="clear" size="small" onClick={() => setExtra([])}>
              {EXTRA[extra[0]].label} - clear
            </IonButton>
          </div>
        )}
        {rows.length === 0 ? (
          <div className="project-empty">
            <strong>{q ? "Nothing matches that." : wait === "us" ? "Nothing is waiting on us." : "No projects match this filter."}</strong>
            <IonNote>{q ? "Try a reference, project or customer name."
              : wait === "us" ? "New submissions and enquiries appear here."
              : "Choose another filter."}</IonNote>
          </div>
        ) : <>
          <IonList lines="full" className="project-cards">
            {rows.map((p) => (
              <IonItem key={p.ref} button detail onClick={() => open(p.ref)}
                className={p.waitingOn === "us" ? "project-needs-us" : undefined}>
                <IonLabel className="ion-text-wrap"><span className="project-card">
                  <span className="pc-top">
                    <span className="pc-ref mono">{p.ref}</span>
                    {/* Status in words AND in colour, never colour alone. The age
                        stays quiet: it qualifies the status, it is not the status. */}
                    <span className="pc-wait" data-wait={p.waitingOn}>
                      <b>Waiting on {waitingCopy(p)}</b><span className="pc-age"> - {p.daysInStage}d</span>
                    </span>
                  </span>
                  <strong className="pc-title">{p.title}</strong>
                  <span className="pc-customer">{p.customer}</span>
                  <span className="pc-bottom">
                    <span>{p.lineCount} lines / {p.phase}</span>
                    <Money cents={p.totalCents} absent="Not priced" basis />
                  </span>
                  {/* Suppress the default, show the exception: a row with nothing
                      wrong carries no chips at all. */}
                  {(p.unpricedCount > 0 || p.flagged) && <span className="pc-flags">
                    {p.unpricedCount > 0 && <IonBadge color="warning">Unpriced {p.unpricedCount}</IonBadge>}
                    {p.flagged && <IonBadge color="medium">Needs review</IonBadge>}
                  </span>}
                </span></IonLabel>
              </IonItem>
            ))}
          </IonList>
          <div className="project-table-wrap"><table className="project-table">
            <thead><tr><th>Ref</th><th>Project</th><th>Customer</th><th>Lines</th>
              <th>Value</th><th>Stage</th><th>Waiting on</th><th>Days</th><th>Flags</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.ref} tabIndex={0} onClick={() => open(p.ref)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(p.ref); } }}
                aria-label={"Open " + p.ref + ", " + p.title}>
                <td className="mono">{p.ref}</td><td><strong>{p.title}</strong></td><td>{p.customer}</td>
                <td>{p.lineCount}</td><td><Money cents={p.totalCents} absent="Not priced" basis /></td>
                <td>{p.phase}</td><td><b>{waitingCopy(p)}</b></td><td>{p.daysInStage}</td>
                <td>{p.unpricedCount > 0 ? <IonBadge color="warning">Unpriced {p.unpricedCount}</IonBadge>
                  : p.flagged ? <IonBadge color="medium">Review</IonBadge> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </>}
      </IonContent>
    </IonPage>
  );
}
