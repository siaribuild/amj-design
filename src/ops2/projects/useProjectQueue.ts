import { useCallback, useEffect, useRef, useState } from "react";
import { useIonViewWillEnter } from "@ionic/react";
import { parseProjectQueue, type ProjectQueueRow } from "./queue";

/**
 * The queue's three states, and they are three rather than two on purpose.
 *
 * An empty list and a failed request look identical once the spinner stops, and
 * they mean opposite things: one says the day is clear, the other says the work
 * exists and you cannot see it. The screen that cannot tell them apart is the
 * screen that lets a project sit for a day — which is the cost this whole
 * console is being rebuilt to avoid.
 */
export type QueueLoad =
  | { status: "loading" }
  | { status: "ready"; rows: ProjectQueueRow[] }
  | { status: "error"; headline: string; detail: string };

/**
 * `GET /api/ops/projects`, and nothing else.
 *
 * ONE REQUEST, NO PARAMETERS. The endpoint already returns every field this
 * surface needs — `waitingOn`, `daysInStage`, `stateLabel`, `phase`,
 * `lineCount`, `unresolved`, `value`/`valueBasis`, all derived server-side by
 * `worker/lib/lifecycle.ts` — so filtering and counting happen over the rows in
 * hand rather than as a second query. That is not laziness: the counts on the
 * chips and in the attention strip have to be the length of the list they
 * predict, and a count computed by a different path (a SQL COUNT while the list
 * is a filtered array) is the exact defect `9e5f11b6` had to fix in the mock.
 *
 * NO POLLING. The console is opened between other tasks and read; a list that
 * moves under a finger mid-scroll is worse than one that is a minute stale.
 * RE-ENTERING THE DESTINATION IS THE REFRESH — and that sentence used to be a
 * comment rather than a behaviour.
 *
 * `IonRouterOutlet` keeps a page MOUNTED in its view stack, so a `useEffect`
 * with an empty dependency list runs once per document and never again: open a
 * record, come back, and the queue is as old as the last full page load. On the
 * one surface whose entire purpose is saying what changed while you were not
 * looking, on a console whose governing constraint is that a delayed glance
 * costs a working day. So the refresh hangs off Ionic's own view lifecycle.
 *
 * The first `ionViewWillEnter` is SKIPPED, because the mount effect has already
 * asked. Belt and braces in that order rather than the other way round: if the
 * lifecycle event never fires — a page rendered outside a router outlet, say —
 * the queue still loads once instead of sitting on a skeleton for ever.
 */
export function useProjectQueue(): { load: QueueLoad; reload: () => void } {
  const [load, setLoad] = useState<QueueLoad>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setLoad({ status: "loading" });

    fetch("/api/ops/projects", { credentials: "same-origin" })
      .then(async (res) => {
        if (!live) return;
        if (res.status === 403 || res.status === 401) {
          // SAID PLAINLY, because behind Cloudflare Access the person IS signed
          // in and a "please sign in" would send them looking for a screen that
          // does not exist. What has failed is the staff role, not the identity.
          setLoad({
            status: "error",
            headline: "This account cannot see the queue.",
            detail: "Projects are staff-only. Ask an administrator to add the role.",
          });
          return;
        }
        if (!res.ok) {
          setLoad({
            status: "error",
            headline: "The queue did not load.",
            detail: `The server answered ${res.status}. Try again in a moment.`,
          });
          return;
        }
        setLoad({ status: "ready", rows: parseProjectQueue(await res.json()) });
      })
      .catch(() => {
        if (!live) return;
        setLoad({
          status: "error",
          headline: "The queue did not load.",
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
