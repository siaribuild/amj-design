// Sanity content model for the OpenFrame catalogue.
//
// Normalized so options are a SINGLE SOURCE OF TRUTH: an `option` (e.g. a specific
// handle, flyscreen, finish or colour) is its own document, belongs to an
// `optionType`, and carries its own price. A product does NOT copy option text —
// it references the shared option and records only whether it is standard or
// optional for that product. Change an option's name or price once → every product
// that offers it updates.
//
// Images are real Sanity image assets (hotspot/crop enabled) so the frontend can
// request on-demand sizes and honour focal points.
import { defineType, defineField, defineArrayMember } from "sanity";

const specRow = defineArrayMember({
  type: "object",
  name: "specRow",
  fields: [
    defineField({ name: "label", type: "string" }),
    defineField({ name: "value", type: "string" }),
  ],
});

export const category = defineType({
  name: "category",
  title: "Category",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "slug", type: "slug", options: { source: "name" }, validation: (r) => r.required() }),
    defineField({ name: "shortDescription", type: "text", rows: 2 }),
    defineField({ name: "description", type: "text", rows: 4 }),
  ],
});

export const family = defineType({
  name: "family",
  title: "Family",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "slug", type: "slug", options: { source: "name" }, validation: (r) => r.required() }),
    defineField({ name: "category", type: "reference", to: [{ type: "category" }], validation: (r) => r.required() }),
    // The canonical operation every product in this family performs. It is the
    // single source of truth for the family's operation: products inherit it and
    // only set their own Configuration → Operation types to OVERRIDE (a product
    // that supports several operations, e.g. a casement door that is also hinged).
    // Both the deterministic schedule matcher and the estimator read it, so a new
    // family's operation is one field here — never repeated on every product.
    defineField({
      name: "operation",
      title: "Operation",
      type: "string",
      options: { list: ["fixed", "awning", "casement", "sliding", "stacker", "bi-fold", "hinged", "pivot", "louvre", "double-hung", "tilt-turn", "lift-slide"] },
      validation: (r) => r.required(),
    }),
    // Alternative names architects/drafters use for this family on a schedule.
    // The estimator maps a schedule's TYPE text to a family through these, so a
    // new piece of trade vocabulary is a CONTENT change, not a code change.
    // Matching is exact (case/whitespace-insensitive) — never a fuzzy guess,
    // because the price difference between families is material.
    defineField({
      name: "aliases",
      title: "Schedule aliases (architect terminology)",
      type: "array",
      of: [{ type: "string" }],
      description: "e.g. FIXED, FIXED LITE, PICTURE WINDOW — exact terms as printed on schedules. One per entry.",
    }),
    // The family's pictogram — a restrained technical marker shown beside (never
    // instead of) the product name in the quote list. Inline SVG markup rather
    // than an image asset, because an asset cannot inherit the theme's ink
    // colour: the marker has to recolour with its row state, and `currentColor`
    // is the only thing that does that. Markup is allow-listed before it renders.
    defineField({
      name: "icon",
      title: "Pictogram (inline SVG)",
      type: "text",
      rows: 6,
      description:
        "Square 24×24 viewBox, monochrome line art. Use stroke=\"currentColor\" and fill=\"none\" so it "
        + "picks up the surrounding text colour. Show the OPERATION (how it opens), not a product likeness. "
        + "Only svg/g/path/rect/circle/ellipse/line/polyline/polygon/title/desc survive sanitising; scripts, "
        + "event handlers and external references are stripped.",
      // The browser sanitises before rendering, but this catches the mistake at
      // authoring time rather than letting unsafe markup sit in a payload every
      // visitor downloads. Deliberately coarse — the renderer's allow-list is
      // the authority; this is the second lock, not the first.
      validation: (r) => r.custom((value?: string) => {
        if (!value) return true;
        const svg = value.trim();
        if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) return "Must be a single <svg>…</svg> element.";
        if (/<\?|<!\[CDATA\[/i.test(svg)) return "Processing instructions and CDATA are not allowed.";
        if (/<\s*(script|style|foreignObject|image|use|animate|set|iframe|a)\b/i.test(svg)) {
          return "Only plain drawing elements are allowed (no script/style/use/image/animate/foreignObject/a).";
        }
        if (/\son[a-z]+\s*=/i.test(svg)) return "Event handler attributes are not allowed.";
        if (/(javascript:|xlink:href|href\s*=)/i.test(svg)) return "External or scripted references are not allowed.";
        return true;
      }),
    }),
    defineField({ name: "shortDescription", type: "text", rows: 2 }),
    defineField({ name: "description", type: "text", rows: 4 }),
  ],
});

// ── Options as first-class, shared, reusable documents ───────────────────────
export const optionType = defineType({
  name: "optionType",
  title: "Option type",
  type: "document",
  description: "A category of options shared across products, e.g. Hardware, Flyscreen, Installation, Finish, Colour.",
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "slug", type: "slug", options: { source: "name" }, validation: (r) => r.required() }),
    defineField({ name: "sortOrder", title: "Sort order", type: "number", description: "Display order of this type in the configurator." }),
    defineField({
      name: "appliesToAll",
      title: "Applies to all products",
      type: "boolean",
      description: "When on, every product offers all options of this type (e.g. Colour) without listing them per product.",
      initialValue: false,
    }),
    // WS1 (thermal rework): glazing is a MANDATORY option — every window has a
    // glass, so exactly one must be selected. Unlike 'applies to all', the
    // available choices for a required glazing type come from the product's own
    // performance variants (each variant realises one glazing option), because
    // Uw depends on the frame×glass pair.
    defineField({
      name: "required",
      title: "Required selection (exactly one)",
      type: "boolean",
      description: "When on, every product must have exactly one option of this type selected — e.g. Glazing.",
      initialValue: false,
    }),
  ],
  preview: { select: { title: "name" } },
});

