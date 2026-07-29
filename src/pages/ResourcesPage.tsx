// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCES — the index
//
// A LIST, not a card grid. Cards are the wrong instrument for homogeneous text
// records with no photograph: their height is set by the longest summary, so a
// grid of them can never align, and every record added makes the page harder to
// scan rather than easier. A row puts every title on the same left edge and
// every piece of metadata in the same right column, which is what someone
// scanning eighty of them actually needs. (NN/g say the same thing about cards
// vs lists for homogeneous items, and name blog posts as the example.)
//
// The page CHANGES SHAPE as it fills, because the honest layout at two records
// is not the honest layout at two hundred:
//
//   0        an honest panel — no rail, no search, no list furniture
//   1–11     the list alone. Two filters over three records is the placeholder
//            problem expressed as taxonomy.
//   12+      the filter rail appears: kind first, then topic
//   25+      search appears
//   40+      the list renders 40 and offers "Load more"
//
// Load more rather than pagination (which measurably suppresses how much of a
// list people see) and rather than infinite scroll (which hides content from
// crawlers, and these pages exist to be found).
// ═══════════════════════════════════════════════════════════════════════════════
import { useMemo, useState } from "react";
import { AlertCircle, Search, X } from "lucide-react";
import { type Page, SLabel, Btn, CtaBanner } from "../app/ui";
import {
  resources, resourceKinds, resourceTopics, imageUrl, getPage, resourceDate, type Resource,
} from "../data/catalogue";
import { FilterSelect } from "../components/FilterSelect";
import { fileSize, docDate } from "../components/DocumentRow";
import { pathForPage } from "../app/routes";

const DISPLAY = { fontFamily: "'Space Grotesk', sans-serif" } as const;
const MONO = { fontFamily: "'DM Mono', monospace" } as const;

// The counts at which the page grows each affordance. Together in one place
// because they are a single editorial judgement, not five scattered ones.
const SHOW_FILTERS_AT = 12;
const SHOW_SEARCH_AT = 25;
const PAGE_SIZE = 40;

// ─── One row ──────────────────────────────────────────────────────────────────
// Left: what it is and what it answers. Right: the tokens someone scanning
// decides on — the standard first, because a certifier hunting AS 2047 is the
// reader with the most specific need and nobody else in this market surfaces it.
function ResourceRow({ resource, showTopic, onOpen }: {
  resource: Resource; showTopic: boolean; onOpen: (slug: string) => void;
}) {
  const date = resourceDate(resource);
  const files = resource.attachments.length;
  // One standard, not a list: the row is a decision aid, not a bibliography.
  const standard = resource.attachments.find((a) => a.standardRef)?.standardRef;
  // Byte size belongs on the file row where the click happens, not here.
  const fileHint = files === 1
    ? [resource.attachments[0].ext, fileSize(resource.attachments[0].size)].filter(Boolean).join(" · ")
    : files > 1 ? `${files} files` : "";

  return (
    <button onClick={() => onOpen(resource.slug)}
      className="group w-full text-left px-5 py-4 border-b border-black/8 last:border-b-0 cursor-pointer transition-colors hover:bg-sage-wash focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-inset flex flex-col md:flex-row md:items-baseline md:gap-6">
      <span className="flex-1 min-w-0">
        {/* KIND in TOPIC — both axes in one chip. The topic half is dropped when
            a topic filter is on, where repeating it says nothing. */}
        <span className="block text-[10px] uppercase tracking-[0.14em] text-sage mb-1.5" style={MONO}>
          {resource.kindTitle}{showTopic && <span className="text-quieter"> in {resource.topicTitle}</span>}
        </span>
        <span className="block text-[17px] leading-snug text-ink font-semibold group-hover:text-sage-deep transition-colors" style={DISPLAY}>
          {resource.title}
        </span>
        {/* No `block` here: line-clamp needs display:-webkit-box, and `block`
            wins the cascade against it, which silently un-clamps the line. */}
        <span className="text-sm text-body leading-relaxed line-clamp-1 mt-0.5">{resource.summary}</span>
      </span>

      <span className="flex items-center gap-3 md:flex-col md:items-end md:gap-1 md:text-right flex-shrink-0 mt-2 md:mt-0 md:w-[150px]">
        {standard && (
          <span className="text-[11px] text-ink font-medium whitespace-nowrap" style={MONO}>{standard}</span>
        )}
        {fileHint && <span className="text-[11px] text-quiet whitespace-nowrap" style={MONO}>{fileHint}</span>}
        {date && (
          <span className="text-[11px] text-quieter whitespace-nowrap" style={MONO}>
            {date.label === "Updated" ? "Upd. " : ""}{docDate(date.value)}
          </span>
        )}
      </span>
    </button>
  );
}

