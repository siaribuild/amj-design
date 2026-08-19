// Ops → Customers: registered customer list + 360 view (profile, projects, orders).
// Customers are user accounts (the organisation layer isn't wired); business name
// and ABN come from each customer's own profile. Staff with an assigned role can
// edit the profile; the sign-in email is the unique login ID — customers can't
// change it themselves, and only ADMINS can here.
import { SAGE } from "../styles/tokens";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Loader2, User, Mail, Phone, Building2, PenLine, Lock } from "lucide-react";
import {
  opsCustomers, opsCustomer, opsUpdateCustomer,
  opsTradeApplications, opsTradeApprove, opsTradeReject, opsTradeRevoke,
  type OpsCustomer, type OpsCustomerDetail, type OpsUser, type OpsTradeApplication,
} from "./api";

const money = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-AU")}`);
const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s.replace(" ", "T") + "Z");
  return isNaN(+d) ? "—" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
};

/** Why an application is sitting here, in a person's words.
 *
 *  The engine's reason codes are precise and unreadable; these are what a
 *  reviewer needs to see at a glance to know which check to make. STAFF ONLY —
 *  no customer surface ever names a reason (AC-P2-44). */
const QUEUE_REASON: Record<string, string> = {
  email_domain: "Free-mail address",
  name_mismatch: "Name doesn't match",
  abn_inactive: "ABN not active",
  abn_not_found: "ABN not found",
  duplicate_abn: "Also verified elsewhere",
  abr_unavailable: "Register unavailable",
};

const SOURCE_LABEL: Record<string, string> = {
  trade_page: "Trade page",
  profile: "Account page",
  submit_gate: "Submit gate",
  login: "Sign-in",
  migration: "Grandfathered",
};

export function Customers({ user, initialView = "all", navToken = 0 }: {
  user: OpsUser;
  /** Which subview to open on. The dashboard's "Needs us" row counts trade
   *  applications and must land ON them — a row that counts one thing and opens
   *  another spends the trust that whole section is built on. */
  initialView?: "all" | "queue";
  /** Increments on every navigation, including one that does not change tab.
   *  Seeding state from `initialView` alone leaves this component untouched when
   *  the tab is already "customers", so pressing the nav item from inside the
   *  queue did nothing at all. */
  navToken?: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<"all" | "queue">(initialView);

  // A navigation lands at the TOP of the area it names: the requested subview,
  // and no customer left open behind it.
  useEffect(() => {
    setView(initialView);
    setOpenId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navToken]);
  const [pending, setPending] = useState<OpsTradeApplication[] | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);

  const loadQueue = useCallback(() => {
    opsTradeApplications()
      .then((a) => { setPending(a); setQueueError(null); })
      .catch((e) => setQueueError(String(e?.message ?? e)));
  }, []);
  useEffect(loadQueue, [loadQueue]);

  if (openId) return <Detail id={openId} viewer={user} onBack={() => setOpenId(null)} />;

  return (
    <>
      {/* The queue lives in Customers because that is what it is about — a
          person, not a document (P2-A9's placement latitude). A tab rather than
          a separate area: whoever is looking at customers is the one who decides
          these, and a second navigation entry would hide the work from them. */}
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={() => setView("all")}
          className={`px-3 py-1.5 border t-bd-sm cursor-pointer ${view === "all" ? "border-black/40 text-ink" : "border-black/10 text-body"}`}>
          All customers
        </button>
        <button type="button" onClick={() => setView("queue")}
          className={`px-3 py-1.5 border t-bd-sm cursor-pointer inline-flex items-center gap-2 ${view === "queue" ? "border-black/40 text-ink" : "border-black/10 text-body"}`}>
          Trade applications
          {!!pending?.length && (
            <span className="bg-black/8 px-1.5 rounded-full t-label">{pending.length}</span>
          )}
        </button>
      </div>

      {view === "all"
        ? <List onOpen={setOpenId} />
        : <TradeQueue rows={pending} error={queueError} onOpen={setOpenId} onDecided={loadQueue} />}
    </>
  );
}

/** The review queue. Everything needed to DECIDE is on the row, because a
 *  decision that requires opening three other screens is a decision that gets
 *  postponed. */
