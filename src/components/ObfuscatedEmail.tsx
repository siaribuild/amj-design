// ─── Scraper-resistant email link ─────────────────────────────────────────────
// Public pages must not hand harvesters a usable address. Three layers:
//
//  1. The address comes from Sanity at RUNTIME (Site Settings → Email), so it is
//     never in the shipped JS bundle or the static HTML a crawler fetches.
//  2. The `href` is ALWAYS a bare "mailto:" — the real address is never written
//     into the DOM, not on hover, not after a click. Activation is handled in JS:
//     the click is cancelled and navigation happens via window.location, so the
//     address exists only for the instant it is used.
//  3. The visible text is split across spans AND interleaved with display:none
//     decoys. A scraper reading innerHTML/textContent gets a corrupted address;
//     what humans see, copy, and what screen readers announce is unaffected
//     (hidden text is excluded from both rendering and selection).
//
// Accessibility is deliberately preserved: the bare href keeps this a genuine,
// keyboard-focusable link that assistive tech announces as a link (an href-less
// anchor is neither), and Enter activates it through the same click path.
import type React from "react";

// Junk that only a naive DOM-text scraper will ever "read".
const DECOY = ["REMOVE", "no-spam", "null"];

export function ObfuscatedEmail({ address, className, children }: {
  address?: string | null;
  className?: string;
  /** Custom label (e.g. "Email us"). Omit to render the address itself. */
  children?: React.ReactNode;
}) {
  const clean = (address ?? "").trim();
  // Nothing configured in Sanity ⇒ render nothing rather than invent an address.
  if (!clean.includes("@")) return null;

  const at = clean.lastIndexOf("@");
  const user = clean.slice(0, at);
  const domain = clean.slice(at + 1);
  const hidden = { display: "none" } as const;

  return (
    <a
      href="mailto:"
      rel="nofollow"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        window.location.href = `mailto:${user}@${domain}`;
      }}
    >
      {children ?? (
        <>
          <span>{user}</span>
          <span style={hidden}>{DECOY[0]}</span>
          <span>{"@"}</span>
          <span style={hidden}>{DECOY[1]}</span>
          <span>{domain}</span>
          <span style={hidden}>{DECOY[2]}</span>
        </>
      )}
    </a>
  );
}
