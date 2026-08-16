// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT / ORDER DETAIL — the deep workspace (spec §5).
//
// One screen for both an order and a quote-stage project: header → the pinned
// current-action gate (or the neutral "on track" state) → the live 9-node
// lifecycle timeline → the schedule-code line list → files → the payment /
// contact / quick-links summary band. Codes (display face, bold) anchor every line.
// ═══════════════════════════════════════════════════════════════════════════════
import { brandSubject } from "../data/sanity";
import { useEffect, useState, type ReactNode } from "react";
import { OpeningList } from "../components/quote-project/OpeningList";
import { QuoteTotals } from "../components/quote-project/QuoteTotals";
import { hydrateQuoteItems } from "../data/api";
import {
  ChevronLeft, ChevronDown, Check, PenLine, FileText,
  Landmark, MessageSquare, Phone, Loader2, Lock, Send,
} from "lucide-react";
import { type Page, Btn } from "../app/ui";
import { ReferralOrderPrompt } from "../components/referral/ReferralPlacement";
import {
  getOrder, getProject, getProjectFiles, getClarifications, replyClarification,
  confirmDrawings, confirmQa,
  type ApiOrder, type ApiFile, type ApiScheduleFile, type ApiClarification, type ApiItem, type ApiProjectDelivery, type CurrentProject,
} from "../data/api";
import {
  StatusPill, TONE, money, fmtDate, orderMeta, useAccount, type Tone,
} from "./accountModel";
import type { TrackFocus } from "./OrderTrackingPage";

// ── Shared bits ───────────────────────────────────────────────────────────────
export function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-[7px] text-body hover:text-sage mb-[18px] cursor-pointer font-data t-data-sm">
      <ChevronLeft className="w-3.5 h-3.5" />All projects
    </button>
  );
}

export function Blk({ eyebrow, title, right, children, id }: { eyebrow: string; title: string; right?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="card">
      <div className="flex items-center gap-2.5 px-5 py-[15px] border-b border-black/10 flex-wrap">
        <span className="text-sage font-data t-label">{eyebrow}</span>
        <h2 className="font-semibold text-ink font-display t-bd">{title}</h2>
        {right && <span className="sm:ml-auto text-body basis-full sm:basis-auto font-data t-data-sm">{right}</span>}
      </div>
      {children}
    </section>
  );
}

// The confirm affordance for irreversible / commercial actions (spec §9).
export function ConfirmDetails({ summary, lines, action, busy, onConfirm, receipt }: {
  summary: string; lines: string[]; action: string; busy?: boolean; onConfirm: () => void;
  receipt?: { label: string; value: string; big?: boolean }[];
}) {
  return (
    <details className="border bg-white mt-3.5" style={{ borderColor: TONE.attn.bd }}>
      <summary className="list-none cursor-pointer px-4 py-3 flex items-center gap-2.5 font-medium text-ink [&::-webkit-details-marker]:hidden t-bd-sm">
        <Check className="w-4 h-4 text-sage" />{summary}
        <ChevronDown className="w-4 h-4 ml-auto text-body" />
      </summary>
      <div className="px-4 pb-4 border-t border-black/[0.07]">
        {receipt && (
          <div className="flex flex-col gap-2 py-3.5">
            {receipt.map((r) => (
              <div key={r.label} className={`flex justify-between text-body ${r.big ? "border-t border-black/10 pt-2.5 mt-0.5 t-bd" : ""} t-cap`}>
                <span>{r.label}</span>
                <span className={`font-data ${r.big ? "font-medium" : "text-ink font-medium"}`} style={{ color: r.big ? TONE.attn.text : undefined }}>{r.value}</span>
              </div>
            ))}
          </div>
        )}
        {lines.map((l) => (
          <div key={l} className="flex items-start gap-[9px] text-body py-2 t-cap">
            <Check className="w-[15px] h-[15px] flex-shrink-0 mt-px" style={{ color: TONE.pos.text }} />{l}
          </div>
        ))}
        <Btn variant="sage" size="md" onClick={onConfirm} disabled={busy} className="w-full justify-center mt-2">{busy ? "Working…" : action}</Btn>
      </div>
    </details>
  );
}


