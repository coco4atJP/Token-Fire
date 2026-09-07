# Token-Fire v0.2 Design QA

実施日: 2026-08-11

対象: Hibana Works紙芝居工場のFull UI／世界観リデザイン

実装URL: `http://127.0.0.1:1420/?tfFixture=mera&tfTime=dusk&tfGrowth=13&tfWidth=560&tfHeight=350`

## Ground truth

- 方向性: `art-source/token-fire/references/desktop-diorama-mockup.png`（1672×941）
- Production art: `art-source/token-fire/references/environment-production-sheet.png`（1448×1086）
- 同一viewportの実装前監査: `.../token-fire-audit-2026-08-11/03-compact.png`（380×240）、`06-wide.png`（800×480）
- 実装後の同時比較: `artifacts/ui-audit/compare-source-vs-wide-final.png`、`compare-audit-vs-wide-final.png`、`compare-compact-final.png`

## Capture contract

- 固定状態: 全7 `WorldScene`を`tfFixture`、dusk、growth 18で560×350へ固定。fixtureはin-memory persistenceを使い、時刻、world、履歴、Replayを毎回同値へ戻す。
- CSS viewport: Compact 380×240、Diorama 560×350、Wide 800×480。
- Capture: 各CSS viewportと同じpixel寸法へ切り出し。Browser環境はDPR 2、保存画像は1 image px / 1 CSS pxへ正規化された。
- Browser console: Vite接続debug以外のerrorなし。

## Full-screen evidence

- `artifacts/ui-audit/compact-qa-380x240.png`
- `artifacts/ui-audit/diorama-qa-final-560x350.png`
- `artifacts/ui-audit/wide-qa-800x480.png`

## Focused evidence

- Approval: `artifacts/ui-audit/approval-qa-560x350.png`
- Recovery: `artifacts/ui-audit/recovery-qa-560x350.png`
- Compact Ledger: `artifacts/ui-audit/ledger-compact-qa-380x240.png`
- PLAY: `artifacts/ui-audit/play-qa-560x350.png`
- 初回説明: `artifacts/ui-audit/briefing-qa-380x240.png`
- Replay映写券: `artifacts/ui-audit/replays-qa-560x350.png`

## WorldScene matrix（560×350）

- Poka: `artifacts/ui-audit/scene-poka-qa-560x350.png`
- Mera: `artifacts/ui-audit/scene-mera-qa-560x350.png`
- Gogo: `artifacts/ui-audit/scene-gogo-qa-560x350.png`
- Approval: `artifacts/ui-audit/scene-approval-qa-560x350.png`
- Kirari: `artifacts/ui-audit/scene-kirari-qa-560x350.png`
- Zero Output: `artifacts/ui-audit/scene-zero-output-qa-560x350.png`
- Meguri: `artifacts/ui-audit/scene-meguri-qa-560x350.png`

7枚をproduction art／diorama方向性と同じ寸法で比較し、札、炉の稼働、残留煙、照明、作業員姿勢が状態ごとに矛盾しないことを確認した。

## Findings and fixes

| Severity | Finding | Resolution |
| --- | --- | --- |
| P1 | Compact Ledgerがbrowser viewport基準のmedia queryを参照し、固定380px舞台で左側が欠けた | `data-layout=compact`を共有契約として全画面化し、378×238pxのpanel内へ収めた |
| P1 | 通常イベントが操業札のApproval／Recovery表記を隠した | WorldSceneを札のtitleへ固定し、Error → Approval → Complete → Quiet → 通常状態の順で表示した |
| P2 | Ledgerを開いてPLAYを終了した後、PLAYのaria-labelだけ終了状態に残った | 表示、`aria-pressed`、`aria-label`を同時に復帰させた |
| P2 | 開発fixtureのToken差分と保存worldが時間経過で状態を変えた | snapshot差分を固定し、render直前にworld／time／growth／tree stateを再適用した |
| P2 | 操業札のconnection行と映写券actionが10pxだった | 意味を持つ文字を12pxへ上げ、10pxはbrand／kicker等の装飾だけに限定した |
| P1 | fixtureがsettings／world保存を汚染し、Replay画像がcaptureごとに変化した | 開発専用in-memory persistenceと固定履歴／Replayへ分離し、本番bundleから除外した |
| P1 | 24 Replayを同時にWebGL現像すると常駐舞台のcontextを失い得た | Ledgerを開いた時に一件ずつ遅延現像し、Promise cacheを再利用するよう変更した |
| P1 | modal中のglobal shortcutが背景PLAYや別dialogを開けた | 入力、modal、menu、修飾keyを共通guardで遮断し、Escapeだけを許可した |
| P1 | 75／90／144／165Hzで60fps cadenceが約38〜55fpsへ落ちた | 描画clockを目標intervalで進め、4 refresh rateを1秒列で自動試験した |
| P2 | 静的署名があっても設備成長とweather/timeを毎frame再描画した | 背景、床、環境色、成長設備、Patina、吊り糸、木枠を署名変更時だけ再構築した |

P0、未解決P1、未解決P2はない。380pxで意図しないclipping／重なりはなく、操作領域は32px以上、本文は12px以上、見出しは16px以上。Approvalは6人正面＋炉停止＋札、Recoveryは雨＋在庫回復＋札で冗長に判別できる。LedgerはDiorama／Wideで舞台を残し、Compactで全画面となる。

macOS／WindowsのTauri実機DPI・透明窓・Trayと、実機p95性能計測はリポジトリのF2.5 Gateに未完了項目として残す。これは今回のbrowser Design QAの合否には含めない。

Final result: passed

---

## 完全改善計画 v1 — 2026-08-26再基準化

