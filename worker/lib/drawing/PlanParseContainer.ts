// THE PLAN-PARSE DURABLE OBJECT.
//
// Fronts the container at `containers/plan-parse/` — the SKILL.md method's
// mechanical steps (inventory, text, render+crop), unmodified
// (02-design-v2.md §1, ADR 0016). Same class name, same `PLAN_PARSE`
// binding, same `v1` migration tag as the held-open stub this replaces —
// Cloudflare tracks applied tags remotely, so re-declaring `v1` here adopts
// the existing namespace rather than creating a new one.
//
// Reachable ONLY through this Durable Object: no route, no service binding,
// no hostname exists for it anywhere in this Worker (§9 AB-5). Every call
// goes through `worker/lib/drawing/containerClient.ts`, which enforces size/
// page/crop/DPI caps BEFORE it ever reaches here.
import { Container } from "@cloudflare/containers";
import type { Env } from "../../types";

export class PlanParseContainer extends Container<Env> {
  defaultPort = 8080;
  // The instance sleeps 2 minutes after its last request and stops billing
  // then — a run's ~22-24 model calls happen in the Worker, between
  // container calls, so the container would otherwise sit idle mid-run.
  sleepAfter = "2m";
}