export const option = defineType({
  name: "option",
  title: "Option",
  type: "document",
  description: "A single shared option value (one handle, flyscreen, finish, colour…). Edit its name/price here once; every product that references it updates.",
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "slug", type: "slug", options: { source: "name" }, validation: (r) => r.required() }),
    defineField({ name: "optionType", type: "reference", to: [{ type: "optionType" }], validation: (r) => r.required() }),
    defineField({
      name: "pricingComponent",
      title: "Price",
      type: "number",
      description: "Shared surcharge for this option. Changing it reflects on every product that offers the option.",
    }),
    defineField({
      name: "hex",
      title: "Swatch (hex)",
      type: "string",
      description: "Optional colour swatch, e.g. #404141 — used for colour/finish options.",
    }),
    defineField({
      name: "isDefault",
      title: "Default choice",
      type: "boolean",
      description: "Preselected option for its type (used by 'applies to all' types like Colour).",
      initialValue: false,
    }),
    // ── Estimator technical contract (spec §4) ──
    defineField({ name: "technicalValue", title: "Technical value", type: "string",
      description: "Machine value the rules engine reads (e.g. 'toughened', 'restrictor_125mm'), distinct from the display name." }),
    // SCAFFOLD (glazing/thermal, M1/D1): glazing choices stay OPTIONS. These two
    // fields carry the glass identity for glazing options only; the machine class
    // (single_clear / double_lowe / triple_lowe …) is technicalValue, to be
    // constrained to an enum in M2. Non-glazing options leave them blank.
    defineField({ name: "glassSpecification", title: "Glass specification", type: "string",
      options: { list: [{ title: "Single glazed (SG)", value: "SG" }, { title: "Double glazed (DG)", value: "DG" }, { title: "Triple glazed (TG)", value: "TG" }] },
      description: "Glazing options only — WERS GlassSpecification." }),
    defineField({ name: "glassType", title: "Glass type", type: "string",
      options: { list: [{ title: "Clear", value: "clear" }, { title: "Toned", value: "toned" }, { title: "Low-E", value: "low_e" }] },
      description: "Glazing options only — WERS GlassType." }),
    defineField({ name: "longDisplayName", title: "Long display name", type: "string",
      description: "Glazing options — the full build-up description (WERS GlazingLongDisplayName), shown to customers." }),
    defineField({ name: "reviewRequired", title: "Requires review", type: "boolean", initialValue: false,
      description: "When set, selecting this option always routes the line to manual technical review." }),
    defineField({
      name: "compatibility", title: "Compatibility rules", type: "array",
      description: "Machine-readable predicates connecting product/config/dimensions/options. Hard-stop or manual-review.",
      of: [defineArrayMember({
        type: "object", name: "compatibilityRule",
        fields: [
          defineField({ name: "condition", title: "Condition", type: "string", description: "e.g. width>1800, family==sliding-door, requires:safety_glass." }),
          defineField({ name: "severity", title: "Severity", type: "string", initialValue: "manual_review",
            options: { list: [{ title: "Hard stop (reject)", value: "hard_stop" }, { title: "Manual review", value: "manual_review" }] } }),
          defineField({ name: "note", title: "Note", type: "string" }),
        ],
        preview: { select: { title: "condition", subtitle: "severity" } },
      })],
    }),
  ],
  preview: {
    select: { title: "name", subtitle: "optionType.name", price: "pricingComponent" },
    prepare: ({ title, subtitle, price }) => ({
      title,
      subtitle: [subtitle, price != null ? `$${price}` : null].filter(Boolean).join(" · "),
    }),
  },
});

// Per-product link to a shared option + whether it is standard or optional here.
const productOption = defineArrayMember({
  type: "object",
  name: "productOption",
  title: "Option",
  fields: [
    defineField({ name: "option", type: "reference", to: [{ type: "option" }], validation: (r) => r.required() }),
    defineField({
      name: "availability",
      type: "string",
      options: { list: ["standard", "optional"], layout: "radio" },
      initialValue: "optional",
      validation: (r) => r.required(),
    }),
  ],
  preview: {
    select: { title: "option.name", type: "option.optionType.name", availability: "availability" },
    prepare: ({ title, type, availability }) => ({
      title: title ?? "(missing option)",
      subtitle: [type, availability].filter(Boolean).join(" · "),
    }),
  },
});

const galleryImage = defineArrayMember({
  type: "image",
  name: "galleryImage",
  options: { hotspot: true },
});

// ── Estimator technical contract (CPQ Estimator spec §4) ─────────────────────
// Machine-readable fields the estimator's deterministic rules read. Kept OUT of
// prose so hard rules never depend on descriptions. Every performance value
// carries an explicit provenance flag — an ESTIMATED value must never be treated
// as a certified compliance figure (spec §13, addendum §1).

// Operation is a single intrinsic property of the FAMILY (family.operation), not
// the product — every product in a family performs the same operation, so the
// estimator reads it from the family. The former product-level Configuration
// object (operation / panel / composite) was removed in the 2026-07-31 cleanup.

// Deterministic dimensional eligibility beyond flat min/max: area, aspect and a
// versioned rule id so rule changes are auditable.
const dimensionRule = defineField({
  name: "dimensionRule",
  title: "Dimension rule (deterministic eligibility)",
  type: "object",
  group: "technical",
  options: { collapsible: true, collapsed: true },
  fields: [
    defineField({ name: "minWidthMm", type: "number", validation: (r) => r.min(100).max(20000) }),
    defineField({ name: "maxWidthMm", type: "number", validation: (r) => r.min(100).max(20000) }),
    defineField({ name: "minHeightMm", type: "number", validation: (r) => r.min(100).max(20000) }),
    defineField({ name: "maxHeightMm", type: "number", validation: (r) => r.min(100).max(20000) }),
    defineField({ name: "maxAreaM2", title: "Max area (m²)", type: "number", description: "Whole-unit area cap; blank = derive from W×H limits." }),
    defineField({ name: "maxAspectRatio", title: "Max aspect ratio", type: "number", description: "Longest/shortest side; blank = unbounded." }),
    defineField({ name: "ruleVersion", title: "Rule version", type: "string", initialValue: "v1" }),
    // Removed (2026-07-31 rationalisation — read by no code): dataSource.
  ],
});

