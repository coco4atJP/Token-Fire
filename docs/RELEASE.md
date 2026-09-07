# Token-Fire Release Runbook

## 現在のゲート

`src-tauri/tauri.updater.example.json`は設計例であり、通常buildからは読み込まない。Updater plugin、公開鍵、endpointを`tauri.conf.json`へ入れる前に、D-014（外部通信）を更新し、鍵の保管者とrollback手順を合意する。

`.github/workflows/release.yml`は`token-fire-v*` tagまたは手動実行でmacOS arm64／x86_64とWindows x86_64をbuildし、GitHub Releaseを必ずdraftで作る。公開は`docs/OS-E2E.md`完了後の手動操作とする。

`.github/workflows/windows-release-smoke.yml`は署名秘密情報を使わず、Windows Server 2025 x86_64で通常test、DPR 1／1.5／2の表示契約、native keyboard／Quiet／Replay、autostart／notification／hide-show、MSI／NSIS生成、MSI silent install、8秒起動、uninstallを検証する。ここで得るartifactは公開用ではなく、OS E2Eとinstall lifecycleの回帰検出専用である。

`.github/workflows/macos-release-smoke.yml`はmacOS 15 hostでE2E専用debug `.app`を起動し、透明window、native keyboard／Quiet／Replay、autostart／notification／hide-showを検証する。その後x86_64 app／DMGをcross-buildし、Mach-O architecture、Info.plist、DMG checksum、Rosetta経由の8秒起動を検証する。公開用workflowも`macos-15`へ固定した。Developer ID署名・Notarizationは資格情報投入後のrelease workflowで行う。

macOSの透明windowはTauriの`app.macOSPrivateApi: true`を必要とする。この設定はMac App Store審査と両立しないため、Token-FireのmacOS配布は計画どおりDeveloper ID署名・Notarization済みDMGの直接配布に限定する。

## GitHub Environment `release` secrets

### macOS

- `APPLE_CERTIFICATE`: Developer ID Application `.p12`のbase64
- `APPLE_CERTIFICATE_PASSWORD`: `.p12` export password
- `KEYCHAIN_PASSWORD`: CI一時keychain用のランダム値
- `APPLE_SIGNING_IDENTITY`: `Developer ID Application: ...`
- `APPLE_API_ISSUER`, `APPLE_API_KEY`: App Store Connect API issuer／key ID
- `APPLE_API_KEY_BASE64`: `.p8` private keyのbase64

Notarizationとstaplingの完了後、`codesign --verify --deep --strict --verbose=2`、`spctl --assess --type execute --verbose=4`、`xcrun stapler validate`を成果物へ実行する。

### Windows

- `WINDOWS_CERTIFICATE`: OV/EV `.pfx`のbase64
- `WINDOWS_CERTIFICATE_PASSWORD`: PFX password

CIはCurrentUser certificate storeへ一時importし、その証明書からthumbprintを取得して一時Tauri configの`bundle.windows.certificateThumbprint`へ渡す。`digestAlgorithm`はSHA-256、timestampはDigiCertを使う。build後は全EXE／MSIの`Get-AuthenticodeSignature`が`Valid`でなければworkflowを失敗させる。MSI／NSISのinstall・uninstall後に設定とworld dataの扱いが説明どおりであることは実機確認する。

## Updater設計（未有効）

- Tauri signing keyはOS code-signing keyと分離し、秘密鍵はGitHub `release` Environmentだけに置く
- `tauri-action`が生成する署名付き`latest.json`をGitHub Releasesへ置く
- endpointは`https://github.com/OWNER/REPOSITORY/releases/latest/download/latest.json`
- Windows install modeは既定の`passive`。無表示の`quiet`は採用しない
- rolloutはdraft → 手動download E2E → 公開の順。壊れたreleaseはlatestから外し、既知正常版を再公開する
- runtimeでの自動check頻度、ユーザー同意UI、送信されるversion／target／archはD-014更新時に確定する

## 保存と復元

保存形式、Project Key、Replay上限はD-004／D-006／D-007を維持する。release前に`worldPersistence.test.ts`でv2→v3、正史名移行、保存直後の再生成、破損JSON fallback、未知future versionの非破壊を通す。OSクラッシュ強制終了は実機E2Eで、最後の5秒保存窓より前のworld／Replayが復元されることを確認する。

## 診断方針

自動クラッシュ送信は導入しない。CI logとユーザーが明示exportしたworld databaseだけを診断材料にする。将来crash reporterを導入する場合は、送信内容、保存期間、送信先、opt-inをD-014と`PRIVACY.md`へ先に追加する。

## v0.1.0公開準備

初版は自動更新を有効にせず、GitHub Releasesからの手動ダウンロードとする。runtime、保存形式、外部通信の契約は変更しない。公開本文は`docs/releases/v0.1.0.md`をWorkflowが読み込む。

`node scripts/release-preflight.mjs`はtagとpackage versionの一致、版別リリースノートの存在を確認する。`--signing`は必須Secretの空欄も確認し、欠けた**名前だけ**を出す。資格情報の有効性は後段の署名・公証と署名検証で確認する。

1. `release` Environmentへ上記9件のSecretを登録する。秘密鍵やパスワードをIssue・PR・チャットへ貼らない。
2. 公開対象commitでCIと両OS smokeを成功させ、run URLとSHAを`docs/OS-E2E.md`へ記録する。
3. `package.json`、Cargo、Tauriのversion一致を確認し、対象commitへ`token-fire-v0.1.0`を付ける。タグは別commitへ移動しない。
4. Release desktopを実行する。署名チェック後、macOS arm64／x86_64とWindows x64の全jobが成功したことを確認する。途中失敗したdraftは公開しない。
5. draftから実際にダウンロードした署名付きDMG／MSI／NSISでinstall・起動・upgrade・uninstallを確認する。初版で旧公開版がない場合、同一版再インストールと開発版からの移行を分けて記録する。旧公開版からのupgradeは「対象なし」としPASSを捏造しない。
6. 再インストール・更新前後の世界、設定、Replayを比較する。アンインストール後の保持／削除結果を記録し、公開本文に追記する。JSON exportには設定が含まれず、読込UIもないため完全な復元手段と説明しない。
7. 公開本文と成果物を確認してdraftを公開する。

署名済み成果物の検証は資格情報待ち。未署名smoke、localStorage復元の単体試験をその代替としてPASSにしない。
