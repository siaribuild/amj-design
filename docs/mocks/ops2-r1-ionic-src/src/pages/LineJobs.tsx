// ═══════════════════════════════════════════════════════════════════════════════
// THE LINE'S THREE SECOND-STEP JOBS
//
// Each is a scenario the owner described, each has one obvious door on the line
// plane (the fact it interrogates), and each returns to that line. See
// LineBody.tsx for why the doors are the facts rather than a menu.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import {
  IonPage, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle,
  IonContent, IonFooter, IonButton, IonNote, IonList, IonItem, IonLabel,
  IonInput, IonSegment, IonSegmentButton,
} from "@ionic/react";
import { useHistory, useParams } from "react-router-dom";
import {
  CANDIDATES, DEFAULT_SOURCE, FILTER_STAGE, LINES, MANUFACTURER, MODEL_INPUTS,
  RANK_WEIGHTS, RECORD, SOURCES, familyMix,
} from "../data";
import { Money, mm } from "../ui";

function useLine() {
  const { ref, lineId } = useParams<{ ref: string; lineId: string }>();
  return { ref, lineId, line: LINES.find((l) => l.id === lineId) ?? LINES[3] };
}

function Frame({ title, back, children, footer }: {
  title: string; back: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={back} text="" aria-label="Back to the line" />
          </IonButtons>
          <IonTitle>{title}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>{children}</IonContent>
      {footer}
    </IonPage>
  );
}

/* ═══ SCENARIO 1 — validate the opening's dimensions against their source ═════
   "source is typically plan document (file attached) or manual user input (on
   call)."

   Everything here is a field that exists. `origin` (migration 0012) is the
   plan-vs-phone distinction itself; `measured_by` (0001) says how the customer
   measured, including `unsure`, which is the one that most warrants a second
   look; `edited_fields` (0019) says which field groups a human has changed
   since import.

   AND IT STATES WHAT IS MISSING. evidence_items has page_no, sheet_ref and
   region_json, and production has 0 of 1,000 rows populated on any of them —
   so this screen quotes the text the parser read and says plainly that it
   cannot say which page. An absent provenance stated is worth more than a blank
   space that reads as "no problem here" (D8). */
export function DimensionsPage() {
  const { ref, lineId, line } = useLine();
  const src = SOURCES[lineId] ?? DEFAULT_SOURCE;
  const measured = {
    frame: "at the frame", opening: "at the opening",
    unsure: "the customer was not sure", "": "not recorded",
  }[src.measuredBy];

  return (
    <Frame title="Dimensions" back={`/record/${ref}/line/${lineId}`}
      footer={
        <IonFooter className="ion-no-border">
          <div className="actions">
            <IonButton onClick={() => history.back()}>Back to {line.code}</IonButton>
            <IonButton fill="outline" routerLink={`/record/${ref}/line/${lineId}/edit`}>
              Change the size
            </IonButton>
          </div>
        </IonFooter>
      }>
      <div className="section">
        <div className="dimpair">
          <div><span className="dp-k">Height</span><span className="dp-v">{mm(line.heightMm)} mm</span></div>
          <div><span className="dp-k">Width</span><span className="dp-v">{mm(line.widthMm)} mm</span></div>
        </div>

        <h3 className="sub-h">Where the number came from</h3>
        <dl className="kv">
          <div><dt>Source</dt>
            <dd>{src.origin === "manual"
              ? "Entered by hand — not from a document"
              : `The schedule — ${src.file}`}</dd></div>
          {src.origin === "schedule" && (
            <div><dt>What was read</dt><dd className="mono readback-text">{src.read}</dd></div>
          )}
          <div><dt>Measured</dt><dd>{measured}</dd></div>
          <div><dt>Changed by hand</dt>
            <dd className={src.editedFields.length ? undefined : "absent"}>
              {src.editedFields.length
                ? src.editedFields.map((f) => f.replace("_json", "").replace("product_slug", "product")).join(", ")
                : "not since it was imported"}
            </dd></div>
        </dl>

        {src.origin === "schedule" && (
          <IonNote className="fact basis blocknote">
            No page or sheet reference is recorded. The extractor does not emit
            them yet, so the quoted text above is the whole of what can be shown —
            open the file itself to find it in context.
          </IonNote>
        )}
        {src.measuredBy === "unsure" && (
          <div className="note-warning" role="note">
            The customer said they were not sure how they measured. Worth
            confirming before this goes to the manufacturer.
          </div>
        )}
        {src.editedFields.length > 0 && (
          <IonNote className="fact basis blocknote">
            The system records which fields changed, not who changed them or when.
          </IonNote>
        )}
      </div>
    </Frame>
  );
}

