import { test, expect, type Page } from "@playwright/test";

// ops2's navigation, measured in a browser.
//
// WHY A BROWSER SUITE AND NOT ONLY THE NODE ONE. Everything this file asserts
// is decided in the client: which navigation surface is mounted, whether
// ion-split-pane found its content, what the tab bar thinks is selected. The
// HTML the Worker serves is byte-identical in every one of those states. The
// repo has already paid for that lesson twice — a program-Off switch that
// replaced a whole landing page, and payment holds the API served and nothing
// rendered, both invisible to 104 green node tests.
//
// THE NON-NEGOTIABLE ASSERTION IS THE FIRST ONE. Navigation disappearing at
// narrow width is recorded in `docs/ops-redesign/LEARNINGS.md` §3.10 and then
// happened AGAIN in the rejected pass. It must fail loudly.
const OPS2 = "http://ops.localhost:8788/ops2";

/** The change point, `--cp-shell-rail`. Stated once in the app
 *  (src/ops2/nav/destinations.ts) and once here, on purpose: a test that
 *  imported the number it is checking could not notice it moving. */
const RAIL_FROM = 1024;

/** The widths the console is actually used at: a small phone, the owner's
 *  phone, a Fold beside other apps, the change point exactly, and a monitor. */
const WIDTHS = [320, 390, 768, RAIL_FROM, 1440];

async function shellState(page: Page) {
  return page.evaluate(() => {
    const main = document.getElementById("ops2-main");
    const menu = document.querySelector("ion-menu");
    const bar = document.querySelector("ion-tab-bar");
    const box = (el: Element | null) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { left: Math.round(b.left), width: Math.round(b.width), height: Math.round(b.height) };
    };
    return {
      viewport: window.innerWidth,
      // `split-pane-main` is applied by ion-split-pane when it finds its main
      // node. Its absence is the silent failure this composition risks.
      mainIsSplitPaneContent: main?.classList.contains("split-pane-main") ?? false,
      main: box(main),
      // `menu-pane-visible` is the rail; without it the same ion-menu is an
      // overlay drawer, off screen until something opens it.
      railVisible: menu?.classList.contains("menu-pane-visible") ?? false,
      menu: box(menu),
      tabBarPresent: !!bar,
      tabBar: box(bar),
      insetOwner: document.documentElement.dataset.ops2Tabbar,
    };
  });
}

