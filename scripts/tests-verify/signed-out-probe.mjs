// Criterion 18, executed for real: a signed-out browser opening the queue
// address WITH an Attention filter. Records exactly what it is shown.
import { chromium } from "playwright";

const PORT = process.env.WEB_PORT ?? "8799";
const URL_ = `http://ops.localhost:${PORT}/ops2/projects?attn=readyToIssue`;

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" });
const page = await browser.newPage(); // fresh context, no cookies
const statuses = [];
page.on("response", (r) => {
  if (r.url().includes("/api/ops/")) statuses.push(`${r.status()} ${new URL(r.url()).pathname}`);
});
await page.goto(URL_);
await page.waitForTimeout(1500);
console.log("final URL      :", page.url());
console.log("ops API calls  :", statuses);
console.log("queue-error    :", await page.getByTestId("queue-error").count());
console.log("queue rows     :", await page.getByTestId("queue-row").count());
console.log("error text     :", (await page.getByTestId("queue-error").innerText().catch(() => "(none)")).replace(/\s+/g, " "));
console.log("sign-in words? :", /sign in|log in|sign-in/i.test(await page.locator("body").innerText()));
console.log("any project ref on page?:", /OF-Q-\d+/.test(await page.locator("body").innerText()));
await browser.close();
