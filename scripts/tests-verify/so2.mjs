import { chromium } from "playwright";
const PORT = "8799";
const b = await chromium.launch({ channel: "chrome" });
for (const path of ["/ops2", "/ops2/attention", "/ops2/projects"]) {
  const p = await b.newPage();
  await p.goto(`http://ops.localhost:${PORT}${path}`);
  await p.waitForTimeout(1200);
  const t = (await p.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 240);
  console.log(path, "=>", p.url(), "|", t);
  await p.close();
}
await b.close();
