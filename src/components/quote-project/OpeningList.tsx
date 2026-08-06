// ═══════════════════════════════════════════════════════════════════════════════
// THE OPENING LIST — one table of openings, wherever openings are shown.
//
// Lifted out of QuoteProjectPage unchanged so the customer's RECORD can be the
// same list rather than a second one that looks like it. The account previously
// rendered its own flat table: no column head, no group borders, no units, and
// panels that snapped shut instead of animating — six structural differences,
// every one of them a decision nobody made on purpose.
//
// The only axis of variation is whether the list ACTS. Pass `actions` and rows
// offer Edit, the More menu and the fix-details launcher; omit it and the same
// rows state the same information with nothing to press. There is deliberately
// no second mode: every other difference between the builder and the record was
// a bug, so the component does not provide a way to reintroduce one.
//
// Disclosure state lives here because it is presentational — which row is open
// is not a fact about the project, and both callers want identical behaviour.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState, type ReactNode } from "react";
import { OpeningRow } from "./OpeningRow";
import { OpeningExpansion, SpecPanel, CoverageNotice } from "./OpeningExpansion";
import { UnitRow } from "./UnitRow";
import { optionFullPairs } from "../ItemComposer";
import { getProductBySlug } from "../../data/catalogue";
import { type RowKey, panelId, rowKeyOf, unitKey } from "./identity";
import { rowStateFor, unitLabel } from "./rowState";
import type { QItem } from "../../data/configurator";

export interface OpeningListActions {
  onEdit: (key: RowKey) => void;
  onOpenMenu: (key: RowKey, anchor: HTMLElement) => void;
  /** The blocked row's launcher — the editor, opened at the offending section. */
  onFixDetails: (item: QItem, key: RowKey) => void;
}

export function OpeningList({ items, actions, undoSlot, trailing }: {
  items: QItem[];
  /** Absent ⇒ read-only: the same rows, with nothing to press. */
  actions?: OpeningListActions;
  /** Rendered directly beneath a row — the builder's Undo banner. */
  undoSlot?: (item: QItem) => ReactNode;
  /** Rendered at the foot, inside the table — the builder's upload progress. */
  trailing?: ReactNode;
}) {
  const [openedKeys, setOpenedKeys] = useState<ReadonlySet<RowKey>>(new Set());
  // .disclose animates by TRANSITION, which needs the content to still be there
  // while it shuts — a row that unmounted its panel would snap closed and only
  // animate on the way in. `touchedKeys` is what a row has ever opened: its
  // panel stays mounted from then on, so closing animates exactly as opening
  // does. A row nobody has opened renders nothing, so twenty untouched lines
  // still cost twenty rows rather than twenty drawings and option lists.
  const [touchedKeys, setTouchedKeys] = useState<ReadonlySet<RowKey>>(new Set());
  const expandedFor = (key: RowKey) => openedKeys.has(key);
  const mountedFor = (key: RowKey) => openedKeys.has(key) || touchedKeys.has(key);
  const toggleExpanded = (key: RowKey, isOpen: boolean) => {
    setTouchedKeys((s) => new Set(s).add(key));
    setOpenedKeys((s) => {
      const n = new Set(s);
      if (isOpen) n.delete(key); else n.add(key);
      return n;
    });
  };

  return (
    // ONE table, not twenty cards. The gaps between separate cards were
    // the thing stopping a column of dimensions or prices from being
    // scanned vertically; rows now share hairlines inside a single frame.
    <div className="quote-table quote-panel divide-y divide-line">
      {/* Column labels, ≥1024px only — the width where the row becomes a
          grid. Below that the row is a stacked card and a header strip
          would be labelling columns that do not exist. aria-hidden: these
          are presentational, and every cell below already carries its own
          accessible name or visible label. */}
      <div aria-hidden="true"
        className="quote-table-head hidden md:grid items-center gap-x-3 py-2
 text-quiet font-data t-label">
        <span className="col-start-1">Opening</span>
        {/* Status is a column only from 1024. Below that it rides inside
            the identity cell, beside the reference — the same position,
            without a track the width cannot afford. */}
        <span className="hidden lg:block lg:col-start-2">Status</span>
        <span className="col-start-2 lg:col-start-3">Product</span>
        <span className="col-start-3 lg:col-start-4 text-right">Size</span>
        <span className="col-start-4 lg:col-start-5 text-right">Price</span>
      </div>

      {items.map((item) => {
        const key = rowKeyOf(item);
        const state = rowStateFor(item, items);
        const expanded = expandedFor(key);
        // WHAT A PARENT OPENS INTO (owner). One control, two contents,
        // chosen by whether the opening has children:
        //
        //   composite   its units, in a box docked under the row
        //   otherwise   its own specification and its edit launcher
        //
        // Never both. A composite line is not a product — it is the
        // schedule line, and its units carry the specifications — so a
        // spec panel above the units would describe nothing.
        const units = item.segments ?? [];
        const composite = units.length > 0;
        return (
          // data-group is what draws the parent's bottom border, and it
          // is set only while the group is actually showing: collapsed,
          // the parent is an ordinary row and the list's own divider
          // already draws its edge.
          <div key={key} className="quote-rec"
            data-group={composite && expanded ? "open" : undefined}>
            <OpeningRow
              item={item}
              rowKey={key}
              state={state}
              expanded={expanded}
              onToggleExpanded={() => toggleExpanded(key, expanded)}
              onEdit={actions ? () => actions.onEdit(key) : undefined}
              onOpenMenu={actions ? (anchor) => actions.onOpenMenu(key, anchor) : undefined}
              readOnly={!actions}
            />
            {undoSlot?.(item)}
            {mountedFor(key) && !composite && (
              <div className="disclose" data-open={expanded ? "true" : "false"}>
                <div>
                  <OpeningExpansion item={item} rowKey={key} state={state}
                    onEdit={actions ? () => actions.onEdit(key) : undefined}
                    onFixDetails={actions ? () => actions.onFixDetails(item, key) : undefined}
                    readOnly={!actions} />
                </div>
              </div>
            )}

            {/* The units, in a box inset under their parent and docked to
                it — no top border of its own, because the parent's bottom
                border is its top edge. Each unit keeps its own disclosure
                for its specification, so the block nests one level and
                only one. */}
            {mountedFor(key) && composite && (
              <div className="disclose" data-open={expanded ? "true" : "false"}>
                <div>
                  <div id={panelId(key)} className="quote-kids">
                    {/* At the HEAD of the block, above the rows it is
                        asking someone to check. */}
                    <CoverageNotice item={item} state={state} />
                    {units.map((s, i) => {
                      const uKey = unitKey(s.id);
                      const uExpanded = expandedFor(uKey);
                      const label = unitLabel(item.code, i);
                      return (
                        <div key={s.id}>
                          <UnitRow
                            segment={s} parentCode={item.code} label={label}
                            expanded={uExpanded}
                            onToggleExpanded={() => toggleExpanded(uKey, uExpanded)}
                            panelId={panelId(uKey)}
                            axis={item.compositeAxis}
                            acrossMm={item.compositeAxis === "horizontal" ? item.width : item.height} />
                          {mountedFor(uKey) && (
                            <div className="disclose" data-open={uExpanded ? "true" : "false"}>
                              <div>
                                <div id={panelId(uKey)} className="quote-rowexp quote-unitexp">
                                  <SpecPanel productSlug={s.productSlug} widthMm={s.width} heightMm={s.height}
                                    pairs={optionFullPairs(getProductBySlug(s.productSlug), s.options ?? {})} />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {trailing}
    </div>
  );
}