export function ResourcesPage({ setPage }: { setPage: (p: Page, path?: string) => void }) {
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const open = (slug: string) => { setPage("resource", pathForPage("resource", slug)); window.scrollTo(0, 0); };

  const [kind, setKind] = useState("all");
  const [topic, setTopic] = useState("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const hero = getPage("resources");
  const heroUrl = imageUrl(hero?.heroImage, { w: 1920, h: 1080 });

  const total = resources.length;
  const withFilters = total >= SHOW_FILTERS_AT;
  const withSearch = total >= SHOW_SEARCH_AT;

  // Only values that actually HAVE a resource. A rail offering eight topics
  // where six return nothing is the placeholder problem, one level up.
  const kinds = resourceKinds.filter((k) => resources.some((r) => r.kindSlug === k.slug));
  const topics = resourceTopics.filter((t) => resources.some((r) => r.topicSlug === t.slug));

  // Search covers everything already in memory EXCEPT bodies — those are
  // fetched per article and pulling them all here to search would undo the one
  // decision that keeps this section cheap for every other page on the site.
  const matches = (r: Resource, q: string) => {
    const hay = [
      r.title, r.summary, r.kindTitle, r.topicTitle,
      ...r.attachments.flatMap((a) => [a.label, a.standardRef ?? ""]),
    ].join(" ").toLowerCase();
    return q.split(/\s+/).filter(Boolean).every((term) => hay.includes(term));
  };

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => resources.filter((r) =>
    (kind === "all" || r.kindSlug === kind) &&
    (topic === "all" || r.topicSlug === topic) &&
    (!q || matches(r, q))), [kind, topic, q]);

  const activeTopic = topics.find((t) => t.slug === topic);
  const activeKind = kinds.find((k) => k.slug === kind);
  const filtering = kind !== "all" || topic !== "all" || q !== "";
  const clear = () => { setKind("all"); setTopic("all"); setQuery(""); };

  const shown = filtered.slice(0, limit);
  const heading = activeTopic?.title ?? (activeKind ? `${activeKind.title}s` : "All resources");

  const kindOptions = [
    { slug: "all", name: "Any kind", count: total },
    ...kinds.map((k) => ({ slug: k.slug, name: k.title, count: resources.filter((r) => r.kindSlug === k.slug).length })),
  ];
  const topicOptions = [
    { slug: "all", name: "All topics", count: total },
    ...topics.map((t) => ({ slug: t.slug, name: t.title, count: resources.filter((r) => r.topicSlug === t.slug).length })),
  ];

  const rail = (
    <>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-body mb-3" style={MONO}>Kind</p>
        <div className="flex flex-col">
          {kindOptions.map((o) => (
            <button key={o.slug} onClick={() => setKind(o.slug)}
              className={`text-left px-3 py-2.5 text-sm border-l-2 transition-colors cursor-pointer flex items-center justify-between gap-2 ${kind === o.slug ? "border-sage text-ink font-semibold bg-sage-wash" : "border-transparent text-body hover:text-ink hover:bg-black/[0.02]"}`}>
              <span>{o.name}</span>
              <span className="text-[11px] text-quieter flex-shrink-0" style={MONO}>{o.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-body mb-3" style={MONO}>Topic</p>
        <div className="flex flex-col">
          {topicOptions.map((o) => (
            <button key={o.slug} onClick={() => setTopic(o.slug)}
              className={`text-left px-3 py-2.5 text-sm border-l-2 transition-colors cursor-pointer flex items-center justify-between gap-2 ${topic === o.slug ? "border-sage text-ink font-semibold bg-sage-wash" : "border-transparent text-body hover:text-ink hover:bg-black/[0.02]"}`}>
              <span>{o.name}</span>
              <span className="text-[11px] text-quieter flex-shrink-0" style={MONO}>{o.count}</span>
            </button>
          ))}
        </div>
      </div>
      {filtering && (
        <button onClick={clear}
          className="w-full text-left border-t border-line pt-3 px-3 py-2 text-xs text-body hover:text-ink cursor-pointer">
          Clear filters
        </button>
      )}
    </>
  );

  return (
    <div className="ground-paper min-h-screen">
      {/* Shorter than the products hero: there is no photograph here worth 440px
          and the page's job is the list. No CTA either — someone reading
          documentation is mid-project, and "Upload a schedule" at the top of a
          reference library is the marketing intrusion the products page deleted. */}
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
              Resources.
            </h1>
            {/* The name is deliberately plain, so the standfirst does the
                specifying — and it can absorb a new kind without being rewritten. */}
            <p className="text-white/80 text-[15px] md:text-base leading-relaxed max-w-[46ch]">
              Articles, guides and technical documentation — everything we can publish openly.
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6">
        {total === 0 ? (
          /* ZERO RECORDS. No rail, no search — furniture over nothing. One
             honest panel, every clause of which is true and stated elsewhere. */
          <div className="py-12 md:py-16 max-w-[62ch]">
            <div className="card p-6 md:p-8">
              <h2 className="text-[19px] font-semibold text-ink mb-2.5" style={DISPLAY}>Nothing is published here yet.</h2>
              <p className="text-body leading-relaxed mb-3">
                We're supply-only and Australia-wide, so most of what a builder needs arrives with the quote:
                the schedule we priced, the systems we matched, and the test reports and warranty terms for
                what you ordered.
              </p>
              <p className="text-body leading-relaxed mb-6">
                This section fills as we publish openly. If you need a specific document now, ask.
              </p>
              <div className="flex flex-wrap gap-2.5">
                <Btn variant="outline" size="sm" onClick={() => go("contact")}>Ask for a document</Btn>
                <Btn variant="ghost" size="sm" onClick={() => go("products")}>Browse products</Btn>
              </div>
            </div>
          </div>
        ) : (
          <div className={`py-8 md:py-10 ${withFilters ? "lg:grid lg:grid-cols-[240px_1fr] lg:gap-10" : ""}`}>
            {withFilters && (
              <>
                <div className="lg:hidden mb-8 space-y-5">
                  <FilterSelect label="Kind" listLabel="Resource kind" options={kindOptions} value={kind} unit="resource" onSelect={setKind} />
                  <FilterSelect label="Topic" listLabel="Resource topic" options={topicOptions} value={topic} unit="resource" onSelect={setTopic} />
                </div>
                <aside className="hidden lg:block">
                  <div className="lg:sticky lg:top-24 space-y-8">{rail}</div>
                </aside>
              </>
            )}

            <div className={withFilters ? "" : "max-w-3xl"}>
              <div className="flex items-end justify-between gap-4 mb-2">
                <h2 className="font-semibold text-ink leading-tight"
                  style={{ ...DISPLAY, fontSize: "clamp(1.6rem, 2.8vw, 2.1rem)" }}>
                  {heading}
                </h2>
                {/* A count is worth showing once there is enough that the
                    number tells you something you cannot see. */}
                {withFilters && (
                  <p className="text-[13px] text-quiet flex-shrink-0 pb-1" style={MONO}>
                    {filtered.length} of {total}
                  </p>
                )}
              </div>
              {activeTopic?.description && (
                <p className="text-body text-[15px] leading-relaxed max-w-2xl mb-6">{activeTopic.description}</p>
              )}

              {/* Search sits INSIDE the results column, not in the site header:
                  a search field a reader mistakes for site-wide search is worse
                  than none, and its placement is what says which it is. */}
              {withSearch && (
                <div className="relative mb-5 mt-4">
                  <Search className="w-4 h-4 text-quieter absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                  <input
                    type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE_SIZE); }}
                    placeholder="Search resources" aria-label="Search resources"
                    className="w-full card pl-10 pr-10 py-2.5 text-sm text-ink placeholder:text-quieter focus:outline-none focus-visible:ring-2 focus-visible:ring-sage" />
                  {query && (
                    <button onClick={() => setQuery("")} aria-label="Clear search"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-quieter hover:text-ink cursor-pointer">
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
              {!activeTopic?.description && !withSearch && <div className="mb-6" />}

              {shown.length > 0 ? (
                <>
                  <div className="card overflow-hidden mb-6">
                    {shown.map((r) => (
                      <ResourceRow key={r.slug} resource={r} showTopic={topic === "all"} onOpen={open} />
                    ))}
                  </div>

                  {filtered.length > shown.length && (
                    <div className="mb-10 flex items-center gap-4">
                      <Btn variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>Load more</Btn>
                      <span className="text-[13px] text-quiet" style={MONO}>
                        {shown.length} of {filtered.length}
                      </span>
                    </div>
                  )}

                  {/* Sparse, but real. Not "check back soon" — a promise with no
                      date behind it. */}
                  {total < 6 && !filtering && (
                    <p className="text-sm text-body leading-relaxed mb-10 max-w-[54ch]">
                      <span className="text-sage-deep" style={MONO}>{total}</span>{" "}
                      published so far. If what you need isn't here,{" "}
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
                  <p className="text-ink font-semibold mb-1.5">
                    {q ? `Nothing matches "${query.trim()}".` : "Nothing matches this selection."}
                  </p>
                  <p className="text-sm text-body mb-5">Try another kind or topic{q ? ", or a different word" : ""}.</p>
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
