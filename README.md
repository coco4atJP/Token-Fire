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

### Token燃焼と世界

- `~/.codex/sessions/**/rollout-*.jsonl`をRustで増分監視
- Codex Desktop / CLIの思考、ツール実行、承認待ち、完了を推定
- 生成Tokenの累積値を差分化し、重複やInputだけの増加を燃料へ数えない
- Tokenが来ないActive時間は工場がアイドリングするだけで木を燃やさない
- Token量、モデル名、Effort、並列Agent数を24段階の相対的な「多さ」へ変換
- 稼働中は伐採、延焼、煙、Token精製、湖の冷却水利用
- Abort／Errorでは成果ゼロ・排出満額として環境債務だけを残す
- 完了時は紙吹雪と`SUSTAINABLE*`スタンプでグリーンウォッシュ式典
- 待機中は雨、植林、蛍、ゆっくりしたモーション、Chill音響へ移行

### プロジェクト別事業所

Codexの作業ディレクトリごとに別の世界を持ちます。

- 森、湖、焼け跡、工場設備をプロジェクト別に保存
- 累計Token、無駄Token、伐採、全焼、最大Agent数を事業所別に記録
- 別のリポジトリへ移ると作業員と環境債務台帳を自動で切り替え
- 旧v2データは`Legacy Factory`として移行
- オフライン中は最大12時間分だけ静かに回復

### じんわりした工場成長

累計の相対Token量に応じて24段階で少しずつ変化します。

- 小煙突、配管、足場、設備灯が徐々に増える
- 大きな変身やレベルアップ画面は出さない
- 4段階ごとにだけ、小さな設備増設イベントを表示
- 通常画面では現在段階を控えめに表示

### キャラクターの生活と直接操作

- Codex状態と関係なく、帳簿確認、燃料盗み食い、過積載、植林、昼寝などを自律的に行う
- キャラクター同士の悪徳企業コントを小さな吹き出しで表示
- `PLAY`中だけキャラクターをクリック可能
- Emberbeak、Cinder、Axle、Vapo、Spriglet、Drizzleに固有反応
- 森をクリックすると「経営者手動処理」で木を一本処理
- Drizzleの雨配送位置をドラッグ操作
- 通常時は入力レイヤーを無効化し、PC操作を邪魔しない

### 記録棚

`LEDGER`からだけ開く、控えめな企業史です。

- 「最近こういうこともありました」と事故・式典・珍しい日常を保存
- プロジェクト事業所一覧
- 遭遇済みイベントの記憶
- 収集率、未発見数、ストリークは表示しない
- 環境債務報告書をHTMLで書き出し
- 全事業所データをJSONで書き出し

### Replay / タイムラプス

動画ファイルは自動保存しません。

- タスク中の世界状態を約1秒ごとの軽量な動作データとして保存
- 長いタスクは自動的に間引き
- プロジェクトごとに直近24タスクまで保持
- 共有したい時だけ動作データから短いWebMを生成
- `MediaRecorder`が利用できない環境ではJSON動作データへフォールバック

### 時刻と天気

- 端末のローカル時刻で朝、昼、夕方、夜の空を変更
- 外の天気との連動は任意
- 場所名、緯度、経度を手入力し、位置情報権限は要求しない
- 雨、雪、霧、嵐を背景とイベントパックへ反映

### 通知とAttention Policy

- 承認待ち時にベル演出と任意のOS通知
- 完了通知は任意
- `Calm / Balanced / Chaos`でイベント密度を変更
- 30分の`QUIET`／`WAKE`
- 深夜Quiet中でも30分だけ起こせる一時上書き
- Quiet時間中は通知、イベント音、目立つ吹き出しを抑制
- 1分あたりのイベントSE数を制限
- `prefers-reduced-motion`、ミュート、低点滅設定を尊重

### 常駐

- System Trayから表示、非表示、終了
- ×ボタンは終了ではなくTrayへ退避
- 二重起動時は既存ウィンドウを前面へ戻す
- 任意のOS自動起動
- `Ctrl/Cmd + Shift + F`で表示
- 透明、枠なし、常時最前面
- Compact / Diorama / Wideの3サイズ

### Event Pack

- 組み込みイベントをパックとして管理
- 条件: Active／Chill、Agent数、24段階の多さ、Tool、時刻、天気
- JSONパックを記録棚から追加可能
- 読み込んだデータは検証し、任意コードは実行しない

## キャラクター

全員かわいいですが、環境倫理は持っていません。

- **Emberbeak**: 自称王兼CEO。Token処理量と工場拡張だけを気にする
- **Cinder Cub**: Token燃料の精製担当。ときどき無断で燃料を味見する
- **Axle Beaver**: 森林在庫を運ぶ物流責任者。最大積載量は参考値
- **Vapo**: 湖の精ではなく、実質的には可愛い冷却水タンク
- **Spriglet**: 自然保護ではなく、高速再生する燃料林の管理者
- **Drizzle Puff**: 森より先に工場を冷やす冷却担当。Chill時間も受け持つ

## 使い方

### 必要環境

- Node.js 20+
- Rust stable
- Tauri 2のOS別ビルド要件
- Codex DesktopまたはCodex CLI

### 開発起動

```bash
npm install
npm run tauri dev
```

### 操作

- `PLAY / DONE`: 直接操作の開始・終了
- `LEDGER`: 記録、事業所、Replay、イベント、設定
- `QUIET / WAKE`: 30分休止・解除
- `DEMO / CODEX`: 内蔵デモとCodex入力の切替
- `SIZE`: 3サイズ切替
- `INFO`: Reality Check
- `🔊 / 🔇`: サウンド切替
- `×`: Trayへ隠す
- 上端をドラッグ: ウィンドウ移動
- `P / L / Q / D / I / M`: 各操作のショートカット
- `Esc`: 開いている操作面を閉じる
- `Ctrl/Cmd + Shift + F`: Trayから表示

ブラウザや一部WebViewでは初回の音声開始にクリックまたはキー入力が必要です。Codexがなくてもブラウザプレビューと`DEMO`で一連の体験を確認できます。

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

主要な責務は`AGENTS.md`を参照してください。

## 現実の環境負荷について

Token-FireはCodexの非公開内部状態へ侵入せず、ローカルのJSONLを読み取ります。外部へ送るのは、ユーザーが任意で有効化した天気取得時の手入力座標だけです。

モデル、ハードウェア、バッチング、データセンター、電源構成が不明なため、正確そうなWh・CO₂・水使用量を捏造しません。24段階の表現は、Token量とモデル名などから作る風刺的な相対尺度です。

## 残っているTODO

公開配布品質だけを`F3`として残しています。詳細は[`TODO.md`](TODO.md)を参照してください。

- Windows / macOS実機ビルド
- コード署名、Notarization
- インストーラー、GitHub Releases、自動更新
- OS別Tray、通知、自動起動、Fullscreen／画面共有／Do Not Disturb、マルチモニターE2E
- セーブデータ移行とクラッシュ復元試験

## ライセンス

MIT
