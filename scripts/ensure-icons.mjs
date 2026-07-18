import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "src-tauri", "icons");
const sourceIcon = join(iconsDir, "icon.png");
const required = [
  "32x32.png",
  "128x128.png",
  "128x128@2x.png",
  "icon.ico",
  "icon.icns",
];

if (!existsSync(sourceIcon)) {
  throw new Error(`Token-Fire icon source is missing: ${sourceIcon}`);
}

if (required.every((name) => existsSync(join(iconsDir, name)))) {
  process.exit(0);
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "token-fire-icons-"));
const temporarySource = join(temporaryDirectory, "token-fire-icon.png");
copyFileSync(sourceIcon, temporarySource);

const executable = join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tauri.cmd" : "tauri",
);

try {
  execFileSync(executable, ["icon", temporarySource], {
    cwd: root,
    stdio: "inherit",
  });
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
