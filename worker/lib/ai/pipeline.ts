// Phase 1 pipeline (LLM strategy §23 Phase 1): ingest → Gemini schedule
// extraction (per document, idempotent stage) → merged evidence-linked
// BuildingModelV1 → opening_requirements → deterministic selection for draft
// lines. Modes B/C (plan geometry, energy-report precedence) are later phases;
// this run handles Mode A honestly: schedule text/photos, Melbourne default
// context recorded as an ASSUMPTION (§3.1), never as an observed fact.
//
// Persistence: writes the CANONICAL 0016 records (building_models,
// evidence_items, opening_requirements). Draft-line selection still routes
// through the delivered deterministic engine over opening_instance — that
// remains the selection substrate until a later phase cuts it over, so the
// existing review UI keeps working while the new model accrues.
import type { Env } from "../../types";
import { uuid } from "../util";
import { createAiRun, completeAiRun } from "./runs";
import { runStage } from "./stage";
import { ingestProjectFiles, type IngestedDoc } from "./ingest";
import { scheduleExtractor, type ScheduleLineV1 } from "../estimator/skills/schedule";
import { BUILDING_MODEL_SCHEMA_VERSION } from "./versions";
import type { BuildingModelV1, OpeningV1 } from "./schema";
import { runProjectEstimate } from "../estimator/estimate";

// ── Pure: §9.3 parent/child tag decomposition ────────────────────────────────
// W04A/W04B are thermal children of architectural parent W04; a bare W04 or W12
// has no parent. Conservative: only a single trailing letter after digits.
export function parentTagOf(tag: string): string | null {
  const m = /^([A-Za-z]{1,3}\d{1,4})[A-Za-z]$/.exec(tag.trim());
  return m ? m[1] : null;
}

// ── Pure: merge per-document extractions; represent conflicts, never resolve
//    silently (§9.2). Same tag + same dims across docs dedupes; same tag with
//    materially different dims becomes a review-required conflict. ─────────────
export interface MergedLine extends ScheduleLineV1 { sourceFileIds: string[] }
export interface MergeResult {
  lines: MergedLine[];
  conflicts: BuildingModelV1["conflicts"];
}
export function mergeScheduleLines(perDoc: { fileId: string; lines: ScheduleLineV1[] }[]): MergeResult {
  const byTag = new Map<string, MergedLine>();
  const untagged: MergedLine[] = [];
  const conflicts: BuildingModelV1["conflicts"] = [];
  for (const doc of perDoc) {
    for (const line of doc.lines) {
      if (!line.tag) { untagged.push({ ...line, sourceFileIds: [doc.fileId] }); continue; }
      const existing = byTag.get(line.tag);
      if (!existing) { byTag.set(line.tag, { ...line, sourceFileIds: [doc.fileId] }); continue; }
      existing.sourceFileIds.push(doc.fileId);
      const dimsDiffer =
        (line.widthMm != null && existing.widthMm != null && line.widthMm !== existing.widthMm) ||
        (line.heightMm != null && existing.heightMm != null && line.heightMm !== existing.heightMm);
      if (dimsDiffer) {
        conflicts.push({
          conflictId: `conf_${conflicts.length + 1}`,
          entity: line.tag,
          field: "dimensions",
          values: [
            { value: { widthMm: existing.widthMm, heightMm: existing.heightMm }, source: existing.sourceFileIds[0], precedence: 50 },
            { value: { widthMm: line.widthMm, heightMm: line.heightMm }, source: doc.fileId, precedence: 50 },
          ],
          resolution: "keep_first_and_flag",
          selectedValue: { widthMm: existing.widthMm, heightMm: existing.heightMm },
          reviewRequired: true,
        });
      } else {
        // Same tag, compatible dims: fill gaps from the later source.
        existing.widthMm ??= line.widthMm; existing.heightMm ??= line.heightMm;
        existing.qty ??= line.qty; existing.typeText ??= line.typeText;
        existing.elementType ??= line.elementType; existing.colour ??= line.colour;
      }
    }
  }
  return { lines: [...byTag.values(), ...untagged], conflicts };
}

