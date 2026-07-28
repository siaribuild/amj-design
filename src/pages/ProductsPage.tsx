// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCTS PAGE — catalogue (category → family filter → product card → detail)
// Data comes from src/data/catalogue.ts (future Sanity source). This file is the
// presentation template only.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from "react";
import {
  ArrowRight, ChevronDown, FileText, AlertCircle, Truck, CheckCircle, Package, ShieldCheck,
} from "lucide-react";
import { type Page, SAGE, WindowMark, Btn, SLabel, CtaBanner } from "../app/ui";
import {
  type CategorySlug, type Product, type Family,
  getCategory, getFamiliesByCategory, getProductsByCategory, getProductsByFamily, familyProductCount, imageUrl, getPage,
} from "../data/catalogue";

// ─── Per-category presentation copy (marketing text, not product data) ─────────
const HERO: Record<CategorySlug, { headline: string; sub: string; body: string; image: string; alt: string }> = {
  windows: {
    headline: "Aluminium window systems.",
    sub: "Engineered for performance. Made to suit your project.",
    body: "Explore our range of aluminium window systems and find the right solution before you build an estimate.",
    image: "https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1920&h=1080&fit=crop&auto=format",
    alt: "Aluminium-framed windows set into a contemporary residential facade",
  },
  doors: {
    headline: "Aluminium door systems.",
    sub: "Built for wide openings, smooth operation and everyday durability.",
    body: "Explore sliding, hinged, folding, pivot and large-panel door systems before building an estimate.",
    image: "https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1920&h=1080&fit=crop&auto=format",
    alt: "Large aluminium sliding doors opening onto an alfresco area",
  },
};

// Every line here is checkable and is already stated elsewhere on the site: the
// two-business-day review and the $0 / 50% terms on the home page, supply-only in
// the same section. "Quality you can trust" and "Checked by our team" were the
// previous wording — assertions with nothing behind them, which is the thing the
// home page's "Nothing here is a claim you have to take on trust" exists to avoid.
const TRUST_ITEMS: { title: string; sub: string; Icon: typeof Truck }[] = [
  { title: "Made to your sizes", sub: "Every unit is manufactured to the dimensions on your schedule.", Icon: ShieldCheck },
  { title: "Reviewed before you pay", sub: "A person checks your quote within two business days. $0 to quote, 50% on acceptance.", Icon: CheckCircle },
  { title: "Supply only", sub: "We manufacture and deliver. Installation is arranged by your builder or installer.", Icon: Package },
  { title: "Delivered across Melbourne & Victoria", sub: "Door-to-door, from our factory to your site.", Icon: Truck },
];

function familyDescription(category: CategorySlug, familySlug: string): string {
  if (familySlug === "all") {
    const cat = getCategory(category);
    return cat?.shortDescription
      ?? (category === "windows"
        ? "Browse our aluminium window systems. Each is designed for performance, durability and a clean, modern look."
        : "Aluminium door systems for patios, large openings and indoor-outdoor living.");
  }
  const fams = getFamiliesByCategory(category);
  const fam = fams.find(f => f.slug === familySlug);
  return fam?.shortDescription ?? "";
}

// Two-leaf door mark — pairs with WindowMark on the category tiles
function IconDoorCat({ size = 20, color = SAGE }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="18" height="18" stroke={color} strokeWidth="1.5" />
      <line x1="10" y1="1" x2="10" y2="19" stroke={color} strokeWidth="1.5" />
      <circle cx="7.8" cy="10" r="0.9" fill={color} />
      <circle cx="12.2" cy="10" r="0.9" fill={color} />
    </svg>
  );
}

function CategoryTile({ label, count, icon, active, onClick }: {
  label: string; count: number; icon: React.ReactNode; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`text-left border p-4 w-full transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A] focus-visible:ring-offset-2 ${active ? "card card-selected" : "card card-link"}`}>
      <div className="mb-2.5">{icon}</div>
      <p className={`text-sm mb-0.5 ${active ? "font-semibold text-[#131311]" : "font-medium text-[#131311]"}`}
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{label}</p>
      <p className="text-xs text-[#5c5a56]">{count} system types</p>
    </button>
  );
}

