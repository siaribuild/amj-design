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
import { opsReferralProgram, opsSaveReferralProgram, OpsApiError, type OpsReferralProgram } from "./api";

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

export function OpsReferrals() {
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
          {!Boolean(draft.active) && (
            <p className="t-bd-sm" style={{ color: MUTED }}>
              Joining is paused — the landing page carries the come-back-later banner, the placements
              disappear, and nothing already promised is withdrawn.
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
