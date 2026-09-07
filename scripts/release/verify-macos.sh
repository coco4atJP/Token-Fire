#!/usr/bin/env bash
set -euo pipefail
bundle="src-tauri/target/${RELEASE_TARGET:?}/release/bundle"
dmg_path="$(find "$bundle/dmg" -maxdepth 1 -name '*.dmg' -print -quit)"
test -n "$dmg_path"
hdiutil verify "$dmg_path"
work_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/token-fire-dmg.XXXXXX")"
mkdir "$work_dir/mount" "$work_dir/installed"
app_pid=""
cleanup() {
  if [ -n "$app_pid" ]; then kill "$app_pid" 2>/dev/null || true; fi
  hdiutil detach "$work_dir/mount" -quiet 2>/dev/null || true
  rm -rf "$work_dir"
}
trap cleanup EXIT
hdiutil attach "$dmg_path" -readonly -nobrowse -mountpoint "$work_dir/mount"
source_app="$(find "$work_dir/mount" -maxdepth 1 -name '*.app' -print -quit)"
test -n "$source_app"
installed_app="$work_dir/installed/Token Fire.app"
for attempt in 1 2; do
  ditto "$source_app" "$installed_app"
  plutil -lint "$installed_app/Contents/Info.plist"
  codesign --verify --deep --strict --verbose=2 "$installed_app"
  codesign -dv "$installed_app" 2>&1 | grep -q 'Signature=adhoc'
  executable_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$installed_app/Contents/Info.plist")"
  executable_path="$installed_app/Contents/MacOS/$executable_name"
  case "$RELEASE_TARGET" in
    aarch64-apple-darwin) file "$executable_path" | grep -q arm64 ;;
    x86_64-apple-darwin) file "$executable_path" | grep -q x86_64 ;;
    *) exit 1 ;;
  esac
  "$executable_path" >"$work_dir/launch.log" 2>&1 &
  app_pid=$!
  sleep 8
  if ! kill -0 "$app_pid" 2>/dev/null; then
    cat "$work_dir/launch.log"
    echo 'Installed application exited during launch smoke' >&2
    exit 1
  fi
  kill "$app_pid"
  wait "$app_pid" || true
  app_pid=""
done
rm -rf "$installed_app"
test ! -e "$installed_app"
echo 'PASS ad-hoc integrity, DMG install, same-version replacement, launch and app removal'
# Gatekeeperの承認・公証成功を表す試験ではない。
