$ErrorActionPreference = 'Stop'
$artifacts = Get-ChildItem src-tauri/target/release/bundle -Recurse -File |
  Where-Object { $_.Extension -in @('.exe', '.msi') }
if ($artifacts.Count -ne 2) { throw "Expected MSI and NSIS installers" }
foreach ($artifact in $artifacts) {
  $signature = Get-AuthenticodeSignature $artifact.FullName
  if ($signature.Status -ne 'NotSigned') { throw "Expected unsigned installer: $($artifact.Name)" }
}

$msi = Get-ChildItem src-tauri/target/release/bundle/msi -Filter *.msi -File | Select-Object -First 1
if (-not $msi) { throw "MSI artifact was not generated" }

$install = Start-Process msiexec.exe -ArgumentList @('/i', "`"$($msi.FullName)`"", '/qn', '/norestart') -Wait -PassThru
if ($install.ExitCode -notin @(0, 3010)) { throw "MSI install failed: $($install.ExitCode)" }

$roots = @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$entry = Get-ItemProperty $roots -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -eq 'Token Fire' } |
  Select-Object -First 1
if (-not $entry) { throw "Installed Token Fire entry was not found" }

$executable = ($entry.DisplayIcon -replace ',\d+$', '').Trim('"')
if (-not (Test-Path $executable)) {
  $executable = Get-ChildItem $entry.InstallLocation -Filter *.exe -File | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $executable -or -not (Test-Path $executable)) { throw "Installed executable was not found" }

$app = Start-Process $executable -PassThru
Start-Sleep -Seconds 8
if ($app.HasExited) { throw "Installed application exited during launch smoke" }
Stop-Process -Id $app.Id -Force

$productCode = $entry.PSChildName
if ($productCode -notmatch '^\{[0-9A-Fa-f-]+\}$') { throw "MSI product code was not found" }
$uninstall = Start-Process msiexec.exe -ArgumentList @('/x', $productCode, '/qn', '/norestart') -Wait -PassThru
if ($uninstall.ExitCode -notin @(0, 3010)) { throw "MSI uninstall failed: $($uninstall.ExitCode)" }

$remaining = Get-ItemProperty $roots -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -eq 'Token Fire' }
if ($remaining) { throw "Token Fire uninstall entry remains after uninstall" }

# NSISはrunner専用directoryへinstallし、同一版再installも確認する。
$nsis = Get-ChildItem src-tauri/target/release/bundle/nsis -Filter *.exe -File | Select-Object -First 1
$installDir = Join-Path $env:RUNNER_TEMP 'token-fire-nsis'
if ($installDir -match '\s') { throw "NSIS test path must not contain whitespace" }
foreach ($attempt in 1..2) {
  $install = Start-Process $nsis.FullName -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru
  if ($install.ExitCode -ne 0) { throw "NSIS install failed: $($install.ExitCode)" }
  $exe = Get-ChildItem $installDir -Filter *.exe -File | Where-Object { $_.Name -notmatch 'uninstall' } | Select-Object -First 1
  if (-not $exe) { throw "NSIS installed executable missing" }
  $app = Start-Process $exe.FullName -PassThru
  Start-Sleep -Seconds 8
  if ($app.HasExited) { throw "NSIS installed app exited during launch smoke" }
  Stop-Process -Id $app.Id -Force
}
$uninstaller = Get-ChildItem $installDir -Filter '*uninstall*.exe' -File | Select-Object -First 1
if (-not $uninstaller) { throw "NSIS uninstaller missing" }
$uninstall = Start-Process $uninstaller.FullName -ArgumentList '/S' -Wait -PassThru
if ($uninstall.ExitCode -ne 0) { throw "NSIS uninstall failed: $($uninstall.ExitCode)" }
foreach ($attempt in 1..30) {
  if (-not (Test-Path $exe.FullName)) { break }
  Start-Sleep -Seconds 1
}
if (Test-Path $exe.FullName) { throw "NSIS installed executable remains" }
$remaining = Get-ItemProperty $roots -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'Token Fire' }
if ($remaining) { throw "NSIS uninstall registry entry remains" }
Write-Output 'PASS unsigned MSI/NSIS install, launch, uninstall; NSIS same-version reinstall'
