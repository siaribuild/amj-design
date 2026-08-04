// ═══════════════════════════════════════════════════════════════════════════════
// OPENING DRAWER — layer 3 of 3: change
//
// Plan §7.3. The ONLY place an edit happens. Responsive shell:
//   ≥1024px  right drawer ~520px, list dimmed behind so project context survives
//   <1024px  full-screen editor (a narrow side drawer is unusable for a real form)
//
// Dialog semantics apply at EVERY size — including the mobile full-screen form.
// "It's a page now" is exactly how teams drop the focus trap and Escape. Built
// on the Radix Dialog primitive already in dependencies (focus trap, portal,
// inert background) restyled to bone tokens — NOT the unused shadcn sheet.tsx,
// whose black overlay and animation classes ignore the token system.
//
// Editing contract:
//  • opening the editor creates a LOCAL DRAFT; it persists nothing
//  • Save is the only action that persists and recalculates
//  • closing a dirty draft asks first — including via X, Escape and the scrim,
//    which is why ItemForm reports its dirtiness upward
//  • a new opening starts genuinely blank — nothing is copied in merely because
//    an add form was opened
//  • the server stays the authority on validity and submittability
//
// Composite: ONE drawer, two levels. Selecting a child swaps the context to
// "W4 / Unit 2" with a Back to W4 control — never a second stacked dialog.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ChevronLeft } from "lucide-react";
import { type QItem, type QuoteState, clearReviewKey, mm, productLabel } from "../../data/configurator";
import { ItemForm } from "../ItemComposer";
import { type DrawerTarget, type RowKey } from "./identity";
import { unitLabel } from "./rowState";

/** Which level of the one drawer is showing. */
type Level =
  | { kind: "parent" }
  | { kind: "unit"; segmentId: string };

