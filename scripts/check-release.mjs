#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const packageJson = readJson("package.json");
const tauri = readJson("src-tauri/tauri.conf.json");
const cargo = readFileSync(resolve(root, "src-tauri/Cargo.toml"), "utf8");
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1];
const releaseWorkflow = readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8");
const windowsSmokeWorkflow = readFileSync(resolve(root, ".github/workflows/windows-release-smoke.yml"), "utf8");
const macosSmokeWorkflow = readFileSync(resolve(root, ".github/workflows/macos-release-smoke.yml"), "utf8");
const errors = [];

if (packageJson.version !== tauri.version || packageJson.version !== cargoVersion) {
  errors.push(`version mismatch: package=${packageJson.version}, tauri=${tauri.version}, cargo=${cargoVersion ?? "missing"}`);
}
if (tauri.plugins?.updater || tauri.bundle?.createUpdaterArtifacts) {
  errors.push("Updater runtime is active before D-014 external-communication review and release-key approval");
}
for (const requiredBundleIcon of [
  "icons/32x32.png",
  "icons/128x128.png",
  "icons/128x128@2x.png",
  "icons/icon.icns",
  "icons/icon.ico",
]) {
  if (!tauri.bundle?.icon?.includes(requiredBundleIcon)) {
    errors.push(`Tauri bundle icon is missing: ${requiredBundleIcon}`);
  }
}
for (const path of [
  "PRIVACY.md",
  "docs/RELEASE.md",
  "docs/OS-E2E.md",
  "docs/AUDIO-WORLD-AUDIT.md",
  "src-tauri/tauri.updater.example.json",
  ".github/workflows/macos-release-smoke.yml",
  ".github/workflows/windows-release-smoke.yml",
]) {
  if (!existsSync(resolve(root, path))) errors.push(`${path} is required for a release`);
}
for (const requiredWindowsSmokeContract of [
  "runs-on: windows-2025",
  "--dpr 1.5",
  "scripts/os-e2e/windows.ps1",
  "build --bundles msi,nsis",
  "MSI install failed",
  "Installed application exited during launch smoke",
  "MSI uninstall failed",
]) {
  if (!windowsSmokeWorkflow.includes(requiredWindowsSmokeContract)) {
    errors.push(`Windows smoke workflow is missing: ${requiredWindowsSmokeContract}`);
  }
}
for (const requiredMacosSmokeContract of [
  "runs-on: macos-15",
  "scripts/os-e2e/macos.sh",
  "--target x86_64-apple-darwin --bundles app,dmg",
  "grep -q 'x86_64'",
  "hdiutil verify",
  "Installed application exited during launch smoke",
]) {
  if (!macosSmokeWorkflow.includes(requiredMacosSmokeContract)) {
    errors.push(`macOS smoke workflow is missing: ${requiredMacosSmokeContract}`);
  }
}
for (const requiredWorkflowContract of [
  "platform: macos-15",
  "certificateThumbprint",
  "digestAlgorithm = \"sha256\"",
  "Get-AuthenticodeSignature",
  "codesign --verify --deep --strict",
  "xcrun stapler validate",
]) {
  if (!releaseWorkflow.includes(requiredWorkflowContract)) {
    errors.push(`release workflow is missing: ${requiredWorkflowContract}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`release error: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Release contract is consistent for Token Fire v${packageJson.version}; updater remains inactive.`);
}
