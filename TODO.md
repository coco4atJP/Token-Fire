# Token-Fire TODO

A1 / A3 / B1 / B2 / B3 / C3 / D1 / E1 / E2 / E3 / F1 / F2 / G1 の体験実装は完了済み。
E1は動画を常時保存せず、軽量な動作データを保持し、共有時だけWebMまたはJSONへ生成する方式を採用する。

## F3 — リリース品質

機能・体験実装とは分離し、公開配布前に以下を行う。

- [ ] Windows / macOS の実機Tauriビルド
- [ ] macOSコード署名・Notarization
- [ ] Windowsコード署名
- [ ] インストーラー生成とアンインストール確認
- [ ] Tauri Updaterの署名鍵・更新エンドポイント設計
- [ ] GitHub Releasesによる配布フロー
- [ ] v2 → v3および将来バージョンのセーブデータ移行試験
- [ ] Tray、自動起動、通知、グローバルショートカットのOS別E2E
- [ ] Fullscreenアプリ・画面共有・Do Not DisturbとAttention PolicyのOS別連動
- [ ] 透明ウィンドウ・DPI・マルチモニター・スリープ復帰確認
- [ ] クラッシュ後のWorld／Replay復元試験
- [ ] 診断ログとクラッシュレポートの方針決定
- [ ] プライバシー説明（CodexローカルJSONL、任意天気座標、外部送信範囲）

F3では新しい遊びを追加せず、現在の体験を安全に配布・更新できる状態へ固める。
