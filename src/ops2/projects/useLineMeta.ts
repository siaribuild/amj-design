import { useCallback, useEffect, useRef, useState } from "react";
import { useIonViewDidLeave, useIonViewWillEnter } from "@ionic/react";
import { useHistory } from "react-router-dom";
import type { LineMetaDto } from "../../data/lineMeta";

/**
 * `GET /api/ops/projects/:id/lines/:lineId/meta`, and nothing else.
 *
 * A structural copy of `useLineRationale.ts` — same four states, same
 * disabled-is-synchronous-missing rule (D2), same re-entry-re-reads guard.
 * See that file for the reasoning; it is not repeated here because the two
 * hooks would drift the moment a comment is edited in only one of them.
 */
export type MetaLoad =
  | { status: "loading" }
  | { status: "ready"; dto: LineMetaDto }
  | { status: "missing" }
  | { status: "error" };

/** The three state-transition rules, pulled out so they are checkable without
 *  a renderer — this hook has no test precedent in the repo (`useLineRationale`
 *  has none either), and node:test here never spins up jsdom. */
export const classifyMetaFetch = (status: number, ok: boolean): "missing" | "error" | "ready" => {
  if (status === 404) return "missing";
  if (!ok) return "error";
  return "ready";
};

/**
 * THE DECODING SEAM. It checks every field the tab dereferences without
 * guarding, not just one representative field.
 *
 * It used to test `hasCrop` alone, on the reasoning that a valid DTO always has
 * it. That holds right up until the DTO gains a field: `reasoningParts` was
 * added and `MetaTab` reads `.length` on it directly, so a 200 body missing it
 * passed this check, became `ready`, and threw at render. A validator that
 * accepts a shape the renderer cannot survive is worse than none, because it
 * converts a retryable error into a crash.
 *
 * Anything that fails here is NOT `missing` - see the caller: a malformed 200
 * is a fault, and faults keep the address and offer a retry rather than
 * claiming this line has no metadata.
 */
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** A fact is `{state, value}` - `factText` reads both without guarding. */
const isFact = (v: unknown): boolean => obj(v) && typeof v.state === "string";

/** What `ReadingSummary` and `MetaReadingDetail` walk: three facts, a flags
 *  array they map, a split whose `units` they map, and a source they read five
 *  fields off. `null` split is fine - the render guards that one. */
const isReading = (v: unknown): boolean =>
  obj(v) && isFact(v.heading) && isFact(v.elevation) && isFact(v.room)
  && Array.isArray(v.flags)
  && (v.split === null || (obj(v.split) && objArray((v.split as { units?: unknown }).units)))
  && obj(v.source);

/**
 * The step groups `MetaRunDetail` indexes into, each named because it walks two
 * levels: `steps.inventory.pages`, `steps.read.declined`, and so on. A bare
 * `obj(steps)` check admits `{}` and throws on the first of these - the same
 * mistake as accepting `reading: {}`, one level deeper.
 *
 * `selectPages.selected` and `elevationRegions` are mapped, so they must be
 * arrays, not merely present.
 */
const STEP_GROUPS = ["inventory", "read", "placements", "renderCrop", "text"] as const;

/** An array whose ELEMENTS are dereferenced. `[null]` passes Array.isArray and
 *  then throws on the first property read, so the elements are checked too -
 *  `selected.map((s) => s.pageNo)`, `elevationRegions.map((r) => r.labels)`,
 *  `units.map((u) => u.role)`. */
const objArray = (v: unknown): boolean => Array.isArray(v) && v.every(obj);

const isSteps = (v: unknown): boolean =>
  obj(v) && STEP_GROUPS.every((k) => obj(v[k]))
  && obj(v.selectPages) && objArray((v.selectPages as { selected?: unknown }).selected)
  && objArray(v.elevationRegions);

/** One row of the correction trail. `CorrectionTrail` maps the rows and then
 *  maps each row's `reasons`, so BOTH levels are checked - an array of objects
 *  whose `reasons` is itself an array. `stage` and `outcome` are read but only
 *  compared and rendered, never dereferenced, so their absence is survivable
 *  and their type is not checked here. */
