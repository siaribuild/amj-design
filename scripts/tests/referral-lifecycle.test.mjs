// Referral program — schema, codes, attribution and money (design
// docs/design/referral-program.md §13.1). Grows ticket by ticket; this file
// starts at T1 with migration 0051 and the AC-49c proof, and gains the code /
// attribution / earning subtests at T3 and T4 (which is when it also needs a
// running Worker — T1 needs only a migrated D1, so it does not boot one).
//
// THE AC-49c PROOF IS THE POINT OF THE FIRST BLOCK. The spec's requirement is
// that 0051 leaves every stored price bitwise unchanged, "verified by
// checksum/row comparison before and after, not by inspection of the SQL". So
// this suite builds a database at 0050, seeds it so there are real prices to
// disturb, fingerprints them with scripts/db/price-checksums.sql, applies 0051,
// and fingerprints again. Reading the migration and concluding it looks additive
// is exactly the verification the criterion refuses to accept.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  Session, freePort, login, makeRunDir, projectRoot, removeRunDir,
  requestJson, run, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";

const MIGRATION = "0051_referral_program.sql";

// Columns each new table must carry, from the design's §3. Named rather than
// counted: a test that asserts a column count tells you something changed but
// never what, and this schema is the one place several compliance-load-bearing
// facts are stored (the M10 snapshot columns, the frozen payout banking).
const EXPECTED_COLUMNS = {
  referral_program: [
    "id", "active", "referrer_reward_active", "referred_discount_active", "rate_percent",
    "cap_amount", "min_order_amount", "min_payout_balance", "window_months", "discount_percent",
    "payout_timeframe_days", "version", "updated_at", "updated_by",
  ],
  referral: [
    "id", "referrer_user_id", "referred_user_id", "code", "source", "status",
    "rate_percent", "cap_amount", "min_order_amount", "discount_percent", "window_months",
    "expires_at", "void_reason", "voided_by", "voided_at", "reminder_sent_at",
    "expired_processed_at", "created_at",
  ],
  referral_earning: [
    "id", "referral_id", "order_id", "base_amount", "rate_percent", "amount", "status",
    "payout_id", "void_reason", "created_at", "confirmed_at", "voided_at",
  ],
  referral_payout: [
    "id", "referrer_user_id", "amount", "status", "reference", "note", "paid_at", "paid_by",
    "abn", "bsb", "account_number", "account_name", "created_at",
  ],
  payout_details_access: ["id", "subject_user_id", "actor_user_id", "action", "context", "at"],
};

