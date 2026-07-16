// Cloudflare bindings available to the Worker. Declared in wrangler.jsonc.
export interface Env {
  /** D1 — transactional domain model (see migrations/). */
  DB: D1Database;
  /** R2 — file bytes (plans, schedules, generated PDFs). */
  FILES: R2Bucket;
  /** KV — ephemeral auth state: OTP codes + session tokens (TTL-managed). */
  KV: KVNamespace;
  /** Static assets binding — serves the built Vite SPA (./dist). */
  ASSETS: Fetcher;
  /** 'development' | 'production' — from vars. */
  APP_ENV: string;
}
