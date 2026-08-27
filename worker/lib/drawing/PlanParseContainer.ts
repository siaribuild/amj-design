// The Durable Object that fronts the plan-parse container.
//
// It exists so the container has exactly one way in. Cloudflare reaches a
// container through a DO instance and nothing else — there is no route, service
// binding or hostname for it, which is what makes "the container is unreachable
// from the internet" a property of the configuration rather than a promise in a
// comment. `scripts/tests/drawing.test.mjs` asserts no route in wrangler.jsonc
// names this class.
//
// It carries no credentials and holds no state between requests. The Worker owns
// R2, D1 and the vision call; this forwards bytes and returns bytes.
import { Container } from "@cloudflare/containers";

export class PlanParseContainer extends Container {
  // A render is CPU-bound and short. The default sleep is generous for a service
  // that is idle between jobs; 10 minutes keeps an instance warm across the
  // several calls one project makes without paying for it all day.
  sleepAfter = "10m";

  // The container listens on 8080 (containers/plan-parse/server.mjs).
  defaultPort = 8080;

  // No egress. The container is handed bytes and returns bytes: render.mjs and
  // server.mjs contain no fetch, no DNS, no outbound anything, and it holds no
  // credentials to use if it did. Turning it off means a compromised renderer
  // cannot become an exfiltration path for the customer drawings it is looking
  // at.
  //
  // UNVERIFIED until the first deploy — the SDK warns that disabling internet
  // "may have functional consequences", and no image has been built yet. So
  // CONFIRM IT ON THE FIRST DEPLOY, as a step of its own: bring the container up
  // behind `wrangler versions upload` and check it serves a crop.
  //
  // If it will not start, do not reach for this line first. An earlier version of
  // this comment said to, and that is a troubleshooting hint that removes an
  // egress control from a process parsing untrusted customer PDFs — under exactly
  // the time pressure where nobody writes down that they did it. Rule it out as
  // the cause before changing it, and if it genuinely has to come back, that is a
  // security decision to record, not a quick fix.
  enableInternet = false;
}
