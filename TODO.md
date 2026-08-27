# Token-Fire TODO

## 完全改善計画 v1

境界: 表現層と配布品質に限定する。Codex入力Adapter、Token会計、24段階の相対Energy尺度、保存上限、Project Key、Replay保存形式は変更しない。変更が必要になった場合は、実装前に該当Decisionを更新して合意を取り直す。

### P0 — 検証基盤

- [x] `scripts/capture-ui.mjs`へheadless Chrome／DPR 2／1px正規化／console error収集を恒久化
- [x] 現行7 scene × 3 viewportを再基準化し、`design-qa.md`へmanifestと性能証跡を記録
- [x] 同一fixtureを2回captureしてpixel一致を検証するVitest browser gateを追加
- [x] baseline指定時のpixel差分値・bounds・可視diff PNGをcapture pipelineへ追加
- [x] 固定1/120秒springの収束・NaN不在・seek再現性試験を追加

### P1 — 絵の密度と色調

- [x] 空の彩度、静的な薄雲、遠景の丘を調整
- [x] 床の中景へ枕木、丸太置き場、空荷車レールを段階表示
- [x] 操業札の接続文言を内容側で短縮し、三点リーダを出さない
- [x] 煙、水際、Compact toolbar iconを舞台美術へ馴染ませる

### P2 — 動きの文法

- [x] 固定1/120秒springとsnappy／pop／bouncy／gel／soft／instant tokenを追加
- [x] hop／hammer／celebrationへ体積保存squash、anticipation、velocity impulseを適用
- [x] 道具、煙突、吊り糸、視線の二次運動と一拍一変化を適用
- [x] ReplayFrame形式を変えず、既存`t + event`からevent impulseを固定step再構成
- [x] 全キャラクターへ0.2Hz台の呼吸とseeded 2〜5秒blinkを適用

### P3 — 音と間

- [x] 「木・真鍮・遠い炉」の音色へ揃え、発音を一拍一変化へ制限
- [x] Quiet／Calm／密度制御とfixture無音を自動試験（実Audio graphのgain目標を含む）

### P4 — 配布品質

- [x] macOS／Windows署名、Notarization、Updater、GitHub Releasesの設定と運用文書
- [x] Windows証明書thumbprintの動的Tauri設定と、macOS／Windows署名検証をrelease workflowへ追加
- [x] macOS arm64 release app／DMGを生成し、DMG checksumとadhoc再署名可能性を検証
- [x] 保存移行・クラッシュ復元の自動試験
- [x] OS別E2E matrixとプライバシー説明
- [ ] macOS／Windows実機でDPI、Tray、Quiet、Replay、Installer／Uninstallerを最終確認

A1 / A3 / B1 / B2 / B3 / C3 / D1 / E1 / E2 / E3 / F1 / F2 / G1 の体験実装は完了済み。
E1は動画を常時保存せず、軽量な動作データを保持し、共有時だけWebMまたはJSONへ生成する方式を採用する。

## F2.5 — Full Redesign Gate

F3へ進む前に、紙芝居工場の外見と常駐UIをv0.2の表示契約へ揃える。入力Adapter、Token会計、相対Energy尺度、保存上限、Replay保存形式は変更しない。

- [x] `compact <520px`／`diorama 520〜719px`／`wide >=720px`をPixi・DOM Overlay・PLAY操作面で共有する
- [x] DOM操業札を唯一の視覚HUDとし、上部木枠へ5操作、下部木枠へbrand刻印を収める
- [x] Active／Overdrive／Approval／Complete／Error／Recoveryを照明、炉、煙、姿勢、札で冗長符号化する
- [x] PLAYのcrosshair／破線hotspotを吊り糸と姿勢変化へ置換し、keyboard focus輪郭は維持する
- [x] Token到着→森・荷車・炉・煙→回復在庫と相対尺度、の3段階初回説明を手動送り・Skip・再表示付きで実装する
- [x] Ledgerを右Drawer（Compactは全画面）へ変更し、背景操作禁止、Esc、focus復帰、Tab循環を通す
- [x] Ledgerの伝票／台帳／映写券／切り抜き表現、設備24段階＋6 Act、遅延Replay代表画像を実装する
- [x] 保存値から導出する`WorldPatina`をWide／Diorama／Compactの密度契約どおり表示する
- [x] 5操作icon、空の操業札、Ledger／Patina用の文字なし透過Assetをmanifestと検証へ追加する
- [x] 700ms pollingをrender loopから分離し、論理stepを80ms以下、場面別60／30／15／0fpsへ制御する
- [x] 開発専用の固定world／snapshot／time fixtureで全状態・3基準画面を再現できるようにする
- [x] `npm test`、typecheck、asset check、production build、`cargo check`を通す
- [x] 380×240でclipping／意図しない重なり0、主要文字12px以上、操作領域32px以上を実機確認する
- [x] reduced-motion、Active p95、Recovery p95、pointer反応、hidden render 0を受入基準どおり確認する
- [ ] macOS／Windows Tauri実機でDPI、透明窓、Tray、Quiet、keyboard、Replayを確認する

