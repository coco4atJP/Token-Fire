# OS別E2E受入表

Release draftごとにGitHub ActionsのWindows 2025／macOS 15で実施し、run ID・commit・runner・結果・artifactを記録する。署名資格情報が必要な検証と、GPU／複数monitorなどhosted runnerが保証しない項目は分離し、未実施をPASSとして扱わない。

## 2026-08-27 GitHub-hosted OS別E2E

[Windows OS E2E run 33071111052](https://github.com/coco4atJP/Token-Fire/actions/runs/33071111052)（commit `db6cec3ddf797b1944bfacbf0e90edb5a39a94dc`）で次をPASSした。

- Windows Server 2025のnative Tauri windowを560×350／scale factor 1で起動し、透明CSS契約とnative window sizeを照合
- OS SendKeysでQ→Quiet、L→Ledger、Tab×2、ArrowRight×2→Replay 2件、Escape、P×2を検証
- autostartをenable→元の状態へ復元し、notification送信とhide→show完了を検証
- DPR 1／1.5／2（100／150／200%相当）で380×240をcaptureし、12px文字、32px操作領域、overflow／clipping 0、pixel決定性を検証
- MSI／NSIS生成、MSI silent install、8秒起動、silent uninstall、registry消去を検証
- 証跡artifact `token-fire-windows-os-e2e`と未署名installer artifact `token-fire-windows-unsigned`を保存

[macOS OS E2E run 33072216192](https://github.com/coco4atJP/Token-Fire/actions/runs/33072216192)（commit `81cf13f9e417cf6da4fe372ec86bb6a7a7a5a741`）で次をPASSした。

- macOS 15 hosted runnerでdebug `.app`を560×350／scale factor 1で起動し、Tauri `macOSPrivateApi`＋透明CSS＋native window sizeを照合
- CoreGraphicsのnative key eventでQ→Quiet、L→Ledger、Tab×2、ArrowRight×2→Replay 2件・代表画像2件、Escape、P×2を検証
- autostartをenable→元の状態へ復元し、notification送信、hide時`hidden`→show時`visible`を検証
- x86_64 app／DMGをcross-buildし、Mach-O architecture、Info.plist、`hdiutil verify`、Rosetta 8秒起動を検証
- 証跡artifact `token-fire-macos-os-e2e`と未署名artifact `token-fire-macos-x86_64-unsigned`を保存

このE2Eは新しい物理PCを要求しない。Tray iconそのもののpointer click、実際のOS sleep、GPU固有差、複数monitor topologyはhosted runnerで安定保証できないため、Trayの中核であるhide/showとvisibility復帰までを自動化し、公開必須ゲートからは分離する。コード署名・Notarization・Authenticodeは資格情報投入後に既存release workflowで検証する。

## 2026-08-27 GitHub-hosted Windows smoke

[Windows release smoke run 33050061726](https://github.com/coco4atJP/Token-Fire/actions/runs/33050061726)をcommit `f439a318f7014543ab4ad01cc45d160a2651913f`、`windows-2025`（Windows Server 2025 x86_64）で実行し、次をPASSした。

- `npm test`に含まれるheadless browserのPixi pixel決定性、spring収束・NaN不在・seek再現性
- release contract検証とTauri release executable build
- `Token Fire_0.1.0_x64_en-US.msi`／`Token Fire_0.1.0_x64-setup.exe`の生成
- MSI silent install、Uninstall registry／installed executable検出、8秒間の起動継続、silent uninstall、registry entry消去
- 未署名installer artifact `token-fire-windows-unsigned`（artifact ID `9637312230`、28,182,259 bytes、SHA-256 `5ac01b886af0442ed81076fbf611aa8382f135fe52e5815f135dacf7b2e1d79c`）のupload

これは旧smokeの記録である。DPI、通知、Quiet、Replay等は上記OS別E2Eへ昇格した。Authenticode、GPU／複数monitor、実sleep、Fullscreen／画面共有／Do Not Disturbはこの記録では証明しない。

## 2026-08-27 GitHub-hosted macOS x86_64 smoke

[macOS release smoke run 33051150188](https://github.com/coco4atJP/Token-Fire/actions/runs/33051150188)をcommit `fa06c6c58260628e314a6b8ae0b32c96f98cebdc`、macOS 15.7.7 arm64 hostで実行し、次をPASSした。

- `x86_64-apple-darwin`向けrelease app／DMGのcross-build
- app executableのMach-O x86_64 architectureとInfo.plist構文
- `Token Fire_0.1.0_x64.dmg`の`hdiutil verify`（CRC32 `$3CD3DAF9`）
- Rosetta経由でx86_64 executableが8秒間終了せず稼働するlaunch smoke
- 未署名artifact `token-fire-macos-x86_64-unsigned`（artifact ID `9637757469`、38,066,827 bytes、SHA-256 `433f3cb5190e7fabf01f1fa967a8565cd63e33b811d059109922164d3e83105c`）のupload

これは旧cross-build／Rosetta smokeの記録である。透明window、keyboard、Quiet、Replay等は上記OS別E2Eへ昇格した。Developer ID署名、Notarization、stapling、DMG UI、対話upgradeは資格情報投入後のrelease gateに残る。

## macOS arm64／x86_64

- [x] unsigned DMG checksum／image検証、Rosetta初回起動
- [x] 560×350、透明window設定＋透明CSS＋native起動
- [x] hide→showとvisibility復帰（Tray icon実clickはhosted runner非保証）
- [x] 自動起動enable／restore、通知送信、Q Quiet／Wake、P／L／Escape／Tab／Arrow
- [x] Replay 2件と代表画像2件をnative key eventで表示
- [ ] Developer ID署名、Notarization、stapling、署名済みDMG upgrade（資格情報待ち）
- [ ] GPU固有描画、複数monitor、実sleep、Fullscreen／画面共有／Focus連動（runner非保証）

## Windows x86_64

- [x] unsigned MSI／NSIS生成、MSI install／launch／uninstall lifecycle
- [x] 100% native scale＋150%／200% WebView相当DPR、380×240表示契約
- [x] hide→show（Tray icon実clickはhosted runner非保証）
- [x] 自動起動enable／restore、通知送信、Q Quiet／Wake
- [x] P／L／Q／Escape／Tab／Arrow、Replay 2件と代表画像
- [ ] Authenticode署名、署名済みMSI／NSIS upgrade（資格情報待ち）
- [ ] GPU固有描画、複数monitor、実sleep、Fullscreen／画面共有／Do Not Disturb（runner非保証）

## 共通性能・表示契約

- [x] 7 scene × 3 viewportのcapture差分を承認
- [x] 主要文字12px以上、操作領域32px以上、clipping／意図しない重なり0
- [x] Active p95 ≤ 3ms、hidden render 0、reduced-motionでspring／粒子／明滅停止
- [x] fixture無音、Quiet無音、Calm cue間隔1400ms以上
