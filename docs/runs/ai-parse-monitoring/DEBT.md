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

## Round-6 reviewer findings not taken, with reasons

- [declined, twice more] architecture + ponytail: the notification registry
  lives in `worker/lib/monitoring.ts` and carries an AI snapshot, so a future
  orders or messages source would depend on AI monitoring. Ponytail says delete
  it; architecture says move it to a neutral notifications module. Both are
  right about the shape and both are overruled by the same owner decision
  (grill decision 8: seed the subsystem so later sources append without
  rework). Recorded a third time because two independent reviewers now agree —
  worth the owner's second look, not the developer's.
- [low] architecture: `useNotificationCount` returns 0 for a failed fetch, so
  the bell cannot tell healthy-zero from unavailable and a failed first load
  silently removes the warning. Not taken: inventing an alarm from a failed
  fetch is the worse error, and an explicit unavailable state is a UI decision
  the v1 bell (a number) has nowhere to put.
- [low] architecture: the route's payload has no shared typed parser — the
  client redeclares the enriched shape and reads the extra fields raw.
- [low] ponytail: `useMonitoring` and `useNotificationCount` keep two caches
  over the SAME endpoint, so the Attention page fetches `/api/ops/monitoring`
  twice at desk width and throws away the `notificationCount` already in its
  own response. One request could serve both.
- [low] ponytail: `useNotificationCount`'s hand-rolled subscriber Set is
  `useSyncExternalStore`'s job.
- [low] ponytail: `melbourneOffsetMs` reconstructs an offset that
  `Intl.DateTimeFormat` reports directly via `timeZoneName: "longOffset"`.
  Deliberately not touched late: the current version is proved across three
  timezones by test, and timezone maths is not where to take an unforced risk.
- [low] ponytail: `evaluateRed` is a thin wrapper over `evaluateRedFlags`, and
  `capOutstanding` is a one-line subtraction with one caller. Both kept under
  the "one place per fact" house rule.
