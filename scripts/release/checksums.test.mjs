import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const names = ['aarch64.dmg', 'x64.dmg', 'x64_en-US.msi', 'x64-setup.exe'].map(s => `Token Fire_${version}_${s}`);
function check(files) {
  const dir = mkdtempSync(join(tmpdir(), 'token-fire-checksums-'));
  try {
    for (const name of files) writeFileSync(join(dir, name), 'fixture bytes');
    const result = spawnSync(process.execPath, ['scripts/release/checksums.mjs', dir], { encoding: 'utf8' });
    return { status: result.status, manifest: result.status === 0 ? readFileSync(join(dir, 'SHA256SUMS'), 'utf8') : '' };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('全4成果物の名前と実内容のdigestを保存する', () => {
  const result = check(names);
  assert.equal(result.status, 0);
  const digest = createHash('sha256').update('fixture bytes').digest('hex');
  assert.deepEqual(result.manifest.trimEnd().split('\n'), [...names].sort().map(name => `${digest}  ${name}`));
});
test('Windows成果物が欠けた公開を拒否する', () => {
  assert.notEqual(check(names.slice(0, 3)).status, 0);
});
test('別versionの成果物が混ざった公開を拒否する', () => {
  assert.notEqual(check(names.map((name, i) => i === 0 ? name.replace(`_${version}_`, '_9.9.9_') : name)).status, 0);
});
