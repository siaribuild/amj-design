// Enquiry helpers — pure, unit-testable. Reference formatting, phone
// normalisation (AU), and branch validation for the Contact page fork.
import { isEmail } from "./auth";

export const ENQUIRY_INTENTS = ["question", "appointment_request"] as const;
export type EnquiryIntent = (typeof ENQUIRY_INTENTS)[number];
export const BEST_TIMES = ["morning", "afternoon", "evening"] as const;

// The deployed form contract version, stamped onto every submission for
// attribution/debugging. Bump when the fields materially change.
export const FORM_VERSION = "contact-2026-07";

export const enquiryReference = (year: number, seq: number) =>
  `OF-ENQ-${year}-${String(seq).padStart(6, "0")}`;

// Normalise an AU phone number to a bare local form for matching (display value is
// kept separately). "+61 4xx" / "61 4xx" → "04xx"; other input keeps its digits.
export function normalizePhone(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("61") && digits.length >= 10) return "0" + digits.slice(2);
  return digits;
}

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
  if (!isEmail(String(input.email ?? "").trim().toLowerCase())) errors.push("email");
  if (!input.privacyConsent) errors.push("consent");

  if (input.intent === "question") {
    if (!String(input.message ?? "").trim()) errors.push("message");
  } else if (input.intent === "appointment_request") {
    if (!String(input.locationId ?? "").trim()) errors.push("location");
    else if (!locationActive) errors.push("location"); // inactive/unknown location
    if (!normalizePhone(input.phone)) errors.push("phone"); // phone required for appointments
    if (!BEST_TIMES.includes(input.bestTimeToCall as (typeof BEST_TIMES)[number])) errors.push("bestTimeToCall");
  }
  return errors;
}
