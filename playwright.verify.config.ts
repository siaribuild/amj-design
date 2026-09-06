import base from "./playwright.config";

export default { ...base, testDir: "scripts/tests-verify/web", testMatch: "**/*.spec.ts" };
