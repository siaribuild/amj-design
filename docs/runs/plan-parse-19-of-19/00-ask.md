# Ask

Continue from Codex baseline `72d4571f` and improve the parallel `agentic_full`
opening parser toward 19/19 accuracy without changing the proven
`auto_drawings` path.

The implementation follows
`opening-extraction-agentic-hybrid-run.md`: deterministic harvest, one
face-batched agent loop, deterministic rails, and bounded escalation only for
flagged openings.

Owner rules:

- Document layouts and contents vary. Reference opening tags are test data,
  never production branches.
- Schedule dimensions are authoritative; drawings refine composition, room,
  elevation and orientation.
- A scheduled operation must remain present in the refined composition. For
  example, AWNING may refine to AWNING + FIXED, but not silently to FIXED.
- A clearly identified document conflict is an ops warning. A warning does not
  block quote submission unless the existing severity policy already says it
  is critical.
- `double glazing = no` means double glazing is not required, not prohibited.
  Double glazing remains an eligible upgrade.
- The final split takes the exact remainder of the scheduled dimension.
- The legacy parser and deployment-time mode switch remain intact.

The reference set has 19 schedule openings. W1 is a non-50/50 split; W8, W10
and D1 are regression cases. Their expected values belong only to the accuracy
fixture.
