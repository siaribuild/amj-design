// What an ops action's refusal SAYS, when the endpoint answers with a code.
//
// The Worker replies `{ error: "delivery_unset" }`, `not_ready`,
// `workflow_changed_retry` — identifiers, correctly, because an API's job is to
// be precise rather than kind. The console's job is the other one, and a
// reviewer shown "delivery_unset" has been handed the identifier at the one
// moment they need to know what to do next.
//
// ── WHY THIS IS IN THE SHARED CORE ───────────────────────────────────────────
// Both consoles need it and ops2 may not import the one it replaces. These
// strings have lived in `src/ops/ProjectRecord.tsx` since before ops2 existed;
// copying them would leave two versions of wording a reviewer acts on, which is
// exactly what CLAUDE.md's "one place per fact" rules out. So they move here —
// no React, no router, no fetch client, which is the admission test this
// directory is under.
//
// The comment that came with them is worth keeping: "Failures name the cause.
// One blanket 'resolve and exactly price every line' used to cover every code,
// which on a concurrency conflict sent people hunting a pricing problem that
// did not exist."

const ACTION_ERRORS: Record<string, string> = {
  // ── The issue gate's own refusals (worker/lib/issue.ts) ────────────────────
  // `not_ready` COVERS FIVE DIFFERENT CAUSES and names none of them: a status
  // outside `ISSUABLE_FROM`, an empty quote, a line with no total, a line in a
  // blocking status, and a batch that rolled back or lost a concurrency race.
  //
  // So the sentence MUST NOT GUESS. It said "check that every line has a rate
  // and none is still in technical review" — true for two of the five, and for
  // the other three it sends someone hunting a pricing problem that does not
  // exist. Which is precisely the failure the wording below it was written to
  // end: "One blanket 'resolve and exactly price every line' used to cover
  // every code, which on a concurrency conflict sent people hunting a pricing
  // problem that did not exist."
  //
  // IT PROMISES NOTHING, and getting there took four attempts. Each earlier
  // version claimed something that held for some of the five paths:
  //
  //   "check that every line has a rate…"  — names two causes; misdirects on
  //                                          state, rollback and a lost race.
  //   "the record has been re-read"        — true of ops2, which reloads on a
  //                                          409; false of the legacy console
  //                                          reading the same string.
  //   "reload to see what is standing in
  //    the way"                            — for a wrong STATE the action
  //                                          simply stops being offered, and
  //                                          for a rolled-back batch the
  //                                          reloaded record looks fine. Reload
  //                                          shows nothing in either.
  //
  // What is true of all five: it was refused, and the record in front of you may
  // be out of date. So it says that, and stops. The specific cause, WHERE THERE
  // IS ONE TO SHOW, arrives on its own — `actionsFor` recomputes the blocked
  // reason from `issuableNow` on every read and puts it beside the button.
  not_ready: "This quote could not be issued as it stands. Reload the record before trying again.",
  //
  // `not_found` IS DELIBERATELY ABSENT. It is returned by 31 places in the ops
  // routes alone — a project, a line, a composite parent, a staff row, a file,
  // an OTP route — so the code says "the thing you named is not there" and
  // nothing whatever about WHICH thing. A sentence here would have to guess,
  // and the guess ("this project no longer exists") is wrong in most of them
  // and alarming in all of them. The generic fallback is the honest answer, and
  // a caller that knows which entity it asked for can say so itself.
  unresolved_lines: "Resolve and exactly price every line, then try again.",
  delivery_unset: "Delivery has not been set on this project — enter a figure, or 0, in the Delivery panel.",

  // ── Concurrency: someone else moved it while you had it open ───────────────
  line_changed_reload_required: "Someone else changed this record while you had it open — your edit wasn't saved. Reload and try again.",
  quote_changed_retry: "Someone else changed this record while you had it open — your edit wasn't saved. Reload and try again.",
  workflow_changed_retry: "This job moved to another state while you had it open. Reload to see where it is now.",
  stage_conflict: "That step has already been taken. Reload to see the current state.",

  // ── Permission ─────────────────────────────────────────────────────────────
  forbidden: "You don't have permission for that action.",
  forbidden_role: "You don't have permission for that action.",

  // ── The estimator's learning surfaces ──────────────────────────────────────
  valid_thermal_target_required: "Enter a valid Uw and SHGC range before using this lesson.",
  thermal_review_role_required: "Your account cannot approve a thermal learning target.",
  not_found_or_final: "This learning decision was already finalized. Reload to see its current state.",
  configuration_not_eligible: "That frame and glazing configuration is no longer eligible. Reload the configurations and choose again.",
  selected_variant_required: "Choose an exact frame and glazing configuration before saving.",
  exact_pricing_unavailable: "That configuration does not currently have a complete exact price.",
};

/**
 * The sentence for a code, or an honest fallback.
 *
 * THE FALLBACK DOES NOT PRETEND. New codes arrive before their wording does, and
 * the temptation is to prettify the identifier — "Workflow Changed Retry" — which
 * reads like an explanation while explaining nothing. A plain sentence that
 * admits the console has nothing to add is more useful, and it is the version
 * that makes a missing entry visible rather than plausible.
 */
export function actionErrorText(code: string | null | undefined): string {
  return (code && ACTION_ERRORS[code]) || "That action could not be completed.";
}

/** The map itself, for a caller that needs to know whether a code is known. */
export const KNOWN_ACTION_ERRORS: ReadonlyArray<string> = Object.keys(ACTION_ERRORS);
