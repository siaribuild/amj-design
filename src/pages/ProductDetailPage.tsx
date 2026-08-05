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
  getProductBySlug, getFamily, getCategory, getRelatedProducts, products, imageUrl,
  getProductDocuments, getProductPosts,
} from "../data/catalogue";
import { DocumentRow, groupDocuments } from "../components/DocumentRow";
import { pathForPage } from "../app/routes";
import { ItemForm, ItemSummaryCard } from "../components/ItemComposer";
import { type QItem, type QuoteState, linePriceTotal, fmt } from "../data/configurator";
import { useGstMode, gstAdjust, gstSuffix } from "../data/gst";

const OPTION_TYPE_ORDER = ["Glass", "Frame colour", "Colour", "Hardware", "Flyscreen", "Installation"];

function AvailabilityBadge({ availability }: { availability: ProductOption["availability"] }) {
  const standard = availability === "standard";
  return (
    <span className={`px-2 py-0.5 border ${standard ? "border-sage/40 text-sage bg-sage/[0.06]" : "border-black/15 text-body"} font-data t-label`}>
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
        <p key={i} className="text-body leading-relaxed">{p}</p>
      ))}
      {familyBlurb && (
        <div className="border-l-2 border-sage/40 pl-4">
          <p className="text-sage mb-1 font-data t-label">Best suited to</p>
          <p className="text-body t-bd-sm">{familyBlurb}</p>
        </div>
      )}
      {inclusions.length > 0 && (
        <div>
          <p className="text-ink mb-2 t-label">Standard inclusions</p>
          <ul className="space-y-1.5">
            {inclusions.map(l => (
              <li key={l} className="text-body flex gap-2 t-bd-sm">
                <Check className="w-3.5 h-3.5 text-sage flex-shrink-0 mt-0.5" />{l}
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
    return <p className="text-body t-bd-sm">Options for this product are confirmed at technical review.</p>;
  }
  return (
    <div className="space-y-6">
      <p className="text-body t-bd-sm">Standard and selectable options for this system. Final selections are confirmed on your estimate.</p>
      {typeNames.map(tn => {
        const items = product.options
          .filter(o => o.typeName === tn)
          .sort((a, b) => (a.availability === b.availability ? 0 : a.availability === "standard" ? -1 : 1));
        return (
          <div key={tn}>
            <p className="text-ink mb-2 t-label">{tn}</p>
            <div className="border border-black/8">
              {items.map((o, i) => (
                <div key={o.name} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-black/6" : ""}`}>
                  <span className="text-ink t-bd-sm">{o.name}</span>
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
    <table className="w-full t-bd-sm">
      <tbody>
        {product.specs.map(row => (
          <tr key={row.label} className="border-b border-black/6">
            <td className="py-2.5 pr-4 text-body font-medium w-44 align-top t-cap">{row.label}</td>
            <td className="py-2.5 text-ink">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// WERS star ratings rendered as filled stars (+ a half), compact, with the exact
// figure on hover — a rating reads faster as stars than as a decimal. WERS is a
// 0–10 half-step scale; filled-only keeps the table cell narrow.
function Stars({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-quieter">—</span>;
  const half = Math.round(value * 2) / 2;
  const full = Math.floor(half);
  const hasHalf = half - full >= 0.5;
  return (
    <span className="text-sage whitespace-nowrap" title={`${value} / 10 stars`} aria-label={`${value} out of 10 stars`}>
      {"★".repeat(full)}{hasHalf ? "½" : ""}
    </span>
  );
}

// Glazing gets its OWN tab (M3): the WERS thermal ratings per glazing the product's
// frame offers. Shown only when the product has thermal data — never fabricated.
function GlazingContent({ product }: { product: Product }) {
  const thermal = product.thermal ?? [];
  if (!thermal.length) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body t-bd-sm">
        Whole-window energy ratings (WERS) for each glazing available on this frame.
        Uw is insulation (lower is better); SHGC is solar heat gain.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full t-bd-sm">
          <thead>
            <tr className="text-body border-b border-black/10 t-cap">
              <th className="py-2 pr-4 text-left font-medium">Glazing</th>
              <th className="py-2 px-3 text-right font-medium">Uw</th>
              <th className="py-2 px-3 text-right font-medium">SHGC</th>
              <th className="py-2 px-3 text-right font-medium">Tvw</th>
              <th className="py-2 px-3 text-left font-medium">Heating</th>
              <th className="py-2 pl-3 text-left font-medium">Cooling</th>
            </tr>
          </thead>
          <tbody>
            {thermal.map((t, i) => (
              <tr key={i} className="border-b border-black/6">
                <td className="py-2 pr-4 text-ink">{t.glazingName}{t.glassSpec ? ` · ${t.glassSpec}` : ""}</td>
                <td className="py-2 px-3 text-right tabular-nums text-ink">{t.uValue ?? "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums text-ink">{t.shgc ?? "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums text-ink">{t.tvw ?? "—"}</td>
                <td className="py-2 px-3 text-left"><Stars value={t.heatingStars} /></td>
                <td className="py-2 pl-3 text-left"><Stars value={t.coolingStars} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Real documents, from Sanity, replacing four hardcoded strings that all read
// "On request" — four things that LOOKED like documentation and were not.
//
// Rows, not the old two-column tiles: a row can carry a metadata line and a tile
// cannot, and the metadata line is the whole point. Grouped by kind in the
// code-defined order, using the same shape as OptionsContent above.
function DownloadsContent({ product, setPage }: { product: Product; setPage: (p: Page, path?: string) => void }) {
  const docs = getProductDocuments(product.slug);
  // Posts that apply to this product but host no file — still worth reading,
  // and otherwise unreachable from here. This is the one gap in a file-first
  // Downloads tab, and it costs one small block to close.
  const reads = getProductPosts(product.slug).filter((p) => !p.attachment);
  const openPost = (slug: string) => setPage("post", pathForPage("post", slug));

  if (!docs.length && !reads.length) {
    // The tab stays. Someone checking whether documentation exists deserves a
    // definite answer rather than an absence they have to interpret — and a tab
    // set that varies product to product makes the site feel unfinished in a way
    // an honest empty tab does not.
    return (
      <div className="card p-6 flex items-start gap-3">
        <Info className="w-4 h-4 text-sage flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-ink font-semibold mb-1.5 t-bd-sm">No documents are published for this system yet.</p>
          <p className="text-body mb-4 max-w-[54ch] t-bd-sm">
            Technical documents, test reports and warranty terms are issued with a reviewed quote.
            If you need something specific before then, ask and we'll send it if we have it.
          </p>
          <Btn variant="outline" size="sm" onClick={() => setPage("contact")}>Ask about documents</Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groupDocuments(docs).map((group) => (
        <div key={group.docType}>
          <p className="text-quiet mb-2 font-data t-label">
            {group.label}
          </p>
          <div className="card">
            {group.items.map((d, i) => (
              <DocumentRow key={`${d.post.slug}-${i}`} attachment={d.attachment} post={d.post} onOpenPost={openPost} />
            ))}
          </div>
        </div>
      ))}

      {reads.length > 0 && (
        <div>
          <p className="text-quiet mb-2 font-data t-label">
            Related reading
          </p>
          <div className="card">
            {reads.map((g) => (
              <button key={g.slug} onClick={() => openPost(g.slug)}
                className="icon-btn w-full text-left flex items-start justify-between gap-3 px-4 py-3 border-b border-black/8 last:border-0 cursor-pointer">
                <span className="min-w-0">
                  <span className="block text-ink t-bd-sm">{g.title}</span>
                  <span className="block text-body mt-0.5 t-cap">{g.summary}</span>
                </span>
                <ArrowRight className="w-4 h-4 text-quieter flex-shrink-0 mt-0.5" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Overview is shown standalone (outside tabs); the rest are tabbed.
// A FUNCTION of the product, so Downloads can carry a count — a count lets a
// visitor skip a tab, and it is checkable data rather than decoration.
type TabId = "technical" | "glazing" | "options" | "downloads";
const tabsFor = (product: Product): { id: TabId; label: string }[] => {
  const n = getProductDocuments(product.slug).length;
  const tabs: { id: TabId; label: string }[] = [{ id: "technical", label: "Technical details" }];
  if (product.thermal && product.thermal.length) tabs.push({ id: "glazing", label: "Glazing" });
  tabs.push({ id: "options", label: "Options" });
  tabs.push({ id: "downloads", label: n > 0 ? `Downloads · ${n}` : "Downloads" });
  return tabs;
};

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
  // Must follow `product` — it reads it. It sat above the declaration and threw
  // "Cannot access 'product' before initialization" on every render, blanking
  // the page. `const` is not hoisted the way a function declaration is.
  const tabs = tabsFor(product);
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
    if (id === "glazing") return <GlazingContent product={product} />;
    return <DownloadsContent product={product} setPage={setPage} />;
  };

  const remount = (s: Partial<QItem> | null) => { setSeed(s); setJustAdded(null); setComposerKey(k => k + 1); };
  const handleAdded = (built: Omit<QItem, "id">) => {
    const id = quote.add(built);
    setJustAdded({ ...built, id });
    document.getElementById("configure")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const projectTotal = quote.items.reduce((s, it) => s + linePriceTotal(it), 0);
  const gstMode = useGstMode();
  const liveJustAdded = justAdded ? (quote.items.find(x => x.id === justAdded.id) ?? justAdded) : null;

  const ConfiguratorWidget = (
    <div id="configure">
      <div className="flex items-center gap-2 mb-3">
        <WindowMark size={16} color={SAGE} />
        <h2 className="font-semibold text-ink font-display t-bd">Configure &amp; get an estimate</h2>
      </div>
      {liveJustAdded ? (
        <div className="space-y-3">
          {/* Matches the /quote-project edit panel (owner): no Quantity group,
              note inside Dimensions. */}
          <ItemSummaryCard item={liveJustAdded} added quote={quote} panelParity />
          <div className="border border-black/10 bg-bone px-4 py-4">
            <p className="text-body mb-3 t-bd-sm">MyProject now has <span className="font-medium text-ink">{quote.items.length} item{quote.items.length !== 1 ? "s" : ""}</span> · estimated {fmt(gstAdjust(projectTotal, gstMode))} {gstSuffix(gstMode)}.</p>
            <Btn variant="sage" size="md" onClick={() => remount({ options: liveJustAdded.options, location: liveJustAdded.location })} className="w-full justify-center"><Plus className="w-4 h-4" />Add another like this</Btn>
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
    <div className="ground-bone min-h-screen">
      {/* ─── PRODUCT HERO — one image, header overlays it ────────────────────── */}
      <section className="relative min-h-[440px] md:min-h-[520px] flex items-end bg-night overflow-hidden">
        <img src={imageUrl(product.heroImage, { w: 1600, h: 900 })}
          alt={`${product.name} — aluminium ${isWindow ? "window" : "door"} system installed in a contemporary home`}
          className="hero-img hero-zoom" />
        <div className="hero-scrim" aria-hidden="true" />
        <div className="relative w-full max-w-6xl mx-auto px-6 pt-24 pb-10 md:pt-28 md:pb-14">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-3">
              <WindowMark size={10} color="rgba(255,255,255,0.55)" />
              <span className="text-white/60 font-data t-label">{family?.name ?? category?.name ?? "Products"}</span>
            </div>
            <h1 className="text-white mb-4 t-ds1">{product.name}</h1>
            <p className="text-white/80 max-w-xl mb-5 t-bd">{product.shortDescription}</p>
            {/* Key spec chips */}
            {product.keySpecs.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {product.keySpecs.map(spec => (
                  <span key={spec.label} className="border border-white/25 text-white/85 tracking-wide px-2.5 py-1 font-data t-data-sm">{spec.value}</span>
                ))}
              </div>
            )}
            <p className="text-white/50 font-data t-data-sm">Indicative estimate first · Reviewed quote before deposit</p>
          </div>
        </div>
      </section>

      {/* ─── MAIN — info sections + configurator in the right rail ──────────── */}
      <div id="product-sections" className="max-w-6xl mx-auto px-6 py-8 md:py-12">
        {/* Back link — top of content, where it is clearly visible on the light body */}
        <button onClick={() => onBack(categorySlug, product.familySlug)}
          className="inline-flex items-center gap-1 text-body hover:text-ink transition-colors mb-6 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 t-bd-sm">
          <ChevronLeft className="w-4 h-4" />Back to products
        </button>

        <div className="flex flex-col lg:flex-row lg:items-start gap-8 lg:gap-12">
          {/* Configurator — right rail on desktop, first on mobile (DOM order) */}
          <div className="lg:order-2 lg:w-[380px] lg:flex-shrink-0 lg:sticky lg:top-24">{ConfiguratorWidget}</div>

          {/* Product information sections */}
          <div className="lg:order-1 lg:flex-1 min-w-0">
            {/* Overview — standalone, outside the tabs */}
            <section className="mb-8">
              <h2 className="text-ink mb-4 t-hd2">Overview</h2>
              <OverviewContent product={product} familyBlurb={familyBlurb} />
            </section>

            {/* Desktop tabs */}
            <div className="hidden lg:block">
              <div className="flex border-b border-black/10 gap-6 mb-6">
                {tabs.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    aria-current={tab === t.id ? "true" : undefined}
                    className={`pb-3 border-b-2 transition-all cursor-pointer -mb-px ${tab === t.id ? "border-sage text-ink font-medium" : "border-transparent text-body hover:text-ink"} t-bd-sm`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <h2 className="sr-only">{tabs.find(t => t.id === tab)?.label}</h2>
              <div>{sectionBody(tab)}</div>
            </div>

            {/* Mobile accordion */}
            <div className="lg:hidden border-t border-black/10">
              {tabs.map(t => {
                const open = openSection === t.id;
                return (
                  <div key={t.id} className="border-b border-black/10">
                    <h2 className="m-0">
                      <button onClick={() => setOpenSection(open ? "" : t.id)}
                        aria-expanded={open}
                        className="w-full flex items-center justify-between gap-3 py-4 text-left cursor-pointer">
                        <span className={`${open ? "font-semibold text-ink" : "font-medium text-ink"} font-display t-bd-sm`}>{t.label}</span>
                        <ChevronDown className={`w-4 h-4 text-body transition-transform ${open ? "rotate-180" : ""}`} />
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
        <section className="border-t border-black/8 bg-bone section-pad">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="text-ink mb-6 t-hd1">Gallery</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {product.gallery.map((src, i) => (
                <button key={i} onClick={() => setLightbox(i)}
                  className="relative bg-night aspect-[4/3] overflow-hidden group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2"
                  aria-label={`Enlarge ${product.name} view ${i + 1}`}>
                  <img src={imageUrl(src, { w: 800, h: 600 })} alt={`${product.name} — view ${i + 1}`}
                    className="w-full h-full object-cover opacity-70 group-hover:opacity-85 group-hover:scale-[1.03] transition-all duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-night/55 via-night/10 to-transparent pointer-events-none" />
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
      <section className="border-t border-black/8 section-pad">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-end justify-between gap-4 mb-6">
            <h2 className="text-ink t-hd1">
              {related.length > 0 ? `More ${family?.name ?? "products"}` : "Keep browsing"}
            </h2>
            <button onClick={() => onBack(categorySlug, product.familySlug)}
              className="inline-flex items-center gap-1 font-medium text-sage hover:text-sage-hover transition-colors cursor-pointer flex-shrink-0 t-bd-sm">
              <ChevronLeft className="w-3.5 h-3.5" />Back to products
            </button>
          </div>
          {related.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {related.map(r => (
                <button key={r.id} onClick={() => onOpenProduct(r.slug)}
                  className="group relative card hover:border-sage  transition-all text-left overflow-hidden flex flex-col cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2">
                  <div className="relative bg-night aspect-[4/3] overflow-hidden">
                    <img src={imageUrl(r.heroImage, { w: 640, h: 480 })} alt={`${r.name} aluminium ${isWindow ? "window" : "door"} system`}
                      className="w-full h-full object-cover opacity-70 group-hover:opacity-80 group-hover:scale-105 transition-all duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-night/55 via-night/10 to-transparent pointer-events-none" />
                    <div className="absolute inset-2 border border-white/10 group-hover:border-white/28 transition-all pointer-events-none" />
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-semibold text-ink mb-1 font-display">{r.name}</h3>
                    <p className="text-body mb-3 line-clamp-2 t-bd-sm">{r.shortDescription}</p>
                    <span className="mt-auto inline-flex items-center gap-1.5 font-medium text-sage group-hover:gap-2.5 transition-all t-bd-sm">
                      View product <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="border border-black/10 bg-bone px-6 py-8 split-row is-center">
              <p className="text-body t-bd-sm">This is the only system in the {family?.name ?? "family"} right now. Browse the full catalogue to compare other options.</p>
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
            <img src={imageUrl(product.gallery[lightbox], { w: 1600 })} alt={`${product.name} — view ${lightbox + 1}`} className="max-w-full max-h-[80vh] object-contain" />
            <figcaption className="text-white/70 mt-3 font-data t-data-sm">{product.name} · {lightbox + 1} / {galleryLen}</figcaption>
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
