// Ops → Enquiries: Contact-page leads (questions + showroom appointments).
// List with intent/status tabs + filters; detail with the four status dimensions,
// attribution (immutable source), activity trail, manufacturer handoff + downstream
// reconciliation. Source is always OpenFrame — never editable here.
import { SAGE } from "../styles/tokens";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Loader2, HelpCircle, CalendarClock, Mail, Phone, MapPin, ExternalLink } from "lucide-react";
import {
  opsEnquiries, opsEnquiry, opsUpdateEnquiry, opsLogContact,
  type OpsUser, type OpsEnquiryRow, type OpsEnquiryDetail, type OpsEnquiryActivity,
} from "./api";

const WORKFLOW = ["new", "assigned", "in_progress", "waiting_on_customer", "closed"];
const CONTACT = ["not_contacted", "attempted", "contacted", "no_response"];
const APPOINTMENT = ["not_applicable", "requested", "proposed", "confirmed", "completed", "cancelled", "no_show"];
const COMMERCIAL = ["unknown", "manufacturer_quote_created", "order_placed", "lost", "not_applicable"];
const humanize = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());
const when = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const TABS: { id: string; label: string; params: Record<string, string> }[] = [
  { id: "all", label: "All", params: {} },
  { id: "new", label: "New", params: { status: "new" } },
  { id: "question", label: "Question", params: { intent: "question" } },
  { id: "appointment", label: "Appointment", params: { intent: "appointment_request" } },
  { id: "contacted", label: "Contacted", params: { contact: "contacted" } },
  { id: "closed", label: "Closed", params: { status: "closed" } },
];

const statusClass = (s: string) => {
  if (["new", "requested"].includes(s)) return "text-amber-700 bg-amber-50 border-amber-200";
  if (["closed", "completed", "order_placed"].includes(s)) return "text-blue-700 bg-blue-50 border-blue-200";
  if (["contacted", "confirmed", "manufacturer_quote_created"].includes(s)) return "text-sage-ink bg-sage-wash border-sage/25";
  if (["lost", "cancelled", "no_show", "no_response"].includes(s)) return "text-red-700 bg-red-50 border-red-200";
  return "text-body bg-bone border-black/10";
};

const IntentBadge = ({ intent }: { intent: string }) => (
  <span className="inline-flex items-center gap-1 text-xs text-body">
    {intent === "appointment_request" ? <CalendarClock className="w-3.5 h-3.5 text-sage" /> : <HelpCircle className="w-3.5 h-3.5 text-sage" />}
    {intent === "appointment_request" ? "Appointment" : "Question"}
  </span>
);

export function Enquiries({ user }: { user: OpsUser }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId
    ? <Detail id={openId} user={user} onBack={() => setOpenId(null)} />
    : <List onOpen={setOpenId} />;
}

