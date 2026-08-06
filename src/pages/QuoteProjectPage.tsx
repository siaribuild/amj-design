// ═══════════════════════════════════════════════════════════════════════════════
// /quote — THE project builder
//
// This was the A/B arm at /quote-project, run beside the original card builder
// while the comparison was open. The owner closed it in favour of this one, so
// the arm became the page: /quote renders this, the card builder (QuotePage.tsx)
// and its StickyQuotePanel are deleted, and /quote-project survives only as a
// legacy path in routes.ts because it was linked internally for months.
//
// The file and its components/quote-project/ directory keep their names on
// purpose — renaming ~15 modules would bury this one-line change in churn.
//
// Plan: docs/estimator/quote-project-implementation-plan.md
// Brief: docs/estimator/quote-project-implementation-brief.md
//
// Three layers, and only one of them edits:
//   collapsed row     scan and triage
//   inline expansion  inspect — READ-ONLY
//   drawer            change — the only editor
// The operating rule is: open to inspect; edit to change.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { Plus, Upload, UploadCloud, Paperclip, Trash2, X, AlertCircle, CheckCircle } from "lucide-react";
import { type Page, SLabel, Btn } from "../app/ui";
import { type QuoteState } from "../data/configurator";
import { type SubmitContact, type SubmitResult } from "../data/api";
import { quoteSummary } from "../data/quoteSummary";
import { useProjectDocuments } from "../data/useProjectDocuments";
import { DocumentProgress } from "../components/DocumentProgress";
import { QuoteReviewSubmit, QuoteSubmitted } from "../components/QuoteReviewSubmit";
import { OpeningList } from "../components/quote-project/OpeningList";
import { OpeningExpansion, SpecPanel, CoverageNotice } from "../components/quote-project/OpeningExpansion";
import { UnitRow } from "../components/quote-project/UnitRow";
import { optionFullPairs } from "../components/ItemComposer";
import { getProductBySlug } from "../data/catalogue";
import { OpeningDrawer } from "../components/quote-project/OpeningDrawer";
import { MoreMenu } from "../components/quote-project/MoreMenu";
import { ProjectActionBar } from "../components/quote-project/ProjectActionBar";
import { ProjectNameField } from "../components/ProjectNameField";
import {
  type DrawerTarget, type RowKey, editControlId, findByRowKey, panelId, rowKeyOf, unitKey,
} from "../components/quote-project/identity";
import { fixTargetFor, rowStateFor, unitLabel } from "../components/quote-project/rowState";

type QuoteUser = { name: string; email: string; phone: string; type: string } | null;

