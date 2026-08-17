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
