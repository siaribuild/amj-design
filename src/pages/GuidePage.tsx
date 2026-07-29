// ═══════════════════════════════════════════════════════════════════════════════
// GUIDE — one article, and the documents it hosts
//
// The body is NOT in the catalogue payload: portable text for every guide would
// make every page on the site pay for a route almost nobody opens. It is fetched
// here, once, on mount.
//
// The rail is where the files live, and it is first in DOM order on mobile —
// someone who opened a guide about a datasheet came for the datasheet. If a
// guide has neither files nor product references there is NO rail at all; an
// empty 380px column is the "recede into the ground means be the ground"
// mistake in layout form.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { PortableText, type PortableTextComponents } from "@portabletext/react";
import { ChevronLeft, Check, ArrowRight, Loader2 } from "lucide-react";
import { type Page, SLabel, CtaBanner } from "../app/ui";
import {
  getGuideBySlug, getProductBySlug, guides, imageUrl, type Guide,
} from "../data/catalogue";
import { DocumentRow, docDate } from "../components/DocumentRow";
import { fetchGuideBody } from "../data/sanity";
import { pathForPage } from "../app/routes";

const DISPLAY = { fontFamily: "'Space Grotesk', sans-serif" } as const;
const MONO = { fontFamily: "'DM Mono', monospace" } as const;

// The renderer map matches the authoring block set exactly — the schema offers
// paragraph, heading, subheading, two list kinds, bold, emphasis, link and
// image, and nothing here invents a style the editor cannot produce.
const components: PortableTextComponents = {
  block: {
    normal: ({ children }) => <p className="text-body leading-relaxed mb-5">{children}</p>,
    h2: ({ children }) => (
      <h2 className="font-semibold text-ink mt-10 mb-3" style={{ ...DISPLAY, fontSize: "clamp(1.3rem, 2.2vw, 1.6rem)" }}>{children}</h2>
    ),
    h3: ({ children }) => <h3 className="font-semibold text-ink text-[17px] mt-7 mb-2" style={DISPLAY}>{children}</h3>,
  },
  list: {
    bullet: ({ children }) => <ul className="space-y-1.5 mb-5">{children}</ul>,
    number: ({ children }) => <ol className="space-y-1.5 mb-5 list-decimal pl-5 marker:text-sage-deep">{children}</ol>,
  },
  listItem: {
    // The same check-glyph list the product page uses for standard inclusions.
    bullet: ({ children }) => (
      <li className="text-body leading-relaxed flex gap-2">
        <Check className="w-3.5 h-3.5 text-sage flex-shrink-0 mt-1" aria-hidden="true" />
        <span>{children}</span>
      </li>
    ),
    number: ({ children }) => <li className="text-body leading-relaxed pl-1">{children}</li>,
  },
  marks: {
    strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    link: ({ value, children }) => {
      const href = String(value?.href ?? "");
      const external = /^https?:\/\//i.test(href);
      return (
        <a href={href} {...(external ? { target: "_blank", rel: "noopener" } : {})}
          className="text-sage hover:text-sage-deep underline underline-offset-2">{children}</a>
      );
    },
  },
  types: {
    image: ({ value }) => {
      const url = imageUrl(value, { w: 1200 });
      if (!url) return null;
      return (
        <figure className="my-7">
          <img src={url} alt={value?.alt ?? ""} loading="lazy" decoding="async"
            className="w-full border border-line" />
          {value?.caption && (
            <figcaption className="text-[12.5px] text-quiet mt-2" style={MONO}>{value.caption}</figcaption>
          )}
        </figure>
      );
    },
  },
};