// Whole-window energy performance. NO value here is a certified compliance figure
// unless `dataSource: certified` AND `published: true`. An ESTIMATED variant lets
// the estimator compute an assumption-based (non-compliance-certified) result.
const performanceVariant = defineArrayMember({
  type: "object",
  name: "performanceVariant",
  title: "Performance variant",
  fields: [
    defineField({ name: "variantId", title: "Variant ID", type: "string", validation: (r) => r.required() }),
    // This variant is one (frame × glass) cell: the shared glazing option is the
    // glass IDENTITY and its technicalValue is the single/double/low-e class; the
    // variant supplies the frame-specific Uw/SHGC + price. (glassBuildUp / coating
    // were removed in the 2026-07-31 rationalisation — the option owns the glass.)
    defineField({ name: "glazingOption", title: "Glazing option", type: "reference", to: [{ type: "option" }],
      description: "The shared glazing choice this variant realises — its technicalValue drives the single/double/low-e classification.",
      validation: (r) => r.required() }),
    defineField({ name: "uValue", title: "Uw (whole-window U-value)", type: "number", validation: (r) => r.min(0.5).max(10) }),
    defineField({ name: "shgc", title: "SHGC (whole-window)", type: "number", validation: (r) => r.min(0).max(1) }),
    defineField({ name: "frameType", title: "Frame type", type: "string", initialValue: "aluminium" }),
    defineField({
      name: "frameTechnology", title: "Frame technology", type: "string", initialValue: "unknown",
      options: { list: [
        { title: "Conventional", value: "conventional" },
        { title: "Thermally broken", value: "thermally_broken" },
        { title: "Unknown / not verified", value: "unknown" },
      ] },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "pricingOptionSlugs", title: "Private pricing option references", type: "array",
      of: [{ type: "string" }], options: { layout: "tags" },
      validation: (r) => r.unique(),
    }),
    defineField({ name: "dataSource", title: "Data source", type: "string", initialValue: "estimated", validation: (r) => r.required(),
      options: { list: [{ title: "Certified (AFRC/WERS/NatHERS)", value: "certified" }, { title: "Estimated from glass build-up (unverified)", value: "estimated" }] } }),
    defineField({ name: "certified", title: "Certified", type: "boolean", initialValue: false,
      description: "TRUE only for a verified AFRC/WERS/certificate figure. Estimated values MUST be false." }),
    defineField({
      name: "certificationRef", title: "Certification reference", type: "string",
      validation: (r) => r.custom((value, context) => {
        const parent = context.parent as { certified?: boolean } | undefined;
        return parent?.certified && !value ? "A certified variant requires a certification reference." : true;
      }),
    }),
    defineField({ name: "published", title: "Published (eligible for selection)", type: "boolean", initialValue: true }),
    defineField({ name: "effectiveFrom", title: "Effective from", type: "date" }),
  ],
  preview: {
    select: { title: "glazingOption.name", u: "uValue", shgc: "shgc", src: "dataSource" },
    prepare: ({ title, u, shgc, src }) => ({ title: title || "variant", subtitle: `Uw ${u ?? "?"} · SHGC ${shgc ?? "?"} · ${src}` }),
  },
});

// Content + SEO tabs on every editable record (product + page). The SEO tab is
// the `seoMeta` object below (native — no plugin, since no SEO plugin builds on
// Studio v6.5 yet). Rendered into <head> by the frontend.
const RECORD_GROUPS = [
  { name: "content", title: "Content", default: true },
  { name: "seo", title: "SEO" },
];

// Product adds a Technical tab for the estimator's machine-readable contract.
const PRODUCT_GROUPS = [
  { name: "content", title: "Content", default: true },
  { name: "glazing", title: "Glazing" }, // SCAFFOLD (M1/D1): glazing/thermal tab
  { name: "technical", title: "Technical (estimator)" },
  { name: "seo", title: "SEO" },
];

// Full SEO/social meta for a record: search meta + robots/canonical, Open Graph
// (Facebook/LinkedIn), X/Twitter cards, advanced robots directives and the
// schema.org declaration. Every field is optional and falls back gracefully —
// OG/Twitter inherit the base meta, and anything still blank inherits Site
// Settings → Default SEO (see resolveSeo in src/data/seo.ts).
//
// Site-WIDE identity (og:site_name, the @site handle, social profiles) is
// deliberately NOT here: it would be an inert field on every page. Those live
// directly on siteSettings, next to the defaults.
const SEO_GROUPS = [
  { name: "basic", title: "Basic SEO", default: true },
  { name: "og", title: "Open Graph" },
  { name: "twitter", title: "Twitter / X" },
  { name: "advanced", title: "Advanced" },
  { name: "schema", title: "Schema.org" },
];

