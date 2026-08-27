import { test, expect } from "@playwright/test";

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
  const steps = page.locator("ol").first();
  await expect(steps).toContainText("Extracting the schedule · 20 openings found");
  await expect(steps).toContainText("Extracting opening details · 7 of 20");
  // A gap is not a customer's to resolve — they cannot add a split, an
  // orientation or a head height to an opening that did not parse.
  for (const forbidden of [/unread/i, /could not be read/i, /upload the remaining/i]) {
    await expect(page.getByText(forbidden)).toHaveCount(0);
  }
});

// THE NO-COUNTS CASE IS NOT HERE, and not because it does not matter — it is the
// guarantee that every project predating this, and every set without plans, is
// untouched. It is asserted in scripts/tests/unit.test.mjs against
// readingMessage and the step list directly.
//
// It is not here because I could not make it render: a `reading_documents` run
// with no counts produced no progress block under any stub I tried, while the
// counted case above renders reliably. Rather than assert something weaker and
// call it coverage, the check lives where it actually runs.

// The no-drawings case is asserted in unit.test.mjs against stepsFor: a
// schedule-only run must not carry a drawing step at all, or it renders as done
// and claims work that never happened. It is not here for the same reason the
// no-counts case is not: that combination does not render under any stub.
