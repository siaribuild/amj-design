// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT NAME — a heading that can be renamed, not a field that holds a heading
//
// Shared by both arms of the quote builder. It lived inside QuotePage as a local
// function, so /quote-project rendered a plain <h1> and its project could not be
// renamed at all — "My Project" was the name forever, which is unusable the
// moment a customer has two.
//
// ─── Two reversals (owner, 2026-08-04) ────────────────────────────────────────
//
// 1. AT REST IT IS TEXT. It used to be a bordered, padded control at ALL times —
//    an input-shaped thing 26px tall sitting beside 44px action buttons, so it
//    read as a broken form field rather than a title. Making the box bigger was
//    the other option and is worse: a permanent input asks "what do I type
//    here?" of someone who came to read their project name, and nothing else on
//    this page is an always-on field. The box appears only while editing.
//
//    A side benefit of dropping the button wrapper: the title is selectable text
//    again. It could not be copied while it was the label of a <button>.
//
// 2. SAVING IS EXPLICIT. Enter-or-blur used to commit. Every other edit on this
//    route is confirmed with a button — the drawer's "Save changes", the
//    composer's own — so the title was the one place where clicking away wrote
//    to the server. Save and Cancel are real controls now. Enter and Escape
//    still work as accelerators, because a single-field form that ignores Enter
//    is its own surprise, but BLUR NO LONGER COMMITS: clicking away neither
//    saves nor discards, it just leaves the editor open where you left it.
//
// Empty falls back to the default title, and committing only fires when the
// value actually changed, so open-and-save with no edit is not a write.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { DEFAULT_PROJECT_TITLE } from "../data/configurator";

export function ProjectNameField({ value, onCommit, className = "", heading = false }: {
  value: string;
  onCommit: (v: string) => void;
  /** Type scale of the host heading — the two arms set different sizes. */
  className?: string;
  /** Render the name as the page's <h1>.
   *
   *  The caller used to supply the heading and wrap this whole component in it,
   *  which was fine while the editor was a lone input and became wrong the
   *  moment it grew Save and Cancel: an <h1> containing buttons has the
   *  accessible name "Save Cancel". Owning the element lets the heading hold the
   *  NAME in both states — visible at rest, sr-only behind the editor — so the
   *  page never loses its h1 and never mislabels it. /quote passes nothing: its
   *  h1 is the hero, and a second one there would be the same bug reversed. */
  heading?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const editBtnRef = useRef<HTMLButtonElement>(null);

  const begin = () => { setDraft(value); setEditing(true); };
  const close = () => {
    setEditing(false);
    // Focus returns to the control that opened the editor — otherwise it falls
    // to <body> when the input unmounts, which strands a keyboard user.
    requestAnimationFrame(() => editBtnRef.current?.focus());
  };
  const commit = () => {
    const v = draft.trim() || DEFAULT_PROJECT_TITLE;
    close();
    if (v !== value) onCommit(v);
  };
  const cancel = () => { setDraft(value); close(); };

  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);

  const type = className || "t-hd2";

  if (editing) {
    return (
      <span className="flex items-center gap-2 flex-wrap min-w-0">
        {heading && <h1 className="sr-only">{value}</h1>}
        <input ref={inputRef} value={draft} maxLength={120} aria-label="Project name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            else if (e.key === "Escape") { e.preventDefault(); cancel(); }
          }}
          size={Math.max(draft.length, 16)}
          className={`quote-title-control ${type} font-semibold text-ink leading-tight border border-sage px-2.5 min-h-[44px] max-w-full focus:outline-none focus:ring-2 focus:ring-sage/40 font-display`} />
        {/* Outlined, not filled: the sticky bar owns this page's ONE primary
            action, and a second filled control up here would compete with it. */}
        <button type="button" onClick={commit} aria-label="Save project name"
          className="card inline-flex items-center gap-1.5 px-3 min-h-[44px] font-medium text-sage hover:border-sage cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage t-bd-sm">
          <Check className="w-4 h-4" aria-hidden="true" />Save
        </button>
        <button type="button" onClick={cancel} aria-label="Cancel renaming"
          className="inline-flex items-center gap-1.5 px-2.5 min-h-[44px] font-medium text-body-soft hover:text-ink cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage t-cap">
          <X className="w-3.5 h-3.5" aria-hidden="true" />Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 min-w-0">
      {heading
        ? <h1 className={`${type} font-semibold text-ink leading-tight truncate font-display`}>{value}</h1>
        : <span className={`${type} font-semibold text-ink leading-tight truncate font-display`}>{value}</span>}
      {/* 44px like every other icon control on this route, so the header keeps
          one touch-target rhythm — but borderless, because at rest this is a
          title with an affordance beside it, not a second button. */}
      <button ref={editBtnRef} type="button" onClick={begin}
        aria-label={`Rename project${value ? ` (${value})` : ""}`}
        className="w-11 h-11 lg:w-9 lg:h-9 inline-flex items-center justify-center flex-shrink-0 text-quieter hover:text-sage icon-btn cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage">
        <Pencil className="w-4 h-4" aria-hidden="true" />
      </button>
    </span>
  );
}
