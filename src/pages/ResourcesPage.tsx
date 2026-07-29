// ═══════════════════════════════════════════════════════════════════════════════
// GUIDES & DOCUMENTATION — the index
//
// Replaces a hardcoded array of ten titles that linked nowhere and had no bodies
// or files. Everything here comes from Sanity, and the page is built to read
// honestly at ZERO records — which is the state it ships in, and the state that
// matters most, because a section that only works when full looks broken for
// exactly the period when someone is deciding whether to trust it.
//
// Two filter axes, because a trade reader asks two different questions: "what is
// this about" (topic) and "what kind of document is it" (installation guide, CAD,
// test report). The second is the one that makes this a technical library rather
// than a blog, and it is how the manufacturers in this category organise theirs.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { ArrowRight, AlertCircle, FileText } from "lucide-react";
import { type Page, SLabel, Btn, CtaBanner } from "../app/ui";
import { guides, guideCategories, imageUrl, getPage, type Guide } from "../data/catalogue";
import { FilterSelect } from "../components/FilterSelect";
import { DOC_TYPE_LABEL, DOC_TYPE_ORDER, fileSize } from "../components/DocumentRow";
import { pathForPage } from "../app/routes";

const DISPLAY = { fontFamily: "'Space Grotesk', sans-serif" } as const;
const MONO = { fontFamily: "'DM Mono', monospace" } as const;

function GuideCard({ guide, docType, onOpen }: {
  guide: Guide; docType: string; onOpen: (slug: string) => void;
}) {
  // When a document-type filter is on, the strip shows only matching files —
  // a filter that changes which results appear but not what they show reads as
  // broken.
  const shown = docType === "all"
    ? guide.attachments
    : guide.attachments.filter((a) => a.docType === docType);
  const first = shown[0];
  const extra = shown.length - 1;

  const inner = (
    <>
      <span className="block text-[10px] uppercase tracking-[0.14em] text-sage mb-2" style={MONO}>
        {guide.categoryTitle}
      </span>
      <span className="block text-[17px] leading-tight text-ink font-semibold mb-1.5" style={DISPLAY}>
        {guide.title}
      </span>
      <span className="block text-sm text-body leading-relaxed line-clamp-2">{guide.summary}</span>
      {/* The files are a HINT of what is inside, never the destination — every
          card opens the article, and downloading happens from its rail, where
          the scope note travels with the file. */}
      <span className="flex items-center justify-between gap-3 border-t border-black/6 mt-4 pt-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-sage flex-shrink-0">
          Read guide <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
        {first && (
          <span className="text-[11px] text-quiet text-right" style={MONO}>
            {[first.ext, fileSize(first.size)].filter(Boolean).join(" · ")}
            {extra > 0 ? ` +${extra}` : ""}
          </span>
        )}
      </span>
    </>
  );

  return (
    <button onClick={() => onOpen(guide.slug)}
      className="card card-link p-5 text-left flex flex-col cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2">
      {inner}
    </button>
  );
}

