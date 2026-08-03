// ═══════════════════════════════════════════════════════════════════════════════
// POST — one article, and the document it hosts
//
// The body is NOT in the catalogue payload: portable text for every post
// would make every page on the site pay for a route almost nobody opens. It is
// fetched here, once, on mount.
//
// The rail is where the files live, and it is first in DOM order on mobile —
// someone who opened a page about a datasheet came for the datasheet. A long
// When there is nothing to put there, there is NO rail, and the page narrows:
// a 54ch measure pinned to the left of a 1152px container is a half-empty page.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { PortableText, type PortableTextComponents } from "@portabletext/react";
import { ChevronLeft, Check, ArrowRight, Loader2 } from "lucide-react";
import { type Page, SLabel, CtaBanner } from "../app/ui";
import {
  getPostBySlug, getProductBySlug, posts, imageUrl, postDate, type Post,
} from "../data/catalogue";
import { DocumentRow, docDate } from "../components/DocumentRow";
import { fetchPostBody } from "../data/sanity";
import { pathForPage } from "../app/routes";


// The renderer map matches the authoring block set exactly — the schema offers
// paragraph, heading, subheading, two list kinds, bold, emphasis, link and
// image, and nothing here invents a style the editor cannot produce.
const components: PortableTextComponents = {
  block: {
    normal: ({ children }) => <p className="text-body leading-relaxed mb-5">{children}</p>,
    h2: ({ children }) => (
      <h2 className="text-ink mt-10 mb-3 t-hd2">{children}</h2>
    ),
    h3: ({ children }) => <h3 className="font-semibold text-ink mt-7 mb-2 font-display t-bd-lg">{children}</h3>,
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
            <figcaption className="text-quiet mt-2 font-data t-data-sm">{value.caption}</figcaption>
          )}
        </figure>
      );
    },
  },
};

export function PostPage({ slug, setPage, onOpenProduct }: {
  slug: string;
  setPage: (p: Page, path?: string) => void;
  onOpenProduct: (slug: string) => void;
}) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const openPost = (s: string) => { setPage("post", pathForPage("post", s)); window.scrollTo(0, 0); };

  const post: Post | undefined = getPostBySlug(slug);
  const [body, setBody] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchPostBody(slug)
      .then((b) => { if (live) { setBody(b); setLoading(false); } })
      .catch(() => { if (live) { setBody([]); setLoading(false); } });
    return () => { live = false; };
  }, [slug]);

  if (!post) {
    return (
      <div className="ground-paper min-h-screen pt-28 pb-20">
        <div className="max-w-2xl mx-auto px-6">
          <div className="card p-8">
            <h1 className="font-semibold text-ink mb-2 font-display t-hd2">That page isn't here.</h1>
            <p className="text-body mb-6">It may have been renamed or unpublished.</p>
            <button onClick={() => go("resources")} className="text-sage hover:text-sage-deep inline-flex items-center gap-1.5 cursor-pointer">
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />All resources
            </button>
          </div>
        </div>
      </div>
    );
  }

  const products = post.productSlugs.map(getProductBySlug).filter(Boolean);
  const hasRail = !!post.attachment || products.length > 0;
  const shell = hasRail ? "max-w-6xl" : "max-w-3xl";
  const heroUrl = imageUrl(post.heroImage, { w: 1920, h: 1080 });
  const related = posts.filter((p) => p.categorySlug === post.categorySlug && p.slug !== post.slug).slice(0, 3);
  const date = postDate(post);

  // Only the parts that are true. If nothing is, the line does not render.
  const meta = [
    date && `${date.label} ${docDate(date.value)}`,
    post.attachment && "1 document",
  ].filter(Boolean).join(" · ");

  return (
    <div className="ground-paper min-h-screen">
      {/* A header BAND, not a photographic hero. Most resources will have no
          image, and a hero whose default state is a missing photograph is the
          placeholder problem again. The image is an enhancement, not the frame. */}
      <section className={`relative bg-night overflow-hidden ${heroUrl ? "min-h-[380px] flex items-end" : ""}`}>
        {heroUrl && (
          <img src={heroUrl} alt="" aria-hidden="true" loading="lazy" decoding="async"
            className="hero-img" />
        )}
        <div className="hero-scrim" aria-hidden="true" />
        <div className={`relative w-full ${shell} mx-auto px-6 pt-24 pb-10 md:pt-28 md:pb-12`}>
          {/* Both axes, same order as the index row. */}
          <SLabel light>{post.categoryTitle}</SLabel>
          <h1 className="text-white mb-3 max-w-[24ch] t-ds2">
            {post.title}
          </h1>
          <p className="text-white/80 leading-relaxed split-prose t-bd">{post.summary}</p>
          {meta && <p className="text-white/50 mt-3 font-data t-data-sm">{meta}</p>}
        </div>
      </section>

      <div className={`${shell} mx-auto px-6 py-10 md:py-14`}>
        <button onClick={() => go("resources")}
          className="text-body hover:text-ink flex items-center gap-1 mb-6 cursor-pointer t-cap">
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />All resources
        </button>

        <div className="flex flex-col lg:flex-row lg:items-start gap-8 lg:gap-12">
          {hasRail && (
            /* order-2 on desktop, FIRST on mobile — the files are why most
               people opened this. */
            <aside className="lg:order-2 lg:w-[380px] lg:flex-shrink-0 lg:sticky lg:top-24 space-y-6">
              {post.attachment && (
                <div>
                  <p className="text-quiet mb-2 font-data t-label">Attachment</p>
                  <div className="card">
                    {/* No onOpenPost — we are already on it. */}
                    <DocumentRow attachment={post.attachment} post={post} />
                  </div>
                </div>
              )}
              {products.length > 0 && (
                <div>
                  <p className="text-quiet mb-2 font-data t-label">Applies to</p>
                  <div className="card">
                    {products.map((p) => (
                      <button key={p!.slug} onClick={() => onOpenProduct(p!.slug)}
                        className="icon-btn w-full text-left flex items-center justify-between gap-3 px-4 py-3 border-b border-black/8 last:border-0 cursor-pointer">
                        <span className="text-ink t-bd-sm">{p!.name}</span>
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
              /* Every post HAS a body — the schema requires one — so an empty
                 result here means the fetch failed, not that the page is empty. */
              <p className="text-body leading-relaxed split-prose">
                This didn't load. Refreshing usually fixes it.
                {post.attachment && " Its attachment is listed alongside and is unaffected."}
              </p>
            )}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="ground-bone border-t border-black/8 section-pad">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex items-end justify-between gap-4 mb-6">
              <h2 className="text-ink t-hd1">
                More in {post.categoryTitle}
              </h2>
              <button onClick={() => go("resources")}
                className="text-sage hover:text-sage-deep inline-flex items-center gap-1.5 flex-shrink-0 pb-1 cursor-pointer t-bd-sm">
                All resources <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {related.map((r) => (
                <button key={r.slug} onClick={() => openPost(r.slug)}
                  className="card card-link p-5 text-left flex flex-col cursor-pointer">
                  <span className="block text-sage mb-1.5 font-data t-label">{r.categoryTitle}</span>
                  <span className="block text-ink font-semibold mb-1.5 font-display t-bd">{r.title}</span>
                  <span className="text-body line-clamp-2 t-bd-sm">{r.summary}</span>
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
