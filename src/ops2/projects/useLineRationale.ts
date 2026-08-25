import { useCallback, useEffect, useState } from "react";
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

  return { load, reload };
}
