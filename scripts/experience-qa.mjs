import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir("qa-output", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 560, height: 350 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

await page.goto("http://127.0.0.1:1420", { waitUntil: "networkidle" });
await page.waitForSelector("canvas");
await page.waitForTimeout(6500);

const destructionDebt = await page.locator(".environmental-debt").textContent();
const destructionEvent = await page.locator(".world-event").textContent();
if (!destructionDebt?.includes("INCINERATED")) throw new Error(`destruction debt missing: ${destructionDebt}`);
if (!destructionEvent?.trim()) throw new Error("destruction event did not appear");
await page.screenshot({ path: "qa-output/01-destruction.png" });

await page.waitForTimeout(18500);
await page.waitForSelector(".greenwash-stamp.is-visible", { timeout: 7000 });
await page.screenshot({ path: "qa-output/02-greenwash.png" });

await page.waitForTimeout(6500);
await page.waitForSelector(".chill-card.is-visible", { timeout: 5000 });
const chillDebt = await page.locator(".environmental-debt").textContent();
if (!chillDebt?.includes("CHILL")) throw new Error(`chill debt missing: ${chillDebt}`);
await page.screenshot({ path: "qa-output/03-chill.png" });

await page.getByRole("button", { name: "INFO" }).click();
await page.waitForSelector(".reality-check.is-visible");
await page.screenshot({ path: "qa-output/04-reality-check.png" });

await writeFile("qa-output/result.json", JSON.stringify({ destructionDebt, destructionEvent, chillDebt, consoleErrors }, null, 2));
if (consoleErrors.length > 0) throw new Error(`console errors: ${consoleErrors.join(" | ")}`);
await browser.close();
