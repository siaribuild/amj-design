import { useCallback, useEffect, useRef, useState } from "react";
import { useIonViewDidLeave, useIonViewWillEnter } from "@ionic/react";
import { useHistory } from "react-router-dom";
import type { LineRationaleDto } from "../../data/rationale";

/**
 * `GET /api/ops/projects/:id/lines/:lineId/rationale`, and nothing else.
 *
 * ── ITS OWN REQUEST, NOT THE RECORD'S ───────────────────────────────────────
 * The record read is asserted key-for-key by `scripts/tests/api.test.mjs` and is
 * fetched once for a whole project; per-line candidate queries have no business
 * in it and the queue would pay for them on every row. So the panel fetches for
 * the one line the reader opened, and the record's blast radius stays zero.
 *
 * ── FOUR STATES, AND `error` IS NOT `missing` ───────────────────────────────
 * A rationale that cannot be READ and one that does not EXIST are different
 * things, and only one of them is worth retrying. Falling back to "not
 * recorded" on an unreachable server would state a fact about the row that
 * nobody established — the same dishonesty the capture rules exist to prevent,
 * one layer up.
 */
export type RationaleLoad =
  | { status: "loading" }
  | { status: "ready"; dto: LineRationaleDto }
  | { status: "missing" }
  | { status: "error" };

/** `enabled` false is D2: on an order record the panel is not rendered and its
 *  endpoint is never called. Passed rather than derived here, because whether
 *  this line belongs to an issued quote is the record's fact. */
export function useLineRationale(
  projectId: string, lineId: string, enabled: boolean,
): { load: RationaleLoad; reload: () => void } {
  const history = useHistory();
  const [load, setLoad] = useState<RationaleLoad>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setLoad({ status: "loading" });

    fetch(
      `/api/ops/projects/${encodeURIComponent(projectId)}/lines/${encodeURIComponent(lineId)}/rationale`,
      { credentials: "same-origin" },
    )
      .then(async (res) => {
        // Checked before the body and again after it, for the reason
        // `useProjectRecord` gives at length: `res.json()` is an await, and a
        // reader who leaves and returns starts a newer request this older
        // continuation would commit over.
        if (!live) return;
        // 404 covers both refusals by construction — this line is not a parent
        // line of this project, whether because it belongs to another one or
        // because it does not exist. The panel is simply absent; the line page
        // already owns that sentence and duplicating it would say it twice.
        if (res.status === 404) { setLoad({ status: "missing" }); return; }
        if (!res.ok) { setLoad({ status: "error" }); return; }
        const dto = (await res.json()) as LineRationaleDto;
        if (!live) return;
        setLoad(dto && typeof dto.kind === "string" ? { status: "ready", dto } : { status: "missing" });
      })
      .catch(() => { if (live) setLoad({ status: "error" }); });

    return () => { live = false; };
  }, [projectId, lineId, enabled, attempt]);

  /**
   * RE-ENTERING THE LINE RE-READS THE REASONING — held here rather than assumed.
   *
   * TODAY IT WOULD HOLD ANYWAY, and that is the problem. Ionic re-uses the page
   * you RETURN to, not the one you go to, so a record → line → record → line
   * trip builds a fresh line page and this effect runs on its mount. That is an
   * upstream policy, not a promise this seam makes: if the outlet ever kept the
   * line view the way it keeps the record's, the panel would go stale in
   * silence — refreshed record data beside stale reasoning, on a surface whose
   * whole claim is "this is what was recorded". Two panels disagreeing about one
   * line is what D16's condition exists to prevent, arriving from the client.
   *
   * `useProjectRecord` needs the same refresh for the opposite reason, and its
   * guard is the model: arm on an actual DEPARTURE, and going to a CHILD is not
   * leaving. `…/why` and `…/drawing` are this page's own addresses, so an
   * enlargement or a rationale must not re-read anything.
   */
  /**
   * A DISABLED READ ANSWERS `missing`, and it answers SYNCHRONOUSLY.
   *
   * The effect used to just return, leaving the hook at `loading` forever — so
   * every consumer had to know that, and D2's one rule was enforced in three
   * places. Setting `missing` from inside the effect fixes the count and breaks
   * a cold `/why`: `enabled` flips true the moment the record resolves, and for
   * one render the state still says `missing`, so the address normalises away
   * before the read it was waiting for has even started.
   *
   * Derived instead of stored. `load` stays `loading` until a real answer
   * arrives, which is what the readiness gate needs, and `missing` is true the
   * instant the read is off, which is what D2 needs.
   */
  const effective: RationaleLoad = enabled ? load : { status: "missing" };

  const departed = useRef(false);
  useIonViewDidLeave(() => {
    // STILL UNDER THIS LINE'S PATH IS NOT LEAVING — `…/why` and `…/drawing`
    // are children of this page, and Ionic fires the lifecycle on a same-page
    // URL change regardless.
    departed.current = !history.location.pathname.includes(`/line/${encodeURIComponent(lineId)}`);
  });
  useIonViewWillEnter(() => {
    if (!departed.current) return;
    departed.current = false;
    reload();
  });

  return { load: effective, reload };
}