// Pinned amber action gate.
function ActionGate({ pill, step, title, children }: { pill: string; step?: string; title: string; children: ReactNode }) {
  return (
    <section className="p-5 border" style={{ borderColor: TONE.attn.bd, borderLeft: `3px solid ${TONE.attn.text}`, background: `linear-gradient(180deg, ${TONE.attn.bg}, rgba(178,110,15,.03))` }}>
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <StatusPill tone="attn">{pill}</StatusPill>
        {step && <span className="text-body font-data t-data-sm">{step}</span>}
      </div>
      <h2 className="font-semibold text-ink mb-1.5 font-display t-bd-lg">{title}</h2>
      {children}
    </section>
  );
}

const Safe = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 t-cap font-data" style={{ color: TONE.pos.text }}>
    <Check className="w-3 h-3" />{children}
  </span>
);

// Manual bank-transfer payment instructions (payment is invoice + transfer, not card).
function PayPanel({ kind, amount, orderNo }: { kind: "deposit" | "balance"; amount: number | undefined; orderNo: string }) {
  return (
    <div className="card p-4 mt-3.5">
      <p className="flex items-center gap-2 font-medium text-ink mb-2 t-bd-sm"><Landmark className="w-4 h-4 text-sage" />Pay the {kind} by bank transfer</p>
      <div className="text-body space-y-1 font-data t-data">
        <p>Amount <span className="text-ink font-medium">{money(amount)}</span></p>
        <p>BSB 083-000 · Acct 12 345 678</p>
        <p>Reference <span className="text-ink font-medium">{orderNo}</span></p>
      </div>
      <p className="text-body mt-2.5 t-cap">We confirm receipt by email and this page updates the moment the payment lands — nothing else to do here.</p>
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────
type NodeState = "done" | "cur" | "work" | "locked";
interface TlNode { key: string; title: string; state: NodeState; status: ReactNode; pill?: { tone: Tone; label: string; pulse?: boolean }; act?: ReactNode }

function TimelineNode({ n, last }: { n: TlNode; last: boolean }) {
  const markStyle = n.state === "done" ? { background: TONE.pos.text, borderColor: TONE.pos.text, color: "#fff" }
    : n.state === "work" ? { background: TONE.work.text, borderColor: TONE.work.text, color: "#fff" }
    : n.state === "cur" ? { background: TONE.attn.node, borderColor: TONE.attn.node, color: "#fff", boxShadow: `0 0 0 5px ${TONE.attn.bg}` }
    : { background: "#fff", borderColor: TONE.mute.bd, color: TONE.mute.text };
  return (
    <div className="relative grid grid-cols-[32px_1fr] gap-[15px] pb-[22px] last:pb-1">
      {!last && <span className="absolute left-[15px] top-[30px] bottom-0 w-0.5" style={{ background: n.state === "done" ? TONE.pos.text : "rgba(0,0,0,.10)" }} aria-hidden="true" />}
      <span className="relative z-[2] w-[30px] h-[30px] rounded-full grid place-items-center border-2" style={markStyle}>
        {n.state === "done" ? <Check className="w-[15px] h-[15px]" /> : n.state === "work" ? <Loader2 className="w-[15px] h-[15px]" /> : n.state === "cur" ? <PenLine className="w-[15px] h-[15px]" /> : <Lock className="w-[15px] h-[15px]" />}
      </span>
      <div className="pt-[3px] min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h4 className={`font-semibold ${n.state === "locked" ? "text-quieter" : "text-ink"} font-display t-bd`}>{n.title}</h4>
          {n.pill && (
            <StatusPill tone={n.pill.tone} icon={n.pill.pulse ? <span className="w-[7px] h-[7px] rounded-full animate-pulse" style={{ background: TONE.attn.node }} /> : undefined}>
              {n.pill.label}
            </StatusPill>
          )}
        </div>
        <div className="text-body mt-[3px] font-data t-data-sm">{n.status}</div>
        {n.act && <div className="mt-[11px] border p-[13px]" style={{ borderColor: TONE.attn.bd, background: TONE.attn.bg }}>{n.act}</div>}
      </div>
    </div>
  );
}

export function Timeline({ nodes }: { nodes: TlNode[] }) {
  return <div className="px-5 pt-2 pb-[18px]">{nodes.map((n, i) => <TimelineNode key={n.key} n={n} last={i === nodes.length - 1} />)}</div>;
}

const num = (t: ReactNode) => <span className="text-ink">{t}</span>;

// The 9 customer-facing nodes derived from the 12 backend stages.
function orderTimeline(o: ApiOrder): TlNode[] {
  const i = o.stageIndex;
  const at = (stage: string) => i >= ["deposit_invoiced", "deposit_paid", "drawings_shared", "drawings_signed_off", "manufacturing", "qa_photos_shared", "balance_invoiced", "balance_paid", "customer_confirmed", "dispatched", "delivered", "after_sales"].indexOf(stage);
  const dep = o.payments.find((p) => p.kind === "deposit");
  const bal = o.payments.find((p) => p.kind === "balance");
  return [
    { key: "req", title: "Quote requested", state: "done", pill: { tone: "pos", label: "Done" }, status: <>Submitted from your schedule · {num(`${o.lineCount ?? "—"} lines`)}</> },
    { key: "issued", title: "Reviewed quote issued", state: "done", pill: { tone: "pos", label: "Done" }, status: <>Issued · {num(money(o.total))} · locked</> },
    { key: "accepted", title: "Quote accepted", state: "done", pill: { tone: "pos", label: "Done" }, status: <>You accepted on {num(fmtDate(o.createdAt))} · deposit invoice issued</> },
    {
      key: "deposit", title: "Deposit — 50%",
      state: dep?.status === "paid" ? "done" : "cur",
      pill: dep?.status === "paid" ? { tone: "pos", label: "Paid" } : { tone: "attn", label: "You're here", pulse: true },
      status: dep?.status === "paid"
        ? <><span style={{ color: TONE.pos.text }} className="font-medium">{money(dep.amount)} received</span> {num(fmtDate(dep.paidAt))} </>
        : <>Deposit {num(money(dep?.amount))} due — pay by bank transfer above</>,
    },
    {
      key: "drawings", title: "Shop drawings — your sign-off",
      state: at("drawings_signed_off") ? "done" : o.stage === "drawings_shared" ? "cur" : "locked",
      pill: at("drawings_signed_off") ? { tone: "pos", label: "Signed off" } : o.stage === "drawings_shared" ? { tone: "attn", label: "You're here", pulse: true } : { tone: "mute", label: "Not started" },
      status: at("drawings_signed_off")
        ? <>Signed off {num(fmtDate(o.drawingsSignedOffAt))} · manufacturing released</>
        : o.stage === "drawings_shared" ? <>{num(`${o.lineCount ?? "—"} drawings`)} awaiting your approval — manufacturing is paused</> : <>Prepared once the deposit is received</>,
    },
    {
      key: "mfg", title: "Manufacturing",
      state: at("qa_photos_shared") ? "done" : o.stage === "manufacturing" ? "work" : "locked",
      pill: at("qa_photos_shared") ? { tone: "pos", label: "Done" } : o.stage === "manufacturing" ? { tone: "work", label: "In build" } : { tone: "mute", label: "Not started" },
      status: o.stage === "manufacturing" ? <>Your frames are in build — no action needed</> : at("qa_photos_shared") ? <>Build complete</> : <>Starts once drawings are signed off · ~3–4 weeks in build</>,
    },
    {
      key: "qa", title: "Quality check — pre-despatch photos",
      state: at("qa_photos_shared") ? "done" : "locked",
      pill: at("qa_photos_shared") ? { tone: "pos", label: "Shared" } : { tone: "mute", label: "Not started" },
      status: at("qa_photos_shared") ? <>Every item photographed before despatch — see Files</> : <>We photograph every item before despatch — you'll see them here</>,
    },
    {
      key: "balance", title: "Final payment & your OK — 50% balance",
      state: at("customer_confirmed") ? "done" : (o.stage === "balance_invoiced" || o.stage === "balance_paid") ? "cur" : "locked",
      pill: at("customer_confirmed") ? { tone: "pos", label: "Done" }
        : o.stage === "balance_invoiced" ? { tone: "attn", label: "Balance due", pulse: true }
        : o.stage === "balance_paid" ? { tone: "attn", label: "Confirm", pulse: true }
        : { tone: "mute", label: "Due before despatch" },
      status: at("customer_confirmed")
        ? <><span style={{ color: TONE.pos.text }} className="font-medium">{money(bal?.amount)} received</span> · confirmed for despatch</>
        : <>Balance {num(money(bal?.amount))} — unlocks after quality photos, releases delivery</>,
    },
    {
      key: "delivery", title: "Delivery & final OK",
      state: at("delivered") ? "done" : o.stage === "dispatched" ? "work" : "locked",
      pill: at("delivered") ? { tone: "pos", label: o.stage === "after_sales" ? "Completed" : "Delivered" } : o.stage === "dispatched" ? { tone: "work", label: "On its way" } : { tone: "mute", label: "Not started" },
      status: at("delivered") ? <>Delivered — after-sales support is open</> : <>Delivery ~2 weeks after balance · confirm receipt → after-sales opens</>,
    },
  ];
}


// ── Files ─────────────────────────────────────────────────────────────────────
export function FilesBlock({ files, note }: { files: ApiFile[]; note?: string }) {
  return (
    <Blk eyebrow="Documents" title="Documents" right="Everything attached to this project" id="rec-files">
      {files.length === 0 && <p className="px-5 py-4 text-body t-cap">No files yet — quote PDFs, drawings and photos appear here as your order progresses.</p>}
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-3.5 px-5 py-[13px] border-b border-black/[0.07] last:border-b-0">
          <span className="w-[34px] h-[34px] border border-black/10 grid place-items-center text-sage flex-shrink-0"><FileText className="w-4 h-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-ink truncate t-bd-sm">{f.filename}</div>
            <div className="text-body mt-0.5 font-data t-label">{f.kind} · {(f.size / 1024).toFixed(0)} KB</div>
          </div>
          <a className="ml-auto text-sage inline-flex items-center gap-1.5 hover:underline whitespace-nowrap font-data t-data-sm"
            href={`/api/files/${f.id}/download`} target="_blank" rel="noreferrer">Open</a>
        </div>
      ))}
      {note && <p className="px-5 pb-4 pt-2 text-body font-data t-data-sm">{note}</p>}
    </Blk>
  );
}

