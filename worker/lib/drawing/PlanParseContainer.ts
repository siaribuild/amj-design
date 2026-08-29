/**
 * THE PLAN-PARSE DURABLE OBJECT, HELD OPEN WHILE ITS IMPLEMENTATION IS REWRITTEN.
 *
 * This class does nothing on purpose. It exists because a Durable Object class
 * cannot simply be deleted from a Worker that has live objects of that class:
 * Cloudflare refuses the version outright —
 *
 *   New version of script does not export class 'PlanParseContainer' which is
 *   depended on by existing Durable Objects. [code: 10064]
 *
 * — and that refusal has blocked EVERY deploy of this Worker since the
 * plan-parse implementation was reverted (#25). Not the drawing feature's
 * deploys: every one, for everybody, including work that has nothing to do with
 * drawings.
 *
 * ── WHY A STUB RATHER THAN A DELETE-CLASS MIGRATION ─────────────────────────
 * The other way out is `{ "deleted_classes": ["PlanParseContainer"] }`, which
 * removes the namespace and every object in it, permanently. The owner's ruling
 * (2026-08-29) is to keep it: parsing is being rewritten from scratch and will
 * want this namespace back, and re-creating it later is a second one-way door
 * for no gain. Holding the name costs nothing; deleting and re-creating spends
 * a migration tag and the objects with it.
 *
 * ── WHY IT NO LONGER `extends Container` ────────────────────────────────────
 * It did (`@cloudflare/containers`), because it fronted the poppler/Python
 * container that runs the SKILL.md method's render-and-crop steps. That
 * container is coming back — the method is binding and unmodified
 * (`docs/runs/plan-parse-method/00-ask.md` §3-§4) — but its image will be built
 * in CI and named by registry URI rather than by a Dockerfile path, so that no
 * development machine needs Docker to deploy. Until that lands there is no
 * container declared, and a `Container` subclass with nothing to front is a
 * half-wired object that reads as broken rather than as waiting.
 *
 * `Container` extends `DurableObject`, so the stored objects are the same shape
 * either way, and the real class returns under the SAME name and binding when
 * the rework reaches it — no new migration, no new tag.
 *
 * ── AND IT EXTENDS NOTHING ──────────────────────────────────────────────────
 * A Durable Object class is a class with a `fetch`; `DurableObject` from
 * `cloudflare:workers` is an ergonomic base, not a requirement. Importing it
 * would drag the `cloudflare:workers` virtual module into every esbuild bundle
 * that reads this Worker — `scripts/tests/unit.test.mjs` builds one without the
 * workerd-builtins plugin and fails outright on it. A stub that serves nothing
 * has no use for the base class, so it does not pay for it.
 *
 * ── NOTHING CALLS IT ────────────────────────────────────────────────────────
 * The drawing code that held the `PLAN_PARSE` binding was reverted with the
 * implementation. There is no route, no service binding and no hostname for it,
 * which is the property `scripts/tests/drawing.test.mjs` asserts. A request
 * arriving here is therefore a bug somewhere else, and it says so rather than
 * failing in a way that looks like the container being down.
 */
export class PlanParseContainer {
  async fetch(): Promise<Response> {
    return new Response(
      JSON.stringify({
        error: "plan_parse_unavailable",
        detail:
          "The plan-parse implementation was withdrawn and is being rewritten. "
          + "This object is held open so its namespace survives; it serves nothing.",
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
}