/* ═══ SCENARIO 2 — validate the recommendation ════════════════════════════════
   "If in doubt on accuracy, ops need to be able to validate inputs into the
   model and the output it has produced."

   THIS SCREEN CORRECTS A WRONG MENTAL MODEL, ON PURPOSE. The owner believes the
   estimator picks "the cheapest product that matches size and energy
   constraints". The code does something materially different, and a derivation
   surface that let the wrong story stand would be worse than none:

     • three HARD FILTERS disqualify first — sellable, rules-passing, priceable
       (select.ts:90/138/168);
     • then a six-component weighted score (rank.ts:17) in which PRICE IS 15%;
     • and compliance is GRADED, not a veto — RANKER_VERSION "v3-graded-thermal"
       — so a thermal miss depresses rank rather than eliminating the candidate
       (thermal/compliance.ts:32).

   Every number here is already persisted per candidate in `candidate_result`:
   hard_rule_outcome_json, score, score_components_json, reason_codes, rank,
   selected. Nothing new has to be stored to build this. */
export function WhyPage() {
  const { ref, lineId, line } = useLine();
  const [priced, setPriced] = useState<Record<number, string>>({});
  const beaten = CANDIDATES.filter((c) => c.verdict !== "chosen");
  const removed = FILTER_STAGE.reduce((n, f) => n + f.n, 0);
  const families = familyMix();

  return (
    <Frame title="Why this product" back={`/record/${ref}/line/${lineId}`}
      footer={
        <IonFooter className="ion-no-border">
          <div className="actions">
            <IonButton fill="outline" onClick={() => history.back()}>Back to {line.code}</IonButton>
            <IonButton routerLink={`/record/${ref}/line/${lineId}/edit`}>Change the product</IonButton>
          </div>
          <p className="reason">
            Nothing on this screen changes the quote. Choosing another product is
            an edit.
          </p>
        </IonFooter>
      }>
      {/* ── the inputs, because he asked for them by name ── */}
      <div className="section">
        <h3 className="sub-h">What it was given</h3>
        <dl className="kv">
          {MODEL_INPUTS.map((i) => (
            <div key={i.k}><dt>{i.k}</dt>
              <dd>{i.v}<span className="kv-src">{i.src}</span></dd></div>
          ))}
        </dl>
      </div>

      {/* ── stage 1: the filter ── */}
      <div className="section">
        <h3 className="sub-h">First, {removed} products were ruled out</h3>
        <ul className="rows">
          {FILTER_STAGE.map((f) => (
            <li key={f.label}>
              <span className="r-name">{f.label}</span>
              <span className="r-when">{f.detail}</span>
              <span className="filter-n">{f.n}</span>
            </li>
          ))}
        </ul>
        <IonNote className="fact basis blocknote">
          These are disqualifications, not low scores — a product that is not
          sellable, breaks a hard rule or cannot be priced is never chosen,
          whatever else it has going for it.
        </IonNote>
      </div>

      {/* ── stage 2: the weighted score, and the correction ── */}
      <div className="section">
        <h3 className="sub-h">Then the remaining {beaten.length + 1} were scored</h3>
        <ul className="weights">
          {RANK_WEIGHTS.map((w) => (
            <li key={w.key}>
              <span className="w-label">{w.label}</span>
              <span className="w-bar" aria-hidden="true">
                <span style={{ width: `${w.pct * 2.4}%` }} />
              </span>
              <span className="w-pct">{w.pct}%</span>
            </li>
          ))}
        </ul>
        <div className="note-warning" role="note">
          <b className="lede">It is not "the cheapest that fits".</b>
          Price is one of six things and carries 15%. And a product that misses
          the thermal target is not removed — its score drops in proportion to
          how far it misses, which is why the chosen product below can still be
          ranked first while missing the cap.
        </div>
      </div>

      {/* ── the ranking itself ── */}
      <IonList lines="full">
        {CANDIDATES.map((c) => {
          const chosen = c.verdict === "chosen";
          const fails = c.verdict.startsWith("fails");
          return (
            <IonItem key={c.rank} lines="full"
              className={"altrow" + (chosen ? " altrow-chosen" : "")}>
              <span className="alt-rank" slot="start">{c.rank}</span>
              <IonLabel className="ion-text-wrap">
                <span className="alt-name">{c.name}{chosen && <em> · chosen</em>}</span>
                <p className={fails ? "alt-miss" : "alt-pass"}>
                  {fails ? c.verdict.replace("fails", "Misses") : "Meets the requirement"} · {c.reason}
                </p>
                {priced[c.rank] && <p className="alt-priced">{priced[c.rank]}</p>}
              </IonLabel>
              {!chosen && (
                <IonButton slot="end" size="small" fill="outline"
                  disabled={!!priced[c.rank]}
                  onClick={() => setPriced((v) => ({ ...v, [c.rank]: "Priced just now · $1,655.00 ex GST · $185 less" }))}>
                  {priced[c.rank] ? "Priced" : "Price it"}
                </IonButton>
              )}
            </IonItem>
          );
        })}
      </IonList>
      <div className="section">
        <IonNote className="fact basis">
          No price is stored against a candidate — the ranking is thermal and
          dimensional, so each price is fetched on request and counts against the
          pricing meter. The set is rebuilt whenever the schedule is re-parsed.
        </IonNote>
      </div>

      {/* ── scenario 3's cross-line concern, answered where the judgement is made ── */}
      <div className="section">
        <h3 className="sub-h">What the rest of the project uses</h3>
        <p className="famline">
          {families.map(([f, n]) => `${f} (${n})`).join(" · ")}
        </p>
        <IonNote className="fact basis">
          "Maybe we should go with the same family, no matter the price" is a
          judgement the estimator does not make. This is the only place the answer
          is on screen.
        </IonNote>
      </div>
    </Frame>
  );
}