function TradeQueue({ rows, error, onOpen, onDecided }: {
  rows: OpsTradeApplication[] | null;
  error: string | null;
  onOpen: (id: string) => void;
  onDecided: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const decide = async (id: string, action: "approve" | "reject") => {
    if (busy) return;
    setBusy(id);
    setFailed(null);
    try {
      if (action === "approve") {
        await opsTradeApprove(id);
      } else {
        // The reason is what the customer's RECORD carries forward — prose a
        // colleague reads in six months. It never reaches the customer: the
        // rejection email is deliberately general (AC-P2-44).
        const reason = window.prompt("Why is this being rejected? (kept on the customer's record, never sent to them)");
        if (!reason?.trim()) { setBusy(null); return; }
        await opsTradeReject(id, reason.trim());
      }
      onDecided();
    } catch (e) {
      // A 409 means somebody else already decided it — the guarded UPDATE on the
      // server is what makes two people clicking at once produce one decision.
      // That is not an error the reviewer caused, so it reads as news.
      const msg = String((e as { code?: string })?.code ?? e);
      setFailed(msg.includes("already_decided")
        ? "Somebody else has already decided that one."
        : "That didn't go through. Try again.");
      onDecided();
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div data-testid="trade-queue-view" className="bg-white border border-red-200 p-6 text-red-600 t-bd-sm">Couldn't load trade applications. {error}</div>;
  if (!rows) return <Loader2 data-testid="trade-queue-view" className="w-5 h-5 text-black/30 animate-spin" />;
  if (!rows.length) {
    return (
      <div data-testid="trade-queue-view" className="bg-white border border-dashed border-black/15 p-12 text-center">
        <p className="text-ink t-bd-sm">Nothing waiting</p>
        <p className="text-body mt-1 t-cap">
          Applications that pass every check are approved automatically and never appear here.
          This queue only holds the ones that need a person.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="trade-queue-view" className="space-y-3">
      <div data-testid="trade-queue" className="space-y-3">
      {failed && <div className="bg-white border border-black/15 p-3 text-body t-bd-sm">{failed}</div>}
      {rows.map((a) => (
        <div key={a.id} className="bg-white border border-black/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {/* A nameless account is the COMMON case here — someone who
                  applied from the trade page has not been asked for a name yet.
                  Printing the email as the link and again beneath it just says
                  the same thing twice. */}
              <button type="button" onClick={() => onOpen(a.applicant.id)}
                className="text-ink underline underline-offset-2 cursor-pointer t-bd-sm">
                {a.applicant.name || a.applicant.email}
              </button>
              {a.applicant.name && <p className="text-body t-cap">{a.applicant.email}</p>}
              <p className="text-ink mt-2 t-bd-sm">{a.businessName || "—"}</p>
              <p className="text-body font-data t-cap">{a.abn || "No ABN"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={!!busy} onClick={() => void decide(a.id, "approve")}
                className="px-3 py-1.5 border border-black/25 text-ink cursor-pointer disabled:opacity-50 t-bd-sm">
                Approve
              </button>
              <button type="button" disabled={!!busy} onClick={() => void decide(a.id, "reject")}
                className="px-3 py-1.5 border border-black/10 text-body cursor-pointer disabled:opacity-50 t-bd-sm">
                Reject
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            {a.queueReasons.map((r) => (
              <span key={r} className="border border-black/15 px-2 py-0.5 text-body t-label">
                {QUEUE_REASON[r] ?? r}
              </span>
            ))}
            <span className="text-quiet t-cap">
              From {SOURCE_LABEL[a.source] ?? a.source}
              {a.createdAt ? ` · ${a.createdAt.slice(0, 10)}` : ""}
            </span>
          </div>

          {/* D2.1: a human may knowingly allow a second holder — an estimator and
              a director of the same business — but not blind. */}
          {!!a.duplicateHolders.length && (
            <p className="text-body mt-2 t-cap">
              Also verified on: {a.duplicateHolders.map((h) => h.email).join(", ")}
            </p>
          )}
        </div>
      ))}
      </div>
    </div>
  );
}

function List({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<OpsCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { opsCustomers().then(r => setRows(r.customers)).catch(e => setError(String(e?.message ?? e))); }, []);
  if (error) return <div className="bg-white border border-red-200 p-6 text-red-600 t-bd-sm">Couldn't load customers. {error}</div>;
  if (!rows) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;
  if (!rows.length) return <div className="bg-white border border-dashed border-black/15 p-12 text-center text-body t-bd-sm">No registered customers yet.</div>;
  return (
    <>
    {/* PHONE — card per row, the same treatment Projects already had and this
        list never got. A six-column table cannot fit 375px: its min-content
        width forces the whole document wider, which is page-level horizontal
        scroll. That is what broke navigation here — the old bottom bar was
        fixed to the VIEWPORT, so the content slid sideways underneath it while
        the bar stayed put. The nav is a drawer now, but the table was the cause
        and it is fixed here rather than papered over there. */}
    <div className="lg:hidden -mx-4 border-y border-black/8 bg-white">
      {rows.map(c => (
        <button key={c.id} onClick={() => onOpen(c.id)}
          className="w-full text-left px-4 py-3 border-b border-black/8 last:border-0 active:bg-bone">
          <p className="font-medium text-ops truncate t-bd">{c.name || c.email.split("@")[0]}</p>
          <p className="text-body truncate t-cap">{c.email}</p>
          {c.company && <p className="text-body truncate t-cap">{c.company}{c.abn ? ` · ABN ${c.abn}` : ""}</p>}
          <p className="text-quiet mt-1 t-cap">
            {c.projects} project{c.projects === 1 ? "" : "s"} · {c.orders} order{c.orders === 1 ? "" : "s"} · joined {fmtDate(c.created_at)}
          </p>
        </button>
      ))}
    </div>

    <div className="hidden lg:block card">
      <table className="w-full t-bd-sm">
        <thead>
          <tr className="text-left text-quiet border-b border-black/8 t-label">
            <th className="px-4 py-2.5 font-medium">Customer</th><th className="px-4 py-2.5 font-medium">Business</th>
            <th className="px-4 py-2.5 font-medium">Projects</th><th className="px-4 py-2.5 font-medium">Orders</th>
            <th className="px-4 py-2.5 font-medium">Registered</th><th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.id} className="border-b border-black/5 last:border-0 hover:bg-bone">
              <td className="px-4 py-3 font-medium text-ops">{c.name || c.email.split("@")[0]}<span className="block text-quiet font-normal t-cap">{c.email}</span></td>
              <td className="px-4 py-3 text-body">{c.company || <span className="text-quietest">—</span>}<span className="block text-quiet t-cap">{c.abn ? `ABN ${c.abn}` : ""}</span></td>
              <td className="px-4 py-3 text-body">{c.projects}</td>
              <td className="px-4 py-3 text-body">{c.orders}</td>
              <td className="px-4 py-3 text-body">{fmtDate(c.created_at)}</td>
              <td className="px-4 py-3 text-right"><button onClick={() => onOpen(c.id)} className="font-medium hover:underline t-bd-sm" style={{ color: SAGE }}>Open →</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

function Detail({ id, viewer, onBack }: { id: string; viewer: OpsUser; onBack: () => void }) {
  const [d, setD] = useState<OpsCustomerDetail | null>(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: "", phone: "", company: "", abn: "", email: "" });
  const [editErr, setEditErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tradeErr, setTradeErr] = useState("");
  const reload = useCallback(() => { opsCustomer(id).then(setD).catch(() => setError(true)); }, [id]);
  useEffect(reload, [reload]);
  if (error) return <div className="bg-white border border-red-200 p-6 text-red-600 t-bd-sm">Couldn't load this customer.</div>;
  if (!d) return <Loader2 className="w-5 h-5 text-black/30 animate-spin" />;
  const cu = d.customer;
  const isAdmin = viewer.role === "admin";

  const startEdit = () => {
    setDraft({ name: cu.name ?? "", phone: cu.phone ?? "", company: cu.company ?? "", abn: cu.abn ?? "", email: cu.email });
    setEditErr(""); setEditing(true);
  };
  const save = async () => {
    if (busy) return;
    setBusy(true); setEditErr("");
    try {
      const patch: Record<string, string> = { name: draft.name, phone: draft.phone, company: draft.company, abn: draft.abn };
      if (isAdmin && draft.email.trim() !== cu.email) patch.email = draft.email.trim();
      const r = await opsUpdateCustomer(cu.id, patch);
      // Paint the fields the PATCH owns immediately, then RE-READ the record.
      //
      // The PATCH answers with the PROFILE it wrote — name, phone, company, abn —
      // and nothing else. Trade status and the account rate are DERIVED
      // (ADR-0002) and are absent from that reply, so this screen cannot settle
      // them from the response alone:
      //
      //   - REPLACING the customer with the reply dropped them, and saving a
      //     phone number made a verified customer read as "not on trade pricing,
      //     rate 0%" with no revoke control.
      //   - MERGING kept whatever the screen was last told, which resurrects a
      //     grant somebody else revoked in the meantime — offering a revoke
      //     button for a grant that is already gone. That is the worse of the
      //     two: the first lost true information, this asserts false
      //     information, and neither is visible without a reload.
      //
      // There is no smarter merge available, because this screen cannot know
      // whether the fields it does not own have moved. So a write to profile
      // fields re-reads the ones it does not own.
      setD({ ...d, customer: { ...d.customer, ...r.customer } });
      reload();
      setEditing(false);
    } catch (e) {
      setEditErr(String(e).includes("409") ? "That email is already in use by another account."
        : String(e).includes("400") ? "Enter a valid email address."
        : "Couldn't save — you may not have permission.");
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl">
      <button onClick={onBack} className="text-body hover:text-ops flex items-center gap-1 mb-4 t-cap"><ChevronLeft className="w-3.5 h-3.5" />Back to customers</button>
      <TradeBlock d={d} onChanged={reload} error={tradeErr} setError={setTradeErr} />
      <div className="card p-5 mb-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-ops flex items-center gap-2 font-display t-bd-lg"><User className="w-5 h-5" style={{ color: SAGE }} />{cu.name || cu.email.split("@")[0]}</h2>
          {!editing && (
            <button onClick={startEdit} className="inline-flex items-center gap-1.5 text-body border border-black/12 px-2.5 py-1.5 hover:border-sage hover:text-sage t-cap">
              <PenLine className="w-3 h-3" />Edit details
            </button>
          )}
        </div>
        {!editing ? (
          <div className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-body t-bd-sm">
            <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-quietest" />{cu.email}</span>
            {cu.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-quietest" />{cu.phone}</span>}
            <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-quietest" />{cu.company || "No business name"}{cu.abn ? ` · ABN ${cu.abn}` : ""}</span>
            <span className="text-quiet">Registered {fmtDate(cu.createdAt)}</span>
          </div>
        ) : (
          <div className="mt-3 border-t border-black/[0.07] pt-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <EditField label="Full name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
              <EditField label="Phone" value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} />
              <EditField label="Business name" value={draft.company} onChange={(v) => setDraft({ ...draft, company: v })} />
              <EditField label="ABN" value={draft.abn} onChange={(v) => setDraft({ ...draft, abn: v })} />
              {isAdmin ? (
                <div className="sm:col-span-2">
                  <EditField label="Sign-in email — the customer's unique login ID" value={draft.email} type="email" onChange={(v) => setDraft({ ...draft, email: v })} />
                  <p className="text-quiet mt-1 t-cap">The customer signs in with the new address from their next login. Sessions and records are unaffected.</p>
                </div>
              ) : (
                <p className="sm:col-span-2 text-quiet flex items-center gap-1.5 t-cap"><Lock className="w-3 h-3" />Sign-in email ({cu.email}) can only be changed by an admin.</p>
              )}
            </div>
            {editErr && <p className="text-red-600 mt-2 t-cap">{editErr}</p>}
            <div className="flex gap-2 mt-3">
              <button onClick={save} disabled={busy} className="px-3.5 py-2 bg-sage text-white disabled:opacity-50 t-cap">{busy ? "Saving…" : "Save changes"}</button>
              <button onClick={() => setEditing(false)} className="px-2.5 py-2 text-body hover:text-ops t-cap">Cancel</button>
            </div>
          </div>
        )}
      </div>

      <Section title="Projects">
        {d.projects.length === 0 && <p className="px-4 py-3 text-quietest t-cap">No projects.</p>}
        {d.projects.map(p => (
          <div key={p.id} className="flex items-center justify-between px-4 py-2.5 border-b border-black/5 last:border-0 t-bd-sm">
            <span className="text-ops">{p.title ?? "Untitled"}</span>
            <span className="px-2 py-0.5 border border-black/12 text-body t-cap">{p.status_customer}</span>
          </div>
        ))}
      </Section>

      <Section title="Orders">
        {d.orders.length === 0 && <p className="px-4 py-3 text-quietest t-cap">No orders.</p>}
        {d.orders.map(o => (
          <div key={o.id} className="flex items-center justify-between px-4 py-2.5 border-b border-black/5 last:border-0 t-bd-sm">
            <span className="font-mono text-ops">{o.order_no}<span className="ml-2 text-quiet font-sans t-cap">{o.stage}</span></span>
            <span className="font-data">{money(o.total)}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

function EditField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="block text-quiet mb-1 t-label">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full border border-black/15 px-2.5 py-1.5 outline-none focus:border-sage t-bd-sm" />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h3 className="text-quiet mb-2 t-label">{title}</h3>
      <div className="card mb-5">{children}</div>
    </>
  );
}

/** Trade verification, on the customer record (AC-P2-40/41, AC-P2-30).
 *
 *  THE ONE SURFACE WHERE THE PERCENTAGE MAY EXIST. Every customer-facing screen
 *  in this phase is forbidden from naming a rate or letting one be derived; ops
 *  is explicitly the exception, because a person negotiating or checking an
 *  account has to see what it actually pays.
 *
 *  Read-only, deliberately: this phase ships no editor for the rate. A rate is
 *  granted by a decision or negotiated by a deliberate write, never nudged from
 *  a list.
 */
function TradeBlock({ d, onChanged, error, setError }: {
  d: OpsCustomerDetail;
  onChanged: () => void;
  error: string;
  setError: (v: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const trade = d.customer.trade;
  const history = d.tradeHistory ?? [];
  const rate = d.customer.discountPercent ?? 0;

  const revoke = async () => {
    if (busy) return;
    // Addressed to the ACCOUNT rather than to an application: "stop this
    // customer paying trade prices" is what a person means, and making them find
    // the right application first invites revoking the wrong one.
    const reason = window.prompt("Why is trade pricing being removed? (kept on the record)");
    if (!reason?.trim()) return;
    setBusy(true);
    setError("");
    try {
      await opsTradeRevoke(d.customer.id, reason.trim());
      onChanged();
    } catch (e) {
      const msg = String((e as { code?: string })?.code ?? e);
      setError(msg.includes("not_verified")
        ? "That account is not on trade pricing."
        : "That didn't go through. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="customer-trade" className="card p-5 mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-quiet t-label">Trade pricing</p>
          <p className="text-ops mt-1 t-bd-sm">
            {trade?.verified
              ? `Verified${trade.provenance ? ` · ${trade.provenance}` : ""}${trade.verifiedSince ? ` · since ${trade.verifiedSince.slice(0, 10)}` : ""}`
              : "Not on trade pricing"}
          </p>
          <p className="text-body mt-1 t-cap">
            {d.customer.abn ? `ABN ${d.customer.abn}` : "No ABN on file"} · account rate {rate}%
          </p>
        </div>
        {trade?.verified && (
          <button type="button" disabled={busy} onClick={() => void revoke()}
            className="text-body border border-black/12 px-2.5 py-1.5 hover:border-sage hover:text-sage cursor-pointer disabled:opacity-50 t-cap">
            Revoke trade pricing
          </button>
        )}
      </div>

      {error && <p className="text-red-600 mt-2 t-cap">{error}</p>}

      {/* The decisions, with their reasons — ops-only detail. The customer's own
          history outline carries dates and outcomes and nothing else. */}
      {!!history.length && (
        <div className="border-t border-black/[0.07] mt-3 pt-3 space-y-1">
          {history.map((h) => (
            <div key={h.id} className="flex flex-wrap justify-between gap-x-4 text-body t-cap">
              <span>
                {(h.decidedAt ?? h.createdAt ?? "").slice(0, 10)} · {h.status}
                {h.decidedVia ? ` (${h.decidedVia})` : ""}
                {h.revokedAt ? ` · revoked ${h.revokedAt.slice(0, 10)}` : ""}
              </span>
              <span className="text-quiet">{h.revokeReason || h.decisionReason || ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
