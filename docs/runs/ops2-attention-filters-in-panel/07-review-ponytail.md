`queue.ts:L99,L163-181`: **yagni:** the whole `ATTENTION_ARRIVALS` mapping table and the `AttentionKey` type exist only because one card is named `readyToIssue` where its refinement is `ready` — three of four entries map a key to itself. Emit `?attn=ready` from the card instead and it collapses to `export const ATTENTION_ARRIVALS = ["submissions","inReview","ready","awaitingPayment"] as const satisfies readonly RefinementKey[]`, `arrivalQuery = (k: ArrivalKey): QueueQuery => ({ chip: "all", refinements: [k], search: "" })` (the `.find(...)!` non-null assertion goes with it), `attentionFromSearch` becomes an `.includes()`, and `AttentionKey` becomes `typeof ATTENTION_ARRIVALS[number]`. ADR 0020 says one axis; a second key space with one alias in it is the axis growing back as a naming convention. Touches `attention.ts` `PROJECT_NOUNS`/`href` and the `?attn=readyToIssue` assertions in `ops2-projects.test.mjs:L478`, `ops2-projects.spec.ts:L196,L253`.

`scripts/tests/ops2-projects.test.mjs:L523-541`: **delete:** "the attention axis is gone from the model's own source" — a source-text grep with a hand-rolled comment stripper, asserting symbols that no longer exist to be imported and a field TypeScript already removed from `QueueQuery`. Its own comment scopes it to one file "until the tasks that touch them land", and those tasks landed. `typecheck:gate` plus the tests that actually call `arrivalQuery`/`refinementStates` cover criterion 18. Nothing replaces it.

`ProjectsPage.tsx:L104-147`: **shrink:** two effects on the same location, the second re-parsing `location.search` to find out what the first just did. One effect, same behaviour, and the `arrivalRef.current === true` skip branch disappears because the `attn` branch returns before it:
```ts
useEffect(() => {
  if (location.pathname !== PROJECTS.path) {
    if (arrivalRef.current === true) arrivalRef.current = false;
    return;
  }
  if (new URLSearchParams(location.search).has("attn")) {
    const key = attentionFromSearch(location.search);
    setQuery(key ? arrivalQuery(key) : EMPTY_QUERY);
    history.replace(PROJECTS.path);
    arrivalRef.current = key ? true : null;
    return;
  }
  if (arrivalRef.current === false) { arrivalRef.current = null; setQuery(EMPTY_QUERY); }
}, [location.pathname, location.search, location.key]);
```
Comments stay as they are — house rule, they are not code.

`ProjectsPage.tsx:L102`: **question, not a cut:** now that an arrival sets an ordinary refinement indistinguishable from a hand-ticked one (ADR 0020, and the CSS comment says exactly that), `arrivalRef` is the last thing in the codebase that still treats it as special — a hand-ticked `submissions` survives leaving the route, an arrived-at one does not. If criterion 11 only forbids *opening narrowed on plain rail navigation*, the ref and its second effect are ~20 lines of state machine defending a distinction the feature deleted. Owner's call, not the reviewer's: don't cut without it.

Not flagged, checked and sound: the panel-footer `:has(ion-list)` pinning needs both `margin-top: auto` (short list) and `position: sticky` (long list) — neither is redundant; `.pq-active__names { min-width: 0 }` is load-bearing on a flex child; the settled-bounds read in the skeleton spec is one guard against a measured race, not belt-and-braces.

net: -39 lines possible.