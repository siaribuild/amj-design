// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCTS PAGE — catalogue (category → family filter → product card → detail)
// Data comes from src/data/catalogue.ts (future Sanity source). This file is the
// presentation template only.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from "react";
import {
  ArrowRight, ChevronDown, FileText, AlertCircle, Truck, CheckCircle, Package,
  Gauge, ShieldCheck, BadgeCheck, LayoutGrid,
} from "lucide-react";
import { type Page, SAGE, WindowMark, Btn } from "../app/ui";
import {
  type CategorySlug, type Product, type Family,
  getCategory, getFamiliesByCategory, getProductsByCategory, getProductsByFamily, familyProductCount,
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

const BENEFITS: Record<CategorySlug, { label: string; Icon: typeof Gauge }[]> = {
  windows: [
    { label: "Engineered for performance", Icon: Gauge },
    { label: "Tested for strength & durability", Icon: ShieldCheck },
    { label: "Australian standards", Icon: BadgeCheck },
    { label: "Wide range of styles & configurations", Icon: LayoutGrid },
  ],
  doors: [
    { label: "Smooth operation", Icon: Gauge },
    { label: "Wide opening options", Icon: LayoutGrid },
    { label: "Durable aluminium systems", Icon: ShieldCheck },
    { label: "Reviewed before production", Icon: BadgeCheck },
  ],
};

const TRUST_ITEMS: { title: string; sub: string; Icon: typeof Truck }[] = [
  { title: "Manufacturer-backed", sub: "Quality you can trust.", Icon: ShieldCheck },
  { title: "Verified before deposit", sub: "Checked by our team.", Icon: CheckCircle },
  { title: "Supply only", sub: "Installation by others.", Icon: Package },
  { title: "Delivered across Melbourne & Victoria", sub: "Door-to-door delivery.", Icon: Truck },
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
      className={`text-left border p-4 w-full transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A] focus-visible:ring-offset-2 ${active ? "border-[#5A7A6A] bg-[#5A7A6A]/[0.06]" : "border-black/10 bg-white hover:border-black/25"}`}>
      <div className="mb-2.5">{icon}</div>
      <p className={`text-sm mb-0.5 ${active ? "font-semibold text-[#131311]" : "font-medium text-[#131311]"}`}
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{label}</p>
      <p className="text-xs text-[#5c5a56]">{count} system types</p>
    </button>
  );
}