test("navigation is on the screen at every width — the twice-repeated regression", async ({ page }) => {
  // The one that must never go quiet. At every width the operator can reach
  // Projects without knowing a gesture, without opening anything first, and
  // without the control being hidden behind something a region could delete.
  //
  // Asserted on the CONTROL, not on its container: `LEARNINGS.md` §3.10 records
  // navigation vanishing because the thing that HOSTED the opener was removed,
  // so a test that checked for the host would have stayed green through it.
  await page.goto(OPS2);
  await expect(page.getByRole("heading", { name: "Attention", level: 1 })).toBeVisible();

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 812 });
    const reachProjects = width >= RAIL_FROM
      ? page.locator('.ops2-nav__item[href$="/projects"]')
      : page.locator('ion-tab-button[tab="projects"]');
    await expect(reachProjects, `no way to reach Projects at ${width}px`).toBeVisible();

    const box = await reachProjects.boundingBox();
    expect(box, `Projects control has no box at ${width}px`).not.toBeNull();
    // Reachable by a thumb, not merely present in the DOM.
    expect(box!.height, `Projects control is ${box!.height}px tall at ${width}px`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `Projects control is ${box!.width}px wide at ${width}px`).toBeGreaterThanOrEqual(44);
    // And inside the viewport, which "visible" alone does not promise.
    expect(box!.x, `Projects control starts off screen at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `Projects control runs off screen at ${width}px`).toBeLessThanOrEqual(width + 1);
  }
});

test("exactly one navigation surface is mounted at a time (C6)", async ({ page }) => {
  // "There is exactly ONE navigation surface (C6: a second navigation band is
  // forbidden)" — docs/design/ops2-r1-interaction-plane-shell.md §2.1. The rail
  // above the change point, the tab bar below it, and never both.
  //
  // The tab bar is UNMOUNTED above the change point rather than hidden, so this
  // is a fact about the DOM rather than about paint: ion-tab-bar carries
  // `contain: strict` and cannot be moved or resized from outside anyway —
  // three techniques were measured and all three failed
  // (docs/mocks/ops2-r1-ionic-src/src/ops2-tabs.css).
  await page.goto(OPS2);
  await expect(page.getByRole("heading", { name: "Attention", level: 1 })).toBeVisible();

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 812 });
    const wide = width >= RAIL_FROM;

    // POLLED, not read once. The swap is asynchronous by construction: the
    // media query fires, React re-renders, and Ionic's Stencil components
    // update on their own schedule — so a single read taken in the same tick as
    // the resize catches the previous width's answer. Measured: reading
    // immediately after setViewportSize() reported the rail still mounted at
    // 320px, while the same transition driven by hand in a browser settled
    // correctly. What is asserted is the SETTLED state, and the poll's timeout
    // is what would catch a transition that never settles at all.
    await expect
      .poll(async () => {
        const state = await shellState(page);
        return {
          rail: state.railVisible,
          tabBar: state.tabBarPresent,
          insetOwner: state.insetOwner,
        };
      }, { message: `navigation surfaces at ${width}px`, timeout: 5_000 })
      .toEqual({ rail: wide, tabBar: !wide, insetOwner: wide ? "off" : "on" });

    // And exactly ONE of them, said as its own assertion so a failure names the
    // thing that actually matters rather than one half of it. The tab bar is
    // UNMOUNTED above the change point rather than hidden, so this is a fact
    // about the DOM rather than about paint — ion-tab-bar carries
    // `contain: strict` and cannot be moved or resized from outside anyway
    // (three techniques measured, all failed:
    // docs/mocks/ops2-r1-ionic-src/src/ops2-tabs.css).
    const state = await shellState(page);
    const surfaces = Number(state.railVisible) + Number(state.tabBarPresent);
    expect(surfaces, `${width}px has ${surfaces} navigation surfaces`).toBe(1);
  }
});

test("the split pane finds its content, and offsets it rather than covering it", async ({ page }) => {
  // THE TRAP THIS COMPOSITION IS BUILT AROUND. ion-split-pane resolves its main
  // node ONCE, in connectedCallback, by walking its own DIRECT children
  // (node_modules/@ionic/core/components/ion-split-pane.js, `styleMainElement`).
  // Put the id on the router outlet with IonTabs in between and it finds
  // nothing — the planning thread measured exactly that at 1440: the outlet at
  // left:0 width:1440 with no split-pane-main class, the rail OVERLAYING the
  // record rather than offsetting it (7f8e6e4d).
  //
  // Three symptoms, all checked, because two of them are silent and only the
  // third is visible to a human.
  const complaints: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("ion-split-pane")) complaints.push(message.text());
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(OPS2);
  await expect(page.getByRole("heading", { name: "Attention", level: 1 })).toBeVisible();

  const state = await shellState(page);
  expect(state.mainIsSplitPaneContent, "the split pane did not claim #ops2-main").toBe(true);

  // 224px, register row 17 and the plane-shell spec §2.1. Ionic's own defaults
  // are min 270 / max 28%, so an unset bound shows up here as a wrong number
  // rather than as nothing at all.
  expect(state.menu).toEqual(expect.objectContaining({ left: 0, width: 224 }));

  // OFFSET, not overlaid — the difference between a desktop layout that works
  // and one that merely mounted. This is the assertion the earlier defect failed.
  expect(state.main!.left, "the content is not offset by the rail").toBe(224);
  expect(state.main!.width).toBe(1440 - 224);

  // "[ion-split-pane] - Does not have a specified main node." Ionic says it out
  // loud, and nobody was listening.
  expect(complaints, "Ionic complained about the split pane").toEqual([]);
});

test("every destination is reachable from the rail, and lights when you arrive", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(OPS2);

  const expected = [
    ["Attention", "/attention"], ["Projects", "/projects"], ["Products", "/products"],
    ["Pricing", "/pricing"], ["Customers", "/customers"],
    ["Files", "/files"], ["Audit", "/audit"], ["Settings", "/settings"],
  ] as const;

  // The owner's list, in his order, with nothing extra. A rail that grew a
  // ninth destination nobody decided on is as much a defect as one that lost a
  // destination — and five of these eight have no other route at any width.
  await expect(page.locator(".ops2-nav__item")).toHaveText(expected.map(([label]) => label));
  await expect(page.locator(".ops2-nav__section-label")).toHaveText(["WORKSPACE", "SYSTEM"]);

  for (const [label, path] of expected) {
    await page.locator(`.ops2-nav__item[href$="${path}"]`).click();
    await expect(page.getByRole("heading", { name: label, level: 1 })).toBeVisible();
    expect(new URL(page.url()).pathname, `${label} did not change the address`).toBe(`/ops2${path}`);
    // The sage-filled block, and exactly one of them.
    await expect(page.locator('.ops2-nav__item[aria-current="page"]')).toHaveText([label]);
  }
});

test("every tab reaches its root and lights the bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 812 });
  await page.goto(OPS2);

  // Four buttons, in the owner's order. `More` is last and is deliberately not
  // a destination.
  await expect(page.locator("ion-tab-button")).toHaveText([/Attention/, /Projects/, /Products/, /More/]);

  for (const [tab, label] of [["projects", "Projects"], ["products", "Products"], ["attention", "Attention"]] as const) {
    await page.locator(`ion-tab-button[tab="${tab}"]`).click();
    await expect(page.getByRole("heading", { name: label, level: 1 })).toBeVisible();
    expect(new URL(page.url()).pathname, `${label} did not change the address`).toBe(`/ops2/${tab}`);
    await expect(page.locator("ion-tab-button.tab-selected")).toHaveAttribute("tab", tab);
  }

  // `More` never lights, because `More` is not a place: the bar says where you
  // are, and `More` does not move you. Checked after a tab is selected, so a
  // pass cannot come from nothing being selected at all.
  await expect(page.locator('ion-tab-button[tab="more"].tab-selected')).toHaveCount(0);
});

test("`More` opens the drawer, and the drawer carries every destination and the way out", async ({ page }) => {
  // The decision this task had to take. `docs/ops2/UX-HANDOVER.md` §5 lists
  // "whether `More` opens the drawer" as unverified and needing a real device.
  // It opens the drawer, and this is what holds it — including the failure
  // measured on the way here, where `menuId` set Ionic's `menu-id` ATTRIBUTE
  // and not the DOM `id`, so the lookup found nothing and `More` silently did
  // nothing at all. That is the twice-recorded "drawer with no trigger"
  // regression arrived at from a third direction, and it would have shipped.
  //
  // Asserted on `show-menu` (the state) rather than on the drawer's geometry
  // (the presentation), for the reason the handover gives about ion-modal:
  // Ionic's overlays animate through the Web Animations API, and in an
  // automation-driven browser those timelines do not always advance. State is
  // what is true; geometry is what a compositor got round to.
  await page.setViewportSize({ width: 390, height: 812 });
  await page.goto(OPS2);

  const drawer = page.locator("#ops2-nav-drawer");
  await expect(drawer).not.toHaveClass(/show-menu/);
  // The rail is not merely closed below the change point — it is not a rail.
  await expect(drawer).not.toHaveClass(/menu-pane-visible/);

  await page.locator('ion-tab-button[tab="more"]').click();
  await expect(drawer, "`More` did not open the drawer").toHaveClass(/show-menu/);

  // The SAME list the rail shows — one destination list at every width, reached
  // two ways. Five of these eight have no other route below the change point,
  // which is what makes this the load-bearing half of narrow-width navigation.
  await expect(page.locator(".ops2-nav__item")).toHaveText([
    "Attention", "Projects", "Products", "Pricing", "Customers", "Files", "Audit", "Settings",
  ]);

  // Register row 14 and plane-shell §2.1: the account block, and the way out in
  // it. The control is real — it posts to /api/ops/auth/logout and navigates to
  // whatever Access hands back (src/ops2/nav/account.ts). What cannot be
  // exercised here is the Access redirect itself, which only exists in
  // production; this holds that the control is present and wired.
  await page.locator(".ops2-account--rail").click();
  await expect(page.locator("ion-popover").getByText("Sign out")).toBeVisible();

  // While the drawer is open the page behind it is inert to assistive
  // technology — Ionic marks the content aria-hidden, and the page's own <h1>
  // stops being findable by role. Measured here, and worth knowing rather than
  // worked around: it is the correct behaviour for a modal overlay, and it is
  // why nothing in this test reaches past the drawer for its evidence.
  await expect(page.getByRole("heading", { name: "Attention", level: 1 })).toHaveCount(0);
});

test("a deep link below a destination survives reload and keeps that destination lit", async ({ page }) => {
  // The property path routing buys and hash routing does not: a URL that
  // survives a cold Cloudflare Access sign-in and can be reloaded (AC-26).
  await page.setViewportSize({ width: 390, height: 812 });
  const response = await page.goto(`${OPS2}/audit`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Audit", level: 1 })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Audit", level: 1 })).toBeVisible();
  expect(new URL(page.url()).pathname, "the reload lost the address").toBe("/ops2/audit");

  // AND, deep-linked BELOW a destination, the bar still lights it. This is the
  // property the Projects record routes will depend on when they nest under
  // /projects, and the mock recorded it as broken: "IonTabs computes the
  // selected tab from the MATCHED ROUTE… it matches no tab and the bar lights
  // NOTHING once you open a record — measured, all four buttons unselected."
  // At @ionic/react 8.8.18 it is a segment-PREFIX match (`matchesTab`), so it
  // holds. Pinned here because it is the difference between a lit bar and a
  // dark one for most of the working day, and because it is not our code.
  // AGAINST A REAL NESTED ROUTE, which this now has: the project record. It
  // used to be checked against `/projects/anything/deeper`, an address no route
  // claimed — which proved the same Ionic property but only while every
  // destination route was non-exact. `/projects` had to become exact once it
  // grew a child (a non-exact parent is re-used by Ionic's view stack and the
  // child never renders), so that address stopped matching anything at all.
  // A route that exists is better evidence anyway.
  await page.goto(`${OPS2}/projects/p_submitted`);
  await expect(page.locator("ion-tab-button.tab-selected")).toHaveAttribute("tab", "projects");
  expect(new URL(page.url()).pathname, "a real record route is not a redirect").toBe("/ops2/projects/p_submitted");

  // And an address NOBODY claims still lands on something — now on the
  // destination it named rather than on the console's front door. A stale link
  // under Projects is still a link to Projects, and answering it with Attention
  // throws away the only thing the URL said.
  await page.goto(`${OPS2}/projects/anything/deeper`);
  await expect(page.locator("ion-tab-button.tab-selected")).toHaveAttribute("tab", "projects");
  expect(new URL(page.url()).pathname).toBe("/ops2/projects");

  // The rail agrees with the bar about the same address, at the other width.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.ops2-nav__item[aria-current="page"]')).toHaveText(["Projects"]);
});

test("the two navigation surfaces agree about the back button", async ({ page }) => {
  // The rail and the tab bar are two presentations of ONE surface, so they have
  // to leave the same history behind them. Ionic's tab buttons push; if the
  // rail replaced instead, Back would return you to the previous destination on
  // a phone and take you out of the console entirely on a desktop — the same
  // gesture, two answers, decided by how wide the window happened to be.
  await page.setViewportSize({ width: 390, height: 812 });
  await page.goto(OPS2);
  await expect(page.getByRole("heading", { name: "Attention", level: 1 })).toBeVisible();

  await page.locator('ion-tab-button[tab="products"]').click();
  await expect(page.getByRole("heading", { name: "Products", level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Attention", level: 1 })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.ops2-nav__item[href$="/products"]')).toBeVisible();
  await page.locator('.ops2-nav__item[href$="/products"]').click();
  await expect(page.getByRole("heading", { name: "Products", level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Attention", level: 1 })).toBeVisible();
  expect(new URL(page.url()).pathname, "the rail left no history entry behind it").toBe("/ops2/attention");
});

test("every browser-facing link stays inside ops2 while it coexists under /ops2", async ({ page, context }) => {
  // THE COEXISTENCE DEFECT. The router mounts at a basename, so every path the
  // ROUTER handles is basename-relative and React Router adds `/ops2` back on.
  // An `href` is not handled by the router: the browser resolves it against the
  // document. So `href="/projects"` requests /projects on the ops host, where
  // opsShellFor() serves the LEGACY console — and only the intercepted primary
  // click ever reached history.push().
  //
  // Which means: primary click works, and every other way a person navigates
  // silently leaves ops2. Middle-click a destination, copy the link address and
  // send it to the other founder, Ctrl-click to open Projects in a second tab.
  // It is the deep-link problem ADR 0002 exists to solve, arriving through the
  // one door nobody was watching.
  //
  // Asserted on the RESOLVED absolute URL (`el.href`, not `getAttribute`),
  // because that is what the browser would actually request.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(OPS2);
  await expect(page.getByRole("heading", { name: "Attention", level: 1 })).toBeVisible();

  const railHrefs = await page.locator(".ops2-nav__item").evaluateAll(
    (nodes) => nodes.map((n) => (n as HTMLAnchorElement).href));
  expect(railHrefs).toEqual([
    "/attention", "/projects", "/products", "/pricing", "/customers",
    "/files", "/audit", "/settings",
  ].map((p) => `http://ops.localhost:8788/ops2${p}`));

  // And the behavioural proof, not just the attribute: a Ctrl-click opens a new
  // tab, and that tab must be ops2 — not the console it replaces.
  const opened = context.waitForEvent("page");
  await page.locator('.ops2-nav__item[href$="/products"]').click({ modifiers: ["ControlOrMeta"] });
  const tab = await opened;
  // waitForURL, not waitForLoadState: a Ctrl-click opens the tab at about:blank
  // and navigates a moment later, so the load state is already "complete" for a
  // page that has not been asked for anything yet.
  await tab.waitForURL("**/ops2/products");
  await expect(tab.getByRole("heading", { name: "Products", level: 1 })).toBeVisible();
  await tab.close();

  // The tab bar's buttons are anchors too. ion-tab-button renders
  // <a part="native" href> in its shadow root, and that anchor is what a
  // middle-click follows.
  await page.setViewportSize({ width: 390, height: 812 });
  // Wait for the bar to mount before reading it: evaluateAll() does not
  // auto-retry, and the surface swap is asynchronous (see the C6 test).
  await expect(page.locator("ion-tab-button")).toHaveCount(4);
  const tabHrefs = await page.locator("ion-tab-button").evaluateAll(
    (nodes) => nodes.map((n) => {
      const anchor = n.shadowRoot?.querySelector("a.button-native") as HTMLAnchorElement | null;
      return anchor?.getAttribute("href") === null ? null : anchor?.href ?? null;
    }));
  expect(tabHrefs).toEqual([
    "http://ops.localhost:8788/ops2/attention",
    "http://ops.localhost:8788/ops2/projects",
    "http://ops.localhost:8788/ops2/products",
    // `More` carries no href at all — it is a verb, and there is nowhere to open
    // in a new tab.
    null,
  ]);

  // Behavioural on the bar too — and MIDDLE-click, not Ctrl-click, which is a
  // measured constraint rather than a preference. ion-tab-button's `selectTab`
  // calls `preventDefault()` UNCONDITIONALLY, with no modifier-key check
  // (node_modules/@ionic/core/components/ion-tab-button.js), so every gesture
  // that produces a `click` event is swallowed by the component and switches
  // tabs in place. The anchor's href is reached only by the gestures that do
  // not: a middle-click, and the context menu's "Open link in new tab" and
  // "Copy link address". Those are the ones that were leaving ops2.
  //
  // This also proves the correction SURVIVES a re-render, which the attribute
  // assertion above cannot: Ionic rewrites the active button's href on every
  // navigation, and three have happened by now.
  const openedTab = context.waitForEvent("page");
  await page.locator('ion-tab-button[tab="products"]').click({ button: "middle" });
  const fromTab = await openedTab;
  await fromTab.waitForURL("**/ops2/products");
  await expect(fromTab.getByRole("heading", { name: "Products", level: 1 })).toBeVisible();
  await fromTab.close();
});
