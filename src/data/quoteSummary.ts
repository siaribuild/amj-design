// ═══════════════════════════════════════════════════════════════════════════════
// SHARED QUOTE SUMMARY — the counters both quote presentations must agree on
//
// Plan §4. These figures (total, blockers, technical caveats, pending prices)
// drive the sticky panel on /quote and the action bar on /quote-project. They
// were computed inline in QuotePage; extracting them means the two arms of the
// A/B can never disagree about whether a quote is submittable, which would
// otherwise read as a UX difference when it is really an arithmetic one.
//
// Pure derivation — no state, no effects, no business logic of its own. Every
// rule it applies already lives in configurator.ts.
// ═══════════════════════════════════════════════════════════════════════════════
import {
  type QItem, type QuoteState,
  hasDuplicateCode, lineBlocksSubmission, linePriceTotal, reviewSeverity,
} from "./configurator";

export interface QuoteSummary {
  /** GST-INCLUSIVE sum of every line's server-priced total. Display mode is
   *  applied by the renderer via gstAdjust — never baked in here. */
  total: number;
  itemCount: number;
  /** How many lines the SERVER actually priced. When this is 0, `total` is 0
   *  because nothing has a figure — not because the quote is worth nothing, and
   *  a panel that prints "$0" in that state is stating a price we never quoted.
   *  Both panels use it to show "—" instead. */
  pricedCount: number;
  /** ERROR-severity lines: the customer must fix these before submitting. */
  attentionCount: number;
  /** Customer-changed AI configurations awaiting an exact price. */
  pendingPriceCount: number;
  /** WARNING-severity lines: priced, submittable, ours to confirm at review.
   *  Counted separately so the submit gate can never depend on them. */
  technicalCount: number;
  hasContent: boolean;
  /** The single blocking predicate. Same one the server enforces. */
  itemBlocked: (item: QItem) => boolean;
}

export function quoteSummary(quote: Pick<QuoteState, "items" | "files">): QuoteSummary {
  const items = quote.items;
  const itemBlocked = (it: QItem) =>
    lineBlocksSubmission(it) || hasDuplicateCode(items, it.id, it.code);

  return {
    total: items.reduce((sum, it) => sum + linePriceTotal(it), 0),
    itemCount: items.length,
    pricedCount: items.filter((it) =>
      typeof it.lineTotal === "number" && Number.isFinite(it.lineTotal)).length,
    attentionCount: items.filter(itemBlocked).length,
    pendingPriceCount: items.filter((it) =>
      (it.origin === "ai" || it.aiPriced)
      && (typeof it.lineTotal !== "number" || !Number.isFinite(it.lineTotal))
      && !!it.review?.customerConfigurationChanged).length,
    technicalCount: items.filter((it) =>
      !itemBlocked(it) && reviewSeverity(it.review) === "warning").length,
    hasContent: items.length > 0 || quote.files.length > 0,
    itemBlocked,
  };
}
// Deliberately NOT exported under a `use*` name. It is a plain derivation, not a
// hook, and a `useQuoteSummary` alias would be treated as a hook by
// eslint-plugin-react-hooks — flagging the first legitimate conditional call.