export function OpeningDrawer({ target, item, quote, initialSection, onClose, onSaved }: {
  target: DrawerTarget;
  /** The opening being edited; null for a blank add. */
  item: QItem | null;
  quote: QuoteState;
  /** `Fix details` opens the editor AT the offending field. */
  initialSection?: "dims" | "options" | "qty";
  /** Dismiss without persisting. */
  onClose: () => void;
  /** Persisted — the page runs the restore sequence (re-expand by key, restore
   *  scroll, return focus to that row's Edit control) and owns the announcement,
   *  because this component unmounts before its own live region could speak.
   *  Plan §5.2. */
  onSaved: (rowKey: RowKey | null, announcement?: string) => void;
}) {
  const [level, setLevel] = useState<Level>(
    target.mode === "edit" && target.segmentId
      ? { kind: "unit", segmentId: target.segmentId }
      : { kind: "parent" },
  );
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState<null | "close" | "back">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Outcomes are announced by the PAGE's live region, not this one: the drawer
  // unmounts in the same commit as a successful save, so a message put in a
  // region here would never survive long enough to be spoken.
  const [announcement, setAnnouncement] = useState("");

  const segments = item?.segments ?? [];
  const axis = item?.compositeAxis === "horizontal" ? "horizontal" : "vertical";
  const ref = item?.code || (target.mode === "add" ? "New opening" : "Opening");
  const unitIndex = level.kind === "unit"
    ? segments.findIndex((s) => s.id === level.segmentId)
    : -1;
  const title = level.kind === "parent" ? ref
      : unitLabel(ref, unitIndex);


  const rowKey: RowKey | null = target.mode === "add" ? null : target.rowKey;

  // Changing level starts a fresh draft, so stale dirtiness must not carry over.
  // It must NOT run on mount: the child ItemForm reports its dirtiness in an
  // effect that flushes first, and resetting over the top would leave `dirty`
  // stuck at false for the whole session — silently disabling the discard guard.
  const levelKey = level.kind === "unit" ? `unit:${level.segmentId}` : level.kind;
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    setDirty(false);
    setError("");
  }, [levelKey]);

  // ─── Close / back, both guarded by the dirty draft ──────────────────────────
  const requestClose = () => {
    if (dirty) { setConfirmDiscard("close"); return; }
    onClose();
  };
  // "Back to W4" is NOT a close, but it still drops an unsaved unit draft, so it
  // gets the same guard (plan §7.3).
  const requestBack = () => {
    if (dirty) { setConfirmDiscard("back"); return; }
    setLevel({ kind: "parent" });
  };
  const confirmedDiscard = () => {
    const what = confirmDiscard;
    setConfirmDiscard(null);
    setDirty(false);
    if (what === "back") setLevel({ kind: "parent" });
    else onClose();
  };

  // Escape precedence: reverse child → parent FIRST; only a second Escape closes.
  const onEscape = (e: KeyboardEvent) => {
    e.preventDefault();
    if (confirmDiscard) { setConfirmDiscard(null); return; }
    if (level.kind !== "parent") { requestBack(); return; }
    requestClose();
  };

  // ─── Persistence ───────────────────────────────────────────────────────────
  const saveParent = (built: Omit<QItem, "id">) => {
    if (target.mode === "add") {
      quote.add(built);
      onSaved(null, `${built.code || "Opening"} added`);
      return;
    }
    if (!item) return;

    // Review reasons are provenance the technician relies on, and the composer
    // rebuilds `review` from scratch ({fit} or null) because it was written for
    // NEW items. Writing that straight through would silently erase glazing,
    // substitute, material and thermal reasons — and could clear an
    // error-severity reason the customer never addressed. Clear only what this
    // edit actually resolved, exactly as the /quote inline editor does.
    let review = item.review ?? null;
    if (built.productSlug !== item.productSlug) review = clearReviewKey(review, "product");
    if (built.width !== item.width || built.height !== item.height) review = clearReviewKey(review, "dims");
    if (JSON.stringify(built.options) !== JSON.stringify(item.options)) review = clearReviewKey(review, "options");
    if (built.qty !== item.qty) review = clearReviewKey(review, "qty");
    // The oversize flag is derived from the dimensions just entered, so it is
    // recomputed rather than preserved.
    review = clearReviewKey(review, "fit");
    if (built.review?.fit) review = { ...(review ?? {}), fit: built.review.fit };

    // Only the fields this form owns. Spreading `built` would also overwrite
    // status, and blank out server-owned data the form never saw.
    quote.update(item.id, {
      code: built.code, productSlug: built.productSlug, location: built.location,
      width: built.width, height: built.height, options: built.options, qty: built.qty,
      review,
    });
    onSaved(rowKey, `${built.code || ref} saved`);
  };

  const saveUnit = async (segmentId: string, built: Omit<QItem, "id">) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await quote.updateSegment(segmentId, {
        productSlug: built.productSlug,
        options: built.options,
        alongMm: parseInt(axis === "vertical" ? built.width : built.height) || 0,
      });
      setDirty(false);
      setAnnouncement("Unit saved");
      setLevel({ kind: "parent" });
    } catch {
      setError("That unit could not be saved. Check its product, size and options, then try again.");
    } finally { setBusy(false); }
  };


  const activeSegment = level.kind === "unit" ? segments[unitIndex] : undefined;

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) requestClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 scrim quote-drawer-scrim" />
        <Dialog.Content
          // Focus return is the PAGE's job: it re-resolves the row by serverId
          // after the rehydrate settles. Radix would otherwise try to restore to
          // a trigger node that may no longer exist.
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={onEscape}
          onPointerDownOutside={(e) => { e.preventDefault(); requestClose(); }}
          onInteractOutside={(e) => e.preventDefault()}
          aria-describedby={undefined}
          // Side panel from 768px, matching the main menu's slide-out rather
          // than taking the whole screen: on a tablet a full-screen editor
          // throws away the project context the drawer exists to preserve, and
          // there is ample room beside it. Width follows the menu's idiom —
          // min(88vw, …) — so it never crowds the list it is dimming.
          // Full-screen stays below 768, where a side panel is unusable.
          className="quote-drawer fixed z-50 inset-0 md:inset-y-0 md:left-auto md:right-0 md:w-[min(88vw,520px)] flex flex-col overflow-y-auto">
          {/* 1. Header — pictogram, reference, location, close. On mobile the
                 breadcrumb is the ONLY orientation cue, so it stays persistent. */}
          <div className="quote-panel-head sticky top-0 z-10 flex items-center gap-2 px-4 py-3">
            {level.kind !== "parent" && (
              <button type="button" onClick={requestBack} aria-label={`Back to ${ref}`}
                className="-ml-1 inline-flex items-center gap-1 px-1.5 h-9 font-medium text-sage cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage t-cap">
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />Back to {ref}
              </button>
            )}
            {/* Radix derives the dialog's accessible name from this Title. The
                visible text is the reference alone — the suffix says what the
                dialog IS for anyone who only hears it announced. */}
            <Dialog.Title className="font-semibold text-ink min-w-0 truncate t-bd-sm">
              {title}<span className="sr-only"> — edit opening</span>
            </Dialog.Title>
            {level.kind === "parent" && item?.location && (
              <span className="text-quiet truncate t-cap">{item.location}</span>
            )}
            <button type="button" onClick={requestClose} aria-label="Close editor"
              className="ml-auto w-9 h-9 inline-flex items-center justify-center text-body hover:text-ink cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Outcomes announced politely; not duplicated as visible text. */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>

          <div className="flex-1 px-4 py-4 space-y-3">
            {error && <p role="alert" className="text-red-700 t-cap">{error}</p>}


            {/* 4. Composite build. Above the parent's own fields, matching the
                   established card: it answers "why does my line look like
                   this?", which is context for the detail rather than a
                   footnote under it. Unlike the read-only inline expansion,
                   each unit here carries a VISIBLE affordance. */}
            {level.kind === "parent" && segments.length > 0 && (
              <div className="quote-composite-panel border border-line px-3 py-3">
                <p className="text-info mb-2 font-data t-label">
                  Built as {segments.reduce((n, s) => n + Math.max(1, s.qtyPerParent), 0)} units
                </p>
                <ul className="space-y-1">
                  {segments.map((s, i) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 t-cap">
                      <span className="text-quiet tabular-nums font-data">
                        {unitLabel(ref, i)}{s.qtyPerParent > 1 ? ` ×${s.qtyPerParent}` : ""}
                      </span>
                      <span className="text-ink min-w-0 truncate">{productLabel(s.productSlug)}</span>
                      <span className="text-body tabular-nums font-data">
                        {mm(s.width)} × {mm(s.height)}
                      </span>
                      <span className="ml-auto flex items-center gap-2">
                        <button type="button" disabled={busy}
                          onClick={() => setLevel({ kind: "unit", segmentId: s.id })}
                          aria-label={`Edit ${unitLabel(ref, i)}`}
                          className="font-medium text-sage underline underline-offset-2 disabled:opacity-50 cursor-pointer t-cap">
                          Edit unit
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
                {/* No Add unit and no Remove (owner, 2026-08-04). The unit COUNT
                    is the split decision, and the customer does not make that
                    decision — they cannot create a composite or merge one back,
                    so being able to turn a two-unit opening into four was the
                    same power by another route. What each unit IS stays theirs.
                    Parity with the control arm holds: /quote lost both too. */}
              </div>
            )}

            {/* 2/3/5/6. Essential configuration, options, indicative estimate and
                   the explicit footer all come from the EXISTING composer — the
                   product/options/pricing rules are not reimplemented here. Its
                   sticky footer serves as the drawer footer, so there is never a
                   second competing primary action. */}
            {level.kind === "parent" && (
              <ItemForm
                key={target.mode === "add" ? "new-opening" : `parent-${rowKey}`}
                quote={quote}
                seed={item ?? undefined}
                heading={target.mode === "add" ? "New opening" : `Edit ${ref}`}
                excludeId={item?.id}
                // A composite parent is the schedule line, not a product: its
                // glazing and hardware live on the units, so offering an Options
                // group here would invite a choice that belongs one level down.
                hideOptions={segments.length > 0}
                // …and no product picker either (owner). A composite parent is
                // an OPENING: its ID and its size are the whole of what it owns,
                // and the panel above lists the units that are the products.
                hideProduct={segments.length > 0}
                submitLabel={target.mode === "add" ? "Add opening" : "Save changes"}
                onCommit={saveParent}
                // The drawer header already carries the reference AND the close
                // control, so the composer's own title + "Cancel ✕" strip sat
                // directly beneath as a second title and a second dismiss. With
                // the strip gone the composer no longer runs its own discard
                // prompt either, so Cancel routes through requestClose and the
                // drawer's guard is the ONLY one — previously each owned a
                // prompt and which one you got depended on which control you hit.
                onCancel={requestClose}
                onDirtyChange={setDirty}
                initialSection={initialSection}
                rail
                stickyActions
                hideHeader
              />
            )}

            {level.kind === "unit" && activeSegment && (
              <>
                <p className="text-body t-cap">
                  {unitLabel(ref, unitIndex)}. Its {axis === "vertical" ? "height" : "width"} follows the
                  parent opening; edit the product, options and {axis === "vertical" ? "width" : "height"} here.
                </p>
                <ItemForm
                  key={`unit-${activeSegment.id}`}
                  scope="unit"
                  unitAxis={axis}
                  quote={quote}
                  seed={{
                    productSlug: activeSegment.productSlug,
                    width: activeSegment.width,
                    height: activeSegment.height,
                    options: activeSegment.options ?? {},
                    qty: activeSegment.qty,
                  }}
                  busy={busy}
                  submitLabel={busy ? "Saving…" : `Save ${unitLabel(ref, unitIndex)}`}
                  onCommit={(built) => void saveUnit(activeSegment.id, built)}
                  // requestBack, not a bare setLevel: abandoning a dirty unit is
                  // the same loss as closing, and the drawer owns the single
                  // discard prompt now.
                  onCancel={requestBack}
                  onDirtyChange={setDirty}
                  rail
                  stickyActions
                  hideHeader
                />
              </>
            )}

          </div>

          {/* Discard guard for the drawer's own dismiss affordances. */}
          {/* FIXED, not absolute: Dialog.Content scrolls, and an absolutely
              positioned child anchors to the top of the scrolled content — so on
              a scrolled form the confirm rendered off-screen while stealing
              focus, which reads as a frozen drawer. */}
          {confirmDiscard && (
            <div className="fixed inset-0 z-20 flex items-center justify-center p-4 scrim quote-drawer-scrim">
              <div className="quote-dialog w-full max-w-xs p-4" role="alertdialog" aria-modal="true"
                aria-label="Discard changes">
                <p className="text-ink font-medium mb-1 t-bd-sm">Discard changes?</p>
                <p className="text-body mb-3 t-cap">Your edits to {title} have not been saved.</p>
                <div className="flex justify-end gap-2">
                  <button type="button" autoFocus onClick={() => setConfirmDiscard(null)}
                    className="card px-2.5 py-1.5 text-body cursor-pointer t-cap">Keep editing</button>
                  <button type="button" onClick={confirmedDiscard}
                    className="quote-button--danger border px-2.5 py-1.5 font-medium cursor-pointer t-cap">Discard</button>
                </div>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
