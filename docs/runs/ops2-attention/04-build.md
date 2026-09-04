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
