#!/usr/bin/env bash
set -euo pipefail

report="$RUNNER_TEMP/token-fire-macos-os-e2e.jsonl"
stdout_log="$RUNNER_TEMP/token-fire-macos-os-e2e.stdout.log"
stderr_log="$RUNNER_TEMP/token-fire-macos-os-e2e.stderr.log"
rm -f "$report" "$stdout_log" "$stderr_log"

export TOKEN_FIRE_OS_E2E=1
export TOKEN_FIRE_OS_E2E_REPORT="$report"
npm run tauri -- dev --no-watch --config src-tauri/tauri.e2e.conf.json >"$stdout_log" 2>"$stderr_log" &
tauri_pid=$!

cleanup() {
  pkill -f '/target/debug/token-fire' 2>/dev/null || true
  kill "$tauri_pid" 2>/dev/null || true
  wait "$tauri_pid" 2>/dev/null || true
  sed -n '1,240p' "$stdout_log" 2>/dev/null || true
  sed -n '1,240p' "$stderr_log" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 720); do
  if ! kill -0 "$tauri_pid" 2>/dev/null; then
    echo 'Tauri OS E2E process exited during startup' >&2
    exit 1
  fi
  if test -f "$report" && grep -q '"reason":"platform-checks"' "$report"; then break; fi
  sleep 0.5
done
test -f "$report"
grep -q '"reason":"platform-checks"' "$report"

app_pid="$(pgrep -f '/target/debug/token-fire' | head -1)"
test -n "$app_pid"
swift scripts/os-e2e/send-macos-keys.swift "$app_pid"
sleep 2
node scripts/os-e2e/verify-report.mjs --report "$report" --platform macos
cp "$report" artifacts/os-e2e/macos-report.jsonl
