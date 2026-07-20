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

// Content + SEO tabs on every editable record (product + page). The SEO tab is
// the `seoMeta` object below (native — no plugin, since no SEO plugin builds on
// Studio v6.5 yet). Rendered into <head> by the frontend.
const RECORD_GROUPS = [
  { name: "content", title: "Content", default: true },
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
  groups: RECORD_GROUPS,
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
    defineField({ name: "title", title: "Page name", type: "string", group: "content", validation: (r) => r.required() }),
    defineField({
      name: "pageId", title: "Page", type: "string", group: "content",
      description: "Which site page this record drives.",
      options: {
        list: [
          { title: "Home", value: "home" },
          { title: "Products (listing)", value: "products" },
          { title: "How it works", value: "how-it-works" },
          { title: "Contact", value: "contact" },
          { title: "Privacy", value: "privacy" },
        ],
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "heroImage", title: "Hero image", type: "image", options: { hotspot: true }, group: "content",
      description: "Served by Sanity; drag the hotspot to set the focal point.",
    }),
    defineField({ name: "seo", title: "SEO", type: "seoMeta", group: "seo" }),
  ],
  preview: { select: { title: "title", subtitle: "pageId", media: "heroImage" } },
});

export const schemaTypes = [category, family, optionType, option, product, page, seoMeta];
