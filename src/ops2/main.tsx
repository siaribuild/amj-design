import { createRoot } from "react-dom/client";
import { Ops2App } from "./Ops2App";
import "./styles/index.css";

// No catalogue hydration, deliberately. src/ops/main.tsx waits on
// hydrateFromSanity() before it mounts because its Catalogue tab needs the
// products; the scaffold renders one holding screen and needs no data at all,
// and a boot that waits on a network call it does not use would make "did ops2
// load?" a question about Sanity.
createRoot(document.getElementById("root")!).render(<Ops2App />);
