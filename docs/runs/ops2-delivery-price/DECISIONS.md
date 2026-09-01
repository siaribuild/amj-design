# Decisions needed — ops2 delivery price

Answer inline with `A:`. **When answered, copy the answers into `00-ask.md`** —
this file was lost once before (see D11–D15), because the spec stage does not
read it.

Each already has a recommendation baked into `01-spec.md` §4 as `ASSUMED:`.
Silence means the recommendation stands.

1. **Does the price slide-out show where the job is going?**
   Recommendation: **no** — the amount field only. It keeps D3 and D12 clean and
   the panel is a dignified blank the staffer types into. Say yes and it becomes
   one read-only line ("Richmond 3121"), no extra request.
   A:

2. **Can `Address line 2` be cleared?**
   Recommendation: **yes** — it is a genuinely optional line (unit number, "rear
   of"), and a wrong one that cannot be removed is worse than an empty one. D14
   ("never blanked") still binds line 1, suburb, state and postcode.
   A:

3. **Is `State` a fixed AU state/territory picker or free text?**
   Recommendation: **fixed picker** (NSW VIC QLD SA WA TAS NT ACT). It is
   paperwork, it is never an input to zone resolution, and free text produces
   `Vic`/`VIC`/`Victoria` in the same column.
   A:
