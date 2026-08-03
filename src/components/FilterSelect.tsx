// ─── A compact in-page filter dropdown ────────────────────────────────────────
// Lifted out of ProductsPage's MobileFamilySelector when a second surface (the
// guides index, which filters on two axes) needed the identical control. Two
// call sites is when you extract: this is ~50 lines of dropdown with
// outside-click and Escape handling, and two hand-maintained copies diverge.
//
// Deliberately NOT a native <select>: the options carry a count, which a native
// select cannot show, and the count is what makes a filter worth opening.
// Deliberately not a full-screen drawer either — a modal to choose one of five
// things is a heavier promise than the choice deserves.
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface FilterOption { slug: string; name: string; count?: number }

export function FilterSelect({ label, listLabel, options, value, unit = "item", onSelect }: {
  /** The small mono heading above the control. */
  label: string;
  /** Accessible name for the listbox — what the options ARE. */
  listLabel: string;
  options: FilterOption[];
  value: string;
  /** Singular noun for the per-option count. Pluralised with a trailing "s". */
  unit?: string;
  onSelect: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);

  const current = options.find((o) => o.slug === value) ?? options[0];
  if (!current) return null;
  const choose = (slug: string) => { onSelect(slug); setOpen(false); };

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-body mb-2 font-data">{label}</p>
      <div className="relative" ref={ref}>
        <button type="button" onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox" aria-expanded={open}
          className="w-full flex items-center justify-between gap-3 card px-4 py-3 text-sm text-ink cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2">
          <span className="font-medium">{current.name}</span>
          <ChevronDown className={`w-4 h-4 text-body flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div role="listbox" aria-label={listLabel}
            className="absolute left-0 right-0 top-full mt-1 z-30 card border-line-strong max-h-[60vh] overflow-y-auto">
            {options.map((o) => {
              const active = o.slug === value;
              return (
                <button key={o.slug} type="button" role="option" aria-selected={active} onClick={() => choose(o.slug)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm border-b border-black/6 last:border-b-0 cursor-pointer transition-colors ${active ? "bg-sage-wash text-ink font-semibold" : "text-ink hover:bg-black/[0.02]"}`}>
                  <span>{o.name}</span>
                  {typeof o.count === "number" && (
                    <span className="text-xs text-body flex-shrink-0">{o.count} {unit}{o.count === 1 ? "" : "s"}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
