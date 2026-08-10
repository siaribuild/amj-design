import {defineCliConfig} from "sanity/cli";

// A throw, not a default, on BOTH values. The CLI's dataset-mutating commands —
// `dataset import --replace`, `dataset delete`, `cors add` — and a non-interactive
// `deploy` must never resolve an implicit target. `|| "production"` on the dataset
// was exactly that: with the project id set and this variable unset, an import
// with --replace would have overwritten the live dataset without ever naming it.
//
// Copy sanity/.env.example to sanity/.env; @sanity/cli loads it before every
// command.
const projectId = process.env.SANITY_STUDIO_PROJECT_ID;
const dataset = process.env.SANITY_STUDIO_DATASET;

if (!projectId) {
  throw new Error("SANITY_STUDIO_PROJECT_ID is required (see sanity/.env.example)");
}
if (!dataset) {
  throw new Error("SANITY_STUDIO_DATASET is required (see sanity/.env.example)");
}

export default defineCliConfig({
  api: {
    projectId,
    dataset,
  },
  studioHost: "apertly-catalogue",
  deployment: {
    appId: "xyrlgigkhs51x7bzax5am0nf",
  },
});