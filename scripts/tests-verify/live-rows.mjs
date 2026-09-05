// TESTER PROBE — what the four predicates see on the REAL local seed, through
// the real endpoint, with no stub anywhere.
const BASE = "http://127.0.0.1:8788";
const jar = [];
let n = 0;
const ip = () => `198.20.0.${n++}`;

async function req(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init, redirect: "manual",
    headers: {
      Host: "ops.localhost",
      ...(jar.length ? { cookie: jar.join("; ") } : {}),
      ...(init.json ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    body: init.json ? JSON.stringify(init.json) : undefined,
  });
  for (const c of res.headers.getSetCookie?.() ?? []) jar.push(c.split(";")[0]);
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; } catch { return { status: res.status, body: text }; }
}

const source = ip();
const ch = await req("/api/ops/auth/challenge", { method: "POST", json: { email: "liis@openframe.com.au" }, headers: { "X-Forwarded-For": source } });
await req("/api/ops/auth/verify", { method: "POST", json: { email: "liis@openframe.com.au", code: ch.body.devCode }, headers: { "X-Forwarded-For": source } });

const list = await req("/api/ops/projects");
const rows = list.body.projects ?? [];
console.log("rows:", rows.length);
for (const r of rows) {
  console.log(JSON.stringify({ id: r.id, statusCustomer: r.statusCustomer, orderStage: r.orderStage, issuable: r.issuable, waitingOn: r.waitingOn }));
}
const P = {
  submissions: (r) => r.statusCustomer === "submitted",
  inReview: (r) => r.statusCustomer === "under_review",
  readyToIssue: (r) => r.issuable === true,
  awaitingPayment: (r) => r.orderStage === "deposit_invoiced" || r.orderStage === "balance_invoiced",
};
for (const [k, f] of Object.entries(P)) console.log(k, "=", rows.filter(f).map((r) => r.id));

const summary = await req("/api/ops/summary");
console.log("summary:", JSON.stringify(summary.body));
