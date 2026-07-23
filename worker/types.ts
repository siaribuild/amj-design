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
  /** Comma-separated email domains allowed to sign in to the ops console. */
  STAFF_EMAIL_DOMAINS?: string;
  /** Cloudflare Access (prod staff auth) — team domain + application AUD. */
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Resend email — API key (secret) + verified From address (var). */
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** Contact form: where enquiries are emailed (falls back to EMAIL_FROM). */
  CONTACT_TO?: string;
  /** Enquiries: internal OpenFrame queue address (falls back to CONTACT_TO/EMAIL_FROM). */
  ENQUIRY_INTERNAL_TO?: string;
  /** Enquiries: single manufacturer handoff address for ALL locations (appointments). */
  MANUFACTURER_TO?: string;
  /** Cloudflare Turnstile secret (captcha) — set to enable server verification. */
  TURNSTILE_SECRET?: string;
  /** Sanity catalogue source (Worker-side). Client uses VITE_SANITY_* instead. */
  SANITY_PROJECT_ID?: string;
  SANITY_DATASET?: string;
  /** Workers AI (schedule extraction accuracy tier). Optional — deterministic
   *  on-stack extraction runs without it. Bound in wrangler.jsonc as "AI". */
  AI?: unknown;
  /** Extraction engine selector: 'deterministic' (default/on-stack), 'ai'
   *  (force Workers AI), or 'auto' (deterministic, escalate to AI when weak). */
  PARSE_ENGINE?: string;
  /** Secret for HMAC-deriving the quota subject from the anon claim token, so the
   *  bearer cookie is never stored. Optional — falls back to a salted SHA-256. */
  PARSE_SUBJECT_SECRET?: string;
}
