#!/usr/bin/env node
// Preflight — is the pipeline actually able to run right now?
//
// WHY THIS EXISTS. On 2026-08-17 the TDD gate's validator lost its OAuth session
// and every write came back "could not parse verdict from validator output:
// Not logged in". That is indistinguishable, from the inside, from the gate
// working and refusing you — so the response was to argue with the gate rather
// than to check whether it could speak. It cost hours. Separately, orphaned
// `workerd`/`vite` processes from killed agents held the harness ports, and the
// suites aborted mid-run rather than failing an assertion, which reads as
// flakiness rather than as a busy port.
//
// Every check here is one that has ALREADY failed silently at least once. The
// point is not completeness; it is that a broken environment announces itself in
// seconds instead of being inferred from confusing symptoms an hour later.
//
//   node scripts/preflight.mjs          # check
//   node scripts/preflight.mjs --fix    # also clear stale harness ports
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import net from "node:net";

const run = promisify(execFile);
const FIX = process.argv.includes("--fix");
const results = [];
const record = (name, ok, detail, fatal = true) => {
  results.push({ name, ok, detail, fatal });
  const mark = ok ? "  ok  " : fatal ? " FAIL " : " warn ";
  console.log(`[${mark}] ${name}${detail ? " — " + detail : ""}`);
};

// ── 1. The TDD validator's credentials ──────────────────────────────────────
// The exact failure: accessToken and refreshToken become EMPTY STRINGS while the
// metadata survives, so the file looks configured. With no refresh token there is
// nothing to renew from, and the running session keeps working off a token minted
// before expiry — so only subprocesses break, which is why it is invisible.
//
// NOTE the store the CLI reads is NOT the one the desktop app writes. Signing out
// and back into the app does not touch this file. The fix is `claude auth login`.
function checkCredentials() {
  const f = join(homedir(), ".claude", ".credentials.json");
  if (!existsSync(f)) return record("claude cli credentials", false, `missing ${f} — run: claude auth login`);
  let oauth;
  try {
    oauth = JSON.parse(readFileSync(f, "utf8")).claudeAiOauth ?? {};
  } catch {
    return record("claude cli credentials", false, "unparseable — run: claude auth login");
  }
  const access = String(oauth.accessToken ?? "").length;
  const refresh = String(oauth.refreshToken ?? "").length;
  const expiresAt = Number(oauth.expiresAt ?? 0);
  if (!access || !refresh) {
    return record("claude cli credentials", false,
      `tokens are empty (access=${access}, refresh=${refresh}) — run: claude auth login`);
  }
  if (expiresAt && expiresAt < Date.now()) {
    return record("claude cli credentials", false,
      `expired ${new Date(expiresAt).toISOString()} — run: claude auth login`);
  }
  const hours = expiresAt ? Math.round((expiresAt - Date.now()) / 36e5) : null;
  record("claude cli credentials", true, hours === null ? "present" : `valid ~${hours}h`);
}

// ── 2. Codex, for the stop-time review gate ─────────────────────────────────
// Quota exhaustion and an expired token both surface as a failed review task
// rather than as review findings, and the plugin reports it as a task failure —
// which reads like the gate blocking on the work. It is not.
async function checkCodex() {
  try {
    // `codex` is a .cmd shim on Windows and execFile cannot spawn it directly —
    // it fails ENOENT, which reads as "Codex is not installed" when it is.
    //
    // NOT `shell: true`: that concatenates rather than escapes, so a prompt with
    // spaces arrives as separate arguments, and it raises DEP0190 — the same
    // deprecation warning the Codex stop-gate hook emits. `cmd /c` keeps real
    // argument passing.
    //
    // THE PROMPT GOES ON STDIN, not in argv. `cmd /c` re-parses the command line,
    // so a prompt passed as an argument arrives mangled or missing — and Codex
    // then waits on stdin ("Reading additional input from stdin") until the
    // timeout, which this check would report as "unreachable" when it is fine.
    // Piping the prompt in sidesteps every layer of Windows quoting.
    const [bin, head] = process.platform === "win32" ? ["cmd", ["/c", "codex"]] : ["codex", []];
    const out = execFileSync(bin, [...head, "exec", "--skip-git-repo-check", "-"], {
      input: "ping", timeout: 120_000, windowsHide: true, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    });
    if (/usage limit|not logged in|token_expired|unauthor/i.test(out)) {
      return record("codex review gate", false, out.split("\n").find((l) => /limit|logged|token|unauthor/i.test(l))?.trim()?.slice(0, 90) ?? "auth/quota", false);
    }
    record("codex review gate", true, "reachable");
  } catch (e) {
    record("codex review gate", false, String(e.message ?? e).slice(0, 90), false);
  }
}

