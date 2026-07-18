import { createRoot } from "react-dom/client";
import { OpsApp } from "./OpsApp";
import { hydrateFromSanity } from "../data/sanity";
import "../styles/index.css";

// Same catalogue hydration as the customer app (used by the Catalogue tab).
hydrateFromSanity().finally(() => {
  createRoot(document.getElementById("root")!).render(<OpsApp />);
});
