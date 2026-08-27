#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const argv = process.argv.slice(2);
const outIndex = argv.indexOf("--out");
const output = resolve(outIndex >= 0 && argv[outIndex + 1] ? argv[outIndex + 1] : "artifacts/ui-audit/improvement-v1-motion");
const timeline = [
  { t: 0, scene: "poka", beat: "idle / breath" },
  { t: 4, scene: "mera", beat: "hammer anticipation" },
  { t: 9, scene: "gogo", beat: "overdrive / secondary smoke" },
  { t: 14, scene: "approval", beat: "important hold" },
  { t: 18, scene: "zero-output", beat: "error hold" },
  { t: 23, scene: "kirari", beat: "volume-preserving hop" },
  { t: 29, scene: "meguri", beat: "soft follow / recovery" },
];
const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

const waitForVite = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch("http://127.0.0.1:1420")).ok) return;
    } catch {
      // Vite is starting.
    }
    await sleep(100);
  }
  throw new Error("Vite did not become ready for the motion reference capture");
};

mkdirSync(output, { recursive: true });
const vite = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "1420", "--strictPort"], {
  cwd: resolve("."),
  stdio: ["ignore", "ignore", "pipe"],
});

try {
  await waitForVite();
  const frames = [];
  for (const [index, entry] of timeline.entries()) {
    const frameDirectory = join(output, `.frame-${index}`);
    const result = spawnSync(process.execPath, [
      resolve("scripts/capture-ui.mjs"),
      "--url", "http://127.0.0.1:1420",
      "--no-server",
      "--out", frameDirectory,
      "--scenes", entry.scene,
      "--viewports", "560x350",
      "--elapsed", String(entry.t),
      "--verify-determinism",
    ], { cwd: resolve("."), encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || `capture failed at ${entry.t}s`);
    const source = join(frameDirectory, `scene-${entry.scene}-560x350.png`);
    const destination = join(output, `t${String(entry.t).padStart(2, "0")}-${entry.scene}.png`);
    copyFileSync(source, destination);
    frames.push(destination);
    rmSync(frameDirectory, { recursive: true, force: true });
    process.stdout.write(`PASS ${String(entry.t).padStart(2, "0")}s ${entry.scene}\n`);
  }

  const ffmpeg = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"].find(existsSync);
  let contactSheet = null;
  if (ffmpeg) {
    contactSheet = join(output, "contact-sheet.png");
    const inputs = frames.flatMap((frame) => ["-i", frame]);
    const scales = frames.map((_, index) => `[${index}:v]scale=280:175[v${index}]`).join(";");
    const layout = ["0_0", "280_0", "560_0", "840_0", "0_175", "280_175", "560_175"].join("|");
    const stackInputs = frames.map((_, index) => `[v${index}]`).join("");
    const rendered = spawnSync(ffmpeg, [
      "-y", ...inputs,
      "-filter_complex", `${scales};${stackInputs}xstack=inputs=${frames.length}:layout=${layout}:fill=0x241715[out]`,
      "-map", "[out]", "-frames:v", "1", contactSheet,
    ], { stdio: "ignore" });
    if (rendered.status !== 0) contactSheet = null;
  }
  writeFileSync(join(output, "motion-reference.json"), `${JSON.stringify({
    durationSeconds: 30,
    viewport: "560x350",
    fixedStep: "1/120s",
    motionScale: 1,
    contactSheet: contactSheet ? "contact-sheet.png" : null,
    frames: timeline.map((entry, index) => ({ ...entry, file: frames[index].split("/").at(-1) })),
  }, null, 2)}\n`);
  process.stdout.write(`Motion reference written to ${output}\n`);
} finally {
  vite.kill("SIGTERM");
}
