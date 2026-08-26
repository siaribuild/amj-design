# 0012 — OTP attempt counter stays in KV; the atomic counter is its own change

Status: accepted — architect ruling, 2026-08-26, on hotfix `fix/guest-otp-attempt-cap`.
Corrected 2026-08-26: the first version of "Residual risk" called the residual
"bounded, noisy and expensive"; a Codex review of this document showed two of
those three words were wrong, and the section now carries the arithmetic.

## Context

`POST /api/guest/track/verify` had no attempt cap at all: a 6-digit code guarding
owner-equivalent access, brute-forceable in hours from one machine. The hotfix
collapses guest tracking's duplicated verifier into the one `consumeChallenge`
in `worker/lib/auth.ts`, so guest inherits `MAX_OTP_ATTEMPTS = 5`.

Codex finding (F0): `consumeChallenge` is read → check → write over Workers KV,
which has no atomic increment and reads up to 60s stale across locations, so N
genuinely concurrent guesses can cost the attacker one increment. The 5-attempt
budget bounds a SERIAL attacker only. F0 is pre-existing: `consumeChallenge`
has worked this way on `main` for customer sign-in all along; this branch made
it visible by depending on the shared primitive. A local measurement (100
concurrent guesses, zero lost updates) was correctly disqualified by the
developer: local KV is in-process and strongly consistent, so it cannot exhibit
the production race.

## Decision

1. **The hotfix ships with the counter in KV**, its bound documented as
   serial-only at the constant — which the diff already does. The guest path
   goes from unbounded to serial-bounded; sign-in and ops are byte-identical to
   `main`.
2. **The enforceable counter is a separate, tracked change, not a deferral by
   silence.** Done right it moves the *whole challenge record* (hash, attempts,
   expiry) into D1 — one place per fact; a D1 attempts column beside a KV hash
   splits one challenge's state across two stores. Increment via
   `UPDATE otp_challenge SET attempts = attempts + 1 WHERE key = ? AND attempts < ?`
   checked with `changes()`. It touches all three auth paths and needs a
   migration (a NEW table: no children, no cascade or rebuild risk, but it still
   runs under the d1-migration-safety procedure), its own concurrency
   acceptance criterion, and a test that can actually fail (forced interleaving
   or the `changes()` contract — not a local KV burst, which proves nothing).
3. The **issuance counters stay in KV permanently** (`otpc:`, `otpip:`,
   `gvip:`) — see below.

## Why not D1 in the hotfix

- **Blast radius**: three auth paths plus a schema change, on a branch whose
  whole justification is collapsing onto an already-tested primitive.
- **One place per fact**: the counter alone in D1 is split-brain; the whole
  record in D1 is a designed change (expiry semantics, cleanup, three suites),
  not a hotfix.
- **Urgency asymmetry**: `main` serves the unbounded verifier today. Every hour
  of delay preserves a strictly worse state than the concurrency residual.

## The DoS objection, re-examined — it does not transfer verbatim

`challengeSourceAllowed`'s comment refuses D1 on the unauthenticated path as
"a cheaper denial-of-service than the one being prevented". That objection is
about counters keyed on **attacker-chosen input** (source IP, any typed
address): an unbounded key space, so a D1 counter there means attacker-driven
row creation at line rate. It does **not** apply to the attempt counter: an
attempts row exists only per *issued* challenge — issuance requires a matched
record and is capped at 5 per record per 15 minutes — and the verify path is
UPDATE-only against that bounded set, behind the existing per-IP 429, on an
endpoint that already runs a D1 SELECT (`matchRecord`) on every request and an
INSERT (`guest_grant`) on success. The follow-up change must not be blocked by
reading that comment as a blanket rule; equally, it must not migrate the
issuance counters, where the objection still holds in full.

Durable Objects would also solve F0 but are not in this project; introducing a
new platform primitive is a larger step than using the D1 already bound, for no
additional guarantee this counter needs.

## Residual risk accepted until the follow-up lands

The design imposes **no total bound** on a concurrent attacker. Under the race,
a round of N overlapping wrong guesses costs ONE increment, so every per-record
counter dilutes by the concurrency it faces and the numbers work out as:

    serial attacker   5 attempts × 5 codes = 25 guesses / record / 15 min
                      ≈ 2,400/day → even odds on a 10^6 code in ~10 months
    concurrent        per-record caps dilute ×N; the only remaining brake is
                      the per-IP verify cap: 60/hr ≈ 15 guesses / IP / 15 min
                      ≈ 1,440 / IP / day
    even odds         ≈ 0.7M guesses (each code is freshly random, so guesses
                      are with-replacement trials) ≈ 480 IP-days:
                      100 IPs ≈ 5 days · 1,000 IPs ≈ half a day

The IP count is an attacker-chosen input, and a thousand source addresses is a
cloud account, not a botnet. Every counter on this path — attempts, issuance,
per-IP — is the same get-compare-put over KV, so all figures above are serial
floors, not ceilings.

What actually protects the surface today, in order of how well it survives a
distributed attacker:

1. **The victim's inbox.** Sustaining the attack requires issuing ~20 codes an
   hour (~480 emails/day) to the real customer — the one control concurrency
   cannot dilute. It is a detection channel, not a prevention.