// The 50/50 payment panel lived here and is gone (owner, 2026-08-14): the order
// journey above already states both instalments, their status and their dates,
// so the panel restated them a screen apart — and restated the contract total a
// third time, beside the list's own total. SummaryBand is now the band itself.
export function SummaryBand({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-4 mt-0.5" aria-label="Summary">
      {children}
    </div>
  );
}

export function ContactCard({ setPage }: { setPage: (p: Page) => void }) {
  return (
    <div className="flex-1 basis-[250px] card p-[18px]">
      <h3 className="text-body mb-3.5 font-data t-label">Your contact</h3>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 bg-sage/[0.07] border border-black/10 grid place-items-center text-sage flex-shrink-0 font-data t-data">OF</span>
        <div><div className="font-semibold text-ink t-bd-sm">OpenFrame team</div><div className="text-body font-data t-data-sm">Project coordination</div></div>
      </div>
      <div className="mt-3.5 flex gap-2">
        <Btn variant="outline" size="sm" onClick={() => { setPage("contact"); window.scrollTo(0, 0); }} className="flex-1 justify-center"><MessageSquare className="w-3.5 h-3.5" />Message</Btn>
        <a href="tel:0390000000" className="inline-flex items-center gap-2 px-4 py-2 text-body hover:text-ink t-cap"><Phone className="w-3.5 h-3.5" />Call</a>
      </div>
    </div>
  );
}

