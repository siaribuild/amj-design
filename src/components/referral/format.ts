// Referral copy slots (UX spec §1).
//
// FORMATTERS, NOT STRING CONCATENATION. `windowMonths` is configurable, so
// `${windowMonths} months` prints "1 months" the day someone sets it to 1. Every
// slot that can be singular is pluralised here, once, rather than at each of the
// dozen places the figure appears.
//
// These exist because no program figure may be typed into a string anywhere on
// the site: the owner kept the numbers editable from the ops console precisely so
// they could change without a deploy, and a hard-coded "2.5%" would make the page
// advertise one figure while the engine applied another.

/** `2.5%`, and `5%` rather than `5.0%` — a trailing zero reads as precision that
 *  isn't being claimed. */
export function pct(value: number): string {
  if (!Number.isFinite(value)) return "";
  return `${Number(value.toFixed(2))}%`;
}

/** `$2,000` — the qualifying minimum in prose, where cents are noise. Distinct
 *  from `money()`, which renders `$1,240.00` for actual amounts of money. */
export function moneyRound(value: number): string {
  if (!Number.isFinite(value)) return "";
  return `$${Math.round(value).toLocaleString("en-AU")}`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${Math.abs(n) === 1 ? "" : "s"}`;

/** `12 months`, `1 month`. */
export const months = (n: number) => plural(Math.round(n), "month");

/** `14 days`, `1 day`. */
export const days = (n: number) => plural(Math.round(n), "day");

/** Whole days from now until `iso`, floored at 0. Calendar days rather than
 *  elapsed 24-hour periods: a discount that runs out "tomorrow" should say 1 day
 *  whether it expires at 9am or 11pm. */
export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number {
  if (!iso) return 0;
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return 0;
  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.max(0, Math.round((startOfDay(end) - startOfDay(now)) / 86_400_000));
}

/** The offer is "expiring" inside 30 days — the same trigger as the reminder
 *  email, so the screen and the inbox never disagree about urgency. */
export const EXPIRING_WITHIN_DAYS = 30;

export const isExpiring = (iso: string | null | undefined, now?: Date) =>
  daysUntil(iso, now) <= EXPIRING_WITHIN_DAYS;

/** How much time is left, in the unit that reads naturally: months above 60 days,
 *  days below. "2 months left" is what a person says; "63 days left" is what a
 *  countdown says, and this is an offer rather than a countdown until it is
 *  nearly over. */
export function remaining(iso: string | null | undefined, now?: Date): string {
  const left = daysUntil(iso, now);
  return left > 60 ? months(Math.floor(left / 30)) : days(left);
}
