import { createRoot } from "react-dom/client";
import App from "./app/App";
import { hydrateFromSanity, hydrateSiteSettings, hydrateOfferabilityFromApi } from "./data/sanity";
import "./styles/index.css";

// Load the catalogue AND site settings (logo/favicon) from Sanity (if configured)
// before first render, so the synchronous selectors + header serve live content.
// Both race a short timeout and fall back to the built-in catalogue/wordmark.
//
// Offerability rides along (from our own Worker, not Sanity) so the quote
// builder's picker is filtered on its first paint rather than after a flicker.
// allSettled, so a failure in any one of the three still renders the app — the
// picker simply stays unfiltered, which is the documented fail-open.
Promise.allSettled([hydrateFromSanity(), hydrateSiteSettings(), hydrateOfferabilityFromApi()]).finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
