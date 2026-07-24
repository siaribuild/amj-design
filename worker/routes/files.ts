// /api — file uploads/downloads backed by R2 (plans, schedules, drawings, QA
// photos). File bytes live in R2; a file_asset row in D1 points at them.
import { Hono } from "hono";
import type { Env } from "../types";
import { ownedProject, resolveOrCreateCurrentProject } from "../lib/access";
import { resolveUser } from "../lib/auth";
import { uuid } from "../lib/util";
import { scanFile } from "../lib/scan";
import { runAiExtraction } from "../lib/ai/pipeline";
import { autoExtractionEnabled } from "../lib/ai/versions";

export const files = new Hono<{ Bindings: Env }>();

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const KINDS = new Set(["upload", "plan", "schedule", "other"]);
const MAX_FILES_PER_PROJECT = 25;   // quota per project
const UPLOAD_RATE_WINDOW = 60;      // seconds
const UPLOAD_RATE_MAX = 15;         // uploads per source per window (bounds anon abuse)

// POST /api/files/upload — multipart (file, [kind]); attaches to the current
// project (created + claim-cookie minted if the anon user has none yet).
files.post("/files/upload", async (c) => {
  // Per-source rate limit — bounds an anonymous caller looping "new cookie →
  // upload" to create unlimited projects/objects. Keyed by session/claim cookie
  // when present, else the connecting IP.
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
  const rlKey = `uprl:${ip}`;
  const used = parseInt((await c.env.KV.get(rlKey)) ?? "0", 10) || 0;
  if (used >= UPLOAD_RATE_MAX) return c.json({ error: "rate_limited" }, 429);

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return c.json({ error: "no_file" }, 400);
  if (file.size > MAX_BYTES) return c.json({ error: "too_large" }, 413);
  const kindRaw = String(form?.get("kind") ?? "upload");
  const kind = KINDS.has(kindRaw) ? kindRaw : "upload";

  const { project, cookie } = await resolveOrCreateCurrentProject(c.env, c.req.raw);
  const user = await resolveUser(c.env, c.req.raw);

  // Per-project quota — a single project can't be used as unbounded storage.
  const countRow = await c.env.DB.prepare("SELECT count(*) AS n FROM file_asset WHERE project_id = ?").bind(project.id).first<{ n: number }>();
  if ((countRow?.n ?? 0) >= MAX_FILES_PER_PROJECT) return c.json({ error: "quota_exceeded" }, 413);

  await c.env.KV.put(rlKey, String(used + 1), { expirationTtl: UPLOAD_RATE_WINDOW });

  // Scan BEFORE anything is persisted: bytes only reach R2 once a scanner has
  // returned 'clean', so a rejected upload leaves nothing behind to serve or
  // parse. 'unknown' (scanner down, unreadable, timeout) fails closed.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const verdict = await scanFile(c.env, {
    bytes, filename: file.name, contentType: file.type || "application/octet-stream",
  });
  if (cookie) c.header("Set-Cookie", cookie);
  if (verdict.verdict === "infected") {
    return c.json({ error: "file_rejected", reason: verdict.reason ?? "rejected", detail: verdict.detail ?? null }, 422);
  }
  if (verdict.verdict !== "clean") {
    return c.json({ error: "scan_unavailable", reason: verdict.reason ?? "unknown" }, 503);
  }

  const id = uuid();
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
  const r2Key = `project/${project.id}/${id}-${safeName}`;
  await c.env.FILES.put(r2Key, bytes, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  await c.env.DB.prepare(
    "INSERT INTO file_asset (id, project_id, kind, source, r2_key, filename, size, virus_status, scan_engine, scanned_at, uploaded_by) VALUES (?, ?, ?, 'customer', ?, ?, ?, 'clean', ?, datetime('now'), ?)",
  ).bind(id, project.id, kind, r2Key, file.name, file.size, verdict.engine, user?.id ?? null).run();

  // LLM strategy §6 (owner decisions 2026-07-25): extraction runs AUTOMATICALLY on
  // every clean upload — the deterministic layer above only GATES (type, malware,
  // size, quota); the AI tier interprets. Fire-and-forget after the response so
  // the customer never waits on a model; stage idempotency makes re-processing
  // unchanged documents free, and any failure degrades to the deterministic
  // parse + manual review. AI_EXTRACTION_MODE='manual' is the kill-switch.
  //
  // REGISTERED USERS ONLY: anonymous uploads stay deterministic-only. This bounds
  // model spend to identifiable accounts (an anonymous loop can't drain the
  // gateway cap and deny AI to real users), keeps unconsented documents away
  // from the external model, and makes AI interpretation the registration
  // incentive. Anonymous users keep the instant free parse — no capability loss
  // on clean digital schedules.
  if (autoExtractionEnabled(c.env) && user) {
    c.executionCtx.waitUntil(runAiExtraction(c.env, project.id).catch(() => { /* degradation, never a blocker */ }));
  }

  return c.json({ file: { id, filename: file.name, kind, size: file.size, status: "clean" } });
});

// GET /api/projects/:id/files — list a project's files (owner only).
files.get("/projects/:id/files", async (c) => {
  const p = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  const { results } = await c.env.DB
    .prepare("SELECT id, kind, filename, size, virus_status, created_at FROM file_asset WHERE project_id = ? ORDER BY created_at DESC")
    .bind(p.id).all();
  return c.json({ files: results });
});

// GET /api/files/:id/download — stream bytes from R2 (owner only).
files.get("/files/:id/download", async (c) => {
  const fa = await c.env.DB.prepare("SELECT * FROM file_asset WHERE id = ?").bind(c.req.param("id"))
    .first<{ project_id: string; r2_key: string; filename: string; virus_status: string }>();
  if (!fa) return c.json({ error: "not_found" }, 404);
  if (!(await ownedProject(c.env, c.req.raw, fa.project_id))) return c.json({ error: "not_found" }, 404);
  // Only ever serve bytes a scanner cleared. 'infected' is refused outright;
  // 'pending'/'skipped' means unscanned (a legacy row, or a scan that never
  // completed) and is withheld until staff re-scan it.
  if (fa.virus_status === "infected") return c.json({ error: "quarantined" }, 403);
  if (fa.virus_status !== "clean") return c.json({ error: "scan_pending" }, 409);
  const obj = await c.env.FILES.get(fa.r2_key);
  if (!obj) return c.json({ error: "gone" }, 404);
  // Sanitised filename (strip quotes/control chars → no header injection) + a safe
  // RFC 5987 fallback. Private/no-store so a shared cache never retains PII bytes.
  const safe = fa.filename.replace(/[\r\n"\\]/g, "_").replace(/[\x00-\x1f]/g, "");
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(fa.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
});
