// Ops → Projects: ONE list of jobs, at every stage.
//
// This replaces the Quotes queue and the Orders list, which were the same set of
// records filtered differently — every order query already joined the project
// back in, and the Orders detail view re-fetched the project's title and customer
// after each action just to keep its own header intact.
//
// Two columns here do not exist anywhere today and carry most of the value:
//
//  • WAITING ON — us, the customer, or nobody. Derived, no join, no write. It is
//    what replaces the assignee column, and at two staff it is strictly more
//    useful: "whose move is it" beats "whose name is on it".
//  • DAYS IN STAGE — sorted descending within "ours". The default answers "what
//    do I touch next", which `updated_at` cannot: that moves when the CUSTOMER
//    replies, burying our oldest obligation under the newest event.
import { SAGE, INK, QUIET as MUTED } from "../styles/tokens";
import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { opsProjects, type OpsProjectRow } from "./api";
import { ProjectRecord } from "./ProjectRecord";


const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;

type Filter = "needs-us" | "open" | "customer" | "production" | "all";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "needs-us", label: "Needs us" },
  { id: "open", label: "All open" },
  { id: "customer", label: "Awaiting customer" },
  { id: "production", label: "In production" },
  { id: "all", label: "All" },
];
// The two people actually live in day to day ("whose move is it", then the
// general fallback). The rest sit behind "More filters" instead of a scrolling
// chip row — a phone should never need a sideways swipe to see what it can
// filter by, and five permanently-open chips is the schema talking, not a
// disclosure decision.
const PRIMARY = FILTERS.slice(0, 2);
const SECONDARY = FILTERS.slice(2);

function matchesFilter(r: OpsProjectRow, id: Filter) {
  if (id === "all") return true;
  if (id === "needs-us") return r.waitingOn === "Us";
  if (id === "customer") return r.waitingOn === "Customer";
  if (id === "production") return r.phase === "Production" || r.phase === "Accepted";
  return r.phase !== "Delivered";                       // "All open"
}

