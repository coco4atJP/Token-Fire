import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir("qa-output", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 480 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));
await page.goto("http://127.0.0.1:1420", { waitUntil: "networkidle" });
await page.waitForSelector("canvas");
await page.waitForTimeout(3500);

const play = page.getByRole("button", { name: "PLAY" });
await play.click();
if ((await play.getAttribute("aria-pressed")) !== "true") throw new Error("PLAY mode did not enable");
const hotspot = page.locator(".character-hotspot--emberbeak");
await hotspot.click({ force: true });
await page.waitForTimeout(250);
if (!(await hotspot.getAttribute("title"))?.includes("破壊量")) throw new Error("character interaction line missing");
await page.screenshot({ path: "qa-output/01-interaction.png" });

await page.getByRole("button", { name: "LEDGER" }).click();
await page.waitForSelector(".control-center.is-open");
const ledgerText = await page.locator(".control-center__body").innerText();
if (!ledgerText.includes("ふわっとした多さ") || !ledgerText.includes("/24")) throw new Error("24-level energy ledger missing");

for (const tab of ["事業所", "動作", "できごと", "設定"]) {
  await page.getByRole("button", { name: tab, exact: true }).click();
  await page.waitForTimeout(100);
}
const settingsText = await page.locator(".control-center__body").innerText();
if (!settingsText.includes("承認待ち通知") || !settingsText.includes("自動起動") || !settingsText.includes("外の天気")) throw new Error("settings options missing");
await page.screenshot({ path: "qa-output/02-settings.png" });

await page.getByRole("button", { name: "できごと", exact: true }).click();
const eventsText = await page.locator(".control-center__body").innerText();
if (!eventsText.includes("達成率や未発見数は表示しません") || !eventsText.includes("イベントパック")) throw new Error("subtle archive or packs missing");

await page.getByRole("button", { name: "動作", exact: true }).click();
const replayText = await page.locator(".control-center__body").innerText();
if (!replayText.includes("動画そのものは保存していません") || !replayText.includes("動作データ")) throw new Error("replay-on-share strategy missing");

await page.keyboard.press("Escape");
await page.getByRole("button", { name: "QUIET" }).click();
if ((await page.getByRole("button", { name: "WAKE" }).getAttribute("aria-pressed")) !== "true") throw new Error("quiet mode did not enable");

await page.setViewportSize({ width: 380, height: 240 });
await page.waitForTimeout(200);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
if (overflow) throw new Error("compact layout has horizontal overflow");
await page.screenshot({ path: "qa-output/03-compact.png" });

await writeFile("qa-output/result.json", JSON.stringify({ errors, ledgerText, settingsText, eventsText, replayText }, null, 2));
if (errors.length) throw new Error(errors.join(" | "));
await browser.close();