export const seoMeta = defineType({
  name: "seoMeta",
  title: "SEO",
  type: "object",
  groups: SEO_GROUPS,
  fields: [
    // ── Basic ────────────────────────────────────────────────────────────────
    defineField({
      name: "metaTitle", title: "Meta title", type: "string", group: "basic",
      description: "≤ 60 characters recommended. Falls back to the page/product name.",
      validation: (r) => r.max(70).warning("Keep the meta title under ~60 characters."),
    }),
    defineField({
      name: "metaDescription", title: "Meta description", type: "text", rows: 3, group: "basic",
      description: "≤ 160 characters recommended.",
      validation: (r) => r.max(180).warning("Keep the meta description under ~160 characters."),
    }),
    defineField({ name: "keywords", title: "Keywords", type: "array", of: [{ type: "string" }], options: { layout: "tags" }, group: "basic" }),
    defineField({
      name: "canonicalUrl", title: "Canonical URL", type: "url", group: "basic",
      description: "Must be unique to this record. Ignored in Site Settings — one canonical across the site would de-index every page but one.",
    }),
    // ── Open Graph ───────────────────────────────────────────────────────────
    defineField({
      name: "openGraph", title: "Open Graph (Facebook, LinkedIn…)", type: "object", group: "og",
      fields: [
        defineField({ name: "title", type: "string", description: "Falls back to the meta title." }),
        defineField({ name: "description", type: "text", rows: 2, description: "Falls back to the meta description." }),
        defineField({ name: "image", title: "Share image", type: "image", options: { hotspot: true }, description: "Recommended 1200×630." }),
        defineField({
          name: "type", title: "Object type", type: "string",
          description: "og:type. Leave blank for the sensible default (article for posts, product for products, website elsewhere).",
          options: { list: [
            { title: "Website", value: "website" },
            { title: "Article", value: "article" },
            { title: "Product", value: "product" },
            { title: "Profile", value: "profile" },
          ] },
        }),
      ],
    }),
    // ── Twitter / X ──────────────────────────────────────────────────────────
    defineField({
      name: "twitter", title: "X / Twitter card", type: "object", group: "twitter",
      fields: [
        defineField({
          name: "card", title: "Card type", type: "string", initialValue: "summary_large_image",
          options: { list: [{ title: "Summary", value: "summary" }, { title: "Summary large image", value: "summary_large_image" }] },
        }),
        defineField({ name: "title", type: "string", description: "Falls back to the Open Graph / meta title." }),
        defineField({ name: "description", type: "text", rows: 2, description: "Falls back to the Open Graph / meta description." }),
        defineField({ name: "image", title: "Card image", type: "image", options: { hotspot: true }, description: "Falls back to the Open Graph image." }),
        defineField({
          name: "creator", title: "Author handle (twitter:creator)", type: "string",
          description: 'The author of THIS record, e.g. @jane. The brand handle is set once in Site Settings.',
          validation: (r) => r.regex(/^@[A-Za-z0-9_]{1,15}$/, { name: "handle" }).warning("Use the @handle form, e.g. @openframe."),
        }),
      ],
    }),
    // ── Advanced ─────────────────────────────────────────────────────────────
    // Every robots switch here is MONOTONIC at render: a page or Site Settings
    // can ADD a restriction, neither can lift one (see resolveSeo). The schema
    // stores false by default, and a plain fallback would let an untouched
    // record expose pages the app marks private.
    defineField({ name: "noIndex", title: "Hide from search engines (noindex)", type: "boolean", initialValue: false, group: "advanced" }),
    defineField({ name: "noFollow", title: "Don't follow links (nofollow)", type: "boolean", initialValue: false, group: "advanced" }),
    defineField({
      name: "advanced", title: "More robots directives", type: "object", group: "advanced",
      fields: [
        defineField({ name: "noArchive", title: "No cached copy (noarchive)", type: "boolean", initialValue: false }),
        defineField({ name: "noSnippet", title: "No text snippet (nosnippet)", type: "boolean", initialValue: false }),
        defineField({ name: "noImageIndex", title: "Don't index images (noimageindex)", type: "boolean", initialValue: false }),
        defineField({
          name: "maxSnippet", title: "Max snippet length", type: "number",
          description: "Characters. -1 for no limit. Leave blank to say nothing.",
          validation: (r) => r.min(-1),
        }),
        defineField({
          name: "maxImagePreview", title: "Max image preview", type: "string",
          options: { list: ["none", "standard", "large"] },
        }),
        defineField({
          name: "maxVideoPreview", title: "Max video preview", type: "number",
          description: "Seconds. -1 for no limit. Leave blank to say nothing.",
          validation: (r) => r.min(-1),
        }),
        defineField({
          name: "additionalMeta", title: "Additional meta tags", type: "array",
          description: "Verification tokens and one-off tags. Rendered as <meta name content>. Page entries override Site Settings entries with the same name.",
          of: [defineArrayMember({
            type: "object",
            fields: [
              defineField({ name: "name", type: "string", validation: (r) => r.required() }),
              defineField({ name: "content", type: "string", validation: (r) => r.required() }),
            ],
            preview: { select: { title: "name", subtitle: "content" } },
          })],
        }),
      ],
    }),
    // ── Schema.org ───────────────────────────────────────────────────────────
    // The JSON-LD itself is GENERATED from the record's own data (see
    // src/data/schemaOrg.ts) — editors declare what the record is, they don't
    // hand-write structured data that would drift from the content.
    defineField({
      name: "schema", title: "Structured data (schema.org)", type: "object", group: "schema",
      description: "Emitted as JSON-LD, built from this record's own fields plus the organisation details in Site Settings.",
      fields: [
        defineField({
          name: "schemaType", title: "This record is a…", type: "string", initialValue: "auto",
          description: "Leave on Automatic unless the page is a special case — products become Product, posts become Article, everything else WebPage.",
          options: { list: [
            { title: "Automatic (from record type)", value: "auto" },
            { title: "Web page", value: "WebPage" },
            { title: "Article", value: "Article" },
            { title: "Product", value: "Product" },
            { title: "About page", value: "AboutPage" },
            { title: "Contact page", value: "ContactPage" },
            { title: "FAQ page", value: "FAQPage" },
            { title: "Collection page", value: "CollectionPage" },
          ] },
        }),
        defineField({
          name: "exclude", title: "Emit no structured data for this record", type: "boolean", initialValue: false,
          description: "The site-wide organisation details still render.",
        }),
      ],
    }),
  ],
});

export const product = defineType({
  name: "product",
  title: "Product",
  type: "document",
  groups: PRODUCT_GROUPS,
  fields: [
    defineField({ name: "name", type: "string", group: "content", validation: (r) => r.required() }),
    defineField({ name: "slug", type: "slug", options: { source: "name" }, group: "content", validation: (r) => r.required() }),
    defineField({ name: "family", type: "reference", to: [{ type: "family" }], group: "content", validation: (r) => r.required() }),
    defineField({ name: "category", type: "reference", to: [{ type: "category" }], group: "content", validation: (r) => r.required() }),
    defineField({ name: "shortDescription", type: "text", rows: 2, group: "content" }),
    defineField({ name: "descriptionParagraphs", type: "array", of: [{ type: "text" }], group: "content" }),
    defineField({ name: "standardGlass", type: "string", group: "content" }),
    // Hardware / profile thickness / air / water / wind were removed in the
    // 2026-07-31 cleanup: they duplicated rows in the Specs table (which is what
    // the site's Technical details tab renders) and were read by no code. Standard
    // glass stays — the estimator reads it to detect double glazing. Size lives in
    // Technical → Dimension rule.
    defineField({ name: "notes", type: "text", rows: 2, group: "content" }),
    defineField({ name: "heroImage", title: "Hero image", type: "image", options: { hotspot: true }, group: "content" }),
    defineField({ name: "gallery", type: "array", of: [galleryImage], group: "content" }),
    defineField({ name: "keySpecs", type: "array", of: [specRow], group: "content" }),
    defineField({ name: "specs", type: "array", of: [specRow], group: "content" }),
    defineField({
      name: "options", title: "Options", type: "array", of: [productOption], group: "content",
      description: "Shared options offered on this product, each marked standard or optional.",
    }),
    defineField({ name: "featuredOrder", type: "number", group: "content" }),
    // ── Glazing / thermal (SCAFFOLD M1/D5) ──
    // The glazings this product offers + their whole-window Uw/SHGC/stars come from
    // its FRAME's shared thermal profile. Hardware-twin products share one profile.
    // The estimator switches to reading via this ref in M2; `performanceVariants`
    // below is the legacy per-product matrix, kept until the WERS import + M2 land.
    defineField({ name: "thermalProfile", title: "Thermal profile (frame)", type: "reference", to: [{ type: "thermalProfile" }], group: "glazing",
      description: "The manufacturer frame this product is built on — supplies its glazing choices and WERS Uw/SHGC/stars." }),
    // ── Estimator technical contract (spec §4) ──
    dimensionRule,
    defineField({ name: "performanceVariants", title: "Performance variants (legacy)", type: "array", of: [performanceVariant], group: "technical",
      validation: (r) => r.unique(),
      description: "LEGACY — being replaced by the shared Thermal profile (Glazing tab). Whole-window Uw/SHGC per glass build-up." }),
    defineField({ name: "pricingRef", title: "Pricing ref", type: "string", group: "technical",
      description: "Key into the PRIVATE D1 rate card. Pricing itself is never stored in Sanity." }),
    defineField({ name: "schemaVersion", title: "Estimator schema version", type: "number", group: "technical", initialValue: 1,
      readOnly: true,
      description: "System field — the estimator's technical-contract version. Managed in code (bumped by a migration when the contract shape changes); not editable here." }),
    defineField({ name: "seo", title: "SEO", type: "seoMeta", group: "seo" }),
  ],
  preview: { select: { title: "name", subtitle: "family.name", media: "heroImage" } },
});

