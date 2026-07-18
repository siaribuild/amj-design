// Sanity content model for the AMJ catalogue. Mirrors src/data/catalogue.ts so
// migrating is a data import + swapping the selectors to GROQ (see docs).
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

export const productOption = defineArrayMember({
  type: "object",
  name: "productOption",
  fields: [
    defineField({ name: "typeSlug", type: "string" }),
    defineField({ name: "typeName", type: "string" }),
    defineField({ name: "name", type: "string" }),
    defineField({ name: "availability", type: "string", options: { list: ["standard", "optional"] } }),
    defineField({ name: "hex", type: "string" }),
  ],
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
    defineField({ name: "heroImage", type: "string" }),
    defineField({ name: "gallery", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "keySpecs", type: "array", of: [specRow] }),
    defineField({ name: "specs", type: "array", of: [specRow] }),
    defineField({ name: "options", type: "array", of: [productOption] }),
    defineField({ name: "featuredOrder", type: "number" }),
  ],
});

export const colour = defineType({
  name: "colour",
  title: "Colorbond colour",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "hex", type: "string" }),
    defineField({ name: "availability", type: "string", options: { list: ["standard", "optional"] } }),
  ],
});

export const schemaTypes = [category, family, product, colour];
