import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { Route } from "react-router-dom";
import { ops2RouterBase } from "../data/ops2Routing";
import { HoldingScreen } from "./HoldingScreen";

// `react-router-dom` is v5 here, and that is deliberate: Ionic 8's router peers
// on React Router 5 while the customer site stays on 7. Never import the bare
// `react-router` specifier in this directory — it resolves to v7, type-checks,
// runs in dev, and produces a second router context in the built bundle, which
// looks like links that quietly do nothing. `scripts/tests/ops2-deps.test.mjs`
// is the guard; `docs/design/ops2-ionic-boundary.md` §2 (on the
// `design/ops2-planning` branch) is the design.

// Ionic decides its platform mode here — iOS idiom on an iPhone, Material
// elsewhere. Left at the default on purpose: that dual idiom is what the owner
// judged on his own phone when he ruled for adoption.
setupIonicReact();

// The router's base, detected ONCE at boot from the URL the browser actually
// loaded (`docs/adr/0002-ops2-path-routing-not-hash.md`, on the
// `design/ops2-planning` branch — not this branch's 0002, which is unrelated).
// During coexistence the Worker serves this bundle under /ops2, so the router
// mounts there; after switch-over it serves it at the root, so the same bundle
// mounts at "/". The rollout is a Worker deploy and the client reads the result
// rather than being told.
//
// Read at module scope on purpose: the base is a property of how this document
// was served, not of where the user has navigated since, and recomputing it
// from a later location is how a router quietly re-bases itself mid-session.
const BASENAME = ops2RouterBase(window.location.pathname);

// One route, catching everything. Navigation is the next step of the build and
// this is deliberately not the place to guess at its shape: any address under
// the base renders the holding screen, so a deep link that survives Cloudflare
// Access lands on something rather than a blank page.
//
// IonRouterOutlet rather than a bare Switch even for one route — it is the
// component that owns Ionic's page stack and transitions, and starting without
// it means the first real navigation is also the first time the shell is
// exercised.
export function Ops2App() {
  return (
    <IonApp>
      <IonReactRouter basename={BASENAME}>
        <IonRouterOutlet>
          <Route path="/" render={() => <HoldingScreen basename={BASENAME} />} />
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
}