// Static site pages — a Sanity-managed hero image (with focal point) + SEO. The
// page body stays in the app; only the hero and meta are editable here.
export const page = defineType({
  name: "page",
  title: "Page",
  type: "document",
  groups: RECORD_GROUPS,
  fields: [
    // Free-text slug, NOT a closed list: a fixed dropdown meant a record could
    // only ever be created for a page that already existed, so a new page could
    // never be prepared here. The slug is matched at render time — a record for
    // a slug the site doesn't serve yet is simply dormant until it does, which
    // is what lets content be authored ahead of the page shipping.
    defineField({
      name: "pageId", title: "Page slug", type: "string", group: "content",
      description: "The page's URL path without the leading slash — products, how-it-works, contact. Use \"home\" for the front page. Content applies once a page with this slug is served.",
      validation: (r) => r.required().lowercase().custom(async (v, context) => {
        if (typeof v !== "string" || !v) return true;
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) {
          return "Use lowercase letters, numbers and hyphens only — no slashes or spaces.";
        }
        // The slug is the join key: rendering resolves it with a first-match
        // lookup, so a second record claiming the same slug would silently win
        // or lose depending on query order. Reject it at authoring time rather
        // than leave an unexplained page. A record and its own draft are the
        // same page, hence both ids are excluded.
        const published = (context.document?._id ?? "").replace(/^drafts\./, "");
        const taken = await context
          .getClient({ apiVersion: "2024-01-01" })
          .fetch<boolean>(
            `defined(*[_type == "page" && pageId == $slug && !(_id in [$published, "drafts." + $published])][0]._id)`,
            { slug: v, published },
          );
        return taken ? `Another page record already uses "${v}". Each slug drives one page.` : true;
      }),
    }),
    defineField({ name: "title", title: "Page name", type: "string", group: "content", description: "Label for this record in the Studio only.", validation: (r) => r.required() }),
    defineField({
      name: "heroImage", title: "Hero image", type: "image", options: { hotspot: true }, group: "content",
      description: "Served by Sanity; drag the hotspot to set the focal point.",
    }),
    defineField({ name: "seo", title: "SEO", type: "seoMeta", group: "seo" }),
  ],
  preview: { select: { title: "title", subtitle: "pageId", media: "heroImage" } },
});

// Australia-wide AMJ showroom the customer can request an appointment at. Drives
// the Contact page's location list AND the map pin (suburb centroid). Suburb-level
// only — deliberately NO street address and NO contact email (data-security:
// manufacturer routing is configured at the env level, not per record).
export const showroomLocation = defineType({
  name: "showroomLocation",
  title: "Showroom location",
  type: "document",
  fields: [
    defineField({
      name: "stateCode", title: "State", type: "string",
      options: { list: ["VIC", "NSW", "WA", "QLD", "SA", "TAS", "NT", "ACT"] },
      validation: (r) => r.required(),
    }),
    defineField({ name: "suburb", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "displayName", title: "Display name", type: "string",
      description: 'Shown to customers, e.g. "Rowville, VIC". Defaults to "{suburb}, {state}" if blank.',
    }),
    defineField({ name: "lat", title: "Latitude", type: "number", description: "Suburb centroid — for the map pin. NOT the exact street address.", validation: (r) => r.required().min(-90).max(90) }),
    defineField({ name: "lng", title: "Longitude", type: "number", validation: (r) => r.required().min(-180).max(180) }),
    defineField({ name: "appointmentAvailable", title: "Appointments available", type: "boolean", initialValue: true }),
    defineField({
      name: "status", type: "string", initialValue: "active",
      options: { list: [
        { title: "Active", value: "active" },
        { title: "Inactive", value: "inactive" },
        { title: "Pending verification", value: "pending_verification" },
      ] },
      description: "Only 'active' locations are offered for new appointment requests.",
      validation: (r) => r.required(),
    }),
    defineField({ name: "historicalAliases", title: "Historical aliases", type: "array", of: [{ type: "string" }], description: "Former suburb names, for matching old records (e.g. Belmont for WA)." }),
  ],
  preview: { select: { title: "displayName", subtitle: "status", state: "stateCode", suburb: "suburb" }, prepare: ({ title, subtitle, state, suburb }: any) => ({ title: title || [suburb, state].filter(Boolean).join(", "), subtitle }) },
});

