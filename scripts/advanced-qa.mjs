import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir("qa-output", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 560, height: 350 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto("http://127.0.0.1:1420", { waitUntil: "networkidle" });
  await page.waitForSelector("canvas");
  await page.waitForTimeout(7500);

  const phase = await page.locator(".phase-hud__title").textContent();
  const detail = await page.locator(".phase-hud__detail").textContent();
  if (!phase?.includes("TOKEN FORGE")) throw new Error(`phase missing: ${phase}`);
  if (!detail?.includes("/24")) throw new Error(`24 level energy missing: ${detail}`);

  await page.getByRole("button", { name: "PLAY" }).click();
  await page.locator(".character-hotspot--emberbeak").click({ force: true });
  await page.waitForSelector(".character-bubble.is-visible");
  const bubble = await page.locator(".character-bubble").textContent();
  if (!bubble?.trim()) throw new Error("character reaction missing");
  await page.screenshot({ path: "qa-output/01-play.png" });

  await page.getByRole("button", { name: "LEDGER" }).click();
  await page.waitForSelector(".control-center.is-open");
  const ledger = await page.locator(".control-center__body").textContent();
  if (!ledger?.includes("ふわっとした多さ") || !ledger.includes("現在モデル")) throw new Error("ledger metrics missing");
  await page.screenshot({ path: "qa-output/02-ledger.png" });

  await page.getByRole("button", { name: "設定" }).click();
  if (!(await page.locator('[data-setting="attention-mode"]').isVisible())) throw new Error("attention settings missing");
  await page.locator('.control-center [data-action="close"]').click();

  const quietButton = page.locator("#quiet-button");
  if (await page.locator(".shell.is-quiet").count()) {
    await quietButton.click();
    await page.waitForTimeout(180);
    if (await page.locator(".shell.is-quiet").count()) throw new Error("scheduled quiet could not be temporarily overridden");
  }
  await quietButton.click();
  await page.waitForTimeout(180);
  if (!(await page.locator(".shell.is-quiet").count())) throw new Error("quiet mode class missing");
  await quietButton.click();
  await page.waitForTimeout(180);
  if (await page.locator(".shell.is-quiet").count()) throw new Error("wake override did not clear quiet state");

  await page.waitForTimeout(23500);
  await page.getByRole("button", { name: "LEDGER" }).click();
  await page.getByRole("button", { name: "動作" }).click();
  const replayText = await page.locator(".control-center__body").textContent();
  if (!replayText?.includes("frames")) throw new Error(`replay data missing: ${replayText}`);
  await page.screenshot({ path: "qa-output/03-replay.png" });

  await page.setViewportSize({ width: 380, height: 240 });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error("compact horizontal overflow");
  await page.screenshot({ path: "qa-output/04-compact.png" });

  await writeFile("qa-output/result.json", JSON.stringify({ phase, detail, bubble, errors }, null, 2));
  if (errors.length) throw new Error(errors.join(" | "));
} catch (error) {
  await writeFile("qa-output/error.txt", error instanceof Error ? `${error.stack ?? error.message}\n${errors.join("\n")}` : String(error));
  throw error;
} finally {
  await browser.close();
}
