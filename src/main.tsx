import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { hydrateFromSanity } from "./data/sanity";
import "./styles/index.css";

// Load the catalogue from Sanity (if configured) before first render, so the
// synchronous selectors serve live content. Falls back to the built-in catalogue.
hydrateFromSanity().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
