import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir("qa-output", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 480 }, deviceScaleFactor: 1 });
const consoleErrors = [];
const checks = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));

const check = async (name, action) => {
  try {
    const detail = await action();
    checks.push({ name, ok: true, detail: detail ?? null });
  } catch (error) {
    checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
};

await page.goto("http://127.0.0.1:1420", { waitUntil: "networkidle" });
await page.waitForSelector("canvas");
await page.waitForTimeout(3500);
await page.screenshot({ path: "qa-output/00-start.png" });

await check("play-mode", async () => {
  const play = page.locator("#play-button");
  await play.click();
  const pressed = await play.getAttribute("aria-pressed");
  if (pressed !== "true") throw new Error(`aria-pressed=${pressed}`);
  return await play.textContent();
});

await check("character-interaction", async () => {
  const hotspot = page.locator(".character-hotspot--emberbeak");
  await hotspot.click({ force: true });
  await page.waitForTimeout(400);
  const title = await hotspot.getAttribute("title");
  if (!title || title === "Emberbeak") throw new Error(`title=${title}`);
  return title;
});
await page.screenshot({ path: "qa-output/01-interaction.png" });

await check("ledger-open", async () => {
  await page.locator("#ledger-button").click();
  await page.waitForSelector(".control-center.is-open");
  const text = await page.locator(".control-center__body").innerText();
  if (!text.includes("ふわっとした多さ") || !text.includes("/24")) throw new Error(text.slice(0, 300));
  return text.slice(0, 300);
});

await check("settings-options", async () => {
  await page.locator('[data-tab="settings"]').click();
  const text = await page.locator(".control-center__body").innerText();
  for (const expected of ["承認待ち通知", "自動起動", "外の天気"]) if (!text.includes(expected)) throw new Error(`missing ${expected}`);
  return text.slice(0, 400);
});
await page.screenshot({ path: "qa-output/02-settings.png" });

await check("subtle-archive-and-packs", async () => {
  await page.locator('[data-tab="events"]').click();
  const text = await page.locator(".control-center__body").innerText();
  if (!text.includes("達成率や未発見数は表示しません") || !text.includes("イベントパック")) throw new Error(text.slice(0, 300));
  return text.slice(0, 300);
});

await check("replay-on-share", async () => {
  await page.locator('[data-tab="replays"]').click();
  const text = await page.locator(".control-center__body").innerText();
  if (!text.includes("動画そのものは保存していません") || !text.includes("動作データ")) throw new Error(text.slice(0, 300));
  return text.slice(0, 300);
});

await check("quiet-mode", async () => {
  await page.keyboard.press("Escape");
  await page.locator("#quiet-button").click();
  const text = await page.locator("#quiet-button").textContent();
  const pressed = await page.locator("#quiet-button").getAttribute("aria-pressed");
  if (text !== "WAKE" || pressed !== "true") throw new Error(`text=${text} pressed=${pressed}`);
  return `${text}/${pressed}`;
});

await check("compact-layout", async () => {
  await page.setViewportSize({ width: 380, height: 240 });
  await page.waitForTimeout(250);
  const values = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  if (values.scroll > values.client) throw new Error(JSON.stringify(values));
  return values;
});
await page.screenshot({ path: "qa-output/03-compact.png" });

await writeFile("qa-output/result.json", JSON.stringify({ checks, consoleErrors }, null, 2));
await browser.close();
const failed = checks.filter((entry) => !entry.ok);
if (consoleErrors.length || failed.length) throw new Error(JSON.stringify({ failed, consoleErrors }));