export function Projects() {
  const [rows, setRows] = useState<OpsProjectRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("needs-us");
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => { opsProjects().then((r) => setRows(r.projects)).catch(() => setRows([])); }, []);

  const shown = useMemo(() => (rows ?? []).filter((r) => matchesFilter(r, filter)), [rows, filter]);
  // Every filter's count, not just the active one — the same reasoning as the
  // Dashboard's "Needs us" rows: a number beside a name is what lets someone
  // decide whether to open "More filters" at all.
  const counts = useMemo(() => {
    const c = {} as Record<Filter, number>;
    FILTERS.forEach((f) => { c[f.id] = (rows ?? []).filter((r) => matchesFilter(r, f.id)).length; });
    return c;
  }, [rows]);

  // Same technique as MobileNav in OpsApp.tsx, mirrored to the right: escape
  // closes, and the page behind does not scroll while it is open.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMoreOpen(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [moreOpen]);

  if (openId) return <ProjectRecord id={openId} onBack={() => setOpenId(null)} />;
  if (!rows) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;

  const withCustomer = rows.filter((r) => r.waitingOn === "Customer").length;
  const activeIsSecondary = SECONDARY.some((f) => f.id === filter);

  return (
    <div className="max-w-[1180px]">
      <div className="flex items-center gap-2 mb-4">
        {PRIMARY.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-3 py-2 border t-cap"
            style={{
              background: filter === f.id ? SAGE : "#fff",
              borderColor: filter === f.id ? SAGE : "rgba(0,0,0,0.12)",
              color: filter === f.id ? "#fff" : MUTED,
            }}>
            {f.label} <span className="font-data" style={{ opacity: 0.7 }}>{counts[f.id]}</span>
          </button>
        ))}
        <button onClick={() => setMoreOpen(true)}
          className="px-3 py-2 border t-cap flex items-center gap-1.5"
          style={{
            background: "#fff",
            borderColor: activeIsSecondary ? SAGE : "rgba(0,0,0,0.12)",
            color: activeIsSecondary ? SAGE : MUTED,
          }}>
          {activeIsSecondary ? FILTERS.find((f) => f.id === filter)!.label : "More filters"}
          {activeIsSecondary && <span className="font-data">{counts[filter]}</span>}
        </button>
      </div>

      {/* Same technique as MobileNav (OpsApp.tsx), mirrored to the right, and
          full-width below md rather than a fixed phone width — a filter list on
          a 375px screen has nowhere else to go. */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 bg-black/45" onClick={() => setMoreOpen(false)} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full md:w-[360px] md:max-w-[92vw] bg-white flex flex-col border-l border-black/10
                    transition-transform duration-200 ease-out
                    ${moreOpen ? "translate-x-0" : "translate-x-full invisible"}`}
        aria-hidden={!moreOpen}>
        <div className="px-5 h-12 flex items-center justify-between border-b border-black/8 flex-shrink-0">
          <span className="t-bd font-semibold" style={{ color: INK }}>Filter</span>
          <button onClick={() => setMoreOpen(false)} className="w-10 h-10 -mr-2 flex items-center justify-center text-body" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {SECONDARY.map((f) => (
            <button key={f.id} onClick={() => { setFilter(f.id); setMoreOpen(false); }}
              className="w-full flex items-center justify-between gap-3 px-5 h-11 border-l-2 t-bd-sm"
              style={filter === f.id
                ? { color: INK, borderColor: SAGE, background: "rgba(0,0,0,0.02)" }
                : { color: MUTED, borderColor: "transparent" }}>
              <span>{f.label}</span>
              <span className="font-data" style={{ color: MUTED }}>{counts[f.id]}</span>
            </button>
          ))}
        </nav>
      </aside>

      {shown.length === 0 ? (
        <div className="bg-white border border-dashed border-black/15 p-12 text-center">
          {/* An empty queue with no context reads as breakage. Say where the work is. */}
          <p className="t-bd-sm" style={{ color: INK }}>
            {filter === "needs-us" ? "Nothing is waiting on us." : "No projects match this filter."}
          </p>
          {filter === "needs-us" && withCustomer > 0 && (
            <button onClick={() => setFilter("customer")} className="mt-1.5 underline underline-offset-2 t-bd-sm" style={{ color: SAGE }}>
              {withCustomer} project{withCustomer === 1 ? " is" : "s are"} with the customer
            </button>
          )}
        </div>
      ) : (
        <>
        {/* PHONE — card per row. Not a horizontally scrolling table: this list
            exists to be SCANNED, and a scan that needs a sideways swipe per row
            is not a scan. Not column-priority either — nine columns down to three
            is a card wearing a table costume, and the hidden cells still ship. */}
        <div className="lg:hidden -mx-4 border-y border-black/8 bg-white">
          {shown.map((r) => (
            <button key={r.id} onClick={() => setOpenId(r.id)}
              className="w-full text-left px-4 py-3 border-b border-black/8 last:border-0 active:bg-bone">
              <div className="flex items-baseline justify-between gap-3">
                <span className="t-cap font-data" style={{ color: SAGE }}>{r.ref}</span>
                <span className="text-right">
                  <span className="block t-bd font-data" style={{ color: INK }}>{money(r.value)}</span>
                  <span className="block t-cap" style={{ color: MUTED }}>{r.valueBasis}</span>
                </span>
              </div>
              <p className="truncate mt-0.5 t-bd" style={{ color: INK }}>{r.title}</p>
              <p className="truncate t-cap" style={{ color: "var(--body)" }}>
                {[r.customerName, r.org].filter(Boolean).join(" · ") || "—"}
              </p>
              <div className="flex items-baseline justify-between gap-3 mt-1">
                <span className="t-cap" style={{ color: "var(--body)" }}>{r.phase} · {r.stateLabel}</span>
                <span className={`flex-shrink-0 t-cap ${r.waitingOn === "Us" ? "font-semibold" : "font-normal"}`} style={{ color: r.waitingOn === "Us" ? INK : MUTED }}>
                  {r.waitingOn} · <span className="font-data">{r.daysInStage ?? "—"}d</span>
                </span>
              </div>
              {r.unresolved > 0 && (
                <span className="inline-block mt-1.5 px-1.5 py-0.5 border t-cap" style={{ borderColor: "rgba(180,120,40,0.4)", color: "var(--warning-ink)" }}>
                  Unpriced {r.unresolved}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="hidden lg:block card">
          <table className="w-full t-bd-sm">
            <thead>
              <tr className="text-left border-b border-black/8 t-label" style={{ color: MUTED }}>
                <th className="px-4 py-2.5 font-medium">Ref</th>
                <th className="px-3 py-2.5 font-medium">Project</th>
                <th className="px-3 py-2.5 font-medium">Customer</th>
                <th className="px-3 py-2.5 font-medium text-right">Lines</th>
                <th className="px-3 py-2.5 font-medium text-right">Value</th>
                <th className="px-3 py-2.5 font-medium">Stage</th>
                <th className="px-3 py-2.5 font-medium">Waiting on</th>
                <th className="px-3 py-2.5 font-medium text-right">Days in stage</th>
                <th className="px-4 py-2.5 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} onClick={() => setOpenId(r.id)}
                  className="border-b border-black/5 last:border-0 cursor-pointer hover:bg-bone">
                  <td className="px-4 py-2.5 font-data" style={{ color: SAGE }}>{r.ref}</td>
                  <td className="px-3 py-2.5" style={{ color: INK }}>
                    {r.title}
                    {r.org && <span className="block t-cap" style={{ color: MUTED }}>{r.org}</span>}
                  </td>
                  <td className="px-3 py-2.5" style={{ color: MUTED }}>
                    {r.customerName ?? "—"}
                    {r.customerEmail && <span className="block t-cap">{r.customerEmail}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-data" style={{ color: MUTED }}>{r.lineCount}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="block font-data" style={{ color: INK }}>{money(r.value)}</span>
                    {/* Three different meanings can sit in this column. Name which. */}
                    <span className="block t-cap" style={{ color: MUTED }}>{r.valueBasis}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block t-cap font-semibold" style={{ color: INK }}>{r.phase}</span>
                    <span className="block t-cap" style={{ color: MUTED }}>{r.stateLabel}</span>
                  </td>
                  {/* Never colour alone — the word IS the value here. */}
                  <td className="px-3 py-2.5 t-cap"
                    style={{ color: r.waitingOn === "Us" ? INK : MUTED }}>
                    {r.waitingOn}
                  </td>
                  <td className="px-3 py-2.5 text-right font-data" style={{ color: MUTED }}>{r.daysInStage ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {r.unresolved > 0 && (
                      <span className="px-1.5 py-0.5 border t-cap" style={{ borderColor: "rgba(180,120,40,0.4)", color: "var(--warning-ink)" }}>
                        Unpriced {r.unresolved}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
