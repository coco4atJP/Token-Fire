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
