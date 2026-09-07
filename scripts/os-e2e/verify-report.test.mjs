import { test, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function verify(initialQuiet, toggles) {
  const records = [
    { reason: 'startup', readyState: 'complete', transparentCss: true, quiet: initialQuiet, quietClass: initialQuiet,
      native: { platform: 'macos', scaleFactor: 1, innerWidth: 560, innerHeight: 350 } },
    ...toggles.map(quiet => ({ reason: 'keydown', key: 'q', quiet, quietClass: quiet })),
    { reason: 'keydown', key: 'l', controlCenterOpen: true },
    { reason: 'keydown', key: 'ArrowRight', activeTab: 'replays', replayItems: 2, replayThumbnails: 2 },
    { reason: 'keydown', key: 'Escape', controlCenterOpen: false },
    { reason: 'keydown', key: 'p', play: true },
    { reason: 'keydown', key: 'p', play: false },
    { reason: 'platform-checks', optional: { hideShowCompleted: true, autostartEnabled: true, autostartRestored: true, notificationSent: true } },
  ];
  const dir = mkdtempSync(join(tmpdir(), 'token-fire-e2e-test-'));
  try {
    const report = join(dir, 'report.jsonl');
    writeFileSync(report, records.map(record => JSON.stringify(record)).join('\n'));
    return spawnSync(process.execPath, ['scripts/os-e2e/verify-report.mjs', '--report', report, '--platform', 'macos'], { encoding: 'utf8' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('昼のQuiet OFFから両方向に切り替わる', () => {
  expect(verify(false, [true, false]).status).toBe(0);
});
test('深夜のQuiet ONからWAKEして戻る', () => {
  expect(verify(true, [false, true]).status).toBe(0);
});
test('キー入力が届かず状態が変わらない場合は拒否する', () => {
  const result = verify(true, [true, true]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Q did not toggle Quiet and Wake');
});
