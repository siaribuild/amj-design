// Enquiry helpers — pure, unit-testable. Reference formatting, phone
// normalisation (AU), and branch validation for the Contact page fork.
import { isEmail } from "./auth";
import { normalizePhone } from "../../src/data/phone";

export const ENQUIRY_INTENTS = ["question", "appointment_request"] as const;
export type EnquiryIntent = (typeof ENQUIRY_INTENTS)[number];
export const BEST_TIMES = ["anytime", "morning", "afternoon", "evening"] as const;

// The deployed form contract version, stamped onto every submission for
// attribution/debugging. Bump when the fields materially change.
export const FORM_VERSION = "contact-2026-08";

export const enquiryReference = (year: number, seq: number) =>
  `OF-ENQ-${year}-${String(seq).padStart(6, "0")}`;

// AU phone normalisation lives in src/data/phone.ts — ONE implementation shared
// by the Worker and the browser bundle (spec §7.2). Re-exported here so the
// enquiry route and its callers keep importing it from where they always did.
export { normalizePhone } from "../../src/data/phone";

export interface EnquiryInput {
  intent?: string;
  name?: string;
  email?: string;
  phone?: string;
  privacyConsent?: boolean;
  // question
  message?: string;
  // appointment
  locationId?: string;
  bestTimeToCall?: string;
}

// Returns the list of invalid field keys ([] when the submission is acceptable).
// `locationActive` is decided by the server against the live registry.
export function validateEnquiry(input: EnquiryInput, locationActive: boolean): string[] {
  const errors: string[] = [];
  if (!ENQUIRY_INTENTS.includes(input.intent as EnquiryIntent)) errors.push("intent");
  if (!String(input.name ?? "").trim()) errors.push("name");
  if (!input.privacyConsent) errors.push("consent");

  const emailTrimmed = String(input.email ?? "").trim().toLowerCase();
  if (input.intent === "question") {
    // Questions need a reply address; message required.
    if (!isEmail(emailTrimmed)) errors.push("email");
    if (!String(input.message ?? "").trim()) errors.push("message");
  } else if (input.intent === "appointment_request") {
    // Appointments are phone-first ("we call you") — email is OPTIONAL, but must be
    // valid if supplied. A best time is optional; a live location + phone are not.
    if (emailTrimmed && !isEmail(emailTrimmed)) errors.push("email");
    if (!String(input.locationId ?? "").trim()) errors.push("location");
    else if (!locationActive) errors.push("location"); // inactive/unknown location
    if (!normalizePhone(input.phone)) errors.push("phone"); // phone required for appointments
    if (input.bestTimeToCall && !BEST_TIMES.includes(input.bestTimeToCall as (typeof BEST_TIMES)[number])) errors.push("bestTimeToCall");
  }
  return errors;
}
