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
