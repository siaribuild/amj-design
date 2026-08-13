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
const HERO: Record<CategorySlug, { headline: string; sub: string; image: string; alt: string }> = {
  windows: {
    headline: "Aluminium window systems.",
    sub: "Engineered for performance. Made to suit your project.",
    image: "https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1920&h=1080&fit=crop&auto=format",
    alt: "Aluminium-framed windows set into a contemporary residential facade",
  },
  doors: {
    headline: "Aluminium door systems.",
    sub: "Built for wide openings, smooth operation and everyday durability.",
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
  { title: "Reviewed before you pay", sub: "A person checks your quote before it is issued. $0 to quote, 50% on acceptance.", Icon: CheckCircle },
  { title: "Supply only", sub: "We manufacture and deliver. Installation is arranged by your builder or installer.", Icon: Package },
  { title: "Delivered Australia-wide", sub: "Tailgate to the kerb at your address. You unload; the delivery is quoted with the frames.", Icon: Truck },
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
      className="tab text-left p-4 w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2">
      <div className="mb-2.5">{icon}</div>
      <p className={`mb-0.5 ${active ? "font-semibold text-ink" : "font-medium text-ink"} font-display t-bd-sm`}>{label}</p>
      <p className="text-body t-cap">{count} system types</p>
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
      className="group relative card card-link text-left overflow-hidden flex flex-col cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2">
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
      <div className="relative bg-shade aspect-[4/3] overflow-hidden">
        <img src={imageUrl(product.heroImage, { w: 640, h: 480 })}
          alt={`${product.name} aluminium ${category === "windows" ? "window" : "door"} system`}
          loading="lazy" decoding="async"
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
      </div>
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-semibold text-ink tracking-[-0.01em] mb-1.5 font-display t-bd-lg">{product.name}</h3>
        <p className="text-body mb-3 line-clamp-2 t-bd-sm">{product.shortDescription}</p>
        {/* One unboxed line. The chips' own border was black/10, which over bone
            composites to about #D8D5D1 — a barely-visible box around 11px grey
            mono, which reads as tentative rather than as detail. */}
        {meta && (
          <p className="text-quiet tracking-wide mb-4 font-data t-data-sm">{meta}</p>
        )}
        <span className="mt-auto inline-flex items-center gap-1.5 font-medium text-sage group-hover:gap-2.5 transition-all t-bd-sm">
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
      <p className="text-body mb-2 font-data t-label">Browse by family</p>
      <div className="relative" ref={ref}>
        <button type="button" onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox" aria-expanded={open}
          className="w-full flex items-center justify-between gap-3 card px-4 py-3 text-ink cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 t-bd-sm">
          <span className="font-medium">{current.name}</span>
          <ChevronDown className={`w-4 h-4 text-body flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div role="listbox" aria-label="Product family"
            className="absolute left-0 right-0 top-full mt-1 z-30 card border-line-strong max-h-[60vh] overflow-y-auto">
            {options.map(o => {
              const active = o.slug === family;
              return (
                <button key={o.slug} type="button" role="option" aria-selected={active} onClick={() => select(o.slug)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left border-b border-black/6 last:border-b-0 cursor-pointer transition-colors ${active ? "bg-sage-wash text-ink font-semibold" : "text-ink hover:bg-black/[0.02]"} t-bd-sm`}>
                  <span>{o.name}</span>
                  <span className="text-body flex-shrink-0 t-cap">{o.count} system{o.count === 1 ? "" : "s"}</span>
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

  // BONE IS THE PAGE, INCLUDING THE CATALOGUE. night → bone → paper → bone.
  //
  // This band was ground-paper, and the comment here defended it on the grounds
  // that full-page bone had been tried and reverted for reading as "a wash of
  // warm grey behind photography". That revert was real (b83c8a68) and it was
  // right — against the bone of the day. Bone was #F0EDE8 then, ΔL* 6.15 from
  // paper. It was lightened twice in the seven hours AFTER that revert (9cc68fa9,
  // a9a08a87) and is now #FBFAF8, ΔL* 1.70 — the token's own comment calls it
  // "deliberately barely there". The objection was aimed at a value 3.6× darker
  // that no longer exists anywhere in the codebase.
  //
  // Two more of that comment's claims did not survive checking. It called the
  // home page's Systems section "the site's only other photographic tile grid":
  // Systems is bg-ink with no .card at all, so its ground never touched a fill,
  // and ProductDetailPage — the page this grid links INTO — has been shipping
  // paper-bodied photographic .card tiles on a bone ground the whole time
  // (ProductDetailPage.tsx:477). The arrangement being avoided here was already
  // live one click away, in the same funnel, on the same photography.
  //
  // And paper was never the untinted field the argument assumed: section.ground-paper
  // paints a 64px sage drafting grid behind its content (theme.css:935), ΔL* 2.17
  // — MORE tint than bone — and because that pseudo-element is absolutely
  // positioned with no z-index it painted over the product photographs unless the
  // inner wrapper was made `relative` to stop it. Bone carries no decoration, so
  // that hazard and its workaround both go away.
  //
  // What a tile loses: nothing. The photograph sits on its own bg-shade plate
  // (#E8E5DF, 7.28 L* below bone) inside overflow-hidden, so it never touches the
  // ground; the 1px --line border that bounds the caption is ground-independent;
  // and the sage-wash hover doubles in legibility against a paper fill.
  return (
    <div className="ground-bone min-h-screen">
      {/* ─── HERO — contextual to selected category, header overlays it ─────── */}
      <section className="relative h-[360px] md:h-[440px] flex items-end bg-night overflow-hidden">
        <img src={imageUrl(getPage("products")?.heroImage, { w: 1920, h: 1080 })} alt={hero.alt} className="hero-img hero-zoom" />
        <div className="hero-scrim" aria-hidden="true" />
        <div className="relative w-full max-w-6xl mx-auto px-6 pt-24 pb-10 md:pt-28 md:pb-12">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-4">
              <WindowMark size={10} color="rgba(255,255,255,0.55)" />
              <span className="text-white/60 font-data t-label">Products</span>
            </div>
            <h1 className="text-white mb-3 t-ds1">{hero.headline}</h1>
            {/* One supporting line, not two. The hero carried headline + sub +
                body — three stacked text blocks, 182 characters of support under
                a 25-character headline — and `body` was filler either way
                ("Explore our range… and find the right solution"), restating the
                sub and describing the act of browsing to someone already
                browsing. The catalogue itself is the argument on this page. */}
            <p className="text-white/85 max-w-[44ch] mb-6 t-bd">{hero.sub}</p>
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

      {/* The catalogue band. No border-t: it meets the night hero, and a hairline
          on black is invisible — the phase sections on How it works do the same.
          No section-pad either: 96px of empty ground above the taxonomy rail is
          the opposite of what this page is for, so it keeps its working rhythm.
          The inner wrapper no longer needs `relative`: that existed solely to
          stop ground-paper's drafting grid painting over the photographs, and
          bone carries no decoration. Nothing in here is absolutely positioned;
          the rail is lg:sticky, which does not need a positioned ancestor. */}
      <section className="ground-bone">
      <div className="max-w-6xl mx-auto px-6">
        <div className="lg:grid lg:grid-cols-[272px_1fr] lg:gap-10 py-8 md:py-10">

          {/* ─── MOBILE — category cards + family scroll rail ───────────────── */}
          <div className="lg:hidden mb-8 space-y-5">
            <div>
              <p className="text-body mb-2 font-data t-label">Category</p>
              <div className="grid grid-cols-2 gap-3">
                <CategoryTile label="Windows" count={windowCount} icon={<WindowMark size={20} color={category === "windows" ? SAGE : "var(--quieter)"} />} active={category === "windows"} onClick={() => onSelectCategory("windows")} />
                <CategoryTile label="Doors" count={doorCount} icon={<IconDoorCat size={20} color={category === "doors" ? SAGE : "var(--quieter)"} />} active={category === "doors"} onClick={() => onSelectCategory("doors")} />
              </div>
            </div>
            <MobileFamilySelector category={category} families={families} family={family} onSelect={onSelectFamily} />
          </div>

          {/* ─── DESKTOP — left taxonomy rail ────────────────────────────────── */}
          <aside className="hidden lg:block">
            <div className="lg:sticky lg:top-24 space-y-8">
              <div>
                <p className="text-body mb-3 font-data t-label">Category</p>
                <div className="space-y-2">
                  <CategoryTile label="Windows" count={windowCount} icon={<WindowMark size={20} color={category === "windows" ? SAGE : "var(--quieter)"} />} active={category === "windows"} onClick={() => onSelectCategory("windows")} />
                  <CategoryTile label="Doors" count={doorCount} icon={<IconDoorCat size={20} color={category === "doors" ? SAGE : "var(--quieter)"} />} active={category === "doors"} onClick={() => onSelectCategory("doors")} />
                </div>
              </div>

              <div>
                <p className="text-body mb-2 font-data t-label">{category === "windows" ? "Window systems" : "Door systems"}</p>
                <div className="flex flex-col">
                  <button onClick={() => onSelectFamily("all")} aria-pressed={family === "all"}
                    className={`text-left px-3 py-2.5 border-l-2 transition-colors cursor-pointer ${family === "all" ? "border-sage text-ink font-semibold bg-sage-wash" : "border-transparent text-body hover:text-ink hover:bg-black/[0.02]"} t-bd-sm`}>
                    All {category}
                  </button>
                  {families.map(f => (
                    <button key={f.slug} onClick={() => onSelectFamily(f.slug)} aria-pressed={family === f.slug}
                      className={`text-left px-3 py-2.5 border-l-2 transition-colors cursor-pointer ${family === f.slug ? "border-sage text-ink font-semibold bg-sage-wash" : "border-transparent text-body hover:text-ink hover:bg-black/[0.02]"} t-bd-sm`}>
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
                  className="w-full text-left border-t border-line pt-3 mt-1 px-3 py-2 text-body hover:text-ink cursor-pointer t-cap">
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
              <h2 className="text-ink t-hd1">{heading}</h2>
              <p className="text-quiet flex-shrink-0 pb-1 font-data t-data">{list.length} system{list.length === 1 ? "" : "s"}</p>
            </div>
            <p className="text-body leading-relaxed max-w-2xl mb-8 t-bd">{description}</p>

            {/* Product grid / empty state */}
            {list.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map(p => (
                  <ProductCard key={p.id} product={p} category={category} onView={() => onOpenProduct(p.slug)} />
                ))}
              </div>
            ) : (
              <div className="card p-8 text-center">
                <AlertCircle className="w-6 h-6 text-sage mx-auto mb-3" />
                <p className="text-ink font-medium mb-1">No systems found for this selection.</p>
                <p className="text-body mb-5 t-bd-sm">Try another family or upload your schedule and we'll help identify the right product.</p>
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
      </section>

      {/* ─── WHAT YOU GET ──────────────────────────────────────────────────────
          Was four icons in a grid INSIDE the max-w-6xl content wrapper, held up
          by nothing but a border-t — so its ground did not span and it read as a
          footnote to the product grid rather than as a section. Now it is one,
          full-bleed with contained content, on the site's standard section
          rhythm.
          PAPER, because the catalogue above it is bone now: two bone sections
          meeting would put the whole lower page on one surface and the seam
          would be a rule drawn on a single ground rather than a change of it.
          This is the page's one paper interruption, which is the shape every
          other page uses — bone is the page, paper is the interruption.
          Still NOT cards. It was hairlines because on bone a .card resolves to
          paper and four boxes would compete with the grid above; on paper they
          would resolve to bone and do the same thing in the other direction.
          Hairlines are right either way — the device the home page uses for
          exactly this content — so nothing here moves.
          The copy is rewritten. "Manufacturer-backed / Quality you can trust"
          is a content-free imperative, and promoting weak copy to a bigger stage
          only makes it louder. Every line below is stated elsewhere on the site
          — the two-day review and the $0/50% terms on home, supply-only in the
          same section — so nothing here is a new claim. */}
      <section className="ground-paper border-t border-black/8 section-pad">
        <div className="max-w-6xl mx-auto px-6">
          <SLabel>What you get</SLabel>
          <h2 className="text-ink mb-8 t-hd1">
            Made to your schedule, supplied to your site.
          </h2>
          {/* One column at 375: two columns there gave each item ~156px for a
              four-word heading plus a sentence, which wrapped to five lines. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-black/10">
            {TRUST_ITEMS.map((t, i) => (
              <div key={t.title} className={`py-5 sm:py-0 ${i === 0 ? "sm:pr-6" : "sm:px-6"} ${i === TRUST_ITEMS.length - 1 ? "sm:pr-0" : ""}`}>
                <t.Icon className="w-4 h-4 text-sage mb-2.5" aria-hidden="true" />
                <p className="font-semibold text-ink leading-snug mb-1 font-display t-bd">{t.title}</p>
                <p className="text-body t-cap">{t.sub}</p>
              </div>
            ))}
          </div>
          {/* The standards, as a reference and a link — NOT as a claim. Home
              already says test reports and certificates are "published, not
              promised"; the resources page itself states that its documents are
              sample placeholders, so repeating that sentence here would double
              an assertion the destination does not yet support. */}
          <p className="mt-8 pt-5 border-t border-black/8 text-body flex flex-wrap items-center gap-x-3 gap-y-1.5 t-bd-sm">
            <span className="text-ink font-data">AS 2047 · AS 1288</span>
            <span>The Australian standards for windows, doors and glazing in buildings.</span>
            <button onClick={() => go("resources")}
              className="text-sage hover:text-sage-deep inline-flex items-center gap-1.5 cursor-pointer">
              Compliance references <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </p>
        </div>
      </section>

      {/* The page's ONE ask, and the ending it never had — this was the only
          marketing page on the site that simply stopped. Pinned to bone rather
          than taking the paper default: it follows the What-you-get section,
          which is paper now, and two paper sections in a row is the seam
          disappearing — which is the reason CtaBanner takes a ground at all. */}
      <CtaBanner
        title="Skip the catalogue — send the schedule."
        sub="Upload your window and door schedule and every line comes back matched to a system and priced in about a minute."
        onQuote={() => go("quote")}
        ground="bone"
      />
    </div>
  );
}
