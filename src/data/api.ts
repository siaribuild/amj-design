// Typed client for the AMJ backend Worker (/api/*). Same-origin: in prod the
// Worker serves both the SPA and the API; in dev Vite proxies /api to :8787.
import type { QItem } from "./configurator";

export interface ApiProject {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

// One saved quote line as the server returns it (QItem minus its local id,
// plus the server-computed line total).
export interface ApiItem {
  code: string;
  productSlug: string;
  location: string;
  measuredBy: QItem["measuredBy"];
  width: string;
  height: string;
  options: Record<string, string>;
  qty: number;
  status: QItem["status"];
  lineTotal: number | null;
}

export interface CurrentProject {
  project: ApiProject | null;
  items: ApiItem[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

/** The anonymous claim-cookie project + its draft lines (no side effects). */
export const getCurrentProject = () => req<CurrentProject>("/api/projects/current");

/** Snapshot-save the whole draft line set. Creates the project on first call. */
export const saveLines = (items: QItem[]) =>
  req<CurrentProject>("/api/projects/current/lines", {
    method: "PUT",
    body: JSON.stringify({ items }),
  });
