// ═══════════════════════════════════════════════════════════════════════════════
// WHERE THE VIEW SCREEN'S PANELS LEAD
//
// "on mobile, information opens as a panel rather than expanding in place." So
// every summary on the view screen pushes one of these; none of them expands
// where it stood. See LineBody.tsx for the budgets that keep the summaries
// summaries.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import {
  IonPage, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle,
  IonContent, IonFooter, IonButton, IonNote, IonList, IonItem, IonLabel,
  IonInput, IonSegment, IonSegmentButton,
} from "@ionic/react";
import { useParams } from "react-router-dom";
import {
  CANDIDATES, CUSTOMER_NOTE, DEFAULT_SOURCE, LINES, MANUFACTURER, RECORD, SOURCES,
} from "../data";
import { Elevation } from "../elevation";
import { unitLabel, unitsOf } from "../LineBody";
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

/* ═══ SPECIFICATION ═══════════════════════════════════════════════════════════
   What the summary's four lines lead to: every option the product offers,
   chosen or standard-inherited (the customer's OptionLines does the same), the
   dimensions with their full provenance, and the customer's note in full.

   The provenance lives here rather than in a panel of its own because this is
   the panel about how the line is specified, and where a number came from is
   part of that. The summary carries the glanceable half — one word, "from the
   schedule" — beside the size it qualifies. */
export function SpecPage() {
  const { ref, lineId, line } = useLine();
  const src = SOURCES[lineId] ?? DEFAULT_SOURCE;
  const note = CUSTOMER_NOTE[lineId];
  const measured = {
    frame: "at the frame", opening: "at the opening",
    unsure: "the customer was not sure", "": "not recorded",
  }[src.measuredBy];

  return (
    <Frame title="Specification" back={`/projects/record/${ref}/line/${lineId}`}
      footer={
        <IonFooter className="ion-no-border">
          <div className="actions">
            <IonButton routerLink={`/projects/record/${ref}/line/${lineId}/edit`}>Edit {line.code}</IonButton>
          </div>
        </IonFooter>
      }>
      <div className="section">
        <h3 className="sub-h">Product</h3>
        <dl className="kv">
          <div><dt>Type</dt><dd>{line.product.replace(/^AMJ\S+\s+Series\s+/, "")}</dd></div>
          <div><dt>Product</dt><dd>{line.product}</dd></div>
          <div><dt>Frame system</dt><dd>{line.frame}</dd></div>
        </dl>

        <h3 className="sub-h">Size</h3>
        <div className="dimpair">
          <div><span className="dp-k">Height</span><span className="dp-v">{mm(line.heightMm)} mm</span></div>
          <div><span className="dp-k">Width</span><span className="dp-v">{mm(line.widthMm)} mm</span></div>
        </div>
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
            No page or sheet reference is recorded — the extractor does not emit them,
            so the quoted text is the whole of what can be shown.
          </IonNote>
        )}
        {src.measuredBy === "unsure" && (
          <div className="note-warning" role="note">
            The customer said they were not sure how they measured. Worth confirming
            before this goes to the manufacturer.
          </div>
        )}

        <h3 className="sub-h">Options</h3>
      </div>
      {/* Every option the product offers, chosen or standard-inherited — the
          customer's OptionLines shows the same, so a reviewer sees what was NOT
          taken as well as what was. */}
      <IonList lines="full">
        {[
          { k: "Glazing", v: line.glazing, chosen: true },
          { k: "Hardware", v: "Standard", chosen: false },
          { k: "Flyscreen", v: "None", chosen: false },
          { k: "Colour", v: "Monument (standard)", chosen: false },
        ].map((o) => (
          <IonItem key={o.k}>
            <IonLabel className="ion-text-wrap">
              <strong>{o.k}</strong>
              <p className={o.chosen ? undefined : "absent"}>
                {o.v}{o.chosen ? "" : " · not changed"}
              </p>
            </IonLabel>
          </IonItem>
        ))}
      </IonList>

      {note && (
        <div className="section">
          <h3 className="sub-h">The customer's note</h3>
          <p className="cust-note cust-note-full">{note}</p>
          <IonNote className="fact basis">
            Their words, as typed. Ops notes live on the project, not the line.
          </IonNote>
        </div>
      )}
    </Frame>
  );
}

/* ═══ A UNIT OF A SPLIT ═══════════════════════════════════════════════════════
   Reached only through its parent: units have no pencil of their own and no
   price, because the parent owns the total. Its own drawing and its own
   specification — but NO "why this product". A composite is one opening the
   customer submitted and ops divided, so a unit's product was an ops decision in
   the split planner, not an estimator recommendation. There is nothing to
   justify, and inventing a rationale would be worse than the absence. */