export function GuidePage({ slug, setPage, onOpenProduct }: {
  slug: string;
  setPage: (p: Page, path?: string) => void;
  onOpenProduct: (slug: string) => void;
}) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const openGuide = (s: string) => { setPage("guide", pathForPage("guide", s)); window.scrollTo(0, 0); };

  const guide: Guide | undefined = getGuideBySlug(slug);
  const [body, setBody] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchGuideBody(slug)
      .then((b) => { if (live) { setBody(b); setLoading(false); } })
      .catch(() => { if (live) { setBody([]); setLoading(false); } });
    return () => { live = false; };
  }, [slug]);

  if (!guide) {
    return (
      <div className="ground-paper min-h-screen pt-28 pb-20">
        <div className="max-w-2xl mx-auto px-6">
          <div className="card p-8">
            <h1 className="text-xl font-semibold text-ink mb-2" style={DISPLAY}>That guide isn't here.</h1>
            <p className="text-body mb-6">It may have been renamed or unpublished.</p>
            <button onClick={() => go("resources")} className="text-sage hover:text-sage-deep inline-flex items-center gap-1.5 cursor-pointer">
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />All guides
            </button>
          </div>
        </div>
      </div>
    );
  }

  const products = guide.productSlugs.map(getProductBySlug).filter(Boolean);
  const hasRail = guide.attachments.length > 0 || products.length > 0;
  // The page is as wide as it has content for. With a rail, the full 6xl grid;
  // without one, a 54ch measure pinned to the left of a 1152px container is a
  // half-empty page — so the whole article, band included, narrows instead.
  const shell = hasRail ? "max-w-6xl" : "max-w-3xl";
  const heroUrl = imageUrl(guide.heroImage, { w: 1920, h: 1080 });
  const related = guides.filter((g) => g.categorySlug === guide.categorySlug && g.slug !== guide.slug).slice(0, 3);

  // Only the parts that are true. If nothing is, the line does not render.
  const meta = [
    docDate(guide.publishedAt) && `Updated ${docDate(guide.publishedAt)}`,
    guide.attachments.length > 0 && `${guide.attachments.length} document${guide.attachments.length === 1 ? "" : "s"}`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="ground-paper min-h-screen">
      {/* A header BAND, not a photographic hero. Most guides will have no image,
          and a hero whose default state is a missing photograph is the
          placeholder problem again. The image is an enhancement, not the frame. */}
      <section className={`relative bg-night overflow-hidden ${heroUrl ? "min-h-[380px] flex items-end" : ""}`}>
        {heroUrl && (
          <img src={heroUrl} alt="" aria-hidden="true" loading="lazy" decoding="async"
            className="absolute inset-0 w-full h-full object-cover opacity-70" />
        )}
        <div className="absolute inset-0" aria-hidden="true"
          style={{ background: "linear-gradient(to right, rgba(12,12,10,0.94) 0%, rgba(12,12,10,0.75) 45%, rgba(12,12,10,0.5) 100%)" }} />
        <div className={`relative w-full ${shell} mx-auto px-6 pt-24 pb-10 md:pt-28 md:pb-12`}>
          <SLabel light>{guide.categoryTitle}</SLabel>
          <h1 className="font-semibold text-white leading-[1.05] tracking-tight mb-3 max-w-[24ch]"
            style={{ ...DISPLAY, fontSize: "clamp(1.8rem, 3.6vw, 2.6rem)" }}>
            {guide.title}
          </h1>
          <p className="text-white/80 text-[15px] md:text-base leading-relaxed split-prose">{guide.summary}</p>
          {meta && <p className="text-white/50 text-[12.5px] mt-3" style={MONO}>{meta}</p>}
        </div>
      </section>

      <div className={`${shell} mx-auto px-6 py-10 md:py-14`}>
        <button onClick={() => go("resources")}
          className="text-xs text-body hover:text-ink flex items-center gap-1 mb-6 cursor-pointer">
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />All guides
        </button>

        <div className="flex flex-col lg:flex-row lg:items-start gap-8 lg:gap-12">
          {hasRail && (
            /* order-2 on desktop, FIRST on mobile — the files are why most
               people opened this. */
            <aside className="lg:order-2 lg:w-[380px] lg:flex-shrink-0 lg:sticky lg:top-24 space-y-6">
              {guide.attachments.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-quiet mb-2" style={MONO}>Documents</p>
                  <div className="card">
                    {guide.attachments.map((a, i) => (
                      /* No onOpenGuide — we are already on the guide. */
                      <DocumentRow key={i} attachment={a} guide={guide} />
                    ))}
                  </div>
                </div>
              )}
              {products.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-quiet mb-2" style={MONO}>Applies to</p>
                  <div className="card">
                    {products.map((p) => (
                      <button key={p!.slug} onClick={() => onOpenProduct(p!.slug)}
                        className="icon-btn w-full text-left flex items-center justify-between gap-3 px-4 py-3 border-b border-black/8 last:border-0 cursor-pointer">
                        <span className="text-sm text-ink">{p!.name}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-quieter flex-shrink-0" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          )}

          <div className="lg:order-1 lg:flex-1 min-w-0">
            {loading ? (
              <Loader2 className="w-5 h-5 text-quieter animate-spin" aria-label="Loading" />
            ) : body && body.length > 0 ? (
              <div className="split-prose">
                <PortableText value={body} components={components} />
              </div>
            ) : (
              /* Every guide HAS a body — the schema requires one — so an empty
                 result here means the fetch failed, not that the article is
                 empty. Say that, rather than implying the guide is blank. */
              <p className="text-body leading-relaxed split-prose">
                This guide didn't load. Refreshing usually fixes it.
                {guide.attachments.length > 0 && " Its documents are listed alongside and are unaffected."}
              </p>
            )}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="ground-bone border-t border-black/8 py-14 md:py-[68px]">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex items-end justify-between gap-4 mb-6">
              <h2 className="font-semibold text-ink leading-tight"
                style={{ ...DISPLAY, fontSize: "clamp(1.4rem, 2.4vw, 1.8rem)" }}>
                More in {guide.categoryTitle}
              </h2>
              <button onClick={() => go("resources")}
                className="text-sm text-sage hover:text-sage-deep inline-flex items-center gap-1.5 flex-shrink-0 pb-1 cursor-pointer">
                All guides <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {related.map((g) => (
                <button key={g.slug} onClick={() => openGuide(g.slug)}
                  className="card card-link p-5 text-left flex flex-col cursor-pointer">
                  <span className="block text-[16px] leading-tight text-ink font-semibold mb-1.5" style={DISPLAY}>{g.title}</span>
                  <span className="block text-sm text-body leading-relaxed line-clamp-2">{g.summary}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBanner
        ground={related.length > 0 ? "paper" : "bone"}
        title="Your windows and doors, priced before you commit."
        sub="Free to start, no account, and every quote checked by a person before you pay."
        onQuote={() => go("quote")}
      />
    </div>
  );
}
