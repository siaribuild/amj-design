import { test, expect } from "@playwright/test";

// ONE TEST PER FILE, and it is not fussiness. Two of these in one file starve
// each other on the dev server: the checklist only exists once a poll round trip
// has set the phase, and the loser reports "element not found", which reads like
// a missing feature rather than a slow one. That wrong diagnosis already cost
// two deleted tests once. The counted case lives in drawing-progress-counted.spec.ts.

// The drawing-read checklist, in a browser.
//
// Its own file on purpose. Written first inside customer.spec.ts, the progress
// block never rendered — something in that file's fixtures suppresses it — while
// the identical stubs render fine alone. Asserting around that would have been
// measuring the fixture; this measures the feature.
//
// The conceptual shape, which is the owner's and was wrong in the first attempt:
// finding the openings is the SCHEDULE's result, reading their details is its own
// job, and checking thermal requirements is what happens to each opening after.
// The counter first appeared under "Checking thermal requirements" because the
// drawing read runs inside the building_envelope phase — stubbed here as such.

async function runningWith(page: import("@playwright/test").Page, run: Record<string, unknown>) {
  await page.route("**/api/auth/me", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ user: { id: "u_demo", email: "demo@example.test", name: "Demo" } }),
  }));
  await page.route("**/api/projects/current", (r) => r.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      project: { id: "p-read", ref: "OF-Q-READ", title: "Reading", status: "draft", createdAt: new Date().toISOString() },
      items: [],
      files: [{ id: "f1", filename: "plans.pdf", kind: "upload", size: 100, doc_type: "plans" }],
    }),
  }));
  await page.route("**/api/projects/current/extraction-status", (r) => r.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ run, basis: {} }),
  }));
  await page.goto("/quote");
}

test("a run with no drawings has no drawing step to render as done", async ({ page }) => {
  // Codex: the step was in the checklist unconditionally, so on a schedule-only
  // project it ticked the moment the stage moved past it — claiming work that
  // never happened. A tick is a claim.
  //
  // This was dropped once as "does not render", which was a WRONG DIAGNOSIS: the
  // 10s default was simply too short for the poll's round trip. Restored with
  // the same explicit wait as above.
  await runningWith(page, {
    id: "r-plain", status: "running", startedAt: new Date().toISOString(),
    progressStage: "matching_and_pricing",
  });
  const steps = page.locator("ol").first();
  await expect(steps).toBeVisible({ timeout: 30_000 });
  await expect(steps).toContainText("Matching products and prices");
  await expect(steps).not.toContainText("Extracting opening details");
  await expect(steps).not.toContainText("openings found");
});