対象は表現層、検証基盤、配布品質。Codex入力Adapter、Token会計、24段階Energy尺度、保存上限、Project Key、Replay保存形式は変更していない。したがってD-002／D-003／D-004／D-006／D-007／D-018／D-020のDecision更新は不要と判断した。Updater runtimeとendpointも未有効のため、D-014の外部通信既定値は維持している。

### Capture evidence

- P1前baseline: `artifacts/ui-audit/improvement-v1-baseline/`（7 scene × 3 viewport、DPR 2原寸と1px正規化）
- P1/P2後final: `artifacts/ui-audit/improvement-v1-final/`（同じ21組、全組pixel決定性確認、baseline比較の可視diff PNG 21枚）
- 30秒motion reference: `artifacts/ui-audit/improvement-v1-motion/contact-sheet.png`と`motion-reference.json`
- warm render性能: `artifacts/ui-audit/improvement-v1-performance/capture-manifest.json`
- 元レビュー: `artifacts/ui-audit/review-2026-08-25/`（ユーザー提供証跡として保持）

`scripts/capture-ui.mjs`はinstalled Chromeを`headless=new`で起動し、DPR 2で描画した@2x PNGと、1 image px / 1 CSS pxへ正規化したPNGを同時保存する。各captureはbrowser console error 0、viewport overflow 0、操業札12px以上、札内clipping 0、toolbar 32px以上を自動判定する。Pixi決定性はfixture描画loopを停止し、同じ`world.elapsed`から明示的に2回renderしたCanvas RGBAを比較する。`--baseline`指定時はchannel差分数、最大delta、boundsとマゼンタの可視diff PNGをsceneごとに生成する。browser gateは通常の`npm test`とLinux CIへ組み込んだ。

RepositoryにはPR比較に必要な1px正規化baseline／final／diffとmanifestを保持する。容量の大きい@2x PNGはpipeline内で寸法・SHA-256を検証し、CI artifactへ毎回生成するがversion管理しない。

### 改善結果

| 項目 | 結果 |
| --- | --- |
| 空 | duskへ中性紙色12% overlay、静的な薄雲3枚、遠景丘1枚を署名再構築レイヤーへ追加 |
| 床 | growth由来の枕木2〜5、丸太置き場0〜3、空レール0〜3をWorldPatinaへ追加。設備tierは不変 |
| 札 | `CODEX · Hibana QA`等へ内容側で短縮。Compactはscene別短文を使い、CSS ellipsisを廃止 |
| 煙 | 主煙をおおむねalpha 0.44〜0.51、補助煙を0.50〜0.54へ抑え、遅延追従へ変更 |
| 水 | シアンを暖かい低彩度tealへ寄せ、泡／苔の縁を追加 |
| Compact icon | 64px絵込みPNGを隠し、同じ5操作を18px単純silhouetteで表示 |
| motion | 固定1/120秒spring、約19% pop、velocity impulse、体積保存、hammer anticipation、hop、道具／煙突／吊り糸の二次運動を実装 |
| Replay motion | 保存schemaを変えず、連続する`ReplayFrame.event`と`t`からevent age／impulseを再構成 |
| idle | 全6キャラクターへ0.22Hz呼吸とseeded 2〜5秒blinkを実装。motionScale 0では中立値へ固定 |
| pacing | CharacterDirectorをact／表情／位置の0.8秒stagingへ変更。Audioも共通cue gateで一拍一音 |
| audio | 木、真鍮、遠い炉へ音色を整理。Quietは基礎音を含め無音、Calm最小間隔1400ms、fixture無音 |

### Performance and contracts

- Active 7 scene × 3 viewport warm render: 各120 samples、p95最大0.9ms（Gogo）、max最大2.3ms。Mera p95最大0.4ms
- Meguri Recovery warm render: 各120 samples、p95最大0.3ms、max最大0.8ms
- 既存macOS Tauri Active p95約3msの受入上限を超えない。最終releaseでは`docs/OS-E2E.md`に従い実機値を再測定する
- 7 scene × 3 viewport: console error 0、pixel mismatch 0、viewport overflow 0、札clipping 0、12px／32px契約PASS。baselineからの変更は21/21で検出し、diff PNG 21枚を保存
- reduced-motion／Quietは既存`readPresentationMotionPolicy`経路を通り、spring／呼吸／blink／粒子／明滅を静止・抑制する
- `npm run tauri -- build --debug --bundles app`でmacOS debug app bundleを再生成し、`src-tauri/target/debug/bundle/macos/Token Fire.app`まで完了

### Release gate

Release workflow、署名／Notarization秘密情報契約、Updater設計、v2→v3・future version・破損保存・Replay復元試験、Privacy、OS別E2E表を追加した。Windowsはimportした証明書のthumbprintを一時Tauri configへ渡し、全EXE／MSIのAuthenticodeを検証する。macOSもcodesign／Gatekeeper／stapler検証をworkflow内で必須化した。ローカルではarm64 release appと42.9MBのUDZO DMGを生成し、DMG CRC、Info.plist、temp copyへのadhoc再署名と`codesign --verify --deep --strict`を通した。GitHub-hosted Windows 2025ではrun `33050061726`でx86_64 MSI／NSISを生成し、未署名MSIのsilent install、8秒起動、uninstallとartifact uploadを通した。GitHub-hosted macOS 15 arm64ではrun `33051150188`でx86_64 app／DMGをcross-buildし、Mach-O architecture、DMG CRC、Rosetta経由の8秒起動とartifact uploadを通した。Developer ID資格情報を使う署名／Notarization、Authenticode、Windows／Intel Mac物理実機、signed installerのupgrade、OS process強制終了、Fullscreen／画面共有／Do Not Disturbは外部環境依存のため未実施であり、draft releaseを公開する前の明示ゲートとして残す。

Final local/browser result: passed. Release hardware/credential gate: pending.
