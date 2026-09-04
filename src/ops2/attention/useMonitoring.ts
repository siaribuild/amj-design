import { useCallback, useEffect, useRef, useState } from "react";
import { useIonViewWillEnter } from "@ionic/react";
import { parseMonitoringSnapshot } from "../../data/monitoring";

export type MoneySnapshot =
  | { available: true; creditBalanceUsd: number; billedSpendUsd: number; capUsd: number; capSource: "gateway" | "account" }
  | { available: false; reason: string };

export type MonitoringSnapshot = {
  takenAt: string;
  money: MoneySnapshot;
  success7d: number;
  error7d: number;
  days: { day: string; success: number; error: number }[];
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
            headline: "Monitoring did not load.",
            detail: `The server answered ${res.status}. Try again in a moment.`,
          });
          return;
        }
        const body = await res.json();
        if (!live) return;
        if (typeof body !== "object" || body === null) {
          setLoad({ status: "error", headline: "Monitoring did not load.", detail: "The response could not be read. Try again in a moment." });
          return;
        }
        const record = body as Record<string, unknown>;
        if (record.snapshot === null) {
          setLoad({ status: "empty" });
          return;
        }
        const parsed = parseMonitoringSnapshot(record.snapshot);
        if (parsed === null || typeof (parsed as Record<string, unknown>).takenAt !== "string") {
          setLoad({ status: "error", headline: "Monitoring did not load.", detail: "The snapshot could not be trusted, so none is shown. Try again in a moment." });
          return;
        }
        setLoad({ status: "ready", snapshot: parsed as MonitoringSnapshot });
      })
      .catch(() => {
        if (!live) return;
        setLoad({ status: "error", headline: "Monitoring did not load.", detail: "The console could not reach the server. Check the connection." });
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