test("referral program — migration 0051", { timeout: 600_000 }, async (t) => {
  const runDir = await makeRunDir("referral-lifecycle");
  const state = join(runDir, "state");
  const wranglerEnv = { WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") };
  try {
    // A migrations directory frozen at 0050, plus a throwaway wrangler config
    // pointing at it. This is how "before" is reached without touching the
    // repository's own migrations directory — which a second agent may be
    // editing while this runs.
    const priorDir = join(runDir, "migrations-pre-0051");
    await mkdir(priorDir, { recursive: true });
    const allMigrations = (await readdir(join(projectRoot, "migrations"))).filter((f) => f.endsWith(".sql")).sort();
    for (const file of allMigrations.filter((f) => f !== MIGRATION)) {
      await cp(join(projectRoot, "migrations", file), join(priorDir, file));
    }
    const priorConfig = join(runDir, "wrangler.pre-0051.json");
    await writeFile(priorConfig, JSON.stringify({
      name: "apertly-ac49c",
      compatibility_date: "2026-07-16",
      d1_databases: [{
        binding: "DB", database_name: "apertly-db",
        database_id: "fb104839-cbb5-402c-a48f-be2696483bef",
        migrations_dir: "migrations-pre-0051",
      }],
    }, null, 2));

    const d1 = (args, config) => run(process.execPath, [
      wranglerCli, "d1", ...args, "apertly-db", "--local", "--persist-to", state,
      ...(config ? ["-c", config] : []),
    ], { env: wranglerEnv });
    const query = async (args) => {
      const r = await d1(["execute", ...args, "--json"]);
      // Wrangler prefixes the JSON with its banner; the payload starts at the
      // first bracket of the array it prints.
      return JSON.parse(r.stdout.slice(r.stdout.indexOf("[")))[0].results;
    };
    const sql = (command) => query(["--command", command]);
    const checksums = () => query(["--file", "scripts/db/price-checksums.sql"]);

    await d1(["migrations", "apply"], priorConfig);
    await d1(["execute", "--file", "scripts/db/seed.sql"]);

    const before = await checksums();
    await d1(["migrations", "apply"]);
    const after = await checksums();

    await t.test("0051 is the next migration and nothing has been renumbered past it", async () => {
      assert.ok(allMigrations.includes(MIGRATION), `migrations/${MIGRATION} does not exist`);
      const highest = allMigrations[allMigrations.length - 1];
      assert.equal(highest, MIGRATION, `migrations are append-only; ${highest} sits after ${MIGRATION}`);
      const applied = await sql("SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1");
      assert.equal(applied[0]?.name, MIGRATION, "0051 was applied by the migration runner, not by hand");
    });

    await t.test("AC-49c — applying 0051 leaves every stored price bitwise unchanged", () => {
      // Guard the guard: an empty database would make this pass vacuously.
      const quoteLines = before.find((r) => r.metric === "quote_line.line_total");
      assert.ok(quoteLines.row_count > 0, "the seeded database has priced quote lines to disturb");
      assert.notEqual(quoteLines.sum_cents, 0, "those lines carry real money");
      assert.deepEqual(after, before, "0051 moved a stored price — see scripts/db/price-checksums.sql");
    });

    for (const [table, expected] of Object.entries(EXPECTED_COLUMNS)) {
      await t.test(`${table} has the columns the design specifies`, async () => {
        const rows = await sql(`SELECT name FROM pragma_table_info('${table}')`);
        assert.deepEqual(rows.map((r) => r.name), expected);
      });
    }

    await t.test("the program has two states, held as a boolean — there is no third", async () => {
      const ddl = (await sql(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='referral_program'",
      ))[0].sql;
      const columns = await sql("SELECT name FROM pragma_table_info('referral_program')");
      // Revision 9 of the spec collapsed active/paused/terminated to On/Off.
      // A `status` column would be the shape a third state comes back through.
      assert.equal(columns.some((c) => c.name === "status"), false, "referral_program.status is a leftover of the three-state model");
      assert.equal(/\b(paused|terminated)\b/i.test(ddl), false, "a third program state is named in the schema");
    });

    await t.test("the singleton config ships the launch defaults", async () => {
      const rows = await sql("SELECT * FROM referral_program");
      assert.equal(rows.length, 1, "referral_program is a singleton");
      const program = rows[0];
      assert.equal(program.id, "default");
      assert.equal(program.active, 1);
      assert.equal(program.referrer_reward_active, 1);
      assert.equal(program.referred_discount_active, 1);
      assert.equal(program.rate_percent, 1);
      assert.equal(program.cap_amount, null, "M5: no cap ships, and NULL is how 'no cap' is said");
      assert.equal(program.min_order_amount, 2000);
      assert.equal(program.min_payout_balance, 0, "M7: the payout threshold ships off");
      assert.equal(program.window_months, 12);
      assert.equal(program.discount_percent, 2.5);
      assert.equal(program.payout_timeframe_days, 14);
    });

    await t.test("user gains the code and the payout fields, with the code unique", async () => {
      const columns = (await sql("SELECT name FROM pragma_table_info('user')")).map((r) => r.name);
      for (const name of ["referral_code", "payout_bsb", "payout_account_number", "payout_account_name"]) {
        assert.ok(columns.includes(name), `user.${name} is missing`);
      }
      const indexes = await sql('SELECT name, "unique" FROM pragma_index_list(\'user\')');
      const codeIndexes = [];
      for (const index of indexes) {
        const cols = await sql(`SELECT name FROM pragma_index_info('${index.name}')`);
        if (cols.some((c) => c.name === "referral_code")) codeIndexes.push(index);
      }
      assert.equal(codeIndexes.length, 1, "exactly one index covers user.referral_code");
      assert.equal(codeIndexes[0].unique, 1, "referral codes are unique");
      // SQLite lets a UNIQUE index hold many NULLs, which is what makes
      // "no code until the D18 payability gate passes" expressible at all.
      await sql("INSERT INTO user (id, email) VALUES ('u_t1_a','t1a@example.com'),('u_t1_b','t1b@example.com')");
      const nulls = await sql("SELECT COUNT(*) AS n FROM user WHERE referral_code IS NULL");
      assert.ok(nulls[0].n >= 2, "accounts without a code coexist");
    });

    await t.test("project gains the issue-time referral stamp", async () => {
      const columns = (await sql("SELECT name FROM pragma_table_info('project')")).map((r) => r.name);
      assert.ok(columns.includes("referral_percent_at_issue"), "project.referral_percent_at_issue is missing");
    });

    await t.test("the relationship table refuses self-referral and a second referral", async () => {
      const ddl = (await sql("SELECT sql FROM sqlite_master WHERE type='table' AND name='referral'"))[0].sql;
      assert.match(ddl, /referrer_user_id\s*<>\s*referred_user_id/, "A11 is not structural");
      assert.match(ddl, /source[\s\S]*CHECK[\s\S]*'link'[\s\S]*'manual'/, "source is unconstrained");
      assert.match(ddl, /status[\s\S]*CHECK[\s\S]*'recorded'[\s\S]*'void'/, "referral status is unconstrained");
      // 'expired' is DERIVED from expires_at (spec §7) — a stored expired status
      // would be a second source of truth for a fact the dates already answer.
      assert.equal(/'expired'/.test(ddl), false, "referral.status stores an expiry that must be derived");
      assert.match(ddl, /referred_user_id[^,]*UNIQUE/, "A9: one referral per referred account is not structural");
    });

    await t.test("the money table is separate, one earning per order, statuses constrained", async () => {
      const ddl = (await sql("SELECT sql FROM sqlite_master WHERE type='table' AND name='referral_earning'"))[0].sql;
      assert.match(ddl, /order_id[^,]*UNIQUE/, "A8: one earning per order, ever");
      assert.match(ddl, /status[\s\S]*CHECK[\s\S]*'pending'[\s\S]*'confirmed'[\s\S]*'void'[\s\S]*'paid'/);
    });

    await t.test("the access log constrains its action and holds no account numbers", async () => {
      const ddl = (await sql("SELECT sql FROM sqlite_master WHERE type='table' AND name='payout_details_access'"))[0].sql;
      assert.match(ddl, /action[\s\S]*CHECK[\s\S]*'view'[\s\S]*'change'/);
      // §7.1: copying the details into a log to protect the details is
      // self-defeating. There is no column here that could hold them.
      for (const name of ["bsb", "account_number"]) {
        assert.equal(new RegExp(`\\b${name}\\b`).test(ddl), false, `payout_details_access must not carry ${name}`);
      }
    });

    await t.test("scripts/db/clear.sql wipes the referral data and spares the config", async () => {
      const clear = await readFile(join(projectRoot, "scripts", "db", "clear.sql"), "utf8");
      const deleted = new Set([...clear.matchAll(/DELETE FROM "?(\w+)"?/g)].map((m) => m[1]));
      for (const table of ["referral_earning", "referral_payout", "payout_details_access", "referral"]) {
        assert.ok(deleted.has(table), `scripts/db/clear.sql does not clear ${table}`);
      }
      // referral_program is configuration, not transactional data. clear.sql
      // spares pricing_policy and the rate cards for the same reason, and
      // seed.sql does not recreate any of them — the singleton is inserted by
      // this migration, so deleting it would leave the program unconfigured
      // with no way back.
      assert.equal(deleted.has("referral_program"), false, "clear.sql deletes the program config the migration creates");
    });
  } finally {
    await removeRunDir(runDir);
  }
});

// ── T3: the payability predicate, and nothing else ───────────────────────────
// D18: a user cannot hold a referral code until ABN, BSB, account number and
// account name are stored. The predicate below is the whole of that rule, and
// what it does NOT read is as load-bearing as what it does — see the ACL s 49
// subtest.
test("T3 — the payability predicate", { timeout: 120_000 }, async (t) => {
  const runDir = await makeRunDir("referral-predicate");
  t.after(async () => { await removeRunDir(runDir); });
  const outfile = join(runDir, "referrals-bundle.mjs");
  await build({
    stdin: {
      // Namespace re-export, not a named list: a function that does not exist yet
      // then arrives as `undefined` and fails an assertion, rather than breaking
      // the bundle with a resolution error that proves nothing.
      contents: `export * from ${JSON.stringify(join(projectRoot, "worker/lib/referrals.ts"))};`,
      resolveDir: projectRoot,
      sourcefile: "referrals-entry.ts",
      loader: "ts",
    },
    bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  });
  const M = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);

  await t.test("an ABN is valid only when it passes the ATO checksum", () => {
    // 51 824 753 556 is the ABR's own worked example. v1 does no ABN Lookup
    // call: an 11-digit checksum is the validity test, which catches a typo
    // without putting a network round trip in front of a tradie.
    assert.equal(M.abnValid("51824753556"), true, "abnValid must accept a checksum-valid ABN");
    assert.equal(M.abnValid("51 824 753 556"), true, "spacing is how humans write an ABN");
    assert.equal(M.abnValid("51824753557"), false, "a single transposed digit must fail the checksum");
    assert.equal(M.abnValid("5182475355"), false, "ten digits is not an ABN");
    assert.equal(M.abnValid(""), false);
    assert.equal(M.abnValid(null), false);
  });

  await t.test("D18 — payability is four detail fields, and it cannot see order history", () => {
    const complete = {
      abn: "51824753556", payout_bsb: "063000",
      payout_account_number: "12345678", payout_account_name: "A Tradie",
    };
    assert.equal(M.payoutComplete(complete), true, "payoutComplete must accept an account with all four details");
    for (const field of ["abn", "payout_bsb", "payout_account_number", "payout_account_name"]) {
      assert.equal(
        M.payoutComplete({ ...complete, [field]: null }), false,
        `payoutComplete must refuse an account missing ${field}`,
      );
      assert.equal(M.payoutComplete({ ...complete, [field]: "   " }), false, `whitespace is not a stored ${field}`);
    }
    assert.equal(M.payoutComplete({ ...complete, abn: "51824753557" }), false, "a checksum-invalid ABN is not a stored ABN");

    // ACL s 49, structural. "You must be a customer to refer" is the referral-
    // selling fact pattern — strict liability, penalties to $100m. The predicate
    // takes a user row and NOTHING else: no env, no database handle, so it is
    // incapable of consulting the referrer's orders even if someone later wanted
    // it to. A18 is protected by the signature, not by a comment.
    assert.equal(
      M.payoutComplete.length, 1,
      "payoutComplete must take only a user row — an env parameter would let it query order history",
    );
  });

  await t.test("AC-2/AC-3 — a code survives being read out over a job-site phone call", () => {
    assert.equal(typeof M.generateReferralCode, "function", "referrals.ts must export generateReferralCode");
    // Half these introductions happen on a job site: B reads the code out, A
    // types it in later. O/0 and I/1 are the pairs that get transcribed wrongly,
    // so the alphabet simply does not contain them.
    const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const shape = new RegExp(`^[${ALPHABET}]{3}-[${ALPHABET}]{3}$`);
    const seen = new Set();
    for (let i = 0; i < 500; i += 1) {
      const code = M.generateReferralCode();
      assert.match(code, shape, "generateReferralCode must return XXX-XXX from the unambiguous alphabet");
      seen.add(code);
    }
    for (const ambiguous of ["O", "0", "I", "1"]) {
      assert.equal(ALPHABET.includes(ambiguous), false, `${ambiguous} is transcribed wrongly over the phone`);
    }
    // Drawn at random rather than issued from a counter — a sequential code would
    // let anyone holding one guess the next.
    assert.ok(seen.size > 450, `500 codes produced only ${seen.size} distinct values`);
  });
});

