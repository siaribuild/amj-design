// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCES — the index
//
// Implements the "Forty entries — an index, not a card wall" state from the
// approved wireframe, and implements it as the ONLY state: search, the filter
// rail and the result count render at two posts exactly as they do at two
// hundred. That is the owner's call — the alternative (controls phasing in by
// count) would mean maintaining two layouts.
//
// Rows, not cards. Cards are the wrong instrument for homogeneous text records
// with no photograph: card height is set by the longest summary, so a grid can
// never align, and each record added makes the page harder to scan. A row puts
// every title on one left edge and every file fact in one right column — which
// is the column a certifier scans.
//
// Where the wireframe and the site's design language disagree, the site wins:
// the header, the type scale, the sage accent, the hero image treatment and the
// button components are the site's, not the mock's.
// ═══════════════════════════════════════════════════════════════════════════════
import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { type Page, SLabel, Btn, CtaBanner, GhostMark } from "../app/ui";
import { posts, postCategories, imageUrl, getPage, postDate, type Post } from "../data/catalogue";
import { fileSize, docDate } from "../components/DocumentRow";
import { pathForPage } from "../app/routes";


// Twelve at a time, per the wireframe. Load more rather than pagination (which
// measurably suppresses how much of a list people see) and rather than infinite
// scroll (which hides content from crawlers — and these pages exist to be found).
const PAGE_SIZE = 12;

/** The right-hand scan column: what a reader decides on before clicking. File
 *  facts when there is a file, the date when there is not. Never both, never a
 *  placeholder for a field the record does not carry. */
function metaLines(post: Post): string[] {
  if (post.attachment) {
    const a = post.attachment;
    return [a.ext, fileSize(a.size), a.revision, a.standardRef].filter(Boolean) as string[];
  }
  const d = postDate(post);
  return d ? [`${d.label} ${docDate(d.value)}`] : [];
}

function PostRow({ post, onOpen }: { post: Post; onOpen: (slug: string) => void }) {
  const meta = metaLines(post);
  return (
    <button onClick={() => onOpen(post.slug)}
      className="group w-full text-left grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px_34px] gap-x-6 gap-y-3 items-center py-6 border-t border-line first:border-t-0 transition-colors hover:bg-sage-wash cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-inset">
      <span className="min-w-0">
        <span className="block text-sage mb-2 font-data t-label">
          {post.categoryTitle}
        </span>
        <span className="block text-ink mb-1.5 t-hd2">
          {post.title}
        </span>
        <span className="block text-body max-w-[700px] t-cap">{post.summary}</span>
      </span>

      {/* The scan column. First line carries the weight — it is the file type, or
          the date when there is no file. */}
      <span className="text-quiet md:justify-self-start font-data t-label">
        {meta.map((line, i) => (
          <span key={i} className={`block ${i === 0 ? "text-ink font-medium" : ""}`}>{line}</span>
        ))}
      </span>

      <span aria-hidden="true"
        className="hidden md:block text-sage text-right opacity-40 group-hover:opacity-100 transition-opacity t-hd2">
        ↗
      </span>
    </button>
  );
}

