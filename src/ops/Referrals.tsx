// ═══════════════════════════════════════════════════════════════════════════════
// OPS → REFERRALS. Screen 1: the Program.
//
// Function over finish: the console is due a redesign, so this reuses Pricing.tsx's
// shapes literally and spends nothing on appearance.
//
// THE RESTATEMENT CARD IS THE POINT OF THE SCREEN. These eleven values are what
// the public site advertises, and the person changing them is reading a form of
// bare numbers. A mistyped 10 in the discount field looks identical to a 1 until
// it is a sentence — so the card recomputes from the UNSAVED values and says the
// offer back in the words a tradie will read.
//
// ⚠️ capAmount is NULLABLE and must stay so. An empty field sends null, which
// means "render no cap clause at all". Sending 0 would advertise a cap of nothing
// — a materially different and much worse promise. minPayoutBalance is the mirror
// case: 0 is a real value meaning "no threshold language anywhere".
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { INK, QUIET as MUTED } from "../styles/tokens";
import {
  opsReferralProgram, opsSaveReferralProgram, opsReferralList, opsVoidReferral,
  opsUnvoidReferral, opsLinkReferral, OpsApiError,
  opsPayoutQueue, opsPayoutHistory, opsMarkPayoutsPaid, opsReversePayout,
  OPS_PAYOUT_CSV_URL, OPS_REFERRAL_FLAG_LABEL,
  type OpsReferralProgram, type OpsReferralRow, type OpsPayoutGroup, type OpsPayoutRecord,
} from "./api";

/** A number the form holds as typed, so a half-typed "2." is not coerced. */
type Draft = Record<string, string | boolean>;

const NUMBERS: { key: keyof OpsReferralProgram; label: string; hint: string; suffix?: string }[] = [
  { key: "ratePercent", label: "Commission rate", hint: "Of the referred order's goods, ex GST and excluding delivery.", suffix: "%" },
  { key: "discountPercent", label: "Referred discount", hint: "Off the referred tradie's first order.", suffix: "%" },
  { key: "minOrderAmount", label: "Qualifying minimum", hint: "Their first order, ex GST before delivery. Below it, nothing is earned.", suffix: "$" },
  { key: "capAmount", label: "Cap per referral", hint: "Blank = no cap, and no cap clause renders anywhere. Not the same as 0.", suffix: "$" },
  { key: "windowMonths", label: "Attribution window", hint: "One clock: the earning window and the discount's validity.", suffix: "months" },
  { key: "payoutTimeframeDays", label: "Payment timeframe", hint: "Stated wherever the offer is made, and it has to be met.", suffix: "days" },
];

const SWITCHES: { key: keyof OpsReferralProgram; label: string; hint: string }[] = [
  { key: "active", label: "Program", hint: "Off stops new referrals and the join flow. Nothing already promised is withdrawn." },
  { key: "referrerRewardActive", label: "Referrer reward", hint: "Off stops earnings being created. Discounts continue." },
  { key: "referredDiscountActive", label: "Referred discount", hint: "Off stops the discount on new pricing calls. Earnings continue." },
];

const pctText = (v: number) => `${Number(Number(v).toFixed(2))}%`;
const moneyText = (v: number) => `$${Math.round(v).toLocaleString("en-AU")}`;
const plural = (n: number, u: string) => `${n} ${u}${Math.abs(n) === 1 ? "" : "s"}`;

