# OS別E2E受入表

Release draftごとに実機で実施し、OS build番号・端末・DPI・結果・証跡pathを記録する。未実施をPASSとして扱わない。

## 2026-08-27 GitHub-hosted Windows smoke

[Windows release smoke run 33050061726](https://github.com/coco4atJP/Token-Fire/actions/runs/33050061726)をcommit `f439a318f7014543ab4ad01cc45d160a2651913f`、`windows-2025`（Windows Server 2025 x86_64）で実行し、次をPASSした。

- `npm test`に含まれるheadless browserのPixi pixel決定性、spring収束・NaN不在・seek再現性
- release contract検証とTauri release executable build
- `Token Fire_0.1.0_x64_en-US.msi`／`Token Fire_0.1.0_x64-setup.exe`の生成
- MSI silent install、Uninstall registry／installed executable検出、8秒間の起動継続、silent uninstall、registry entry消去
- 未署名installer artifact `token-fire-windows-unsigned`（artifact ID `9637312230`、28,182,259 bytes、SHA-256 `5ac01b886af0442ed81076fbf611aa8382f135fe52e5815f135dacf7b2e1d79c`）のupload

これは非対話のhosted runner smokeである。Authenticode、upgrade、DPI、透明窓、Tray、通知、Quiet、Replay、複数monitor、sleep復帰、Fullscreen／画面共有／Do Not Disturbは証明しないため、以下の実機項目は未完了のまま維持する。

## 2026-08-27 GitHub-hosted macOS x86_64 smoke

[macOS release smoke run 33051150188](https://github.com/coco4atJP/Token-Fire/actions/runs/33051150188)をcommit `fa06c6c58260628e314a6b8ae0b32c96f98cebdc`、macOS 15.7.7 arm64 hostで実行し、次をPASSした。

- `x86_64-apple-darwin`向けrelease app／DMGのcross-build
- app executableのMach-O x86_64 architectureとInfo.plist構文
- `Token Fire_0.1.0_x64.dmg`の`hdiutil verify`（CRC32 `$3CD3DAF9`）
- Rosetta経由でx86_64 executableが8秒間終了せず稼働するlaunch smoke
- 未署名artifact `token-fire-macos-x86_64-unsigned`（artifact ID `9637757469`、38,066,827 bytes、SHA-256 `433f3cb5190e7fabf01f1fa967a8565cd63e33b811d059109922164d3e83105c`）のupload

これはarm64 host上のcross-build／Rosetta smokeであり、Developer ID署名、Notarization、stapling、Intel物理実機、DMG UI、Applicationsへの対話install、upgrade、DPI／Tray等のE2Eは証明しない。

## macOS arm64／x86_64

- [ ] Developer ID署名、Notarization、staplingを検証
- [ ] DMG install、初回起動、上書きinstall、Applicationsから削除
- [ ] 380×240／560×350／800×480、Retina DPR 2、透明角、複数monitor
- [ ] Tray左click表示、右click menu、閉じる→Tray、終了だけprocess終了
- [ ] 自動起動、通知許可拒否、Cmd+Shift+F、Quiet／Wake、Calm
- [ ] Replay代表画像とWebM／JSON fallback、クラッシュ後World／Replay復元
- [ ] Fullscreen、画面共有、Focus／Do Not Disturb、sleep復帰

## Windows x86_64

- [ ] Authenticode署名を検証し、MSI／NSIS install・upgrade・uninstall
- [ ] 100%／150%／200% DPI、380×240、透明角、複数monitor
- [ ] Tray左／右click、閉じる→Tray、終了、taskbar非表示
- [ ] 自動起動、通知許可、Ctrl+Shift+F、Quiet／Wake、Calm
- [ ] P／L／Q／Escape／Tab、Replay代表画像とWebM／JSON fallback
- [ ] クラッシュ後World／Replay復元、sleep復帰
- [ ] Fullscreen、画面共有、Do Not Disturb相当との干渉確認

## 共通性能・表示契約

- [ ] 7 scene × 3 viewportのcapture差分を承認
- [ ] 主要文字12px以上、操作領域32px以上、clipping／意図しない重なり0
- [ ] Active p95 ≤ 3ms、hidden render 0、reduced-motionでspring／粒子／明滅停止
- [ ] fixture無音、Quiet無音、Calm cue間隔1400ms以上
