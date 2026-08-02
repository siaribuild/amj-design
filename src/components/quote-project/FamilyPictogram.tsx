// ═══════════════════════════════════════════════════════════════════════════════
// FAMILY PICTOGRAM
//
// Plan §9. A square, monochrome technical marker for a product family, authored
// in Sanity (family.icon) so the set can be edited without a deploy.
//
// Two rules it must never break:
//  • It is never the only product label. The text product name always sits
//    beside it — the pictogram is reinforcement, not identity. That is what
//    makes an unauthored icon a cosmetic gap rather than a loss of meaning.
//  • A composite parent keeps its scheduled family's marker. Never draw a
//    proportional composite layout at row scale: that would imply an
//    engineering-confirmed mullion arrangement nobody has confirmed yet.
//
// NO built-in stand-in glyph. Substituting a plausible generic window mark for
// missing CMS content is exactly the placeholder-fallback pattern the owner
// ruled out — it masks an unconfigured family instead of showing it. An
// unauthored family renders a neutral, obviously-empty slot that holds the row's
// alignment and reads as "not set yet".
// ═══════════════════════════════════════════════════════════════════════════════
import { useMemo } from "react";
import { getProductBySlug, getFamily } from "../../data/catalogue";

// Allow-list. Anything outside it is dropped rather than escaped, because the
// catalogue is served publicly to every browser: a compromised editor account
// must not be able to turn a pictogram into script on the quote page.
const ALLOWED_TAGS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "title", "desc",
]);
const ALLOWED_ATTRS = new Set([
  "viewbox", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "points", "fill", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "stroke-dasharray", "opacity", "fill-rule", "clip-rule", "transform",
  "vector-effect",
]);
const SVG_NS = "http://www.w3.org/2000/svg";

/** Reduce authored markup to the allow-listed subset, or null if it is not an
 *  SVG at all. Uses the DOM parser rather than regexes — regex "sanitisers" are
 *  reliably defeated by nesting and entity tricks. */
function sanitizeSvg(markup: string): string | null {
  if (typeof window === "undefined" || !markup) return null;
  const trimmed = markup.trim();
  if (!/^<svg[\s>]/i.test(trimmed)) return null;

  const doc = new DOMParser().parseFromString(trimmed, "image/svg+xml");
  if (doc.querySelector("parsererror")) return null;
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg") return null;

  const walk = (el: Element): boolean => {
    // Namespace first: an XHTML-namespaced <g> or <title> would pass a name-only
    // check and then re-parse as HTML.
    if (el.namespaceURI !== SVG_NS) { el.remove(); return false; }
    if (!ALLOWED_TAGS.has(el.localName.toLowerCase())) { el.remove(); return false; }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.localName.toLowerCase();
      // Namespaced attributes (xlink:*, xml:*) are rejected outright rather than
      // relying on the prefixed name not colliding with the allow-list.
      const allowed = attr.namespaceURI === null
        && ALLOWED_ATTRS.has(name)
        && !name.startsWith("on")
        && !attr.value.toLowerCase().includes("javascript:");
      if (!allowed) el.removeAttributeNode(attr);
    }
    // childNodes, NOT children. `children` skips comments, CDATA and processing
    // instructions, and a surviving PI is a real breakout: outerHTML round-trips
    // `<?x >` verbatim, and re-parsing that string as HTML turns it into a bogus
    // comment that ends at the first `>` — everything after it is then parsed as
    // HTML inside SVG foreign content, where <img onerror> executes.
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) walk(child as Element);
      else if (child.nodeType !== Node.TEXT_NODE) child.remove();
    }
    return true;
  };
  if (!walk(root)) return null;

  // The row controls the box; the authored width/height must not fight it.
  root.removeAttribute("width");
  root.removeAttribute("height");
  return root.innerHTML ? root.outerHTML : null;
}

export function FamilyPictogram({ productSlug, size = 18 }: {
  /** The opening's product; its family selects the marker. */
  productSlug: string;
  size?: number;
}) {
  const markup = useMemo(() => {
    const family = getFamily(getProductBySlug(productSlug)?.familySlug ?? "");
    return family?.icon ? sanitizeSvg(family.icon) : null;
  }, [productSlug]);

  // Square box either way, so a list of rows stays optically aligned whether or
  // not every family has been authored yet.
  const box = { width: size, height: size };

  if (!markup) {
    return (
      <span aria-hidden="true" style={box}
        className="inline-block flex-shrink-0 border border-dashed border-line rounded-[2px]" />
    );
  }
  return (
    <span aria-hidden="true" style={box}
      className="inline-flex items-center justify-center flex-shrink-0 text-quiet [&>svg]:w-full [&>svg]:h-full"
      // Sanitised above through a tag/attribute allow-list.
      dangerouslySetInnerHTML={{ __html: markup }} />
  );
}
