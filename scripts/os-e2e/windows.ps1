$ErrorActionPreference = 'Stop'

$report = Join-Path $env:RUNNER_TEMP 'token-fire-windows-os-e2e.jsonl'
$stdout = Join-Path $env:RUNNER_TEMP 'token-fire-windows-os-e2e.stdout.log'
$stderr = Join-Path $env:RUNNER_TEMP 'token-fire-windows-os-e2e.stderr.log'
Remove-Item $report, $stdout, $stderr -Force -ErrorAction SilentlyContinue

$env:TOKEN_FIRE_OS_E2E = '1'
$env:TOKEN_FIRE_OS_E2E_REPORT = $report
$tauri = Start-Process npm.cmd -ArgumentList @(
  'run', 'tauri', '--', 'dev', '--no-watch', '--config', 'src-tauri/tauri.e2e.conf.json'
) -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

try {
  $deadline = (Get-Date).AddMinutes(6)
  do {
    if ($tauri.HasExited) {
      Get-Content $stdout, $stderr -ErrorAction SilentlyContinue
      throw "Tauri OS E2E process exited during startup: $($tauri.ExitCode)"
    }
    $ready = (Test-Path $report) -and (Select-String -Path $report -SimpleMatch '"reason":"platform-checks"' -Quiet)
    if (-not $ready) { Start-Sleep -Milliseconds 500 }
  } until ($ready -or (Get-Date) -gt $deadline)
  if (-not $ready) {
    Get-Content $stdout, $stderr -ErrorAction SilentlyContinue
    throw 'Tauri OS E2E did not produce its startup report'
  }

  Add-Type -AssemblyName System.Windows.Forms
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TokenFireWindow {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle, int command);
}
'@
  $app = Get-Process | Where-Object { $_.MainWindowTitle -eq 'Token Fire OS E2E' } | Select-Object -First 1
  if (-not $app) { throw 'Token Fire OS E2E window was not found' }
  [TokenFireWindow]::ShowWindow($app.MainWindowHandle, 9) | Out-Null
  [TokenFireWindow]::SetForegroundWindow($app.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 700

  foreach ($key in @('q', 'l', '{TAB}', '{TAB}', '{RIGHT}', '{RIGHT}', '{ESC}', 'p', 'p')) {
    [System.Windows.Forms.SendKeys]::SendWait($key)
    Start-Sleep -Milliseconds 650
  }
  Start-Sleep -Seconds 2

  node scripts/os-e2e/verify-report.mjs --report $report --platform windows `
    --dpi-1 artifacts/os-e2e/windows/dpi-100/capture-manifest.json `
    --dpi-1.5 artifacts/os-e2e/windows/dpi-150/capture-manifest.json `
    --dpi-2 artifacts/os-e2e/windows/dpi-200/capture-manifest.json
  if ($LASTEXITCODE -ne 0) { throw 'Windows OS E2E report verification failed' }
} finally {
  Get-Process token-fire -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  if (-not $tauri.HasExited) { taskkill.exe /PID $tauri.Id /T /F | Out-Null }
  Get-Content $stdout, $stderr -ErrorAction SilentlyContinue
}
