import {
  alertCircleOutline, layersOutline, cubeOutline, pricetagsOutline,
  peopleOutline, folderOpenOutline, documentTextOutline, settingsOutline,
} from "ionicons/icons";
import type { DestinationId } from "./destinations";

/**
 * One mark per destination, shown by the tab bar, the rail and the drawer
 * alike — the same destination wears the same face at every width. That is the
 * growth law applied to the frame ("revelation, not rearrangement",
 * `docs/adr/0004-ops2-plane-shell-owned-not-adopted.md`): moving between widths
 * changes how a destination is presented, never what it looks like.
 *
 * Icons live here rather than in `destinations.ts` for two reasons. They are a
 * rendering concern, and `ionicons/icons` is ~1MB of data URIs that a node test
 * of eight strings has no business bundling. Named imports keep the ops2
 * bundle to the eight actually used.
 *
 * `Record<DestinationId, string>` is the guard: adding a destination without a
 * mark is a type error, which is stricter and earlier than any test.
 */
export const DESTINATION_ICON: Record<DestinationId, string> = {
  attention: alertCircleOutline,
  projects: layersOutline,
  products: cubeOutline,
  pricing: pricetagsOutline,
  customers: peopleOutline,
  files: folderOpenOutline,
  audit: documentTextOutline,
  settings: settingsOutline,
};