// ═══ ORDER DETAIL ═════════════════════════════════════════════════════════════
export function OrderDetail({ orderId, setPage, backToList }: { orderId: string; setPage: (p: Page) => void; backToList?: () => void }) {
  const { refresh } = useAccount();
  const [order, setOrder] = useState<ApiOrder | null>(null);
  const [files, setFiles] = useState<ApiFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let off = false;
    getOrder(orderId).then(async ({ order: o }) => {
      if (off) return;
      setOrder(o);
      if (o.projectId) {
        getProjectFiles(o.projectId).then((r) => { if (!off) setFiles(r.files); }).catch(() => {});
      }
    }).catch(() => { if (!off) setMissing(true); });
    return () => { off = true; };
  }, [orderId]);

  const act = async (fn: (id: string) => Promise<{ order: ApiOrder }>) => {
    if (!order || busy) return;
    setBusy(true);
    try { const r = await fn(order.id); setOrder({ ...order, ...r.order }); refresh(); }
    finally { setBusy(false); }
  };

  if (missing) return (
    <div className="card p-8">
      <p className="text-ink mb-1.5 font-display t-bd">We couldn't open that order.</p>
      <p className="text-body max-w-[52ch] t-bd-sm">
        Your tracking session may have ended — it lasts until you close your browser. Nothing has been lost:
        confirm it's you and it will open again.
      </p>
      <div className="mt-4">
        <Btn variant="sage" size="sm" onClick={() => setPage("track-order")}>Verify by email</Btn>
      </div>
    </div>
  );
  if (!order) return <div className="card p-8 text-body t-bd-sm">Loading your order…</div>;

  const m = orderMeta(order);
  // The order serves the same nested shape the quote does (worker/lib/orders.ts's
  // orderLines), so this hydrates exactly as the draft and the issued quote do.
  const lines = hydrateQuoteItems(order.lines ?? []);
  const dep = order.payments.find((p) => p.kind === "deposit");
  const bal = order.payments.find((p) => p.kind === "balance");

  return (
    <>
      {backToList && <BackLink onClick={backToList} />}
      <div className="flex justify-between items-start gap-5 flex-wrap pb-[22px] border-b border-black/10 mb-[26px]">
        <div>
          {/* One project, whole life: the project ref anchors the record; the order
              number is acceptance-time meta (it lives on invoices + payments). */}
          <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
            <span className="font-medium text-sage font-data t-data">{order.projectRef ?? order.orderNo}</span>
            <StatusPill tone={m.tone}>{m.pill}</StatusPill>
          </div>
          <h1 className="text-ink t-hd1">{order.projectTitle ?? "Your order"}</h1>
          <div className="flex gap-x-4 gap-y-2 flex-wrap text-body mt-2 t-cap">
            <span>Order no. <span className="text-ink font-data">{order.orderNo}</span></span>
            <span>Ordered <span className="text-ink font-data">{fmtDate(order.createdAt)}</span></span>
            <span><span className="text-ink font-data">{order.lineCount ?? lines.length}</span> lines</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Btn variant="ghost" size="sm" onClick={() => { setPage("contact"); window.scrollTo(0, 0); }}>Message us</Btn>
        </div>
      </div>

      <div className="flex flex-col gap-[26px]">
        {/* Current action gate */}
        {order.stage === "deposit_invoiced" && (
          <ActionGate pill="Action needed from you" step="Step 4 of 9" title="Pay the 50% deposit to begin">
            <p className="text-body max-w-[56ch] t-cap">Your order is created and the deposit invoice is issued. <b className="text-ink">Shop drawings begin once the deposit lands</b> — the remaining 50% is due before despatch, after quality photos.</p>
            <PayPanel kind="deposit" amount={dep?.amount} orderNo={order.orderNo} />
            <div className="mt-3.5"><Safe>Nothing else is charged — the balance is invoiced only after your quality check</Safe></div>
          </ActionGate>
        )}
        {order.stage === "drawings_shared" && (
          <ActionGate pill="Action needed from you" step="Step 5 of 9" title="Review & sign off your shop drawings">
            <p className="text-body max-w-[56ch] t-cap">We've prepared detailed drawings for all <b className="text-ink">{order.lineCount ?? lines.length} items</b> — every profile, dimension and hardware position. Check them against your site. <b className="text-ink">Manufacturing only begins once you sign off</b>, so this is the moment to catch changes. Requesting a change is free at this stage.</p>
            <div className="flex gap-2.5 flex-wrap items-center mt-[15px]">
              <Btn variant="outline" size="sm" onClick={() => { setPage("contact"); window.scrollTo(0, 0); }}>Request a change</Btn>
              <Safe>Signing off does not charge you — the deposit is already paid</Safe>
            </div>
            <ConfirmDetails
              summary="Preview what happens when you sign off"
              lines={[
                `You confirm the ${order.lineCount ?? lines.length} drawings match your requirements and site dimensions.`,
                "Manufacturing is released and your build slot is booked — dimensions are locked from here.",
                `No payment is taken now. The final 50% balance (${money(bal?.amount)}) falls due after quality photos, before despatch.`,
              ]}
              action="Confirm sign-off & release manufacturing" busy={busy}
              onConfirm={() => act(confirmDrawings)} />
          </ActionGate>
        )}
        {order.stage === "balance_invoiced" && (
          <ActionGate pill="Action needed from you" step="Step 8 of 9" title="Pay the final 50% balance to release despatch">
            <p className="text-body max-w-[56ch] t-cap">Quality photos are shared (see Files). The balance of <b className="text-ink">{money(bal?.amount)}</b> is due before we book delivery.</p>
            <PayPanel kind="balance" amount={bal?.amount} orderNo={order.orderNo} />
          </ActionGate>
        )}
        {order.stage === "balance_paid" && (
          <ActionGate pill="Action needed from you" step="Step 8 of 9" title="Confirm you're ready for despatch">
            <p className="text-body max-w-[56ch] t-cap">Balance received and quality photos shared. Confirm everything looks right and we book your delivery (~2 weeks).</p>
            <ConfirmDetails
              summary="Preview what happens when you confirm"
              lines={[
                "You confirm the quality photos look right and your site is ready to receive delivery.",
                "We book despatch and contact you with the delivery window (~2 weeks).",
                "Nothing further is charged — your order is fully paid.",
              ]}
              action="Confirm — OK to despatch" busy={busy}
              onConfirm={() => act(confirmQa)} />
          </ActionGate>
        )}
        {!["deposit_invoiced", "drawings_shared", "balance_invoiced", "balance_paid"].includes(order.stage) && (
          <section className="p-5 card flex items-center gap-3" style={{ borderLeft: `3px solid ${TONE.pos.text}` }}>
            <span className="w-[34px] h-[34px] grid place-items-center border flex-shrink-0" style={{ color: TONE.pos.text, borderColor: TONE.pos.bd, background: TONE.pos.bg }}><Check className="w-[18px] h-[18px]" /></span>
            <div>
              <h2 className="font-semibold text-ink font-display t-bd">On track — nothing needed from you</h2>
              <p className="text-body t-cap">{m.next}. We'll email you the moment a step needs your OK.</p>
            </div>
          </section>
        )}

        {/* Lifecycle timeline */}
        <Blk eyebrow="Lifecycle" title="Quote → order journey" right={<>Ordered {fmtDate(order.createdAt)}</>} id="rec-timeline">
          <Timeline nodes={orderTimeline(order)} />
        </Blk>

        {/* Lines — THE SAME LIST as the builder, the pending view and the issued
            quote. The flat table that used to be here could not express a
            composite at all: an opening built as two joined units showed as one
            product and one size, naming the pre-split frame rather than what
            gets made. order_line carries the units since 0047 and the API
            serves them nested, so the contract shows what production builds. */}
        <Blk eyebrow="Schedule" title="Order lines" right="Anchored by your schedule code" id="rec-lines">
          <OpeningList items={lines} />
          <QuoteTotals
            lineTotals={lines.map((l) => l.lineTotal ?? 0)}
            deliveryInc={order.delivery}
            postcode={order.deliveryPostcode ?? null}
            /* From the issue-time stamp the order inherited, not live state:
               placing this order is what ended the eligibility, so a live lookup
               would erase the label at the moment it became permanent. */
            referral={order.referral}
            /* No deposit row: it is invoiced by now, and the journey above says so. */
          />
        </Blk>

        {/* Source schedule (the uploaded file this order was built from) */}

        {/* Files */}
        <FilesBlock files={files} note={order.stageIndex >= 5 ? undefined : "Quality & pre-despatch photos appear here after manufacturing."} />

        {/* After the last panel, and only once the goods have landed. Asking
            mid-production is asking before they know whether they're happy. */}
        <ReferralOrderPrompt stage={order.stage} signedIn setPage={setPage} />

        {/* Summary band */}
        <SummaryBand><ContactCard setPage={setPage} /></SummaryBand>
      </div>
    </>
  );
}

