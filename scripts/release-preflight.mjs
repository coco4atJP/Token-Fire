#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

// 値を出力せず、署名付き配布の前提だけを確認する。
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const expectedTag = `token-fire-v${version}`;
const errors = [];
const ref = process.env.GITHUB_REF ?? "";
if (ref.startsWith("refs/tags/") && ref !== `refs/tags/${expectedTag}`) {
  errors.push(`Release tag must be ${expectedTag}; package version is ${version}.`);
}
if (!existsSync(`docs/releases/v${version}.md`)) {
  errors.push(`Missing release notes: docs/releases/v${version}.md`);
}
if (process.argv.includes("--signing")) {
  const required = [
    "APPLE_CERTIFICATE", "APPLE_CERTIFICATE_PASSWORD", "KEYCHAIN_PASSWORD",
    "APPLE_SIGNING_IDENTITY", "APPLE_API_ISSUER", "APPLE_API_KEY", "APPLE_API_KEY_BASE64",
    "WINDOWS_CERTIFICATE", "WINDOWS_CERTIFICATE_PASSWORD",
  ];
  for (const name of required) {
    if (!process.env[name]?.trim()) errors.push(`Missing release environment secret: ${name}`);
  }
}
for (const error of errors) console.error(error);
if (errors.length) process.exitCode = 1;
else console.log(`Release preflight passed for ${expectedTag}. This does not verify signatures or OS acceptance.`);