function List({ onOpen }: { onOpen: (id: string) => void }) {
  const [tab, setTab] = useState("all");
  const [rows, setRows] = useState<OpsEnquiryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setRows(null); setError(null);
    opsEnquiries(TABS.find((t) => t.id === tab)!.params).then((r) => setRows(r.enquiries)).catch((e) => setError(String(e?.message ?? e)));
  }, [tab]);

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-black/8 mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? "border-sage text-ops font-medium" : "border-transparent text-quiet hover:text-ops"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {error ? <div className="bg-white border border-red-200 p-6 text-sm text-red-600">Couldn't load enquiries. {error}</div>
        : !rows ? <Loader2 className="w-5 h-5 text-black/30 animate-spin" />
        : !rows.length ? <div className="bg-white border border-dashed border-black/15 p-12 text-center text-sm text-body">No enquiries in this view.</div>
        : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-quiet border-b border-black/8">
                  {["Reference", "Type", "Customer", "Contact", "Location", "Source", "Submitted", "Owner", "Status"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} onClick={() => onOpen(e.id)} className="border-b border-black/5 last:border-0 hover:bg-bone cursor-pointer">
                    <td className="px-4 py-3 font-mono text-xs text-ops whitespace-nowrap">{e.reference}</td>
                    <td className="px-4 py-3"><IntentBadge intent={e.intent} /></td>
                    <td className="px-4 py-3 text-ops">{e.name}{e.company && <span className="block text-xs text-quiet">{e.company}</span>}</td>
                    <td className="px-4 py-3 text-body">{e.email}{e.phone && <span className="block text-xs text-quiet">{e.phone}</span>}</td>
                    <td className="px-4 py-3 text-body">{e.locationSuburb ? `${e.locationState} – ${e.locationSuburb}` : "—"}</td>
                    <td className="px-4 py-3"><span className="text-[11px] px-1.5 py-0.5 border border-sage/30 bg-sage-wash text-sage-ink whitespace-nowrap">OpenFrame Website</span></td>
                    <td className="px-4 py-3 text-quiet whitespace-nowrap">{when(e.createdAt)}</td>
                    <td className="px-4 py-3 text-body whitespace-nowrap">{e.assignedName ?? "—"}</td>
                    <td className="px-4 py-3"><span className={`text-[11px] px-2 py-0.5 border ${statusClass(e.workflowStatus)}`}>{humanize(e.workflowStatus)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function Detail({ id, user, onBack }: { id: string; user: OpsUser; onBack: () => void }) {
  const [d, setD] = useState<OpsEnquiryDetail | null>(null);
  const [activity, setActivity] = useState<OpsEnquiryActivity[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [quoteRef, setQuoteRef] = useState("");
  const [orderRef, setOrderRef] = useState("");

  const load = () => opsEnquiry(id).then((r) => { setD(r.enquiry); setActivity(r.activity); setQuoteRef(r.enquiry.manufacturerQuoteRef ?? ""); setOrderRef(r.enquiry.manufacturerOrderRef ?? ""); }).catch(() => setError(true));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { const r = await opsUpdateEnquiry(id, body); setD(r.enquiry); await opsEnquiry(id).then((x) => setActivity(x.activity)); }
    finally { setBusy(false); }
  };
  const logContact = async (outcome: string) => { setBusy(true); try { await opsLogContact(id, outcome); await load(); } finally { setBusy(false); } };

  if (error) return <div className="bg-white border border-red-200 p-6 text-sm text-red-600">Couldn't load this enquiry.</div>;
  if (!d) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;
  const isAppt = d.intent === "appointment_request";

  return (
    <div className="max-w-4xl">
      <button onClick={onBack} className="text-xs text-body hover:text-ops flex items-center gap-1 mb-4"><ChevronLeft className="w-3.5 h-3.5" />Back to enquiries</button>

      {/* Summary header */}
      <div className="card p-5 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-sm text-ops">{d.reference}</span>
              <IntentBadge intent={d.intent} />
              <span className="text-[11px] px-1.5 py-0.5 border border-sage/30 bg-sage-wash text-sage-ink">Source: OpenFrame Website</span>
            </div>
            <h2 className="text-lg font-semibold text-ops mt-1 font-display">{d.name}{d.company ? ` · ${d.company}` : ""}</h2>
            <p className="text-xs text-quiet">Submitted {when(d.createdAt)}{d.assignedName ? ` · owner ${d.assignedName}` : " · unassigned"}</p>
          </div>
          <div className="flex items-center gap-2">
            {d.assignedUser !== user.id && <button onClick={() => patch({ assignedUser: user.id })} disabled={busy} className="text-xs px-3 py-1.5 border border-sage text-sage-ink hover:bg-sage-wash disabled:opacity-50">Assign to me</button>}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_300px] gap-5">
        <div className="space-y-5">
          {/* Customer */}
          <Panel title="Customer">
            <Row label="Type">{d.customerType || "—"}</Row>
            <Row label="Email"><a href={`mailto:${d.email}`} className="text-sage-ink hover:underline inline-flex items-center gap-1">{d.email}<ExternalLink className="w-3 h-3" /></a></Row>
            {d.phone && <Row label="Phone"><a href={`tel:${d.phone}`} className="hover:underline">{d.phone}</a></Row>}
            {d.accountId && <Row label="Account">Signed-in customer</Row>}
          </Panel>

          {/* Submission */}
          <Panel title="Submission">
            {isAppt ? (
              <>
                <Row label="Showroom">{d.locationSuburb ? `${d.locationState} – ${d.locationSuburb}` : "—"}</Row>
                <Row label="Best time">{d.bestTimeToCall ? humanize(d.bestTimeToCall) : "—"}</Row>
                {d.preferredDays.length > 0 && <Row label="Days">{d.preferredDays.map(humanize).join(", ")}</Row>}
                {d.productsInterest && <Row label="Products">{humanize(d.productsInterest)}</Row>}
                {d.appointmentNotes && <Row label="Notes">{d.appointmentNotes}</Row>}
              </>
            ) : (
              <>
                {d.topic && <Row label="Topic">{d.topic}</Row>}
                <div className="pt-1"><p className="text-[11px] uppercase tracking-wide text-quiet mb-1">Message</p><p className="text-sm text-ops whitespace-pre-wrap leading-relaxed">{d.message}</p></div>
              </>
            )}
          </Panel>

          {/* Manufacturer handoff + reconciliation */}
          {isAppt && (
            <Panel title="Manufacturer handoff & reconciliation">
              <Row label="Handed off">{d.handedOffAt ? when(d.handedOffAt) : "—"}</Row>
              <Row label="Acknowledged">{d.manufacturerAckAt ? when(d.manufacturerAckAt) : <button onClick={() => patch({ manufacturerAck: true })} disabled={busy} className="text-xs text-sage-ink underline disabled:opacity-50">Mark acknowledged</button>}</Row>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <label className="block"><span className="text-[10px] uppercase tracking-wide text-quiet">AMJ quote ref</span>
                  <input value={quoteRef} onChange={(e) => setQuoteRef(e.target.value)} onBlur={() => quoteRef !== (d.manufacturerQuoteRef ?? "") && patch({ manufacturerQuoteRef: quoteRef })} placeholder="—" className="mt-0.5 w-full border border-black/15 px-2 py-1.5 text-sm outline-none focus:border-sage" /></label>
                <label className="block"><span className="text-[10px] uppercase tracking-wide text-quiet">AMJ order ref</span>
                  <input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} onBlur={() => orderRef !== (d.manufacturerOrderRef ?? "") && patch({ manufacturerOrderRef: orderRef })} placeholder="—" className="mt-0.5 w-full border border-black/15 px-2 py-1.5 text-sm outline-none focus:border-sage" /></label>
              </div>
              <p className="text-[11px] text-quietest pt-1">Adding a downstream AMJ reference never changes the OpenFrame source owner.</p>
            </Panel>
          )}

          {/* Attribution */}
          <Panel title="Attribution">
            <Row label="Source owner"><span className="text-ops">{d.sourceOwner}</span> <span className="text-[11px] text-quietest">(immutable)</span></Row>
            <Row label="Entry point">{d.sourceEntryPoint}</Row>
            {d.landingPath && <Row label="Landing">{d.landingPath}</Row>}
            {d.referrer && <Row label="Referrer">{d.referrer}</Row>}
            {Object.keys(d.utm).length > 0 && <Row label="UTM">{Object.entries(d.utm).map(([k, v]) => `${k}=${v}`).join(" · ")}</Row>}
            <Row label="Form">{d.formVersion}</Row>
          </Panel>

          {/* Activity */}
          <Panel title="Activity">
            {activity.length === 0 && <p className="text-xs text-quietest">No activity yet.</p>}
            {activity.map((a, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 py-1.5 border-b border-black/5 last:border-0 text-sm">
                <span className="text-ops">{a.action}</span>
                <span className="text-[11px] text-quiet whitespace-nowrap">{a.actor ?? "system"} · {when(a.occurred_at)}</span>
              </div>
            ))}
          </Panel>
        </div>

        {/* Status rail */}
        <aside className="space-y-4">
          <div className="card p-4 space-y-3">
            <p className="text-[11px] uppercase tracking-wide text-quiet">Status</p>
            <StatusSelect label="Workflow" value={d.workflowStatus} options={WORKFLOW} disabled={busy} onChange={(v) => patch({ workflowStatus: v })} />
            <StatusSelect label="Contact" value={d.contactOutcome} options={CONTACT} disabled={busy} onChange={(v) => patch({ contactOutcome: v })} />
            {isAppt && <StatusSelect label="Appointment" value={d.appointmentStatus} options={APPOINTMENT} disabled={busy} onChange={(v) => patch({ appointmentStatus: v })} />}
            <StatusSelect label="Commercial" value={d.commercialOutcome} options={COMMERCIAL} disabled={busy} onChange={(v) => patch({ commercialOutcome: v })} />
          </div>
          <div className="card p-4">
            <p className="text-[11px] uppercase tracking-wide text-quiet mb-2">Log a contact attempt</p>
            <div className="flex flex-wrap gap-1.5">
              {["attempted", "contacted", "no_response"].map((o) => (
                <button key={o} onClick={() => logContact(o)} disabled={busy} className="text-xs px-2.5 py-1.5 border border-black/15 text-body hover:border-sage disabled:opacity-50">{humanize(o)}</button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="text-[11px] uppercase tracking-wide text-quiet mb-3">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3 text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-quiet sm:w-28 sm:flex-shrink-0">{label}</span>
      <span className="text-ops min-w-0 break-words">{children}</span>
    </div>
  );
}
function StatusSelect({ label, value, options, disabled, onChange }: { label: string; value: string; options: string[]; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-quiet">{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full card px-2 py-1.5 text-sm text-ops outline-none focus:border-sage disabled:opacity-60">
        {options.map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
      </select>
    </label>
  );
}
