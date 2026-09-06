import { useEffect, useState } from "react";

// Shared across the desk bell (OpsPage.tsx) and the phone attention tab
// (Ops2App.tsx) so two badges never fire two requests: one module-level
// cache, one in-flight promise, ~60s TTL. Design: docs/runs/ai-parse-monitoring/02-design.md.
const TTL_MS = 60_000;
let cache: { value: number; fetchedAt: number } | null = null;
let inflight: Promise<number> | null = null;

// Every mounted badge, so a refresh reaches all of them. Without this the
// answer landed in whichever component happened to ask for it and the other
// badge kept showing its own first reading.
const subscribers = new Set<(value: number) => void>();

async function fetchNotificationCount(): Promise<number> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.value;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("/api/ops/monitoring", { credentials: "same-origin" });
      if (!res.ok) return cache?.value ?? 0;
      const body = (await res.json()) as { notificationCount?: unknown };
      const value = typeof body?.notificationCount === "number" ? body.notificationCount : 0;
      cache = { value, fetchedAt: Date.now() };
      for (const notify of subscribers) notify(value);
      return value;
    } catch {
      return cache?.value ?? 0;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// ONE loop for the whole console, owned by the module and reference-counted by
// its subscribers. Each hook used to start its own interval, and Ionic keeps
// routed pages mounted — so timers accumulated page by page for as long as the
// console stayed open, all asking the same question.
let poll: ReturnType<typeof setInterval> | null = null;

function refreshIfVisible() {
  // A backgrounded tab polling all night is a request a minute nobody reads.
  if (document.visibilityState === "visible") fetchNotificationCount();
}

function startPolling() {
  if (poll) return;
  poll = setInterval(refreshIfVisible, TTL_MS);
  // Coming back to the tab is the moment the number is most likely stale and
  // most likely to be looked at.
  document.addEventListener("visibilitychange", refreshIfVisible);
}

function stopPollingIfIdle() {
  if (subscribers.size > 0 || !poll) return;
  clearInterval(poll);
  poll = null;
  document.removeEventListener("visibilitychange", refreshIfVisible);
}

export function useNotificationCount(): number {
  const [count, setCount] = useState(cache?.value ?? 0);

  useEffect(() => {
    subscribers.add(setCount);
    startPolling();
    fetchNotificationCount();
    return () => {
      subscribers.delete(setCount);
      stopPollingIfIdle();
    };
  }, []);

  return count;
}

// ponytail: exported only for the module-cache self-check in
// ops2-frame.test.mjs; not part of the public hook surface.
export const __testing = {
  fetchNotificationCount,
  resetCache: () => {
    cache = null;
    inflight = null;
    subscribers.clear();
    stopPollingIfIdle();
  },
  subscribers,
  isPolling: () => poll !== null,
};
