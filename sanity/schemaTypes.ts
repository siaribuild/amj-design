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

// Structured operation/panel/composite model — replaces inferring operation from
// the family name. Maps schedule terms (fixed, awning, sliding, stacker, hinged…).
const configuration = defineField({
  name: "configuration",
  title: "Configuration (operation / panel / composite)",
  type: "object",
  group: "technical",
  options: { collapsible: true, collapsed: false },
  fields: [
    defineField({ name: "operationTypes", title: "Operation types", type: "array", of: [{ type: "string" }],
      options: { list: ["fixed", "awning", "casement", "sliding", "stacker", "bi-fold", "hinged", "pivot", "louvre", "double-hung", "tilt-turn", "lift-slide"] },
      description: "One or more operations this product supports." }),
    defineField({ name: "panelPattern", title: "Panel / leaf pattern", type: "string", description: "e.g. OX, XO, OXXO — O fixed, X operable." }),
    defineField({ name: "openingDirection", title: "Opening direction", type: "string", options: { list: ["inward", "outward", "sliding", "n/a"] } }),
    defineField({ name: "isCompositeMember", title: "Can be a composite member", type: "boolean", initialValue: false,
      description: "True when this product can be one leaf of a larger composite frame (e.g. awning+fixed+awning)." }),
    defineField({ name: "compositePattern", title: "Composite pattern", type: "string", description: "e.g. awning_fixed_awning. Blank for standalone units." }),
    defineField({ name: "dataSource", title: "Data source", type: "string", initialValue: "estimated",
      options: { list: [{ title: "Certified / verified", value: "certified" }, { title: "Estimated (unverified)", value: "estimated" }] } }),
  ],
});

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
    defineField({ name: "dataSource", title: "Data source", type: "string", initialValue: "estimated",
      options: { list: [{ title: "Certified / verified", value: "certified" }, { title: "Estimated (unverified)", value: "estimated" }] } }),
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
    defineField({ name: "glassBuildUp", title: "Glass build-up", type: "string", description: "e.g. 5+12A+5mm Double Tempered, 6mm Low-e+25Ar+6mm." }),
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
    defineField({ name: "coating", title: "Coating", type: "string" }),
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
    select: { title: "glassBuildUp", u: "uValue", shgc: "shgc", src: "dataSource" },
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
  { name: "technical", title: "Technical (estimator)" },
  { name: "seo", title: "SEO" },
];

// Full SEO/social meta for a record: search meta + robots/canonical, Open Graph
// (Facebook/LinkedIn) and X/Twitter cards. Every field is optional and falls back
// gracefully (OG/Twitter title/description/image inherit from the base meta).
export const seoMeta = defineType({
  name: "seoMeta",
  title: "SEO",
  type: "object",
  fields: [
    defineField({
      name: "metaTitle", title: "Meta title", type: "string",
      description: "≤ 60 characters recommended. Falls back to the page/product name.",
      validation: (r) => r.max(70).warning("Keep the meta title under ~60 characters."),
    }),
    defineField({
      name: "metaDescription", title: "Meta description", type: "text", rows: 3,
      description: "≤ 160 characters recommended.",
      validation: (r) => r.max(180).warning("Keep the meta description under ~160 characters."),
    }),
    defineField({ name: "keywords", title: "Keywords", type: "array", of: [{ type: "string" }], options: { layout: "tags" } }),
    defineField({ name: "canonicalUrl", title: "Canonical URL", type: "url" }),
    defineField({ name: "noIndex", title: "Hide from search engines (noindex)", type: "boolean", initialValue: false }),
    defineField({ name: "noFollow", title: "Don't follow links (nofollow)", type: "boolean", initialValue: false }),
    defineField({
      name: "openGraph", title: "Open Graph (Facebook, LinkedIn…)", type: "object",
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({ name: "title", type: "string", description: "Falls back to the meta title." }),
        defineField({ name: "description", type: "text", rows: 2, description: "Falls back to the meta description." }),
        defineField({ name: "image", title: "Share image", type: "image", options: { hotspot: true }, description: "Recommended 1200×630." }),
      ],
    }),
    defineField({
      name: "twitter", title: "X / Twitter card", type: "object",
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({
          name: "card", title: "Card type", type: "string", initialValue: "summary_large_image",
          options: { list: [{ title: "Summary", value: "summary" }, { title: "Summary large image", value: "summary_large_image" }] },
        }),
        defineField({ name: "title", type: "string", description: "Falls back to the Open Graph / meta title." }),
        defineField({ name: "description", type: "text", rows: 2, description: "Falls back to the Open Graph / meta description." }),
        defineField({ name: "image", title: "Card image", type: "image", options: { hotspot: true }, description: "Falls back to the Open Graph image." }),
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
    defineField({ name: "hardware", type: "string", group: "content" }),
    defineField({ name: "minWidth", type: "number", group: "content" }),
    defineField({ name: "minHeight", type: "number", group: "content" }),
    defineField({ name: "maxWidth", type: "number", group: "content" }),
    defineField({ name: "maxHeight", type: "number", group: "content" }),
    defineField({ name: "profileThickness", type: "string", group: "content" }),
    defineField({ name: "airTightness", type: "string", group: "content" }),
    defineField({ name: "waterTightness", type: "string", group: "content" }),
    defineField({ name: "windPressure", type: "string", group: "content" }),
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
    // ── Estimator technical contract (spec §4) ──
    configuration,
    dimensionRule,
    defineField({ name: "performanceVariants", title: "Performance variants", type: "array", of: [performanceVariant], group: "technical",
      validation: (r) => r.unique(),
      description: "Whole-window Uw/SHGC per glass build-up. Estimated values must be dataSource:estimated / certified:false." }),
    defineField({ name: "pricingRef", title: "Pricing ref", type: "string", group: "technical",
      description: "Key into the PRIVATE D1 rate card. Pricing itself is never stored in Sanity." }),
    defineField({ name: "schemaVersion", title: "Estimator schema version", type: "number", group: "technical", initialValue: 1,
      description: "Bump when the technical contract shape changes so the Worker can reject unsupported shapes." }),
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

export const schemaTypes = [category, family, optionType, option, product, page, seoMeta, showroomLocation, siteSettings];
