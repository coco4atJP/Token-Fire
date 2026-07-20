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
const destructionPhase = await page.locator(".phase-hud__title").textContent();
if (!destructionDebt?.includes("INCINERATED")) throw new Error(`destruction debt missing: ${destructionDebt}`);
if (!destructionEvent?.trim()) throw new Error("destruction event did not appear");
if (!destructionPhase?.includes("INCINERATING")) throw new Error(`destruction phase mismatch: ${destructionPhase}`);
await page.screenshot({ path: "qa-output/01-destruction.png" });

await page.waitForTimeout(18500);
await page.waitForSelector(".greenwash-stamp.is-visible", { timeout: 7000 });
const ceremonyPhase = await page.locator(".phase-hud__title").textContent();
if (!ceremonyPhase?.includes("PROFIT CEREMONY")) throw new Error(`ceremony phase mismatch: ${ceremonyPhase}`);
await page.screenshot({ path: "qa-output/02-greenwash.png" });

await page.waitForTimeout(6500);
await page.waitForSelector(".chill-card.is-visible", { timeout: 5000 });
const chillDebt = await page.locator(".environmental-debt").textContent();
const chillPhase = await page.locator(".phase-hud__title").textContent();
if (!chillDebt?.includes("CHILL")) throw new Error(`chill debt missing: ${chillDebt}`);
if (!chillPhase?.includes("PLANTATION CHILL")) throw new Error(`chill phase mismatch: ${chillPhase}`);
await page.screenshot({ path: "qa-output/03-chill.png" });

await page.getByRole("button", { name: "INFO" }).click();
await page.waitForSelector(".reality-check.is-visible");
await page.screenshot({ path: "qa-output/04-reality-check.png" });
await page.keyboard.press("Escape");

await page.setViewportSize({ width: 380, height: 240 });
await page.waitForTimeout(250);
await page.locator(".shell").hover();
const compactBounds = await page.locator(".phase-hud").boundingBox();
const toolbarBounds = await page.locator(".toolbar").boundingBox();
if (!compactBounds || compactBounds.x < 0 || compactBounds.y < 0 || compactBounds.x + compactBounds.width > 380 || compactBounds.y + compactBounds.height > 240) {
  throw new Error(`compact phase HUD overflow: ${JSON.stringify(compactBounds)}`);
}
if (!toolbarBounds) throw new Error("compact toolbar bounds missing");
const overlaps = !(
  compactBounds.x + compactBounds.width <= toolbarBounds.x ||
  toolbarBounds.x + toolbarBounds.width <= compactBounds.x ||
  compactBounds.y + compactBounds.height <= toolbarBounds.y ||
  toolbarBounds.y + toolbarBounds.height <= compactBounds.y
);
if (overlaps) throw new Error(`compact HUD overlaps toolbar: ${JSON.stringify({ compactBounds, toolbarBounds })}`);
const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (hasHorizontalOverflow) throw new Error("compact viewport has horizontal overflow");
await page.screenshot({ path: "qa-output/05-compact-chill.png" });

await writeFile("qa-output/result.json", JSON.stringify({
  destructionDebt,
  destructionEvent,
  destructionPhase,
  ceremonyPhase,
  chillDebt,
  chillPhase,
  compactBounds,
  toolbarBounds,
  consoleErrors,
}, null, 2));
if (consoleErrors.length > 0) throw new Error(`console errors: ${consoleErrors.join(" | ")}`);
await browser.close();
