import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "src-tauri", "icons");
const sourceIcon = join(root, "art-source", "token-fire", "app-icon.png");
const required = [
  "icon.png",
  "32x32.png",
  "128x128.png",
  "128x128@2x.png",
  "icon.ico",
  "icon.icns",
];

if (!existsSync(sourceIcon)) {
  throw new Error(`Token-Fire 1024px icon source is missing: ${sourceIcon}`);
}

const sourceModifiedAt = statSync(sourceIcon).mtimeMs;
if (required.every((name) => {
  const path = join(iconsDir, name);
  return existsSync(path) && statSync(path).mtimeMs >= sourceModifiedAt;
})) {
  process.exit(0);
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "token-fire-icons-"));
const temporarySource = join(temporaryDirectory, "token-fire-icon.png");
copyFileSync(sourceIcon, temporarySource);

// `.cmd` shimはNodeのexecFileSyncからWindows上で直接起動できない。
// package本体のJS entryを現在のNodeで実行し、shell差を境界内で吸収する。
const tauriEntry = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");

try {
  execFileSync(process.execPath, [tauriEntry, "icon", temporarySource, "--output", iconsDir], {
    cwd: root,
    stdio: "inherit",
  });
  const missing = required.filter((name) => !existsSync(join(iconsDir, name)));
  if (missing.length > 0) {
    throw new Error(`Tauri icon generation did not produce: ${missing.join(", ")}`);
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
