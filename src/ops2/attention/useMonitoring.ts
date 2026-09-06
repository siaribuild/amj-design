import { useCallback, useEffect, useRef, useState } from "react";
import { useIonViewWillEnter } from "@ionic/react";
import { parseMonitoringSnapshot, type MoneySnapshot, type StoredSnapshot } from "../../data/monitoring";

export type { MoneySnapshot };

/** What the ROUTE returns: the stored snapshot plus the server's own red
 *  evaluation and the thresholds it used. Built on the core's StoredSnapshot
 *  rather than restating its five fields, which is how the two copies of this
 *  shape would otherwise drift apart. */
export type MonitoringSnapshot = StoredSnapshot & {
  redBalance: boolean;
  redCap: boolean;
  floorUsd: number;
};

export type MonitoringLoad =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; snapshot: MonitoringSnapshot }
  | { status: "error"; headline: string; detail: string }
  | { status: "unauthorised"; headline: string; detail: string };

export function useMonitoring(): { load: MonitoringLoad; reload: () => void } {
  const [load, setLoad] = useState<MonitoringLoad>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setLoad({ status: "loading" });

    fetch("/api/ops/monitoring", { credentials: "same-origin" })
      .then(async (res) => {
        if (!live) return;
        if (res.status === 403 || res.status === 401) {
          setLoad({
            status: "unauthorised",
            headline: "Staff sign-in required.",
            detail: "This section is only available to signed-in staff.",
          });
          return;
        }
        if (!res.ok) {
          setLoad({
            status: "error",
            headline: "Couldn't load the monitoring figures",
            detail: "The console reached the server but it did not answer. Nothing is wrong with parsing itself.",
          });
          return;
        }
        const body = await res.json();
        if (!live) return;
        if (typeof body !== "object" || body === null) {
          setLoad({ status: "error", headline: "Couldn't load the monitoring figures", detail: "The console reached the server but the answer could not be read. Nothing is wrong with parsing itself." });
          return;
        }
        const record = body as Record<string, unknown>;
        if (record.snapshot === null) {
          setLoad({ status: "empty" });
          return;
        }
        const parsed = parseMonitoringSnapshot(record.snapshot);
        const enriched = record.snapshot as Record<string, unknown>;
        if (
          parsed === null ||
          typeof enriched.redBalance !== "boolean" ||
          typeof enriched.redCap !== "boolean" ||
          typeof enriched.floorUsd !== "number"
        ) {
          setLoad({ status: "error", headline: "Couldn't load the monitoring figures", detail: "The snapshot could not be trusted, so none is shown. Nothing is wrong with parsing itself." });
          return;
        }
        setLoad({
          status: "ready",
          snapshot: {
            ...parsed,
            redBalance: enriched.redBalance,
            redCap: enriched.redCap,
            floorUsd: enriched.floorUsd,
          },
        });
      })
      .catch(() => {
        if (!live) return;
        setLoad({ status: "error", headline: "Couldn't load the monitoring figures", detail: "The console could not reach the server. Nothing is wrong with parsing itself." });
      });

    return () => {
      live = false;
    };
  }, [attempt]);

  const entered = useRef(false);
  useIonViewWillEnter(() => {
    if (!entered.current) {
      entered.current = true;
      return;
    }
    reload();
  });

  return { load, reload };
}

const MELBOURNE_TIME = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Melbourne",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatAsAt(takenAt: string): string {
  return MELBOURNE_TIME.format(new Date(takenAt));
}

/**
 * How old the snapshot is, in the mock's own words (UX §6.1).
 *
 * Stale is >30 minutes — one missed tick of the ten-minute cron plus slack. The
 * figures are still shown when stale; an old number LABELLED old beats an
 * empty page, which is why this returns a sentence rather than a flag that
 * hides anything.
 */
export function snapshotAge(takenAt: string, now: Date = new Date()): { stale: boolean; ago: string } {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(takenAt).getTime()) / 60000));
  const ago =
    minutes < 90 ? `${minutes}m ago`
    : minutes < 1440 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`
    : `${Math.floor(minutes / 1440)}d ago`;
  return { stale: minutes > 30, ago };
}

const MELBOURNE_WEEKDAY = new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", weekday: "short" });

/**
 * "2026-09-05" → { weekday: "Thu", date: "5" }. The key is already a Melbourne
 * calendar day (the snapshot bucketed it), so it is read as a plain date at
 * UTC midnight — the page does no timezone maths of its own (UX §5).
 */
export function formatDayLabel(dayKey: string): { weekday: string; date: string } {
  // An ISO date-only string parses as UTC midnight by spec, which is exactly
  // what the hand-rolled split/Date.UTC pair was reconstructing.
  const at = new Date(dayKey);
  return { weekday: MELBOURNE_WEEKDAY.format(at), date: String(at.getUTCDate()) };
}