// ── Pure: merged lines → BuildingModelV1 (Mode A) ────────────────────────────
export function linesToBuildingModel(projectId: string, merged: MergeResult, docs: IngestedDoc[]): BuildingModelV1 {
  const openings: OpeningV1[] = merged.lines.map((l, i): OpeningV1 => ({
    openingId: `op_${l.tag || `untagged_${i + 1}`}`,
    externalRef: l.tag || `UNTAGGED-${i + 1}`,
    parentRef: l.tag ? parentTagOf(l.tag) : null,
    level: null, roomId: null, wallOrientation: null,
    elementType: l.elementType ?? (l.tag.toUpperCase().startsWith("D") ? "door" : "window"),
    widthMm: l.widthMm, heightMm: l.heightMm,
    areaM2: l.widthMm != null && l.heightMm != null ? Math.round((l.widthMm * l.heightMm) / 1e4) / 100 : null,
    configuration: {
      familyRequested: l.typeText, panelCount: null, operablePanelCount: null,
      layoutCode: l.layoutCode, viewBasis: null,
    },
    scheduleRequirements: {
      doubleGlazed: l.doubleGlazed, glassDescription: l.glassNote, colour: l.colour, flyscreen: l.flyscreen,
    },
    shading: null,
    thermalRequirement: null, // Mode A: no observed thermal target; Phase 4 adds envelope bands
    evidence: l.sourceFileIds.map((fid) => ({
      entityPath: `/openings/${l.tag || `untagged_${i + 1}`}`,
      fileId: fid, pageNo: null, sheetRef: null, region: null,
      extractedText: [l.tag, l.typeText, l.widthMm && l.heightMm ? `${l.widthMm}x${l.heightMm}` : null].filter(Boolean).join(" "),
      origin: "explicit", confidence: l.confidence.tag,
    })),
    confidence: {
      tag: l.confidence.tag ?? 0,
      dimensions: l.confidence.dimensions ?? 0,
      configuration: l.confidence.configuration ?? 0,
    },
  }));

  return {
    schemaVersion: BUILDING_MODEL_SCHEMA_VERSION,
    projectId,
    inputMode: "schedule_only",
    jurisdiction: {
      // §3.1 minimum context — a DEFAULT, recorded as such below, never observed.
      country: "AU", state: "VIC", postcode: null, nccProfile: null,
      nathersClimateZone: null, buildingClass: "1a", confidence: null,
    },
    building: { storeys: null, conditionedFloorAreaM2: null, totalFloorAreaM2: null, exposure: null, northRotationDeg: null, balRating: null },
    envelope: { walls: [], floors: [], ceilings: [], roofs: [], airTightness: null, defaultArchetypeId: null },
    rooms: [],
    openings,
    energyAssessment: null,
    assumptions: [
      { fact: "location=Melbourne,VIC", origin: "regulatory_default", note: "Mode A minimum context (§3.1) — confirm with the customer" },
      { fact: "new_build_current_energy_requirements", origin: "regulatory_default", note: "Mode A default assumption" },
      ...docs.filter((d) => d.qualityIssues.length).map((d) => ({
        fact: `document_quality:${d.filename}`, origin: "unknown" as const, note: d.qualityIssues.join(","),
      })),
    ],
    conflicts: merged.conflicts,
  };
}

// ── Orchestration ────────────────────────────────────────────────────────────
export interface AiExtractionSummary {
  runId: string;
  status: "completed" | "partial" | "failed";
  documents: number;
  extractedLines: number;
  conflicts: number;
  buildingModelId: string | null;
  estimate: { openings: number; selected: number } | null;
  stageWarnings: string[];
}

