import {defineCliConfig} from "sanity/cli";

const projectId = process.env.SANITY_STUDIO_PROJECT_ID;

if (!projectId) {
  throw new Error("SANITY_STUDIO_PROJECT_ID is required");
}

export default defineCliConfig({
  api: {
    projectId,
    dataset: process.env.SANITY_STUDIO_DATASET || "production",
  },
  studioHost: "apertly-catalogue",
});