// ── Site Settings — a single editable document for global site config ────────
// Tabbed groups keep the four concerns (identity, maintenance toggle, the two
// system pages) separate. Field NAMES are unique document-wide (Sanity requires
// it) even where TITLES repeat across tabs (Heading/Message on both pages).
const SITE_SETTINGS_GROUPS = [
  { name: "general", title: "General", default: true },
  { name: "seo", title: "SEO Defaults" },
  { name: "maintenanceMode", title: "Maintenance Mode" },
  { name: "maintenancePage", title: "Maintenance Page" },
  { name: "errorPage", title: "Error Page" },
];

export const siteSettings = defineType({
  name: "siteSettings",
  title: "Site Settings",
  type: "document",
  groups: SITE_SETTINGS_GROUPS,
  fields: [
    // General
    defineField({ name: "businessName", title: "Business Name", type: "string", group: "general" }),
    defineField({ name: "tagline", title: "Tagline", type: "string", group: "general" }),
    defineField({ name: "phone", title: "Phone", type: "string", group: "general" }),
    defineField({ name: "email", title: "Email", type: "string", group: "general", validation: (r) => r.email() }),
    defineField({ name: "workingHours", title: "Working Hours", type: "text", rows: 3, group: "general" }),
    defineField({ name: "copyrightText", title: "Copyright Text", type: "string", group: "general" }),
    defineField({ name: "legalLine", title: "Legal Line (ABN)", type: "string", group: "general" }),
    defineField({ name: "logo", title: "Logo", type: "image", options: { hotspot: true }, group: "general" }),
    defineField({ name: "favicon", title: "Favicon", type: "image", group: "general" }),
    defineField({ name: "businessImage", title: "Business Image (search results)", type: "image", group: "general" }),
    defineField({ name: "searchLogo", title: "Logo (search results)", type: "image", group: "general" }),
    // SEO Defaults — the same seoMeta object the pages and products use, applied
    // field by field wherever the page itself leaves a value blank. Two fields
    // behave differently by design and say so in the description:
    //   • Canonical URL is page-only. A site-wide canonical would point every
    //     page at one URL, which de-indexes the rest of the site.
    //   • noindex/nofollow here can only ADD a restriction, never lift one, so a
    //     stored `false` can't expose the pages the app marks as private.
    defineField({
      name: "seo", title: "Default SEO", type: "seoMeta", group: "seo",
      description: "Used for any page that leaves a field blank, field by field. Canonical URL is ignored here — it must be unique per page. Ticking any robots switch applies site-wide; leaving them unticked lets each page decide.",
    }),
    // Site-WIDE identity. These are one-per-site by nature, so they sit here
    // rather than on seoMeta where they would be inert on every page.
    defineField({
      name: "ogSiteName", title: "Site name (og:site_name)", type: "string", group: "seo",
      description: "Shown by Facebook/LinkedIn above the share title. Defaults to Business Name.",
    }),
    defineField({
      name: "twitterSite", title: "Brand handle (twitter:site)", type: "string", group: "seo",
      description: "The company account, e.g. @openframe. Per-record author handles are set on the record itself.",
      validation: (r) => r.regex(/^@[A-Za-z0-9_]{1,15}$/, { name: "handle" }).warning("Use the @handle form, e.g. @openframe."),
    }),
    defineField({
      name: "socialProfiles", title: "Social profiles", type: "array", of: [{ type: "url" }], group: "seo",
      description: "Full profile URLs. Published as schema.org sameAs, which is how search engines tie these accounts to the business.",
    }),
    defineField({
      name: "organizationType", title: "Organisation type", type: "string", group: "seo", initialValue: "Organization",
      description: "The schema.org type published for the business itself.",
      options: { list: [
        { title: "Organization", value: "Organization" },
        { title: "Local business", value: "LocalBusiness" },
        { title: "Corporation", value: "Corporation" },
      ] },
    }),
    // Maintenance Mode
    defineField({ name: "maintenanceEnabled", title: "Enable Maintenance Mode", type: "boolean", group: "maintenanceMode", initialValue: false }),
    // Maintenance Page
    defineField({ name: "maintenanceHeading", title: "Heading", type: "string", group: "maintenancePage" }),
    defineField({ name: "maintenanceMessage", title: "Message", type: "text", rows: 3, group: "maintenancePage" }),
    defineField({ name: "maintenanceShowContact", title: "Show contact details", type: "boolean", group: "maintenancePage", initialValue: false }),
    defineField({ name: "maintenanceBackground", title: "Background image", type: "image", group: "maintenancePage" }),
    // Error Page
    defineField({ name: "errorHeading", title: "Heading", type: "string", group: "errorPage" }),
    defineField({ name: "errorMessage", title: "Message", type: "text", rows: 3, group: "errorPage" }),
    defineField({ name: "errorButtonLabel", title: "Button label", type: "string", group: "errorPage" }),
    defineField({ name: "errorBackground", title: "Background image", type: "image", group: "errorPage" }),
  ],
  preview: { prepare: () => ({ title: "Site Settings" }) },
});

// ─── Posts (the Resources section) ────────────────────────────────────────────
// A post is an article that may also carry one attachment. It covers editorial
// writing, how-to guides and technical documentation alike — one document type,
// because in this model every record has a readable body. A record that is only
// a file is a file, and belongs on a product.
//
// ONE taxonomy: category. An earlier version split "kind" (what it is) from
// "topic" (what it is about); two axes over a handful of posts was complexity
// nobody asked for, and it is gone.
//
// Categories are DOCUMENTS, not a list in code, so they are added, renamed and
// reordered in Studio without a deploy. A reference also cannot drift the way a
// free-text field does: an author picks an existing category, they cannot invent
// "How-to" beside "Howto".

const POST_GROUPS = [
  { name: "content", title: "Content", default: true },
  { name: "file", title: "Attachment" },
  { name: "seo", title: "SEO" },
];

