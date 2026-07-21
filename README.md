# Token-Fire 🔥🌲

**AIがTokenを燃やすたび、可愛い作業員たちが嬉々として環境を破壊する。**  
燃やしていない間だけ、雨・植林・静かな音で工場と人間の認知負荷を冷却する、Tauri製デスクトップ・ジオラマです。

> 「環境破壊はたのしいZOY!!」という悪趣味でコミカルな勢いに着想を得た、非公式・非提携のオリジナル作品です。既存作品のキャラクターや素材は使用していません。

## コンセプト

Token-Fireは環境保護を褒めるアプリではありません。

- AI推論が計算資源・電力・冷却を必要とする現実をブラックコメディとして可視化する
- Token投入と破壊の因果を、炉・伐採・冷却水・煙へ明確につなげる
- キャラクターは徹底して可愛く、やっていることは非情にする
- 完了時は反省せず、利益パレードとグリーンウォッシュで祝う
- 待機中は次回燃焼分の森林在庫を補充し、人間側にはChillな休止時間を渡す
- ユーザーを責めず、罪悪感ごと笑えるデスクトップ玩具にする

表示は実測Wh・CO₂・水使用量ではありません。Token量、モデル名、Reasoning Effort、並列Agent数から、`ほぼおひるね`〜`説明をあきらめるほど`までの**24段階のふわっとした相対表現**を作ります。

## 現在できること

- Codex JSONLの生成Tokenを差分化して燃料へ変換
- Token量・モデル名・Effort・並列Agent数を24段階の可愛い相対表現へ変換
- プロジェクトごとの森、湖、工場、環境債務、記録、Replay
- 小煙突・配管・足場が24段階でじんわり増える工場成長
- 6体の自律生活、悪徳企業コント、`PLAY`限定の直接操作
- 事故や式典だけを控えめに残す`LEDGER`
- 動作データ保存と、共有時だけのWebM生成
- HTML環境債務報告書、全事業所JSON
- ローカル時刻と任意の外気天候連動
- 承認待ちベル、任意OS通知、Calm / Balanced / Chaos、Quiet / Wake
- System Tray、自動起動、単一起動、グローバル表示ショートカット
- 条件付きJSON Event Pack
- Plantation Chill、Web Audio、Compact / Diorama / Wide

## 重要な挙動

- Tokenが来ないActive時間は工場がアイドリングするだけで木を燃やさない
- Abort／Errorでは成果ゼロ・排出満額として環境債務だけを残す
- 完了時は紙吹雪と`SUSTAINABLE*`スタンプでグリーンウォッシュ式典
- 待機中は次回燃焼分を植林しながら、人間側の認知負荷も冷却する
- 収集率、未発見数、ストリークは表示しない
- 動画ファイルは常時保存せず、約1秒ごとの軽量動作データだけを保持する
- TokenをWh・CO₂・水使用量へ正確そうに偽換算しない

## 操作

- `PLAY / DONE`: 直接操作
- `LEDGER`: 記録、事業所、Replay、イベント、設定
- `QUIET / WAKE`: 30分休止・解除
- `DEMO / CODEX`: デモとCodex入力の切替
- `SIZE`: 表示サイズ切替
- `INFO`: Reality Check
- `🔊 / 🔇`: サウンド
- `×`: Trayへ隠す
- `P / L / Q / D / I / M`: キーボード操作
- `Ctrl/Cmd + Shift + F`: ウィンドウ表示

## 開発起動

```bash
npm install
npm run tauri dev
```

必要環境はNode.js 20+、Rust stable、Tauri 2のOS別ビルド要件、Codex DesktopまたはCodex CLIです。

## 設計

```text
Codex JSONL
  ↓ Rust adapter / Token差分・project・model正規化
AgentSnapshot
  ↓ AppController
Project World + Token Combustion
  ↓
WorldState + WorldEvent + EnvironmentalDebt
  ├─ CharacterDirector / EventDirector / EventPackRegistry
  ├─ PixelRenderer / ExperienceOverlay / InteractionController
  ├─ AudioDirector / AttentionDirector
  ├─ ReplayRecorder / ReplayExporter
  └─ ProjectWorldPersistence
       ↓
Tauri window + Tray + Notification + localStorage
```

責務境界と実装ルールは[`AGENTS.md`](AGENTS.md)、採用済みの判断・数値・副作用・見直し条件は[`docs/DECISIONS.md`](docs/DECISIONS.md)を参照してください。

## 検証

- TypeScript/Vite本番ビルド
- Rust/Tauri `cargo check`
- Codex Parserテスト
- PLAYでのキャラクター反応
- 24段階表示、記録棚、深夜Quietの一時WAKE
- Replay保存とWebM生成
- 環境債務HTML生成
- JSONイベントパック読込
- Compact表示、水平オーバーフロー、ブラウザコンソール

## 現実の環境負荷について

外部へ送るのは、ユーザーが任意で有効化した天気取得時の手入力座標だけです。モデル、ハードウェア、バッチング、データセンター、電源構成が不明なため、正確そうなWh・CO₂・水使用量を捏造しません。24段階の表現は風刺的な相対尺度です。

## 残っているTODO

公開配布品質だけを`F3`として残しています。詳細は[`TODO.md`](TODO.md)を参照してください。

- Windows / macOS実機ビルド
- コード署名、Notarization
- インストーラー、GitHub Releases、自動更新
- OS別Tray、通知、自動起動、Fullscreen／画面共有／Do Not Disturb、マルチモニターE2E
- セーブデータ移行とクラッシュ復元試験

## ライセンス

MIT