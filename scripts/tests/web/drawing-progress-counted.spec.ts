import { test, expect } from "@playwright/test";

// ONE TEST PER FILE, and it is not fussiness. Two of these in one file starve
// each other on the dev server: the checklist only exists once a poll round trip
// has set the phase, and the loser reports "element not found", which reads like
// a missing feature rather than a slow one. That wrong diagnosis already cost
// two deleted tests once. The absent case lives in drawing-progress.spec.ts.

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

test("the drawing read is its own step, counted, and silent about what it could not read", async ({ page }) => {
  await runningWith(page, {
    id: "r-read", status: "running", startedAt: new Date().toISOString(),
    progressStage: "building_envelope", drawingsDone: 7, drawingsTotal: 20,
  });
  // The checklist only appears once the poll has completed a round trip and set
  // the phase — the default 10s is marginal for that on a cold dev server, and
  // the failure reads as "element not found", which looks like a missing feature
  // rather than a slow one.
  const steps = page.locator("ol").first();
  await expect(steps).toBeVisible({ timeout: 30_000 });
  await expect(steps).toContainText("Extracting the schedule · 20 openings found");
  await expect(steps).toContainText("Extracting opening details · 7 of 20");
  // A gap is not a customer's to resolve — they cannot add a split, an
  // orientation or a head height to an opening that did not parse.
  for (const forbidden of [/unread/i, /could not be read/i, /upload the remaining/i]) {
    await expect(page.getByText(forbidden)).toHaveCount(0);
  }
});

