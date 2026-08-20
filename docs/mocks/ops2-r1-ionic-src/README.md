# ops2 R1 mock — source

The mock the owner reviews is the single self-contained file one level up:
`docs/mocks/ops2-r1-ionic.html`. It opens on a phone from the filesystem with no
build step and no network. This folder is the source it was built from, kept so
the mock can be revised rather than re-derived.

    npm install
    npx vite build      # → dist/index.html, copy over ../ops2-r1-ionic.html
    npx vite            # dev server, for iterating

Built with `@ionic/react` 8.8.18 and `vite-plugin-singlefile`. It is a genuine
Ionic build: every bar, sheet, modal, list, segment, input, transition and the
dark palette are the framework's. `src/ops2.css` is the only stylesheet of ours
and contains no palette, no fonts and no radii — three functional rules and the
layout for the four things Ionic has no component for.

`src/elevation.tsx` is a port of `src/components/quote-project/Elevation.tsx`
from the customer site with the arithmetic unchanged; see its header for the two
deliberate differences.

## Before you rewrite a file in here

The mock is built from a scratchpad working copy and the result is *copied* into
this folder. That makes a one-way habit dangerous: **a fix committed here is
invisible to the next build unless it is pulled back first.** The switcher's
position was reverted exactly that way — the source was corrected in this folder,
the next rebuild came from a stale working copy, and the fix vanished. It had
already been made twice.

So, before rewriting any file here, run `git log --oneline -3 -- <path>`. It
costs nothing. **If a commit touched it that you did not author, read that
commit's message before overwriting** — the reason for a change usually lives
only there and in a comment, and both are easy to delete by accident.

And when you rewrite a block whose comment gives a *reason*, carry the reason
forward. Deleting "deliberately fixed to the top-right" and writing it back
unchanged is what made the regression invisible: by then the comment was the only
record of intent, and it was wrong.

This is not a stylistic note. Four regressions in this project have been of one
kind — scaffolding and edge cases, never the main design: a dev strip over the
primary action (twice here, and once a generation earlier in LEARNINGS.md 3), a
title that ellipsised while the spec claimed it never truncated, and file
controls wired to nothing. Those are the decisions nobody re-derives, so a
rewrite restores whatever the file happened to say last.
