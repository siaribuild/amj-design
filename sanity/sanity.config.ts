// Sanity Studio config. Run the studio with `npx sanity dev` from this folder
// after setting projectId/dataset (see sanity/README.md).
import { defineConfig } from "sanity";
import { structureTool, type StructureResolver } from "sanity/structure";
import { orderableDocumentListDeskItem } from "@sanity/orderable-document-list";
import { schemaTypes } from "./schemaTypes";

// Site Settings is a singleton: one fixed document, pinned to the top of the left
// menu, and removed from the auto-generated document-type list so it can't be
// duplicated.
//
// Every other type here gets its own drag-and-drop ordered list item (via
// @sanity/orderable-document-list) rather than the generic auto-generated one,
// so all of them are excluded from the auto-generated tail below. For most,
// reordering is a pure Studio browsing convenience — see the per-item comments
// for the handful (category, product, postCategory, family, optionType) whose
// order also drives something on the live site.
const PINNED = [
  "siteSettings", "page", "emailTemplate", "category", "product", "postCategory",
  "option", "optionType", "family", "thermalProfile", "frameSystem", "post",
];

const structure: StructureResolver = (S, context) =>
  S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Site Settings")
        .id("siteSettings")
        .child(S.document().schemaType("siteSettings").documentId("siteSettings")),
      // Pages are edited far more often than the catalogue types, which is why
      // they stay pinned right beneath Site Settings rather than falling into
      // the alphabetical block below. orderableDocumentListDeskItem returns an
      // already-built ListItem, so these go straight into items([]), not
      // wrapped in a further S.listItem().child(...).
      orderableDocumentListDeskItem({ type: "page", title: "Pages", S, context }),
      S.divider(),
      // Transactional email copy is a distinct editing job from the catalogue,
      // so it keeps its own top-level entry too.
      orderableDocumentListDeskItem({ type: "emailTemplate", title: "Email Templates", S, context }),
      S.divider(),
      // Drag-and-drop ordered lists. Reordering here writes orderRank, which is
      // what CATALOGUE_QUERY (categories, families, products) and the
      // postCategories query now sort by — see src/data/catalogueQuery.ts.
      orderableDocumentListDeskItem({ type: "category", title: "Categories", S, context }),
      orderableDocumentListDeskItem({ type: "family", title: "Families", S, context }),
      orderableDocumentListDeskItem({ type: "product", title: "Products", S, context }),
      orderableDocumentListDeskItem({ type: "postCategory", title: "Resources Categories", S, context }),
      // Which option group (Colour, Hardware, Flyscreen…) shows first in the
      // item builder customers use — replaces the hardcoded TYPE_ORDER that
      // used to live in src/data/configurator.ts.
      orderableDocumentListDeskItem({ type: "optionType", title: "Option Types", S, context }),
      // Options are ordered PER OPTION TYPE, not as one flat list of every
      // option — the "filter" here scopes both which options the list shows
      // and what a drag reorders against, so Colours and Hardware never
      // contend for the same ranks. Studio browsing only: nothing
      // customer-facing reads option.orderRank (the colour swatch order is
      // unchanged — see src/data/catalogueQuery.ts). The nested orderable item
      // has to be wrapped in S.list().items([...]) — a raw ListItem isn't a
      // valid .child() return type on its own. The Option Type picker itself
      // sorts by orderRank too, matching the standalone "Option Types" list
      // above rather than falling back to alphabetical.
      S.listItem()
        .title("Options")
        .id("option")
        .child(
          S.documentTypeList("optionType")
            .title("Option Types")
            .defaultOrdering([{ field: "orderRank", direction: "asc" }])
            .child((optionTypeId) =>
              S.list()
                .title("Options")
                .items([
                  orderableDocumentListDeskItem({
                    type: "option",
                    title: "Options",
                    filter: `_type == "option" && optionType._ref == $optionTypeId`,
                    params: { optionTypeId },
                    S,
                    context,
                  }),
                ]),
            ),
        ),
      S.divider(),
      // Studio browsing convenience only — none of these have a customer-facing
      // display order (thermal/frame data is technical reference data looked
      // up per product; posts keep sorting by publishedAt on the live site,
      // see CATALOGUE_QUERY's "posts" block).
      orderableDocumentListDeskItem({ type: "thermalProfile", title: "Thermal Profiles", S, context }),
      orderableDocumentListDeskItem({ type: "frameSystem", title: "Frame Systems", S, context }),
      orderableDocumentListDeskItem({ type: "post", title: "Posts", S, context }),
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