export function UnitPage() {
  const { ref, lineId, line } = useLine();
  const { idx } = useParams<{ idx: string }>();
  const i = Math.max(0, parseInt(idx, 10) || 0);
  const units = unitsOf(line);
  const u = units[i] ?? units[0];
  const code = unitLabel(line.code, i);

  return (
    <Frame title={code} back={`/projects/record/${ref}/line/${lineId}`}
      footer={
        <IonFooter className="ion-no-border">
          <div className="actions">
            <IonButton routerLink={`/projects/record/${ref}/line/${lineId}/edit`}>Edit {code}</IonButton>
          </div>
          <p className="reason">
            A unit is edited through {line.code}'s editor — it has no separate price.
          </p>
        </IonFooter>
      }>
      <figure className="plate" data-size="md">
        <div className="plate-face plate-face-static">
          <Elevation op={u.op} widthMm={Number(u.alongMm)} heightMm={line.heightMm}
            size="md" className="elev" />
        </div>
      </figure>
      <p className="sizeline">
        <span className="sl-v">{mm(line.heightMm)} × {mm(Number(u.alongMm))} mm</span>
        <span className="sl-src">unit {i + 1} of {units.length} in {line.code}</span>
      </p>
      <div className="section">
        <dl className="kv">
          <div><dt>Operation</dt><dd>{u.op}</dd></div>
          <div><dt>Frame system</dt><dd>{line.frame}</dd></div>
          <div><dt>Glazing</dt><dd>{line.glazing}</dd></div>
        </dl>
        <IonNote className="fact basis blocknote">
          Units share the opening's height; their widths are what the split
          decided, and the split is changed in the editor. There is no "why this
          product" for a unit — the split was ours, not the estimator's.
        </IonNote>
      </div>
    </Frame>
  );
}

/* ═══ WHY THIS PRODUCT ════════════════════════════════════════════════════════
   The summary's three lines lead here: what the estimator had to satisfy, and
   what else it looked at.

   Written against the owner's stated model — the cheapest product that matches
   the size and energy constraints. No weights, no ranking mechanics, no
   on-screen correction of the model; he is reconciling that separately. */
export function WhyPage() {
  const { ref, lineId, line } = useLine();
  const [priced, setPriced] = useState<Record<number, string>>({});
  const beaten = CANDIDATES.filter((c) => c.verdict !== "chosen");

  return (
    <Frame title="Why this product" back={`/projects/record/${ref}/line/${lineId}`}
      footer={
        <IonFooter className="ion-no-border">
          <div className="actions">
            <IonButton routerLink={`/projects/record/${ref}/line/${lineId}/edit`}>
              Change the product
            </IonButton>
          </div>
          <p className="reason">Nothing on this screen changes the quote.</p>
        </IonFooter>
      }>
      <div className="section">
        <h3 className="sub-h">What it had to satisfy</h3>
        <dl className="kv">
          <div><dt>Uw target</dt><dd>≤ 3.9<span className="kv-src">the plan's window schedule</span></dd></div>
          <div><dt>SHGC target</dt><dd>≤ 0.44<span className="kv-src">the plan's window schedule</span></dd></div>
          <div><dt>Opening</dt><dd>{mm(line.heightMm)} × {mm(line.widthMm)} mm<span className="kv-src">the schedule, edited by hand</span></dd></div>
          <div><dt>Note in the plan</dt><dd>obscure to ensuite<span className="kv-src">read from the schedule text</span></dd></div>
        </dl>
        {!line.requirementMet && (
          <div className="note-warning" role="note">
            Nothing in the catalogue met the Uw target at this size. The closest
            was taken and the miss is flagged on the line.
          </div>
        )}
      </div>

      <div className="section">
        <h3 className="sub-h">What else was considered</h3>
      </div>
      <IonList lines="full">
        {CANDIDATES.map((c) => {
          const chosen = c.verdict === "chosen";
          const fails = c.verdict.startsWith("fails");
          return (
            <IonItem key={c.rank} lines="full"
              className={"altrow" + (chosen ? " altrow-chosen" : "")}>
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
          No price is stored against an alternative — each is fetched on request
          and counts against the pricing meter.
        </IonNote>
      </div>
    </Frame>
  );
}

/* ═══ RE-PRICING ══════════════════════════════════════════════════════════════
   The price panel leads here, as he asked. Their figure, the uplift that
   defaults to 30 and is adjustable on the fly, the arithmetic shown, and a
   read-back of what the line and the quote become. */
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

  return (
    <Frame title="Re-price" back={`/projects/record/${ref}/line/${lineId}`}
      footer={
        <>
          <div className="readback" aria-live="polite">
            <div className="r">
              <span>{line.code} becomes</span>
              <span>
                {valid && line.priceCents !== null && (
                  <span className="was">${(line.priceCents / 100).toFixed(2)}</span>
                )}
                <Money cents={valid ? lineCents : line.priceCents} basis />
              </span>
            </div>
            <div className="r">
              <span>Quote total</span>
              <span><Money cents={RECORD.totalCents + delta} basis /></span>
            </div>
          </div>
          <div className="actions">
            <IonButton disabled={!valid}>Confirm this price</IonButton>
            <IonButton fill="outline" routerLink={`/projects/record/${ref}/line/${lineId}`}>Cancel</IonButton>
          </div>
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
            <div className="mw-total"><span>{line.code} price</span><span>${(lineCents / 100).toFixed(2)} ex GST</span></div>
          </div>
        )}

        <IonNote className="fact basis blocknote">
          Prices are held without GST, so an inc-GST figure is divided by 1.1 before
          the uplift. This does not change the project's "waiting on the
          manufacturer" state — that is set on Progress.
        </IonNote>
      </div>
    </Frame>
  );
}
