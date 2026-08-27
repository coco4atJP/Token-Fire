import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedRoot = join(root, "public", "assets", "token-fire", "generated");
const manifestPath = join(root, "public", "assets", "token-fire", "asset-requests.json");
const schemaPath = join(root, "public", "assets", "token-fire", "asset-requests.schema.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const manifestSchema = JSON.parse(readFileSync(schemaPath, "utf8"));
const iconRequestPath = join(root, "art-source", "token-fire", "app-icon.request.json");
const iconRequest = JSON.parse(readFileSync(iconRequestPath, "utf8"));
const errors = [];

// 依存追加なしで、このmanifestが使うJSON Schemaの部分集合を検証する。
// schemaを検査ゲートの単一情報源にして、manifestとvalidatorの仕様ずれを防ぐ。
const validateSchema = (value, schema, path = "asset-requests.json") => {
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: must be one of ${schema.enum.join(", ")}`);
  }
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path}: must be an object`);
      return;
    }
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}.${key}: is required`);
    }
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${path}.${key}: additional property is not allowed`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in value) validateSchema(value[key], childSchema, `${path}.${key}`);
    }
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path}: must be an array`);
      return;
    }
    if (schema.items) value.forEach((item, index) => validateSchema(item, schema.items, `${path}[${index}]`));
    return;
  }
  if (schema.type === "integer" && !Number.isInteger(value)) errors.push(`${path}: must be an integer`);
  else if (schema.type === "string" && typeof value !== "string") errors.push(`${path}: must be a string`);
  else if (schema.type === "boolean" && typeof value !== "boolean") errors.push(`${path}: must be a boolean`);
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path}: must be at least ${schema.minimum}`);
  }
  if (typeof value === "string" && schema.pattern && !(new RegExp(schema.pattern).test(value))) {
    errors.push(`${path}: does not match ${schema.pattern}`);
  }
};

validateSchema(manifest, manifestSchema);

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
    if (expected?.longEdge && Math.max(png.width, png.height) !== expected.longEdge) {
      errors.push(`${relativePath}: long edge ${Math.max(png.width, png.height)}, expected ${expected.longEdge}`);
    }
    if (typeof expected?.alpha === "boolean" && png.hasAlpha !== expected.alpha) {
      errors.push(`${relativePath}: alpha ${png.hasAlpha}, expected ${expected.alpha}`);
    }
  } catch (error) {
    errors.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const manifestPaths = new Set();
for (const asset of Array.isArray(manifest.files) ? manifest.files : []) {
  if (manifestPaths.has(asset.path)) errors.push(`${asset.path}: duplicate manifest path`);
  manifestPaths.add(asset.path);
  validatePng(`public/assets/token-fire/generated/${asset.path}`, {
    width: asset.size?.width,
    height: asset.size?.height,
    alpha: asset.alpha,
  });
}

const uiMasterPaths = new Set();
for (const path of manifestPaths) {
  if (!path.startsWith("ui/")) continue;
  if (!/-(64|128)\.png$/.test(path)) {
    errors.push(`${path}: UI runtime asset must end in -64.png or -128.png`);
    continue;
  }
  uiMasterPaths.add(`art-source/token-fire/generated/${path.replace(/-(64|128)\.png$/, "-master-512.png")}`);
}
for (const path of uiMasterPaths) validatePng(path, { longEdge: 512, alpha: true });

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

const packagedFiles = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile()) packagedFiles.push(path);
  }
};
walk(generatedRoot);

const pngFiles = packagedFiles.filter((path) => path.endsWith(".png"));
const managedRuntimePaths = new Set(characterIds.map((id) => `characters/${id}.png`));
for (const id of characterIds) {
  for (let frame = 1; frame <= 4; frame += 1) managedRuntimePaths.add(`expressions/${id}/0${frame}.png`);
}
const allowedSupportFiles = new Set(["README.md", "expressions/README.md"]);
for (const path of packagedFiles) {
  const generatedPath = relative(generatedRoot, path).replaceAll("\\", "/");
  if (path.endsWith(".png")) {
    if (!manifestPaths.has(generatedPath) && !managedRuntimePaths.has(generatedPath)) {
      errors.push(`${generatedPath}: packaged PNG is neither declared nor a managed character frame`);
    }
  } else if (!allowedSupportFiles.has(generatedPath)) {
    errors.push(`${generatedPath}: undeclared support file would be packaged`);
  }
}

const spriteAtlasPath = join(root, "public", "assets", "token-fire", "sprites.svg");
if (!existsSync(spriteAtlasPath)) {
  errors.push("public/assets/token-fire/sprites.svg: file is missing");
} else {
  const svg = readFileSync(spriteAtlasPath, "utf8");
  if (!svg.includes("<svg") || !svg.includes("</svg>")) {
    errors.push("public/assets/token-fire/sprites.svg: SVG root is invalid");
  }
}

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
  console.log(`Validated ${pngFiles.length} generated PNGs (${bytes.toLocaleString("en-US")} bytes), ${uiMasterPaths.size} UI masters, the SVG fallback, and app icons.`);
}
