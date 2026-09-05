# Assumptions made while the owner was away — for screening

The owner stepped away mid-run with: *"proceed as per plan, engage codex for
reviews for major pieces. Make grounded assumptions where required, surface them
to me for screening at the end."* Every judgement call taken on his behalf is
listed here. Nothing below was approved by him.

Ordered by how much it would cost to have got wrong.

## 1. Cloudflare reports money in DOLLARS — UNVERIFIED, and a 100× error is live

`credit-balance.balance` and `usage-history[].aggregated_value` are the two
figures the money cards show. **Cloudflare documents no unit for either** — not
in the API reference, not in the generated SDK types, not in the docs prose.
The circumstantial evidence points both ways: the deprecated sibling in the same
billing namespace (`spending-limit.config.amount`) is explicitly *cents*, while
the Unified Billing and spend-limit pages talk in dollars.

The code treats both as dollars. If that is wrong, both cards read 100× high.

**How to settle it in ten seconds:** after the token is set, the first cron run
writes a snapshot; a balance you know to be about $12 rendering as `$1234.00`
means the unit is cents. Fix is one division in `fetchMoneyNumbers`.

The account-level cap (`config.amount`) is the one documented unit and IS
converted from cents.

## 2. `CF_ACCOUNT_ID` committed as a plain var

`c3834ff3509fa7cb4c9769a6dee6c2d8`, confirmed with `wrangler whoami` (DRG
Group). Treated as non-secret because this same value is already committed a few
lines above it in `wrangler.jsonc` as the container image's registry namespace.
The **token** remains a secret and is not set — see "What you still have to do".

## 3. Counting claims, not documents — you ruled this, but the record lagged

You accepted "one parse event = one claim lifecycle" at the spec gate. The
`00-ask.md` grill record still carried the original "one document == one parse"
wording, and a reviewer duly reported the implementation for disobeying it. The
line is now struck through in place rather than rewritten, so the supersession
is visible rather than tidied away.

## 4. The window is seven Melbourne calendar dates, not a rolling 7×24h

The design specified a rolling 7×24h window AND a seven-calendar-day chart whose
buckets must sum to the cards. Those cannot both hold — a rolling window spans
parts of eight dates. Chosen: seven calendar dates (today and the six before),
so the cards describe exactly what the chart shows. Cost: between 0 and 24 hours
less history than "7×24h" would give, depending on the time of day.

## 5. The monitoring endpoint refuses everyone with 403

It briefly answered 401 to a caller with no session so the panel could say "sign
in" rather than "not for you". The panel renders one message for both, and in
production Cloudflare Access turns anyone away before the Worker sees them — so
the split cost a second identity round-trip per denial and was never read. It
now refuses like the other 41 ops routes. Reversible in a few lines if you want
the distinction actually built.

## 6. Two reviewer findings declined on your behalf

- **Collapse the one-source notification registry.** Declined: you asked at the
  grill for the subsystem to be seeded so orders-attention and customer messages
  plug in later without rework.
- **Stop shipping the floor/ceiling as vars.** Declined: you ruled "values in
  vars".

Everything else the reviewers raised was either fixed or recorded in `DEBT.md`
with a reason.

## 7. Tests I edited rather than satisfied

Three, each because the assertion pinned the defect rather than the behaviour.
Called out because "developer edits the failing test" is normally the smell it
sounds like:

- the SQL-verbatim assertion pinned the rolling window that finding V-F2 was
  about;
- the Cloudflare fixtures encoded the response shapes that do not exist;
- the F3 assertion required BOTH money cards to redden from one shared flag,
  which is what the per-card finding overturned.

## 8. Work left in the tree that is not mine

The branch is cut from `feat/ops2-attention` (591a912d), which is under review
and unmerged — this feature's cards are appended to that page, per your
instruction. Also, ~43 modified `src/` files from another session's design-system
work sit uncommitted in this shared working tree; one commit of mine swept them
in by accident and was rebuilt to exclude them. Codex reviewed the working tree,
so one of its findings (`theme.css` shadow tokens self-referencing through
`@theme inline`, which kills card/dialog/drawer shadows) belongs to **that**
work, not this feature. Worth passing on: it looked real.

## What you still have to do before this works in production

1. `wrangler secret put CF_MONITORING_TOKEN` — a Cloudflare API token with
   **AI Gateway: Read** and **Account Analytics: Read**. Until it is set, the
   two money cards say "Unavailable. No Cloudflare token configured" and the
   parse counts still work.
2. Check the first snapshot for the unit question in §1.
3. Decide whether `feat/ops2-attention` merges first (it should — this branch
   sits on it).
