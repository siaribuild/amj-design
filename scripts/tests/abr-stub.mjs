// The ABR stub — a harness module, not a suite (design §11.6).
//
// It exists so that NO test in this repo ever reaches the real ABN Lookup
// register: the tests need a cancelled ABN, an unknown ABN, a server that
// errors, a server that hangs and a server that lies, and the live registrar
// offers none of those on demand. `worker/lib/abr.ts` reads ABR_BASE_URL, so
// pointing it here is the whole seam.
//
// The HIT COUNTER is not a convenience. "This request made no ABR call" is an
// acceptance criterion in three places (AB-P2-5 unauthenticated, AB-P2-6 rate
// caps, AC-P2-7/17 a bad checksum and the submit path), and it is the difference
// between proving it and inferring it from a response body.
//
// Responses are JSONP-wrapped like the real API, so the client's unwrapping is
// exercised rather than assumed.
import { createServer } from "node:http";

/** Every ABN below is CHECKSUM-VALID, so a test that wants to exercise the
 *  register has to get past src/data/abn.ts first — as a real caller does. */
export const ABR_FIXTURES = {
  /** Active, entity + two trading names. The auto-pass case. */
  active: "51000000680",
  /** Active, no GST registration recorded (E-P2-4: not a criterion). */
  activeNoGst: "53000000932",
  /** Active, but the entity is nothing like "Smith Brothers" (name_mismatch). */
  otherEntity: "70000000760",
  /** Active, registered to a business whose domain is northsidebuild.com.au. */
  northside: "70000000841",
  /** Active. Spares — an auto-pass consumes an ABN for the rest of a run (the
   *  next applicant on the same number is a duplicate, correctly), so a test
   *  that needs a clean verification needs its own. */
  harbour: "70000000792",
  keystone: "70000000873",
  wattle: "70000000954",
  /** On the register, but cancelled (abn_inactive). */
  cancelled: "51000000761",
  /** The register answers: no such ABN (abn_not_found). */
  notFound: "51000000842",
  /** The register returns HTTP 500 (abr_unavailable). */
  serverError: "53000000770",
  /** The register returns something that is not the shape we expect. */
  malformed: "53000000851",
  /** The register holds the connection open past the client's deadline. */
  slow: "51000000955",
  /** A hostile response: a very long entity name and a hundred trading names. */
  oversized: "53000000964",
};

const ENTITY = {
  [ABR_FIXTURES.active]: {
    AbnStatus: "Active", AbnStatusEffectiveFrom: "2014-07-01",
    EntityName: "SMITH BROTHERS PTY LTD", EntityTypeName: "Australian Private Company",
    BusinessName: ["SMITH BROS", "SMITH BROS CONSTRUCTIONS"], Gst: "2014-07-01",
  },
  [ABR_FIXTURES.activeNoGst]: {
    AbnStatus: "Active", AbnStatusEffectiveFrom: "2019-03-11",
    EntityName: "SMITH BROTHERS PTY LTD", EntityTypeName: "Australian Private Company",
    BusinessName: ["SMITH BROS"], Gst: "",
  },
  [ABR_FIXTURES.otherEntity]: {
    AbnStatus: "Active", AbnStatusEffectiveFrom: "2011-06-01",
    EntityName: "QUANTUM LEAP LOGISTICS PTY LTD", EntityTypeName: "Australian Private Company",
    BusinessName: [], Gst: "2011-06-01",
  },
  [ABR_FIXTURES.northside]: {
    AbnStatus: "Active", AbnStatusEffectiveFrom: "2016-02-02",
    EntityName: "NORTHSIDE BUILDING PTY LTD", EntityTypeName: "Australian Private Company",
    BusinessName: ["NORTHSIDE BUILD"], Gst: "2016-02-02",
  },
  [ABR_FIXTURES.harbour]: {
    AbnStatus: "Active", AbnStatusEffectiveFrom: "2018-08-08",
    EntityName: "HARBOUR EDGE JOINERY PTY LTD", EntityTypeName: "Australian Private Company",
    BusinessName: ["HARBOUR EDGE"], Gst: "2018-08-08",
  },
  [ABR_FIXTURES.keystone]: {
    AbnStatus: "Active", AbnStatusEffectiveFrom: "2013-04-04",
    EntityName: "KEYSTONE CARPENTRY PTY LTD", EntityTypeName: "Australian Private Company",
    BusinessName: ["KEYSTONE CARPENTRY"], Gst: "2013-04-04",
  },
  [ABR_FIXTURES.wattle]: {
    AbnStatus: "Active", AbnStatusEffectiveFrom: "2020-10-10",
    EntityName: "WATTLE GROVE WINDOWS PTY LTD", EntityTypeName: "Australian Private Company",
    BusinessName: ["WATTLE GROVE WINDOWS"], Gst: "2020-10-10",
  },
  [ABR_FIXTURES.cancelled]: {
    AbnStatus: "Cancelled", AbnStatusEffectiveFrom: "2021-09-30",
    EntityName: "SMITH BROTHERS PTY LTD", EntityTypeName: "Australian Private Company",
    BusinessName: ["SMITH BROS"], Gst: "",
  },
};

function bodyFor(abn) {
  const known = ENTITY[abn];
  if (known) return { Abn: abn, Acn: "", AddressPostcode: "3000", AddressState: "VIC", Message: "", ...known };
  if (abn === ABR_FIXTURES.oversized) {
    return {
      Abn: abn, AbnStatus: "Active", AbnStatusEffectiveFrom: "2001-01-01",
      EntityName: "X".repeat(5_000), EntityTypeName: "Y".repeat(2_000),
      BusinessName: Array.from({ length: 100 }, (_, i) => `TRADING NAME ${i} ${"Z".repeat(1_000)}`),
      Message: "",
    };
  }
  // The real API's not-found shape: an empty record plus a Message.
  return { Abn: "", AbnStatus: "", BusinessName: [], EntityName: "", Message: "Search text is not a valid ABN or ACN" };
}

/** Boot the stub on a free port. Returns its base URL, its hit log, and a close. */
export async function startAbrStub() {
  const hits = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");

    if (url.pathname === "/__hits") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(hits));
      return;
    }
    if (url.pathname === "/__reset") {
      hits.length = 0;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
      return;
    }

    const abn = url.searchParams.get("abn") ?? "";
    hits.push({ abn, hasGuid: !!url.searchParams.get("guid"), path: url.pathname, at: Date.now() });

    if (abn === ABR_FIXTURES.slow) {
      // Held open past any sane client deadline. The socket is destroyed on
      // close() so the server can still shut down.
      return;
    }
    if (abn === ABR_FIXTURES.serverError) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("upstream exploded");
      return;
    }
    if (abn === ABR_FIXTURES.malformed) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html>maintenance window</html>");
      return;
    }

    const callback = url.searchParams.get("callback") || "callback";
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(`${callback}(${JSON.stringify(bodyFor(abn))})`);
  });

  const sockets = new Set();
  server.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    hits: () => hits.slice(),
    reset: () => { hits.length = 0; },
    close: () => new Promise((resolve) => {
      for (const s of sockets) s.destroy();
      server.close(resolve);
    }),
  };
}

// Run directly (`node scripts/tests/abr-stub.mjs [port]`) so the Playwright web
// harness and the wrangler-dev suites can boot it as a child process and pass
// its URL in as ABR_BASE_URL. It prints its base URL on stdout, once.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("abr-stub.mjs")) {
  const stub = await startAbrStub();
  console.log(stub.baseUrl);
}
