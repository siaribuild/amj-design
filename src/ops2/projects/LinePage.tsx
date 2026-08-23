import { IonButton, IonIcon, IonNote, IonSkeletonText } from "@ionic/react";
import { warningOutline } from "ionicons/icons";
import { useParams } from "react-router-dom";
import { destination } from "../nav/destinations";
import { OpsPage } from "../chrome/OpsPage";
import { LineReview } from "./LineReview";
import { useProjectRecord } from "./useProjectRecord";

const PROJECTS = destination("projects");

/**
 * One opening's own page.
 *
 * The owner, verbatim: "tapping on the line will lead to a new view details
 * screen with composite details. Edit, 'Why this product?' will then be
 * accessible from here." So this is the page those attach to; neither is built
 * yet, and neither is drawn as a control that does nothing.
 *
 * ── IT RESOLVES ITS LINE FROM THE RECORD, AND THERE IS NO LINE ENDPOINT ─────
 * The page fetches `GET /api/ops/projects/:id` — the same staff-gated read the
 * record uses — and finds the line inside it. Nothing ever fetches a bare line
 * id, and that is what makes the two refusals structural rather than checked:
 * a line belonging to another project is simply ABSENT from this project's
 * record, so "not on this project" and "does not exist" are the SAME CODE PATH
 * and say the same sentence. A probe cannot learn from the difference whether a
 * line exists.
 *
 * Authorization is inherited whole: this page can only ever show what the
 * record endpoint already decided to return for `:id`.
 *
 * ── BACK POPS, AND THE COLD LINK STILL WORKS ────────────────────────────────
 * `OpsPage`'s own control, one level down from where the same discipline
 * already lives: it pops when there is something to pop, so a trip into a line
 * and back does not grow the history; and it pushes the record's path when
 * there is not — which is the case a pasted link or an email arrives in.
 */
export function LinePage() {
  const { id, lineId } = useParams<{ id: string; lineId: string }>();
  const { load, reload } = useProjectRecord(id);
  const record = load.status === "ready" ? load.record : null;
  const line = record ? record.lines.find((l) => l.id === lineId) ?? null : null;
  const recordPath = `/projects/${encodeURIComponent(id)}`;

  return (
    <OpsPage
      destination={PROJECTS}
      title={line?.code || "Line"}
      backTo={{ label: record ? record.ref : "Project", href: recordPath }}
      width="full"
    >
      {load.status === "loading" && (
        <div className="rec-skeleton" data-testid="line-skeleton" aria-busy="true">
          <IonSkeletonText animated style={{ height: "260px" }} />
          <IonSkeletonText animated style={{ height: "180px" }} />
        </div>
      )}

      {load.status === "missing" && (
        <div className="pq-empty" data-testid="line-missing">
          <strong>This project is not here.</strong>
          <IonNote className="ds-type-caption">
            The reference may have changed, or the project may have been removed.
          </IonNote>
          <IonButton size="small" fill="outline" routerLink={PROJECTS.path}>
            Back to Projects
          </IonButton>
        </div>
      )}

      {load.status === "error" && (
        <div className="pq-error ds-surface-card" data-testid="line-error" role="alert">
          <IonIcon icon={warningOutline} aria-hidden="true" />
          <div>
            <strong>{load.headline}</strong>
            <IonNote className="ds-type-caption">{load.detail}</IonNote>
          </div>
          <IonButton size="small" fill="outline" onClick={reload}>Try again</IonButton>
        </div>
      )}

      {/* ONE SENTENCE FOR BOTH REFUSALS, by construction rather than by
          agreement — the find above cannot tell them apart, so nothing here
          can drift into telling them apart either. */}
      {record && !line && (
        <div className="pq-empty" data-testid="line-not-found">
          <strong>This line is not on this project.</strong>
          <IonNote className="ds-type-caption">
            It may have been removed, or the link may point at another project.
          </IonNote>
          <IonButton size="small" fill="outline" routerLink={recordPath}>
            Back to the project
          </IonButton>
        </div>
      )}

      {record && line && <LineReview line={line} />}
    </OpsPage>
  );
}
