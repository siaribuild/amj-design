// Sanity Studio config. Run the studio with `npx sanity dev` from this folder
// after setting projectId/dataset (see sanity/README.md).
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes } from "./schemaTypes";

export default defineConfig({
  name: "apertly-catalogue",
  title: "OpenFrame Catalogue",
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || "REPLACE_WITH_PROJECT_ID",
  dataset: process.env.SANITY_STUDIO_DATASET || "production",
  plugins: [structureTool()],
  schema: { types: schemaTypes },
});
