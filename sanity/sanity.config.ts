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
            .defaultOrdering([{ field: "title", direction: "asc" }]),
        ),
      S.divider(),
      ...S.documentTypeListItems().filter((li) => !PINNED.includes(li.getId() ?? "")),
    ]);

// Same fail-closed guard as sanity.cli.ts, and for the same reason: no Studio
// command may target an implicit project or an implicit dataset.
//
// The fallbacks that used to live below were added to let the Studio "run without
// SANITY_STUDIO_PROJECT_ID set" — a goal they could never achieve, because every
// CLI command loads sanity.cli.ts first and that file has thrown since the day
// before. They were unreachable code encoding a belief that was not true.
//
// The dataset default was the dangerous half, and nobody had noticed it: with the
// project id supplied and SANITY_STUDIO_DATASET unset, `sanity dataset import
// --replace` silently targeted production.
const projectId = process.env.SANITY_STUDIO_PROJECT_ID;
const dataset = process.env.SANITY_STUDIO_DATASET;
if (!projectId) throw new Error("SANITY_STUDIO_PROJECT_ID is required (see sanity/.env.example)");
if (!dataset) throw new Error("SANITY_STUDIO_DATASET is required (see sanity/.env.example)");

export default defineConfig({
  name: "apertly-catalogue",
  title: "OpenFrame Catalogue",
  projectId,
  dataset,
  plugins: [structureTool({ structure })],
  schema: { types: schemaTypes },
});
