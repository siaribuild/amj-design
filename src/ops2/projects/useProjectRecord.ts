import { useCallback, useEffect, useRef, useState } from "react";
import { useIonViewWillEnter } from "@ionic/react";
import { parseProjectRecord, type ProjectRecord } from "./record";
import { catalogueReady } from "../catalogue";

/**
 * The record's four states.
 *
 * FOUR, not three — the queue's three plus `missing`, which is a different
 * sentence and a different way out. A record reached from a stale tab, a
 * bookmark, or an email about a project that has since been merged is not a
 * failure of the console and must not read as one; "we could not load it, try
 * again" sends someone retrying a URL that will never resolve.
 */
export type RecordLoad =
  | { status: "loading" }
  | { status: "ready"; record: ProjectRecord }
  | { status: "missing" }
  | { status: "error"; headline: string; detail: string };

/**
 * `GET /api/ops/projects/:id`, and nothing else.
 *
 * ONE REQUEST. The endpoint already returns the project, its lines with their
 * segments nested, the delivery leg, the lifecycle, and — the part that matters
 * most here — the ACTIONS, derived server-side so "the Worker refuses what the
 * UI hides, and the UI cannot offer what the Worker would reject"
 * (`worker/lib/ops-actions.ts`). Nothing on this screen re-derives what can be
 * done to a job.
 *
 * RE-ENTERING THE RECORD IS THE REFRESH, for the reason `./useProjectQueue.ts`
 * sets out at length: `IonRouterOutlet` keeps a page MOUNTED in its view stack,
 * so a mount effect runs once per document and never again. Here it bites
 * harder than on the queue — a reviewer opens a record, prices a line in the
 * legacy console beside it, comes back, and would be reading the figures from
 * before their own edit.
 */
export function useProjectRecord(id: string): { load: RecordLoad; reload: () => void } {
  const [load, setLoad] = useState<RecordLoad>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setLoad({ status: "loading" });

    fetch(`/api/ops/projects/${encodeURIComponent(id)}`, { credentials: "same-origin" })
      .then(async (res) => {
        // CHECKED TWICE, and the second one is load-bearing. Between the headers
        // arriving and the body finishing, the reader can leave and come back —
        // which starts a NEWER request — and this continuation would commit its
        // older record over the fresh one. `res.json()` is the await that makes
        // the window real.
        if (!live) return;
        if (res.status === 404) { setLoad({ status: "missing" }); return; }
        if (res.status === 403 || res.status === 401) {
          // Behind Cloudflare Access the person IS signed in, so "please sign
          // in" would send them looking for a screen that does not exist. What
          // failed is the staff role, not the identity.
          setLoad({
            status: "error",
            headline: "This account cannot see this project.",
            detail: "Projects are staff-only. Ask an administrator to add the role.",
          });
          return;
        }
        if (!res.ok) {
          setLoad({
            status: "error",
            headline: "The project did not load.",
            detail: `The server answered ${res.status}. Try again in a moment.`,
          });
          return;
        }
        const body = await res.json();
        // THE CATALOGUE IS PART OF BEING READY. Every row draws its opening
        // through `getProductBySlug`, so a record rendered before the catalogue
        // lands shows the fallback frame on every line — eighteen identical
        // windows for a job that has none — and then flips them all after paint.
        // Waiting here rather than at boot is what lets the rest of the console
        // open at once; see `../catalogue.ts` for the measurement behind that.
        // It never rejects, so this is a delay and never a failure path.
        await catalogueReady;
        const record = parseProjectRecord(body);
        if (!live) return;
        // A 200 whose body has no project is not a project. Treated as missing
        // rather than as an error: the outcome for the reader is the same and
        // "try again" would be the wrong offer.
        setLoad(record ? { status: "ready", record } : { status: "missing" });
      })
      .catch(() => {
        if (!live) return;
        setLoad({
          status: "error",
          headline: "The project did not load.",
          detail: "The console could not reach the server. Check the connection.",
        });
      });

    return () => { live = false; };
  }, [id, attempt]);

  const entered = useRef(false);
  useIonViewWillEnter(() => {
    if (!entered.current) { entered.current = true; return; }
    reload();
  });

  return { load, reload };
}

/**
 * Running one of the server's actions.
 *
 * THE ID CARRIES ITS OWN ROUTE, because `worker/lib/ops-actions.ts` mints the
 * ids and the endpoints in the same vocabulary — `start-pricing`,
 * `issue-quote`, `status:<state>`. Mapping them here rather than asking the
 * server for URLs keeps one file to read when a new action appears; anything
 * this map does not know is refused locally rather than posted hopefully at a
 * route that does not exist.
 */
export type ActionRun =
  | { kind: "idle" }
  | { kind: "running"; id: string }
  | { kind: "failed"; id: string; message: string };

export function requestFor(projectId: string, actionId: string):
  { url: string; body?: unknown } | null {
  const base = `/api/ops/projects/${encodeURIComponent(projectId)}`;
  if (actionId === "start-pricing") return { url: `${base}/start-pricing` };
  if (actionId === "issue-quote") return { url: `${base}/issue-quote` };
  if (actionId.startsWith("status:")) {
    return { url: `${base}/status`, body: { statusInternal: actionId.slice("status:".length) } };
  }
  // `note`, `request-clarification`, `advance:*` and `pay:*` all need something
  // typed or confirmed that this build has no screen for. NOT rendered as
  // controls that do nothing — see `otherActions` in ProjectRecordPage.
  return null;
}