export const postCategory = defineType({
  name: "postCategory",
  title: "Category",
  type: "document",
  fields: [
    defineField({
      name: "title", title: "Title", type: "string",
      description: "Singular, as it appears on a post — \"Guide\", \"Technical document\".",
      validation: (r) => r.required().max(30),
    }),
    defineField({
      name: "slug", title: "Slug", type: "slug", options: { source: "title", maxLength: 40 },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "order", title: "Order", type: "number",
      description: "Lower numbers appear first in the filter. Ties fall back to title.",
    }),
    defineField({
      name: "description", title: "Description", type: "text", rows: 2,
      description: "Shown under the index heading when this category is selected. Optional.",
    }),
    // Technical documentation ages differently from a post, so the date rule is
    // a property of the category rather than something hardcoded per page.
    defineField({
      name: "dateDisplay", title: "Date shown", type: "string",
      options: {
        list: [
          { title: "Published date — for posts, where currency is the point", value: "published" },
          { title: "Updated date — for guides, which are maintained rather than dated", value: "updated" },
          { title: "No date — for documents, where the attachment's own revision is the date that counts", value: "none" },
        ],
        layout: "radio",
      },
      initialValue: "updated",
      validation: (r) => r.required(),
    }),
    // A marketing post that mentions a product must not put a download row on
    // that product's page. Rather than hardcode which categories may do that,
    // the category carries the permission.
    defineField({
      name: "allowsProducts", title: "Can be linked to products", type: "boolean",
      description: "When on, a post in this category may name products, and its attachment then appears in each product's Downloads tab. Leave off for editorial categories — a post that merely mentions a product should link to it in the text.",
      initialValue: true,
    }),
  ],
  orderings: [{ title: "Order", name: "order", by: [{ field: "order", direction: "asc" }, { field: "title", direction: "asc" }] }],
  preview: { select: { title: "title", subtitle: "slug.current" } },
});

