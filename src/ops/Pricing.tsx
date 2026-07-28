// Ops → Pricing: the editor for the D1 commercial layer.
//
// THE BOUNDARY: ops writes the numbers, Sanity writes the words. Names,
// descriptions, images and which options a product offers are edited in Studio;
// what anything costs is edited here. Both editors can be checked against that
// sentence in five seconds, which is the point of writing it down.
//
// Two decisions worth knowing before reading:
//
//  • Rate cards are NOT inline-editable; options ARE. An option surcharge is a
//    flat amount whose effect is linear and bounded, so density wins. A rate
//    card's effect is dimensional and non-obvious — two numbers with only a
//    total for feedback is exactly the mistyped-rate scenario — so it opens a
//    detail view with a worked example, and comprehension wins.
//  • There is no approval queue and no "publish pricing" mode. In a four-person
//    shop an approval gate resolves to self-approval or a verbal yes clicked on
//    someone else's behalf, which is worse than no gate because it looks like a
//    control. Safety comes from preview, audit, and one-click revert instead.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, ExternalLink, Plus, RefreshCw, Trash2, X } from "lucide-react";
import {
  OpsApiError, opsCatalogueMirror, opsPricePreview, opsPricingOptions, opsPricingPolicy,
  opsRateCard, opsRateCards, opsReconcile, opsReconcileLast, opsRevertRateCard,
  opsSaveModifiers, opsSaveOption, opsSavePolicy, opsSaveRateCard,
  type OpsCatalogueMirror, type OpsModifier, type OpsPricedSample, type OpsPricingHistory,
  type OpsRateCardRow, type OpsReconcileRun,
} from "./api";

const SAGE = "#5A7A6A";
const INK = "#14150f";
const MUTED = "#8b8880";
const MONO = { fontFamily: "'DM Mono', monospace" } as const;
const HEAD = { fontFamily: "'Space Grotesk', sans-serif" } as const;

// The sign goes OUTSIDE the symbol — "$-3.60" reads as a currency code for a
// moment before it reads as a debit, and this column is scanned, not read.
const money = (n: number | null | undefined) =>
  n == null ? "—" : n === 0 ? "$0.—"
    : `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-AU")}`;
const ago = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (!Number.isFinite(mins)) return "—";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

type Sub = "rate-cards" | "options" | "policy" | "catalogue";
const SUBS: { id: Sub; label: string }[] = [
  { id: "rate-cards", label: "Rate cards" },
  { id: "options", label: "Options" },
  { id: "policy", label: "Policy" },
  { id: "catalogue", label: "Catalogue" },
];

export function Pricing() {
  const [sub, setSub] = useState<Sub>("rate-cards");
  const [run, setRun] = useState<OpsReconcileRun | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    opsReconcileLast().then((d) => { setRun(d.run); setChecked(true); }).catch(() => setChecked(true));
  }, []);
  useEffect(load, [load]);

  const recheck = async () => {
    setBusy(true);
    try { setRun((await opsReconcile()).run); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-5xl">
      <HealthBanner run={run} checked={checked} busy={busy} onRecheck={recheck} onFix={() => setSub("options")} />

      <div className="flex gap-5 border-b border-black/8 mb-5">
        {SUBS.map((s) => (
          <button key={s.id} onClick={() => setSub(s.id)}
            className="pb-2 -mb-px text-sm"
            style={{
              color: sub === s.id ? SAGE : MUTED,
              borderBottom: sub === s.id ? `2px solid ${SAGE}` : "2px solid transparent",
              fontWeight: sub === s.id ? 600 : 400,
            }}>
            {s.label}
          </button>
        ))}
      </div>

      {sub === "rate-cards" ? <RateCards />
        : sub === "options" ? <Options onChanged={load} />
          : sub === "policy" ? <Policy />
            : <CatalogueMirror />}
    </div>
  );
}

// ── Health banner ────────────────────────────────────────────────────────────
// On EVERY pricing screen, so a known failure cannot live on a screen nobody
// visits. "Nothing has checked yet" is said out loud rather than shown as green:
// an unlabelled green banner and a broken checker look identical.
function HealthBanner({ run, checked, busy, onRecheck, onFix }: {
  run: OpsReconcileRun | null; checked: boolean; busy: boolean; onRecheck: () => void; onFix: () => void;
}) {
  if (!checked) return null;
  const gaps = (run?.missing.length ?? 0) + (run?.productsWithoutRateCard.length ?? 0);

  if (!run) {
    return (
      <Banner tone="warn">
        <span>Pricing has never been checked against the catalogue.</span>
        <button onClick={onRecheck} disabled={busy} className="underline underline-offset-2">
          {busy ? "Checking…" : "Check now"}
        </button>
      </Banner>
    );
  }
  if (gaps === 0) {
    return (
      <Banner tone="ok">
        <span>✓ Every option a product offers has a price. Checked {ago(run.checkedAt)}.</span>
        <button onClick={onRecheck} disabled={busy} className="underline underline-offset-2">
          {busy ? "Checking…" : "Re-check"}
        </button>
      </Banner>
    );
  }
  return (
    <Banner tone="warn">
      <span className="flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        {run.missing.length > 0 && (
          <span>{run.missing.length} chargeable option{run.missing.length === 1 ? " has" : "s have"} no price — lines using {run.missing.length === 1 ? "it" : "them"} refuse to price.</span>
        )}
        {run.productsWithoutRateCard.length > 0 && (
          <span>{run.productsWithoutRateCard.length} product{run.productsWithoutRateCard.length === 1 ? " has" : "s have"} no rate card — {run.productsWithoutRateCard.length === 1 ? "it prices" : "they price"} at ‘default’.</span>
        )}
      </span>
      <span className="flex items-center gap-3 shrink-0">
        {run.missing.length > 0 && <button onClick={onFix} className="underline underline-offset-2">Fix</button>}
        <button onClick={onRecheck} disabled={busy} title="Re-check now"><RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /></button>
      </span>
    </Banner>
  );
}

