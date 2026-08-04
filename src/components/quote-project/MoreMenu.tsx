// ═══════════════════════════════════════════════════════════════════════════════
// MORE MENU — secondary row actions only
//
// Plan §7.4. Edit is never in here: the most common action stays directly
// reachable on the row. This menu carries Duplicate and Delete.
//
// "Edit composite" was removed: it called openDrawer({mode:"edit"}) — the exact
// call the row's Edit pencil already makes — so it was a second name for a
// control already on the row, and it appeared only for composites, which made
// the menu's contents depend on line type for no gain.
//
// D3 (owner): NO "Split". The ENGINE exists — splitLine() in lib/composite.ts,
// with validateSplit and the composite policy — but it is reachable only from
// Ops, deliberately: whether an opening must be split is a manufacturing
// constraint, not a customer preference. Customers lost add-unit and
// remove-unit for the same reason (2026-08-04), so an item here would be the
// one customer route to a decision every other path denies them. Split, merge
// and the coverage validation that should gate all three come back together as
// a platform capability, ops first.
//
// Two surfaces, because a popover pinned to a row is wrong under a thumb:
//   desktop  anchored popover beside the row
//   touch    bottom action sheet titled with the opening reference
// Never a centred modal for the MENU. (The Delete CONFIRM is a centred dialog,
// but it is opened only after this menu has closed — never stacked on the sheet.)
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Trash2 } from "lucide-react";

export function MoreMenu({ openingRef, anchorEl, onClose, onDuplicate, onDelete }: {
  openingRef: string;
  /** The row's More button — used to position the popover and to restore focus. */
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Coarse pointer OR small viewport gets the sheet: both mean a thumb.
  const [sheet] = useState(() =>
    typeof window !== "undefined"
    && (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 1024));

  // Focus enters the menu, Escape leaves it, and focus goes back where it came
  // from — the same contract as the drawer, at a smaller scale.
  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
  }, []);

  const dismiss = () => { onClose(); anchorEl?.focus(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); dismiss(); } };
    const onDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (anchorEl?.contains(e.target as Node)) return;   // the toggle handles itself
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorEl]);

  // Restore focus BEFORE running: Duplicate and Delete both re-render the list,
  // and a menu item that unmounts while focused drops focus to <body>.
  const run = (fn: () => void) => { onClose(); anchorEl?.focus(); fn(); };

  const items = (
    <>
      <button role="menuitem" type="button" onClick={() => run(onDuplicate)}
        className="w-full flex items-center gap-2.5 px-3 min-h-[44px] text-ink hover:bg-recessive cursor-pointer focus:outline-none focus-visible:bg-recessive t-bd-sm">
        <Copy className="w-4 h-4 text-body flex-shrink-0" aria-hidden="true" />Duplicate
      </button>
      <button role="menuitem" type="button" onClick={() => run(onDelete)}
        className="w-full flex items-center gap-2.5 px-3 min-h-[44px] text-destructive hover:bg-recessive cursor-pointer focus:outline-none focus-visible:bg-recessive t-bd-sm">
        <Trash2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />Delete
      </button>
    </>
  );

  if (sheet) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-end" onClick={dismiss}>
        <div className="absolute inset-0 scrim quote-drawer-scrim" aria-hidden="true" />
        <div ref={menuRef} role="menu" aria-label={`Actions for ${openingRef}`}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full quote-dialog border-t py-1"
          style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
          <p className="px-3 py-2 text-quiet t-label">{openingRef}</p>
          {items}
        </div>
      </div>,
      document.body,
    );
  }

  // Anchored beside the row. Right-aligned to the trigger so it never runs off
  // the viewport edge on a wide list.
  const rect = anchorEl?.getBoundingClientRect();
  return createPortal(
    <div ref={menuRef} role="menu" aria-label={`Actions for ${openingRef}`}
      className="fixed z-50 min-w-48 quote-dialog py-1"
      style={{
        top: rect ? Math.min(rect.bottom + 4, window.innerHeight - 160) : 0,
        right: rect ? Math.max(8, window.innerWidth - rect.right) : 8,
      }}>
      {items}
    </div>,
    document.body,
  );
}