const isCorrection = (v: unknown): boolean => obj(v) && Array.isArray(v.reasons);

/** What the Run panels walk. `document` may be null - that is a named state -
 *  but a document present must carry the `steps` tree the detail indexes into,
 *  the `telemetry` the Cost and health group reads four fields off, and - when
 *  a provider failure is recorded at all - the `warnings` it joins. */
const isDocument = (v: unknown): boolean =>
  obj(v) && isSteps(v.steps) && obj(v.telemetry)
  && (v.providerFailure == null
    || (obj(v.providerFailure) && Array.isArray((v.providerFailure as { warnings?: unknown }).warnings)));

const isRun = (v: unknown): boolean =>
  obj(v) && typeof v.startedAt === "string"
  && (v.document === null || isDocument(v.document));

/**
 * THE DECODING SEAM. It checks every shape the tab dereferences, to the depth
 * it dereferences them.
 *
 * It began as a `hasCrop` typeof check, on the reasoning that a valid DTO
 * always has that field. Two failures came out of that: the DTO gained
 * `reasoningParts`, which `MetaTab` reads `.length` on, so a body missing it
 * validated and threw at render; and a shallow `typeof reading === "object"`
 * still admits `{}`, which throws on `reading.flags.length` just as hard.
 *
 * A validator that accepts a shape the renderer cannot survive is worse than
 * none, because it converts a retryable fault into a crash. Depth here is not
 * belt-and-braces - it is the actual contract, and `MetaTab`'s dereferences
 * are its specification.
 *
 * Anything failing here is NOT `missing` - see the caller: a malformed 200 is
 * a fault, and faults keep the address and offer a retry rather than claiming
 * the line has no metadata.
 */
export const isLineMetaDto = (dto: unknown): dto is LineMetaDto => {
  if (!obj(dto)) return false;
  return typeof dto.hasCrop === "boolean"
    && (dto.gapCode === null || typeof dto.gapCode === "string")
    && Array.isArray(dto.reasoningParts)
    // Mapped by CorrectionTrail, so an array with dereferenceable elements -
    // never merely present. `attempts`/`acceptedTurn` are rendered but not
    // dereferenced, so null is survivable and no check earns its place.
    && Array.isArray(dto.corrections) && dto.corrections.every(isCorrection)
    && (dto.reading === null || isReading(dto.reading))
    && (dto.run === null || isRun(dto.run));
};

/** D2: a disabled read answers `missing`, synchronously — derived rather than
 *  stored, so `missing` is true the instant the read is off. */
export const effectiveMetaLoad = (enabled: boolean, load: MetaLoad): MetaLoad =>
  (enabled ? load : { status: "missing" });

export function useLineMeta(
  projectId: string, lineId: string, enabled: boolean,
): { load: MetaLoad; reload: () => void } {
  const history = useHistory();
  const [load, setLoad] = useState<MetaLoad>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setLoad({ status: "loading" });

    fetch(
      `/api/ops/projects/${encodeURIComponent(projectId)}/lines/${encodeURIComponent(lineId)}/meta`,
      { credentials: "same-origin" },
    )
      .then(async (res) => {
        if (!live) return;
        const outcome = classifyMetaFetch(res.status, res.ok);
        if (outcome === "missing") { setLoad({ status: "missing" }); return; }
        if (outcome === "error") { setLoad({ status: "error" }); return; }
        const dto = (await res.json()) as LineMetaDto;
        if (!live) return;
        setLoad(isLineMetaDto(dto) ? { status: "ready", dto } : { status: "missing" });
      })
      .catch(() => { if (live) setLoad({ status: "error" }); });

    return () => { live = false; };
  }, [projectId, lineId, enabled, attempt]);

  const effective: MetaLoad = effectiveMetaLoad(enabled, load);

  const departed = useRef(false);
  useIonViewDidLeave(() => {
    departed.current = !history.location.pathname.includes(`/line/${encodeURIComponent(lineId)}`);
  });
  useIonViewWillEnter(() => {
    if (!departed.current) return;
    departed.current = false;
    reload();
  });

  return { load: effective, reload };
}