function ProductCard({ product, category, onView }: { product: Product; category: CategorySlug; onView: () => void }) {
  return (
    <button onClick={onView}
      className="group relative bg-white border border-black/8 hover:border-[#5A7A6A] hover:shadow-sm transition-all text-left overflow-hidden flex flex-col cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A] focus-visible:ring-offset-2">
      <div className="relative bg-[#0c0c0a] aspect-[4/3] overflow-hidden">
        <img src={product.heroImage} alt={`${product.name} aluminium ${category === "windows" ? "window" : "door"} system`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-70 group-hover:opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0a]/55 via-[#0c0c0a]/10 to-transparent pointer-events-none" />
        <div className="absolute inset-2 border border-white/10 group-hover:border-white/28 transition-all duration-300 pointer-events-none" />
      </div>
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-semibold text-[#131311] mb-1"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{product.name}</h3>
        <p className="text-sm text-[#5c5a56] leading-relaxed mb-3 line-clamp-2">{product.shortDescription}</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {product.keySpecs.slice(0, 2).map(spec => (
            <span key={spec.label} className="border border-black/10 text-[#5c5a56] text-[11px] tracking-wide px-2 py-1"
              style={{ fontFamily: "'DM Mono', monospace" }}>{spec.value}</span>
          ))}
        </div>
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
          className="w-full flex items-center justify-between gap-3 border border-black/15 bg-white px-4 py-3 text-sm text-[#131311] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A] focus-visible:ring-offset-2">
          <span className="font-medium">{current.name}</span>
          <ChevronDown className={`w-4 h-4 text-[#5c5a56] flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div role="listbox" aria-label="Product family"
            className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-black/15 shadow-lg max-h-[60vh] overflow-y-auto">
            {options.map(o => {
              const active = o.slug === family;
              return (
                <button key={o.slug} type="button" role="option" aria-selected={active} onClick={() => select(o.slug)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm border-b border-black/6 last:border-b-0 cursor-pointer transition-colors ${active ? "bg-[#5A7A6A]/[0.06] text-[#131311] font-semibold" : "text-[#131311] hover:bg-black/[0.02]"}`}>
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
  const benefits = BENEFITS[category];
  const windowCount = getFamiliesByCategory("windows").length;
  const doorCount = getFamiliesByCategory("doors").length;

  // Products come pre-ordered by featuredOrder from the selectors.
  const list = family === "all" ? getProductsByCategory(category) : getProductsByFamily(family);

  const activeFamily = families.find(f => f.slug === family);
  const heading = family === "all"
    ? (category === "windows" ? "All window systems" : "All door systems")
    : (activeFamily?.name ?? "");
  const description = familyDescription(category, family);

  return (
    <div className="bg-white min-h-screen">
      {/* ─── HERO — contextual to selected category, header overlays it ─────── */}
      <section className="relative h-[360px] md:h-[440px] flex items-end bg-[#0c0c0a] overflow-hidden">
        <img src={hero.image} alt={hero.alt} className="absolute inset-0 w-full h-full object-cover opacity-70 hero-zoom" />
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
            <Btn variant="sage" size="md" onClick={() => go("quote")}>Start a quote <ArrowRight className="w-4 h-4" /></Btn>
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
                    className={`text-left px-3 py-2.5 text-sm border-l-2 transition-colors cursor-pointer ${family === "all" ? "border-[#5A7A6A] text-[#131311] font-semibold bg-[#5A7A6A]/[0.05]" : "border-transparent text-[#5c5a56] hover:text-[#131311] hover:bg-black/[0.02]"}`}>
                    All {category}
                  </button>
                  {families.map(f => (
                    <button key={f.slug} onClick={() => onSelectFamily(f.slug)} aria-pressed={family === f.slug}
                      className={`text-left px-3 py-2.5 text-sm border-l-2 transition-colors cursor-pointer ${family === f.slug ? "border-[#5A7A6A] text-[#131311] font-semibold bg-[#5A7A6A]/[0.05]" : "border-transparent text-[#5c5a56] hover:text-[#131311] hover:bg-black/[0.02]"}`}>
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Help card */}
              <div className="border border-black/10 bg-[#FAFAF9] p-5">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-[#5A7A6A]" />
                  <p className="text-sm font-semibold text-[#131311]">Not sure what you need?</p>
                </div>
                <p className="text-xs text-[#5c5a56] leading-relaxed mb-3">Upload your schedule or speak with our team.</p>
                <div className="space-y-1.5">
                  <button onClick={() => go("quote")}
                    className="flex items-center gap-1 text-sm text-[#5A7A6A] hover:text-[#4a6858] font-medium cursor-pointer transition-colors">
                    Upload a schedule <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => go("contact")}
                    className="flex items-center gap-1 text-sm text-[#5A7A6A] hover:text-[#4a6858] font-medium cursor-pointer transition-colors">
                    Contact us <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* ─── MAIN CONTENT — heading, benefits, sort, product grid ─────────── */}
          <div>
            <h2 className="font-semibold text-[#131311] leading-tight mb-2"
              style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.6rem, 2.8vw, 2.1rem)" }}>{heading}</h2>
            <p className="text-[#5c5a56] text-[15px] leading-relaxed max-w-2xl mb-6">{description}</p>

            {/* Benefit row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-6 py-5 border-y border-black/8 mb-8">
              {benefits.map(b => (
                <div key={b.label} className="flex items-start gap-2">
                  <b.Icon className="w-4 h-4 text-[#5A7A6A] flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-[#5c5a56] leading-snug">{b.label}</span>
                </div>
              ))}
            </div>

            {/* Results count */}
            <div className="mb-4">
              <p className="text-sm text-[#5c5a56]">{list.length} system{list.length === 1 ? "" : "s"}</p>
            </div>

            {/* Product grid / empty state */}
            {list.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                {list.map(p => (
                  <ProductCard key={p.id} product={p} category={category} onView={() => onOpenProduct(p.slug)} />
                ))}
              </div>
            ) : (
              <div className="border border-black/10 bg-[#FAFAF9] p-8 text-center mb-10">
                <AlertCircle className="w-6 h-6 text-[#5A7A6A] mx-auto mb-3" />
                <p className="text-[#131311] font-medium mb-1">No systems found for this selection.</p>
                <p className="text-sm text-[#5c5a56] mb-5">Try another family or upload your schedule and we'll help identify the right product.</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Btn variant="outline" size="sm" onClick={() => onSelectFamily("all")}>Clear filters</Btn>
                  <Btn variant="sage" size="sm" onClick={() => go("quote")}>Upload schedule</Btn>
                </div>
              </div>
            )}

            {/* Custom schedule strip */}
            <div className="border border-black/10 bg-white px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-[#5A7A6A] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[#131311]">Can't find what you need?</p>
                  <p className="text-sm text-[#5c5a56]">Upload your schedule or speak with our team. We'll help you find the right system.</p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Btn variant="outline" size="sm" onClick={() => go("quote")}>Upload a schedule</Btn>
                <Btn variant="ghost" size="sm" onClick={() => go("contact")}>Contact us</Btn>
              </div>
            </div>
          </div>
        </div>

        {/* ─── TRUST STRIP ────────────────────────────────────────────────────── */}
        <div className="border-t border-black/8 py-8 md:py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {TRUST_ITEMS.map(t => (
              <div key={t.title} className="flex items-start gap-2.5">
                <t.Icon className="w-4 h-4 text-[#5A7A6A] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-[#131311] leading-snug">{t.title}</p>
                  <p className="text-xs text-[#5c5a56]">{t.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
