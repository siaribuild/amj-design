import { useEffect, useState } from "react";

// Shared across the desk bell (OpsPage.tsx) and the phone attention tab
// (Ops2App.tsx) so two badges never fire two requests: one module-level
// cache, one in-flight promise, ~60s TTL. Design: docs/runs/ai-parse-monitoring/02-design.md.
const TTL_MS = 60_000;
let cache: { value: number; fetchedAt: number } | null = null;
let inflight: Promise<number> | null = null;

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
    let cancelled = false;
    fetchNotificationCount().then((value) => {
      if (!cancelled) setCount(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}

// ponytail: exported only for the module-cache self-check in
// ops2-frame.test.mjs; not part of the public hook surface.
export const __testing = { fetchNotificationCount, resetCache: () => { cache = null; inflight = null; } };
