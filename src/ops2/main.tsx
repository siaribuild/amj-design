import { createRoot } from "react-dom/client";
import { Ops2App } from "./Ops2App";
import { catalogueReady } from "./catalogue";
import "./styles/index.css";

// THE CATALOGUE IS LOAD-BEARING HERE, which it was not when this file said the
// scaffold needed no data at all.
//
// Every row of a project record draws its opening — `Elevation` resolves the
// family through `getProductBySlug(productSlug)` — so an unhydrated console
// draws the fallback frame on every line, which is a picture of eighteen
// identical windows for a job that has none.
//
// IT IS STARTED HERE AND AWAITED IN THE RECORD, not awaited here. Blocking the
// mount on it cost every page load ~2.9s before anything rendered — measured —
// because an environment that cannot reach Sanity pays the whole 2500ms cap
// every time. Punishing Attention, Products and the queue for a dependency only
// the record has is a worse failure than the flicker it prevented.
//
// Only this. NOT site settings (the customer's branding) and NOT the
// offerability check (the customer picker's filter): one outbound request, the
// same public catalogue query the customer site sends, built from constants so
// no project, customer or line identifier can ride on it.
// The request starts here — importing the module kicks it off — and the console
// mounts without waiting for it. `./catalogue` carries the full reasoning and
// the measurement that changed it.
void catalogueReady;
createRoot(document.getElementById("root")!).render(<Ops2App />);