// ── T3: codes and attribution, through the running stack ─────────────────────
test("T3 — codes, the D18 gate, and attribution", { timeout: 900_000 }, async (t) => {
  const runDir = await makeRunDir("referral-t3");
  const assets = join(runDir, "assets");
  const state = join(runDir, "state");
  const wranglerEnv = { WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") };
  let server;
  try {
    await run(process.execPath, [viteCli, "build", "--outDir", assets, "--emptyOutDir"]);
    await run(process.execPath, [wranglerCli, "d1", "migrations", "apply", "apertly-db", "--local", "--persist-to", state], { env: wranglerEnv });
    await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--file", "scripts/db/seed.sql"], { env: wranglerEnv });
    const sql = async (command) => {
      const r = await run(process.execPath, [wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--json", "--command", command], { env: wranglerEnv });
      return JSON.parse(r.stdout.slice(r.stdout.indexOf("[")))[0].results;
    };

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    server = start(process.execPath, [
      wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
      "--persist-to", state, "--assets", assets, "--log-level", "warn",
      "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:", "--var", "SANITY_PROJECT_ID:", "--var", "AI_EXTRACTION_MODE:manual",
    ], { env: wranglerEnv });
    await waitForUrl(`${baseUrl}/api/health`, server);

    await t.test("D18 — an account without payout details holds no code at all", async () => {
      // WITHHELD, not issued-inactive (ADR-8a). If no code exists there is
      // nothing to click, nothing to type and no cookie to set — so the window
      // in which a referral could be recorded against a referrer who cannot be
      // paid does not exist, rather than being guarded against.
      const session = new Session(baseUrl);
      await login(session, "/api/auth", "gate.nodetails@example.com");
      // Asserted rather than thrown: requestJson raises a plain Error on an
      // unexpected status, which reads as a broken harness rather than as the
      // behaviour under test being absent.
      const response = await session.request("/api/account/referrals");
      assert.equal(response.status, 200, "GET /api/account/referrals must exist and answer the D18 gate");
      const body = await response.json();
      assert.equal(body.referrerGate?.complete, false, "GET /api/account/referrals must report the D18 gate as incomplete");
      assert.equal(body.code, null, "a code must be withheld until the payout details exist");
    });

    await t.test("AC-1 — completing the details issues a code, permanent thereafter", async () => {
      const session = new Session(baseUrl);
      await login(session, "/api/auth", "gate.complete@example.com");
      // Seeded directly: the payout-details endpoint is a later red in this same
      // ticket, and the code-issuing rule does not depend on how the details
      // arrived — only on their being stored.
      await sql(
        `UPDATE user SET abn='51824753556', payout_bsb='063000',
           payout_account_number='12345678', payout_account_name='A Tradie'
         WHERE email='gate.complete@example.com'`,
      );

      const first = await requestJson(session, "/api/account/referrals");
      assert.equal(first.body.referrerGate.complete, true, "with all four details stored the D18 gate must report complete");
      assert.match(
        String(first.body.code),
        /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}$/,
        "a payable account must be issued a real code",
      );

      // Only the ISSUE moment moves behind the gate. Once issued the code is
      // permanent: a tradie who has already read it out to a mate must never
      // find it changed underneath them.
      const second = await requestJson(session, "/api/account/referrals");
      assert.equal(second.body.code, first.body.code, "a code, once issued, never changes");
    });


  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