// ── 3. Harness ports ────────────────────────────────────────────────────────
// A leftover wrangler/vite from a killed agent makes `test:web` refuse to start
// and makes the node suites ABORT MID-RUN — far fewer tests than expected, which
// looks like a flaky suite rather than a busy port. Seen three times in one day.
const PORTS = [
  [8788, "playwright worker (test:web)"],
  [8787, "wrangler dev (dev:api)"],
  [5173, "vite (dev)"],
];
const portBusy = (port) => new Promise((resolve) => {
  const socket = net.connect({ port, host: "127.0.0.1" });
  socket.setTimeout(700);
  socket.on("connect", () => (socket.destroy(), resolve(true)));
  socket.on("timeout", () => (socket.destroy(), resolve(false)));
  socket.on("error", () => resolve(false));
});

async function checkPorts() {
  const busy = [];
  for (const [port, what] of PORTS) if (await portBusy(port)) busy.push([port, what]);
  if (!busy.length) return record("harness ports free", true, "8788/8787/5173");
  const list = busy.map(([p, w]) => `${p} (${w})`).join(", ");
  if (!FIX) {
    return record("harness ports free", false, `${list} — re-run with --fix, or stop the dev server you meant to keep`, false);
  }
  for (const [port] of busy) {
    try {
      // Windows-only, and deliberately so: this repo's harness is Windows and a
      // portable implementation would be guesswork that fails when it matters.
      const { stdout } = await run("cmd", ["/c", `netstat -ano | findstr :${port} | findstr LISTENING`], { windowsHide: true });
      const pids = [...new Set(String(stdout).trim().split("\n").map((l) => l.trim().split(/\s+/).pop()).filter(Boolean))];
      for (const pid of pids) await run("taskkill", ["/PID", pid, "/F"], { windowsHide: true }).catch(() => {});
    } catch { /* nothing listening any more */ }
  }
  const still = [];
  for (const [port, what] of busy) if (await portBusy(port)) still.push(`${port} (${what})`);
  record("harness ports free", still.length === 0, still.length ? `still busy: ${still.join(", ")}` : "cleared", false);
}

// ── 4. The pipeline's own moving parts ──────────────────────────────────────
function checkPipelineFiles() {
  const agents = ["architect", "developer", "product-manager", "tester", "ui-designer", "ux-designer"];
  const missingAgents = agents.filter((a) => !existsSync(join(".claude", "agents", `${a}.md`)));
  record("pipeline agents", missingAgents.length === 0, missingAgents.length ? `missing: ${missingAgents.join(", ")}` : `${agents.length} present`);

  const hooks = [join(".claude", "hooks", "agent-guard.mjs"), join(".claude", "hooks", "probity-subagent-shim.mjs")];
  const missingHooks = hooks.filter((h) => !existsSync(h));
  record("hook scripts", missingHooks.length === 0, missingHooks.length ? `missing: ${missingHooks.join(", ")}` : "present");

  // Probity fails CLOSED without a config, so a missing one blocks every gated
  // write with a message about configuration rather than about tests.
  const config = ["ts", "mts", "js", "mjs"].map((e) => `probity.config.${e}`).find((f) => existsSync(f));
  record("probity config", Boolean(config), config ?? "none found — Probity fails closed without one");
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log("preflight — can the pipeline run?\n");
checkCredentials();
checkPipelineFiles();
await checkPorts();
await checkCodex();

const fatal = results.filter((r) => !r.ok && r.fatal);
const warn = results.filter((r) => !r.ok && !r.fatal);
console.log("");
if (fatal.length) {
  console.log(`BLOCKED: ${fatal.length} check(s) failed. Fix these before running the pipeline —`);
  console.log("a broken validator refuses writes with wording that reads exactly like a TDD violation.");
  process.exit(1);
}
console.log(warn.length ? `ready, with ${warn.length} warning(s) — review above.` : "ready.");
