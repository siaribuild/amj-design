// `npm run dev:ops2` — the one thing about ops2 that no other test can see.
//
// Everything else about ops2 is verified against the Worker: shell selection,
// the /ops2 path, deep-link reload. That is the right place for it, because
// that is where those things exist — a Vite dev server has no host routing and
// no opsShellFor. But it left the dev server covered by nothing, and it was
// broken: `rollupOptions.input` applies to BUILDS only, so Vite's dev SPA
// fallback rewrote `/` and every deep link to the repository's index.html. The
// launcher opened the customer app, on the port whose whole purpose is ops2.
//
// Observed before this file existed, on a real `vite --config vite.ops2.config.ts`:
//
//   /                      → <title>Aluminium Windows &amp; Doors</title>   ← customer app
//   /ops2                  → <title>OpenFrame ops2</title>                  ← right, by accident
//   /ops2/record/p_demo    → <title>Aluminium Windows &amp; Doors</title>   ← customer app
//
// `/ops2` worked only because Vite's html fallback tries `<path>.html` before
// giving up, and `ops2.html` happens to sit at the root — which is exactly the
// kind of accident that reads as "it works" until someone reloads a deep link.
//
// This suite stays small on purpose. It asserts that the ops2 dev server serves
// ops2 and cannot serve anything else — not that ops2 works, which the Worker
// tests and the Playwright spec already own.
import test from "node:test";
import assert from "node:assert/strict";
import { freePort, start, stop, viteCli, waitForUrl } from "./helpers.mjs";

test("the ops2 dev server serves ops2, and only ops2", { timeout: 120_000 }, async (t) => {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  // A browser navigating sends this; a module or asset request does not. It is
  // what separates "a person opened a URL" from "the bundler asked for a file",
  // and the rewrite under test keys on the same signal.
  const asBrowser = { headers: { Accept: "text/html,application/xhtml+xml" } };

  const server = start(process.execPath, [
    viteCli, "--config", "vite.ops2.config.ts",
    "--port", String(port), "--strictPort", "--host", "127.0.0.1",
  ]);
  try {
    await waitForUrl(`${baseUrl}/ops2.html`, server);

    for (const path of ["/", "/ops2", "/ops2/record/p_demo", "/anything/at/all"]) {
      const res = await fetch(`${baseUrl}${path}`, asBrowser);
      assert.equal(res.status, 200, `${path} is served`);
      const html = await res.text();
      assert.match(html, /<title>OpenFrame ops2<\/title>/, `${path} is the ops2 shell`);
      assert.match(html, /src="\/src\/ops2\/main\.tsx"/, `${path} boots the ops2 entry`);
    }

    // The rewrite must not swallow what Vite itself asks for. If it did, the
    // page would serve and then fail to boot — and every assertion above would
    // still pass, because they only read HTML.
    const entry = await fetch(`${baseUrl}/src/ops2/main.tsx`);
    assert.equal(entry.status, 200, "the entry module is served, not rewritten to HTML");
    assert.match(await entry.text(), /createRoot/, "…as JavaScript");
  } finally {
    await stop(server);
  }
});