function ProductCard({ product, category, onView }: { product: Product; category: CategorySlug; onView: () => void }) {
  // The two specs that actually DISCRIMINATE. Measured across the 27 catalogue
  // products: Max size has 21 distinct values and Wind rating 5, against Frame
  // profile 4 and Glazing 3 — and the card used to render exactly the latter
  // two, by slice(0, 2), value only, with no label. So every card read
  // "1.6mm  Double glazed": a bare number with nothing to say what it measures,
  // beside a value 25 of 27 products share. Two bordered boxes, no information.
  const spec = (label: string) => product.keySpecs.find((s) => s.label === label)?.value;
  const meta = [spec("Max size") && `max ${spec("Max size")}`, spec("Wind rating")].filter(Boolean).join("  ·  ");
  return (
    <button onClick={onView}
      className="group relative card card-link text-left overflow-hidden flex flex-col cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A] focus-visible:ring-offset-2">
      {/* The photograph, undimmed.
          It used to be composited at 70% over pure black, with a 55% black
          scrim over the bottom third and a 2px inset white rule — a treatment
          copied from the home page's Systems tiles, where it is load-bearing
          because white type sits ON the image and would otherwise die. Here the
          name, description and specs are all in the body BELOW, so the scrim
          carried no content and cost the grid all of its differentiation:
          twelve photographs of similar white-framed units, each pushed 30%
          toward black, arrive as twelve identical grey rectangles.
          Placeholder is warm neutral rather than black — a black rectangle is a
          worse first frame than a stock-coloured one on a paper page. */}
      <div className="relative bg-[#E8E5DF] aspect-[4/3] overflow-hidden">
        <img src={imageUrl(product.heroImage, { w: 640, h: 480 })}
          alt={`${product.name} aluminium ${category === "windows" ? "window" : "door"} system`}
          loading="lazy" decoding="async"
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
      </div>
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-semibold text-[#131311] text-[19px] leading-tight tracking-[-0.01em] mb-1.5"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{product.name}</h3>
        <p className="text-sm text-[#5c5a56] leading-relaxed mb-3 line-clamp-2">{product.shortDescription}</p>
        {/* One unboxed line. The chips' own border was black/10, which over bone
            composites to about #D8D5D1 — a barely-visible box around 11px grey
            mono, which reads as tentative rather than as detail. */}
        {meta && (
          <p className="text-[11.5px] text-[#8a8782] tracking-wide mb-4"
            style={{ fontFamily: "'DM Mono', monospace" }}>{meta}</p>
        )}
        <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-[#5A7A6A] group-hover:gap-2.5 transition-all">
          View product <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </button>
  );
}

// Mobile family selector — compact in-page dropdown (no horizontal chip rail, no
// full-screen drawer/modal). Sits under the Windows/Doors switch, shows the current
// family, expands an inline list of families with product counts, closes on select.
function MobileFamilySelector({ category, families, family, onSelect }: {
  category: CategorySlug; families: Family[]; family: string; onSelect: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);

  const allLabel = category === "windows" ? "All windows" : "All doors";
  const options = [
    { slug: "all", name: allLabel, count: getProductsByCategory(category).length },
    ...families.map(f => ({ slug: f.slug, name: f.name, count: familyProductCount(f.slug) })),
  ];
  const current = options.find(o => o.slug === family) ?? options[0];
  const select = (slug: string) => { onSelect(slug); setOpen(false); };

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-[#5c5a56] mb-2"
        style={{ fontFamily: "'DM Mono', monospace" }}>Browse by family</p>
      <div className="relative" ref={ref}>
        <button type="button" onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox" aria-expanded={open}
          className="w-full flex items-center justify-between gap-3 card px-4 py-3 text-sm text-[#131311] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A] focus-visible:ring-offset-2">
          <span className="font-medium">{current.name}</span>
          <ChevronDown className={`w-4 h-4 text-[#5c5a56] flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div role="listbox" aria-label="Product family"
            className="absolute left-0 right-0 top-full mt-1 z-30 card border-line-strong max-h-[60vh] overflow-y-auto">
            {options.map(o => {
              const active = o.slug === family;
              return (
                <button key={o.slug} type="button" role="option" aria-selected={active} onClick={() => select(o.slug)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm border-b border-black/6 last:border-b-0 cursor-pointer transition-colors ${active ? "bg-sage-wash text-[#131311] font-semibold" : "text-[#131311] hover:bg-black/[0.02]"}`}>
                  <span>{o.name}</span>
                  <span className="text-xs text-[#5c5a56] flex-shrink-0">{o.count} system{o.count === 1 ? "" : "s"}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProductsPage({ setPage, category, family, onSelectCategory, onSelectFamily, onOpenProduct }: {
  setPage: (p: Page) => void;
  category: CategorySlug;
  family: string;                              // "all" or a family slug
  onSelectCategory: (c: CategorySlug) => void; // resets family to "all"
  onSelectFamily: (f: string) => void;
  onOpenProduct: (slug: string) => void;
}) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };

  const families = getFamiliesByCategory(category);
  const hero = HERO[category];
  const windowCount = getFamiliesByCategory("windows").length;
  const doorCount = getFamiliesByCategory("doors").length;

  // Products come pre-ordered by featuredOrder from the selectors.
  const list = family === "all" ? getProductsByCategory(category) : getProductsByFamily(family);

  const activeFamily = families.find(f => f.slug === family);
  const heading = family === "all"
    ? (category === "windows" ? "All window systems" : "All door systems")
    : (activeFamily?.name ?? "");
  const description = familyDescription(category, family);

  // ground-paper, and the CARDS carry the fill. Bone as a full-page ground was
  // tried first and read as a wash of warm grey behind photography — the images
  // are the figure on a catalogue and a tinted field competes with them.
  //
  // Inverting it keeps the derivation rule intact (the card still takes the
  // other surface, it is just the other way round now) and fixes the original
  // complaint the same way: a product tile is a bone body under a dark image on
  // a white page, so the gutters between tiles read and the text below each
  // photograph is bounded instead of floating.
  return (
    <div className="ground-paper min-h-screen">
      {/* ─── HERO — contextual to selected category, header overlays it ─────── */}
      <section className="relative h-[360px] md:h-[440px] flex items-end bg-[#0c0c0a] overflow-hidden">
        <img src={imageUrl(getPage("products")?.heroImage, { w: 1920, h: 1080 })} alt={hero.alt} className="absolute inset-0 w-full h-full object-cover opacity-70 hero-zoom" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(12,12,10,0.88) 0%, rgba(12,12,10,0.55) 20%, rgba(12,12,10,0.25) 45%, rgba(12,12,10,0.15) 100%)" }} />
        <div className="relative w-full max-w-6xl mx-auto px-6 pt-24 pb-10 md:pt-28 md:pb-12">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-4">
              <WindowMark size={10} color="rgba(255,255,255,0.55)" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60"
                style={{ fontFamily: "'DM Mono', monospace" }}>Products</span>
            </div>
            <h1 className="font-semibold text-white leading-[1.05] tracking-tight mb-3"
              style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(2rem, 4.4vw, 3rem)" }}>{hero.headline}</h1>
            <p className="text-white/85 text-base md:text-lg mb-2">{hero.sub}</p>
            <p className="text-white/70 text-sm md:text-[15px] leading-relaxed max-w-lg mb-6">{hero.body}</p>
            {/* "Upload a schedule", not "Start a quote": it is the specific,
                higher-signal version of the action, it is exactly what the two
                deleted mid-page panels were offering — so that ask survives once,
                at the top, where it costs a trade visitor no scroll — and it stops
                the hero and the closing banner carrying two labels that read the
                same ("Start a quote" / "Get a quote").
                On the sage ration: this is a fill on a dark photograph, where ink
                disappears and the border-only variant was deleted for that very
                reason. The ration protects the light sections; the hero is exempt. */}
            <Btn variant="sage" size="md" onClick={() => go("quote")}>Upload a schedule <ArrowRight className="w-4 h-4" /></Btn>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6">
        <div className="lg:grid lg:grid-cols-[272px_1fr] lg:gap-10 py-8 md:py-10">

          {/* ─── MOBILE — category cards + family scroll rail ───────────────── */}
          <div className="lg:hidden mb-8 space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#5c5a56] mb-2"
                style={{ fontFamily: "'DM Mono', monospace" }}>Category</p>
              <div className="grid grid-cols-2 gap-3">
                <CategoryTile label="Windows" count={windowCount} icon={<WindowMark size={20} color={category === "windows" ? SAGE : "#9a9894"} />} active={category === "windows"} onClick={() => onSelectCategory("windows")} />
                <CategoryTile label="Doors" count={doorCount} icon={<IconDoorCat size={20} color={category === "doors" ? SAGE : "#9a9894"} />} active={category === "doors"} onClick={() => onSelectCategory("doors")} />
              </div>
            </div>
            <MobileFamilySelector category={category} families={families} family={family} onSelect={onSelectFamily} />
          </div>

          {/* ─── DESKTOP — left taxonomy rail ────────────────────────────────── */}
          <aside className="hidden lg:block">
            <div className="lg:sticky lg:top-24 space-y-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[#5c5a56] mb-3"
                  style={{ fontFamily: "'DM Mono', monospace" }}>Category</p>
                <div className="space-y-2">
                  <CategoryTile label="Windows" count={windowCount} icon={<WindowMark size={20} color={category === "windows" ? SAGE : "#9a9894"} />} active={category === "windows"} onClick={() => onSelectCategory("windows")} />
                  <CategoryTile label="Doors" count={doorCount} icon={<IconDoorCat size={20} color={category === "doors" ? SAGE : "#9a9894"} />} active={category === "doors"} onClick={() => onSelectCategory("doors")} />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[#5c5a56] mb-2"
                  style={{ fontFamily: "'DM Mono', monospace" }}>{category === "windows" ? "Window systems" : "Door systems"}</p>
                <div className="flex flex-col">
                  <button onClick={() => onSelectFamily("all")} aria-pressed={family === "all"}
                    className={`text-left px-3 py-2.5 text-sm border-l-2 transition-colors cursor-pointer ${family === "all" ? "border-[#5A7A6A] text-[#131311] font-semibold bg-sage-wash" : "border-transparent text-[#5c5a56] hover:text-[#131311] hover:bg-black/[0.02]"}`}>
                    All {category}
                  </button>
                  {families.map(f => (
                    <button key={f.slug} onClick={() => onSelectFamily(f.slug)} aria-pressed={family === f.slug}
                      className={`text-left px-3 py-2.5 text-sm border-l-2 transition-colors cursor-pointer ${family === f.slug ? "border-[#5A7A6A] text-[#131311] font-semibold bg-sage-wash" : "border-transparent text-[#5c5a56] hover:text-[#131311] hover:bg-black/[0.02]"}`}>
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* The rail's help panel is GONE. It offered "Upload a schedule"
                  and "Contact us" — the same two actions, in near-identical
                  words, as the strip at the foot of the product list; and
                  because this rail is lg:sticky, at the bottom of the list the
                  two sat side by side saying the same thing 272px apart.
                  The rail is a filter now, nothing else. Deliberately NOT
                  backfilled: stapling marketing to the bottom of a filter column
                  is how the duplicate appeared in the first place. The only
                  thing that belongs here is a filter function. */}
              {family !== "all" && (
                <button onClick={() => onSelectFamily("all")}
                  className="w-full text-left border-t border-line pt-3 mt-1 px-3 py-2 text-xs text-[#5c5a56] hover:text-[#131311] cursor-pointer">
                  Clear filter
                </button>
              )}
            </div>
          </aside>

          {/* ─── MAIN CONTENT — heading, product grid ─────────────────────────
              The per-category benefit row is gone: four unsupported adjectives
              ("Engineered for performance", "Tested for strength & durability",
              "Australian standards", "Wide range of styles & configurations")
              between the heading and the first product, costing ~90px on desktop
              and ~160px at 375px. On a catalogue the fastest route to the grid
              wins, and its one checkable claim — the standards — is carried
              properly by the AS 2047 · AS 1288 line further down. */}
          <div>
            {/* Count on the heading's baseline, the site's established heading-row
                pattern (home Systems, Process). */}
            <div className="flex items-end justify-between gap-4 mb-2">
              <h2 className="font-semibold text-[#131311] leading-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.6rem, 2.8vw, 2.1rem)" }}>{heading}</h2>
              <p className="text-[13px] text-[#8a8782] flex-shrink-0 pb-1"
                style={{ fontFamily: "'DM Mono', monospace" }}>{list.length} system{list.length === 1 ? "" : "s"}</p>
            </div>
            <p className="text-[#5c5a56] text-[15px] leading-relaxed max-w-2xl mb-8">{description}</p>

            {/* Product grid / empty state */}
            {list.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                {list.map(p => (
                  <ProductCard key={p.id} product={p} category={category} onView={() => onOpenProduct(p.slug)} />
                ))}
              </div>
            ) : (
              <div className="card p-8 text-center mb-10">
                <AlertCircle className="w-6 h-6 text-[#5A7A6A] mx-auto mb-3" />
                <p className="text-[#131311] font-medium mb-1">No systems found for this selection.</p>
                <p className="text-sm text-[#5c5a56] mb-5">Try another family or upload your schedule and we'll help identify the right product.</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Btn variant="outline" size="sm" onClick={() => onSelectFamily("all")}>Clear filters</Btn>
                  <Btn variant="sage" size="sm" onClick={() => go("quote")}>Upload schedule</Btn>
                </div>
              </div>
            )}

            {/* The second of the two duplicate CTAs was here and is gone too.
                The catalogue column now ENDS at the grid. The page's one ask is
                the shared CtaBanner at the foot, which is where every other
                marketing page puts it and which this page did not have at all. */}
          </div>
        </div>

      </div>

      {/* ─── WHAT YOU GET ──────────────────────────────────────────────────────
          Was four icons in a grid INSIDE the max-w-6xl content wrapper, held up
          by nothing but a border-t — so its ground did not span and it read as a
          footnote to the product grid rather than as a section. Now it is one,
          full-bleed on bone with contained content, on the site's standard
          section rhythm.
          NOT cards: on bone, .card resolves to paper, and four paper boxes would
          become four objects competing with the grid above. Hairlines only, the
          device the home page uses for exactly this content.
          The copy is rewritten. "Manufacturer-backed / Quality you can trust"
          is a content-free imperative, and promoting weak copy to a bigger stage
          only makes it louder. Every line below is stated elsewhere on the site
          — the two-day review and the $0/50% terms on home, supply-only in the
          same section — so nothing here is a new claim. */}
      <section className="ground-bone border-t border-black/8 py-14 md:py-[68px]">
        <div className="max-w-6xl mx-auto px-6">
          <SLabel>What you get</SLabel>
          <h2 className="font-semibold text-[#131311] leading-tight mb-8"
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.6rem, 2.8vw, 2.1rem)" }}>
            Made to your schedule, supplied to your site.
          </h2>
          {/* One column at 375: two columns there gave each item ~156px for a
              four-word heading plus a sentence, which wrapped to five lines. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-black/10">
            {TRUST_ITEMS.map((t, i) => (
              <div key={t.title} className={`py-5 sm:py-0 ${i === 0 ? "sm:pr-6" : "sm:px-6"} ${i === TRUST_ITEMS.length - 1 ? "sm:pr-0" : ""}`}>
                <t.Icon className="w-4 h-4 text-[#5A7A6A] mb-2.5" aria-hidden="true" />
                <p className="text-[15px] font-semibold text-[#131311] leading-snug mb-1"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{t.title}</p>
                <p className="text-[13.5px] text-[#5c5a56] leading-relaxed">{t.sub}</p>
              </div>
            ))}
          </div>
          {/* The standards, as a reference and a link — NOT as a claim. Home
              already says test reports and certificates are "published, not
              promised"; the resources page itself states that its documents are
              sample placeholders, so repeating that sentence here would double
              an assertion the destination does not yet support. */}
          <p className="mt-8 pt-5 border-t border-black/8 text-sm text-[#5c5a56] flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-[#131311]" style={{ fontFamily: "'DM Mono', monospace" }}>AS 2047 · AS 1288</span>
            <span>The Australian standards for windows, doors and glazing in buildings.</span>
            <button onClick={() => go("resources")}
              className="text-[#5A7A6A] hover:text-[#3f5a4c] inline-flex items-center gap-1.5 cursor-pointer">
              Compliance references <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </p>
        </div>
      </section>

      {/* The page's ONE ask, and the ending it never had — this was the only
          marketing page on the site that simply stopped. Defaults to paper,
          which follows the bone section above it exactly as on every other page. */}
      <CtaBanner
        title="Skip the catalogue — send the schedule."
        sub="Upload your window and door schedule and every line comes back matched to a system and priced in about a minute."
        onQuote={() => go("quote")}
      />
    </div>
  );
}
