// ═══════════════════════════════════════════════════════════════════════════════
// QUOTE-PROJECT — UI IDENTITY CONTRACT
//
// The linchpin of this route (plan §5). `QItem.id` is a LOCAL ephemeral id that
// hydrateQuoteItems() regenerates on reload for any line it cannot match by
// serverId — including every line on a fresh page load. Keying transient UI
// state (expanded row, drawer target, menu anchor) on it means the user's place
// silently detaches the moment a save recalculates and re-hydrates.
//
// `serverId` is the only durable line identity, and `QSegment.id` is the only
// durable child identity. Everything transient in this route keys on those.
// ═══════════════════════════════════════════════════════════════════════════════
import type { QItem } from "../../data/configurator";

/** Stable key for one opening row. A line that has never been saved has no
 *  serverId yet, so it falls back to its local id — deliberately namespaced so a
 *  local key can never be mistaken for (or collide with) a server one. */
export type RowKey = string;

export const rowKeyOf = (item: QItem): RowKey =>
  item.serverId ?? `local:${item.id}`;

/** Resolve a key back to the CURRENT item after a rehydrate. Returns null when
 *  the line no longer exists (deleted elsewhere, or a pre-save local line whose
 *  id was regenerated) — callers must handle that rather than assume presence. */
export const findByRowKey = (items: QItem[], key: RowKey | null): QItem | null =>
  key ? items.find((it) => rowKeyOf(it) === key) ?? null : null;

/** What the drawer is currently editing. One drawer, two levels: a composite
 *  child swaps `segmentId` in rather than stacking a second dialog (plan §7.3). */
export type DrawerTarget =
  /** Editing an existing opening, or one of its units when segmentId is set. */
  | { mode: "edit"; rowKey: RowKey; segmentId?: string }
  /** A blank new opening. Creates nothing until Save (plan §7.3 editing contract). */
  | { mode: "add" };
// There is deliberately no "add-unit" mode (owner, 2026-08-04): adding a unit
// changes how MANY units an opening has, which is the split decision, and the
// customer does not make that decision.

/** Where focus returns after the drawer closes. Deliberately ONE canonical
 *  target — the row's Edit control — regardless of whether the drawer was opened
 *  from the row, the expansion or the More menu. Determinism beats reproducing
 *  the exact origin, and it is the only target guaranteed to still exist after a
 *  rehydrate (plan §5.2). */
export const editControlId = (key: RowKey): string =>
  `qp-edit-${cssSafe(key)}`;

/** DOM ids for the disclosure pair, so aria-controls can point at a real node. */
export const rowId = (key: RowKey): string => `qp-row-${cssSafe(key)}`;
export const panelId = (key: RowKey): string => `qp-panel-${cssSafe(key)}`;

/** Server ids are opaque strings; make them safe for use inside a DOM id. */
function cssSafe(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}
