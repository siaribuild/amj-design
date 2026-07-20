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

export const product = defineType({
  name: "product",
  title: "Product",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "slug", type: "slug", options: { source: "name" }, validation: (r) => r.required() }),
    defineField({ name: "family", type: "reference", to: [{ type: "family" }], validation: (r) => r.required() }),
    defineField({ name: "category", type: "reference", to: [{ type: "category" }], validation: (r) => r.required() }),
    defineField({ name: "shortDescription", type: "text", rows: 2 }),
    defineField({ name: "descriptionParagraphs", type: "array", of: [{ type: "text" }] }),
    defineField({ name: "standardGlass", type: "string" }),
    defineField({ name: "hardware", type: "string" }),
    defineField({ name: "minWidth", type: "number" }),
    defineField({ name: "minHeight", type: "number" }),
    defineField({ name: "maxWidth", type: "number" }),
    defineField({ name: "maxHeight", type: "number" }),
    defineField({ name: "profileThickness", type: "string" }),
    defineField({ name: "airTightness", type: "string" }),
    defineField({ name: "waterTightness", type: "string" }),
    defineField({ name: "windPressure", type: "string" }),
    defineField({ name: "notes", type: "text", rows: 2 }),
    defineField({ name: "heroImage", title: "Hero image", type: "image", options: { hotspot: true } }),
    defineField({ name: "gallery", type: "array", of: [galleryImage] }),
    defineField({ name: "keySpecs", type: "array", of: [specRow] }),
    defineField({ name: "specs", type: "array", of: [specRow] }),
    defineField({
      name: "options",
      title: "Options",
      type: "array",
      of: [productOption],
      description: "Shared options offered on this product, each marked standard or optional.",
    }),
    defineField({ name: "featuredOrder", type: "number" }),
  ],
  preview: { select: { title: "name", subtitle: "family.name", media: "heroImage" } },
});

export const schemaTypes = [category, family, optionType, option, product];