// ═══ QUOTE-STAGE PROJECT DETAIL (submitted / under review / needs info) ═══════
export function ProjectDetail({ projectId, status, setPage, backToList, onOpenRecord }: {
  projectId: string; status?: string; setPage: (p: Page) => void; backToList?: () => void;
  onOpenRecord?: (rec: TrackFocus) => void;
}) {
  const [data, setData] = useState<CurrentProject | null>(null);
  const [files, setFiles] = useState<ApiFile[]>([]);
  const [thread, setThread] = useState<ApiClarification[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  const load = () => {
    getProject(projectId).then((r) => {
      setData(r);
      if (r.project?.status === "needs_information") {
        getClarifications(projectId).then((t) => setThread(t.clarifications)).catch(() => {});
      }
    }).catch(() => setMissing(true));
    getProjectFiles(projectId).then((r) => setFiles(r.files)).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  if (missing) return (
    <div className="card p-8">
      <p className="text-ink mb-1.5 font-display t-bd">We couldn't open that quote.</p>
      <p className="text-body max-w-[52ch] t-bd-sm">
        Your tracking session may have ended — it lasts until you close your browser. Nothing has been lost:
        confirm it's you and it will open again.
      </p>
      <div className="mt-4">
        <Btn variant="sage" size="sm" onClick={() => setPage("track-order")}>Verify by email</Btn>
      </div>
    </div>
  );
  if (!data?.project) return <div className="card p-8 text-body t-bd-sm">Loading your quote…</div>;

  const p = data.project;
  const st = p.status;
  const needsInfo = st === "needs_information";
  const delivery = data.delivery;

  const sendReply = async () => {
    if (!reply.trim() || busy) return;
    setBusy(true);
    try { await replyClarification(projectId, reply.trim()); setReply(""); load(); }
    finally { setBusy(false); }
  };

  const timeline: TlNode[] = [
    { key: "req", title: "Quote requested", state: "done", pill: { tone: "pos", label: "Done" }, status: <>Submitted {num(fmtDate(p.createdAt))} · {num(`${data.items.length} lines`)} from your schedule</> },
    needsInfo
      ? { key: "review", title: "Review — needs your answer", state: "cur", pill: { tone: "attn", label: "You're here", pulse: true }, status: <>Pricing is paused until you reply above</> }
      : { key: "review", title: "Reviewed quote", state: "work", pill: { tone: "work", label: "Being priced" }, status: <>We are checking specifications and pricing — usually within 2 business days</> },
    { key: "accept", title: "Accept quote → 50% deposit", state: "locked", pill: { tone: "mute", label: "Not started" }, status: <>Nothing is charged until you accept the reviewed quote</> },
  ];

  return (
    <>
      {backToList && <BackLink onClick={backToList} />}
      <div className="flex justify-between items-start gap-5 flex-wrap pb-[22px] border-b border-black/10 mb-[26px]">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
            {p.ref && <span className="font-medium text-sage font-data t-data">{p.ref}</span>}
            <StatusPill tone={needsInfo ? "attn" : "work"}>{needsInfo ? "Needs your answer" : "Being priced"}</StatusPill>
          </div>
          <h1 className="text-ink t-hd1">{p.title}</h1>
          <div className="flex gap-x-4 gap-y-2 flex-wrap text-body mt-2 t-cap">
            <span>Project · submitted for pricing <span className="text-ink font-data">{fmtDate(p.createdAt)}</span></span>
            <span><span className="text-ink font-data">{data.items.length}</span> lines</span>
          </div>
        </div>
        <Btn variant="ghost" size="sm" onClick={() => { setPage("contact"); window.scrollTo(0, 0); }}>Message us</Btn>
      </div>

      <div className="flex flex-col gap-[26px]">
        {needsInfo ? (
          <ActionGate pill="Action needed from you" step="Step 2 of 9" title="We need a bit more information">
            <div className="card divide-y divide-black/[0.07] mt-2 mb-3">
              {thread.map((cm, i) => (
                <div key={i} className={`px-4 py-2.5 ${cm.author_type === "internal" ? "" : "bg-sage/[0.05]"}`}>
                  <p className="text-quiet mb-0.5 font-data t-label">{cm.author_type === "internal" ? brandSubject() : "You"}</p>
                  <p className="text-ink t-bd-sm">{cm.body}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendReply()}
                placeholder="Type your answer…" className="flex-1 card px-3 py-2 outline-none focus:border-sage t-bd-sm" />
              <Btn variant="sage" size="md" onClick={sendReply} disabled={busy || !reply.trim()}><Send className="w-4 h-4" />Send</Btn>
            </div>
          </ActionGate>
        ) : (
          <section className="p-5 card flex items-center gap-3" style={{ borderLeft: `3px solid ${TONE.work.text}` }}>
            <span className="w-[34px] h-[34px] grid place-items-center border flex-shrink-0" style={{ color: TONE.work.text, borderColor: TONE.work.bd, background: TONE.work.bg }}><Loader2 className="w-[18px] h-[18px]" /></span>
            <div>
              <h2 className="font-semibold text-ink font-display t-bd">With our team — nothing needed from you</h2>
              <p className="text-body t-cap">We are reviewing your specification and will issue a reviewed quote, usually within 2 business days. We'll email you and it appears here.</p>
            </div>
          </section>
        )}

        <Blk eyebrow="Lifecycle" title="Quote → order journey" id="rec-timeline"><Timeline nodes={timeline} /></Blk>

        <Blk eyebrow="Schedule" title="Submitted lines"
          right="Estimates — your reviewed quote may differ" id="rec-lines">
          {/* THE SAME LIST the builder draws, with nothing to press — not a
              second one that resembles it. The flat table here could not express
              a composite at all: an opening built as two units showed as one
              product and one size, and the product it named was the parent's
              pre-split frame, which is not what gets made. */}
          <OpeningList items={hydrateQuoteItems(data.items)} />
          {/* Money hangs off the BOTTOM of the list it describes, the same shape
              and the same component the issued quote and the order use. It began
              as a sibling card and was moved here (owner, 2026-08-14) so the
              stages read the same way round; it became the SHARED panel when the
              three copies of it had already drifted apart. */}
          <QuoteTotals
            lineTotals={data.items.map((it) => it.lineTotal ?? 0)}
            deliveryInc={delivery?.amount ?? null}
            postcode={delivery?.postcode ?? null}
            conservative={delivery?.conservative}
            pending />
        </Blk>

        <FilesBlock files={files} />
        <SummaryBand><ContactCard setPage={setPage} /></SummaryBand>
      </div>
    </>
  );
}