### 2026-08-16 macOS Tauri実機受入記録

環境はmacOS 26.5.2（25F84）／Apple M5／2560×1664 Retina。`npm run tauri -- build --debug --bundles app`で生成した`Token Fire.app`を380×240へ変更し、DPR 2で確認した。

- PASS: production bundleでPixi資産が`tauri://assets/...`へ誤解決され起動が止まる問題を再現し、`document.baseURI`基準の`tauri://localhost/assets/...`へ正規化して修正。Web Inspectorのerror 0でActive描画まで到達した
- PASS: 380×240でviewport scroll 380×240、clipping 0、意図しない重なり0。主要文字12px以上、5つの上部操作とPLAY hotspotは32px以上。10pxは下部brand刻印だけに限定した
- PASS: macOS「視差効果を減らす」をONにするとTauri WebViewの`prefers-reduced-motion: reduce`が`true`になり、非必須CSS animation／transitionとPixiの揺れ・粒子・明滅を停止した。確認後はOS設定をOFFへ戻した
- PASS: Activeは5.2秒／622 callbackで処理時間p95 3ms（max 3ms）、Recoveryは`meguri`を実機で捕捉した0.9秒／108 callbackでp95 4ms（max 7ms）
- PASS: PLAY中のHinoko pointer反応、TabでSumiへfocus移動、Enter反応、P／L／Q／Escape、Compact Ledgerのfocus、Quiet→WAKE表示を実機確認した
- PASS: Tray退避でWindowが消え、processは継続（退避中0.3% CPU）。1.5秒のhidden区間でrAF callback 0、simulation／poll用processは継続した
- PASS: Demo完了Replayの代表画像を遅延現像し、VP9／960×540／216 frames／約7.30秒のWebMを実機書き出しした。保存形式・30fps生成契約は変更していない
- TODO（macOSで手操作）: メニューバーのToken-Fire iconを左クリックしてWindowが再表示されること、右クリックmenuの「Token-Fireを表示」「隠す」「終了」が各々動作し、「終了」だけprocessを終了することを確認する。Computer Useから`SystemUIServer`のstatus item treeを取得できなかったため、Tray iconそのものの最終クリックだけ未判定
- TODO（Windows実機）: 100%／150% DPIで380×240、角の透明、Tray左／右クリック、Quiet、P／L／Q／Escape、Replay代表画像とWebMまたはJSON fallbackを同じ順で確認する

## F3 — リリース品質

F2.5 Full Redesign Gate完了後、機能・体験実装とは分離して公開配布前に以下を行う。

- [x] macOS arm64 release app／DMGのローカルTauriビルド
- [ ] Windows x86_64／macOS x86_64のCI・実機Tauriビルド
- [ ] macOSコード署名・Notarization
- [ ] Windowsコード署名
- [ ] インストーラー生成とアンインストール確認
- [x] Tauri Updaterの署名鍵・更新エンドポイント設計（runtimeはD-014更新まで無効）
- [x] GitHub Releasesによるdraft配布フロー
- [x] v2 → v3および将来バージョンのセーブデータ移行試験
- [ ] Tray、自動起動、通知、グローバルショートカットのOS別E2E
- [ ] Fullscreenアプリ・画面共有・Do Not DisturbとAttention PolicyのOS別連動
- [ ] 透明ウィンドウ・DPI・マルチモニター・スリープ復帰確認
- [x] 保存直後・破損JSON・未知versionでのWorld／Replay自動復元試験
- [ ] OS process強制終了後のWorld／Replay実機復元試験
- [x] 診断ログとクラッシュレポートの方針決定
- [x] プライバシー説明（CodexローカルJSONL、任意天気座標、外部送信範囲）

F3では新しい遊びを追加せず、現在の体験を安全に配布・更新できる状態へ固める。
