#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const argument = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : fallback;
};

const reportPath = resolve(argument("report") ?? "");
const expectedPlatform = argument("platform");
if (!expectedPlatform || !["windows", "macos"].includes(expectedPlatform)) {
  throw new Error("--platform must be windows or macos");
}
if (!existsSync(reportPath)) throw new Error(`OS E2E report is missing: ${reportPath}`);

const records = readFileSync(reportPath, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`report line ${index + 1} is invalid JSON: ${error}`); }
  });
const errors = [];
const requireRecord = (label, predicate) => {
  const record = records.find(predicate);
  if (!record) errors.push(label);
  return record;
};

const startup = requireRecord("startup snapshot was not recorded", (record) => record.reason === "startup");
const platformName = expectedPlatform === "macos" ? "macos" : "windows";
if (startup) {
  if (startup.readyState !== "complete") errors.push(`startup readyState is ${startup.readyState}`);
  if (!startup.transparentCss) errors.push("html/body transparent CSS contract failed");
  if (startup.native?.platform !== platformName) errors.push(`native platform is ${startup.native?.platform ?? "missing"}`);
  if (!(startup.native?.scaleFactor > 0)) errors.push("native scale factor was not observed");
  if (!(startup.native?.innerWidth > 0 && startup.native?.innerHeight > 0)) errors.push("native inner size was not observed");
}

requireRecord("Q did not enable Quiet", (record) => record.reason === "keydown" && record.key?.toLowerCase() === "q" && record.quiet && record.quietClass);
requireRecord("L did not open the Ledger", (record) => record.reason === "keydown" && record.key?.toLowerCase() === "l" && record.controlCenterOpen);
requireRecord("keyboard navigation did not reach Replay", (record) => record.reason === "keydown" && record.key === "ArrowRight" && record.activeTab === "replays" && record.replayItems >= 2 && record.replayThumbnails >= 2);
requireRecord("Escape did not close the Ledger", (record) => record.reason === "keydown" && record.key === "Escape" && !record.controlCenterOpen);
requireRecord("P did not enable PLAY", (record) => record.reason === "keydown" && record.key?.toLowerCase() === "p" && record.play);
const playRecords = records.filter((record) => record.reason === "keydown" && record.key?.toLowerCase() === "p");
if (!playRecords.some((record, index) => index > 0 && !record.play)) errors.push("second P did not disable PLAY");

const platformChecks = requireRecord("optional platform checks were not recorded", (record) => record.reason === "platform-checks");
if (platformChecks) {
  if (!platformChecks.optional?.hideShowCompleted) errors.push("hide/show recovery did not complete");
  if (!platformChecks.optional?.autostartEnabled) errors.push("autostart could not be enabled on the hosted runner");
  if (!platformChecks.optional?.autostartRestored) errors.push("autostart state was not restored");
}

for (const dpi of [1, 1.5, 2]) {
  const manifestPath = argument(`dpi-${dpi}`);
  if (!manifestPath) continue;
  const manifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8"));
  const capture = manifest.captures?.[0];
  if (capture?.dpr !== dpi) errors.push(`DPI ${dpi * 100}% manifest recorded DPR ${capture?.dpr ?? "missing"}`);
  if (capture?.consoleErrors !== 0) errors.push(`DPI ${dpi * 100}% reported console errors`);
  if (capture?.uiContract?.viewportOverflowX !== 0 || capture?.uiContract?.viewportOverflowY !== 0) {
    errors.push(`DPI ${dpi * 100}% overflow contract failed`);
  }
  if (capture?.uiContract?.tickerTextClipped !== 0) errors.push(`DPI ${dpi * 100}% clipped ticker text`);
  if (capture?.uiContract?.tickerTextMinPx < 12) errors.push(`DPI ${dpi * 100}% text below 12 CSS px`);
  if (capture?.uiContract?.toolbarMinWidthPx < 32 || capture?.uiContract?.toolbarMinHeightPx < 32) {
    errors.push(`DPI ${dpi * 100}% toolbar target below 32 CSS px`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(`OS E2E error: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`PASS ${expectedPlatform} OS E2E: ${records.length} presentation/native snapshots verified`);
  if (platformChecks && !platformChecks.optional?.notificationSent) {
    console.log("INFO notification permission was unavailable; API failure remained contained");
  }
}
