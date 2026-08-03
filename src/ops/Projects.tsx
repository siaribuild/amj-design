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
import { Loader2 } from "lucide-react";
import { opsProjects, type OpsProjectRow } from "./api";
import { ProjectRecord } from "./ProjectRecord";


const MONO = { fontFamily: "'DM Mono', monospace" } as const;
const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;

type Filter = "needs-us" | "open" | "customer" | "production" | "all";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "needs-us", label: "Needs us" },
  { id: "open", label: "All open" },
  { id: "customer", label: "Awaiting customer" },
  { id: "production", label: "In production" },
  { id: "all", label: "All" },
];

export function Projects() {
  const [rows, setRows] = useState<OpsProjectRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("needs-us");

  useEffect(() => { opsProjects().then((r) => setRows(r.projects)).catch(() => setRows([])); }, []);

  const shown = useMemo(() => (rows ?? []).filter((r) => {
    if (filter === "all") return true;
    if (filter === "needs-us") return r.waitingOn === "Us";
    if (filter === "customer") return r.waitingOn === "Customer";
    if (filter === "production") return r.phase === "Production" || r.phase === "Accepted";
    return r.phase !== "Delivered";                       // "All open"
  }), [rows, filter]);

  if (openId) return <ProjectRecord id={openId} onBack={() => setOpenId(null)} />;
  if (!rows) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;

  const withCustomer = rows.filter((r) => r.waitingOn === "Customer").length;

  return (
    <div className="max-w-[1180px]">
      <div className="flex gap-2 mb-4 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="text-xs px-3 py-2 border whitespace-nowrap flex-shrink-0"
            style={{
              background: filter === f.id ? SAGE : "#fff",
              borderColor: filter === f.id ? SAGE : "rgba(0,0,0,0.12)",
              color: filter === f.id ? "#fff" : MUTED,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="bg-white border border-dashed border-black/15 p-12 text-center">
          {/* An empty queue with no context reads as breakage. Say where the work is. */}
          <p className="text-sm" style={{ color: INK }}>
            {filter === "needs-us" ? "Nothing is waiting on us." : "No projects match this filter."}
          </p>
          {filter === "needs-us" && withCustomer > 0 && (
            <button onClick={() => setFilter("customer")} className="text-sm mt-1.5 underline underline-offset-2" style={{ color: SAGE }}>
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
                <span className="text-[13px]" style={{ ...MONO, color: SAGE }}>{r.ref}</span>
                <span className="text-right">
                  <span className="block text-[15px]" style={{ ...MONO, color: INK }}>{money(r.value)}</span>
                  <span className="block text-[11px]" style={{ color: MUTED }}>{r.valueBasis}</span>
                </span>
              </div>
              <p className="text-[15px] truncate mt-0.5" style={{ color: INK }}>{r.title}</p>
              <p className="text-[13px] truncate" style={{ color: "var(--body)" }}>
                {[r.customerName, r.org].filter(Boolean).join(" · ") || "—"}
              </p>
              <div className="flex items-baseline justify-between gap-3 mt-1">
                <span className="text-[12px]" style={{ color: "var(--body)" }}>{r.phase} · {r.stateLabel}</span>
                <span className="text-[12px] flex-shrink-0" style={{ color: r.waitingOn === "Us" ? INK : MUTED, fontWeight: r.waitingOn === "Us" ? 600 : 400 }}>
                  {r.waitingOn} · <span className="font-data">{r.daysInStage ?? "—"}d</span>
                </span>
              </div>
              {r.unresolved > 0 && (
                <span className="inline-block mt-1.5 text-[11px] px-1.5 py-0.5 border" style={{ borderColor: "rgba(180,120,40,0.4)", color: "var(--warning-ink)" }}>
                  Unpriced {r.unresolved}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="hidden lg:block card">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide border-b border-black/8" style={{ color: MUTED }}>
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
                  <td className="px-4 py-2.5" style={{ ...MONO, color: SAGE }}>{r.ref}</td>
                  <td className="px-3 py-2.5" style={{ color: INK }}>
                    {r.title}
                    {r.org && <span className="block text-[11px]" style={{ color: MUTED }}>{r.org}</span>}
                  </td>
                  <td className="px-3 py-2.5" style={{ color: MUTED }}>
                    {r.customerName ?? "—"}
                    {r.customerEmail && <span className="block text-[11px]">{r.customerEmail}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ ...MONO, color: MUTED }}>{r.lineCount}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="block" style={{ ...MONO, color: INK }}>{money(r.value)}</span>
                    {/* Three different meanings can sit in this column. Name which. */}
                    <span className="block text-[11px]" style={{ color: MUTED }}>{r.valueBasis}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block text-[13px]" style={{ color: INK, fontWeight: 600 }}>{r.phase}</span>
                    <span className="block text-[11px]" style={{ color: MUTED }}>{r.stateLabel}</span>
                  </td>
                  {/* Never colour alone — the word IS the value here. */}
                  <td className="px-3 py-2.5 text-[13px]"
                    style={{ color: r.waitingOn === "Us" ? INK : MUTED, fontWeight: r.waitingOn === "Us" ? 600 : 400 }}>
                    {r.waitingOn}
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ ...MONO, color: MUTED }}>{r.daysInStage ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {r.unresolved > 0 && (
                      <span className="text-[11px] px-1.5 py-0.5 border" style={{ borderColor: "rgba(180,120,40,0.4)", color: "var(--warning-ink)" }}>
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
