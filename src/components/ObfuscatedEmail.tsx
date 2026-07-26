// ─── Scraper-resistant email link ─────────────────────────────────────────────
// Public pages must not hand harvesters a plain address. Two layers:
//
//  1. The address comes from Sanity at RUNTIME (Site Settings → Email), so it is
//     never in the shipped JS bundle or the static HTML a crawler fetches.
//  2. No `mailto:` href exists in the DOM until the visitor actually interacts
//     (hover / focus / tap), and the visible text is split across elements so a
//     regex over innerHTML finds no `user@domain` pattern.
//
// Humans and assistive tech are unaffected: it stays a real anchor, keyboard
// focusable, the rendered text reads normally, and copy-paste yields the full
// address (textContent is intact — only the markup is broken up).
import { useState } from "react";

export function ObfuscatedEmail({ address, className, children }: {
  address?: string | null;
  className?: string;
  /** Custom label (e.g. "Email us"). Omit to render the address itself. */
  children?: React.ReactNode;
}) {
  // Starts as a BARE "mailto:" — enough to keep this a genuine, keyboard-focusable
  // link that assistive tech announces correctly, while carrying no address for a
  // harvester to read. Real interaction swaps in the full address.
  const [href, setHref] = useState("mailto:");
  const clean = (address ?? "").trim();
  // Nothing configured in Sanity ⇒ render nothing rather than invent an address.
  if (!clean.includes("@")) return null;

  const at = clean.lastIndexOf("@");
  const user = clean.slice(0, at);
  const domain = clean.slice(at + 1);
  const armed = href !== "mailto:";
  const arm = () => setHref(`mailto:${user}@${domain}`);

  return (
    <a
      href={href}
      // Arm on any real intent; the first click also navigates, so a visitor
      // never has to click twice.
      onMouseEnter={arm}
      onFocus={arm}
      onTouchStart={arm}
      // Click/Enter always works first time, armed or not — never a double-click.
      onClick={(e) => {
        if (!armed) {
          e.preventDefault();
          arm();
          window.location.href = `mailto:${user}@${domain}`;
        }
      }}
      rel="nofollow"
      className={className}
    >
      {children ?? <><span>{user}</span><span>{"@"}</span><span>{domain}</span></>}
    </a>
  );
}
