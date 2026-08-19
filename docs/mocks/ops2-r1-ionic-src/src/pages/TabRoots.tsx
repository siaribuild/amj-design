// The two tab roots that did not exist before the tab bar needed them.
// Deliberately thin — they are here so the bar has somewhere real to go and so
// the variants can be judged on a live stack, not so this pass designs them.
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem,
  IonLabel, IonBadge, IonNote, IonListHeader,
} from "@ionic/react";
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

/** The project list — the Projects tab's root, and where a record is pushed
 *  from. Kept here so all three tab roots read the same way. */
export function ProjectsPage() {
  const history = useHistory();
  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>Projects</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent scrollEvents>
        <IonList lines="full">
          {PROJECTS.map((p) => (
            <IonItem key={p.ref} button detail={false}
              onClick={() => history.push(`/projects/record/${p.ref}`)}>
              <IonLabel className="ion-text-wrap">
                <span className="linebody">
                  <span className="l1">
                    <span className="code mono">{p.ref}</span>
                    <span className="prod">{p.title}</span>
                  </span>
                  <span className="meta">{p.customer} · {p.phase} · waiting on {p.waitingOn}</span>
                </span>
              </IonLabel>
              <div slot="end" className="rowend">
                <Money cents={p.totalCents} absent="not priced" />
                {p.flagged && <IonBadge color="warning">needs review</IonBadge>}
              </div>
            </IonItem>
          ))}
        </IonList>
      </IonContent>
    </IonPage>
  );
}
