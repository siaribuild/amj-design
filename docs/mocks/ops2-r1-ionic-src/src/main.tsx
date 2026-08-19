import { createRoot } from "react-dom/client";
import { setupIonicReact } from "@ionic/react";
import App from "./App";

/* Ionic's own stylesheet set, unmodified. */
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";
import "@ionic/react/css/padding.css";
import "@ionic/react/css/text-alignment.css";
import "@ionic/react/css/flex-utils.css";
/* Ionic's own dark palette, following the OS setting. Not a hand-rolled one:
   the whole point is that the theme is the framework's. */
import "@ionic/react/css/palettes/dark.system.css";

/* ops2's own layer — layout Ionic has no component for, plus three functional
   overrides. No palette, no fonts, no radii, no shadows. */
import "./ops2.css";
import "./ops2-record.css";
import "./ops2-line.css";

setupIonicReact({
  /* R-164: focus a heading on every navigation — Ionic config, not our code. */
  focusManagerPriority: ["heading", "content"],
  swipeBackEnabled: true,
});

/* No StrictMode. Ionic's components are Stencil custom elements that cache
   ancestor references in connectedCallback, and StrictMode's deliberate double
   mount left them holding references to the discarded first mount. Worth
   recording as a real constraint on the adoption, not a mock artefact. */
createRoot(document.getElementById("root")!).render(<App />);
