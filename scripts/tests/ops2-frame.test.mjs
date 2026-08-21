// ops2's shell frame — the assertions about how the shell is configured.
//
// The design names this file (`docs/design/ops2-ionic-boundary.md` §6, on
// `design/ops2-planning`) for a larger job than it does here: the frame's
// static purity check and the width-matrix work belong to the shell-hosts step,
// which waits on the mock gate. This is its seed, holding the one shell
// configuration that exists today. Behavioural focus assertions belong in
// scripts/tests/web/ops2.spec.ts once there is more than one route to move
// between — with a single catch-all route a focus manager has nothing to do.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "./helpers.mjs";

const read = (file) => readFileSync(join(projectRoot, file), "utf8");

test("setupIonicReact carries R-164's focus priority, and nothing else", () => {
  // Both facts about ops2's Ionic setup live in ONE argument list, and that is
  // precisely how the first version got this wrong: the comment above the call
  // reasoned carefully about leaving the platform mode at its default, and the
  // same bare call silently left focus management off too. Ionic leaves
  // `focusManagerPriority` UNSET by default — focus does not move on
  // navigation — so a value that has to be present is a value worth pinning.
  // It is invisible in every screenshot; nothing else will catch it.
  const call = read("src/ops2/Ops2App.tsx").match(/setupIonicReact\(([\s\S]*?)\);/);
  assert.ok(call, "Ops2App must call setupIonicReact");
  const args = call[1];

  assert.match(args, /focusManagerPriority/, "R-164 is configuration, not something the shell implements");
  const priority = args.match(/focusManagerPriority\s*:\s*\[([^\]]*)\]/);
  assert.ok(priority, "focusManagerPriority must be an array literal, readable from here");
  const order = [...priority[1].matchAll(/["']([a-z-]+)["']/g)].map((m) => m[1]);
  assert.deepEqual(order, ["heading", "content"], "the ORDER is the behaviour: heading first, content as the fallback");

  // The other half of the same argument list. ADR 0005 keeps Ionic's dual
  // platform idiom as an explicit ASSUMED — iOS on the iPhone, Material on the
  // Fold — because that is what the owner judged when he ruled for adoption.
  // Pinning a mode here would quietly overturn a decision he made on a device.
  assert.doesNotMatch(args, /\bmode\s*:/, "the platform mode stays Ionic's, per ADR 0005's ASSUMED");
});
