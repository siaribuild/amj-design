import { useLocation } from "react-router-dom";
import { OpsPage } from "../chrome/OpsPage";
import { destination, type DestinationId } from "../nav/destinations";
import { BASENAME } from "../shellBase";

/**
 * A destination's root, deliberately thin.
 *
 * These exist so the bar and the rail have somewhere REAL to go — the same
 * reason `docs/mocks/ops2-r1-ionic-src/src/pages/TabRoots.tsx` gives for its
 * own — and not so this pass designs eight screens. Navigation that lands on a
 * blank page is indistinguishable from navigation that failed, and behind
 * Cloudflare Access an operator has no way to tell which he is looking at.
 *
 * Each one says what the destination is FOR (`Destination.blurb`), so an empty
 * console still reads as unfinished rather than broken. The Projects list is
 * the next task; the rest follow it.
 */
export function DestinationRoot({ id }: { id: DestinationId }) {
  const d = destination(id);
  return (
    <OpsPage destination={d}>
      <p className="ops2-page__blurb ds-type-body-md">{d.blurb}</p>
      <p className="ops2-page__pending ds-type-caption">Nothing is built here yet.</p>
      {id === "settings" && <ShellFacts />}
    </OpsPage>
  );
}

/**
 * The shell's own diagnostics, moved here from the scaffold's holding screen
 * when that screen was replaced by real destinations.
 *
 * The reason is carried forward verbatim from the screen it came from, because
 * it is the reason the facts are on a page at all rather than in a data
 * attribute: the base the router detected at boot is rendered "so a wrong one
 * is visible rather than merely wrong" (scripts/tests/web/ops2.spec.ts). Under
 * Settings because that is the destination whose blurb already claims the
 * console's own configuration, and because a diagnostic on a working
 * destination is one an operator can be asked to read out over the phone.
 */
function ShellFacts() {
  const { pathname } = useLocation();
  return (
    <dl className="ops2-facts ds-type-caption">
      <div className="ops2-facts__row">
        <dt>Router base</dt>
        <dd>{BASENAME}</dd>
      </div>
      <div className="ops2-facts__row">
        <dt>Route</dt>
        <dd>{pathname}</dd>
      </div>
    </dl>
  );
}
