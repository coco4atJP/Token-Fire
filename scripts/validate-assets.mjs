import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedRoot = join(root, "public", "assets", "token-fire", "generated");
const manifest = JSON.parse(readFileSync(join(root, "public", "assets", "token-fire", "asset-requests.json"), "utf8"));
const iconRequestPath = join(root, "art-source", "token-fire", "app-icon.request.json");
const iconRequest = JSON.parse(readFileSync(iconRequestPath, "utf8"));
const errors = [];

const readPng = (path) => {
  const bytes = readFileSync(path);
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a" || bytes.length < 26) {
    throw new Error("PNG signature or IHDR is invalid");
  }
  const colorType = bytes[25];
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    hasAlpha: colorType === 4 || colorType === 6,
    digest: createHash("sha256").update(bytes).digest("hex"),
  };
};

const validatePng = (relativePath, expected) => {
  const path = join(root, relativePath);
  if (!existsSync(path)) {
    errors.push(`${relativePath}: file is missing`);
    return;
  }
  try {
    const png = readPng(path);
    if (expected?.width && png.width !== expected.width) {
      errors.push(`${relativePath}: width ${png.width}, expected ${expected.width}`);
    }
    if (expected?.height && png.height !== expected.height) {
      errors.push(`${relativePath}: height ${png.height}, expected ${expected.height}`);
    }
    if (typeof expected?.alpha === "boolean" && png.hasAlpha !== expected.alpha) {
      errors.push(`${relativePath}: alpha ${png.hasAlpha}, expected ${expected.alpha}`);
    }
  } catch (error) {
    errors.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const manifestPaths = new Set();
for (const asset of manifest.files ?? []) {
  if (manifestPaths.has(asset.path)) errors.push(`${asset.path}: duplicate manifest path`);
  manifestPaths.add(asset.path);
  validatePng(`public/assets/token-fire/generated/${asset.path}`, {
    width: asset.size?.width,
    height: asset.size?.height,
    alpha: asset.alpha,
  });
}

const characterIds = ["hinoko", "mebuki", "fuwame", "sumi", "mizumo", "kururi"];
for (const id of characterIds) {
  validatePng(`public/assets/token-fire/generated/characters/${id}.png`);
  for (let frame = 1; frame <= 4; frame += 1) {
    validatePng(`public/assets/token-fire/generated/expressions/${id}/0${frame}.png`, {
      width: 512,
      height: 512,
      alpha: true,
    });
  }
}

const retiredIds = ["axle", "cinder", "drizzle", "emberbeak", "spriglet", "vapo"];
for (const id of retiredIds) {
  const retiredCharacter = join(generatedRoot, "characters", `${id}.png`);
  const retiredExpressions = join(generatedRoot, "expressions", id);
  if (existsSync(retiredCharacter) || existsSync(retiredExpressions)) {
    errors.push(`${id}: retired duplicate asset is still packaged`);
  }
}

validatePng("art-source/token-fire/app-icon.png", { width: 1024, height: 1024 });
validatePng("src-tauri/icons/icon.png", { width: 512, height: 512, alpha: true });
for (const reference of iconRequest.references ?? []) {
  if (!existsSync(join(dirname(iconRequestPath), reference))) {
    errors.push(`art-source/token-fire/${reference}: icon reference is missing`);
  }
}

const pngFiles = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile() && entry.name.endsWith(".png")) pngFiles.push(path);
  }
};
walk(generatedRoot);

const digests = new Map();
for (const path of pngFiles) {
  const digest = readPng(path).digest;
  const existing = digests.get(digest);
  if (existing) errors.push(`${path}: duplicates ${existing}`);
  else digests.set(digest, path);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`asset error: ${error}`);
  process.exitCode = 1;
} else {
  const bytes = pngFiles.reduce((total, path) => total + statSync(path).size, 0);
  console.log(`Validated ${pngFiles.length} generated PNGs (${bytes.toLocaleString("en-US")} bytes), the 1024px icon master, and the 512px Tauri icon.`);
}
