import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const viteCli = join(projectRoot, "node_modules", "vite", "bin", "vite.js");
export const wranglerCli = join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
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

export async function login(session, prefix, email) {
  const challenge = await requestJson(session, `${prefix}/challenge`, { method: "POST", json: { email } });
  if (!/^\d{6}$/.test(challenge.body.devCode ?? "")) throw new Error(`No development OTP returned for ${email}`);
  return requestJson(session, `${prefix}/verify`, {
    method: "POST",
    json: { email, code: challenge.body.devCode },
  });
}