// The downloadable file. An OBJECT rather than a bare file field, because a
// trade reader decides whether to click from the metadata, not the filename:
// what kind of document it is, which revision, and what it weighs.
export const postAttachment = defineType({
  name: "postAttachment",
  title: "Attachment",
  type: "object",
  fields: [
    defineField({ name: "file", title: "File", type: "file", validation: (r) => r.required() }),
    defineField({
      name: "label", title: "Label", type: "string",
      description: "What this document is, in the reader's words — \"AMJ80 sliding window data sheet\". Not the filename.",
      validation: (r) => r.required().max(80),
    }),
    defineField({
      name: "docType", title: "Document type", type: "string",
      options: {
        list: [
          { title: "Data sheet", value: "datasheet" },
          { title: "Installation guide", value: "installation" },
          { title: "CAD / detail drawing", value: "cad" },
          { title: "Test report", value: "test-report" },
          { title: "Warranty", value: "warranty" },
          { title: "Certificate", value: "certificate" },
          { title: "Care & maintenance", value: "maintenance" },
        ],
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "revision", title: "Revision", type: "string",
      description: "The document's own revision or issue, if it carries one — \"Rev C\", \"Issue 2\". Shown beside the file so a reader can tell whether they already have it.",
    }),
    defineField({
      name: "revisedAt", title: "Revision date", type: "date",
      description: "The date printed on the document, not the date it was uploaded.",
    }),
    defineField({
      name: "standardRef", title: "Standard", type: "string",
      description: "The standard this document relates to — AS 2047:2014, AS 1288, NCC 2022 Section J. The single most useful token for a certifier scanning a list.",
    }),
    // This is what pays for linking a product STRAIGHT to a file: a file opens in
    // a viewer with no page around it to carry a scope caveat, so the caveat has
    // to travel on the row, before the click.
    defineField({
      name: "note", title: "Scope note", type: "text", rows: 2,
      description: "A caveat a reader needs BEFORE downloading — \"Covers frames to 2100mm high\". Not a description of the document.",
      validation: (r) => r.max(160),
    }),
  ],
  preview: { select: { title: "label", subtitle: "docType" } },
});

export const post = defineType({
  name: "post",
  title: "Post",
  type: "document",
  groups: POST_GROUPS,
  fields: [
    defineField({ name: "title", title: "Title", type: "string", group: "content", validation: (r) => r.required() }),
    defineField({
      name: "slug", title: "Slug", type: "slug", group: "content",
      options: { source: "title", maxLength: 80 },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "summary", title: "Summary", type: "text", rows: 2, group: "content",
      description: "One or two sentences. This is the whole of what a reader sees on the index, so lead with what the post ANSWERS — not what it is about.",
      validation: (r) => r.required().max(180),
    }),
    defineField({
      name: "category", title: "Category", type: "reference", to: [{ type: "postCategory" }],
      group: "content", validation: (r) => r.required(),
      description: "Add and rename categories under Category.",
    }),
    defineField({
      name: "products", title: "Applies to products", type: "array",
      of: [{ type: "reference", to: [{ type: "product" }] }], group: "content",
      validation: (r) => r.unique(),
      description: "Only for categories that allow it. A product's Downloads tab links to this post's ATTACHMENT, so naming a product here means the post needs one.",
    }),
    defineField({
      name: "heroImage", title: "Hero image", type: "image",
      options: { hotspot: true }, group: "content",
      description: "Optional. Without one the post opens on its title over the site's dark ground rather than a photograph.",
    }),
    // Deliberately a SMALL block set. An unconstrained editor is how a content
    // system stops matching its design language — every extra style is a way for
    // a post to stop looking like the site.
    //
    // Mandatory, always. A post is an ARTICLE first; this is what makes
    // /resources/<slug> worth having as a URL at all.
    defineField({
      name: "body", title: "Body", type: "array", group: "content",
      validation: (r) => r.required().min(1),
      of: [
        {
          type: "block",
          styles: [
            { title: "Paragraph", value: "normal" },
            { title: "Heading", value: "h2" },
            { title: "Subheading", value: "h3" },
          ],
          lists: [{ title: "Bullet", value: "bullet" }, { title: "Numbered", value: "number" }],
          marks: {
            decorators: [{ title: "Bold", value: "strong" }, { title: "Emphasis", value: "em" }],
            annotations: [
              {
                name: "link", type: "object", title: "Link",
                fields: [{ name: "href", type: "url", title: "URL", validation: (r: any) => r.required() }],
              },
            ],
          },
        },
        {
          type: "image", options: { hotspot: true },
          fields: [
            { name: "alt", type: "string", title: "Alt text", validation: (r: any) => r.required() },
            { name: "caption", type: "string", title: "Caption" },
          ],
        },
      ],
    }),
    // ONE attachment, not a list — the owner's model, and the reason a product
    // can link straight to the file: one post, one document.
    defineField({
      name: "attachment", title: "Attachment", type: "postAttachment", group: "file",
      description: "The file this post hosts. Optional — unless the post names a product, because a product's Downloads tab links to the FILE, and a post with none would put a row there with nothing behind it.",
    }),
    defineField({
      name: "publishedAt", title: "Published", type: "date", group: "content",
      description: "Used for ordering. An unset date sorts last.",
    }),
    defineField({
      name: "updatedAt", title: "Last reviewed", type: "date", group: "content",
      description: "The date you last checked this is still true — not the date you fixed a typo. Shown as \"Updated\" on categories set to show it.",
    }),
    defineField({ name: "seo", title: "SEO", type: "seoMeta", group: "seo" }),
  ],
  // Body is required by its own field rule. This enforces the rest of the model.
  validation: (r) =>
    r.custom(async (doc: any, ctx: any) => {
      if (!doc?.products?.length) return true;
      if (!doc?.attachment?.file) {
        return "This post is linked to a product, so it needs an attachment — a product's Downloads tab links to the file, not to the article.";
      }
      const categoryId = doc?.category?._ref;
      if (!categoryId) return true;
      const category = await ctx.getClient({ apiVersion: "2024-01-01" })
        .fetch(`*[_id in [$id, "drafts." + $id]][0]{title, allowsProducts}`, { id: categoryId });
      if (category && category.allowsProducts === false) {
        return `A "${category.title}" cannot be linked to products — its attachment would appear in the product's Downloads tab. Link to the product in the body text instead, or change the category.`;
      }
      return true;
    }),
  orderings: [
    { title: "Newest", name: "newest", by: [{ field: "publishedAt", direction: "desc" }] },
    { title: "Title", name: "title", by: [{ field: "title", direction: "asc" }] },
  ],
  preview: {
    select: { title: "title", category: "category.title", media: "heroImage" },
    prepare: ({ title, category, media }: any) => ({ title, subtitle: category, media }),
  },
});

// ── Email templates — editable transactional email copy ──────────────────────
// One document per email the platform sends. Editors change the Subject and Body;
// the Worker fills [placeholders] like [name] or [ref] with live values at send
// time. The document _id is the key the Worker looks the template up by.
export const emailTemplate = defineType({
  name: "emailTemplate",
  title: "Email template",
  type: "document",
  fields: [
    defineField({
      name: "title", title: "Name", type: "string",
      description: "Which email this is (shown in the list).",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "subject", title: "Subject", type: "string",
      description: "The email subject line. [placeholders] like [name] are filled in when the email is sent.",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "body", title: "Body", type: "text", rows: 14,
      description: "The email body. Use [placeholders] like [name] or [ref] where live values should appear. A blank line starts a new paragraph.",
      validation: (r) => r.required(),
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "subject" },
  },
});

// ── SCAFFOLD (glazing/thermal, M1 / D5) — shared per-frame thermal profile ────
// One document per manufacturer WERS "frame" (series × operation, e.g. "AMJ80
// Awning"): holds that frame's glazing × thermal matrix. Products reference their
// frame's profile (product.thermalProfile), so hardware-twin products that share
// a frame do not duplicate the matrix. Uw/SHGC/stars are PUBLIC WERS certificate
// data and live here in the public catalogue; the glass PRICE stays private in D1.
const thermalProfileRow = defineArrayMember({
  type: "object",
  name: "thermalProfileRow",
  title: "Glazing row",
  fields: [
    defineField({ name: "glazing", title: "Glazing", type: "reference", to: [{ type: "option" }], validation: (r) => r.required(),
      description: "The glazing option this row rates (a shared option under the glazing type)." }),
    defineField({ name: "uValue", title: "Uw", type: "number", validation: (r) => r.min(0.5).max(10) }),
    defineField({ name: "shgc", title: "SHGC", type: "number", validation: (r) => r.min(0).max(1) }),
    defineField({ name: "tvw", title: "Tvw", type: "number", validation: (r) => r.min(0).max(1) }),
    defineField({ name: "heatingStars", title: "Heating stars", type: "number", validation: (r) => r.min(0).max(10) }),
    defineField({ name: "coolingStars", title: "Cooling stars", type: "number", validation: (r) => r.min(0).max(10) }),
    defineField({ name: "heatingPercentage", title: "Heating %", type: "number" }),
    defineField({ name: "coolingPercentage", title: "Cooling %", type: "number" }),
    defineField({ name: "airInfiltration", title: "Air infiltration", type: "number" }),
    defineField({ name: "wersWindowId", title: "WERS window id", type: "string", description: "Provenance — WERS WindowId." }),
    defineField({ name: "certified", title: "Certified", type: "boolean", initialValue: true }),
    defineField({ name: "certificationRef", title: "Certification ref", type: "string" }),
    defineField({ name: "published", title: "Published (eligible for selection)", type: "boolean", initialValue: true }),
  ],
  preview: {
    select: { title: "glazing.name", u: "uValue", shgc: "shgc" },
    prepare: ({ title, u, shgc }: any) => ({ title: title || "glazing", subtitle: `Uw ${u ?? "?"} · SHGC ${shgc ?? "?"}` }),
  },
});

export const thermalProfile = defineType({
  name: "thermalProfile",
  title: "Thermal profile (frame)",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Frame", type: "string", validation: (r) => r.required(),
      description: 'The manufacturer frame this profile rates, e.g. "AMJ80 Awning" (WERS FrameDescription = series × operation).' }),
    defineField({ name: "slug", type: "slug", options: { source: "name" }, validation: (r) => r.required() }),
    defineField({ name: "frameTechnology", title: "Frame technology", type: "string", initialValue: "unknown",
      options: { list: [{ title: "Conventional", value: "conventional" }, { title: "Thermally broken", value: "thermally_broken" }, { title: "Unknown", value: "unknown" }] } }),
    defineField({ name: "rows", title: "Glazing rows", type: "array", of: [thermalProfileRow], validation: (r) => r.unique(),
      description: "One row per glazing this frame is rated for — the WERS matrix for this frame." }),
  ],
  preview: {
    select: { title: "name", rows: "rows" },
    prepare: ({ title, rows }: any) => ({ title, subtitle: `${(rows || []).length} glazings` }),
  },
});

export const schemaTypes = [category, family, optionType, option, product, page, seoMeta, showroomLocation, siteSettings, postCategory, postAttachment, post, emailTemplate, thermalProfile];
