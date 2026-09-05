import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// `@cloudflare/containers` (worker/lib/drawing/PlanParseContainer.ts) imports
// `DurableObject`/`WorkerEntrypoint` from the `cloudflare:workers` virtual
// module, which only exists inside workerd — esbuild bundling worker/index.ts
// on plain Node (unit.test.mjs) cannot resolve it. These stubs exist only to
// let bundling and module-evaluation succeed; no test in this suite
// instantiates a Durable Object, so the stubs need no real behaviour.
export const cloudflareWorkersShimPlugin = {
  name: "cloudflare-workers-shim",
  setup(build) {
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "cloudflare:workers", namespace: "cf-workers-shim" }));
    build.onLoad({ filter: /.*/, namespace: "cf-workers-shim" }, () => ({
      contents: `
        export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }
        export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }
      `,
      loader: "js",
    }));
  },
};
export const viteCli = join(projectRoot, "node_modules", "vite", "bin", "vite.js");
export const wranglerCli = join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");

// Seed identities are read from the seed itself so local fixture edits (extra
// test users, different sign-in addresses) don't break the suite.
const seedSql = readFileSync(join(projectRoot, "scripts", "db", "seed.sql"), "utf8");
const seedUserRows = [...seedSql.matchAll(/\(\s*'(u_[\w]+)'\s*,\s*'([^']+)'/g)];
// Exact id first, then id-prefix — the seed may carry one staff fixture
// (u_staff) or several (u_staff1, u_staff2…), and adding or renaming demo
// people should not break the suite. Lowest matching id wins so the choice is
// stable regardless of row order.
const seedEmail = (id) => {
  const exact = seedUserRows.find(([, userId]) => userId === id);
  if (exact) return exact[2];
  const prefixed = seedUserRows
    .filter(([, userId]) => userId.startsWith(id))
    .sort((a, b) => a[1].localeCompare(b[1]))[0];
  if (!prefixed) throw new Error(`seed.sql: no user row for ${id} (or ${id}*)`);
  return prefixed[2];
};
export const seedUserCount = seedUserRows.length;
export const demoEmail = seedEmail("u_demo");
export const staffEmail = seedEmail("u_staff");
// wrangler 4.111 resolves the account and validates the containers image's
// OWNER even for `--local` dev with containers disabled. The token is fake
// (nothing remote is called with it), but the account id must match the image
// ref in wrangler.jsonc — it is the public account hash from that ref, not a
// credential.
export const wranglerLocalAuthEnv = {
  CLOUDFLARE_API_TOKEN: "wrangler-local-dev-not-a-real-credential",
  CLOUDFLARE_ACCOUNT_ID: "c3834ff3509fa7cb4c9769a6dee6c2d8",
};
const needsShell = (command) => process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command);

export async function makeRunDir(label) {
  const parent = join(projectRoot, ".codex-tmp");
  await mkdir(parent, { recursive: true });
  return mkdtemp(join(parent, `${label}-`));
}

export async function removeRunDir(path) {
  await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}

export function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: { ...process.env, ...options.env },
      shell: needsShell(command),
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolveRun({ stdout, stderr });
      reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

export function start(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...options.env },
    shell: needsShell(command),
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: "ignore",
  });
  return { child, output: () => "See WRANGLER_LOG_PATH for Wrangler diagnostics." };
}

export async function stop(processHandle) {
  const child = processHandle?.child;
  if (!child?.pid || child.exitCode !== null) return;
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  if (process.platform === "win32") {
    const killedTree = await run("taskkill", ["/PID", String(child.pid), "/T", "/F"])
      .then(() => true, () => false);
    if (!killedTree) child.kill();
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
  }
  await Promise.race([
    exited,
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 3_000)),
  ]);
}

export async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

