import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { hydrateFromSanity, hydrateSiteSettings } from "./data/sanity";
import "./styles/index.css";

// Load the catalogue AND site settings (logo/favicon) from Sanity (if configured)
// before first render, so the synchronous selectors + header serve live content.
// Both race a short timeout and fall back to the built-in catalogue/wordmark.
Promise.allSettled([hydrateFromSanity(), hydrateSiteSettings()]).finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