export function QuoteProjectPage({ setPage, user, quote, onSubmit }: {
  setPage: (p: Page) => void;
  user: QuoteUser;
  quote: QuoteState;
  onSubmit?: (contact: SubmitContact) => Promise<SubmitResult>;
}) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [view, setView] = useState<"build" | "review">("build");
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  // Transient UI identity keys on serverId, never the local array id — the local
  // id is regenerated on rehydrate, which is exactly when the user is most likely
  // to be mid-inspection (plan §5).
  // EVERY record starts collapsed (owner). Rows the customer had to act on used
  // to open themselves, which took a list of twenty openings and made the ones
  // needing attention the tallest things on the page — the opposite of a list
  // you scan. The row still carries its state chip and its stripe at rest; the
  // reason and the Fix-details action are one click away in the panel.
  //
  // One set, not two: with nothing derived-open there is no "closed a row that
  // opens itself" case left to remember, so the state is simply which keys the
  // customer opened. Expansion is not one-at-a-time — several may be open.
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
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const [drawerSection, setDrawerSection] = useState<"dims" | "options" | "qty" | undefined>();
  const [menu, setMenu] = useState<{ rowKey: RowKey; anchor: HTMLElement } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RowKey | null>(null);
  // Duplicate's Undo lives INLINE on the new row rather than in a toast: it needs
  // no auto-dismiss timing, sits beside what it undoes, and is plain state text
  // so reduced motion changes nothing (plan §7.4).
  const [undo, setUndo] = useState<{ localId: number; fromRef: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Whole-project reset. Same contract as /quote: it wipes lines AND documents,
  // server and local, so it is confirmed and never a single tap.
  const [clearConfirm, setClearConfirm] = useState(false);
  const clearBtnRef = useRef<HTMLButtonElement>(null);
  const clearDialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<number>(0);
  // Focus fallback when the drawer's originating row no longer exists.
  const addOpeningRef = useRef<HTMLButtonElement | null>(null);

  // The SAME document engine /quote drives — upload, parse, AI refinement and the
  // full 6-step checklist. Not a second copy.
  const {
    uploading, uploadNotice, setUploadNotice, aiPhase, stageLog, nowTick,
    processing, processingDocs, retryingAi, collisionTags,
    removingFile, setRemovingFile,
    fileInputRef, openUpload, handleFiles, handleRemoveFile, handleCollision,
    handleAiRetry, diagnosticMessage, resetDocuments,
  } = useProjectDocuments(quote, user);

  // Identical to /quote's, including the failure path: if the server refuses,
  // NOTHING is reported as removed, because a reset that half-succeeded and
  // said "done" is how a customer loses a schedule they think they still have.
  const handleClearAll = async () => {
    setClearConfirm(false);
    setUploadNotice(null);
    try {
      await quote.clearAll();
      resetDocuments();          // stops polling, drops every document-derived state
      setOpenedKeys(new Set());  // no expansion may outlive the rows it belonged to
      setUndo(null);
      setAnnouncement("Project cleared");
    } catch {
      setUploadNotice({ type: "error", message: "We couldn't clear this project. Nothing was removed; please try again." });
    }
  };
  // Destructive-dialog focus: land on Cancel (the safe default), and return
  // focus to the trigger when dismissed without acting.
  useEffect(() => {
    if (!clearConfirm) return;
    const t = setTimeout(() => clearDialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0);
    return () => clearTimeout(t);
  }, [clearConfirm]);
  const cancelClear = () => { setClearConfirm(false); clearBtnRef.current?.focus(); };

  const summary = quoteSummary(quote);
  const items = quote.items;

  const openDrawer = (target: DrawerTarget, section?: "dims" | "options" | "qty") => {
    scrollRef.current = window.scrollY;   // restored after save/close (§5.2)
    setDrawerSection(section);
    setDrawer(target);
  };

  // The canonical restore sequence: resolve by serverId AFTER the rehydrate has
  // settled, re-expand, restore scroll, and return focus to that row's Edit
  // control. Never re-use a DOM node captured before the reload — that is the
  // single most common way focus silently falls to <body> on this pattern.
  const closeDrawer = (rowKey: RowKey | null, saidWhat?: string) => {
    setDrawer(null);
    setDrawerSection(undefined);
    // Explicitly OPEN: after a save the customer is looking at the row they
    // just edited and expects to see the result.
    if (rowKey) setOpenedKeys((s) => new Set(s).add(rowKey));
    if (saidWhat) setAnnouncement(saidWhat);
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollRef.current);
      // Focus must never be left on <body> — the classic failure of this
      // pattern. Resolve by serverId AFTER the rehydrate settles; if the row is
      // gone (or was never saved), fall back to the header action that opened it.
      const target = rowKey ? document.getElementById(editControlId(rowKey)) : null;
      (target ?? addOpeningRef.current)?.focus();
    });
  };

  const fixFirstBlocker = () => {
    const first = items.find(summary.itemBlocked);
    if (!first) return;
    openDrawer({ mode: "edit", rowKey: rowKeyOf(first) }, sectionFor(fixTargetFor(first, items)));
  };

  // ─── Submitted / review — the SHARED final step ─────────────────────────────
  if (submitted) return <QuoteSubmitted email={submittedEmail} user={user} onGo={go} />;
  if (view === "review") {
    return (
      <QuoteReviewSubmit
        quote={quote} user={user}
        backLabel="Back to your project"
        aiReading={aiPhase?.kind === "reading"}
        onBack={() => setView("build")}
        onSubmit={onSubmit}
        onSubmitted={(email) => { setSubmittedEmail(email); setSubmitted(true); }}
        onFixBlocked={() => { setView("build"); fixFirstBlocker(); }}
      />
    );
  }

  const menuItem = menu ? findByRowKey(items, menu.rowKey) : null;
  const deleteItem = confirmDelete ? findByRowKey(items, confirmDelete) : null;

  return (
    <div className="quote-page min-h-[100svh] ground-bone flex flex-col pt-16">
      <input ref={fileInputRef} type="file" multiple className="hidden"
        accept=".pdf,.csv,.jpg,.jpeg,.png,.webp,.heic,.heif,text/csv,image/*"
        onChange={e => void handleFiles(e.target.files)} />

      {/* One polite live region for the whole list. Bar, row and expansion must
          not each announce the same thing (plan §11). */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>

      <div className="w-full max-w-6xl mx-auto px-6 pt-8 pb-10 flex-1">
        {/* ─── Page framing: compact heading, calm list surface. Deliberately not
               the tall card stack /quote uses. ─────────────────────────────── */}
        <div className="mb-5 flex items-end justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <SLabel>Your project</SLabel>
            {/* Renameable, like /quote. A customer with two projects cannot tell
                them apart while both are called "My Project". */}
            <ProjectNameField value={quote.title} onCommit={quote.setTitle} heading />
          </div>
          {/* Add opening is a visible list-header action — never a row action and
              never hidden in an overflow menu. */}
          {items.length > 0 && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={openUpload}
                className="card inline-flex items-center gap-1.5 px-3 min-h-[44px] font-medium text-sage hover:border-sage cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage t-bd-sm">
                <Upload className="w-4 h-4" aria-hidden="true" />Add document
              </button>
              <button ref={addOpeningRef} type="button" onClick={() => openDrawer({ mode: "add" })}
                className="card inline-flex items-center gap-1.5 px-3 min-h-[44px] font-medium text-sage hover:border-sage cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage t-bd-sm">
                <Plus className="w-4 h-4" aria-hidden="true" />Add opening
              </button>

              {/* Whole-project reset. /quote's reasoning holds — it belongs beside
                  the scope it wipes (lines + documents), never on the sticky bar
                  where it would compete with the primary CTA and invite a
                  mis-tap. Here the heading row IS the action row, so it needs
                  separating from the two constructive actions it sits with:
                  a rule, no fill, and smaller. It is rare and destructive, so it
                  must be findable without being adjacent-and-identical to Add. */}
              <span className="w-px h-6 bg-black/10 mx-1" aria-hidden="true" />
              <button ref={clearBtnRef} type="button" onClick={() => setClearConfirm(true)}
                aria-label="Clear all items and uploaded documents"
                className="inline-flex items-center gap-1.5 px-2.5 min-h-[44px] font-medium text-body-soft hover:text-red-600 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage t-cap">
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />Clear all
              </button>
            </div>
          )}
        </div>

        {/* Attached documents. Files are integral to the order, so they stay
            visible above the list they produced. */}
        {quote.files.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {quote.files.map((f) => (
              removingFile === String(f.id) ? (
                <div key={f.id} className="inline-flex items-center gap-2.5 border border-red-300 bg-red-50 px-3 py-1.5 max-w-full t-cap">
                  <span className="text-red-800 font-medium truncate max-w-[12rem]">Remove {f.name}? Its lines go too.</span>
                  <button onClick={() => void handleRemoveFile(String(f.id), f.name)}
                    className="quote-button--danger font-medium border px-1.5 py-0.5 cursor-pointer t-cap">Remove</button>
                  <button onClick={() => setRemovingFile(null)} autoFocus
                    className="text-body card px-1.5 py-0.5 hover:border-black/25 cursor-pointer t-cap">Keep</button>
                </div>
              ) : (
                <div key={f.id} className="inline-flex items-center gap-2 card px-3 py-1.5 max-w-full t-cap">
                  <Paperclip className="w-3.5 h-3.5 text-sage flex-shrink-0" aria-hidden="true" />
                  <span className="text-ink font-medium truncate max-w-[14rem]">{f.name}</span>
                  <button onClick={() => setRemovingFile(String(f.id))} aria-label={`Remove ${f.name}`}
                    className="flex-shrink-0 -mr-1 w-5 h-5 inline-flex items-center justify-center text-quiet hover:text-red-600 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              )
            ))}
          </div>
        )}

        {/* Tag collision — asked ONCE per tag; the customer's line stands either way. */}
        {collisionTags.map((tag) => (
          <div key={tag} role="status" className="mb-3 border border-info/30 bg-info/10 px-4 py-3 text-info-ink t-bd-sm">
            <p className="font-medium">Your schedule also lists {tag} — you already added an opening with that code.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Btn variant="sage" size="sm" onClick={() => void handleCollision(tag, "linked")}>Link to schedule {tag}</Btn>
              <Btn variant="ghost" size="sm" onClick={() => void handleCollision(tag, "separate")}>Keep separate</Btn>
            </div>
          </div>
        ))}

        {uploadNotice && (
          <div role={uploadNotice.type === "error" ? "alert" : "status"} aria-live="polite"
            className={`mb-3 flex items-start gap-2.5 border px-4 py-3 ${uploadNotice.type === "success" ? "border-sage/30 bg-sage-wash text-sage-ink" : "border-red-300 bg-red-50 text-red-800"} t-bd-sm`}>
            {uploadNotice.type === "success"
              ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
              : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />}
            <span className="flex-1">{uploadNotice.message}</span>
            <button onClick={() => setUploadNotice(null)} aria-label="Dismiss upload result"
              className="p-1 -m-1 text-current opacity-60 hover:opacity-100 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* A stopped run stays honest and offers the retry, exactly as on /quote. */}
        {(aiPhase?.kind === "deferred" || aiPhase?.kind === "failed") && (
          <div role={aiPhase.kind === "failed" ? "alert" : "status"} aria-live="polite"
            className="quote-notice--warning mb-3 flex items-start gap-2.5 border border-warning/40 px-4 py-3 t-bd-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span className="flex-1">
              {diagnosticMessage(aiPhase.diagnostic)}{" "}
              {aiPhase.kind === "failed" && (
                <button onClick={() => void handleAiRetry()} disabled={retryingAi}
                  className="underline font-medium disabled:opacity-50 cursor-pointer">
                  {retryingAi ? "Retrying…" : "Try AI again"}
                </button>
              )}
            </span>
          </div>
        )}

        {items.length === 0 && !processing ? (
          // Mirrors /quote's empty state — upload primary, manual add secondary —
          // so the A/B compares presentation, not a changed funnel.
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Start your quote">
            <button onClick={openUpload} disabled={uploading}
              className="group min-h-32 action-tile action-hover p-5 text-left disabled:opacity-60 cursor-pointer">
              <span className="w-9 h-9 mb-4 flex items-center justify-center bg-sage-wash text-sage group-hover:bg-sage group-hover:text-white transition-colors">
                <UploadCloud className="w-5 h-5" aria-hidden="true" />
              </span>
              <span className="block font-semibold text-ink mb-1 t-bd">Upload schedule or photo</span>
              <span className="block text-body t-bd-sm">PDFs, CSV files and clear photos come back matched and priced. Plans work too.</span>
            </button>
            {/* Also the focus fallback: from the empty state this is the only
                control that opened the drawer, and the header's Add opening
                button does not exist yet. */}
            <button ref={addOpeningRef} onClick={() => openDrawer({ mode: "add" })}
              className="group min-h-32 action-tile action-hover p-5 text-left cursor-pointer">
              <span className="w-9 h-9 mb-4 flex items-center justify-center bg-sage-wash text-sage group-hover:bg-sage group-hover:text-white transition-colors">
                <Plus className="w-5 h-5" aria-hidden="true" />
              </span>
              <span className="block font-semibold text-ink mb-1 t-bd">Add an opening manually</span>
              <span className="block text-body t-bd-sm">Choose a product, then enter its dimensions and options.</span>
            </button>
          </div>
        ) : (
          // ONE table, not twenty cards. The gaps between separate cards were
          // the thing stopping a column of dimensions or prices from being
          // scanned vertically; rows now share hairlines inside a single frame.
          <OpeningList
            items={items}
            actions={{
              onEdit: (key) => openDrawer({ mode: "edit", rowKey: key }),
              onOpenMenu: (key, anchor) => setMenu({ rowKey: key, anchor }),
              onFixDetails: (item, key) => openDrawer(
                { mode: "edit", rowKey: key },
                sectionFor(fixTargetFor(item, items)),
              ),
            }}
            // Undo rides on the duplicated row itself.
            undoSlot={(item) => undo?.localId === item.id ? (
              <div role="status"
                className="flex items-center gap-2 border-t border-line bg-recessive px-3 sm:px-4 py-2 text-body t-cap">
                <span>Duplicated from {undo.fromRef}.</span>
                <button type="button"
                  onClick={() => {
                    quote.remove(item.id);
                    setUndo(null);
                    setAnnouncement("Duplicate removed");
                  }}
                  className="font-medium text-sage underline underline-offset-2 cursor-pointer">
                  Undo
                </button>
                <button type="button" onClick={() => setUndo(null)} aria-label="Dismiss duplicate notice"
                  className="ml-auto text-quiet hover:text-ink cursor-pointer">
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : null}
            // The work is happening HERE, where the results will land.
            trailing={processing ? (
              <DocumentProgress uploading={uploading} processingDocs={processingDocs}
                aiPhase={aiPhase} stageLog={stageLog} nowTick={nowTick} />
            ) : null}
          />

        )}

        {/* Add BELOW the list, detached from it — /quote's exact treatment: a
            dashed outline with a gap above, so it reads as "start a new one"
            rather than as a row of the table. Butting it onto the table made it
            an eleventh row with no data in it.
            It exists in addition to the header action because on a long project
            the header is a full scroll from where you finish reading, and the
            new opening lands down here anyway. Deliberately NOT in the sticky
            bar: that is the commit surface, and an authoring action there
            competes with the one thing the bar exists to offer. */}
        {items.length > 0 && (
          <button type="button" onClick={() => openDrawer({ mode: "add" })}
            className="mt-3 w-full flex items-center justify-center gap-1.5 border border-dashed border-black/20 action-hover py-3 text-sage font-medium cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage t-bd-sm">
            <Plus className="w-4 h-4" aria-hidden="true" />Add an opening
          </button>
        )}
      </div>

      <ProjectActionBar
        summary={summary}
        processing={processing}
        onSubmit={() => { setView("review"); window.scrollTo(0, 0); }}
        onFixDetails={fixFirstBlocker}
        onAddOpening={() => openDrawer({ mode: "add" })}
      />

      {menu && menuItem && (
        <MoreMenu
          openingRef={menuItem.code || "this opening"}
          anchorEl={menu.anchor}
          onClose={() => setMenu(null)}
          onDuplicate={() => {
            const newId = quote.copy(menuItem.id);
            if (newId) {
              setUndo({ localId: newId, fromRef: menuItem.code || "this opening" });
              setAnnouncement(`${menuItem.code || "Opening"} duplicated`);
            }
          }}
          onDelete={() => setConfirmDelete(menu.rowKey)}
        />
      )}

      {/* Deletion requires confirmation. Launched only AFTER the menu closes, so
          it is never stacked on the touch action sheet. */}
      {/* Clear-all confirmation — the same destructive dialog /quote uses, with
          the same counts in the same words, so the two arms cannot come to
          describe the same irreversible action differently. */}
      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 quote-drawer-scrim"
          role="dialog" aria-modal="true" aria-label="Clear everything"
          onClick={cancelClear} onKeyDown={(e) => { if (e.key === "Escape") cancelClear(); }}>
          <div ref={clearDialogRef} onClick={(e) => e.stopPropagation()} className="quote-dialog w-full max-w-sm p-5">
            <h3 className="font-semibold text-ink mb-1.5 font-display t-bd">Clear everything?</h3>
            <p className="text-body mb-4 t-bd-sm">
              This removes all {quote.items.length} item{quote.items.length !== 1 ? "s" : ""} and every uploaded document and can't be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="md" onClick={cancelClear}>Cancel</Btn>
              <Btn variant="danger" size="md" onClick={() => void handleClearAll()}>Clear all</Btn>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 quote-drawer-scrim"
          role="dialog" aria-modal="true" aria-label="Delete opening"
          onClick={() => setConfirmDelete(null)}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setConfirmDelete(null); } }}>
          <div className="quote-dialog w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}
            // Focus enters on the SAFE choice; without this a keyboard user has
            // to tab in from <body> and Escape does nothing.
            ref={(el) => el?.querySelector<HTMLElement>("button")?.focus()}>
            <h3 className="font-semibold text-ink mb-1.5 font-display t-bd">
              Delete {deleteItem.code || "this opening"}?
            </h3>
            <p className="text-body mb-4 t-bd-sm">
              This removes the opening from your project and can't be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" size="md" onClick={() => setConfirmDelete(null)}>Cancel</Btn>
              <Btn variant="danger" size="md" onClick={() => {
                const ref = deleteItem.code || "Opening";
                quote.remove(deleteItem.id);
                // Forget the deleted row, or a later row that reuses the key
                // inherits its expansion.
                setOpenedKeys((s) => { const n = new Set(s); n.delete(confirmDelete); return n; });
                if (undo?.localId === deleteItem.id) setUndo(null);
                setConfirmDelete(null);
                setAnnouncement(`${ref} deleted`);
              }}>Delete</Btn>
            </div>
          </div>
        </div>
      )}

      {drawer && (
        <OpeningDrawer
          target={drawer}
          item={drawer.mode === "add" ? null : findByRowKey(items, drawer.rowKey)}
          quote={quote}
          initialSection={drawerSection}
          onClose={() => closeDrawer(drawer.mode === "add" ? null : drawer.rowKey)}
          onSaved={closeDrawer}
        />
      )}
    </div>
  );
}

/** The composer groups product/code issues under its own controls, so a product
 *  or code blocker lands on dimensions — the first group — rather than nowhere. */
function sectionFor(target: ReturnType<typeof fixTargetFor>): "dims" | "options" | "qty" | undefined {
  return target === "options" ? "options" : target === "qty" ? "qty" : "dims";
}
