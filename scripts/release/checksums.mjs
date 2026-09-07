#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/release/checksums.mjs DIRECTORY');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const files = readdirSync(directory).filter(name => /\.(dmg|msi|exe)$/.test(name)).sort();
const patterns = [/_aarch64\.dmg$/, /_x64\.dmg$/, /_x64[^/]*\.msi$/, /_x64-setup\.exe$/];
if (files.length !== 4 || patterns.some(pattern => files.filter(name => pattern.test(name)).length !== 1)) {
  throw new Error('Expected exactly two macOS DMGs and Windows MSI/NSIS installers');
}
const lines = files.map(name => {
  if (!name.includes(`_${version}_`) || /[\r\n\\]/.test(name)) throw new Error('Unexpected installer filename');
  const bytes = readFileSync(join(directory, name));
  if (!bytes.length) throw new Error('Empty installer');
  return `${createHash('sha256').update(bytes).digest('hex')}  ${name}`;
});
writeFileSync(join(directory, 'SHA256SUMS'), lines.join('\n') + '\n');
console.log(`Verified installer inventory for v${version}; wrote ${lines.length} SHA-256 checksums.`);
