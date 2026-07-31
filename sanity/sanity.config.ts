// Sanity Studio config. Run the studio with `npx sanity dev` from this folder
// after setting projectId/dataset (see sanity/README.md).
import { defineConfig } from "sanity";
import { structureTool, type StructureBuilder } from "sanity/structure";
import { schemaTypes } from "./schemaTypes";

// Site Settings is a singleton: one fixed document, pinned to the top of the left
// menu, and removed from the auto-generated document-type list so it can't be
// duplicated. Pages sit directly beneath it — they are edited far more often than
// the catalogue types, which otherwise pushed them to the bottom of the list.
// Email templates get their own top-level entry too (transactional email copy is
// a distinct editing job from the catalogue), so they are also excluded from the
// auto-generated list below.
const PINNED = ["siteSettings", "page", "emailTemplate"];

const structure = (S: StructureBuilder) =>
  S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Site Settings")
        .id("siteSettings")
        .child(S.document().schemaType("siteSettings").documentId("siteSettings")),
      ...S.documentTypeListItems().filter((li) => li.getId() === "page"),
      S.divider(),
      S.listItem()
        .title("Email Templates")
        .id("emailTemplates")
        .child(
          S.documentTypeList("emailTemplate")
            .title("Email Templates")
            .defaultOrdering([{ field: "audience", direction: "asc" }, { field: "title", direction: "asc" }]),
        ),
      S.divider(),
      ...S.documentTypeListItems().filter((li) => !PINNED.includes(li.getId() ?? "")),
    ]);

export default defineConfig({
  name: "apertly-catalogue",
  title: "OpenFrame Catalogue",
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || "xjtrm1ex",
  dataset: process.env.SANITY_STUDIO_DATASET || "production",
  plugins: [structureTool({ structure })],
  schema: { types: schemaTypes },
});