function ProgramScreen() {
  const [program, setProgram] = useState<OpsReferralProgram | null>(null);
  const [version, setVersion] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = () =>
    opsReferralProgram().then(({ program: p, version: v }) => {
      setProgram(p);
      setVersion(v);
      setDraft(Object.fromEntries(Object.entries(p).map(([k, val]) =>
        [k, typeof val === "boolean" ? val : val == null ? "" : String(val)])));
      setError(null);
    }, (e) => setError(e instanceof OpsApiError ? e.code : "Could not load the program."));
  useEffect(() => { void load(); }, []);

  if (!program) {
    return <div className="t-bd-sm" style={{ color: MUTED }}>{error ?? "Loading…"}</div>;
  }

  const num = (key: string) => {
    const raw = String(draft[key] ?? "").trim();
    return raw === "" ? null : Number(raw);
  };
  const value = (key: keyof OpsReferralProgram) => {
    const n = num(key);
    return n == null || Number.isNaN(n) ? (program[key] as number | null) : n;
  };
  const dirty = Object.entries(draft).some(([k, v]) => {
    const original = program[k as keyof OpsReferralProgram];
    return typeof v === "boolean" ? v !== original : String(v) !== (original == null ? "" : String(original));
  });

  const save = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const body = {
        expectedVersion: version,
        active: Boolean(draft.active),
        referrerRewardActive: Boolean(draft.referrerRewardActive),
        referredDiscountActive: Boolean(draft.referredDiscountActive),
        ratePercent: num("ratePercent") ?? program.ratePercent,
        discountPercent: num("discountPercent") ?? program.discountPercent,
        minOrderAmount: num("minOrderAmount") ?? program.minOrderAmount,
        // Blank means NULL — no cap clause anywhere — never 0.
        capAmount: num("capAmount"),
        minPayoutBalance: num("minPayoutBalance") ?? program.minPayoutBalance,
        windowMonths: num("windowMonths") ?? program.windowMonths,
        payoutTimeframeDays: num("payoutTimeframeDays") ?? program.payoutTimeframeDays,
      };
      const result = await opsSaveReferralProgram(body);
      setProgram(result.program);
      setVersion(result.version);
      setSaved(true);
    } catch (e) {
      // A stale version means somebody else saved while this form was open. Say
      // so and reload rather than swallowing it — the alternative is one editor
      // silently overwriting the other.
      //
      // The reload happens FIRST and the message is set after it: load() clears
      // the error on success, so setting the message before reloading wipes the
      // very explanation the reload needs.
      const conflict = e instanceof OpsApiError && e.code === "version_conflict";
      if (conflict) await load();
      setError(conflict
        ? "Someone else saved while this was open. Their version is loaded — re-apply your change."
        : e instanceof OpsApiError ? e.code : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const rate = value("ratePercent") ?? 0;
  const discount = value("discountPercent") ?? 0;
  const minOrder = value("minOrderAmount") ?? 0;
  const cap = value("capAmount");
  const windowM = value("windowMonths") ?? 0;
  const payDays = value("payoutTimeframeDays") ?? 0;
  const threshold = value("minPayoutBalance") ?? 0;

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      {/* ── The three switches, one control type ─────────────────────────── */}
      <section className="card">
        <div className="panel-head px-4 py-2.5 t-label" style={{ color: MUTED }}>Switches</div>
        {SWITCHES.map((s) => (
          <label key={String(s.key)} className="flex items-start gap-3 px-4 py-3 border-t border-black/[0.07] cursor-pointer">
            <input type="checkbox" className="mt-1" checked={Boolean(draft[s.key])}
              onChange={(e) => setDraft({ ...draft, [s.key]: e.target.checked })} />
            <span>
              <span className="block t-bd-sm" style={{ color: INK }}>{s.label}</span>
              <span className="block t-cap" style={{ color: MUTED }}>{s.hint}</span>
            </span>
          </label>
        ))}
      </section>

      {/* ── The six numbers ──────────────────────────────────────────────── */}
      <section className="card">
        <div className="panel-head px-4 py-2.5 t-label" style={{ color: MUTED }}>Numbers</div>
        {NUMBERS.map((f) => (
          <div key={String(f.key)} className="px-4 py-3 border-t border-black/[0.07] grid grid-cols-1 sm:grid-cols-[220px_120px_1fr] gap-2 sm:gap-4 sm:items-center">
            <span className="t-bd-sm" style={{ color: INK }}>{f.label}</span>
            <span className="flex items-center gap-1.5">
              {f.suffix === "$" && <span className="t-cap" style={{ color: MUTED }}>$</span>}
              <input inputMode="decimal" value={String(draft[f.key] ?? "")}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                placeholder={f.key === "capAmount" ? "none" : ""}
                className="field-control w-full border px-2 py-1 font-data t-data-sm" />
              {f.suffix && f.suffix !== "$" && <span className="t-cap" style={{ color: MUTED }}>{f.suffix}</span>}
            </span>
            <span className="t-cap" style={{ color: MUTED }}>{f.hint}</span>
          </div>
        ))}
        <div className="px-4 py-3 border-t border-black/[0.07] grid grid-cols-1 sm:grid-cols-[220px_120px_1fr] gap-2 sm:gap-4 sm:items-center">
          <span className="t-bd-sm" style={{ color: INK }}>Minimum payout balance</span>
          <span className="flex items-center gap-1.5">
            <span className="t-cap" style={{ color: MUTED }}>$</span>
            <input inputMode="decimal" value={String(draft.minPayoutBalance ?? "")}
              onChange={(e) => setDraft({ ...draft, minPayoutBalance: e.target.value })}
              className="field-control w-full border px-2 py-1 font-data t-data-sm" />
          </span>
          <span className="t-cap" style={{ color: MUTED }}>
            0 = pay whatever is owed, and no threshold language renders anywhere. Money held under a
            threshold is still legally payable and must not sit unpaid for twelve months.
          </span>
        </div>
      </section>

      {/* ── The restatement, from the UNSAVED values ─────────────────────── */}
      <section className="card">
        <div className="panel-head px-4 py-2.5 t-label" style={{ color: MUTED }}>What this says on the site</div>
        <div className="px-4 py-3 flex flex-col gap-2">
          <p className="t-bd" style={{ color: INK }}>
            Your mate gets <b>{pctText(discount)} off their first order</b>. When they place it and pay in
            full, we pay you <b>{pctText(rate)} of that order</b> — cash, into your bank account, within{" "}
            <b>{plural(payDays, "day")}</b>.
          </p>
          <p className="t-bd" style={{ color: INK }}>
            Their first order needs to be at least <b>{moneyText(minOrder)}</b> (ex GST, before delivery),
            and placed within <b>{plural(windowM, "month")}</b>.
            {cap != null && <> The most you can earn on one referral is <b>{moneyText(cap)}</b>.</>}
          </p>
          {threshold > 0 && (
            <p className="t-bd-sm" style={{ color: MUTED }}>
              We hold your earnings until they reach <b>{moneyText(threshold)}</b>.
            </p>
          )}
          {/* ⚠️ THIS PANEL EXISTS TO SHOW AN OPERATOR THE EFFECT OF THE SWITCH, so
              it has to describe what the site will actually do — the whole point
              of it is that nobody has to go and look. It has been wrong twice for
              the same reason: the page changed and this sentence did not. Change
              the Off behaviour of /refer and change this line in the same commit.
              Spec §4.7 lists exactly three effects, and they are these three. */}
          {!Boolean(draft.active) && (
            <p className="t-bd-sm" style={{ color: MUTED }}>
              Joining is paused — the landing page stays exactly as it is, with a banner at the top saying
              joining is paused; the join step stops after sign-in; and the placements on other pages
              disappear. The footer link stays, and nothing already promised is withdrawn.
            </p>
          )}
          <p className="t-cap" style={{ color: MUTED }}>
            Changes apply to referrals recorded from now on. Referrals already recorded keep the rate,
            discount, minimum, window and timeframe they were given.
          </p>
        </div>
      </section>

      {error && <p className="t-bd-sm" style={{ color: "var(--destructive)" }}>{error}</p>}
      {saved && !dirty && <p className="t-bd-sm" style={{ color: MUTED }}>Saved. The site is advertising these figures now.</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={!dirty || saving}
          className="px-4 py-2 t-bd-sm disabled:opacity-40" style={{ background: "var(--sage)", color: "#fff" }}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button onClick={load} disabled={!dirty || saving} className="px-4 py-2 t-bd-sm disabled:opacity-40" style={{ color: MUTED }}>
          Discard
        </button>
      </div>
    </div>
  );
}

// ── Screen 2: the referrals list ─────────────────────────────────────────────
// Three flags only — ABN, phone, business name. The postcode flag was specified,
// found to have no supporting data behind it, and struck: a suburb full of
// tradies is the target market, not evidence of anything.
// The labels live in api.ts beside the flag type, because the ops project record
// shows the same three and the two copies had already drifted.

function ReferralsList() {
  const [rows, setRows] = useState<OpsReferralRow[]>([]);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => opsReferralList({ status: status || undefined, q: q || undefined })
    .then((r) => { setRows(r.referrals); setError(null); },
      (e) => setError(e instanceof OpsApiError ? e.code : "Could not load referrals."));
  useEffect(() => { void load(); }, [status]);

  const doVoid = async (id: string) => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await opsVoidReferral(id, reason.trim());
      setVoiding(null); setReason("");
      await load();
    } catch (e) {
      setError(e instanceof OpsApiError ? e.code : "Could not void.");
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
          placeholder="Code, referrer or referred name"
          className="field-control border px-2 py-1 t-bd-sm min-w-[260px]" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="field-control border px-2 py-1 t-bd-sm">
          <option value="">All statuses</option>
          <option value="recorded">recorded</option>
          <option value="void">void</option>
        </select>
        <button onClick={() => void load()} className="px-3 py-1 t-bd-sm" style={{ color: MUTED }}>Search</button>
      </div>

      {error && <p className="t-bd-sm" style={{ color: "var(--destructive)" }}>{error}</p>}

      <section className="card">
        <div className="panel-head px-4 py-2.5 t-label" style={{ color: MUTED }}>
          {rows.length} referral{rows.length === 1 ? "" : "s"}
        </div>
        {rows.length === 0 && <p className="px-4 py-3 t-bd-sm" style={{ color: MUTED }}>Nothing matches.</p>}
        {rows.map((r) => (
          <div key={r.id} className="px-4 py-3 border-t border-black/[0.07] flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-data t-data" style={{ color: INK }}>{r.code}</span>
              <span className="t-bd-sm" style={{ color: INK }}>{r.referrerName} → {r.referredName}</span>
              <span className="t-cap" style={{ color: MUTED }}>{r.source} · {String(r.createdAt).slice(0, 10)}</span>
              <span className="t-cap" style={{ color: r.status === "void" ? "var(--destructive)" : MUTED }}>{r.status}</span>
              {r.orderNo && <span className="t-cap" style={{ color: MUTED }}>order {r.orderNo}</span>}
              {/* What is owed, stated before anyone decides to void. Voiding a
                  row with confirmed money behind it is a different act from
                  voiding one that owes nothing. */}
              {r.earning
                ? <span className="t-cap" style={{ color: INK }}>{moneyText(r.earning.amount)} {r.earning.status}</span>
                : <span className="t-cap" style={{ color: MUTED }}>nothing owed</span>}
            </div>
            {r.flags.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                {r.flags.map((f) => <span key={f} className="quote-chip quote-chip--neutral">{OPS_REFERRAL_FLAG_LABEL[f]}</span>)}
                <span className="t-cap" style={{ color: MUTED }}>shared with the referrer — nothing is blocked</span>
              </div>
            )}
            {r.voidReason && <p className="t-cap" style={{ color: MUTED }}>Voided: {r.voidReason}</p>}

            {/* The reason is a FIELD, not a confirm dialog with a default
                string. Whoever asks later is usually the person not being paid,
                and "voided" answers nothing. */}
            {voiding === r.id ? (
              <div className="flex flex-wrap gap-2 items-center">
                <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this being voided?" className="field-control border px-2 py-1 t-bd-sm min-w-[300px]" />
                <button onClick={() => void doVoid(r.id)} disabled={!reason.trim() || busy}
                  className="px-3 py-1 t-bd-sm disabled:opacity-40" style={{ background: "var(--destructive)", color: "#fff" }}>
                  Void referral
                </button>
                <button onClick={() => { setVoiding(null); setReason(""); }} className="px-3 py-1 t-bd-sm" style={{ color: MUTED }}>Cancel</button>
              </div>
            ) : (
              <div className="flex gap-3">
                {r.status === "void"
                  ? <button onClick={() => void opsUnvoidReferral(r.id).then(load)} className="t-cap" style={{ color: MUTED }}>Un-void</button>
                  : <button onClick={() => { setVoiding(r.id); setReason(""); }} className="t-cap" style={{ color: "var(--destructive)" }}>Void…</button>}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

// ── Screen 4: the link action ────────────────────────────────────────────────
// Goes through recordReferral, so every gate the customer paths run applies
// identically — a privileged path that skipped them would become the way around
// all of them.
//
// Its refusals are SPECIFIC, unlike the customer-facing ones. Their vagueness
// exists so a stranger cannot probe which codes are real; there is no stranger
// on an internal screen, and Ops needs to know whether to ring the applicant
// back or drop it.
const LINK_ERROR: Record<string, string> = {
  no_such_account: "No account with that email.",
  invalid_code: "That code isn't usable — check it, or the referrer may have left the program and have no bank details stored.",
  own_code: "That's this account's own code.",
  already_referred: "This account already has a referral. One per account, permanently.",
  has_order: "This account has already ordered — a code can only be attached before the first order.",
  not_eligible: "The two accounts share an ABN.",
  program_off: "The program is off, so nothing would be recorded.",
};

function LinkAction() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    if (!email.trim() || !code.trim() || busy) return;
    setBusy(true); setResult(null);
    try {
      await opsLinkReferral({ email: email.trim(), code: code.trim().toUpperCase() });
      setResult({ ok: true, text: `Linked ${email.trim()} to ${code.trim().toUpperCase()}.` });
      setEmail(""); setCode("");
    } catch (e) {
      const failed = e instanceof OpsApiError ? e.code : "";
      setResult({ ok: false, text: LINK_ERROR[failed] ?? "Could not link that code." });
    } finally { setBusy(false); }
  };

  return (
    <section className="card max-w-2xl">
      <div className="panel-head px-4 py-2.5 t-label" style={{ color: MUTED }}>Attach a code to an account</div>
      <div className="px-4 py-3 flex flex-col gap-3">
        <p className="t-cap" style={{ color: MUTED }}>
          For an applicant who gave a code when they applied. This runs the same gates as every other path,
          so it cannot attach a code the customer paths would have refused.
        </p>
        <div className="flex flex-wrap gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Account email"
            className="field-control border px-2 py-1 t-bd-sm min-w-[260px]" />
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC-123"
            maxLength={7} className="field-control border px-2 py-1 font-data t-data-sm w-[130px]" />
          <button onClick={() => void submit()} disabled={busy || !email.trim() || !code.trim()}
            className="px-3 py-1 t-bd-sm disabled:opacity-40" style={{ background: "var(--sage)", color: "#fff" }}>
            {busy ? "Linking…" : "Link"}
          </button>
        </div>
        {result && <p className="t-bd-sm" style={{ color: result.ok ? INK : "var(--destructive)" }}>{result.text}</p>}
      </div>
    </section>
  );
}

// ── Screen 3: the payout run ─────────────────────────────────────────────────
// FUNCTION ONLY. The console is due a redesign, so this borrows ReferralsList's
// markup wholesale and spends nothing on appearance.
//
// Three things are deliberate rather than unfinished:
//   · No checkboxes and no bulk control. Six transfers is six rows, each recorded
//     with the reference its own transfer actually got — one reference standing
//     for six is a reconciliation someone loses an afternoon to.
//   · Record payment and Didn't go through both live ON THE ROW. An action above
//     a table acts on a selection, and a selection is the thing that is wrong
//     when money goes to the wrong person.
//   · Export CSV is a plain link. It downloads a file, and — like opening this
//     screen — it is recorded as a read of everyone's bank details.
//
// ⚠️ OPENING THIS SCREEN READS BANK DETAILS IN THE CLEAR and writes an access-log
// row saying so. It is not a screen to leave sitting open or to poll.
const money2 = (v: number) => `$${v.toFixed(2)}`;
const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

function PayoutsScreen() {
  const [queue, setQueue] = useState<{ ready: OpsPayoutGroup[]; accruing: OpsPayoutGroup[]; readyTotal: number } | null>(null);
  const [history, setHistory] = useState<OpsPayoutRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [reversing, setReversing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([opsPayoutQueue(), opsPayoutHistory()]).then(
    ([q, h]) => { setQueue(q); setHistory(h.payouts); setError(null); },
    (e) => setError(e instanceof OpsApiError ? e.code : "Could not load the payout run."),
  );
  useEffect(() => { void load(); }, []);

  const record = async (userId: string) => {
    if (!reference.trim() || busy) return;
    setBusy(true);
    try {
      await opsMarkPayoutsPaid({ userIds: [userId], reference: reference.trim() });
      setPaying(null); setReference("");
      await load();
    } catch (e) {
      setError(e instanceof OpsApiError ? e.code : "Could not record that payment.");
    } finally { setBusy(false); }
  };

  const reverse = async (payoutId: string) => {
    setBusy(true);
    try {
      await opsReversePayout(payoutId, note.trim() || undefined);
      setReversing(null); setNote("");
      await load();
    } catch (e) {
      setError(e instanceof OpsApiError ? e.code : "Could not reverse that payment.");
    } finally { setBusy(false); }
  };

  if (!queue) return <div className="t-bd-sm" style={{ color: MUTED }}>{error ?? "Loading…"}</div>;

  const row = (g: OpsPayoutGroup, payable: boolean) => (
    <div key={g.userId} className="px-4 py-3 border-t border-black/[0.07] flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="t-bd-sm" style={{ color: INK }}>{g.name}</span>
        <span className="t-cap" style={{ color: MUTED }}>{g.earningIds.length} earning{g.earningIds.length === 1 ? "" : "s"}</span>
        <span className="font-data t-data-sm" style={{ color: INK }}>{money2(g.amount)}</span>
        {/* The three fields a transfer is typed from. */}
        <span className="font-data t-data-sm" style={{ color: MUTED }}>ABN {g.abn ?? "—"}</span>
        <span className="font-data t-data-sm" style={{ color: MUTED }}>BSB {g.bsb ?? "—"}</span>
        <span className="font-data t-data-sm" style={{ color: MUTED }}>Acct {g.accountNumber ?? "—"}</span>
        <span className="t-cap" style={{ color: MUTED }}>{g.accountName ?? "—"}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {/* Oldest confirmed — how long this person has been waiting, which is the
            only thing on the row that can already be a broken promise. */}
        <span className="t-cap" style={{ color: MUTED }}>
          Oldest confirmed {String(g.oldestConfirmedAt).slice(0, 10)} · waiting {days(g.daysWaiting)}
        </span>
        {g.overPromise && <span className="quote-chip quote-chip--neutral" style={{ color: "var(--destructive)" }}>Past the promised date</span>}
        {g.forcedByLongStop && <span className="quote-chip quote-chip--neutral">Held 11 months — pay now</span>}
        <span className="t-cap" style={{ color: MUTED }}>{g.referralRefs.join(", ")}</span>
      </div>
      {paying === g.userId ? (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="t-cap" style={{ color: MUTED }}>Record this AFTER the transfer is made:</span>
          <input autoFocus value={reference} onChange={(e) => setReference(e.target.value)}
            placeholder="Bank reference from the transfer"
            className="field-control border px-2 py-1 t-bd-sm min-w-[260px]" />
          <button onClick={() => void record(g.userId)} disabled={!reference.trim() || busy}
            className="px-3 py-1 t-bd-sm disabled:opacity-40" style={{ background: "var(--sage)", color: "#fff" }}>
            Record {money2(g.amount)} paid
          </button>
          <button onClick={() => { setPaying(null); setReference(""); }} className="px-3 py-1 t-bd-sm" style={{ color: MUTED }}>Cancel</button>
        </div>
      ) : (
        <div className="flex gap-3">
          <button onClick={() => { setPaying(g.userId); setReference(""); }} className="t-cap" style={{ color: INK }}>
            {payable ? "Record payment…" : "Pay anyway…"}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="t-bd-sm" style={{ color: "var(--destructive)" }}>{error}</p>}

      <div className="flex flex-wrap gap-3 items-baseline">
        <span className="t-bd-sm" style={{ color: INK }}>
          {queue.ready.length} referrer{queue.ready.length === 1 ? "" : "s"} · {money2(queue.readyTotal)} to pay
        </span>
        {/* A link, not a button: it is a file download, and the browser does that
            better than any handler here would. */}
        <a href={OPS_PAYOUT_CSV_URL} className="t-cap" style={{ color: INK }}>Export CSV</a>
        <span className="t-cap" style={{ color: MUTED }}>
          Bank details are read in the clear on this screen, and that read is recorded.
        </span>
      </div>

      <section className="card">
        <div className="panel-head px-4 py-2.5 t-label" style={{ color: MUTED }}>
          To pay — one row per referrer, one transfer each
        </div>
        {queue.ready.length === 0 && <p className="px-4 py-3 t-bd-sm" style={{ color: MUTED }}>Nothing owed right now.</p>}
        {queue.ready.map((g) => row(g, true))}
      </section>

      {queue.accruing.length > 0 && (
        <section className="card">
          <div className="panel-head px-4 py-2.5 t-label" style={{ color: MUTED }}>
            Accruing — under the payout threshold. Still owed, and payable early if someone asks.
          </div>
          {queue.accruing.map((g) => row(g, false))}
        </section>
      )}

      <section className="card">
        <div className="panel-head px-4 py-2.5 t-label" style={{ color: MUTED }}>Payments made</div>
        {history.length === 0 && <p className="px-4 py-3 t-bd-sm" style={{ color: MUTED }}>Nothing has gone out yet.</p>}
        {history.map((p) => (
          <div key={p.id} className="px-4 py-3 border-t border-black/[0.07] flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="t-cap" style={{ color: MUTED }}>{String(p.paidAt).slice(0, 10)}</span>
              <span className="t-bd-sm" style={{ color: INK }}>{p.referrerName}</span>
              <span className="font-data t-data-sm" style={{ color: INK }}>{money2(p.amount)}</span>
              <span className="font-data t-data-sm" style={{ color: MUTED }}>{p.reference ?? "—"}</span>
              <span className="font-data t-data-sm" style={{ color: MUTED }}>{p.accountMasked ?? "—"}</span>
              <span className="t-cap" style={{ color: p.status === "failed" ? "var(--destructive)" : MUTED }}>{p.status}</span>
              {/* What happened, where the next run will read it. A closed account
                  and a mis-recorded row need opposite responses. */}
              {p.note && <span className="t-cap" style={{ color: MUTED }}>{p.note}</span>}
            </div>
            {/* ON THE LINE. Reversing the wrong payment is the mistake this
                screen can make, and a control at the top of a table is how it
                gets made. */}
            {p.status === "paid" && (reversing === p.id ? (
              <div className="flex flex-wrap gap-2 items-center">
                {/* OPTIONAL. The button is never disabled — money going back into
                    the queue must not wait on a text box. The placeholder names
                    both real cases, because an empty optional field is one nobody
                    fills in. */}
                <input autoFocus value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional — e.g. bounced, account closed / recorded against the wrong referrer"
                  className="field-control border px-2 py-1 t-bd-sm min-w-[380px]" />
                <button onClick={() => void reverse(p.id)} disabled={busy}
                  className="px-3 py-1 t-bd-sm disabled:opacity-40" style={{ background: "var(--destructive)", color: "#fff" }}>
                  Reverse this payment
                </button>
                <button onClick={() => { setReversing(null); setNote(""); }} className="px-3 py-1 t-bd-sm" style={{ color: MUTED }}>Cancel</button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button onClick={() => { setReversing(p.id); setNote(""); }} className="t-cap"
                  style={{ color: "var(--destructive)" }}>
                  Didn't go through…
                </button>
              </div>
            ))}
          </div>
        ))}
        <p className="px-4 py-3 border-t border-black/[0.07] t-cap" style={{ color: MUTED }}>
          Bank details are frozen onto each payment as it goes out, so this stays correct after a referrer
          changes theirs or leaves. Reversing puts the earnings back in the queue and keeps the payment here.
        </p>
      </section>
    </div>
  );
}

const SUB_TABS = [
  { id: "program", label: "Program" },
  { id: "referrals", label: "Referrals" },
  { id: "payouts", label: "Payouts" },
] as const;

export function OpsReferrals() {
  const [sub, setSub] = useState<(typeof SUB_TABS)[number]["id"]>("program");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4 border-b border-black/10">
        {SUB_TABS.map((t) => (
          <button key={t.id} onClick={() => setSub(t.id)} className="pb-2 -mb-px border-b-2 t-bd-sm"
            style={sub === t.id ? { borderColor: "var(--sage)", color: INK } : { borderColor: "transparent", color: MUTED }}>
            {t.label}
          </button>
        ))}
      </div>
      {sub === "program" ? <ProgramScreen />
        : sub === "payouts" ? <PayoutsScreen />
        : <div className="flex flex-col gap-5"><LinkAction /><ReferralsList /></div>}
    </div>
  );
}
