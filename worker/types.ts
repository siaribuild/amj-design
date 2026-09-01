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
  /** The plan-parse container, reachable ONLY through this Durable Object —
   *  there is deliberately no route or service binding for it. It renders a plan
   *  page and cuts one rectangle per opening, and holds no credentials of its
   *  own. See worker/lib/drawing/containerClient.ts for the construction rule
   *  that governs every call. */
  PLAN_PARSE: DurableObjectNamespace;
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
  /** Comma-separated domains whose users are manufacturer partners (Enquiries only). */
  MANUFACTURER_EMAIL_DOMAINS?: string;
  /** Cloudflare Turnstile secret (captcha) — set to enable server verification. */
  TURNSTILE_SECRET?: string;
  /** Sanity catalogue source (Worker-side). Client uses VITE_SANITY_* instead. */
  SANITY_PROJECT_ID?: string;
  SANITY_DATASET?: string;
  /** Workers AI (schedule extraction accuracy tier). Optional — deterministic
   *  on-stack extraction runs without it. Bound in wrangler.jsonc as "AI". */
  AI?: unknown;
  /** Durable registered-user AI extraction jobs. Anonymous requests never write
   * to this queue. Optional only for local tests/development. */
  AI_JOBS?: Queue<{ projectId: string; generation: number; debounceToken: string }>;
  /** Extraction engine selector: 'deterministic' (default/on-stack), 'ai'
   *  (force Workers AI), or 'auto' (deterministic, escalate to AI when weak). */
  PARSE_ENGINE?: string;
  /** Secret for HMAC-deriving the quota subject from the anon claim token, so the
   *  bearer cookie is never stored. Optional — falls back to a salted SHA-256. */
  PARSE_SUBJECT_SECRET?: string;
  /** AI Gateway slug. When set, Workers AI calls are routed through it for
   *  caching, rate limiting and spend visibility. Optional. */
  AI_GATEWAY_ID?: string;
  /** Primary multimodal model for the LLM building-modelling tier (LLM strategy
   *  §13.1). Defaults in code to google/gemini-3.6-flash; override without a code
   *  change once the model is enabled in the gateway. */
  AI_PRIMARY_MODEL?: string;
  /** Thinking level for extraction skills ('minimal' | 'low' | 'medium' | 'high').
   *  Defaults in code to 'low'; raise for accuracy, lower for speed. See the
   *  runner's googleBody note for the latency evidence behind the default. */
  AI_THINKING_LEVEL?: string;
  /** Escalation model (LLM strategy §13.2). Currently SHADOW-ONLY: escalation
   *  triggers are logged for frequency analysis but Pro is NOT called until this
   *  is explicitly turned on. Defaults in code to google/gemini-3.1-pro. */
  AI_ESCALATION_MODEL?: string;
  /** When 'on', the shadow escalation actually calls the escalation model.
   *  Anything else (default) keeps escalation shadow-only (log, don't spend). */
  AI_ESCALATION_MODE?: string;
  /** 'auto' (default): AI extraction fires automatically on every clean upload
   *  (owner decision 2026-07-25 — no ops button-clicking; deterministic checks
   *  only GATE, the AI tier interprets); no drawing enrichment.
   *  'auto_drawings': 'auto' plus the plan-parse enrichment stage
   *  (02-design-v2.md §4).
   *  'agentic_full': 'auto' plus the parallel full-document drawing agent;
   *  it starts from the free deterministic PDF harvest and reasons across the
   *  opening set in bounded turns. 'manual': ops-triggered only (tests, or an
   *  emergency spend kill-switch), unchanged. */
  AI_EXTRACTION_MODE?: string;
  /** 'on' restores the stage replay archive. Anything else (the default) forces
   *  every stage to call the model, so a re-parse tests extraction rather than
   *  returning the previous run's answer. */
  AI_STAGE_CACHE?: string;
  /** Shared secret for the admin/debug thermal-log endpoint (/api/debug/thermal).
   *  Unset ⇒ the endpoint is disabled (404). Set via `wrangler secret put`. */
  THERMAL_DEBUG_KEY?: string;
  /** Upload scanning engine: 'structural' (default, on-stack type + PDF
   *  active-content checks), 'remote' (external AV), or 'both'. */
  SCAN_ENGINE?: string;
  /** External AV endpoint (multipart POST) — required when SCAN_ENGINE uses it. */
  SCAN_ENDPOINT?: string;
  /** Bearer token for SCAN_ENDPOINT (secret). */
  SCAN_AUTH?: string;
  /** Sanity publish-webhook signing secret (secret). Verifies §11.3 callbacks. */
  SANITY_WEBHOOK_SECRET?: string;
  /** ABN Lookup (ABR) web-services credential — a SECRET
   *  (`wrangler secret put ABR_GUID`), never a VITE_* var, so the client bundle
   *  cannot contain it. Unset ⇒ every trade application queues for manual
   *  review rather than auto-passing (design §4, E-P2-18). */
  ABR_GUID?: string;
  /** Test seam for the ABR client: overrides the register's base URL so suites
   *  drive scripts/tests/abr-stub.mjs instead of the live registrar. Dev/test
   *  only — production leaves it unset and the default endpoint applies. */
  ABR_BASE_URL?: string;
}
