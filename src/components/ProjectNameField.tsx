// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT NAME — click to rename, in place
//
// Shared by both arms of the quote builder. It lived inside QuotePage as a local
// function, so /quote-project rendered a plain <h1> and its project could not be
// renamed at all — "My Project" was the name forever, which is unusable the
// moment a customer has two.
//
// Extracted rather than copied: the A/B compares presentations of the SAME
// builder, and two implementations of renaming would eventually disagree about
// trimming, the empty fallback or the commit trigger, which is a difference the
// experiment would silently attribute to the presentation.
//
// Behaviour: click (or keyboard-activate) to edit, Enter or blur commits,
// Escape cancels, empty falls back to the default title. Committing only fires
// when the value actually changed, so a click-and-click-away is not a write.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { DEFAULT_PROJECT_TITLE } from "../data/configurator";

export function ProjectNameField({ value, onCommit, className = "" }: {
  value: string;
  onCommit: (v: string) => void;
  /** Type scale of the host heading — the two arms set different sizes. */
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const begin = () => { setDraft(value); setEditing(true); };
  const commit = () => {
    setEditing(false);
    const v = draft.trim() || DEFAULT_PROJECT_TITLE;
    if (v !== value) onCommit(v);
  };
  const cancel = () => { setDraft(value); setEditing(false); };
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);

  const type = className || "text-2xl md:text-3xl";

  if (editing) {
    return (
      <input ref={inputRef} value={draft} maxLength={120} aria-label="Project name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        size={Math.max(draft.length, 12)}
        className={`quote-title-control ${type} font-semibold text-ink leading-tight border border-sage px-2 py-0.5 max-w-full focus:outline-none focus:ring-2 focus:ring-sage/40 font-display`} />
    );
  }
  return (
    <button onClick={begin} aria-label={`Rename project${value ? ` (${value})` : ""}`}
      className={`quote-title-control group/name inline-flex items-center gap-2 ${type} font-semibold text-ink leading-tight border action-hover px-2 py-0.5 max-w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage font-display`}>
      <span className="truncate">{value}</span>
      <Pencil className="w-4 h-4 text-quieter group-hover/name:text-sage flex-shrink-0" aria-hidden="true" />
    </button>
  );
}
