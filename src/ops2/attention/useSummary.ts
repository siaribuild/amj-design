import { useCallback, useEffect, useRef, useState } from "react";
import { useIonViewWillEnter } from "@ionic/react";
import { parseSummary, type SummaryCounts } from "./attention";

// Copy of src/ops2/projects/useProjectQueue.ts's mechanics (design §4 — copy,
// not extract; see that file for the full rationale on the live-guard and the
// ionViewWillEnter first-fire skip). The one divergence: a "degraded" parse
// (design.md §4, criteria 18–19) lands in the same error state as a non-2xx
// or network failure — the reader must not be able to tell them apart.
export type SummaryLoad =
  | { status: "loading" }
  | { status: "ready"; counts: SummaryCounts }
  | { status: "error"; headline: string; detail: string };

export function useSummary(): { load: SummaryLoad; reload: () => void } {
  const [load, setLoad] = useState<SummaryLoad>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setLoad({ status: "loading" });

    fetch("/api/ops/summary", { credentials: "same-origin" })
      .then(async (res) => {
        if (!live) return;
        if (res.status === 403 || res.status === 401) {
          setLoad({
            status: "error",
            headline: "This account cannot see what is waiting.",
            detail: "Projects are staff-only. Ask an administrator to add the role.",
          });
          return;
        }
        if (!res.ok) {
          setLoad({
            status: "error",
            headline: "Attention did not load.",
            detail: `The server answered ${res.status}. Try again in a moment.`,
          });
          return;
        }
        const counts = parseSummary(await res.json());
        if (!live) return;
        if (counts === "degraded") {
          setLoad({
            status: "error",
            headline: "Attention did not load.",
            detail: "The counts could not be trusted, so none are shown. Try again in a moment.",
          });
          return;
        }
        setLoad({ status: "ready", counts });
      })
      .catch(() => {
        if (!live) return;
        setLoad({
          status: "error",
          headline: "Attention did not load.",
          detail: "The console could not reach the server. Check the connection.",
        });
      });

    return () => { live = false; };
  }, [attempt]);

  const entered = useRef(false);
  useIonViewWillEnter(() => {
    if (!entered.current) { entered.current = true; return; }
    reload();
  });

  return { load, reload };
}
