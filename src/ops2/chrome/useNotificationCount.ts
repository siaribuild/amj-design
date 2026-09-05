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
      const body = await res.json();
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

export function useNotificationCount(): number {
  const [count, setCount] = useState(cache?.value ?? 0);

  useEffect(() => {
    subscribers.add(setCount);
    fetchNotificationCount();
    // The console is a long-lived SPA: an ops2 tab can sit open all day. Asking
    // once on mount meant the TTL was never consulted again, so a budget that
    // went red — or recovered — at 10am was still showing its 9am state at
    // 5pm. Only while the tab is actually being looked at: a backgrounded tab
    // polling all night is a request per minute nobody reads.
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") fetchNotificationCount();
    }, TTL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchNotificationCount();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      subscribers.delete(setCount);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return count;
}

// ponytail: exported only for the module-cache self-check in
// ops2-frame.test.mjs; not part of the public hook surface.
export const __testing = {
  fetchNotificationCount,
  resetCache: () => { cache = null; inflight = null; subscribers.clear(); },
  subscribers,
};
