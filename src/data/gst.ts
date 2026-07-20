// GST display preference. Catalogue prices are stored GST-INCLUSIVE (AU 10%);
// a signed-in account can choose to see estimates ex-GST. Guests always see inc.
import { createContext, useContext } from "react";

export type GstMode = "inc" | "ex";
export const GST_RATE = 0.1;

// Provided by App from the signed-in user's preference; "inc" for guests/default.
export const GstContext = createContext<GstMode>("inc");
export const useGstMode = () => useContext(GstContext);

/** Adjust a GST-inclusive amount for the chosen display mode. */
export const gstAdjust = (incAmount: number, mode: GstMode) =>
  mode === "ex" ? incAmount / (1 + GST_RATE) : incAmount;

/** Short label to sit beside a displayed price. */
export const gstSuffix = (mode: GstMode) => (mode === "ex" ? "ex GST" : "inc GST");
