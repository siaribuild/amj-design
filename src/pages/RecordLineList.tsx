// The customer's record of what they asked for — the SAME rows the builder
// draws, with nothing to press.
//
// The account showed a flat table that had no way to express a composite: a
// 2050mm opening built as an awning and a lite appeared as one product name and
// one size, which is not what is being made. The builder already solves this —
// a composite parent is NAMED from its units and DRAWN with the join at the real
// split — so the record reuses that instead of growing a second, wronger
// implementation of the same idea.
//
// Parents only, by owner decision: the units are how the opening is built, not
// separate things the customer ordered. The parent's own drawing already shows
// the make-up, so expanding a row states it without listing children.
import { useState } from "react";
import { OpeningRow } from "../components/quote-project/OpeningRow";
import { SpecPanel } from "../components/quote-project/OpeningExpansion";
import { rowStateFor } from "../components/quote-project/rowState";
import { getProductBySlug } from "../data/catalogue";
import type { QItem } from "../data/configurator";
import { money } from "./accountModel";

/** The units, in the shape SpecPanel draws them. Empty for a simple opening,
 *  which then draws its own single frame. */
function partsOf(item: QItem) {
  const segments = item.segments ?? [];
  if (!segments.length) return undefined;
  return segments.map((s) => ({
    productSlug: s.productSlug,
    alongMm: (item.compositeAxis ?? "vertical") === "vertical" ? s.width : s.height,
    qty: s.qtyPerParent ?? 1,
  }));
}

export function RecordLineList({ items, total, footerLabel }: {
  items: QItem[];
  total: number | null;
  footerLabel: string;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setExpanded((open) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <>
      <div className="px-5 py-[11px] bg-sage/[0.07] border-b border-black/10 text-body font-data t-label">
        {items.length} line{items.length === 1 ? "" : "s"} · anchored by schedule code
      </div>
      {items.map((item) => {
        const open = expanded.has(item.id);
        const product = getProductBySlug(item.productSlug);
        return (
          <div key={item.id} className="quote-rec">
            <OpeningRow
              item={item}
              rowKey={String(item.id)}
              state={rowStateFor(item, items)}
              expanded={open}
              onToggleExpanded={() => toggle(item.id)}
              readOnly
            />
            {open && (
              <div className="disclose" data-open="true">
                <div className="px-3 sm:px-4 py-3 border-t border-line bg-recessive">
                  <SpecPanel
                    productSlug={item.productSlug}
                    widthMm={item.width}
                    heightMm={item.height}
                    // Chosen options, read as a list. `chosen` is what the panel
                    // uses to tell a selection from an available alternative, and
                    // on a record every one of them was selected.
                    pairs={Object.entries(item.options ?? {})
                      .filter(([, value]) => !!value)
                      .map(([label, value]) => ({ label, value: String(value), chosen: true }))}
                    parts={partsOf(item)}
                    axis={item.compositeAxis ?? null}
                  />
                  {!product && (
                    <p className="mt-2 text-body t-cap">
                      This product is no longer in the catalogue — the record keeps what was ordered.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-black/10 flex-wrap">
        <span className="text-body t-cap">{footerLabel}</span>
        <span className="font-medium text-ink font-data t-bd-sm">{total == null ? "—" : money(total)}</span>
      </div>
    </>
  );
}
