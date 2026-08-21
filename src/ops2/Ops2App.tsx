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

// TWO decisions live in this one argument list, and they pull in opposite
// directions. The first version of this file stated the case for the default
// and then passed nothing at all — which silently took the default for the
// other one too, and that one is a requirement.
//
//   focusManagerPriority — EXPLICIT, and must stay so. R-164 requires focus to
//   move on navigation; Ionic leaves this UNSET by default, which means focus
//   does not move at all. The rule is satisfied by configuration rather than by
//   anything the shell implements, so a bare call turns an accessibility
//   guarantee off with nothing to show for it — no error, no visual difference,
//   nothing a screenshot could catch. The order is the behaviour: the incoming
//   view's heading first, its content as the fallback. Specified at
//   `docs/design/ops2-ionic-boundary.md` line 92 (on `design/ops2-planning`),
//   and among the behavioural rules ADR 0005 says Ionic hosts rather than
//   replaces. Pinned by scripts/tests/ops2-frame.test.mjs.
//
//   mode — DEFAULT, and must stay so. Ionic picks the iOS idiom on an iPhone
//   and Material elsewhere, and that dual idiom is what the owner judged on his
//   own phone when he ruled for adoption (ADR 0005 keeps it as an explicit
//   ASSUMED). Pinning a mode here would overturn a decision he made on a
//   device, from a config file.
//
// With one catch-all route the focus manager has nothing to do yet. It is set
// now so the foundation is right before navigation arrives, not because it
// changes anything visible today.
setupIonicReact({ focusManagerPriority: ["heading", "content"] });

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
