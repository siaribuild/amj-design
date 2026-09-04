## T1 - Enquiries destination: union, registry entry, icon, navigation test

Files: src/ops2/nav/destinations.ts, src/ops2/nav/icons.ts,
scripts/tests/ops2-navigation.test.mjs.

Test asserts (in "the destination list is the owner's, in his order and
his two sections", scripts/tests/ops2-navigation.test.mjs:41):
DESTINATIONS now includes ["workspace","Enquiries","/enquiries"] right
after Customers; TAB_DESTINATION_IDS stays ["attention","projects","products"].

Implementation: "enquiries" added to DestinationId union; Destination
entry (path /enquiries, blurb "Incoming enquiries that are not yet
projects.") inserted after customers; DESTINATION_ICON gains
enquiries: chatbubblesOutline. TAB_DESTINATION_IDS, HOME_PATH,
NESTS_BELOW untouched.

npm run test:ops2: 92/92 pass. npm run typecheck:gate: green
(Record<DestinationId,string> compiles clean — criterion 15 proof).

Next task: Enquiries is registered as a destination but has no route/
placeholder page wired yet (Ops2App.tsx untouched by this task).

## T2 - Attention model (pure) + new node suite + script wiring

Files: src/ops2/attention/attention.ts (new), scripts/tests/ops2-attention.test.mjs
(new, esbuild-bundles attention.ts + projects/queue.ts + nav/destinations.ts),
package.json (test:ops2 gains the new file).

Exports parseSummary (strict-degrades on degraded:true/missing key/non-number)
and attentionGroups (3 fixed groups, zero-row and all-zero-group suppression,
[] on all-six-zero). Hrefs built from destination(id).path; Projects rows
carry ?wait=us|customer per design §3 table. 8 tests cover design §10 criteria
1,3,4,5,18(model),7,11,12 + number-leading labels.

npm run test:ops2: 100/100 pass. npm run typecheck:gate: green.

Next task: attentionGroups/parseSummary have no caller yet — no route, no
component, no fetch of the summary body wired in.

## T3 - useSummary hook, AttentionPage, route branch, group CSS

Files: src/ops2/attention/useSummary.ts (new), AttentionPage.tsx (new),
styles/attention.css (new, wired into styles/index.css), Ops2App.tsx
(route ternary gains attention branch), ops2-attention.test.mjs,
ops2-navigation.test.mjs.

New test: AttentionPage structural source-regex (section.att-group,
RowList/Row edge=null + onActivate->history.push, pq-skeleton/-empty/-error,
attention-error testid, no load.counts in error block, no activeOrders/
customers). Driven red against a stub AttentionPage before the real page
was restored — the full page had to exist first to satisfy the nav
suite's already-red test, so Probity blocked adding this test until I
stubbed the page back down to get genuine red.

npm run test:ops2 (both suites): 9/9 + 13/13 pass. typecheck:gate: green.

Next task: useSummary.ts has no dedicated structural test of its own
(only exercised indirectly) — same red-first constraint applies if one
is added later.