export function ResourcesPage({ setPage }: { setPage: (p: Page, path?: string) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const openGuide = (slug: string) => { setPage("guide", pathForPage("guide", slug)); window.scrollTo(0, 0); };

  const [topic, setTopic] = useState("all");
  const [docType, setDocType] = useState("all");

  const hero = getPage("resources");
  const heroUrl = imageUrl(hero?.heroImage, { w: 1920, h: 1080 });

  // Only categories that actually HAVE a guide. A rail offering eight topics
  // where six return nothing is the placeholder problem expressed as taxonomy.
  const topics = guideCategories.filter((c) => guides.some((g) => g.categorySlug === c.slug));
  const docTypes = DOC_TYPE_ORDER.filter((t) => guides.some((g) => g.attachments.some((a) => a.docType === t)));

  const filtered = guides.filter((g) =>
    (topic === "all" || g.categorySlug === topic) &&
    (docType === "all" || g.attachments.some((a) => a.docType === docType)));

  const activeTopic = topics.find((t) => t.slug === topic);
  const filtering = topic !== "all" || docType !== "all";
  const clear = () => { setTopic("all"); setDocType("all"); };

  const topicOptions = [
    { slug: "all", name: "All guides", count: guides.length },
    ...topics.map((t) => ({ slug: t.slug, name: t.title, count: guides.filter((g) => g.categorySlug === t.slug).length })),
  ];
  const docOptions = [
    { slug: "all", name: "Any document type" },
    ...docTypes.map((t) => ({
      slug: t, name: DOC_TYPE_LABEL[t] ?? t,
      count: guides.filter((g) => g.attachments.some((a) => a.docType === t)).length,
    })),
  ];

  return (
    <div className="ground-paper min-h-screen">
      {/* Shorter than the products hero: there is no photograph here worth 440px
          and the page's job is the list. No CTA either — a documentation reader
          is mid-project, and "Upload a schedule" at the top of a technical
          library is the marketing intrusion the products page deleted twice. */}
      <section className="relative bg-night h-[300px] md:h-[360px] flex items-end overflow-hidden">
        {heroUrl && (
          <img src={heroUrl} alt="" aria-hidden="true" loading="lazy" decoding="async"
            className="absolute inset-0 w-full h-full object-cover opacity-60" />
        )}
        <div className="absolute inset-0" aria-hidden="true"
          style={{ background: "linear-gradient(to right, rgba(12,12,10,0.92) 0%, rgba(12,12,10,0.7) 45%, rgba(12,12,10,0.45) 100%)" }} />
        <div className="relative w-full max-w-6xl mx-auto px-6 pt-24 pb-10">
          <div className="max-w-xl">
            <SLabel light>Resources</SLabel>
            <h1 className="font-semibold text-white leading-[1.05] tracking-tight mb-3"
              style={{ ...DISPLAY, fontSize: "clamp(2rem, 4.4vw, 3rem)" }}>
              Guides &amp; documentation.
            </h1>
            <p className="text-white/80 text-[15px] md:text-base leading-relaxed max-w-[46ch]">
              Technical guides, measuring references and the documents we can publish openly.
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6">
        {guides.length === 0 ? (
          /* ZERO RECORDS. No rail — a filter over nothing is furniture. One
             honest panel instead, every clause of which is already true and
             stated elsewhere on the site. */
          <div className="py-12 md:py-16 max-w-[62ch]">
            <div className="card p-6 md:p-8">
              <h2 className="text-[19px] font-semibold text-ink mb-2.5" style={DISPLAY}>Nothing is published here yet.</h2>
              <p className="text-body leading-relaxed mb-3">
                We're supply-only and Australia-wide, so most of what a builder needs arrives with the quote:
                the schedule we priced, the systems we matched, and the test reports and warranty terms for
                what you ordered.
              </p>
              <p className="text-body leading-relaxed mb-6">
                This section fills as we publish guides and documents openly. If you need a specific document
                now, ask.
              </p>
              <div className="flex flex-wrap gap-2.5">
                <Btn variant="outline" size="sm" onClick={() => go("contact")}>Ask for a document</Btn>
                <Btn variant="ghost" size="sm" onClick={() => go("products")}>Browse products</Btn>
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-[272px_1fr] lg:gap-10 py-8 md:py-10">
            {/* Mobile filters */}
            <div className="lg:hidden mb-8 space-y-5">
              <FilterSelect label="Topic" listLabel="Guide topic" options={topicOptions} value={topic} unit="guide" onSelect={setTopic} />
              {docTypes.length > 0 && (
                <FilterSelect label="Document type" listLabel="Document type" options={docOptions} value={docType} unit="guide" onSelect={setDocType} />
              )}
            </div>

            <aside className="hidden lg:block">
              <div className="lg:sticky lg:top-24 space-y-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-body mb-3" style={MONO}>Topic</p>
                  <div className="flex flex-col">
                    {topicOptions.map((o) => (
                      <button key={o.slug} onClick={() => setTopic(o.slug)}
                        className={`text-left px-3 py-2.5 text-sm border-l-2 transition-colors cursor-pointer ${topic === o.slug ? "border-sage text-ink font-semibold bg-sage-wash" : "border-transparent text-body hover:text-ink hover:bg-black/[0.02]"}`}>
                        {o.name}
                      </button>
                    ))}
                  </div>
                </div>

                {docTypes.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-body mb-3" style={MONO}>Document type</p>
                    <div className="flex flex-col">
                      {docOptions.map((o) => (
                        <button key={o.slug} onClick={() => setDocType(o.slug)}
                          className={`text-left px-3 py-2.5 text-sm border-l-2 transition-colors cursor-pointer ${docType === o.slug ? "border-sage text-ink font-semibold bg-sage-wash" : "border-transparent text-body hover:text-ink hover:bg-black/[0.02]"}`}>
                          {o.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {filtering && (
                  <button onClick={clear}
                    className="w-full text-left border-t border-line pt-3 px-3 py-2 text-xs text-body hover:text-ink cursor-pointer">
                    Clear filter
                  </button>
                )}
              </div>
            </aside>

            <div>
              <div className="flex items-end justify-between gap-4 mb-2">
                <h2 className="font-semibold text-ink leading-tight"
                  style={{ ...DISPLAY, fontSize: "clamp(1.6rem, 2.8vw, 2.1rem)" }}>
                  {activeTopic ? activeTopic.title : "All guides"}
                </h2>
                <p className="text-[13px] text-quiet flex-shrink-0 pb-1" style={MONO}>
                  {filtered.length} guide{filtered.length === 1 ? "" : "s"}
                </p>
              </div>
              {activeTopic?.description && (
                <p className="text-body text-[15px] leading-relaxed max-w-2xl mb-8">{activeTopic.description}</p>
              )}
              {!activeTopic && <div className="mb-8" />}

              {filtered.length > 0 ? (
                <>
                  {/* Two columns, not three: these are text cards with no
                      photograph, and three across the remaining ~950px leaves
                      ~300px for a two-line title plus a two-line summary. Two
                      also degrades far better at three records than three does. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                    {filtered.map((g) => (
                      <GuideCard key={g.slug} guide={g} docType={docType} onOpen={openGuide} />
                    ))}
                  </div>

                  {/* Sparse, but real. Not "check back soon" — that is a promise
                      with no date behind it. */}
                  {guides.length < 6 && !filtering && (
                    <p className="text-sm text-body leading-relaxed mb-10 max-w-[54ch]">
                      <span className="text-sage-deep" style={MONO}>{guides.length}</span>{" "}
                      guide{guides.length === 1 ? "" : "s"} published so far. If the document you need isn't here,{" "}
                      <button onClick={() => go("contact")} className="text-sage hover:text-sage-deep cursor-pointer underline underline-offset-2">
                        ask
                      </button>{" "}
                      — if we have it, we'll send it.
                    </p>
                  )}
                </>
              ) : (
                <div className="card p-8 text-center mb-10">
                  <AlertCircle className="w-5 h-5 text-sage mx-auto mb-3" aria-hidden="true" />
                  <p className="text-ink font-semibold mb-1.5">No guides match this selection.</p>
                  <p className="text-sm text-body mb-5">Try another topic or document type.</p>
                  <div className="flex flex-wrap gap-2.5 justify-center">
                    <Btn variant="outline" size="sm" onClick={clear}>Clear filters</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => go("contact")}>Ask a question</Btn>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <CtaBanner
        ground="bone"
        title="Your windows and doors, priced before you commit."
        sub="Free to start, no account, and every quote checked by a person before you pay."
        onQuote={() => go("quote")}
      />
    </div>
  );
}
