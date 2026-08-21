import { BrowserRouter, Route, Routes } from "react-router";
import { ops2RouterBase } from "../data/ops2Routing";
import { HoldingScreen } from "./HoldingScreen";

// The router's base, detected ONCE at boot from the URL the browser actually
// loaded (ADR 0002). During coexistence the Worker serves this bundle under
// /ops2, so the router mounts there; after switch-over it serves it at the
// root, so the router mounts at "/". Same bundle, both states — the rollout is
// a Worker deploy, and the client reads the result rather than being told.
//
// Read at module scope on purpose: the base is a property of how this document
// was served, not of where the user has navigated since, and recomputing it
// from a later location is how a router quietly re-bases itself mid-session.
const BASENAME = ops2RouterBase(window.location.pathname);

// One route, catching everything. Navigation is the next step of the build and
// this is deliberately not the place to start guessing at its shape: any
// address under the base renders the holding screen, so a deep link that
// survives Cloudflare Access lands on something rather than a blank page.
export function Ops2App() {
  return (
    <BrowserRouter basename={BASENAME}>
      <Routes>
        <Route path="*" element={<HoldingScreen basename={BASENAME} />} />
      </Routes>
    </BrowserRouter>
  );
}