function Banner({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  const ok = tone === "ok";
  return (
    <div className="text-xs px-4 py-2.5 mb-5 flex items-center justify-between gap-4 border"
      style={{
        background: ok ? "rgba(90,122,106,0.08)" : "rgba(180,120,40,0.09)",
        borderColor: ok ? "rgba(90,122,106,0.25)" : "rgba(180,120,40,0.3)",
        color: ok ? "#355344" : "#7a5410",
      }}>
      {children}
    </div>
  );
}

// ── Rate cards ───────────────────────────────────────────────────────────────
function RateCards() {
  const [data, setData] = useState<{ canEdit: boolean; cards: OpsRateCardRow[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => { opsRateCards().then(setData).catch(() => setData(null)); }, []);
  useEffect(load, [load]);

  if (open) return <RateCardDetail id={open} onBack={() => { setOpen(null); load(); }} />;
  if (!data) return <p className="text-sm" style={{ color: MUTED }}>Loading rate cards…</p>;

  return (
    <>
      <p className="text-xs mb-3" style={{ color: MUTED }}>
        A unit is <span style={MONO}>perimeter(m) × perim + area(m²) × area + options</span>, then the minimum
        charge, then the rules, then rounded to $10. The example column prices a 1200 × 1200 mm opening with no
        options on each card — a mistyped rate shows up there before it reaches a customer.
      </p>
      {/* Contained so it scrolls inside its own box rather than widening the
          document. Pricing is a desktop surface and is still slated for an
          explicit desktop-only notice on phones. */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide" style={{ color: MUTED }}>
              <th className="text-left font-medium px-4 py-2">Product</th>
              <th className="text-right font-medium px-3 py-2">Perim $/m</th>
              <th className="text-right font-medium px-3 py-2">Area $/m²</th>
              <th className="text-right font-medium px-3 py-2">Min $</th>
              <th className="text-right font-medium px-3 py-2">Rules</th>
              <th className="text-right font-medium px-3 py-2">Example</th>
              <th className="text-right font-medium px-4 py-2">Ver</th>
            </tr>
          </thead>
          <tbody>
            {data.cards.map((c) => (
              <tr key={c.id} onClick={() => setOpen(c.id)}
                className="border-t border-black/5 cursor-pointer hover:bg-black/[0.015]">
                <td className="px-4 py-2" style={{ color: INK }}>
                  {/* Product NAME first — the slug is the join key staff match
                      against migrations and SQL, so it stays, underneath. */}
                  {c.productName
                    ? <>
                        <span>{c.productName}</span>
                        <span className="block text-[11px]" style={{ ...MONO, color: MUTED }}>
                          {c.id}{c.familySlug ? ` · ${c.familySlug}` : ""}
                        </span>
                      </>
                    : <span style={MONO}>{c.id}</span>}
                  {c.id === "default" && (
                    // Load-bearing: loadRateCard silently falls back here for any
                    // product without a card of its own, so it must not read as
                    // just another row.
                    <span className="ml-2 text-[11px]" style={{ color: MUTED }}>← fallback for unmapped products</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right" style={{ ...MONO, color: INK }}>{c.perimRate.toFixed(2)}</td>
                <td className="px-3 py-2 text-right" style={{ ...MONO, color: INK }}>{c.areaRate.toFixed(2)}</td>
                <td className="px-3 py-2 text-right" style={{ ...MONO, color: c.minCharge ? INK : MUTED }}>{c.minCharge ? c.minCharge.toFixed(2) : "0.—"}</td>
                <td className="px-3 py-2 text-right" style={{ ...MONO, color: MUTED }}>{c.modifierCount}</td>
                <td className="px-3 py-2 text-right" style={{ ...MONO, color: INK }}>{money0(c.exampleTotal)}</td>
                <td className="px-4 py-2 text-right" style={{ ...MONO, color: MUTED }}>{c.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs mt-2" style={{ color: MUTED }}>
        {data.canEdit ? "Open a row to edit it." : "Read-only — a manager or admin can change these."}
      </p>
    </>
  );
}

type Detail = Awaited<ReturnType<typeof opsRateCard>>;

function RateCardDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [perim, setPerim] = useState("");
  const [area, setArea] = useState("");
  const [min, setMin] = useState("");
  const [rules, setRules] = useState<OpsModifier[]>([]);
  const [preview, setPreview] = useState<OpsPricedSample[]>([]);
  const [baseline, setBaseline] = useState<OpsPricedSample[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    opsRateCard(id).then((data) => {
      setD(data);
      setPerim(String(data.card.perimRate));
      setArea(String(data.card.areaRate));
      setMin(String(data.card.minCharge));
      setRules(data.modifiers);
      // The baseline prices the STORED values, so the confirm dialog can show a
      // real before/after rather than only the after.
      opsPricePreview({ rateCardId: id, samples: data.samples }).then((p) => {
        setBaseline(p.samples); setPreview(p.samples);
      }).catch(() => undefined);
    }).catch(() => setD(null));
  }, [id]);

  const edited = useMemo(() => {
    if (!d) return false;
    return Number(perim) !== d.card.perimRate || Number(area) !== d.card.areaRate
      || Number(min) !== d.card.minCharge || JSON.stringify(rules) !== JSON.stringify(d.modifiers);
  }, [d, perim, area, min, rules]);

  // Live, as they type — the Save button is the commit, never the calculate.
  useEffect(() => {
    if (!d) return;
    const t = setTimeout(() => {
      opsPricePreview({
        rateCardId: id, perimRate: Number(perim), areaRate: Number(area), minCharge: Number(min),
        modifiers: rules, samples: d.samples,
      }).then((p) => setPreview(p.samples)).catch(() => undefined);
    }, 180);
    return () => clearTimeout(t);
  }, [d, id, perim, area, min, rules]);

  if (!d) return <p className="text-sm" style={{ color: MUTED }}>Loading…</p>;

  const typical = preview.find((s) => s.sample.key === "typical") ?? preview[1] ?? preview[0];
  const perimM = typical ? (2 * (typical.sample.widthMm + typical.sample.heightMm)) / 1000 : 0;
  const areaM2 = typical ? (typical.sample.widthMm * typical.sample.heightMm) / 1_000_000 : 0;

  const save = async (note: string) => {
    setError(null);
    try {
      const cardChanged = Number(perim) !== d.card.perimRate || Number(area) !== d.card.areaRate || Number(min) !== d.card.minCharge;
      let version = d.card.version;
      if (cardChanged) {
        version = (await opsSaveRateCard(id, {
          perimRate: Number(perim), areaRate: Number(area), minCharge: Number(min),
          note, expectedVersion: version,
        })).version;
      }
      if (JSON.stringify(rules) !== JSON.stringify(d.modifiers)) {
        await opsSaveModifiers(id, { modifiers: rules, note, expectedVersion: version });
      }
      setConfirming(false);
      onBack();
    } catch (e) {
      setConfirming(false);
      setError(e instanceof OpsApiError && e.code === "version_conflict"
        ? "Someone else changed this card while you had it open. Reload to see their change."
        : "That change could not be saved.");
    }
  };

  return (
    <>
      <button onClick={onBack} className="text-xs flex items-center gap-1 mb-3" style={{ color: MUTED }}>
        <ArrowLeft className="w-3.5 h-3.5" /> Rate cards
      </button>

      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg" style={{ ...HEAD, color: INK }}>{id}</h2>
        <span className="text-xs" style={{ ...MONO, color: MUTED }}>
          {d.card.version} · {d.updatedAt ? ago(d.updatedAt) : "unchanged since seed"}
        </span>
      </div>

      {error && <Banner tone="warn"><span>{error}</span><span /></Banner>}

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div>
          <h3 className="text-xs uppercase tracking-wide mb-3" style={{ color: MUTED }}>Base rate</h3>
          <Field label="Perimeter rate" suffix="/m" value={perim} onChange={setPerim} disabled={!d.canEdit} />
          <Field label="Area rate" suffix="/m²" value={area} onChange={setArea} disabled={!d.canEdit} />
          <Field label="Minimum charge" value={min} onChange={setMin} disabled={!d.canEdit} />
          {/* The unit of effect, given BEFORE anyone types. It is just the
              perimeter and area restated as money — the thing an operator cannot
              compute in their head and the thing they need. */}
          <p className="text-xs mt-3 leading-relaxed" style={{ color: MUTED }}>
            +$1 on the perimeter rate moves the typical example by {money(perimM)}.<br />
            +$1 on the area rate moves it by {money(areaM2)}.
          </p>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-xs uppercase tracking-wide" style={{ color: MUTED }}>Worked example</h3>
          </div>
          <WorkedExample priced={typical} />
          <p className="text-xs mt-2" style={{ color: MUTED }}>
            {d.samplesFromHistory
              ? `Small / typical / large are the 10th, 50th and 90th percentile of the ${d.sampleLineCount} ${id} lines quoted in the last 90 days.`
              : "Not enough recent lines for this family — using standard sizes (900×600, 1200×1200, 2400×1500)."}
          </p>
          <div className="mt-3 card">
            {preview.map((p) => (
              <div key={p.sample.key} className="flex items-center justify-between px-3 py-1.5 border-b border-black/5 last:border-0 text-xs">
                <span style={{ color: MUTED }}>{p.sample.key}</span>
                <span style={{ ...MONO, color: MUTED }}>{p.sample.widthMm} × {p.sample.heightMm}</span>
                <span style={{ ...MONO, color: INK }}>{money0(p.snapshot.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Rules rules={rules} setRules={setRules} preview={preview} canEdit={d.canEdit} />

      {d.canEdit && edited && (
        <div className="flex items-center justify-end gap-4 mt-6 pt-4 border-t border-black/8">
          <button onClick={() => {
            setPerim(String(d.card.perimRate)); setArea(String(d.card.areaRate));
            setMin(String(d.card.minCharge)); setRules(d.modifiers);
          }} className="text-xs" style={{ color: MUTED }}>Discard changes</button>
          <button onClick={() => setConfirming(true)}
            className="text-xs text-white px-4 py-2" style={{ background: SAGE }}>Review change →</button>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          family={id}
          before={{ perim: d.card.perimRate, area: d.card.areaRate, min: d.card.minCharge }}
          after={{ perim: Number(perim), area: Number(area), min: Number(min) }}
          baseline={baseline} preview={preview}
          exposure={d.draftExposure}
          onCancel={() => setConfirming(false)} onSave={save}
        />
      )}

      <History rows={d.history} canRevert={d.canRevert}
        onRevert={async (v) => { await opsRevertRateCard(id, v); onBack(); }} />
    </>
  );
}

function Field({ label, value, onChange, suffix, disabled }: {
  label: string; value: string; onChange: (v: string) => void; suffix?: string; disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 mb-2">
      <span className="text-sm" style={{ color: INK }}>{label}</span>
      <span className="flex items-center gap-1">
        <span style={{ ...MONO, color: MUTED }}>$</span>
        <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
          inputMode="decimal"
          className="w-24 text-right border border-black/12 px-2 py-1 text-sm disabled:bg-black/[0.03]"
          style={{ ...MONO, color: INK }} />
        {suffix && <span className="text-xs w-6" style={{ color: MUTED }}>{suffix}</span>}
      </span>
    </label>
  );
}

/** The arithmetic the engine actually performed, one operation per line —
 *  including the steps that did nothing. "minimum charge — no effect" and
 *  "rule ① — did not fire" are the highest-value lines here: they teach the shape
 *  of the formula on a day when nothing is wrong, so that on the day something is
 *  wrong the operator can read it. */
function WorkedExample({ priced }: { priced: OpsPricedSample | undefined }) {
  if (!priced) return <div className="card p-3 text-xs" style={{ color: MUTED }}>No example available.</div>;
  const steps = priced.snapshot.steps ?? [];
  return (
    <div className="card p-3">
      <p className="text-xs mb-2" style={{ color: MUTED }}>
        {priced.sample.widthMm} × {priced.sample.heightMm} mm · qty {priced.sample.qty}
      </p>
      {steps.map((s, i) => (
        <div key={`${s.key}-${i}`} className="flex items-baseline justify-between text-xs py-0.5"
          style={{ color: s.applied ? INK : MUTED }}>
          <span className="truncate pr-2">{s.label}</span>
          <span className="flex items-baseline gap-3 shrink-0" style={MONO}>
            {s.detail && <span className="text-[11px]" style={{ color: MUTED }}>{s.detail}</span>}
            <span className="w-20 text-right">{s.applied && s.amount != null ? money(s.amount) : "—"}</span>
          </span>
        </div>
      ))}
      <div className="flex items-baseline justify-between text-sm pt-2 mt-1 border-t border-black/8" style={{ color: INK }}>
        <span>Total</span><span style={MONO}>{money(priced.snapshot.total)}</span>
      </div>
      <div className="flex items-baseline justify-between text-xs" style={{ color: MUTED }}>
        <span>deposit</span><span style={MONO}>{money(priced.snapshot.depositAmount)}</span>
      </div>
    </div>
  );
}

// ── Rules ────────────────────────────────────────────────────────────────────
// The grammar in migration 0026 is closed and tiny: 4 fields × 5 operators × a
// number → percent | fixed. No AND, no OR, no grouping, no nesting — so this
// editor shows no affordance for any of those. Every affordance offered for
// something the engine cannot do becomes a support ticket.
const FIELD_UNIT: Record<string, string> = { width: "mm", height: "mm", area: "m²", qty: "units" };

function Rules({ rules, setRules, preview, canEdit }: {
  rules: OpsModifier[]; setRules: (r: OpsModifier[]) => void; preview: OpsPricedSample[]; canEdit: boolean;
}) {
  const patch = (i: number, p: Partial<OpsModifier>) =>
    setRules(rules.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs uppercase tracking-wide" style={{ color: MUTED }}>Pricing rules ({rules.length})</h3>
        {canEdit && (
          <button className="text-xs flex items-center gap-1" style={{ color: SAGE }}
            onClick={() => setRules([...rules, {
              id: "", seq: rules.length * 10, label: null,
              whenField: "width", whenOp: ">", whenValue: 0, thenType: "percent", thenValue: 0,
            }])}>
            <Plus className="w-3.5 h-3.5" /> Add a rule
          </button>
        )}
      </div>

      <div className="card">
        {rules.length === 0 && <p className="px-4 py-3 text-xs" style={{ color: MUTED }}>No rules — the base rate is the whole price.</p>}
        {rules.map((r, i) => {
          // "Fires for" answers "did I write what I meant?" without the operator
          // having to construct a test case.
          const fires = preview.filter((p) => p.snapshot.appliedModifiers.includes(r.id));
          return (
            <div key={r.id || `new-${i}`} className="px-4 py-3 border-b border-black/5 last:border-0">
              <div className="flex flex-wrap items-center gap-1.5 text-sm" style={{ color: INK }}>
                <span className="text-xs" style={{ ...MONO, color: MUTED }}>{i + 1}</span>
                <span>When</span>
                <Select value={r.whenField} disabled={!canEdit} onChange={(v) => patch(i, { whenField: v as OpsModifier["whenField"] })}
                  options={["width", "height", "area", "qty"]} />
                <span>is</span>
                <Select value={r.whenOp} disabled={!canEdit} onChange={(v) => patch(i, { whenOp: v as OpsModifier["whenOp"] })}
                  options={[">", ">=", "<", "<=", "=="]} />
                <input value={String(r.whenValue)} disabled={!canEdit} inputMode="decimal"
                  onChange={(e) => patch(i, { whenValue: Number(e.target.value) || 0 })}
                  className="w-20 text-right border border-black/12 px-2 py-0.5 text-sm" style={MONO} />
                {/* The unit follows the field, so nobody has to remember that area
                    is m² while width is mm — the confusion that produces a rule
                    which never fires. */}
                <span className="text-xs" style={{ color: MUTED }}>{FIELD_UNIT[r.whenField]}</span>
                <span>→</span>
                <Select value={r.thenType} disabled={!canEdit} onChange={(v) => patch(i, { thenType: v as OpsModifier["thenType"] })}
                  options={["percent", "fixed"]} labels={{ percent: "add %", fixed: "add $" }} />
                <input value={String(r.thenValue)} disabled={!canEdit} inputMode="decimal"
                  onChange={(e) => patch(i, { thenValue: Number(e.target.value) || 0 })}
                  className="w-20 text-right border border-black/12 px-2 py-0.5 text-sm" style={MONO} />
                {canEdit && (
                  <button className="ml-auto" title="Remove this rule"
                    onClick={() => setRules(rules.filter((_, j) => j !== i))}>
                    <Trash2 className="w-3.5 h-3.5" style={{ color: MUTED }} />
                  </button>
                )}
              </div>
              <input value={r.label ?? ""} disabled={!canEdit} placeholder="What this rule is for"
                onChange={(e) => patch(i, { label: e.target.value || null })}
                className="mt-1.5 w-full text-xs border-0 border-b border-black/8 pb-1 focus:outline-none"
                style={{ color: MUTED }} />
              <p className="text-[11px] mt-1.5" style={{ color: MUTED }}>
                Fires for: {preview.map((p) => (
                  <span key={p.sample.key} className="mr-3">
                    {p.sample.key} {p.snapshot.appliedModifiers.includes(r.id) ? "✓" : "—"}
                  </span>
                ))}
                {r.id && fires.length === preview.length && preview.length > 0 && (
                  <span style={{ color: "#7a5410" }}>Fires at every size you sell — consider folding it into the base rate.</span>
                )}
                {r.id && fires.length === 0 && (
                  <span style={{ color: "#7a5410" }}>Never fires at any size you currently quote. Check the value and its units.</span>
                )}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-xs mt-2" style={{ color: MUTED }}>
        Rules apply top to bottom. A percentage applies to the running total, so two 10% rules make 21%, not 20%.
      </p>
    </div>
  );
}

function Select({ value, onChange, options, labels, disabled }: {
  value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string>; disabled?: boolean;
}) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
      className="border border-black/12 px-1.5 py-0.5 text-sm bg-white" style={{ color: INK }}>
      {options.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
    </select>
  );
}

// ── The confirm dialog ───────────────────────────────────────────────────────
// "Are you sure?" teaches nothing. A before/after on a real window teaches
// everything: if the operator sees $1,060 and thinks "that's about right", the
// guardrail worked. If they see $10,600, it worked harder.
function ConfirmDialog({ family, before, after, baseline, preview, exposure, onCancel, onSave }: {
  family: string;
  before: { perim: number; area: number; min: number };
  after: { perim: number; area: number; min: number };
  baseline: OpsPricedSample[]; preview: OpsPricedSample[];
  exposure: { lines: number; projects: number };
  onCancel: () => void; onSave: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [typed, setTyped] = useState("");

  const pct = (a: number, b: number) => (a === 0 ? (b === 0 ? 0 : 100) : ((b - a) / a) * 100);
  const biggest = Math.max(
    Math.abs(pct(before.perim, after.perim)),
    Math.abs(pct(before.area, after.area)),
    before.min || after.min ? Math.abs(pct(before.min, after.min)) : 0,
  );
  // One escalation only, and narrow: typed confirmation is expensive attention,
  // spent where a fat finger is plausible and the blast radius is a whole family.
  const tripwire = biggest > 20;
  const blocked = tripwire && (typed.trim() !== family || !note.trim());

  const rows = preview.map((p) => ({
    key: p.sample.key, sample: p.sample,
    now: baseline.find((b) => b.sample.key === p.sample.key)?.snapshot.total ?? null,
    next: p.snapshot.total,
  }));

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="card max-w-xl w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-base" style={{ ...HEAD, color: INK }}>Review pricing change — {family}</h3>
          <button onClick={onCancel}><X className="w-4 h-4" style={{ color: MUTED }} /></button>
        </div>

        <div className="text-sm mb-5">
          <Delta label="Perimeter rate" before={before.perim} after={after.perim} />
          <Delta label="Area rate" before={before.area} after={after.area} />
          <Delta label="Minimum charge" before={before.min} after={after.min} />
        </div>

        <p className="text-[11px] uppercase tracking-wide mb-2" style={{ color: MUTED }}>What this does to a real window</p>
        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="text-[11px]" style={{ color: MUTED }}>
              <th className="text-left font-normal" />
              <th className="text-right font-normal">now</th>
              <th className="text-right font-normal">after</th>
              <th className="text-right font-normal">change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-0.5" style={{ color: MUTED }}>
                  {r.key} <span style={{ ...MONO, fontSize: 11 }}>{r.sample.widthMm}×{r.sample.heightMm}</span>
                </td>
                <td className="text-right py-0.5" style={{ ...MONO, color: MUTED }}>{r.now == null ? "—" : money0(r.now)}</td>
                <td className="text-right py-0.5" style={{ ...MONO, color: INK }}>{money0(r.next)}</td>
                <td className="text-right py-0.5" style={{ ...MONO, color: INK }}>
                  {r.now == null ? "—" : `${r.next >= r.now ? "+" : ""}${money0(r.next - r.now)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* The most common fear about editing prices is "have I just changed
            something a customer already agreed to?" Answer it every time, in the
            same place, in plain words. */}
        <p className="text-xs leading-relaxed mb-4" style={{ color: MUTED }}>
          Takes effect immediately for every new quote line on {family}.<br />
          It does <strong>not</strong> change quotes already issued, or any order.
          {exposure.lines > 0 && (
            <> {exposure.lines} draft line{exposure.lines === 1 ? "" : "s"} across {exposure.projects} project{exposure.projects === 1 ? "" : "s"} still
              {exposure.lines === 1 ? " shows the old price; it reprices" : " show the old price; they reprice"} when next edited.</>
          )}
        </p>

        {tripwire && (
          <div className="text-xs px-3 py-2 mb-3 border" style={{ background: "rgba(180,120,40,0.09)", borderColor: "rgba(180,120,40,0.3)", color: "#7a5410" }}>
            <p className="mb-2">This is a {Math.round(biggest)}% change. Type the family slug to confirm.</p>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={family}
              className="w-full border border-black/12 px-2 py-1 bg-white" style={{ ...MONO, color: INK }} />
          </div>
        )}

        <input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={tripwire ? "Why (required)" : "Note (optional — shows in history)"}
          className="w-full border border-black/12 px-2 py-1.5 text-sm mb-4" style={{ color: INK }} />

        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="text-xs px-3 py-2" style={{ color: MUTED }}>Cancel</button>
          <button onClick={() => onSave(note)} disabled={blocked}
            className="text-xs text-white px-4 py-2 disabled:opacity-40" style={{ background: SAGE }}>
            Save new rates
          </button>
        </div>
      </div>
    </div>
  );
}

function Delta({ label, before, after }: { label: string; before: number; after: number }) {
  if (before === after) return null;
  const diff = after - before;
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span style={{ color: MUTED }}>{label}</span>
      <span style={MONO}>
        <span style={{ color: MUTED }}>{money(before)}</span>
        <span style={{ color: MUTED }}> → </span>
        <span style={{ color: INK }}>{money(after)}</span>
        <span className="ml-3" style={{ color: INK }}>{diff >= 0 ? "+" : ""}{money(diff)}</span>
      </span>
    </div>
  );
}

// ── History ──────────────────────────────────────────────────────────────────
// One-click revert is what makes it safe NOT to gate: cheap undo instead of
// expensive pre-approval. A revert is itself a new versioned change, never a
// rewind — the log only ever grows forward.
function History({ rows, canRevert, onRevert }: {
  rows: OpsPricingHistory[]; canRevert: boolean; onRevert: (toVersion: string) => void;
}) {
  if (!rows.length) return null;
  const summarise = (before: string | null, after: string | null) => {
    try {
      const b = JSON.parse(before || "{}"), a = JSON.parse(after || "{}");
      return (["perimRate", "areaRate", "minCharge"] as const)
        .filter((k) => b[k] !== a[k])
        .map((k) => `${k} ${money(b[k])} → ${money(a[k])}`).join(" · ") || "rules changed";
    } catch { return "changed"; }
  };
  return (
    <div className="mt-8">
      <h3 className="text-xs uppercase tracking-wide mb-2" style={{ color: MUTED }}>Change history</h3>
      <div className="card">
        {rows.map((h) => (
          <div key={h.id} className="px-4 py-2.5 border-b border-black/5 last:border-0">
            <div className="flex items-baseline justify-between">
              <span className="text-sm" style={{ color: INK }}>
                <span style={MONO}>{h.toVersion}</span> · {h.actor}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs" style={{ color: MUTED }}>{ago(h.createdAt)}</span>
                {canRevert && h.fromVersion && (
                  <button className="text-xs underline underline-offset-2" style={{ color: SAGE }}
                    onClick={() => onRevert(h.toVersion)}>Revert to {h.fromVersion}</button>
                )}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ ...MONO, color: MUTED }}>{summarise(h.before, h.after)}</p>
            {h.note && <p className="text-xs mt-0.5 italic" style={{ color: MUTED }}>“{h.note}”</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Options ──────────────────────────────────────────────────────────────────
function Options({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof opsPricingOptions>> | null>(null);
  const [q, setQ] = useState("");
  const [hideZero, setHideZero] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(() => { opsPricingOptions().then(setData).catch(() => setData(null)); }, []);
  useEffect(load, [load]);

  if (!data) return <p className="text-sm" style={{ color: MUTED }}>Loading options…</p>;

  const commit = async (slug: string, value: number, expectedVersion?: string) => {
    setSaving(slug);
    try {
      await opsSaveOption(slug, value, expectedVersion);
      setDraft((d) => { const { [slug]: _drop, ...rest } = d; return rest; });
      load(); onChanged();
    } finally { setSaving(null); }
  };

  const missing = data.reconcile?.missing ?? [];
  const shown = data.options
    .filter((o) => (!q || o.slug.includes(q.toLowerCase())) && (!hideZero || o.surcharge !== 0));

  return (
    <>
      {missing.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm mb-1" style={{ ...HEAD, color: INK }}>Needs a price ({missing.length})</h3>
          <p className="text-xs mb-2" style={{ color: MUTED }}>
            Offered to customers in Sanity, with no price in D1. Any quote line using one refuses to price rather
            than under-charge — which is correct, and fixable here in one number.
          </p>
          <div className="bg-white border" style={{ borderColor: "rgba(180,120,40,0.3)" }}>
            {missing.map((m) => (
              <div key={m.slug} className="px-4 py-3 border-b border-black/5 last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm" style={{ ...MONO, color: INK }}>{m.slug}</span>
                  <span className="flex items-center gap-2">
                    <span style={{ ...MONO, color: MUTED }}>$</span>
                    <input value={draft[m.slug] ?? ""} inputMode="decimal" disabled={!data.canEdit}
                      onChange={(e) => setDraft((d) => ({ ...d, [m.slug]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter" && draft[m.slug]) commit(m.slug, Number(draft[m.slug])); }}
                      className="w-24 text-right border border-black/12 px-2 py-1 text-sm" style={MONO} />
                    <button disabled={!data.canEdit || !draft[m.slug] || saving === m.slug}
                      onClick={() => commit(m.slug, Number(draft[m.slug]))}
                      className="text-xs text-white px-3 py-1.5 disabled:opacity-40" style={{ background: SAGE }}>Save</button>
                    {/* $0 must be an explicit decision AND a row: a missing row
                        means "unknown option", which is an error, not a free one.
                        Most of these are $0, and if clearing the banner required
                        typing 0 fifty times people would start typing anything. */}
                    <button disabled={!data.canEdit || saving === m.slug} onClick={() => commit(m.slug, 0)}
                      className="text-xs underline underline-offset-2" style={{ color: SAGE }}>Included — $0</button>
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: MUTED }}>
                  offered by {m.productSlugs.length} product{m.productSlugs.length === 1 ? "" : "s"} · {m.productSlugs.slice(0, 4).join(", ")}
                  {m.productSlugs.length > 4 ? "…" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm" style={{ ...HEAD, color: INK }}>Priced ({data.options.length})</h3>
        <span className="flex items-center gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search slug…"
            className="border border-black/12 px-2 py-1 text-xs w-48" style={MONO} />
          <label className="text-xs flex items-center gap-1.5" style={{ color: MUTED }}>
            <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
            hide $0
          </label>
        </span>
      </div>

      {/* Contained so it scrolls inside its own box rather than widening the
          document. Pricing is a desktop surface and is still slated for an
          explicit desktop-only notice on phones. */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide" style={{ color: MUTED }}>
              <th className="text-left font-medium px-4 py-2">Slug</th>
              <th className="text-right font-medium px-3 py-2">Surcharge</th>
              <th className="text-right font-medium px-3 py-2">Offered by</th>
              <th className="text-right font-medium px-4 py-2">Ver</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => {
              const value = draft[o.slug];
              const changed = value !== undefined && Number(value) !== o.surcharge;
              return (
                <tr key={o.slug} className="border-t border-black/5">
                  <td className="px-4 py-1.5" style={{ ...MONO, color: INK }}>
                    {o.slug}
                    {o.offeredBy === 0 && (
                      <span className="ml-2 text-[11px]" style={{ color: MUTED }}>◦ priced but no product offers it</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input value={value ?? (o.surcharge === 0 ? "0" : String(o.surcharge))} inputMode="decimal"
                      disabled={!data.canEdit}
                      onChange={(e) => setDraft((d) => ({ ...d, [o.slug]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && changed) commit(o.slug, Number(value), o.version);
                        if (e.key === "Escape") setDraft((d) => { const { [o.slug]: _drop, ...rest } = d; return rest; });
                      }}
                      className="w-24 text-right border px-2 py-0.5 text-sm disabled:bg-transparent disabled:border-transparent"
                      style={{ ...MONO, color: o.surcharge === 0 && !changed ? MUTED : INK, borderColor: changed ? SAGE : "rgba(0,0,0,0.12)" }} />
                  </td>
                  <td className="px-3 py-1.5 text-right" style={{ ...MONO, color: MUTED }}>{o.offeredBy}</td>
                  <td className="px-4 py-1.5 text-right" style={{ ...MONO, color: MUTED }}>{o.version}</td>
                  {changed && (
                    <td className="px-2">
                      <button onClick={() => commit(o.slug, Number(value), o.version)} disabled={saving === o.slug}
                        title="Save" className="p-1"><Check className="w-3.5 h-3.5" style={{ color: SAGE }} /></button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs mt-2" style={{ color: MUTED }}>
        {data.canEdit
          ? "Enter saves a row, Esc reverts it. A surcharge is added once per line that carries the option."
          : "Read-only — a manager or admin can change these."}
      </p>
    </>
  );
}

// ── Policy ───────────────────────────────────────────────────────────────────
function Policy() {
  const [data, setData] = useState<Awaited<ReturnType<typeof opsPricingPolicy>> | null>(null);
  const [deposit, setDeposit] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    opsPricingPolicy().then((d) => { setData(d); setDeposit(String(d.policy.depositPercent)); }).catch(() => setData(null));
  }, []);
  if (!data) return <p className="text-sm" style={{ color: MUTED }}>Loading policy…</p>;

  const save = async () => {
    setError(null);
    try {
      await opsSavePolicy(Number(deposit), data.policy.version);
      const next = await opsPricingPolicy();
      setData(next); setDeposit(String(next.policy.depositPercent));
    } catch { setError("That change could not be saved."); }
  };

  return (
    <div className="max-w-lg">
      <p className="text-xs mb-4" style={{ color: MUTED }}>Admin only. Applies to every quote and order, in every family.</p>
      {error && <Banner tone="warn"><span>{error}</span><span /></Banner>}

      <div className="flex items-center justify-between mb-1">
        <span className="text-sm" style={{ color: INK }}>Deposit</span>
        <span className="flex items-center gap-1">
          <input value={deposit} onChange={(e) => setDeposit(e.target.value)} disabled={!data.canEdit} inputMode="decimal"
            className="w-20 text-right border border-black/12 px-2 py-1 text-sm disabled:bg-black/[0.03]" style={MONO} />
          <span className="text-xs" style={{ color: MUTED }}>%</span>
        </span>
      </div>
      <p className="text-xs mb-6" style={{ color: MUTED }}>
        A {money0(10000)} order asks for {money0(10000 * (Number(deposit) || 0) / 100)} up front. Changing this does
        not alter deposits already requested on existing orders.
      </p>

      {/* Stated on the screen so the next person does not "fix" its absence:
          pricing_policy.gst_mode is loaded and never read — customer-facing GST
          comes from user.price_gst_mode via gstAdjust. A control bound to it would
          appear to work and do nothing, which is worse than not having one. */}
      <div className="mb-6">
        <span className="text-sm" style={{ color: INK }}>GST</span>
        <p className="text-xs mt-1" style={{ color: MUTED }}>
          Prices are stored GST-inclusive. Whether a customer sees “inc GST” or “ex GST” is their own account
          preference, not a setting here, and the rate itself is a code constant. — not editable —
        </p>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-black/8">
        <span className="text-xs" style={{ ...MONO, color: MUTED }}>{data.policy.version}</span>
        {data.canEdit && Number(deposit) !== data.policy.depositPercent && (
          <button onClick={save} className="text-xs text-white px-4 py-2" style={{ background: SAGE }}>Save deposit %</button>
        )}
      </div>
    </div>
  );
}

// ── Catalogue mirror ─────────────────────────────────────────────────────────
function CatalogueMirror() {
  const [d, setD] = useState<OpsCatalogueMirror | null>(null);
  useEffect(() => { opsCatalogueMirror().then(setD).catch(() => setD(null)); }, []);
  if (!d) return <p className="text-sm" style={{ color: MUTED }}>Loading catalogue…</p>;

  return (
    <>
      <div className="bg-sage-wash border border-[#5A7A6A]/25 text-[#355344] text-xs px-4 py-2.5 mb-5">
        <p>
          <strong>Names, descriptions, images, and which options each product offers are edited in Sanity Studio.
            What anything costs is edited here.</strong>
        </p>
        <p className="mt-1 flex items-center gap-2">
          {/* The old screen imported the build-time xlsx artefact while the engine
              hydrates from Sanity, so it could show something other than what
              production prices against. `source` makes that legible. */}
          Showing the catalogue as the pricing engine loaded it —{" "}
          <span style={MONO}>{d.source === "sanity" ? `Sanity, ${ago(d.loadedAt)}` : "built-in fallback (Sanity not loaded)"}</span> ·
          {" "}{d.productCount} products
          <a href="https://apertly-catalogue.sanity.studio" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-2">
            Open Studio <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      </div>

      {d.categories.map((cat) => (
        <div key={cat.slug} className="mb-6">
          <h3 className="text-sm font-semibold mb-2" style={{ ...HEAD, color: INK }}>{cat.name}</h3>
          <div className="card">
            {cat.families.map((fam) => (
              <div key={fam.slug} className="px-4 py-2.5 border-b border-black/5 last:border-0 flex items-center justify-between">
                <span className="text-sm" style={{ color: INK }}>
                  {fam.name} <span className="text-xs" style={{ ...MONO, color: MUTED }}>{fam.slug}</span>
                </span>
                <span className="flex items-center gap-4 text-xs" style={{ color: MUTED }}>
                  <span>{fam.productCount} product{fam.productCount === 1 ? "" : "s"}</span>
                  <span>{fam.optionCount} options</span>
                  {fam.hasRateCard
                    ? <span style={{ color: SAGE }}>✓ rate card</span>
                    // A missing rate card does not fail — it silently prices at
                    // 'default'. Quieter than a missing option price, and worth
                    // saying with its consequence attached.
                    : <span style={{ color: "#7a5410" }}>✗ no rate card — prices at ‘default’</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
