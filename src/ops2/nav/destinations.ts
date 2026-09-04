// ops2's destinations — ONE list, three presentations.
//
// The rail (≥1024), the drawer (`More`, <1024) and the bottom tab bar all read
// this file. That is the point of it: the twice-recorded navigation regression
// (`docs/ops-redesign/LEARNINGS.md` §3.10, repeated in the rejected pass) was a
// navigation surface disappearing along with the thing that hosted it, and the
// structural half of the fix is that no surface owns the list. A surface that
// cannot invent a destination also cannot lose one.
//
// It lives in src/ops2 rather than src/data because nothing outside ops2 reads
// it — which is the opposite of ../../data/ops2Routing.ts, whose comment states
// its own reason for sitting in src/data (the Worker imports it). Both are
// testable from node: scripts/tests/ops2-navigation.test.mjs bundles this with
// esbuild, the same way scripts/tests/unit.test.mjs bundles the src/data
// modules.
//
// Deliberately free of React and of ionicons. Icons are a rendering concern and
// live with the component that draws them, typed `Record<DestinationId, string>`
// so the compiler — not a test — is what notices a destination without a mark.
// Importing `ionicons/icons` here would pull ~1MB of data URIs into a node test
// run to check eight strings.

export type DestinationId =
  | "attention" | "projects" | "products" | "pricing" | "customers"
  | "enquiries" | "files" | "audit" | "settings";

export type SectionId = "workspace" | "system";

export interface Destination {
  readonly id: DestinationId;
  readonly label: string;
  /** Absolute, and mounted under the basename the router detects at boot. */
  readonly path: string;
  readonly section: SectionId;
  /** One line saying what the destination is for. The placeholder roots render
   *  it, so an empty destination still says what it is rather than apologising. */
  readonly blurb: string;
}

export interface Section {
  readonly id: SectionId;
  readonly label: string;
}

/** The section labels the rail and the drawer both print, uppercase and muted. */
export const SECTIONS: readonly Section[] = [
  { id: "workspace", label: "WORKSPACE" },
  { id: "system", label: "SYSTEM" },
];

/**
 * The owner's own list, in his own order.
 *
 * Attention leads because the governing constraint of this console is that a
 * delayed glance costs a working day — the first two seconds have to answer
 * "is there anything for me", not "here is a menu".
 */
export const DESTINATIONS: readonly Destination[] = [
  {
    id: "attention", label: "Attention", path: "/attention", section: "workspace",
    blurb: "What needs a person, and what is critically wrong. Not a metrics page.",
  },
  {
    id: "projects", label: "Projects", path: "/projects", section: "workspace",
    blurb: "The work queue — who is waiting, and how long they have waited.",
  },
  {
    id: "products", label: "Products", path: "/products", section: "workspace",
    blurb: "The catalogue as ops sees it: what can be offered, and what cannot yet.",
  },
  {
    id: "pricing", label: "Pricing", path: "/pricing", section: "workspace",
    blurb: "Rate cards, uplift and the rules that turn a manufacturer's figure into a price.",
  },
  {
    id: "customers", label: "Customers", path: "/customers", section: "workspace",
    blurb: "Accounts, trade verification and who is behind a project.",
  },
  {
    id: "enquiries", label: "Enquiries", path: "/enquiries", section: "workspace",
    blurb: "Incoming enquiries that are not yet projects.",
  },
  {
    id: "files", label: "Files", path: "/files", section: "system",
    blurb: "Plans, schedules and everything uploaded against a project.",
  },
  {
    id: "audit", label: "Audit", path: "/audit", section: "system",
    blurb: "What changed, when, and who did it.",
  },
  {
    id: "settings", label: "Settings", path: "/settings", section: "system",
    blurb: "Console configuration, and the shell's own diagnostics.",
  },
];

/**
 * The three tabs, below 1024px.
 *
 * `More` is not in this list and must never be added to it: it is a verb, not a
 * place. It reveals the other five destinations rather than travelling to one,
 * which is also why it never lights — the bar says where you are, and `More`
 * does not move you.
 *
 * Three of the owner's four screenshots agree on Attention / Projects /
 * Products / More. The older Dashboard / Enquiries mock is superseded.
 */
export const TAB_DESTINATION_IDS: readonly DestinationId[] = [
  "attention", "projects", "products",
];

/** Where `/` lands. A real destination, so the base URL is never a blank page. */
export const HOME_PATH = "/attention";

/**
 * The shell's change point — `--cp-shell-rail`, 1024px
 * (`docs/design/ops2-r1-interaction.md`), stated once.
 *
 * Three things read it and they must agree exactly: whether ion-split-pane
 * shows the rail, whether the tab bar is mounted at all, and which element owns
 * the home-indicator inset. Written twice — say a media query in CSS and a
 * boolean in TS — a one-pixel disagreement produces a width with two navigation
 * surfaces or, worse, none. So it is written here and the CSS keys off the
 * attribute the shell sets, not off a second `@media`.
 */
export const RAIL_MEDIA_QUERY = "(min-width: 1024px)";

/**
 * Is `pathname` inside the destination rooted at `destinationPath`?
 *
 * A SEGMENT-PREFIX match, not an exact one and not a substring one, and it has
 * to be all three of those things for the same reason:
 *
 *   - Exact would put out the rail's light the moment a record opened, while
 *     the tab bar — which matches by prefix inside Ionic (`matchesTab`,
 *     node_modules/@ionic/react/dist/index.js) — stayed lit. One router, two
 *     answers, depending on which side of 1024px you were standing.
 *   - Substring would light Projects at `/projectsomething`. This is the same
 *     boundary rule ../../data/ops2Routing.ts states for the router base, and
 *     for the same reason.
 *
 * Mirroring Ionic's rule rather than inventing one is deliberate: the bar's
 * selected state and the rail's active state are the same fact, and the cheapest
 * way to keep two implementations agreeing is for one of them to be a copy of
 * the other's rule, written down next to why.
 */
export function isDestinationActive(pathname: string, destinationPath: string): boolean {
  return pathname === destinationPath || pathname.startsWith(`${destinationPath}/`);
}

/**
 * The destination an address belongs to, or null if none claims it.
 *
 * The shell's not-found route reads this so that an address nobody routes goes
 * back to the place it NAMED rather than to the console's front door. It became
 * necessary when `/projects` had to become an exact route (a non-exact parent
 * swallows its own child routes inside Ionic's view stack — see Ops2App), which
 * turned `/projects/anything/deeper` from "renders Projects" into "matches
 * nothing". Landing on something was always the requirement; landing on the
 * right something is what this adds, because a stale link under Projects still
 * tells you it was a link to Projects, and answering it with Attention throws
 * that away — indistinguishably, behind Access, from being bounced by auth.
 *
 * Segment-prefix, via the same predicate the rail and the bar use, so all three
 * answer one question one way.
 */
export function destinationRootFor(pathname: string): string | null {
  return DESTINATIONS.find((d) => isDestinationActive(pathname, d.path))?.path ?? null;
}

const BY_PATH = new Map(DESTINATIONS.map((d) => [d.path, d]));
const BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]));

export function destinationByPath(path: string): Destination | undefined {
  return BY_PATH.get(path);
}

export function destination(id: DestinationId): Destination {
  const found = BY_ID.get(id);
  // Unreachable while DestinationId and DESTINATIONS agree, and they are
  // checked against each other in scripts/tests/ops2-navigation.test.mjs.
  if (!found) throw new Error(`ops2: no destination "${id}"`);
  return found;
}

export const TAB_DESTINATIONS: readonly Destination[] = TAB_DESTINATION_IDS.map(destination);
