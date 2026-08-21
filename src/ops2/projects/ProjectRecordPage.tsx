import { useParams } from "react-router-dom";
import { destination } from "../nav/destinations";
import { OpsPage } from "../chrome/OpsPage";

const PROJECTS = destination("projects");

/**
 * The project record — NOT BUILT, and saying so.
 *
 * This route exists because the list's rows and chevrons have to lead somewhere
 * real. A row that opens nothing is the "control drawn and left inert" defect
 * (`OPEN-DEFECTS.md` D2); a row that opens a blank page is worse, because
 * behind Cloudflare Access a blank page is indistinguishable from an outage.
 * So the destination exists, is reachable, is deep-linkable, and states its own
 * emptiness — the same reasoning `../pages/DestinationRoot.tsx` gives for the
 * destinations that have nothing on them yet.
 *
 * It is DELIBERATELY THIN. The record surface is the next task and it has a
 * design of its own; putting real chrome here would leave the next agent
 * building on a shape nobody approved.
 *
 * Nested under `/projects`, which is what keeps the tab and the rail lit while
 * a record is open: Ionic computes the selected tab by segment-prefix match,
 * and `isDestinationActive()` mirrors that rule.
 */
export function ProjectRecordPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <OpsPage
      destination={PROJECTS}
      title="Project record"
      // Back NAMES ITS DESTINATION — the settled rule, and from a record the
      // destination is the list.
      backTo={{ label: "Projects", href: PROJECTS.path }}
    >
      <p className="ops2-page__blurb ds-type-body-md">
        Line review, pricing and editing live here. The record is the next surface to be built.
      </p>
      <dl className="ops2-facts ds-type-caption">
        <div className="ops2-facts__row">
          <dt>Project</dt>
          <dd>{id}</dd>
        </div>
      </dl>
    </OpsPage>
  );
}