export async function waitForUrl(url, processHandle, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (processHandle.child.exitCode !== null) {
      throw new Error(`Wrangler exited before becoming ready.\n${processHandle.output()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}\n${processHandle.output()}`);
}

export class Session {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
  }

  async request(path, options = {}) {
    const headers = new Headers(options.headers);
    if (this.cookies.size) {
      headers.set("Cookie", [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    }
    let body = options.body;
    if (Object.hasOwn(options, "json")) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.json);
    }
    const response = await fetch(new URL(path, this.baseUrl), { ...options, headers, body });
    const setCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : (response.headers.get("set-cookie")?.split(/,(?=[^;,]+=)/) ?? []);
    for (const cookie of setCookies) {
      const [pair] = cookie.split(";", 1);
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (/max-age=0/i.test(cookie) || !value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }
}

export async function responseBody(response) {
  const type = response.headers.get("content-type") ?? "";
  return type.includes("application/json") ? response.json() : response.text();
}

export async function requestJson(session, path, options = {}, expectedStatus = 200) {
  const response = await session.request(path, options);
  const body = await responseBody(response);
  if (response.status !== expectedStatus) {
    throw new Error(`${options.method ?? "GET"} ${path}: expected ${expectedStatus}, received ${response.status}\n${JSON.stringify(body)}`);
  }
  return { response, body };
}

/**
 * A refused ops request must carry NO part of the summary — not just the first
 * key someone thought to check.
 *
 * It was `assert.equal(body.submissions, undefined)`, which is one of six
 * counts: a denial leaking `inReview` or `awaitingPayment` — the pipeline of a
 * business a manufacturer partner competes with — stayed green. The six are
 * the keys `/api/ops/summary` answers with that this console reads
 * (src/ops2/attention/attention.ts).
 */
export const SUMMARY_COUNT_KEYS = [
  "submissions", "inReview", "readyToIssue", "awaitingPayment", "newEnquiries", "tradeApplications",
];

export function assertNoCounts(body, label = "denial body carries no counts") {
  const leaked = SUMMARY_COUNT_KEYS.filter((key) => body?.[key] !== undefined);
  assert.deepEqual(leaked, [], `${label} — leaked: ${leaked.join(", ")}`);
}

// Every login gets its own source address. Code issuance is now capped per source
// as well as per recipient, and without this the whole suite would share the
// single "unknown" bucket and start tripping the throttle partway through a run —
// a failure that would look like a broken auth flow rather than a working control.
// The documentation range 198.18.0.0/15 is used so these can never collide with a
// real client address.
let loginSource = 0;
const testSourceIp = () => {
  const n = loginSource++;
  return `198.18.${(n >> 8) & 255}.${n & 255}`;
};

// The submission gate (registration Phase 1) refuses a signed-in customer whose
// account has no name, phone or address — server-side, whatever the browser said.
// So every suite that submits a quote now needs an account that is actually
// complete, and this is the one place that says what "complete" means. Overrides
// exist for the suites that care about a particular value (a 1300 number, a
// specific state) rather than about completeness itself.
export const COMPLETE_ACCOUNT = {
  name: "Sam Taylor",
  phone: "0412 345 678",
  addressLine1: "12 Bridge Street",
  addressSuburb: "Preston",
  addressState: "VIC",
  addressPostcode: "3072",
};

export async function completeAccount(session, overrides = {}) {
  const { body } = await requestJson(session, "/api/auth/profile", {
    method: "POST",
    json: { ...COMPLETE_ACCOUNT, ...overrides },
  });
  return body.user;
}

export async function login(session, prefix, email) {
  const headers = { "X-Forwarded-For": testSourceIp() };
  const challenge = await requestJson(session, `${prefix}/challenge`, { method: "POST", json: { email }, headers });
  if (!/^\d{6}$/.test(challenge.body.devCode ?? "")) throw new Error(`No development OTP returned for ${email}`);
  return requestJson(session, `${prefix}/verify`, {
    method: "POST",
    json: { email, code: challenge.body.devCode },
    headers,
  });
}