export async function runAiExtraction(env: Env, projectId: string): Promise<AiExtractionSummary> {
  const run = await createAiRun(env, { projectId, inputMode: "schedule_only" });
  const warnings: string[] = [];

  const docs = await ingestProjectFiles(env, projectId);
  const usable = docs.filter((d) => !d.rejected && (d.markdown || d.imageDataUrl));
  if (!usable.length) {
    await completeAiRun(env, run.id, { status: "failed", errorCode: docs.length ? "IMAGE_UNREADABLE" : "FILE_UNSUPPORTED" });
    return { runId: run.id, status: "failed", documents: docs.length, extractedLines: 0, conflicts: 0, buildingModelId: null, estimate: null, stageWarnings: docs.flatMap((d) => d.qualityIssues) };
  }

  // Extraction stage per usable document (idempotent per content+prompt+model).
  const perDoc: { fileId: string; lines: ScheduleLineV1[] }[] = [];
  let anyFailed = false;
  for (const doc of usable) {
    const res = await runStage(env, {
      aiRunId: run.id, projectId, skill: scheduleExtractor,
      input: { text: doc.markdown, imageDataUrl: doc.imageDataUrl, docName: doc.filename, checksum: doc.checksum },
      signals: (data) => ({
        criticalConfidence: data
          ? Object.fromEntries(data.lines.slice(0, 50).map((l, i) => [`line_${i}_dims`, l.confidence.dimensions ?? 0]))
          : undefined,
      }),
    });
    warnings.push(...res.warnings);
    if (res.ok && res.data) perDoc.push({ fileId: doc.fileId, lines: res.data.lines });
    else anyFailed = true;
  }

  if (!perDoc.length) {
    await completeAiRun(env, run.id, { status: "failed", errorCode: "SCHEMA_VALIDATION_FAILED" });
    return { runId: run.id, status: "failed", documents: docs.length, extractedLines: 0, conflicts: 0, buildingModelId: null, estimate: null, stageWarnings: warnings };
  }

  // Merge, model, persist the canonical records.
  const merged = mergeScheduleLines(perDoc);
  const model = linesToBuildingModel(projectId, merged, docs);
  const buildingModelId = uuid();
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO building_models (id, project_id, ai_run_id, schema_version, status, model_json, confidence_json)
       VALUES (?,?,?,?, 'draft', ?, ?)`,
    ).bind(buildingModelId, projectId, run.id, model.schemaVersion, JSON.stringify(model),
      JSON.stringify({ schedule_extraction_confidence: avgConfidence(model.openings) })),
  ];
  for (const o of model.openings) {
    for (const ev of o.evidence) {
      stmts.push(env.DB.prepare(
        `INSERT INTO evidence_items (id, project_id, ai_run_id, entity_path, file_id, page_no, sheet_ref, region_json, extracted_text, origin, confidence)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(uuid(), projectId, run.id, ev.entityPath, ev.fileId, ev.pageNo, ev.sheetRef,
        ev.region ? JSON.stringify(ev.region) : null, ev.extractedText, ev.origin, ev.confidence));
    }
    stmts.push(env.DB.prepare(
      `INSERT INTO opening_requirements (id, project_id, building_model_id, external_ref, parent_opening_id, requirement_basis,
         max_u_value, shgc_target, shgc_min, shgc_max, confidence_json, requirement_json, review_state)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'unreviewed')`,
    ).bind(uuid(), projectId, buildingModelId, o.externalRef, null, "default_envelope",
      null, null, null, null, JSON.stringify(o.confidence), JSON.stringify({ opening: o.externalRef, thermal: null })),
    );
  }
  await env.DB.batch(stmts);

  // Bridge into the deterministic selection substrate (only when the project has
  // no openings yet — same idempotence convention as the parse-line bridge).
  const existing = await env.DB.prepare("SELECT count(*) AS n FROM opening_instance WHERE project_id = ?").bind(projectId).first<{ n: number }>();
  if ((existing?.n ?? 0) === 0) {
    const bridge = model.openings.filter((o) => !o.externalRef.startsWith("UNTAGGED")).map((o) =>
      env.DB.prepare(
        `INSERT INTO opening_instance (id, project_id, external_ref, group_code, family, operation_type, width_mm, height_mm, status)
         VALUES (?,?,?,?,?,?,?,?, 'extracted')`,
      ).bind(uuid(), projectId, o.externalRef, o.parentRef, o.elementType === "door" ? "doors" : "windows",
        operationFrom(o.configuration.familyRequested), o.widthMm, o.heightMm),
    );
    if (bridge.length) await env.DB.batch(bridge);
  }
  const estimate = await runProjectEstimate(env, projectId).catch(() => null);

  const status = anyFailed ? "partial" : "completed";
  await completeAiRun(env, run.id, { status });
  return {
    runId: run.id, status, documents: docs.length,
    extractedLines: merged.lines.length, conflicts: merged.conflicts.length,
    buildingModelId, estimate: estimate ? { openings: estimate.openings, selected: estimate.selected } : null,
    stageWarnings: warnings,
  };
}

function avgConfidence(openings: OpeningV1[]): number | null {
  const vals = openings.map((o) => o.confidence.dimensions).filter((v) => typeof v === "number");
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
}

// Raw schedule type text → the catalogue operation vocabulary (same mapping the
// parse-line bridge uses).
function operationFrom(typeText: string | null): string | null {
  const t = (typeText || "").toUpperCase();
  if (!t) return null;
  if (t.includes("AWNING")) return "awning";
  if (t.includes("STACKER") || t.includes("SLIDING") || t.includes("SLIDER")) return "sliding";
  if (t.includes("FIXED")) return "fixed";
  if (t.includes("CASEMENT")) return "casement";
  if (t.includes("LOUVRE") || t.includes("LOUVER")) return "louvre";
  if (t.includes("BIFOLD") || t.includes("BI-FOLD") || t.includes("BI FOLD")) return "bi-fold";
  if (t.includes("HUNG")) return "double-hung";
  if (t.includes("HINGED") || t.includes("ENTRY")) return "hinged";
  return null;
}
