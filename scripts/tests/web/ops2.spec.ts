import { test, expect } from "@playwright/test";

// ops2 lives on the ops host under a path prefix while it and the legacy
// console coexist (ADR 0002, spec §12). This file exists because the node
// suites structurally cannot see what it asserts: they check the HTML the
// Worker serves, and that HTML is byte-identical whether the bundle mounts or
// not. Everything the scaffold is FOR — the route reaching the Worker, Access
// letting the person through, React mounting, the theme applying — is decided
// in the client.
const OPS2 = "http://ops.localhost:8788/ops2";

test("the ops2 shell mounts at /ops2, with no sign-in of its own", async ({ page }) => {
  await page.goto(OPS2);
  await expect(page.getByRole("heading", { name: "ops2" })).toBeVisible();

  // No sign-in screen, and that is the design, not an oversight: authentication
  // is Cloudflare Access on the HOST, which is exactly why ops2 took a path
  // prefix instead of a hostname. ops2 adds no auth code at all. (Access is off
  // in local dev, as it is for the legacy console beside it.)
  await expect(page.getByPlaceholder(/you@openframe.com.au/i)).toHaveCount(0);

  // The base the router detected at boot, rendered on the page — so a wrong one
  // is visible rather than merely wrong.
  await expect(page.getByText("/ops2", { exact: true })).toBeVisible();
});

test("a deep link under /ops2 renders the console, not a 404", async ({ page }) => {
  // The property path routing buys and hash routing does not: a URL that
  // survives a cold Cloudflare Access sign-in and can be reloaded (AC-26).
  const response = await page.goto(`${OPS2}/record/p_demo`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "ops2" })).toBeVisible();
  await expect(page.getByText("/record/p_demo")).toBeVisible();
});

test("no rendered corner exceeds the owner's 5px cap", async ({ page }) => {
  // The owner's override of the FrameFlow document — "radii for corners should
  // not exceed --theme-radius-sm" — is enforced by one token, and a token is
  // only a comment until something checks it. The document itself asks for
  // 8-16px, so the pull back towards it is real and this is what notices.
  //
  // If a pill or a dot (--theme-radius-full) legitimately renders one day,
  // exclude that element here by name. Do not raise the cap: it is a shape, not
  // a softened corner, and the cap is the owner's, not the doc's.
  await page.goto(OPS2);
  const radii = await page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .flatMap((el) => {
        const s = getComputedStyle(el);
        return [
          s.borderTopLeftRadius, s.borderTopRightRadius,
          s.borderBottomLeftRadius, s.borderBottomRightRadius,
        ];
      })
      .map((value) => parseFloat(value))
      .filter((n) => Number.isFinite(n)));
  expect(Math.max(...radii, 0)).toBeLessThanOrEqual(5);
});
