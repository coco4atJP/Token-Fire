# Token-Fire Release Runbook

## 現在の方針

D-021に従い、初期版は証明書なしの公開previewとする。Apple Developer ID・Notarization・Windows Authenticodeはユーザー数が増えてきた段階で再検討する。資格情報の登録は現在の公開条件ではない。

macOSは`APPLE_SIGNING_IDENTITY=-`によるad-hoc署名を使い、Developer ID署名や公証と区別する。透明windowに`macOSPrivateApi: true`を使うため、Mac App Storeには提出せずDMGを直接配布する。Windows MSI／NSISは未署名。自動更新は無効のまま維持する。

## 公開手順

1. 公開対象commitで通常CIを成功させ、package／Cargo／Tauriのversionを一致させる。`npm run release:check`と`node scripts/release-preflight.mjs`を通す。
2. 対象commitへ`token-fire-v0.1.0`を付ける。既存tagを別commitへ移動しない。Workflowの手動実行も可能だが、同じ版の別commitによる成果物の混在を避ける。
3. Release desktopはmacOS arm64／x86_64、Windows x64をbuildして**draft／pre-release**を作る。同時に両OSの既存E2Eをreusable workflowとして実行する。
4. 配布する同一DMGからappをコピーしてad-hoc整合性・architecture・8秒起動・同一版置換・app削除を検証する。MSI／NSISでinstall・8秒起動・uninstall、NSISで同一版再installを検証する。Windows署名状態は`NotSigned`であることを確認する。
5. 全job成功後、`checksums`がdraftから4成果物をdownloadし、版番号とファイル構成を検査して`SHA256SUMS`を添付する。buildや受入が失敗したdraftは公開しない。
6. run URL・commit・結果を`docs/OS-E2E.md`またはRelease本文へ記録する。版別本文`docs/releases/v0.1.0.md`には未署名の初回起動手順と既知の制限を含める。
7. draftを公開pre-releaseへ変更する。署名・公証が成功したとは表記しない。

## 検証の境界

GitHub-hosted Windows 2025／macOS 15のkeyboard、Quiet、Replay、通知、自動起動、hide/show、DPI契約を既存smokeで確認する。新しい物理PCは必須としない。

hosted runnerの起動成功はブラウザdownload後のGatekeeper／SmartScreen通過を保証しない。OS保護を全体で無効にする手順は提供しない。Fullscreen／画面共有／集中モード連動、GPU差、複数monitor、実sleep、OS強制終了後の復元は未保証として扱う。

初版には旧公開版がないため、公開版間upgradeは対象なし。同一版再installはそれと区別する。ユーザーデータの再install・uninstall後の保持は未検証。JSON exportは世界DBだけで、設定や読込UIを含まないため、完全なバックアップ／復元機能と説明しない。保存形式と上限はD-004〜D-007を維持し、保存互換・破損JSON・未知version・保存直後復元を単体試験する。

## 将来の署名導入

導入するときは`release` Environmentへ次のSecretを登録する。値はチャットやIssueに貼らない。`node scripts/release-preflight.mjs --signing`で空欄を確認できるが、現在の未署名Workflowからは呼ばない。

- Apple: `APPLE_CERTIFICATE`（Developer ID Application p12のbase64）、`APPLE_CERTIFICATE_PASSWORD`、`KEYCHAIN_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_API_ISSUER`、`APPLE_API_KEY`、`APPLE_API_KEY_BASE64`（p8のbase64）
- Windows: `WINDOWS_CERTIFICATE`、`WINDOWS_CERTIFICATE_PASSWORD`。証明書提供方式に応じてimport／署名方式を再検討する

署名用Workflowは導入時に実装し、macOSは`codesign --verify --deep --strict`、`spctl --assess`、`xcrun stapler validate`、Windowsは`Get-AuthenticodeSignature`のValidを必須とする。未署名版からのupgradeも検証する。

## 自動更新と診断

`src-tauri/tauri.updater.example.json`は例であり通常buildへ読み込まない。有効化時はD-014とPRIVACYを更新し、更新用署名鍵、endpoint、check頻度、送信情報、rollbackを決める。

自動crash reporter・telemetryは導入しない。CI logとユーザーが明示exportした世界DBを診断材料とする。利用者数増加の判断のために新しい外部通信を追加しない。
