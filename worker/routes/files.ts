// /api — file uploads/downloads backed by R2 (plans, schedules, drawings, QA
// photos). File bytes live in R2; a file_asset row in D1 points at them.
import { Hono } from "hono";
import type { Env } from "../types";
import { ownedProject, resolveOrCreateCurrentProject } from "../lib/access";
import { resolveUser } from "../lib/auth";
import { uuid } from "../lib/util";

export const files = new Hono<{ Bindings: Env }>();

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const KINDS = new Set(["upload", "plan", "schedule", "other"]);

// POST /api/files/upload — multipart (file, [kind]); attaches to the current
// project (created + claim-cookie minted if the anon user has none yet).
files.post("/files/upload", async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return c.json({ error: "no_file" }, 400);
  if (file.size > MAX_BYTES) return c.json({ error: "too_large" }, 413);
  const kindRaw = String(form?.get("kind") ?? "upload");
  const kind = KINDS.has(kindRaw) ? kindRaw : "upload";

  const { project, cookie } = await resolveOrCreateCurrentProject(c.env, c.req.raw);
  const user = await resolveUser(c.env, c.req.raw);

  const id = uuid();
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
  const r2Key = `project/${project.id}/${id}-${safeName}`;
  await c.env.FILES.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  await c.env.DB.prepare(
    "INSERT INTO file_asset (id, project_id, kind, source, r2_key, filename, size, virus_status, uploaded_by) VALUES (?, ?, ?, 'customer', ?, ?, ?, 'pending', ?)",
  ).bind(id, project.id, kind, r2Key, file.name, file.size, user?.id ?? null).run();

  if (cookie) c.header("Set-Cookie", cookie);
  return c.json({ file: { id, filename: file.name, kind, size: file.size, status: "pending" } });
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
    .first<{ project_id: string; r2_key: string; filename: string }>();
  if (!fa) return c.json({ error: "not_found" }, 404);
  if (!(await ownedProject(c.env, c.req.raw, fa.project_id))) return c.json({ error: "not_found" }, 404);
  const obj = await c.env.FILES.get(fa.r2_key);
  if (!obj) return c.json({ error: "gone" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fa.filename}"`,
    },
  });
});