export function ResourcesPage({ setPage }: { setPage: (p: Page, path?: string) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const open = (slug: string) => { setPage("post", pathForPage("post", slug)); window.scrollTo(0, 0); };

  // Multi-select, per the wireframe: a reader looking for a drawing OR a test
  // report should not have to choose between them.
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const heroUrl = imageUrl(getPage("resources")?.heroImage, { w: 1920, h: 1080 });
  const total = posts.length;

  // Only categories that actually HAVE a post. A filter offering eight values
  // where six return nothing is the placeholder problem, one level up.
  const cats = postCategories.filter((c) => posts.some((p) => p.categorySlug === c.slug));

  // Search covers everything already in memory EXCEPT bodies — those are fetched
  // per post, and pulling them all here would undo the decision that keeps this
  // section cheap for every other page on the site.
  const matches = (p: Post, q: string) => {
    const hay = [
      p.title, p.summary, p.categoryTitle,
      p.attachment?.label ?? "", p.attachment?.standardRef ?? "", p.attachment?.ext ?? "",
    ].join(" ").toLowerCase();
    return q.split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
  };

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => posts.filter((p) =>
    (selected.length === 0 || selected.includes(p.categorySlug)) &&
    (!q || matches(p, q))), [selected, q]);

  const shown = filtered.slice(0, limit);
  const filtering = selected.length > 0 || q !== "";
  const reset = () => setLimit(PAGE_SIZE);
  const toggle = (slug: string) => {
    setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));
    reset();
  };
  const clear = () => { setSelected([]); setQuery(""); reset(); };

  // NOTE: no min-h-screen on the root below. The shell owns viewport height; a
  // page-level one guarantees a strip of the PAGE's ground above the footer
  // whenever the content is shorter than the screen, which is exactly what the
  // gap under the closing CTA was.

  const railBlock = (
    <div className="border-t border-ink">
      <div className="py-4 border-b border-line">
        <div className="flex items-baseline justify-between gap-3 mb-3 font-data t-label">
          <span className="text-ink">Category</span>
          <span className="text-quieter">What it is</span>
        </div>
        {cats.map((c) => {
          const on = selected.includes(c.slug);
          const n = posts.filter((p) => p.categorySlug === c.slug).length;
          return (
            <label key={c.slug} className="flex items-center justify-between gap-3 py-1.5 cursor-pointer group/opt t-cap">
              <span className="flex items-center gap-2.5">
                {/* The tick is drawn, not relied on from the UA: appearance-none
                    removes the native glyph, and a filled square with no mark in
                    it does not read as "checked". */}
                <span className="relative w-[15px] h-[15px] flex-shrink-0">
                  <input type="checkbox" checked={on} onChange={() => toggle(c.slug)}
                    className="peer absolute inset-0 w-full h-full appearance-none border border-line bg-paper cursor-pointer checked:bg-sage checked:border-sage focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1" />
                  <Check className="absolute inset-0 m-auto w-[11px] h-[11px] text-white opacity-0 peer-checked:opacity-100 pointer-events-none" aria-hidden="true" />
                </span>
                <span className={on ? "text-ink font-medium" : "text-body group-hover/opt:text-ink"}>{c.title}</span>
              </span>
              <span className="text-quieter flex-shrink-0 font-data t-data-sm">{n}</span>
            </label>
          );
        })}
      </div>
      {/* Always present, as in the wireframe. Disabled rather than absent when
          there is nothing to clear: a control that appears only once you have
          already acted is a control you cannot learn is there. */}
      <button onClick={clear} disabled={!filtering}
        className="w-full text-left py-3.5 text-sage hover:text-sage-deep cursor-pointer disabled:text-quieter disabled:cursor-default disabled:hover:text-quieter font-data t-label">
        Clear search and filters
      </button>
    </div>
  );

  return (
    <div className="ground-paper">
      {/* A BAND, not a hero. The wireframe argues the point and it is right: at a
          laptop viewport a 360px title block consumes the useful first screen
          and pushes the first real record below it. ~210px orients, then gets
          out of the way. */}
      {/* The wireframe's band is 196–218px measured BELOW its header. This site's
          header overlays the hero, so the same content area needs the header's
          height on top — hence 260, not 214. The proportion is the mock's; the
          arithmetic accounts for a header the mock did not have. */}
      <section className="relative bg-night h-[248px] md:h-[268px] flex items-end overflow-hidden">
        {heroUrl && <img src={heroUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" className="hero-img" />}
        {heroUrl && <div className="hero-scrim" aria-hidden="true" />}
        {/* The site's own decorative device, in place of the mock's linework. */}
        <GhostMark size={260} opacity={0.05} color="#fff" pos="right-0 bottom-0" />
        <div className="relative w-full max-w-6xl mx-auto px-6 pt-24 pb-8">
          <SLabel light>Articles, guides &amp; documentation</SLabel>
          <h1 className="text-white mb-2 t-ds1">
            Resources
          </h1>
          <p className="text-white/70 leading-relaxed max-w-[62ch] t-bd">
            Find a method, standard, drawing or product document — without browsing a catalogue of empty thumbnails.
          </p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6 py-10 md:py-12">
        {total === 0 ? (
          /* ZERO RECORDS. No search, no rail — furniture over nothing. One
             honest panel, every clause of which is true and stated elsewhere. */
          <div className="max-w-[62ch]">
            <div className="card p-6 md:p-8">
              <SLabel>0 published</SLabel>
              <h2 className="font-semibold text-ink mb-2.5 mt-1 font-display t-bd-lg">The library is being prepared.</h2>
              <p className="text-body leading-relaxed mb-3">
                We're supply-only and Australia-wide, so most of what a builder needs arrives with the quote:
                the schedule we priced, the systems we matched, and the test reports and warranty terms for
                what you ordered.
              </p>
              <p className="text-body leading-relaxed mb-6">
                This section fills as we publish openly. If you need a specific document now, ask.
              </p>
              <div className="flex flex-wrap gap-2.5">
                <Btn variant="outline" size="sm" onClick={() => go("contact")}>Request a document</Btn>
                <Btn variant="ghost" size="sm" onClick={() => go("products")}>Browse products</Btn>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Search sits in the page, above the results — not in the site
                header. A field a reader mistakes for site-wide search is worse
                than none, and its placement is what tells them which it is. */}
            <div className="relative mb-5">
              <Search className="w-4 h-4 text-quieter absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input type="search" value={query}
                onChange={(e) => { setQuery(e.target.value); reset(); }}
                placeholder="Search title, category, standard or product…" aria-label="Search resources"
                className="w-full card pl-11 pr-11 min-h-[58px] text-ink placeholder:text-quieter focus:outline-none focus-visible:ring-2 focus-visible:ring-sage t-bd" />
              {query && (
                <button onClick={() => { setQuery(""); reset(); }} aria-label="Clear search"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-quieter hover:text-ink cursor-pointer">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="lg:grid lg:grid-cols-[244px_minmax(0,1fr)] lg:gap-10 lg:items-start">
              <aside aria-label="Filter resources" className="mb-8 lg:mb-0 lg:sticky lg:top-24">
                {railBlock}
              </aside>

              <section>
                <div className="flex items-center justify-between gap-5 pb-3 border-b border-ink">
                  <p className="text-ink font-data t-label">
                    {filtered.length} {filtered.length === 1 ? "resource" : "resources"}
                    {filtered.length !== total && <span className="text-quieter"> of {total}</span>}
                  </p>
                  {/* A statement of the order, not a control that does nothing. */}
                  <p className="text-quieter font-data t-label">Recent first</p>
                </div>

                {filtering && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {query && (
                      <button onClick={() => { setQuery(""); reset(); }}
                        className="border border-sage bg-sage-wash text-sage px-2 py-1.5 cursor-pointer hover:bg-sage-veil font-data t-label">
                        Search: {query.trim()} ×
                      </button>
                    )}
                    {selected.map((slug) => (
                      <button key={slug} onClick={() => toggle(slug)}
                        className="border border-sage bg-sage-wash text-sage px-2 py-1.5 cursor-pointer hover:bg-sage-veil font-data t-label">
                        {cats.find((c) => c.slug === slug)?.title ?? slug} ×
                      </button>
                    ))}
                  </div>
                )}

                {shown.length > 0 ? (
                  <>
                    <div className="border-b border-ink">
                      {shown.map((p) => <PostRow key={p.slug} post={p} onOpen={open} />)}
                    </div>

                    {filtered.length > shown.length && (
                      <div className="grid grid-cols-[1fr_auto] gap-5 items-center pt-5">
                        <div>
                          <div className="h-0.5 bg-black/10">
                            <div className="h-full bg-sage transition-all"
                              style={{ width: `${Math.min(100, (shown.length / filtered.length) * 100)}%` }} />
                          </div>
                          <p className="text-quiet mt-2 font-data t-label">
                            Showing {shown.length} of {filtered.length}
                          </p>
                        </div>
                        <Btn variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                          Load {Math.min(PAGE_SIZE, filtered.length - shown.length)} more
                        </Btn>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="py-12 border-b border-ink">
                    <SLabel>No matching resources</SLabel>
                    <p className="text-ink mt-3 mb-6 t-hd1">
                      Try a broader term or clear a filter.
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      <Btn variant="outline" size="sm" onClick={clear}>Clear search and filters</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => go("contact")}>Ask for a document</Btn>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>

      <CtaBanner
        ground="bone"
        title="Need a document tied to a specific product?"
        sub="Send the product family, drawing reference or standard and a person will locate the current issue."
        onQuote={() => go("contact")}
        cta="Contact us"
      />
    </div>
  );
}
