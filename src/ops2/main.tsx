import { createRoot } from "react-dom/client";
import { Ops2App } from "./Ops2App";
import { hydrateFromSanity } from "../data/sanity";
import "./styles/index.css";

// THE CATALOGUE IS LOAD-BEARING HERE, which it was not when this file said the
// scaffold needed no data at all.
//
// Every row of a project record draws its opening — `Elevation` resolves the
// family through `getProductBySlug(productSlug)` — so an unhydrated console
// draws the fallback frame on every line, which is a picture of eighteen
// identical windows for a job that has none.
//
// The pattern is src/ops/main.tsx's, deliberately, and its properties are the
// reason: `hydrateFromSanity()` never throws and races a 2500ms timeout
// (src/data/sanity.ts), so an unreachable CMS delays the mount and nothing
// more — the console then runs on the built-in catalogue, which resolves every
// slug the snapshot knows and falls through to a fixed frame for one it does
// not. `.finally` rather than `.then`: a rejected hydration must still mount.
//
// Only this. NOT site settings (the customer's branding) and NOT the
// offerability check (the customer picker's filter): one outbound request, the
// same public catalogue query the customer site sends, built from constants so
// no project, customer or line identifier can ride on it.
hydrateFromSanity().finally(() => {
  createRoot(document.getElementById("root")!).render(<Ops2App />);
});