2. **The issuance cap** (5 codes/record/15 min) — the fixed ×25 in the serial
   figure; itself racy.
3. **The per-IP verify cap** — a price in rented IPs, not a bound.
4. **The attempt cap** — the ×5; a serial bound only. Against a distributed
   attacker it is close to last, not first.

What the branch removes is the **silent single-machine attack**: on `main`, one
machine grinds an uncapped code at line rate with a handful of emails to the
victim in total — even odds in hours, quietly. The deploy conclusion stands,
because loud-and-IP-priced is strictly better than quiet-and-free at every N —
but "expensive" is the attacker's choice, not this design's property, and the
follow-up (apertly #12) is priced accordingly: **next scheduled security work,
not backlog**.

## The class, generalised — absence must mean deny

Added 2026-08-26 after a third instance was found on the same branch. The first
two were counters (the attempt cap, the per-IP cap). The third was not a counter
at all, which is why the pattern is worth naming rather than the instances.

P3 burns the challenge on the fifth failure so that "start over" can issue a
fresh code immediately. `challengeAllowed` decides from `KV.get(ch.key)`:
**absence** means "no live code, allow the resend". So the fix depended on a
delete being visible to the very next read — and KV does not offer that.

**The proposed repair does not work, and the reason is worth recording.** The
suggestion was to derive the answer from something *present* — mark the record
spent rather than delete it, so a stale read still says "spent". It fails
because `at` is written once at issuance and never updated (measured: `at`
before a failed attempt equals `at` after), so **every version of the record
carries the same `at` and therefore the same cooldown answer**. The alternative
to seeing the newest write is not "seeing nothing", it is seeing
`{attempts: 4}` — the previous version, which is not spent. A spent marker is
itself the newest write and carries exactly the same propagation delay as the
delete. The two are equally reliable; the marker relocates the dependency
instead of removing it.

Generalised, the unimplementable requirement is: **a control whose answer must
flip from deny to allow because of a write made by a different, immediately
preceding request.** That needs read-your-writes. It belongs in the follow-up
(apertly #12) with the attempt counter, not in a third KV workaround.

The discriminator that separates the safe sites from the unsafe ones:

> **Absence must mean deny.** Every unsafe instance is one where a missing key
> grants something.

Applied to `worker/lib/auth.ts`:

| Site | Absence means | Safe? |
|---|---|---|
| `challengeAllowed` cooldown read | allow issuance | **no** — the P3 instance |
| `challengeAllowed` issuance counter | count 0 → allow | **no** — a stale absence grants extra codes |
| `withinCap` (per-IP verify, trade caps) | count 0 → allow | **no** — same class |
| `consumeChallenge` `if (!raw)` | refuse the code | yes — fails closed |

The verify path is clean throughout: absent, unparseable, wrong-shape, expired
and capped all deny. **Every unsafe site is on the issuance path.** Outside this
file, same class and out of scope here: `destroySession` makes single-session
logout depend on a delete propagating (sign-out-all is safe, because
`resolveUser` also checks `session_epoch` from D1); `parse.ts`'s lock,
`enquiries.ts` and `files.ts` all grant on absence. `staff.ts` and `ops.ts` read
caches where absence triggers recompute — safe.

**What shipped instead.** The burn stays: it removes a distinguishable state and
frees the key, and it does clear the cooldown in the common same-colo case. It
is simply not depended upon. The customer-facing promise moved to the client,
which knows when it last asked for a code and can count down from that without
any server round trip and without revealing whether a record exists. It clocks
from response receipt, one network hop later than the server's own issue time,
so it always over-estimates rather than races. Exact for the single-user flow
that produced the bug; an over-estimate if a code was issued in another tab.

## Deploy-window effects

Two, both benign, both customer-visible, neither previously written down.

1. **Guest codes in flight will not verify.** The guest key namespace moved from
   `gcode:{email}:{ref}` to `gcode:{email}:{projectId}`, so a code emailed
   before the deploy looks up a key that does not exist. It answers the ordinary
   neutral 400 — no crash, no oracle — and the customer asks for another. Bounded
   by the 10-minute TTL.
2. **Pre-upgrade records parse as garbage.** Guest tracking stored a bare hex
   hash where an `OtpRecord` now lives; `consumeChallenge` treats an unreadable
   record as absent and clears it rather than throwing a 500.

Sign-in and ops are unaffected in both cases: their keys, hashes and counter keys
are byte-identical to `main`, verified by bundling both revisions against one KV
— an old-issued code verifies under new, and a new-issued code verifies under
old, so the rollback is as safe as the deploy.

## Known, not defects

- **The `/track/request` timing gap widened.** Resolving the record before the
  issuance gate means a miss returns before any KV work. Measured 1.29× (15.9ms
  vs 20.5ms) against 1.15× before the reorder, with a no-op mail transport —
  production will be wider, because only the hit path awaits a real send. The
  neutrality of this endpoint was always a property of the response body, never
  of its timing.
- **Unconfirmed, offered as a hypothesis.** The same reordering means a matching
  pair does one extra KV get before its 400 on `/track/verify` where a
  non-matching pair does not, which could in principle distinguish "this pair
  names a real record". Measured 1.00× locally, which means nothing: local KV is
  in-process, and on production KV that get is a network round trip.
