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
  requestJson, run, staffEmail, start, stop, viteCli, waitForUrl, wranglerCli,
} from "./helpers.mjs";

// The referral program's migrations, in order. 0051 creates the four tables;
// 0052 adds the "one earning per referral" UNIQUE index that A8's first-order
// rule always implied and 0051 encoded only per ORDER. The AC-49c proof spans
// the SET rather than one file: what the criterion protects is that turning the
// referral program on disturbs no stored price, and that promise is about the
// whole tail, not about whichever file happens to be last today.
const MIGRATIONS = ["0051_referral_program.sql", "0052_referral_earning_one_per_referral.sql"];
const FIRST_MIGRATION = MIGRATIONS[0];

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
    // Everything BELOW the referral set, not "everything except it". Filtering by
    // name would copy 0052 into a directory with no 0051 in it, and 0052 indexes
    // a table 0051 creates — the "before" database would fail to build at all.
    for (const file of allMigrations.filter((f) => f < FIRST_MIGRATION)) {
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

    await t.test("the referral migrations are the append-only tail of the directory", async () => {
      for (const m of MIGRATIONS) assert.ok(allMigrations.includes(m), `migrations/${m} does not exist`);
      assert.deepEqual(
        allMigrations.slice(-MIGRATIONS.length), MIGRATIONS,
        "migrations are append-only; something has been numbered into or past the referral set",
      );
      const applied = await sql(`SELECT name FROM d1_migrations ORDER BY id DESC LIMIT ${MIGRATIONS.length}`);
      assert.deepEqual(
        applied.map((r) => r.name).reverse(), MIGRATIONS,
        "the referral migrations were applied by the migration runner, not by hand",
      );
    });

    await t.test("AC-49c — applying the referral migrations leaves every stored price bitwise unchanged", () => {
      // Guard the guard: an empty database would make this pass vacuously.
      const quoteLines = before.find((r) => r.metric === "quote_line.line_total");
      assert.ok(quoteLines.row_count > 0, "the seeded database has priced quote lines to disturb");
      assert.notEqual(quoteLines.sum_cents, 0, "those lines carry real money");
      assert.deepEqual(after, before, "a referral migration moved a stored price — see scripts/db/price-checksums.sql");
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
      // referral-discount.ts is bundled alongside because it is the LEAF that owns
      // the review-flag rules — the module pricing can import without closing the
      // pricing→referrals→lines→pricing cycle.
      contents: `export * from ${JSON.stringify(join(projectRoot, "worker/lib/referrals.ts"))};\n`
        + `export * from ${JSON.stringify(join(projectRoot, "worker/lib/referral-discount.ts"))};`,
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

  await t.test("AC-58 — the review-flag rules are one function, not two copies", () => {
    // They existed verbatim in referral-discount.ts and in the ops list route.
    // That already cost something once: removing the postcode flag had to be done
    // in both places, and the next change gets made in one. These flags decide
    // what a human is told before they price a job — the one control standing
    // between a self-referral and a discount — so the two surfaces disagreeing is
    // a reviewer seeing a flag on one screen and not the other.
    assert.equal(typeof M.referralReviewFlags, "function", "referral-discount.ts must export referralReviewFlags");

    const referrer = { abn: "51 824 753 556", phone: "0400 111 222", company: "Kirra Glazing" };
    assert.deepEqual(M.referralReviewFlags(referrer, { ...referrer }), ["abn", "phone", "business_name"],
      "the same business on both sides raises all three");
    assert.deepEqual(M.referralReviewFlags(referrer, { abn: "53004085616", phone: "0499 000 111", company: "Other Glass" }), [],
      "two unrelated tradies raise nothing");

    // Normalisation is the substance of each rule, not decoration: people write an
    // ABN and a phone number however they like, and a flag that only fires on an
    // exact string match is a flag that never fires.
    assert.deepEqual(
      M.referralReviewFlags({ abn: "51824753556" }, { abn: "51 824 753 556" }), ["abn"],
      "spacing is how humans write an ABN",
    );
    assert.deepEqual(
      M.referralReviewFlags({ phone: "0400-111-222" }, { phone: "0400 111 222" }), ["phone"],
      "and punctuation is how they write a phone number",
    );
    assert.deepEqual(
      M.referralReviewFlags({ company: "Kirra Glazing" }, { company: "kirra  glazing" }), ["business_name"],
      "a business name matches on case and spacing, but its digits are not stripped",
    );

    // Empty is not a match. Two accounts that have both left a field blank are not
    // evidence of anything, and a flag that fires on them teaches the reviewer to
    // skim past the ones that mean something.
    assert.deepEqual(M.referralReviewFlags({ abn: "", phone: null, company: undefined }, { abn: "", phone: null }), [],
      "two blanks are not a match");

    // NO POSTCODE FLAG, though the spec lists one. There is no account-level
    // address; postcode lives on a project as a delivery destination, and for a
    // Melbourne trade supplier "delivered to the same suburb" is constantly true.
    assert.equal(
      M.referralReviewFlags({ postcode: "3000" }, { postcode: "3000" }).length, 0,
      "a postcode is about a job site, not about either business",
    );
  });

  await t.test("AC-19 — the advertised cap is arithmetic, not decoration", () => {
    // /refer and the join flow both promise "the most you can earn on any one
    // referral is $X" from this figure. A cap that is snapshotted, published and
    // rendered but never subtracted is an advertised maximum the engine ignores —
    // which is the misleading-conduct shape, not merely an overpayment.
    assert.equal(typeof M.earningAmount, "function", "referrals.ts must export earningAmount");

    // $9,090.91 ex-GST goods at 1% — the figure the AC-16 order test produces.
    assert.equal(M.earningAmount(9090.91, 1, null), 90.91, "NULL is uncapped, and stays uncapped");
    assert.equal(M.earningAmount(9090.91, 1, undefined), 90.91, "and so is an absent cap");
    assert.equal(M.earningAmount(9090.91, 5, 100), 100, "over the cap earns exactly the cap, to the cent");
    assert.equal(M.earningAmount(9090.91, 1, 100), 90.91, "under the cap is untouched — a cap is a ceiling, not a rate");
    // ⚠️ NULL IS NOT 0. Blank in the ops field means "render no cap clause at
    // all"; a typed 0 means "capped at nothing". They are different promises and
    // must stay different values.
    assert.equal(M.earningAmount(9090.91, 1, 0), 0, "a cap of 0 is a real cap of zero");
  });

  await t.test("AC-43/§10A.2 — the payout email is never handed the bank digits", () => {
    // The function takes the WHOLE payout group, because that is what the run
    // holds, and hands on four facts. A compromised or mis-authored Sanity
    // template cannot interpolate what it was never given — which is a property
    // of this function rather than a rule someone has to remember at the call
    // site, and this is the test that keeps it one.
    assert.equal(typeof M.payoutPaidNotification, "function", "referrals.ts must export payoutPaidNotification");
    const opts = M.payoutPaidNotification(
      {
        userId: "u-1", email: "queue.referrer@example.com", name: "Queue Glazing", amount: 181.82,
        abn: "51824753556", bsb: "063000", accountNumber: "12345678", accountName: "Queue Glazing",
        earningIds: ["e-1", "e-2"], referralRefs: ["ABC-234", "ABC-234"],
      },
      "TFR-99321",
      "2026-08-17T03:04:05.000Z",
    );

    assert.equal(opts.recipient, "queue.referrer@example.com");
    assert.equal(opts.eventType, "referral.paid");
    assert.equal(opts.templateKey, "referral_payout_sent", "the naming the other four referral templates use");

    const vars = JSON.stringify(opts.vars);
    for (const secret of ["063000", "12345678", "51824753556"]) {
      assert.equal(vars.includes(secret), false, `the template vars must never carry ${secret}`);
    }
    // What it MAY carry, and must: the three facts that let someone match this
    // against their own bank statement.
    assert.match(vars, /181\.82/, "the amount transferred belongs in the email");
    assert.match(vars, /TFR-99321/, "and the bank reference, which is how it is found");
    assert.match(vars, /2026-08-17/, "and the date it went out");
    // The inline fallback is what sends when Sanity is unreachable, so it is
    // held to the same rule as the template it stands in for.
    const fallback = JSON.stringify(opts.email);
    for (const secret of ["063000", "12345678", "51824753556"]) {
      assert.equal(fallback.includes(secret), false, `the fallback copy must never carry ${secret} either`);
    }
  });

  await t.test("AC-42 — the payout CSV survives Excel, and refuses to become a formula", () => {
    assert.equal(typeof M.formatPayoutCsv, "function", "referrals.ts must export formatPayoutCsv");
    const csv = M.formatPayoutCsv([
      {
        userId: "u-1", email: "a@example.com", name: "Queue Glazing", amount: 181.82,
        // A real account number with a leading zero, and an account name typed by
        // the person being paid — the one field on this row an attacker controls.
        abn: "51824753556", bsb: "063000", accountNumber: "00123456",
        accountName: "=cmd|' /c calc'!A1", earningIds: ["e1"], referralRefs: ["ABC-234", "XYZ-789"],
      },
      {
        userId: "u-2", email: "b@example.com", name: 'Ross "Rossco" Glass, Pty', amount: 40,
        abn: null, bsb: null, accountNumber: null, accountName: null,
        earningIds: ["e2"], referralRefs: ["QRS-111"],
      },
    ]);

    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    assert.equal(lines.length, 3, "a header and one line per referrer");
    assert.match(lines[0], /^Name,ABN,BSB,Account number,Account name,Amount,Referral references$/,
      "the columns the design's §9 names, in that order");

    // A dropped leading zero is a transfer to the wrong account, and a long
    // account number rendered as 1.2E+08 is a transfer to nothing at all.
    assert.ok(lines[1].includes('="00123456"'), "the account number is handed over as text, zeros intact");
    assert.ok(lines[1].includes('="063000"'), "and so is the BSB");
    assert.ok(lines[1].includes('="51824753556"'), "and the ABN");

    // The injection surface. A cell opening with = + - or @ executes in Excel,
    // Sheets and LibreOffice alike.
    assert.equal(lines[1].includes('"=cmd'), false, "a leading = must not survive into a cell");
    assert.ok(lines[1].includes(`"'=cmd`), "it is neutralised, not silently dropped");

    assert.ok(lines[1].includes(",181.82,"), "the amount stays a bare number, so a column of them sums");
    assert.ok(lines[1].includes('"ABC-234; XYZ-789"'), "every referral this transfer covers, in one cell");

    // Ordinary punctuation must not shear the row into extra columns.
    assert.ok(lines[2].includes('"Ross ""Rossco"" Glass, Pty"'), "commas and quotes are escaped, not mangled");
    assert.ok(csv.startsWith("﻿"), "a BOM, or Excel mis-reads a business name with an accent in it");
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
      // The sweep is cron work, and cron is not something a test can wait for.
      // --test-scheduled exposes the scheduled handler over HTTP so it can be
      // driven deliberately — the real handler, not a copy of it wired for tests.
      "--test-scheduled",
      "--persist-to", state, "--assets", assets, "--log-level", "warn",
      "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:", "--var", "SANITY_PROJECT_ID:", "--var", "AI_EXTRACTION_MODE:manual",
    ], { env: wranglerEnv });
    await waitForUrl(`${baseUrl}/api/health`, server);

    // ONE staff session for the whole block. The OTP challenge is capped per
    // address per window (MAX_CHALLENGES_PER_WINDOW), so a fresh staff login in
    // every test trips the limit partway through the suite — and it fails as
    // "no development OTP returned", which reads like a broken harness rather
    // than a rate limit doing its job.
    const staff = new Session(baseUrl);
    await login(staff, "/api/auth", staffEmail);

    /** Attach a code to an account the way the product now allows it: a staff
     *  member acting on an account request that carried the code (A19, AC-106).
     *
     *  ⚠️ THIS IS THE ONLY REMAINING WAY TO ATTACH A CODE TO A NAMED ACCOUNT, and
     *  that is why so much of this file goes through it. The customer's own claim
     *  endpoint was deleted in revision 12 (A5, AC-107); the other live path is
     *  the `of_ref` cookie, which only fires inside account CREATION and so cannot
     *  be used to set up an account a test already logged in as.
     *
     *  It runs the identical `recordReferral` gates, so the refusal reasons below
     *  are the same rules the cookie path enforces — but they arrive as the ops
     *  route's specific errors rather than the deliberately vague customer ones. */
    const linkCode = (email, code, expected = 200) =>
      requestJson(staff, "/api/ops/referrals/link", { method: "POST", json: { email, code } }, expected);

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

    await t.test("payout details are stored, and the log records the fact without the numbers", async () => {
      // The entry step, end to end. Every code test until now seeded the user row
      // directly; this is the path a real referrer takes, and it is the only one
      // that exercises the access log at all.
      const session = new Session(baseUrl);
      await login(session, "/api/auth", "payout.save@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='payout.save@example.com'");

      const saved = await requestJson(session, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      assert.equal(saved.body.referrerGate.complete, true, "PUT /api/account/payout-details must complete the D18 gate");

      const stored = await sql("SELECT payout_bsb, payout_account_number, payout_account_name FROM user WHERE email='payout.save@example.com'");
      assert.equal(stored[0].payout_bsb, "063000", "a BSB is stored as digits — humans type the hyphen");
      assert.equal(stored[0].payout_account_number, "12345678");
      assert.equal(stored[0].payout_account_name, "A Tradie");

      const log = await sql(
        `SELECT action, context FROM payout_details_access
          WHERE subject_user_id = (SELECT id FROM user WHERE email='payout.save@example.com')`,
      );
      assert.equal(log.length, 1, "changing payout details must write exactly one access row");
      assert.equal(log[0].action, "change");
      // Copying the details into a log in order to protect the details is
      // self-defeating. The row records WHO, WHICH RECORD and WHEN — never the value.
      assert.equal(/12345678/.test(JSON.stringify(log[0])), false, "the access log must never contain the account number");
      assert.equal(/063000/.test(JSON.stringify(log[0])), false, "nor the BSB");
    });

    await t.test("AC-8 — Ops linking a code at account creation records the referral, promise frozen onto it", async () => {
      // A19. The normal path: the applicant wrote the code on their trade account
      // request and a staff member transcribes it. `source` is 'manual' because
      // that is exactly what happened — a human typed it — and it needed no new
      // provenance value and no migration.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "claim.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='claim.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");
      assert.match(mine.code, /^[A-Z2-9]{3}-[A-Z2-9]{3}$/, "the referrer must hold a code to be linkable");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "claim.mate@example.com");
      // linkCode throws unless the status matches, so reaching the next line IS
      // the acceptance assertion — a 400 here would surface as its error text.
      await linkCode("claim.mate@example.com", mine.code);

      const rows = await sql(
        `SELECT source, status, rate_percent, discount_percent, min_order_amount, window_months, expires_at
           FROM referral
          WHERE referred_user_id = (SELECT id FROM user WHERE email='claim.mate@example.com')`,
      );
      assert.equal(rows.length, 1, "exactly one referral row");
      assert.equal(rows[0].source, "manual");
      assert.equal(rows[0].status, "recorded");
      // M10: the promise is frozen onto the relationship at the moment it is made.
      // Changing the rate in ops later must never move what someone was already
      // promised, so these come from the row and never from the live config.
      assert.equal(rows[0].rate_percent, 1);
      assert.equal(rows[0].discount_percent, 2.5);
      assert.equal(rows[0].min_order_amount, 2000);
      assert.equal(rows[0].window_months, 12);
      assert.ok(rows[0].expires_at > new Date().toISOString().slice(0, 10), "and it expires in the future");
    });

    await t.test("AC-10/AC-11/AC-106 — the link is refused on the applicant's own code, an unknown one, or a second time", async () => {
      // Three refusals that share one setup. Each is a distinct rule, but they are
      // one behaviour from the operator's side — "this link does not take" — and
      // the enumerated error is what tells the staff member whether to ring the
      // applicant back or drop it (AC-106: each refused with its specific reason).
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "gates.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='gates.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      // A11 — you cannot refer yourself. The table also has a CHECK, but a
      // constraint violation is a 500; the rule has to be answered, not thrown.
      const own = await linkCode("gates.referrer@example.com", mine.code, 400);
      assert.equal(own.body.error, "own_code");

      // An unknown code is refused the same way a dormant or staff-owned one is.
      // The refusal is only specific about WHICH RULE, never about whose code it
      // was: a stranger must not be able to sort real codes from invented ones,
      // nor learn that a referrer has removed their bank details.
      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "gates.mate@example.com");
      const unknown = await linkCode("gates.mate@example.com", "ZZZ-ZZZ", 400);
      assert.equal(unknown.body.error, "invalid_code");

      // A9 — one referral per account, permanently. First recorded wins; a second
      // code is refused rather than overwriting a relationship already promised.
      await linkCode("gates.mate@example.com", mine.code);
      const second = await linkCode("gates.mate@example.com", mine.code, 400);
      assert.equal(second.body.error, "already_referred");
      const rows = await sql(
        `SELECT id FROM referral WHERE referred_user_id = (SELECT id FROM user WHERE email='gates.mate@example.com')`,
      );
      assert.equal(rows.length, 1, "and no second row is written");
    });

    await t.test("AC-84 — a code whose owner cannot be paid is refused as if it never existed", async () => {
      // ADR-8b. Two ways a real code stops working: its owner removed their bank
      // details, or it belongs to a staff account. Both answer invalid_code, the
      // same as a code that was never issued.
      //
      // The sameness is the security property. A distinct "that referrer can't be
      // paid right now" would tell a third party something about someone else's
      // banking status, and it would let a stranger sort real codes from invented
      // ones by the shape of the refusal.
      const dormant = new Session(baseUrl);
      await login(dormant, "/api/auth", "dormant.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='dormant.referrer@example.com'");
      await requestJson(dormant, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: issued } = await requestJson(dormant, "/api/account/referrals");
      await sql("UPDATE user SET payout_bsb=NULL WHERE email='dormant.referrer@example.com'");

      const mateA = new Session(baseUrl);
      await login(mateA, "/api/auth", "dormant.mate@example.com");
      const refused = await linkCode("dormant.mate@example.com", issued.code, 400);
      assert.equal(refused.body.error, "invalid_code", "a dormant code must not be distinguishable");

      // A14 — staff cannot be a referrer. The code is planted directly because no
      // endpoint would ever issue one to an internal account (AC-5).
      const planted = new Session(baseUrl);
      await login(planted, "/api/auth", "staffcode.owner@example.com");
      await sql(
        `UPDATE user SET type='internal', referral_code='STF-001', abn='51824753556',
           payout_bsb='063000', payout_account_number='12345678', payout_account_name='Staff'
         WHERE email='staffcode.owner@example.com'`,
      );
      const mateB = new Session(baseUrl);
      await login(mateB, "/api/auth", "staffcode.mate@example.com");
      const staffRefused = await linkCode("staffcode.mate@example.com", "STF-001", 400);
      assert.equal(staffRefused.body.error, "invalid_code", "nor a staff-owned one");
    });

    await t.test("AC-62 — while the program is off, nothing new is attributed", async () => {
      // Off means joining is paused: no new referrals recorded, no new codes
      // issued. It deliberately does NOT reach anything already promised — that
      // rule lives in the discount and earning paths, which never read this flag
      // at all, so a switch that is never consulted cannot be consulted wrongly.
      const joiner = new Session(baseUrl);
      await login(joiner, "/api/auth", "off.joiner@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='off.joiner@example.com'");
      await requestJson(joiner, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: live } = await requestJson(joiner, "/api/account/referrals");

      await sql("UPDATE referral_program SET active=0 WHERE id='default'");
      try {
        const mate = new Session(baseUrl);
        await login(mate, "/api/auth", "off.mate@example.com");
        // AC-62(a) — "no new referral is recorded by ANY path — cookie, or the
        // Ops link action". Status is one of recordReferral's gates, so the
        // privileged path is refused exactly like the automatic one.
        const refused = await linkCode("off.mate@example.com", live.code, 400);
        assert.equal(refused.body.error, "program_off");

        // And a payable account that had not yet asked gets no code while off.
        const late = new Session(baseUrl);
        await login(late, "/api/auth", "off.late@example.com");
        await sql(
          `UPDATE user SET abn='51824753556', payout_bsb='063000',
             payout_account_number='12345678', payout_account_name='A Tradie'
           WHERE email='off.late@example.com'`,
        );
        const { body: none } = await requestJson(late, "/api/account/referrals");
        assert.equal(none.code, null, "joining is paused, so no code is issued");
      } finally {
        await sql("UPDATE referral_program SET active=1 WHERE id='default'");
      }
    });

    await t.test("AC-107 — there is no self-link endpoint, and no affordance that implies one", async () => {
      // A5, revision 12, owner-stated: "There is no surface and no endpoint by
      // which a customer attaches a referral to their own account, at any time,
      // in any account state."
      //
      // 404, NOT 401 AND NOT 405. The distinction is the whole criterion: a 401
      // says "sign in and this will work" and a 405 says "wrong verb" — both
      // describe a surface that exists and is merely closed to this caller. The
      // route has to be absent, because the removed UI plus a live endpoint is
      // exactly the state revision 12 was written to end: sign up, get quoted,
      // shop the price around, then claim a code the day before ordering.
      //
      // Driven by an AUTHENTICATED, unreferred, order-free caller — the one
      // account state under which the old endpoint returned 200 and wrote a row.
      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "noclaim.mate@example.com");
      const gone = await mate.request("/api/account/referrals/claim", {
        method: "POST", json: { code: "ABC-123" },
      });
      assert.equal(gone.status, 404, "the route does not exist");

      // And the screen carries no flag that would tell a client to render such a
      // field. `canEnterCode` was the server side of the deleted surface: while
      // it is served, a client can be written against it, and the answer it gives
      // ("yes, this account may type a code") is one the product no longer has.
      const { body: screen } = await requestJson(mate, "/api/account/referrals");
      assert.equal(
        "canEnterCode" in screen, false,
        `the referrer screen must not advertise a code-entry affordance (${JSON.stringify(Object.keys(screen))})`,
      );
    });

    await t.test("AC-108 — not even Ops can attach a code to an account that has already bought", async () => {
      // ⚠️ THIS IS NOT THE OLD AC-9. That criterion described the customer's own
      // manual-entry surface and was STRUCK in revision 12 along with the surface
      // (A5). What survives is the gate itself, now guarding the only transcribing
      // path left — and it is worth more there, because the Ops link is the one
      // remaining way to attach a code to a named, preexisting account.
      //
      // AC-108's governing rule is "if an account already exists, it is not a
      // referral", with the Ops link as the deliberate exception for an account
      // being CREATED. An account that has already placed an order is past that
      // moment by any reading: attributing it would reward an introduction that
      // demonstrably did not cause the sale, and it is the retro-attribution the
      // owner cut the self-link window to prevent. So the exception stops here,
      // and it stops for staff too — a privileged path that skipped this gate
      // would become the way around it.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "late.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='late.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const buyer = new Session(baseUrl);
      await login(buyer, "/api/auth", "late.buyer@example.com");
      await sql(
        `INSERT INTO project (id, owner_user_id) VALUES ('p-late', (SELECT id FROM user WHERE email='late.buyer@example.com'));
         INSERT INTO "order" (id, project_id, order_no) VALUES ('o-late', 'p-late', 'OF-O-LATE');`,
      );

      const refused = await linkCode("late.buyer@example.com", mine.code, 400);
      assert.equal(refused.body.error, "has_order");
      const rows = await sql(
        `SELECT id FROM referral WHERE referred_user_id = (SELECT id FROM user WHERE email='late.buyer@example.com')`,
      );
      assert.equal(rows.length, 0, "and nothing is recorded");
    });

    await t.test("AC-12 — two logins for one business is not a referral", async () => {
      // A13. Compared on digits only, because people write an ABN with spaces.
      //
      // This gate is narrower than it looks and the spec says so plainly: it can
      // only fire when BOTH sides have an ABN, and the referred side usually has
      // none at signup. It does not prevent self-referral — the ABR confirms one
      // person may legitimately hold several ABNs — it removes the laziest version
      // of it. What actually contains the rest is that no price leaves this
      // business without a human reviewing it.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "abn.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='abn.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const sameAbn = new Session(baseUrl);
      await login(sameAbn, "/api/auth", "abn.same@example.com");
      // Spaced differently on purpose: the same business, typed by a human.
      await sql("UPDATE user SET abn='51 824 753 556' WHERE email='abn.same@example.com'");
      const refused = await linkCode("abn.same@example.com", mine.code, 400);
      // Deliberately unspecific even here. Naming the ABN match would tell an
      // operator — who may be reading the reason out to the applicant on the
      // phone — exactly which check to route around next time.
      assert.equal(refused.body.error, "not_eligible");

      // A different ABN is an ordinary referral and must still work.
      const otherAbn = new Session(baseUrl);
      await login(otherAbn, "/api/auth", "abn.other@example.com");
      await sql("UPDATE user SET abn='53004085616' WHERE email='abn.other@example.com'");
      await linkCode("abn.other@example.com", mine.code);
      const rows = await sql(
        `SELECT id FROM referral WHERE referred_user_id = (SELECT id FROM user WHERE email='abn.other@example.com')`,
      );
      assert.equal(rows.length, 1, "a different business is a real referral");
    });

    await t.test("AC-7 — the link records at signup, and never for someone who already exists", async () => {
      // REGRESSION-CRITICAL. An existing customer clicking a mate's link is not a
      // referral and never can be — they were already ours. The guarantee is
      // structural rather than a check: only the branch of findOrCreateUser that
      // CREATES a row records anything, so there is no path where an existing
      // account could be attributed, however the cookie got there.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "link.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='link.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      // A brand-new account arriving with the cookie: recorded, source 'link'.
      const fresh = new Session(baseUrl);
      fresh.cookies.set("of_ref", mine.code);
      await login(fresh, "/api/auth", "link.fresh@example.com");
      const recorded = await sql(
        `SELECT source FROM referral WHERE referred_user_id = (SELECT id FROM user WHERE email='link.fresh@example.com')`,
      );
      assert.equal(recorded.length, 1, "a new account arriving on a link is a referral");
      assert.equal(recorded[0].source, "link");

      // The same cookie, an account that already existed: nothing, ever.
      const returning = new Session(baseUrl);
      await login(returning, "/api/auth", "link.returning@example.com");
      const again = new Session(baseUrl);
      again.cookies.set("of_ref", mine.code);
      await login(again, "/api/auth", "link.returning@example.com");
      const none = await sql(
        `SELECT id FROM referral WHERE referred_user_id = (SELECT id FROM user WHERE email='link.returning@example.com')`,
      );
      assert.equal(none.length, 0, "an existing customer clicking a referral link records nothing");
    });

    await t.test("§6.2 — a referral that blows up never costs someone their sign-in", async () => {
      // The hook runs AFTER the account row exists and BEFORE the session is
      // created. An exception there fails the whole of /verify: the customer
      // cannot log in, and when they retry, the retry takes the existing-user
      // branch — which by design never looks at a code (AC-7). So one transient
      // database error costs the sign-in AND loses the attribution permanently.
      //
      // Injected for real rather than reasoned about. A trigger that makes the
      // referral INSERT fail is the exact shape of the transient error, and it is
      // reachable no other way from outside the Worker.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "boom.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='boom.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      await sql(
        `CREATE TRIGGER referral_boom BEFORE INSERT ON referral
           BEGIN SELECT RAISE(FAIL, 'transient'); END`,
      );
      try {
        const fresh = new Session(baseUrl);
        fresh.cookies.set("of_ref", mine.code);
        const headers = { "X-Forwarded-For": "198.19.7.1" };
        const { body: challenge } = await requestJson(fresh, "/api/auth/challenge",
          { method: "POST", json: { email: "boom.mate@example.com" }, headers });
        const verify = await fresh.request("/api/auth/verify", {
          method: "POST", json: { email: "boom.mate@example.com", code: challenge.devCode }, headers,
        });

        assert.equal(verify.status, 200, "a failed attribution must not fail the sign-in");
        assert.equal((await verify.json()).authenticated, true, "they are signed in, not left at the door");
        assert.match(verify.headers.get("set-cookie") ?? "", /apertly_session=/,
          "and the session cookie is actually issued — the hook sits before it");
      } finally {
        await sql("DROP TRIGGER IF EXISTS referral_boom");
      }

      // The attribution is the thing that is lost, and losing it silently is the
      // accepted cost. Losing the customer's ability to log in is not.
      const none = await sql(
        `SELECT id FROM referral WHERE referred_user_id = (SELECT id FROM user WHERE email='boom.mate@example.com')`,
      );
      assert.equal(none.length, 0, "nothing was written, which is what makes the sign-in the only casualty to avoid");
    });

    await t.test("AC-4/AC-89 — /r/<CODE> sets the cookie, redirects, and stays out of the index", async () => {
      // The link half of attribution. It sets a cookie and sends the visitor to
      // the offer; the recording happens later, at signup, through the same
      // function the typed path uses.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "rlink.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='rlink.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const visitor = await fetch(new URL(`/r/${mine.code}`, baseUrl), { redirect: "manual" });
      assert.equal(visitor.status, 302);
      assert.equal(visitor.headers.get("location"), "/refer");
      const setCookie = visitor.headers.get("set-cookie") ?? "";
      assert.match(setCookie, new RegExp(`of_ref=${mine.code}`), "the code travels in the cookie");
      assert.match(setCookie, /HttpOnly/i, "and is not readable by script");
      // AC-89. One per member, pasted into WhatsApp and forums — exactly where a
      // crawler finds links. Deliberately still crawlable rather than disallowed in
      // robots.txt: a disallow would stop this header being read at all, and a
      // widely-shared blocked URL can still reach the index with no content.
      assert.equal(visitor.headers.get("x-robots-tag"), "noindex");

      // An unknown code redirects identically and sets nothing. Sameness again:
      // a probe must not be able to sort real codes from invented ones.
      const bogus = await fetch(new URL("/r/ZZZ-ZZZ", baseUrl), { redirect: "manual" });
      assert.equal(bogus.status, 302);
      assert.equal(bogus.headers.get("location"), "/refer");
      assert.doesNotMatch(bogus.headers.get("set-cookie") ?? "", /of_ref=/, "an invented code sets no cookie");
    });

    await t.test("AC-83 — the gate says WHICH detail is missing, not just that one is", async () => {
      // Under D18 this is the primary entry state for every new referrer, not an
      // error. "Add your ABN" and "you are not eligible" are different sentences,
      // and a bare complete:false cannot tell the screen which to say.
      const joining = new Session(baseUrl);
      await login(joining, "/api/auth", "missing.joiner@example.com");

      const { body: empty } = await requestJson(joining, "/api/account/referrals");
      assert.equal(empty.referrerGate.complete, false);
      assert.deepEqual(empty.referrerGate.missing, ["abn", "bank_details"]);

      await sql("UPDATE user SET abn='51824753556' WHERE email='missing.joiner@example.com'");
      const { body: half } = await requestJson(joining, "/api/account/referrals");
      assert.deepEqual(half.referrerGate.missing, ["bank_details"], "an ABN alone leaves the bank details");

      await requestJson(joining, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: done } = await requestJson(joining, "/api/account/referrals");
      assert.equal(done.referrerGate.complete, true);
      assert.deepEqual(done.referrerGate.missing, [], "and nothing is outstanding once they are in");
    });

    await t.test("AC-16/AC-19 — the referred first order creates a pending earning", async () => {
      // The money half begins here. The earning is created when the order is —
      // the customer accepted a quote — but it is only PENDING: nothing becomes
      // payable until that order is paid in full.
      //
      // base_amount is the ex-GST goods figure, excluding delivery, and it comes
      // from the same per-line taxable-supply rule the customer's own order screen
      // renders. A fresh /1.1 here would disagree with that screen by cents.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "earn.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='earn.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "earn.mate@example.com");
      await linkCode("earn.mate@example.com", mine.code);

      // An issued quote of their own, accepted the way a customer accepts one —
      // the real path, so the hook is exercised where it actually hangs rather
      // than through a seam invented for the test.
      await sql(
        `INSERT INTO project
           (id, owner_user_id, title, public_ref, status_customer, status_internal, delivery_amount)
         VALUES
           ('p-earn', (SELECT id FROM user WHERE email='earn.mate@example.com'),
            'Earning quote','OF-Q-88001','quote_issued','issued',1000);
         INSERT INTO quote_line
           (id, project_id, external_ref, product_slug, dims_json, options_json, qty, line_total, status, position)
         VALUES
           ('ql-earn','p-earn','W01','amj80-series-awning-window',
            '{"width":"900","height":"1200"}','{}',1,10000,'ready',0);`,
      );
      await requestJson(mate, "/api/projects/p-earn/accept", { method: "POST" });

      const rows = await sql(
        `SELECT e.status, e.base_amount, e.rate_percent, e.amount
           FROM referral_earning e JOIN "order" o ON o.id = e.order_id
          WHERE o.project_id = 'p-earn'`,
      );
      assert.equal(rows.length, 1, "exactly one earning per order, ever");
      assert.equal(rows[0].status, "pending", "created on the order, not payable until it is paid");
      // $10,000 inc GST of goods, delivery excluded entirely → $9,090.91 ex GST.
      assert.equal(rows[0].base_amount, 9090.91, "ex-GST goods only, and never the delivery");
      // The rate is copied from the referral's snapshot, not re-read from config.
      assert.equal(rows[0].rate_percent, 1);
      assert.equal(rows[0].amount, 90.91);
    });

    await t.test("AC-19/AC-23 — the cap that applies is the one snapshotted, not today's", async () => {
      // The cap is set BEFORE the introduction is made and raised afterwards. What
      // the referrer was told at the time is what governs — the same rule the
      // qualifying minimum already follows, and the reason every figure is frozen
      // onto the referral row rather than read live at payout.
      await sql("UPDATE referral_program SET cap_amount = 50 WHERE id = 'default'");
      try {
        const referrer = new Session(baseUrl);
        await login(referrer, "/api/auth", "cap.referrer@example.com");
        await sql("UPDATE user SET abn='51824753556' WHERE email='cap.referrer@example.com'");
        await requestJson(referrer, "/api/account/payout-details", {
          method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
        });
        const { body: mine } = await requestJson(referrer, "/api/account/referrals");

        const mate = new Session(baseUrl);
        await login(mate, "/api/auth", "cap.mate@example.com");
        await linkCode("cap.mate@example.com", mine.code);

        const snapshot = await sql(
          `SELECT cap_amount FROM referral
            WHERE referred_user_id = (SELECT id FROM user WHERE email='cap.mate@example.com')`,
        );
        assert.equal(snapshot[0].cap_amount, 50, "the cap is frozen onto the referral when it is recorded");

        // Ops raises it after the fact. Nothing already promised may move.
        await sql("UPDATE referral_program SET cap_amount = 500 WHERE id = 'default'");

        await sql(
          `INSERT INTO project
             (id, owner_user_id, title, public_ref, status_customer, status_internal, delivery_amount)
           VALUES ('p-cap', (SELECT id FROM user WHERE email='cap.mate@example.com'),
                   'Capped quote','OF-Q-88031','quote_issued','issued',0);
           INSERT INTO quote_line
             (id, project_id, external_ref, product_slug, dims_json, options_json, qty, line_total, status, position)
           VALUES ('ql-cap','p-cap','W01','amj80-series-awning-window',
                   '{"width":"900","height":"1200"}','{}',1,10000,'ready',0);`,
        );
        await requestJson(mate, "/api/projects/p-cap/accept", { method: "POST" });

        const rows = await sql(
          `SELECT e.base_amount, e.amount, e.status FROM referral_earning e
             JOIN "order" o ON o.id = e.order_id WHERE o.project_id = 'p-cap'`,
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0].base_amount, 9090.91, "the base is unaffected by the ceiling above it");
        // 1% of $9,090.91 is $90.91, and the referrer was promised at most $50.
        assert.equal(rows[0].amount, 50, "an over-cap order earns exactly the cap that was advertised to them");
        assert.equal(rows[0].status, "pending", "capped is not the same as disqualified");
      } finally {
        // Left set, every later referral in this file would snapshot a cap and the
        // queue arithmetic below would quietly become a test of something else.
        await sql("UPDATE referral_program SET cap_amount = NULL WHERE id = 'default'");
      }
    });

    await t.test("AC-22 — a second order earns nothing more; the commission is the FIRST order only", async () => {
      // A8: "Scope: FIRST ORDER ONLY, for BOTH the commission and the discount."
      // The discount half is derived and correct — referralDiscountState reads the
      // account's earliest order and reports `used` from then on. The commission
      // half has no such guard: onOrderCreated finds the referral by
      // `referred_user_id AND status='recorded'` and inserts, and the only
      // uniqueness in the schema is on `order_id`, which a second order never
      // collides with. So every order that account ever places inside the
      // attribution window mints another earning at the snapshot rate, each one
      // confirming at balance_paid and arriving in the payout queue as money to
      // send. One introduction, paid for forever.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "second.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='second.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "second.mate@example.com");
      // Through the Ops link action, which is the path A19 leaves open — not the
      // customer claim endpoint, whose very existence is a separate finding.
      await requestJson(staff, "/api/ops/referrals/link", {
        method: "POST", json: { email: "second.mate@example.com", code: mine.code },
      });

      for (const [id, ref] of [["p-2nd-a", "OF-Q-88041"], ["p-2nd-b", "OF-Q-88042"]]) {
        await sql(
          `INSERT INTO project
             (id, owner_user_id, title, public_ref, status_customer, status_internal, delivery_amount)
           VALUES ('${id}', (SELECT id FROM user WHERE email='second.mate@example.com'),
                   'Second-order job','${ref}','quote_issued','issued',0);
           INSERT INTO quote_line
             (id, project_id, external_ref, product_slug, dims_json, options_json, qty, line_total, status, position)
           VALUES ('ql-${id}','${id}','W01','amj80-series-awning-window',
                   '{"width":"900","height":"1200"}','{}',1,10000,'ready',0);`,
        );
        await requestJson(mate, `/api/projects/${id}/accept`, { method: "POST" });
      }

      // The discount half, for contrast: correct, and derived rather than stored.
      const { body: offer } = await requestJson(mate, "/api/account/referral-offer");
      assert.equal(offer.offer.state, "used", "eligibility ends at the FIRST order — this half is right");

      const earnings = await sql(
        `SELECT e.amount, e.status FROM referral_earning e
           JOIN referral r ON r.id = e.referral_id
          WHERE r.referred_user_id = (SELECT id FROM user WHERE email='second.mate@example.com')`,
      );
      assert.equal(
        earnings.length, 1,
        `one referral owes ONE commission, on the first order only — the second order minted another (${earnings.length} rows: ${JSON.stringify(earnings)})`,
      );
    });

    await t.test("AC-22/AC-60 — 'first order only' is about the ORDER, not about whether the first one paid", async () => {
      // ⚠️ THE CASE THAT SEPARATES THE TWO PLAUSIBLE GUARDS. "Has this referral
      // earned yet?" and "is this the account's first order?" agree everywhere
      // except here, and here the first one is wrong.
      //
      // AC-60: with `referrer_reward_active` off, referrals still record and
      // discounts still apply, but no commission is earned. So this mate's first
      // order mints no earning row at all. If the guard asked "has this referral
      // earned yet?" the answer would be no, and their SECOND order — placed
      // after the switch came back on — would earn the commission the first one
      // deliberately did not. One introduction, one order too late, full rate.
      //
      // A8 scopes the commission to the FIRST ORDER, full stop. An order that was
      // never the first cannot become it because the first one paid nothing.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "reward.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='reward.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "reward.mate@example.com");
      await linkCode("reward.mate@example.com", mine.code);

      const job = async (id, ref) => {
        await sql(
          `INSERT INTO project
             (id, owner_user_id, title, public_ref, status_customer, status_internal, delivery_amount)
           VALUES ('${id}', (SELECT id FROM user WHERE email='reward.mate@example.com'),
                   'Reward-switch job','${ref}','quote_issued','issued',0);
           INSERT INTO quote_line
             (id, project_id, external_ref, product_slug, dims_json, options_json, qty, line_total, status, position)
           VALUES ('ql-${id}','${id}','W01','amj80-series-awning-window',
                   '{"width":"900","height":"1200"}','{}',1,10000,'ready',0);`,
        );
        await requestJson(mate, `/api/projects/${id}/accept`, { method: "POST" });
      };

      await sql("UPDATE referral_program SET referrer_reward_active=0 WHERE id='default'");
      try {
        await job("p-rwd-a", "OF-Q-88051");
      } finally {
        await sql("UPDATE referral_program SET referrer_reward_active=1 WHERE id='default'");
      }
      const afterFirst = await sql(
        `SELECT e.id FROM referral_earning e JOIN referral r ON r.id = e.referral_id
          WHERE r.referred_user_id = (SELECT id FROM user WHERE email='reward.mate@example.com')`,
      );
      assert.equal(afterFirst.length, 0, "the reward side was off, so the first order earns nothing (AC-60)");

      await job("p-rwd-b", "OF-Q-88052");
      const afterSecond = await sql(
        `SELECT e.amount, e.order_id FROM referral_earning e JOIN referral r ON r.id = e.referral_id
          WHERE r.referred_user_id = (SELECT id FROM user WHERE email='reward.mate@example.com')`,
      );
      assert.equal(
        afterSecond.length, 0,
        `the second order was never the first, so it earns nothing either (${JSON.stringify(afterSecond)})`,
      );
    });

    await t.test("AC-20 — paid in full is the payability instant; a deposit is not", async () => {
      // M8. Full payment is the maturation, and it is a state the system already
      // tracks — so no hold period is invented and no clawback is needed: the
      // customer has paid before the referrer does.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "paid.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='paid.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "paid.mate@example.com");
      await linkCode("paid.mate@example.com", mine.code);
      await sql(
        `INSERT INTO project
           (id, owner_user_id, title, public_ref, status_customer, status_internal, delivery_amount)
         VALUES ('p-paid', (SELECT id FROM user WHERE email='paid.mate@example.com'),
                 'Paid quote','OF-Q-88002','quote_issued','issued',0);
         INSERT INTO quote_line
           (id, project_id, external_ref, product_slug, dims_json, options_json, qty, line_total, status, position)
         VALUES ('ql-paid','p-paid','W01','amj80-series-awning-window',
                 '{"width":"900","height":"1200"}','{}',1,10000,'ready',0);`,
      );
      await requestJson(mate, "/api/projects/p-paid/accept", { method: "POST" });
      const orderId = (await sql(`SELECT id FROM "order" WHERE project_id='p-paid'`))[0].id;

      // The deposit is paid. Nothing matures — the job is not done and the money
      // is not ours yet.
      await sql(`UPDATE "order" SET stage='deposit_invoiced' WHERE id='${orderId}'`);
      // Payments are recorded by staff, which is also the honest shape: the
      // referrer's money matures on an act inside the business, not a customer's.
      await requestJson(staff, `/api/orders/${orderId}/pay`, { method: "POST", json: { kind: "deposit" } });
      const afterDeposit = await sql(`SELECT status, confirmed_at FROM referral_earning WHERE order_id='${orderId}'`);
      assert.equal(afterDeposit[0].status, "pending", "a deposit does not make anything payable");
      assert.equal(afterDeposit[0].confirmed_at, null);

      // Paid in full. Now it is payable, and the instant is stamped, because that
      // is what the advertised payment window is measured from.
      await sql(`UPDATE "order" SET stage='balance_invoiced' WHERE id='${orderId}'`);
      await requestJson(staff, `/api/orders/${orderId}/pay`, { method: "POST", json: { kind: "balance" } });
      const afterBalance = await sql(`SELECT status, confirmed_at FROM referral_earning WHERE order_id='${orderId}'`);
      assert.equal(afterBalance[0].status, "confirmed", "paid in full is what makes it payable");
      assert.ok(afterBalance[0].confirmed_at, "and the payability instant is stamped");
    });

    await t.test("AC-28 — money held because the referrer cannot be paid stays pending", async () => {
      // ADR-8c, and the ONE reachable residue under D18. Details are a precondition
      // of joining, so a referrer is payable when the referral is recorded — but
      // they may clear them later, and the order they already earned on may be
      // paid afterwards.
      //
      // It stays PENDING rather than confirming, and that distinction carries the
      // weight: pending money is not yet payable, so Victoria's twelve-month
      // unclaimed-money clock never starts on money we are holding for someone we
      // cannot pay. Confirmed-but-unpayable is the state D18 exists to make
      // unreachable, and reintroducing it here would undo the whole decision.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "held.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='held.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "held.mate@example.com");
      await linkCode("held.mate@example.com", mine.code);
      await sql(
        `INSERT INTO project
           (id, owner_user_id, title, public_ref, status_customer, status_internal, delivery_amount)
         VALUES ('p-held', (SELECT id FROM user WHERE email='held.mate@example.com'),
                 'Held quote','OF-Q-88003','quote_issued','issued',0);
         INSERT INTO quote_line
           (id, project_id, external_ref, product_slug, dims_json, options_json, qty, line_total, status, position)
         VALUES ('ql-held','p-held','W01','amj80-series-awning-window',
                 '{"width":"900","height":"1200"}','{}',1,10000,'ready',0);`,
      );
      await requestJson(mate, "/api/projects/p-held/accept", { method: "POST" });
      const orderId = (await sql(`SELECT id FROM "order" WHERE project_id='p-held'`))[0].id;

      // They leave, or simply clear the account they were being paid into.
      await sql("UPDATE user SET payout_bsb=NULL WHERE email='held.referrer@example.com'");

      await sql(`UPDATE "order" SET stage='balance_invoiced' WHERE id='${orderId}'`);
      await requestJson(staff, `/api/orders/${orderId}/pay`, { method: "POST", json: { kind: "balance" } });

      const held = await sql(`SELECT status, confirmed_at FROM referral_earning WHERE order_id='${orderId}'`);
      assert.equal(held[0].status, "pending", "unpayable money must not become payable");
      assert.equal(held[0].confirmed_at, null, "and the payability clock must not start");
    });

    await t.test("AC-18 — an order under the minimum is recorded as void, not skipped", async () => {
      // The row is CREATED and voided rather than never written. A referrer whose
      // mate ordered $900 of windows should see "Not eligible" with a reason, not
      // a referral that appears to have silently evaporated — and ops needs
      // something to un-void when a judgement call goes the other way.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "small.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='small.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "small.mate@example.com");
      await linkCode("small.mate@example.com", mine.code);
      await sql(
        `INSERT INTO project
           (id, owner_user_id, title, public_ref, status_customer, status_internal, delivery_amount)
         VALUES ('p-small', (SELECT id FROM user WHERE email='small.mate@example.com'),
                 'Small quote','OF-Q-88004','quote_issued','issued',0);
         INSERT INTO quote_line
           (id, project_id, external_ref, product_slug, dims_json, options_json, qty, line_total, status, position)
         VALUES ('ql-small','p-small','W01','amj80-series-awning-window',
                 '{"width":"900","height":"1200"}','{}',1,1100,'ready',0);`,
      );
      await requestJson(mate, "/api/projects/p-small/accept", { method: "POST" });

      const rows = await sql(
        `SELECT e.status, e.void_reason, e.amount FROM referral_earning e
           JOIN "order" o ON o.id = e.order_id WHERE o.project_id = 'p-small'`,
      );
      assert.equal(rows.length, 1, "the row exists so the referrer can be told why");
      assert.equal(rows[0].status, "void");
      assert.equal(rows[0].void_reason, "below_minimum_order");
      assert.equal(rows[0].amount, 0, "and nothing is owed");
    });

    await t.test("AC-21 — a refunded order voids the earning instead of confirming it", async () => {
      // The guard is DERIVED rather than event-driven, because no live code path
      // cancels or refunds an order today — `payment_status` is vestigial, left
      // over from before `stage` superseded it. There is no event to subscribe to,
      // so the columns are read at the moment money would become payable.
      //
      // Which means this is a guard for a day that has not arrived. Building it
      // now costs a WHERE clause; retrofitting it the day refunds ship costs
      // finding every path that already paid out on money that came back.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "refund.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='refund.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "refund.mate@example.com");
      await linkCode("refund.mate@example.com", mine.code);
      await sql(
        `INSERT INTO project
           (id, owner_user_id, title, public_ref, status_customer, status_internal, delivery_amount)
         VALUES ('p-refund', (SELECT id FROM user WHERE email='refund.mate@example.com'),
                 'Refunded quote','OF-Q-88005','quote_issued','issued',0);
         INSERT INTO quote_line
           (id, project_id, external_ref, product_slug, dims_json, options_json, qty, line_total, status, position)
         VALUES ('ql-refund','p-refund','W01','amj80-series-awning-window',
                 '{"width":"900","height":"1200"}','{}',1,10000,'ready',0);`,
      );
      await requestJson(mate, "/api/projects/p-refund/accept", { method: "POST" });
      const orderId = (await sql(`SELECT id FROM "order" WHERE project_id='p-refund'`))[0].id;

      // The money came back. Set directly, because nothing in the product sets it
      // yet — that is exactly the point of a derived guard.
      await sql(`UPDATE "order" SET stage='balance_invoiced', payment_status='refunded' WHERE id='${orderId}'`);
      await requestJson(staff, `/api/orders/${orderId}/pay`, { method: "POST", json: { kind: "balance" } });

      const rows = await sql(`SELECT status, void_reason, confirmed_at FROM referral_earning WHERE order_id='${orderId}'`);
      assert.equal(rows[0].status, "void", "refunded money owes no commission");
      assert.equal(rows[0].void_reason, "order_refunded");
      assert.equal(rows[0].confirmed_at, null, "and it never became payable");
    });

    await t.test("AC-12 late limb — the ABN check runs again when money would move", async () => {
      // The recording-time check cannot fire when the referred side has no ABN
      // yet, and at signup they usually don't — it is a profile field they fill in
      // later, often at the point of ordering. So the same rule is asked again at
      // the moment money would actually move, which is the only moment it matters.
      //
      // Without this limb the gate is trivially defeated: sign up with a code,
      // add the ABN afterwards, order.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "late-abn.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='late-abn.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      // No ABN yet, so the recording-time check has nothing to compare and passes.
      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "late-abn.mate@example.com");
      await linkCode("late-abn.mate@example.com", mine.code);
      const recorded = await sql(
        `SELECT id FROM referral WHERE referred_user_id = (SELECT id FROM user WHERE email='late-abn.mate@example.com')`,
      );
      assert.equal(recorded.length, 1, "recorded, because there was nothing to compare yet");

      // The same ABN appears afterwards — the second login for one business.
      await sql("UPDATE user SET abn='51 824 753 556' WHERE email='late-abn.mate@example.com'");
      await sql(
        `INSERT INTO project
           (id, owner_user_id, title, public_ref, status_customer, status_internal, delivery_amount)
         VALUES ('p-lateabn', (SELECT id FROM user WHERE email='late-abn.mate@example.com'),
                 'Late ABN quote','OF-Q-88006','quote_issued','issued',0);
         INSERT INTO quote_line
           (id, project_id, external_ref, product_slug, dims_json, options_json, qty, line_total, status, position)
         VALUES ('ql-lateabn','p-lateabn','W01','amj80-series-awning-window',
                 '{"width":"900","height":"1200"}','{}',1,10000,'ready',0);`,
      );
      await requestJson(mate, "/api/projects/p-lateabn/accept", { method: "POST" });
      const orderId = (await sql(`SELECT id FROM "order" WHERE project_id='p-lateabn'`))[0].id;

      await sql(`UPDATE "order" SET stage='balance_invoiced' WHERE id='${orderId}'`);
      await requestJson(staff, `/api/orders/${orderId}/pay`, { method: "POST", json: { kind: "balance" } });

      const rows = await sql(`SELECT status, void_reason, confirmed_at FROM referral_earning WHERE order_id='${orderId}'`);
      assert.equal(rows[0].status, "void", "one business referring itself is not paid");
      assert.equal(rows[0].void_reason, "same_abn");
      assert.equal(rows[0].confirmed_at, null);
    });

    await t.test("AC-28 late limb — the sweep releases money once the referrer can be paid again", async () => {
      // The other half of the pending-hold. Money held because a referrer cleared
      // their bank details has to be released when they put them back, and there
      // is no request to hang that on — the order was paid long ago and nothing
      // about the referrer's own account touches the earning.
      //
      // confirmed_at is stamped NOW rather than backdated to the payment. It is
      // the instant the money genuinely became payable, and the advertised payment
      // window runs from it — backdating would start the clock during a period
      // when we had nowhere to send the money.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "sweep.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='sweep.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "sweep.mate@example.com");
      await linkCode("sweep.mate@example.com", mine.code);
      await sql(
        `INSERT INTO project
           (id, owner_user_id, title, public_ref, status_customer, status_internal, delivery_amount)
         VALUES ('p-sweep', (SELECT id FROM user WHERE email='sweep.mate@example.com'),
                 'Sweep quote','OF-Q-88007','quote_issued','issued',0);
         INSERT INTO quote_line
           (id, project_id, external_ref, product_slug, dims_json, options_json, qty, line_total, status, position)
         VALUES ('ql-sweep','p-sweep','W01','amj80-series-awning-window',
                 '{"width":"900","height":"1200"}','{}',1,10000,'ready',0);`,
      );
      await requestJson(mate, "/api/projects/p-sweep/accept", { method: "POST" });
      const orderId = (await sql(`SELECT id FROM "order" WHERE project_id='p-sweep'`))[0].id;

      // Details gone, order paid, money held.
      await sql("UPDATE user SET payout_bsb=NULL WHERE email='sweep.referrer@example.com'");
      await sql(`UPDATE "order" SET stage='balance_invoiced' WHERE id='${orderId}'`);
      await requestJson(staff, `/api/orders/${orderId}/pay`, { method: "POST", json: { kind: "balance" } });
      const held = await sql(`SELECT status FROM referral_earning WHERE order_id='${orderId}'`);
      assert.equal(held[0].status, "pending", "held while unpayable");

      // They come back and fix their details. No request touches the earning.
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const stillHeld = await sql(`SELECT status FROM referral_earning WHERE order_id='${orderId}'`);
      assert.equal(stillHeld[0].status, "pending", "and nothing in that request releases it");

      await fetch(new URL("/__scheduled", baseUrl));

      const released = await sql(`SELECT status, confirmed_at FROM referral_earning WHERE order_id='${orderId}'`);
      assert.equal(released[0].status, "confirmed", "the sweep is what releases it");
      assert.ok(released[0].confirmed_at, "stamped when it truly became payable, not when the order was paid");
    });

    await t.test("AC-72 — the other drafts are re-priced when eligibility ends", async () => {
      // Line totals are STORED, not recomputed on read. So a referred tradie with
      // two drafts, who orders one, is left holding a second one still carrying a
      // discount they are no longer entitled to — and it would stay wrong until
      // something else happened to re-price it.
      //
      // Eligibility itself needs no write: "used" is derived from the order
      // existing. This exists only to make the stored figures agree with it.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "stale.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='stale.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "stale.mate@example.com");
      await linkCode("stale.mate@example.com", mine.code);

      // Two projects: one they will order, one left as a draft carrying a stale
      // price. The draft's total is deliberately wrong so a re-price is visible.
      await sql(
        `INSERT INTO project
           (id, owner_user_id, title, public_ref, status_customer, status_internal, delivery_amount)
         VALUES
           ('p-stale-order', (SELECT id FROM user WHERE email='stale.mate@example.com'),
            'Ordered','OF-Q-88008','quote_issued','issued',0),
           ('p-stale-draft', (SELECT id FROM user WHERE email='stale.mate@example.com'),
            'Still a draft','OF-Q-88009','draft','draft',0);
         INSERT INTO quote_line
           (id, project_id, external_ref, product_slug, dims_json, options_json, qty, line_total, status, position)
         VALUES
           ('ql-stale-order','p-stale-order','W01','amj80-series-awning-window',
            '{"width":"900","height":"1200"}','{}',1,10000,'ready',0),
           ('ql-stale-draft','p-stale-draft','W01','amj80-series-awning-window',
            '{"width":"900","height":"1200"}','{}',1,999999,'ready',0);`,
      );

      await requestJson(mate, "/api/projects/p-stale-order/accept", { method: "POST" });

      const draft = await sql(`SELECT line_total FROM quote_line WHERE id='ql-stale-draft'`);
      assert.notEqual(draft[0].line_total, 999999, "the stale draft must be re-priced, not left as it was");

      // And the issued quote they ordered is untouched: an issued price is a
      // price someone agreed to, and re-pricing it would change a contract.
      const issued = await sql(`SELECT line_total FROM quote_line WHERE id='ql-stale-order'`);
      assert.equal(issued[0].line_total, 10000, "an issued quote is never re-priced");
    });

    await t.test("AC-72 expiry limb — a lapsed referral's drafts are re-priced by the sweep, once", async () => {
      // The USED ending strips stale drafts (above). The EXPIRED ending is the
      // same problem arriving without a request to hang it on: nobody does
      // anything when a window closes, so nothing re-prices, and a stored line
      // total does not notice that the world moved. `issueQuote` reads the stored
      // total and never re-prices — it only refuses a NULL — so a draft priced
      // while the discount was live can be issued months after the referral
      // lapsed, at the lapsed price. That is money going out the door after we
      // stopped owing it.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "lapse.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='lapse.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "lapse.mate@example.com");
      await linkCode("lapse.mate@example.com", mine.code);

      // PRICED THROUGH THE REAL SAVE PATH WHILE THE DISCOUNT IS LIVE, rather than
      // seeded with a number a test typed in. That is what makes "the stored total
      // went up" mean "the discount came off" instead of merely "something wrote
      // to the row".
      const { body: saved } = await requestJson(mate, "/api/projects/current/lines", {
        method: "PUT",
        json: {
          title: "Lapsing draft",
          items: [{
            code: "W01", location: "Lapse probe", productSlug: "amj80-series-sliding-window",
            width: "1200", height: "900", qty: 1,
            options: {
              colour: "Dover White", hardware: "AMJ Standard D Shape Handle",
              flyscreen: "None", installation: "Sub Sill & Head",
            },
            lineTotal: 1,
          }],
        },
      });
      const discounted = saved.items[0].lineTotal;
      assert.ok(discounted > 0, "the draft priced while the referral was live");

      const mateId = "(SELECT id FROM user WHERE email='lapse.mate@example.com')";
      const lineRow = async () => (await sql(
        `SELECT l.id, l.line_total FROM quote_line l JOIN project p ON p.id = l.project_id
          WHERE p.owner_user_id = ${mateId}`,
      ))[0];
      const referralRow = async () => (await sql(
        `SELECT status, expired_processed_at FROM referral WHERE referred_user_id = ${mateId}`,
      ))[0];

      // The window closes. NOTHING ABOUT THAT IS A REQUEST — which is the whole
      // reason it needs the sweep and not a route.
      await sql(`UPDATE referral SET expires_at = datetime('now','-1 day') WHERE referred_user_id = ${mateId}`);
      assert.equal((await lineRow()).line_total, discounted, "the stored total still carries the lapsed discount");

      await fetch(new URL("/__scheduled", baseUrl));

      const swept = await lineRow();
      assert.ok(
        swept.line_total > discounted,
        `the lapsed discount must come off the stored total: ${swept.line_total} is not above ${discounted}`,
      );
      const processed = await referralRow();
      assert.ok(processed.expired_processed_at, "and the referral is stamped processed");
      // 'expired' is DERIVED (spec §7, and the CHECK constraint has no such
      // value). The sweep re-prices; it does not invent a stored status.
      assert.equal(processed.status, "recorded", "the sweep must not write an expiry the dates already state");

      // IDEMPOTENCE IS NOT DECORATION. Without the stamp this re-prices every
      // lapsed referral's every draft on every ten-minute cron, forever — one
      // `priceItem` call per line, growing with the table and never finishing.
      await sql(`UPDATE quote_line SET line_total = 1 WHERE id = '${swept.id}'`);
      await fetch(new URL("/__scheduled", baseUrl));
      assert.equal((await lineRow()).line_total, 1, "a stamped referral is not swept a second time");
      assert.equal(
        (await referralRow()).expired_processed_at, processed.expired_processed_at,
        "and the stamp is not moved by the sweep that skipped it",
      );
    });

    await t.test("AC-35/AC-75 — the public program endpoint carries the figures, and no total", async () => {
      // Every figure in the copy renders from here. Nothing on the landing page,
      // the placements or the account section may type a number into a string —
      // otherwise raising the rate in ops advertises one figure while the engine
      // applies another, and the config screen's promise is a lie.
      const response = await fetch(new URL("/api/referral/program", baseUrl));
      assert.equal(response.status, 200, "public: a logged-out visitor reads the offer");
      const { program } = await response.json();

      assert.equal(program.ratePercent, 1);
      assert.equal(program.discountPercent, 2.5);
      assert.equal(program.minOrderAmount, 2000);
      assert.equal(program.windowMonths, 12);
      assert.equal(program.payoutTimeframeDays, 14, "s 32(2): the payment window is part of the offer");
      assert.equal(program.capAmount, null, "null means render no cap clause at all");
      assert.equal(program.minPayoutBalance, 0, "0 means render no threshold language at all");
      assert.equal(program.active, true);

      // AC-75, structurally. A combined total would leak the standing account
      // discount by subtraction, so no shape may carry one — and the check is a
      // scan rather than a list, because the failure is a field APPEARING.
      const forbidden = /account.?discount|combined|totalDiscount|effectiveDiscount/i;
      const offenders = Object.keys(program).filter((key) => forbidden.test(key));
      assert.deepEqual(offenders, [], "no customer shape may carry an account or combined discount");
    });

    await t.test("AC-27/AC-30 — the referrer screen carries the list, the money and the masked details", async () => {
      // Everything §5 renders. The shape matters as much as the numbers: a
      // referrer sees WHO (business name or masked email), HOW FAR ALONG, and
      // WHAT THEY EARNED — never what their mate bought or what it cost.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "screen.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='screen.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "screen.mate@example.com");
      await linkCode("screen.mate@example.com", mine.code);
      await sql(
        `INSERT INTO project
           (id, owner_user_id, title, public_ref, status_customer, status_internal, delivery_amount)
         VALUES ('p-screen', (SELECT id FROM user WHERE email='screen.mate@example.com'),
                 'Screen quote','OF-Q-88010','quote_issued','issued',0);
         INSERT INTO quote_line
           (id, project_id, external_ref, product_slug, dims_json, options_json, qty, line_total, status, position)
         VALUES ('ql-screen','p-screen','W01','amj80-series-awning-window',
                 '{"width":"900","height":"1200"}','{}',1,10000,'ready',0);`,
      );
      await requestJson(mate, "/api/projects/p-screen/accept", { method: "POST" });

      const { body: screen } = await requestJson(referrer, "/api/account/referrals");

      assert.equal(screen.referrals.length, 1);
      assert.equal(screen.referrals[0].status, "ordered", "they have ordered but not yet paid in full");
      assert.match(screen.referrals[0].displayName, /\*/, "a masked email, never the address itself");
      assert.ok(screen.shareUrl?.endsWith(`/r/${mine.code}`), "the link is built for them, not by them");

      assert.equal(screen.earnings.pending, 90.91, "sums, so the screen never adds up rows itself");
      assert.equal(screen.earnings.confirmed, 0);
      assert.equal(screen.earnings.paid, 0);
      assert.equal(screen.earningRows.length, 1);
      assert.equal(screen.earningRows[0].dueAt, null, "nothing is due until it is payable");

      // Masked, always. The unmasked values exist in exactly one place a human
      // reads them — the ops payouts run — and this is not it.
      assert.equal(screen.payout.abnValid, true);
      assert.equal(screen.payout.abn, "51824753556", "their own ABN is a public business identifier");
      assert.match(screen.payout.bsbMasked, /^063-\*+$/, "a BSB is shown masked");
      assert.match(screen.payout.accountMasked, /^\*+5678$/, "and an account number by its last four");
      assert.equal(/12345678/.test(JSON.stringify(screen.payout)), false, "the full number never leaves the server");

      assert.equal(screen.payoutHistory.length, 0);
      assert.equal(screen.program.ratePercent, 1, "figures for the copy, from config");
    });

    // AC-71/AC-75, not AC-53. AC-53 is about the next PRICING event after the
    // first order, and this test never places an order: what it drives is the
    // derived three-state panel (AC-71) and the rule that it carries the referral
    // percentage alone, never a combined total (AC-75).
    await t.test("AC-71/AC-75 — the referred tradie's offer is derived, and says nothing of a total", async () => {
      // Three records already answer this — the referral, its expiry, and whether
      // the account has ordered — so there is no stored state to go stale. It is
      // also why the discount survives the program being switched off: the panel
      // reads a promise already made, not a switch.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "offer.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556', company='Kirra Glazing' WHERE email='offer.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      // Nobody referred them: no panel at all, rather than an empty one.
      const stranger = new Session(baseUrl);
      await login(stranger, "/api/auth", "offer.stranger@example.com");
      const { body: none } = await requestJson(stranger, "/api/account/referral-offer");
      assert.equal(none.offer, null, "a tradie nobody referred sees no panel");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "offer.mate@example.com");
      await linkCode("offer.mate@example.com", mine.code);

      const { body: live } = await requestJson(mate, "/api/account/referral-offer");
      assert.equal(live.offer.state, "available");
      assert.equal(live.offer.referralPercent, 2.5, "their percentage alone — never summed with anything");
      assert.equal(live.offer.referrerName, "Kirra Glazing", "who to thank");
      assert.ok(live.offer.expiresAt, "an offer with a clock on it");

      // AC-75 again, on the shape a customer actually receives.
      const forbidden = /account.?discount|combined|totalDiscount|effectiveDiscount/i;
      assert.deepEqual(Object.keys(live.offer).filter((k) => forbidden.test(k)), []);
    });

    await t.test("AC-85 — leaving is clearing your details, and it waits on money owed", async () => {
      // Membership IS having payout details, so there is no separate "leave"
      // record to keep — removing them is the act. The control says so rather
      // than offering a second concept that could disagree with the first.
      const leaver = new Session(baseUrl);
      await login(leaver, "/api/auth", "leave.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='leave.referrer@example.com'");
      await requestJson(leaver, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: joined } = await requestJson(leaver, "/api/account/referrals");
      assert.ok(joined.code, "a member");

      await requestJson(leaver, "/api/account/payout-details", { method: "DELETE" });

      const { body: left } = await requestJson(leaver, "/api/account/referrals");
      assert.equal(left.referrerGate.complete, false, "no longer a member");
      assert.equal(left.code, null, "and the code is no longer shareable");
      // The code itself is NOT destroyed. It was permanent from the moment it was
      // issued, and a tradie who read it out over the phone must get the same one
      // back if they rejoin.
      assert.ok(left.retainedCode, "but it is kept, so rejoining returns the same code");

      const rejoined = await requestJson(leaver, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      assert.equal(rejoined.body.referrerGate.complete, true);
      const { body: back } = await requestJson(leaver, "/api/account/referrals");
      assert.equal(back.code, left.retainedCode, "the same code, not a new one");
    });

    await t.test("AC-54 — the issued quote's badge is frozen, and its price is never re-priced", async () => {
      // Two different things freeze here, and only one of them is a price. The
      // LABEL is stamped at issue so the badge cannot drift when eligibility ends
      // — a quote that said "includes your 2.5% referral discount" must keep
      // saying so, because it does. The PRICE was already frozen by issuing, and
      // nothing here touches it.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "badge.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556', company='Kirra Glazing' WHERE email='badge.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "badge.mate@example.com");
      await linkCode("badge.mate@example.com", mine.code);
      await sql(
        `INSERT INTO project
           (id, owner_user_id, title, public_ref, status_customer, status_internal, delivery_amount)
         VALUES ('p-badge', (SELECT id FROM user WHERE email='badge.mate@example.com'),
                 'Badge quote','OF-Q-88011','quote_issued','issued',0);
         INSERT INTO quote_line
           (id, project_id, external_ref, product_slug, dims_json, options_json, qty, line_total, status, position)
         VALUES ('ql-badge','p-badge','W01','amj80-series-awning-window',
                 '{"width":"900","height":"1200"}','{}',1,10000,'ready',0);
         UPDATE project SET referral_percent_at_issue = 2.5 WHERE id = 'p-badge';`,
      );

      const { body: quote } = await requestJson(mate, "/api/projects/p-badge/quote");
      assert.equal(quote.live, true, `the quote must be issued for a badge to exist: ${JSON.stringify(quote)}`);
      assert.ok(quote.referral, `the issued quote must carry a badge: ${JSON.stringify(quote).slice(0, 400)}`);
      assert.equal(quote.referral.percent, 2.5, "the badge names the percentage as issued");
      assert.equal(quote.referral.referrerName, "Kirra Glazing", "and who to thank");

      // Eligibility ends the moment they order. The badge must survive onto the
      // order, because the order is what they will look at from now on — and it
      // still describes what happened: this purchase carried that discount.
      const { body: placed } = await requestJson(mate, "/api/projects/p-badge/accept", { method: "POST" });
      const { body: order } = await requestJson(mate, `/api/orders/${placed.order.id}`);
      assert.equal(order.order.referral.percent, 2.5, "a frozen label does not move when eligibility does");
      assert.equal(order.order.referral.referrerName, "Kirra Glazing");
    });

    await t.test("AC-58 — the ops record shows the discount and its review flags before issue", async () => {
      // The half a reviewer sees BEFORE issuing, which is the half that matters:
      // this business issues no price without a human looking at it, and that
      // human is the only control standing between a self-referral and a discount.
      // The automatic gates cannot catch a second account at the same address, so
      // the answer is not another gate — it is showing the reviewer what is odd.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "flag.referrer@example.com");
      await sql(
        `UPDATE user SET abn='51824753556', company='Kirra Glazing', phone='0400111222'
          WHERE email='flag.referrer@example.com'`,
      );
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "flag.mate@example.com");
      await linkCode("flag.mate@example.com", mine.code);
      // Same phone and the same business name as the referrer. Neither is refused
      // — a shared phone is a father and son on one number as often as it is fraud
      // — but a reviewer should be told before they price the job.
      await sql(
        `UPDATE user SET phone='0400111222', company='Kirra Glazing' WHERE email='flag.mate@example.com'`,
      );
      await sql(
        `INSERT INTO project (id, owner_user_id, title, public_ref, status_customer, status_internal)
         VALUES ('p-flag', (SELECT id FROM user WHERE email='flag.mate@example.com'),
                 'Flagged quote','OF-Q-88012','submitted','triage_pending')`,
      );

      const { body: record } = await requestJson(staff, "/api/ops/projects/p-flag");

      assert.ok(record.referral, "a referred project must say so on the ops record");
      assert.equal(record.referral.applied, true);
      assert.equal(record.referral.percent, 2.5);
      assert.equal(record.referral.referrerName, "Kirra Glazing");
      assert.deepEqual([...record.referral.flags].sort(), ["business_name", "phone"],
        "what is shared is named, so the reviewer knows what to look at");
    });

    await t.test("AC-33 — /refer is a real page: sitemapped, and served with a head", async () => {
      // A referral program nobody can find is a referral program nobody joins.
      // The page is the one surface a stranger reaches without an account, so it
      // has to be indexable — which on this site means being in PUBLIC_PAGES,
      // the single list that drives both the sitemap and the server-rendered head.
      const sitemap = await fetch(new URL("/sitemap.xml", baseUrl));
      assert.equal(sitemap.status, 200);
      assert.match(await sitemap.text(), /\/refer</, "the sitemap must list it");

      // Server-rendered, not just an SPA route: a crawler that runs no JavaScript
      // has to get a title of the page's OWN, not the bare business name. That
      // comes from the named-title map in shell.ts and needs no CMS record —
      // being in the sitemap with nothing to say about yourself is worse than
      // not being listed.
      //
      // The meta DESCRIPTION deliberately is not asserted: it comes from the
      // Sanity page record (`pageId: "refer"`), which is content rather than
      // code, and asserting it here would make this suite fail on an empty CMS.
      // The absence is a content task, not a defect.
      const page = await fetch(new URL("/refer", baseUrl));
      assert.equal(page.status, 200, "and it never 404s");
      const html = await page.text();
      const title = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? "";
      assert.match(title, /refer a mate/i, "with a title about this page, not the site's default");
    });

    // AC-38, not AC-63. There is no AC-63 in the spec — the numbering runs 62, 64
    // — so the tag pointed at nothing and this behaviour appeared untested.
    await t.test("AC-38 — ops reads and writes the program, and a stale save is refused", async () => {
      // Every advertised figure in the feature comes from this row, so the screen
      // that edits it is the one place a typo becomes a public promise. The
      // versioned write is why: two founders both in the console on the same
      // afternoon is an ordinary event, and a silent last-write-wins is how one
      // of them loses a change without ever knowing.
      const { body: read } = await requestJson(staff, "/api/ops/referrals/program");
      assert.equal(read.program.ratePercent, 1);
      assert.equal(read.program.discountPercent, 2.5);
      assert.ok(read.version, "a version to write back against");

      const { body: saved } = await requestJson(staff, "/api/ops/referrals/program", {
        method: "PUT",
        json: { ...read.program, ratePercent: 1.5, expectedVersion: read.version },
      });
      assert.equal(saved.program.ratePercent, 1.5);
      assert.notEqual(saved.version, read.version, "the version moves on every write");

      // The public endpoint must now advertise the new rate — that is the whole
      // point of the figure living in config rather than in a string.
      const { program: live } = await (await fetch(new URL("/api/referral/program", baseUrl))).json();
      assert.equal(live.ratePercent, 1.5, "the site advertises what ops just set");

      // A second editor holding the old version is refused rather than silently
      // overwriting the first.
      const stale = await requestJson(staff, "/api/ops/referrals/program", {
        method: "PUT",
        json: { ...read.program, ratePercent: 9, expectedVersion: read.version },
      }, 409);
      assert.equal(stale.body.error, "version_conflict");

      await sql("UPDATE referral_program SET rate_percent=1 WHERE id='default'");
    });

    await t.test("the ops list carries what a decision needs, and a void needs a reason", async () => {
      // This is the screen where someone decides to take money away, so the row
      // has to say what is at stake BEFORE they click: voiding a referral with
      // confirmed money owed is a different act from voiding one with none.
      const { body: list } = await requestJson(staff, "/api/ops/referrals");
      assert.ok(Array.isArray(list.referrals), "a list to work from");
      const withEarning = list.referrals.find((r) => r.earning);
      assert.ok(withEarning, "and rows carry their earning, or null");
      assert.ok(withEarning.referrerName && withEarning.referredName, "both parties, named");
      assert.ok(Array.isArray(withEarning.flags), "with the review flags");

      // A reason is mandatory. Money not going out is a thing someone will ask
      // about later, and "voided" with no reason answers nothing.
      const target = list.referrals.find((r) => r.status === "recorded");
      const noReason = await requestJson(staff, `/api/ops/referrals/${target.id}/void`,
        { method: "POST", json: { reason: "  " } }, 400);
      assert.equal(noReason.body.error, "reason_required");

      await requestJson(staff, `/api/ops/referrals/${target.id}/void`,
        { method: "POST", json: { reason: "duplicate account, confirmed by phone" } });
      const voided = await sql(`SELECT status, void_reason FROM referral WHERE id='${target.id}'`);
      assert.equal(voided[0].status, "void");
      assert.equal(voided[0].void_reason, "duplicate account, confirmed by phone");

      // Reversible: a judgement call that went the wrong way is corrected here,
      // not by editing the database.
      await requestJson(staff, `/api/ops/referrals/${target.id}/unvoid`, { method: "POST" });
      const restored = await sql(`SELECT status FROM referral WHERE id='${target.id}'`);
      assert.equal(restored[0].status, "recorded");
    });

    await t.test("A19 — Ops links a referral through the same gates, and is told which one refused", async () => {
      // The privileged path. It calls recordReferral rather than inserting a row,
      // because a path that skips the gates becomes the way around all of them —
      // and the person using it is the one taking the phone call from a mate.
      const referrer = new Session(baseUrl);
      await login(referrer, "/api/auth", "opslink.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='opslink.referrer@example.com'");
      await requestJson(referrer, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "A Tradie" },
      });
      const { body: mine } = await requestJson(referrer, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "opslink.mate@example.com");

      const linked = await requestJson(staff, "/api/ops/referrals/link", {
        method: "POST", json: { email: "opslink.mate@example.com", code: mine.code },
      });
      assert.equal(linked.body.ok, true);
      const rows = await sql(
        `SELECT source FROM referral WHERE referred_user_id = (SELECT id FROM user WHERE email='opslink.mate@example.com')`,
      );
      assert.equal(rows.length, 1);
      // 'manual' is accurate: the customer wrote the code on their request and
      // staff transcribed it. Not a new provenance concept.
      assert.equal(rows[0].source, "manual");

      // SPECIFIC refusals, unlike the customer-facing ones. Ops needs to know
      // whether to ring the applicant; an internal screen is not an oracle a
      // stranger can probe.
      const again = await requestJson(staff, "/api/ops/referrals/link", {
        method: "POST", json: { email: "opslink.mate@example.com", code: mine.code },
      }, 400);
      assert.equal(again.body.error, "already_referred");

      const unknown = await requestJson(staff, "/api/ops/referrals/link", {
        method: "POST", json: { email: "nobody.here@example.com", code: mine.code },
      }, 404);
      assert.equal(unknown.body.error, "no_such_account");
    });

    await t.test("a voided referral does not block the correction that follows it", async () => {
      // The trap this closes: Ops mistypes a code, credit lands on the wrong
      // tradie, they void it — and the account is now permanently unlinkable,
      // because "one referral per account" counted the voided row too. The
      // correct referrer could never be credited, and the only remedy would be
      // editing the database.
      //
      // A voided referral is a relationship that DID NOT happen. Permanence is
      // about not letting someone shop for a better referrer, not about making a
      // typo unfixable.
      const wrong = new Session(baseUrl);
      await login(wrong, "/api/auth", "fix.wrong@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='fix.wrong@example.com'");
      await requestJson(wrong, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "Wrong Tradie" },
      });
      const { body: wrongCode } = await requestJson(wrong, "/api/account/referrals");

      const right = new Session(baseUrl);
      await login(right, "/api/auth", "fix.right@example.com");
      await sql("UPDATE user SET abn='53004085616' WHERE email='fix.right@example.com'");
      await requestJson(right, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "87654321", accountName: "Right Tradie" },
      });
      const { body: rightCode } = await requestJson(right, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "fix.mate@example.com");

      // The mistake.
      await requestJson(staff, "/api/ops/referrals/link",
        { method: "POST", json: { email: "fix.mate@example.com", code: wrongCode.code } });
      const mistaken = await sql(
        `SELECT id FROM referral WHERE referred_user_id = (SELECT id FROM user WHERE email='fix.mate@example.com')`,
      );
      await requestJson(staff, `/api/ops/referrals/${mistaken[0].id}/void`,
        { method: "POST", json: { reason: "linked to the wrong tradie — my error" } });

      // The correction must be possible.
      await requestJson(staff, "/api/ops/referrals/link",
        { method: "POST", json: { email: "fix.mate@example.com", code: rightCode.code } });

      const live = await sql(
        `SELECT code, status FROM referral
          WHERE referred_user_id = (SELECT id FROM user WHERE email='fix.mate@example.com')
            AND status = 'recorded'`,
      );
      assert.equal(live.length, 1, "exactly one live referral after the correction");
      assert.equal(live[0].code, rightCode.code, "and it is the right tradie's");
    });

    await t.test("AC-47/AC-107 — a customer cannot undo a void, or shop for another referrer", async () => {
      // The revival above is a STAFF remedy. Under revision 11 the same function
      // also served the customer's own claim endpoint, and the remedy was
      // therefore the attack: A signs up on B's link, Ops sees the shared phone
      // and voids it with a reason, and A — who has not ordered — simply POSTs
      // the code again. The relationship comes back with a fresh window, the
      // commission and discount go live, and the staff member's recorded reason
      // is nulled by the same statement.
      //
      // Revision 12 closes it by construction rather than by guard: there is no
      // customer-reachable path into recordReferral at all. The `revive`
      // default-deny inside it stands as the second line — an argument only the
      // ops route passes, and passes as a literal — but the attempt below can no
      // longer reach the function to be refused by it.
      const host = new Session(baseUrl);
      await login(host, "/api/auth", "revive.host@example.com");
      await sql("UPDATE user SET abn='51824753556' WHERE email='revive.host@example.com'");
      await requestJson(host, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "Host Tradie" },
      });
      const { body: hostCode } = await requestJson(host, "/api/account/referrals");

      const other = new Session(baseUrl);
      await login(other, "/api/auth", "revive.other@example.com");
      await sql("UPDATE user SET abn='53004085616' WHERE email='revive.other@example.com'");
      await requestJson(other, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "87654321", accountName: "Other Tradie" },
      });
      const { body: otherCode } = await requestJson(other, "/api/account/referrals");

      const mate = new Session(baseUrl);
      await login(mate, "/api/auth", "revive.mate@example.com");
      await linkCode("revive.mate@example.com", hostCode.code);
      const recorded = await sql(
        `SELECT id FROM referral WHERE referred_user_id = (SELECT id FROM user WHERE email='revive.mate@example.com')`,
      );
      await requestJson(staff, `/api/ops/referrals/${recorded[0].id}/void`,
        { method: "POST", json: { reason: "same person — self-referral" } });

      // The forbidden actions, attempted against the running system as the voided
      // party. 404 rather than 400: there is nothing left to refuse them.
      const retry = await mate.request("/api/account/referrals/claim", {
        method: "POST", json: { code: hostCode.code },
      });
      assert.equal(retry.status, 404, "re-claiming a voided code has no surface to be refused by");

      // And the other half: a void must not become a way to go shopping.
      const shopping = await mate.request("/api/account/referrals/claim", {
        method: "POST", json: { code: otherCode.code },
      });
      assert.equal(shopping.status, 404, "nor may a different referrer be reached after a void");

      // The staff decision, intact. This is the part that makes it more than an
      // overpayment: the reason someone recorded is the record of why money did
      // not go out, and the revival statement nulls it.
      const after = await sql(
        `SELECT status, void_reason, voided_by, voided_at, code FROM referral WHERE id = '${recorded[0].id}'`,
      );
      assert.equal(after[0].status, "void", "the void stands");
      assert.equal(after[0].void_reason, "same person — self-referral", "and its reason survives the attempt");
      assert.ok(after[0].voided_by, "with who decided it");
      assert.ok(after[0].voided_at, "and when");
      assert.equal(after[0].code, hostCode.code, "and it was not quietly re-pointed at someone else");

      // Ops keeps the remedy. Nothing above may cost staff the correction path.
      await requestJson(staff, "/api/ops/referrals/link",
        { method: "POST", json: { email: "revive.mate@example.com", code: otherCode.code } });
      const corrected = await sql(
        `SELECT code, status FROM referral
          WHERE referred_user_id = (SELECT id FROM user WHERE email='revive.mate@example.com')`,
      );
      assert.equal(corrected.length, 1, "still one row per account");
      assert.equal(corrected[0].status, "recorded");
      assert.equal(corrected[0].code, otherCode.code, "staff can still correct a mistaken void");
    });

    // AC-41, not AC-40. AC-40 is voiding-requires-a-reason; per-referrer grouping
    // into exactly two groups is AC-41, which is what this drives.
    await t.test("AC-41 — the payout queue groups by referrer and reads the details once", async () => {
      // The weekly job. One transfer per referrer, not one per earning, because
      // a person with three referrals gets one payment and one bank line.
      const earner = new Session(baseUrl);
      await login(earner, "/api/auth", "queue.referrer@example.com");
      await sql("UPDATE user SET abn='51824753556', company='Queue Glazing' WHERE email='queue.referrer@example.com'");
      await requestJson(earner, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "063-000", accountNumber: "12345678", accountName: "Queue Glazing" },
      });
      const { body: mine } = await requestJson(earner, "/api/account/referrals");

      // Two referred mates, both ordered and paid in full.
      for (const n of [1, 2]) {
        const mate = new Session(baseUrl);
        await login(mate, "/api/auth", `queue.mate${n}@example.com`);
        await requestJson(staff, "/api/ops/referrals/link",
          { method: "POST", json: { email: `queue.mate${n}@example.com`, code: mine.code } });
        await sql(
          `INSERT INTO project
             (id, owner_user_id, title, public_ref, status_customer, status_internal, delivery_amount)
           VALUES ('p-queue${n}', (SELECT id FROM user WHERE email='queue.mate${n}@example.com'),
                   'Queue ${n}','OF-Q-8802${n}','quote_issued','issued',0);
           INSERT INTO quote_line
             (id, project_id, external_ref, product_slug, dims_json, options_json, qty, line_total, status, position)
           VALUES ('ql-queue${n}','p-queue${n}','W01','amj80-series-awning-window',
                   '{"width":"900","height":"1200"}','{}',1,10000,'ready',0);`,
        );
        await requestJson(mate, `/api/projects/p-queue${n}/accept`, { method: "POST" });
        const orderId = (await sql(`SELECT id FROM "order" WHERE project_id='p-queue${n}'`))[0].id;
        await sql(`UPDATE "order" SET stage='balance_invoiced' WHERE id='${orderId}'`);
        await requestJson(staff, `/api/orders/${orderId}/pay`, { method: "POST", json: { kind: "balance" } });
      }

      const { body: queue } = await requestJson(staff, "/api/ops/referrals/payouts");
      const group = queue.ready.find((g) => g.name === "Queue Glazing");
      assert.ok(group, "the referrer appears once, not once per earning");
      assert.equal(group.amount, 181.82, "with both earnings summed into one transfer");
      assert.equal(group.earningIds.length, 2);
      // Codes, not opaque ids: someone reconciling a bank statement should see
      // what the referrer sees on their own screen.
      assert.deepEqual(group.referralRefs, [mine.code, mine.code]);
      // The bank details a human types into a transfer — the ONLY place they are
      // readable, and reading them is itself recorded.
      assert.equal(group.bsb, "063000");
      assert.equal(group.accountNumber, "12345678");
      assert.equal(typeof group.daysWaiting, "number");
      assert.equal(group.overPromise, false, "nothing is late yet");

      const log = await sql(
        `SELECT action, context FROM payout_details_access
          WHERE subject_user_id = (SELECT id FROM user WHERE email='queue.referrer@example.com')
            AND action = 'view'`,
      );
      assert.ok(log.length >= 1, "reading the numbers is itself recorded");
      assert.equal(log[0].context, "ops_payouts");
      assert.equal(/12345678/.test(JSON.stringify(log)), false, "and the record holds no numbers");
    });

    await t.test("AC-42/AC-47 — the CSV is staff-only, and taking it is recorded", async () => {
      // A customer asking for the transfer file gets nothing. This is the whole
      // of everyone's banking in one download, so the gate is checked here
      // against a running server rather than read off the route.
      const outsider = new Session(baseUrl);
      await login(outsider, "/api/auth", "csv.outsider@example.com");
      const refused = await outsider.request("/api/ops/referrals/payouts/export.csv");
      assert.equal(refused.status, 403, "a customer session must not be able to download the payout CSV");

      const before = await sql(
        `SELECT COUNT(*) AS n FROM payout_details_access
          WHERE context = 'ops_csv' AND action = 'view'`,
      );

      const response = await staff.request("/api/ops/referrals/payouts/export.csv");
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /text\/csv/);
      assert.match(response.headers.get("content-disposition") ?? "", /attachment; filename=/,
        "it downloads rather than rendering as a wall of text in the browser");

      const body = await response.text();
      assert.ok(body.includes("Queue Glazing"), "the referrer waiting to be paid is in the file");
      assert.ok(body.includes('="063000"'), "with the BSB the transfer needs, as text");
      assert.ok(body.includes('="12345678"'), "and the account number");

      // ADR-4: the numbers are obtained through the reader that records having
      // been used, and through nothing else. A route that read the columns
      // directly would produce an identical file and no log row — which is the
      // exact failure this assertion exists to catch.
      const after = await sql(
        `SELECT COUNT(*) AS n FROM payout_details_access
          WHERE context = 'ops_csv' AND action = 'view'`,
      );
      assert.ok(after[0].n > before[0].n, "taking the CSV must write a 'view' row with context ops_csv");
      const logged = await sql(
        `SELECT actor_user_id, subject_user_id FROM payout_details_access
          WHERE context = 'ops_csv' ORDER BY at DESC LIMIT 1`,
      );
      assert.notEqual(logged[0].actor_user_id, logged[0].subject_user_id,
        "ops looking at a referrer's details is an actor/subject divergence, not a self-edit");
    });

    await t.test("AC-45 — a payout freezes what it paid, and a reversal returns the money", async () => {
      const { body: before } = await requestJson(staff, "/api/ops/referrals/payouts");
      const group = before.ready.find((g) => g.name === "Queue Glazing");
      assert.ok(group, "the group from the queue test is still waiting");

      const { body: paid } = await requestJson(staff, "/api/ops/referrals/payouts/mark-paid", {
        method: "POST", json: { userIds: [group.userId], reference: "TFR-99321" },
      });
      assert.equal(paid.paid.length, 1);

      const row = (await sql(`SELECT * FROM referral_payout WHERE reference = 'TFR-99321'`))[0];
      assert.ok(row, "one payout row per referrer per run");
      assert.equal(row.amount, 181.82);
      // FROZEN. The accountant's record of what was actually paid must not change
      // when the referrer later edits their bank details.
      assert.equal(row.bsb, "063000");
      assert.equal(row.account_number, "12345678");

      const earnings = await sql(
        `SELECT status, payout_id FROM referral_earning WHERE payout_id = '${row.id}'`,
      );
      assert.equal(earnings.length, 2, "both earnings attached to the one payment");
      assert.ok(earnings.every((e) => e.status === "paid"));

      // The referrer edits their details afterwards; the record of what was paid
      // must not follow them.
      const earner = new Session(baseUrl);
      await login(earner, "/api/auth", "queue.referrer@example.com");
      await requestJson(earner, "/api/account/payout-details", {
        method: "PUT", json: { bsb: "083-004", accountNumber: "99998888", accountName: "Queue Glazing" },
      });
      const unchanged = (await sql(`SELECT bsb, account_number FROM referral_payout WHERE id='${row.id}'`))[0];
      assert.equal(unchanged.bsb, "063000", "the payout record is history, not a mirror");
      assert.equal(unchanged.account_number, "12345678");

      // The transfer bounced. The money goes back to owed, and the failed row is
      // the history rather than being deleted.
      await requestJson(staff, `/api/ops/referrals/payouts/${row.id}/failed`, { method: "POST" });
      const failed = (await sql(`SELECT status FROM referral_payout WHERE id='${row.id}'`))[0];
      assert.equal(failed.status, "failed");
      const revived = await sql(
        `SELECT status, payout_id FROM referral_earning WHERE id IN ('${group.earningIds.join("','")}')`,
      );
      assert.ok(revived.every((e) => e.status === "confirmed"), "owed again");
      assert.ok(revived.every((e) => e.payout_id === null), "and detached from the failed payment");
    });

    await t.test("paying twice does not record a payment that never happened", async () => {
      // A double-click, a retried request, or two staff on the same queue. The
      // second attempt finds the earnings already claimed — and must record
      // NOTHING, rather than a payout row attached to no money.
      //
      // A phantom row is worse than a failed request: it says a transfer was made
      // that was not, and the person reconciling the bank statement is left
      // looking for it.
      const { body: queue } = await requestJson(staff, "/api/ops/referrals/payouts");
      const group = queue.ready.find((g) => g.name === "Queue Glazing");
      assert.ok(group, "the reversed earnings are owed again");

      await requestJson(staff, "/api/ops/referrals/payouts/mark-paid", {
        method: "POST", json: { userIds: [group.userId], reference: "TFR-FIRST" },
      });
      const { body: second } = await requestJson(staff, "/api/ops/referrals/payouts/mark-paid", {
        method: "POST", json: { userIds: [group.userId], reference: "TFR-SECOND" },
      });

      assert.deepEqual(second.paid, [], "the second attempt pays nobody");
      const phantom = await sql(`SELECT id FROM referral_payout WHERE reference = 'TFR-SECOND'`);
      assert.equal(phantom.length, 0, "and writes no record of a transfer that never happened");

      const real = await sql(
        `SELECT id, amount FROM referral_payout WHERE reference = 'TFR-FIRST' AND status = 'paid'`,
      );
      assert.equal(real.length, 1, "the first payment stands, once");
      const attached = await sql(`SELECT id FROM referral_earning WHERE payout_id = '${real[0].id}'`);
      assert.equal(attached.length, 2, "with its earnings attached to it");
    });

    await t.test("AC-43 — marking paid tells the referrer, and a silent send is not one", async () => {
      // TFR-FIRST went out in the subtest above. Somebody was told about it: a
      // transfer arriving in a bank account with a reference nobody explained is
      // how a referrer ends up ringing to ask what the money is.
      const sent = await sql(
        `SELECT event_type, template_key, delivery_state FROM notification
          WHERE recipient_subject = 'queue.referrer@example.com' AND event_type = 'referral.paid'`,
      );
      assert.ok(sent.length >= 1, "markPayoutsPaid must notify the referrer that the money went out");
      assert.equal(sent[0].template_key, "referral_payout_sent", "through the editable template, like every other referral email");
      assert.notEqual(sent[0].delivery_state, "queued", "a notification row with nothing behind it is not a send");
    });

    await t.test("AC-44 — the payments made are readable, so a bounce can be reversed later", async () => {
      // A transfer bounces days after it went out, and the person fixing it was
      // not the person who recorded it. Without a reader the only payout ids that
      // exist are the ones mark-paid handed back in a response nobody kept, and
      // the reversal AC-44 requires can only be done by someone with database
      // access.
      const { body } = await requestJson(staff, "/api/ops/referrals/payouts/history");
      const rows = body.payouts ?? [];
      const first = rows.find((p) => p.reference === "TFR-FIRST");
      assert.ok(first, "the payment that stands is in the accountant's view");
      assert.ok(first.id, "with the id the reversal needs");
      assert.equal(first.amount, 181.82);
      assert.equal(first.status, "paid");
      assert.equal(first.referrerName, "Queue Glazing");
      assert.equal(first.earningCount, 2, "and what it covered");

      const bounced = rows.find((p) => p.reference === "TFR-99321");
      assert.ok(bounced, "a reversed payment stays in the record — it is the history");
      assert.equal(bounced.status, "failed");

      // The frozen banking is the accountant's record of where money went, and
      // this is a list screen. Which account, not the account (AC-29's reasoning,
      // and it keeps an unlogged disclosure off a route that never needed one).
      assert.equal(/12345678|99998888/.test(JSON.stringify(rows)), false, "the frozen account number is not spread across a list");
      // TFR-FIRST went out AFTER the referrer changed their details, and TFR-99321
      // before — so the two rows name different accounts. That is the freezing
      // working, seen from the list: each payment says where it actually went.
      assert.match(first.accountMasked ?? "", /8888$/, "enough to say which account it went to");
      assert.match(bounced.accountMasked ?? "", /5678$/, "and the earlier payment names the account it used");
    });

    // AC-46 dropped: that criterion is the OPS DASHBOARD's "payouts ready" row,
    // and nothing here touches the dashboard. AC-30 (history survives an edit)
    // and AC-29 (masked on read-back) are what this actually proves.
    await t.test("AC-30/AC-29 — the referrer's own screen carries their payment history, masked", async () => {
      // Two payments exist for this referrer by now: TFR-99321, which was
      // reversed, and TFR-FIRST, which stands. BOTH belong on their screen —
      // "we tried to pay you and it came back" is the thing someone rings up
      // about, and a history that quietly drops it answers nothing.
      const earner = new Session(baseUrl);
      await login(earner, "/api/auth", "queue.referrer@example.com");
      const { body: screen } = await requestJson(earner, "/api/account/referrals");

      const paid = (screen.payoutHistory ?? []).find((p) => p.reference === "TFR-FIRST");
      assert.ok(paid, "referrerScreen must carry the payment that went out in payoutHistory");
      assert.equal(paid.amount, 181.82, "the amount actually transferred");
      assert.equal(paid.status, "paid");
      assert.ok(paid.paidAt, "with the date it went out");

      const bounced = (screen.payoutHistory ?? []).find((p) => p.reference === "TFR-99321");
      assert.ok(bounced, "a failed payment stays visible rather than vanishing");
      assert.equal(bounced.status, "failed");

      // AC-29. This is a CUSTOMER surface, and the payout row carries a frozen
      // copy of the banking it went to. None of it may travel with the history.
      assert.equal(
        /12345678|063000|99998888|083004/.test(JSON.stringify(screen.payoutHistory)), false,
        "no payout row's frozen bank details may reach a customer response",
      );
    });

    await t.test("AC-44 — a reversal can say which kind it was, without being made to", async () => {
      // "Bounced, account closed" and "recorded against the wrong row" need
      // OPPOSITE responses: one means stop paying into that account, the other
      // means pay somebody else. Both currently look identical afterwards, so next
      // week's run sends the same money into the same closed account.
      //
      // OPTIONAL, deliberately. The reason a void is mandatory is that someone is
      // not being paid and will ask why; here the bank statement already says what
      // happened and the earnings return to the queue on their own. The note earns
      // its place by telling the next run what to do differently, not by being a
      // form to fill in.
      const target = (await sql(`SELECT id FROM referral_payout WHERE reference = 'TFR-FIRST'`))[0];

      await requestJson(staff, `/api/ops/referrals/payouts/${target.id}/failed`, {
        method: "POST", json: { note: "bounced — account closed" },
      });

      const row = (await sql(`SELECT status, note FROM referral_payout WHERE id = '${target.id}'`))[0];
      assert.equal(row.status, "failed");
      assert.match(String(row.note ?? ""), /bounced — account closed/,
        "the note is stored on the payment it explains");

      // Readable where the decision gets made — a note only visible in the
      // database tells next week's run nothing.
      const { body: history } = await requestJson(staff, "/api/ops/referrals/payouts/history");
      const listed = history.payouts.find((p) => p.id === target.id);
      assert.match(String(listed.note ?? ""), /account closed/, "and it comes back on the accountant's view");

      // The actor, through the mechanism ops already uses for who-did-what. No new
      // column, no new table, and no ceremony around it.
      const logged = await sql(
        `SELECT actor, action FROM audit_event WHERE entity_type = 'referral_payout' AND entity_id = '${target.id}'`,
      );
      assert.equal(logged.length, 1, "a reversal is recorded as an ops action");
      assert.ok(logged[0].actor && logged[0].actor !== "system", "with the staff member who did it");

      // And the money is back, which is the part that must never depend on the note.
      const revived = await sql(`SELECT status FROM referral_earning WHERE payout_id = '${target.id}'`);
      assert.equal(revived.length, 0, "the earnings detached from the failed payment");
    });

    await t.test("AC-44 — a reversal with no note is still a reversal", async () => {
      // The whole point of optional. If the absence of a note could block the
      // reversal, or leave something invented in the column, the field would be
      // mandatory in effect and the money would be hostage to a text box.
      const { body: queue } = await requestJson(staff, "/api/ops/referrals/payouts");
      const group = queue.ready.find((g) => g.name === "Queue Glazing");
      assert.ok(group, "the reversed earnings are owed again");
      const { body: paid } = await requestJson(staff, "/api/ops/referrals/payouts/mark-paid", {
        method: "POST", json: { userIds: [group.userId], reference: "TFR-NONOTE" },
      });

      await requestJson(staff, `/api/ops/referrals/payouts/${paid.paid[0].payoutId}/failed`, { method: "POST" });
      const row = (await sql(`SELECT status, note FROM referral_payout WHERE reference = 'TFR-NONOTE'`))[0];
      assert.equal(row.status, "failed", "no note, and it still reverses");
      assert.equal(row.note, null, "and nothing is invented to fill the column");
    });

    await t.test("§10.2 — the referrer screen is authed, and says so to an anonymous caller", async () => {
      // Specified as an authed endpoint. It answered 200 with an empty gate, which
      // is not a leak — there is nothing in that shape — but it is an account
      // endpoint telling a stranger it served them, and the dead `user ? … : null`
      // arms behind it were reachable only in the branch where `user` is null.
      const stranger = new Session(baseUrl);
      const response = await stranger.request("/api/account/referrals");
      assert.equal(response.status, 401, "an account endpoint must not answer 200 to someone with no account");
      const body = await response.json().catch(() => ({}));
      assert.equal(body.referrerGate, undefined, "and hands back nothing shaped like a screen");
      assert.equal(body.code, undefined);
    });

    await t.test("AC-5 — an internal account has no referral surfaces, details or not", async () => {
      // Staff and customers share the user table. Exclusion here is a different
      // axis from payability: a staff member may well have a valid ABN and bank
      // account and is still not a referrer, which is why this is NOT expressed
      // through payoutComplete — that predicate reads four detail fields and
      // nothing else, and widening it would blur a rule ACL s 49 depends on.
      const session = new Session(baseUrl);
      await login(session, "/api/auth", "gate.staff@example.com");
      await sql(
        `UPDATE user SET type='internal', abn='51824753556', payout_bsb='063000',
           payout_account_number='12345678', payout_account_name='A Tradie'
         WHERE email='gate.staff@example.com'`,
      );

      const response = await session.request("/api/account/referrals");
      assert.equal(response.status, 403, "an internal account must be refused the referrer screen outright");
      const rows = await sql("SELECT referral_code FROM user WHERE email='gate.staff@example.com'");
      assert.equal(rows[0].referral_code, null, "and no code may be issued into a staff user row");
    });


  } finally {
    await stop(server);
    await removeRunDir(runDir);
  }
});
