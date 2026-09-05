- [low] F9: criterion 9 'attempts exhausted' clause absent from PARSE_OUTCOME_SQL - age-only predicate counts still-retryable processing rows as errors; likely deliberate per grill decision 9, divergence recorded
- [low] F10: migration 0064 backfills historical rows to 'upload' - pre-migration ops retries count as parses for up to 7 days post-deploy; self-correcting
- [declined] ponytail: collapse the one-source notification registry
  (NOTIFICATION_SOURCES/notificationCount) into `red ? 1 : 0`. The seeded
  multi-source shape is what the owner asked for at the grill (decision 8:
  orders-attention and customer messages plug in as further sources), and
  ponytail's own rule puts explicitly requested work off-limits.
- [declined] ponytail: `AI_CREDIT_FLOOR_USD` / `AI_CAP_CEILING_PCT` as vars.
  Owner ruled "values in vars" at the grill (Q11).
- [low] ponytail: `useMonitoring` parses the snapshot and then reads the same
  object raw for `redBalance`/`redCap`/`floorUsd`, because the parser vouches
  for the STORED shape and those three are added by the route. One wire-shape
  parser in the core would remove the second read. Not taken now: the parser is
  the whitelist that keeps stored fields from reaching the client (V-F4), and
  churning it needs its own red test.
- [low] ponytail: `.ops2-bell__badge` and `.ops2-tab-badge` share eleven
  declarations and differ in three. One shared selector plus two overrides.
- [low] ponytail: `capOutstanding` is a one-line subtraction with one caller.
  Kept under the "one place per fact" house rule; reviewer called it the
  developer's choice.
- [low] ponytail: `PLACEHOLDER_ACCOUNT_ID` is now unreachable — wrangler.jsonc
  commits the real account id, so no deployment can carry that literal. Kept as
  cheap insurance against a revert; the `!env.CF_ACCOUNT_ID` half still fires.
- [low] architecture: a monitoring failure and "nothing to notify" both show
  the bell as absent. Preserving last-known state or an explicit unavailable
  status would tell them apart. Not taken: inventing an alarm from a failed
  fetch is the worse error of the two.
