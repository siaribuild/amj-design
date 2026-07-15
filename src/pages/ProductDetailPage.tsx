// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT DETAIL PAGE
// Structure follows the UX brief: header (global) → product hero → back link →
// information sections (tabs desktop / accordion mobile) → estimate placeholder →
// gallery → related products / back to family → footer (global).
// Data comes from src/data/catalogue.ts (future Sanity source). The estimate is a
// placeholder only — the real estimator lives on the Quote page.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import {
  ChevronLeft, ChevronRight, ChevronDown, ArrowRight, Check, FileText, Info, Plus, Maximize2, X,
} from "lucide-react";
import { type Page, SAGE, WindowMark, Btn } from "../app/ui";
import {
  type CategorySlug, type Product, type ProductOption,
  getProductBySlug, getFamily, getCategory, getRelatedProducts, products,
} from "../data/catalogue";
import { ItemForm, ItemSummaryCard } from "../components/ItemComposer";
import { type QItem, type QuoteState, priceConfigured, fmt } from "../data/configurator";

const OPTION_TYPE_ORDER = ["Glass", "Frame colour", "Colour", "Hardware", "Flyscreen", "Installation"];

function AvailabilityBadge({ availability }: { availability: ProductOption["availability"] }) {
  const standard = availability === "standard";
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 border ${standard ? "border-[#5A7A6A]/40 text-[#5A7A6A] bg-[#5A7A6A]/[0.06]" : "border-black/15 text-[#5c5a56]"}`}
      style={{ fontFamily: "'DM Mono', monospace" }}>
      {standard ? "Standard" : "Optional"}
    </span>
  );
}

// ─── Section content blocks (shared by desktop tabs + mobile accordion) ────────
function OverviewContent({ product, familyBlurb }: { product: Product; familyBlurb: string }) {
  const standardOptions = product.options.filter(o => o.availability === "standard" && o.name.toLowerCase() !== "none");
  const inclusions = [
    product.standardGlass ? `${product.standardGlass} (standard glazing)` : null,
    ...standardOptions.map(o => `${o.name} — ${o.typeName.toLowerCase()}`),
  ].filter(Boolean) as string[];
  return (
    <div className="space-y-5">
      {product.descriptionParagraphs.map((p, i) => (
        <p key={i} className="text-[#5c5a56] leading-relaxed">{p}</p>
      ))}
      {familyBlurb && (
        <div className="border-l-2 border-[#5A7A6A]/40 pl-4">
          <p className="text-xs font-semibold text-[#5A7A6A] uppercase tracking-wide mb-1"
            style={{ fontFamily: "'DM Mono', monospace" }}>Best suited to</p>
          <p className="text-sm text-[#5c5a56] leading-relaxed">{familyBlurb}</p>
        </div>
      )}
      {inclusions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[#131311] uppercase tracking-wide mb-2">Standard inclusions</p>
          <ul className="space-y-1.5">
            {inclusions.map(l => (
              <li key={l} className="text-sm text-[#5c5a56] flex gap-2">
                <Check className="w-3.5 h-3.5 text-[#5A7A6A] flex-shrink-0 mt-0.5" />{l}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OptionsContent({ product }: { product: Product }) {
  const typeNames = Array.from(new Set(product.options.map(o => o.typeName)));
  typeNames.sort((a, b) => {
    const ia = OPTION_TYPE_ORDER.indexOf(a); const ib = OPTION_TYPE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  if (typeNames.length === 0) {
    return <p className="text-sm text-[#5c5a56]">Options for this product are confirmed at technical review.</p>;
  }
  return (
    <div className="space-y-6">
      <p className="text-sm text-[#5c5a56]">Standard and selectable options for this system. Final selections are confirmed on your estimate.</p>
      {typeNames.map(tn => {
        const items = product.options
          .filter(o => o.typeName === tn)
          .sort((a, b) => (a.availability === b.availability ? 0 : a.availability === "standard" ? -1 : 1));
        return (
          <div key={tn}>
            <p className="text-xs font-semibold text-[#131311] uppercase tracking-wide mb-2">{tn}</p>
            <div className="border border-black/8">
              {items.map((o, i) => (
                <div key={o.name} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-black/6" : ""}`}>
                  <span className="text-sm text-[#131311]">{o.name}</span>
                  <AvailabilityBadge availability={o.availability} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TechnicalContent({ product }: { product: Product }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {product.specs.map(row => (
          <tr key={row.label} className="border-b border-black/6">
            <td className="py-2.5 pr-4 text-xs text-[#5c5a56] font-medium w-44 align-top">{row.label}</td>
            <td className="py-2.5 text-[#131311]">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DownloadsContent() {
  const docs = ["Spec sheet", "CAD / detail drawing", "Measuring guide", "Warranty & compliance"];
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 border border-black/10 bg-[#FAFAF9] px-4 py-3">
        <Info className="w-4 h-4 text-[#5A7A6A] flex-shrink-0 mt-0.5" />
        <p className="text-sm text-[#5c5a56]">Technical downloads will be provided after review or by request.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {docs.map(d => (
          <div key={d} className="flex items-center justify-between gap-3 border border-black/10 px-4 py-3 text-[#9a9894]">
            <span className="flex items-center gap-2 text-sm text-[#5c5a56]"><FileText className="w-4 h-4" />{d}</span>
            <span className="text-[11px] uppercase tracking-wider" style={{ fontFamily: "'DM Mono', monospace" }}>On request</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Overview is shown standalone (outside tabs); the rest are tabbed.
const TABS = [
  { id: "technical", label: "Technical details" },
  { id: "options", label: "Options" },
  { id: "downloads", label: "Downloads" },
] as const;
type TabId = typeof TABS[number]["id"];

export function ProductDetailPage({ slug, setPage, onOpenProduct, onBack, quote }: {
  slug: string;
  setPage: (p: Page) => void;
  onOpenProduct: (slug: string) => void;
  onBack: (categorySlug: CategorySlug, familySlug: string) => void;
  quote: QuoteState;
}) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const [tab, setTab] = useState<TabId>("technical");
  const [openSection, setOpenSection] = useState<TabId | "">("technical");
  const [justAdded, setJustAdded] = useState<QItem | null>(null);
  const [seed, setSeed] = useState<Partial<QItem> | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const product = getProductBySlug(slug) ?? products[0];
  const family = getFamily(product.familySlug);
  const category = getCategory(product.categorySlug);
  const categorySlug = (product.categorySlug || "windows") as CategorySlug;
  const related = getRelatedProducts(product.slug, 3);
  const familyBlurb = family?.shortDescription ?? "";
  const isWindow = categorySlug === "windows";

  // Gallery lightbox — keyboard navigation (Esc / ← / →)
  const galleryLen = product.gallery.length;
  useEffect(() => {
    if (lightbox == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      else if (e.key === "ArrowRight") setLightbox(i => (i == null ? i : (i + 1) % galleryLen));
      else if (e.key === "ArrowLeft") setLightbox(i => (i == null ? i : (i - 1 + galleryLen) % galleryLen));
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [lightbox, galleryLen]);

  const sectionBody = (id: TabId) => {
    if (id === "options") return <OptionsContent product={product} />;
    if (id === "technical") return <TechnicalContent product={product} />;
    return <DownloadsContent />;
  };

  const remount = (s: Partial<QItem> | null) => { setSeed(s); setJustAdded(null); setComposerKey(k => k + 1); };
  const handleAdded = (built: Omit<QItem, "id">) => {
    const id = quote.add(built);
    setJustAdded({ ...built, id });
    document.getElementById("configure")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const projectTotal = quote.items.reduce((s, it) => s + priceConfigured(it).total, 0);
  const liveJustAdded = justAdded ? (quote.items.find(x => x.id === justAdded.id) ?? justAdded) : null;

  const ConfiguratorWidget = (
    <div id="configure">
      <div className="flex items-center gap-2 mb-3">
        <WindowMark size={16} color={SAGE} />
        <h2 className="text-base font-semibold text-[#131311]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Configure &amp; get an estimate</h2>
      </div>
      {liveJustAdded ? (
        <div className="space-y-3">
          <ItemSummaryCard item={liveJustAdded} added quote={quote} />
          <div className="border border-black/10 bg-[#FAFAF9] px-4 py-4">
            <p className="text-sm text-[#5c5a56] mb-3">MyProject now has <span className="font-medium text-[#131311]">{quote.items.length} item{quote.items.length !== 1 ? "s" : ""}</span> · estimated {fmt(projectTotal)}.</p>
            <Btn variant="sage" size="md" onClick={() => remount({ options: liveJustAdded.options, location: liveJustAdded.location, measuredBy: liveJustAdded.measuredBy })} className="w-full justify-center"><Plus className="w-4 h-4" />Add another like this</Btn>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Btn variant="outline" size="md" onClick={() => onBack(categorySlug, product.familySlug)} className="justify-center">Another product</Btn>
              <Btn variant="primary" size="md" onClick={() => go("quote")} className="justify-center">View MyProject <ArrowRight className="w-4 h-4" /></Btn>
            </div>
          </div>
        </div>
      ) : (
        <ItemForm key={`${product.slug}-${composerKey}`} lockedSlug={product.slug} quote={quote} seed={seed} rail
          submitLabel="Add to MyProject" onCommit={handleAdded} />
      )}
    </div>
  );

  return (
    <div className="bg-white min-h-screen">
      {/* ─── PRODUCT HERO — one image, header overlays it ────────────────────── */}
      <section className="relative min-h-[440px] md:min-h-[520px] flex items-end bg-[#0c0c0a] overflow-hidden">
        <img src={product.heroImage}
          alt={`${product.name} — aluminium ${isWindow ? "window" : "door"} system installed in a contemporary home`}
          className="absolute inset-0 w-full h-full object-cover opacity-70 hero-zoom" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(12,12,10,0.9) 0%, rgba(12,12,10,0.6) 24%, rgba(12,12,10,0.25) 55%, rgba(12,12,10,0.12) 100%)" }} />
        <div className="relative w-full max-w-6xl mx-auto px-6 pt-24 pb-10 md:pt-28 md:pb-14">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-3">
              <WindowMark size={10} color="rgba(255,255,255,0.55)" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60"
                style={{ fontFamily: "'DM Mono', monospace" }}>{family?.name ?? category?.name ?? "Products"}</span>
            </div>
            <h1 className="font-semibold text-white leading-[1.04] tracking-tight mb-4"
              style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(2rem, 4.6vw, 3.1rem)" }}>{product.name}</h1>
            <p className="text-white/80 text-base md:text-lg leading-relaxed max-w-xl mb-5">{product.shortDescription}</p>
            {/* Key spec chips */}
            {product.keySpecs.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {product.keySpecs.map(spec => (
                  <span key={spec.label} className="border border-white/25 text-white/85 text-[12px] tracking-wide px-2.5 py-1"
                    style={{ fontFamily: "'DM Mono', monospace" }}>{spec.value}</span>
                ))}
              </div>
            )}
            <p className="text-white/50 text-xs" style={{ fontFamily: "'DM Mono', monospace" }}>Indicative estimate first · Reviewed quote before deposit</p>
          </div>
        </div>
      </section>

      {/* ─── MAIN — info sections + configurator in the right rail ──────────── */}
      <div id="product-sections" className="max-w-6xl mx-auto px-6 py-8 md:py-12">
        {/* Back link — top of content, where it is clearly visible on the light body */}
        <button onClick={() => onBack(categorySlug, product.familySlug)}
          className="inline-flex items-center gap-1 text-sm text-[#5c5a56] hover:text-[#131311] transition-colors mb-6 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A] focus-visible:ring-offset-2">
          <ChevronLeft className="w-4 h-4" />Back to products
        </button>

        <div className="flex flex-col lg:flex-row lg:items-start gap-8 lg:gap-12">
          {/* Configurator — right rail on desktop, first on mobile (DOM order) */}
          <div className="lg:order-2 lg:w-[380px] lg:flex-shrink-0 lg:sticky lg:top-24">{ConfiguratorWidget}</div>

          {/* Product information sections */}
          <div className="lg:order-1 lg:flex-1 min-w-0">
            {/* Overview — standalone, outside the tabs */}
            <section className="mb-8">
              <h2 className="font-semibold text-[#131311] leading-tight mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.3rem, 2.2vw, 1.6rem)" }}>Overview</h2>
              <OverviewContent product={product} familyBlurb={familyBlurb} />
            </section>

            {/* Desktop tabs */}
            <div className="hidden lg:block">
              <div className="flex border-b border-black/10 gap-6 mb-6">
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    aria-current={tab === t.id ? "true" : undefined}
                    className={`pb-3 text-sm border-b-2 transition-all cursor-pointer -mb-px ${tab === t.id ? "border-[#5A7A6A] text-[#131311] font-medium" : "border-transparent text-[#5c5a56] hover:text-[#131311]"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <h2 className="sr-only">{TABS.find(t => t.id === tab)?.label}</h2>
              <div>{sectionBody(tab)}</div>
            </div>

            {/* Mobile accordion */}
            <div className="lg:hidden border-t border-black/10">
              {TABS.map(t => {
                const open = openSection === t.id;
                return (
                  <div key={t.id} className="border-b border-black/10">
                    <h2 className="m-0">
                      <button onClick={() => setOpenSection(open ? "" : t.id)}
                        aria-expanded={open}
                        className="w-full flex items-center justify-between gap-3 py-4 text-left cursor-pointer">
                        <span className={`text-sm ${open ? "font-semibold text-[#131311]" : "font-medium text-[#131311]"}`}
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{t.label}</span>
                        <ChevronDown className={`w-4 h-4 text-[#5c5a56] transition-transform ${open ? "rotate-180" : ""}`} />
                      </button>
                    </h2>
                    {open && <div className="pb-6">{sectionBody(t.id)}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {/* ─── GALLERY ─────────────────────────────────────────────────────────── */}
      {product.gallery.length > 0 && (
        <section className="border-t border-black/8 bg-[#FAFAF9] py-12 md:py-16">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="font-semibold text-[#131311] leading-tight mb-6"
              style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.4rem, 2.4vw, 1.8rem)" }}>Gallery</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {product.gallery.map((src, i) => (
                <button key={i} onClick={() => setLightbox(i)}
                  className="relative bg-[#0c0c0a] aspect-[4/3] overflow-hidden group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A] focus-visible:ring-offset-2"
                  aria-label={`Enlarge ${product.name} view ${i + 1}`}>
                  <img src={src} alt={`${product.name} — view ${i + 1}`}
                    className="w-full h-full object-cover opacity-70 group-hover:opacity-85 group-hover:scale-[1.03] transition-all duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0a]/55 via-[#0c0c0a]/10 to-transparent pointer-events-none" />
                  <div className="absolute inset-2 border border-white/12 group-hover:border-white/30 transition-colors pointer-events-none" />
                  <span className="absolute bottom-3 right-3 w-8 h-8 border border-white/40 bg-black/30 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-4 h-4 text-white" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── RELATED PRODUCTS / BACK TO FAMILY ───────────────────────────────── */}
      <section className="border-t border-black/8 py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-end justify-between gap-4 mb-6">
            <h2 className="font-semibold text-[#131311] leading-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.4rem, 2.4vw, 1.8rem)" }}>
              {related.length > 0 ? `More ${family?.name ?? "products"}` : "Keep browsing"}
            </h2>
            <button onClick={() => onBack(categorySlug, product.familySlug)}
              className="inline-flex items-center gap-1 text-sm font-medium text-[#5A7A6A] hover:text-[#4a6858] transition-colors cursor-pointer flex-shrink-0">
              <ChevronLeft className="w-3.5 h-3.5" />Back to products
            </button>
          </div>
          {related.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {related.map(r => (
                <button key={r.id} onClick={() => onOpenProduct(r.slug)}
                  className="group relative bg-white border border-black/8 hover:border-[#5A7A6A] hover:shadow-sm transition-all text-left overflow-hidden flex flex-col cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7A6A] focus-visible:ring-offset-2">
                  <div className="relative bg-[#0c0c0a] aspect-[4/3] overflow-hidden">
                    <img src={r.heroImage} alt={`${r.name} aluminium ${isWindow ? "window" : "door"} system`}
                      className="w-full h-full object-cover opacity-70 group-hover:opacity-80 group-hover:scale-105 transition-all duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0a]/55 via-[#0c0c0a]/10 to-transparent pointer-events-none" />
                    <div className="absolute inset-2 border border-white/10 group-hover:border-white/28 transition-all pointer-events-none" />
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-semibold text-[#131311] mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{r.name}</h3>
                    <p className="text-sm text-[#5c5a56] leading-relaxed mb-3 line-clamp-2">{r.shortDescription}</p>
                    <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-[#5A7A6A] group-hover:gap-2.5 transition-all">
                      View product <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="border border-black/10 bg-[#FAFAF9] px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <p className="text-sm text-[#5c5a56]">This is the only system in the {family?.name ?? "family"} right now. Browse the full catalogue to compare other options.</p>
              <Btn variant="outline" size="sm" onClick={() => onBack(categorySlug, "all")}>View all {category?.name?.toLowerCase() ?? "products"}</Btn>
            </div>
          )}
        </div>
      </section>

      {/* ─── GALLERY LIGHTBOX ────────────────────────────────────────────────── */}
      {lightbox != null && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4 sm:p-8" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label="Product gallery">
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 w-10 h-10 border border-white/30 flex items-center justify-center text-white hover:bg-white/10 cursor-pointer" aria-label="Close gallery"><X className="w-5 h-5" /></button>
          {galleryLen > 1 && (
            <button onClick={e => { e.stopPropagation(); setLightbox(i => (i == null ? i : (i - 1 + galleryLen) % galleryLen)); }}
              className="absolute left-3 sm:left-6 w-10 h-10 border border-white/30 flex items-center justify-center text-white hover:bg-white/10 cursor-pointer" aria-label="Previous image"><ChevronLeft className="w-5 h-5" /></button>
          )}
          <figure className="max-w-5xl max-h-full flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <img src={product.gallery[lightbox]} alt={`${product.name} — view ${lightbox + 1}`} className="max-w-full max-h-[80vh] object-contain" />
            <figcaption className="text-white/70 text-xs mt-3" style={{ fontFamily: "'DM Mono', monospace" }}>{product.name} · {lightbox + 1} / {galleryLen}</figcaption>
          </figure>
          {galleryLen > 1 && (
            <button onClick={e => { e.stopPropagation(); setLightbox(i => (i == null ? i : (i + 1) % galleryLen)); }}
              className="absolute right-3 sm:right-6 w-10 h-10 border border-white/30 flex items-center justify-center text-white hover:bg-white/10 cursor-pointer" aria-label="Next image"><ChevronRight className="w-5 h-5" /></button>
          )}
        </div>
      )}
    </div>
  );
}
