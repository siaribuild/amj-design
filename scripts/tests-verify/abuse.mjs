// TESTER PROBE — criteria 18-22 executed for real against a running local
// Worker on 127.0.0.1:8788 (start it with `node scripts/tests/web-server.mjs`).
// Every ops read is attempted WITH the attention filter parameters the feature
// introduces, and with injected values, from each non-staff identity.
const BASE = "http://127.0.0.1:8788";
const HOST = "ops.localhost";

const jar = new Map();

async function req(who, path, init = {}) {
  const cookies = jar.get(who) ?? "";
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: {
      Host: HOST,
      ...(cookies ? { cookie: cookies } : {}),
      ...(init.json ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    body: init.json ? JSON.stringify(init.json) : init.body,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) {
    const merged = new Map(
      (cookies ? cookies.split("; ") : []).map((c) => [c.split("=")[0], c]),
    );
    for (const c of set) {
      const pair = c.split(";")[0];
      merged.set(pair.split("=")[0], pair);
    }
    jar.set(who, [...merged.values()].join("; "));
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, text };
}

// A distinct source IP per identity, exactly as scripts/tests/helpers.mjs does:
// the OTP issuer rate-limits per IP and answers a neutral {ok:true} with no
// devCode once the cap is hit, which reads as "auth broken" rather than as a
// limit doing its job.
let sourceN = 0;
const sourceIp = () => { const n = sourceN++; return `198.19.${(n >> 8) & 255}.${n & 255}`; };

async function login(who, seam, email) {
  const ip = sourceIp();
  const challenge = await req(who, `${seam}/challenge`, { method: "POST", json: { email }, headers: { "X-Forwarded-For": ip } });
  const code = challenge.body?.devCode;
  if (!code) throw new Error(`${who}: no devCode (${challenge.status} ${challenge.text.slice(0, 120)})`);
  const verified = await req(who, `${seam}/verify`, { method: "POST", json: { email, code }, headers: { "X-Forwarded-For": ip } });
  if (verified.status !== 200) throw new Error(`${who}: verify ${verified.status}`);
}

const QUERIES = [
  "",
  "?attn=readyToIssue",
  "?attn=submissions&wait=us",
  `?attn=${encodeURIComponent("' OR 1=1 --")}`,
  `?attn=${encodeURIComponent("<script>alert(1)</script>")}`,
  `?attn=${encodeURIComponent("x".repeat(4000))}`,
];

const fail = [];
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) fail.push(label);
};

await login("customer", "/api/auth", "sarah@northsidebuild.com.au");
// NO PARTNER HERE: a manufacturer partner identity only exists when the Worker
// runs with MANUFACTURER_EMAIL_DOMAINS set, which scripts/tests/web-server.mjs
// does not do. Criterion 20 is executed by scripts/tests/api.test.mjs, whose
// harness does set it.
await login("staff", "/api/ops/auth", "liis@openframe.com.au");

for (const who of ["anonymous", "customer"]) {
  for (const q of QUERIES) {
    const r = await req(who, `/api/ops/projects${q}`);
    check(
      `${who} GET /api/ops/projects${q.slice(0, 40)}`,
      (r.status === 401 || r.status === 403) && r.body?.projects === undefined,
      `status ${r.status}, body ${JSON.stringify(r.body).slice(0, 90)}`,
    );
  }
  const s = await req(who, "/api/ops/summary?attn=readyToIssue");
  const counts = ["submissions", "inReview", "readyToIssue", "awaitingPayment", "newEnquiries", "tradeApplications"];
  check(
    `${who} GET /api/ops/summary?attn=readyToIssue`,
    (s.status === 401 || s.status === 403) && counts.every((k) => s.body?.[k] === undefined),
    `status ${s.status}, body ${JSON.stringify(s.body).slice(0, 90)}`,
  );
}

// Staff, for contrast: the same injected values must not change the answer,
// error, or echo — the server never reads `attn` at all.
const clean = await req("staff", "/api/ops/projects");
check("staff GET /api/ops/projects", clean.status === 200 && Array.isArray(clean.body?.projects),
  `status ${clean.status}, ${clean.body?.projects?.length} rows`);
for (const q of QUERIES.slice(1)) {
  const r = await req("staff", `/api/ops/projects${q}`);
  const same = r.status === 200
    && JSON.stringify(r.body?.projects) === JSON.stringify(clean.body?.projects);
  const echoed = r.text.includes("OR 1=1") || r.text.includes("<script>");
  check(`staff GET /api/ops/projects${q.slice(0, 40)} — identical set, nothing echoed`,
    same && !echoed, `status ${r.status}, echoed=${echoed}`);
}

// The two DTO fields the feature depends on, read off the live endpoint.
const row = clean.body?.projects?.[0];
check("live row DTO carries statusCustomer and an orderStage key",
  row && typeof row.statusCustomer === "string" && Object.hasOwn(row, "orderStage"),
  JSON.stringify({ id: row?.id, statusCustomer: row?.statusCustomer, orderStage: row?.orderStage }));

// Signed-out browser reaching the queue's HTML address with a filter: the
// document is served (SPA shell) but it must carry no project data.
const html = await req("anonymous", "/ops2/projects?attn=readyToIssue");
const leaks = ["p_submitted", "OF-Q", "Northcote", "statusCustomer"].filter((s) => html.text.includes(s));
check("signed-out GET /ops2/projects?attn= leaks no project data in the document",
  leaks.length === 0, `status ${html.status}, leaked ${JSON.stringify(leaks)}`);

console.log(fail.length ? `\n${fail.length} FAILED: ${fail.join(" | ")}` : "\nall abuse probes passed");
process.exit(fail.length ? 1 : 0);