/* ═══ SCENARIO 4 — the manufacturer's price, plus the uplift ══════════════════
   "Manufacturer will give us their price and no matter the current list price,
   we will be adjusting the quote as per fact: manufacturer's price, plus
   standard uplift (30%, adjustable on the fly). Plus GST, if prices are stored
   in the system with GST."

   VERIFIED NEW: there is no uplift, markup or margin field anywhere in worker/,
   src/ or migrations/. This is a new capability, not a surfacing of one — see
   the spec's "needs new criteria" list.

   The GST clause is a real ambiguity on a call, so the basis of THEIR figure is
   an explicit two-option control rather than a guess. Same shape as the delivery
   confirm already approved on the record surface: a figure, an input that
   changes it, and a read-back of what the quote becomes. */
export function ManufacturerPricePage() {
  const { ref, lineId, line } = useLine();
  const [quoted, setQuoted] = useState("");
  const [uplift, setUplift] = useState(String(MANUFACTURER.upliftPct));
  const [basis, setBasis] = useState<"ex" | "inc">(MANUFACTURER.basis);

  const raw = parseFloat(quoted) || 0;
  const exGst = basis === "inc" ? raw / 1.1 : raw;
  const pct = parseFloat(uplift);
  const upliftPct = Number.isFinite(pct) ? pct : 0;
  const lineCents = Math.round(exGst * (1 + upliftPct / 100) * 100);
  const valid = quoted !== "" && raw > 0 && Number.isFinite(pct);
  const delta = valid ? lineCents - (line.priceCents ?? 0) : 0;
  const quoteTotal = RECORD.totalCents + delta;

  return (
    <Frame title="Manufacturer's price" back={`/record/${ref}/line/${lineId}`}
      footer={
        <>
          <div className="readback" aria-live="polite">
            <div className="r">
              <span>This line becomes</span>
              <span>
                {valid && line.priceCents !== null && (
                  <span className="was">${((line.priceCents) / 100).toFixed(2)}</span>
                )}
                <Money cents={valid ? lineCents : line.priceCents} basis />
              </span>
            </div>
            <div className="r">
              <span>Quote total</span>
              <span><Money cents={valid ? quoteTotal : RECORD.totalCents} basis /></span>
            </div>
          </div>
          <div className="actions">
            <IonButton disabled={!valid} onClick={() => history.back()}>
              Confirm this price
            </IonButton>
            <IonButton fill="outline" onClick={() => history.back()}>Cancel</IonButton>
          </div>
          <p className="reason">
            This replaces the list price on {line.code}. It changes nothing on any
            other line.
          </p>
        </>
      }>
      <div className="section">
        <p className="mfr-lede">
          List price is <Money cents={line.priceCents} absent="not set" basis />.
          What the manufacturer quotes replaces it.
        </p>

        <h3 className="sub-h">Their figure includes</h3>
        <IonSegment value={basis} scrollable={false}
          onIonChange={(e) => setBasis((e.detail.value as "ex" | "inc") ?? "ex")}>
          <IonSegmentButton value="ex"><IonLabel>ex GST</IonLabel></IonSegmentButton>
          <IonSegmentButton value="inc"><IonLabel>inc GST</IonLabel></IonSegmentButton>
        </IonSegment>

        <div className="mfr-fields">
          <IonInput label="Manufacturer's price" labelPlacement="stacked" type="number"
            inputMode="decimal" placeholder="0.00" value={quoted}
            helperText="What they quoted on the call."
            onIonInput={(e) => setQuoted(String(e.detail.value ?? ""))} />
          <IonInput label="Uplift %" labelPlacement="stacked" type="number"
            inputMode="decimal" value={uplift}
            helperText="Standard is 30%. Change it here for this line."
            onIonInput={(e) => setUplift(String(e.detail.value ?? ""))} />
        </div>

        {valid && (
          <div className="mfr-work" aria-live="polite">
            <div><span>Their price</span><span>${exGst.toFixed(2)} ex GST</span></div>
            <div><span>+ {upliftPct}% uplift</span><span>${(exGst * upliftPct / 100).toFixed(2)}</span></div>
            <div className="mw-total"><span>Line price</span><span>${(lineCents / 100).toFixed(2)} ex GST</span></div>
          </div>
        )}

        <IonNote className="fact basis blocknote">
          Prices are held without GST, so an inc-GST figure is divided by 1.1
          before the uplift. Confirming here does not change the project's
          "waiting on the manufacturer" state — that is set on Progress.
        </IonNote>
      </div>
    </Frame>
  );
}
