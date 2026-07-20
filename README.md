# Token-Fire 🔥🌲

**AIがTokenを燃やすたび、可愛い作業員たちが嬉々として環境を破壊する。**  
Tokenを燃やしていない間だけ、雨・植林・静かな音で工場と人間の認知負荷を冷却する、Tauri製デスクトップ・ジオラマです。

> 「環境破壊はたのしいZOY!!」という悪趣味でコミカルな勢いに着想を得た、非公式・非提携のオリジナル作品です。既存作品のキャラクターや素材は使用していません。

## コンセプト

Token-Fireは環境保護を褒めるアプリではありません。

- AI推論が実際に計算資源・電力・冷却を必要とする現実を、ブラックコメディとして可視化する
- Token投入と破壊の因果を、炉・伐採・冷却水・煙へ明確につなげる
- キャラクターは徹底して可愛く、やっていることは非情にする
- 作業完了時は反省せず、利益パレードとグリーンウォッシュで祝う
- 待機中は次回燃焼分の森林在庫を補充しながら、人間側にはChillな休止時間を渡す
- ユーザーを責めず、罪悪感ごと笑える玩具にする

表示されるToken・破壊スコアは実測CO₂や水使用量ではありません。`INFO`または`I`キーからReality Checkを確認できます。

## 現在できること

- `~/.codex/sessions/**/rollout-*.jsonl` を自動監視
- Codex Desktop / CLIの思考・ツール実行・完了を推定
- 生成Tokenの累積値を差分化し、重複せず燃料として投入
- **Tokenが来ないActive時間では工場がアイドリングするだけで、木は燃えない**
- Token量、Reasoning Effort、並列Agent数で炉の処理速度と破壊規模が変化
- 稼働中は伐採・延焼・煙・Token精製・湖の冷却水利用
- `shell`、`apply_patch`、Web Search、Compacting、Subagent増加に固有イベント
- Error時は成果ゼロでも消費済みTokenを環境債務へ記録
- 完了時は紙吹雪と`SUSTAINABLE*`スタンプでグリーンウォッシュ式典
- 待機中は雨、植林、蛍、ゆっくりしたモーション、Chill音響へ移行
- 累計燃焼Token、無駄になったToken、伐採数、工場Tierをローカル保存
- 再起動後も焼け跡と環境債務を引き継ぎ、オフライン中は少しだけ回復
- 悪徳企業コントと低確率のレアイベント
- 透明、枠なし、常時最前面のTauriウィンドウ
- Compact / Diorama / Wideの3サイズ
- Codexがなくても試せるデモモード
- 6体のオリジナルマスコットと透明SVGアトラス
- Web Audio APIによるプロシージャルサウンド

## 体験の流れ

### 1. 受注・Thinking

Emberbeakがハンマーを構え、工場がアイドリングします。まだ生成Tokenが届いていないため、森は燃えません。

### 2. Token焼却

生成Tokenが炉へ投入されると、Token結晶、ハンマー、煙、伐採、湖の冷却水消費が始まります。大量Token時は燃焼イベントが集約され、イベント表示が渋滞しないよう制御します。

### 3. 過剰生産

Reasoning Effortや並列Agent数が上がると、作業員と煙突が増え、工場Tierが恒久的に成長します。

### 4. 完了・グリーンウォッシュ

焼却Token数を発表し、苗木一本で相殺したことにして式典を行います。

### 5. Plantation Chill

工場停止中はDrizzle PuffとSprigletが森林在庫を補充します。雨音、低刺激の和音、蛍、呼吸するようなUIで、Agent利用後の認知負荷を少し下げます。

## キャラクター

全員かわいいですが、環境倫理は持っていません。

- **Emberbeak**: 自称王兼CEO。Token処理量と工場拡張だけを気にする
- **Cinder Cub**: Token燃料の精製担当。ときどき無断で燃料を味見する
- **Axle Beaver**: 森林在庫を運ぶ物流責任者。最大積載量は参考値
- **Vapo**: 湖の精ではなく、実質的には可愛い冷却水タンク
- **Spriglet**: 自然保護ではなく、高速再生する燃料林の管理者
- **Drizzle Puff**: 森より先に工場を冷やす冷却担当。Chill時間も受け持つ

## イベント例

- `TOKEN INCINERATION`: Tokenを炉へ焼却
- `FOREST INVENTORY WITHDRAWAL`: 木材在庫を引き出す
- `COOLANT ACQUISITION`: 湖を期限未定で借りる
- `PARALLELIZATION ACHIEVED`: Agent数に合わせ煙突を増設
- `CONTEXT LANDFILL`: Contextを圧縮処分
- `ZERO OUTPUT · FULL EMISSIONS`: Errorで成果なし、環境債務だけ残る
- `SUSTAINABILITY CERTIFIED`: 完了時のグリーンウォッシュ式典
- `PLANTATION INTERMISSION`: 認知負荷を冷やす植林休止
- 炉のくしゃみ、Token盗み食い、Subagent利益ダンスなどのレアイベント

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

起動後は自動的にCodexのローカルセッションログを監視します。右上の操作ボタンはウィンドウへカーソルを置いた時だけ表示されます。

- `DEMO`: Codex入力と内蔵デモを切り替え
- `SIZE`: 3つの表示サイズを切り替え
- `INFO`: Reality Checkを表示
- `🔊 / 🔇`: サウンド切替
- `×`: 終了
- 上端をドラッグ: 移動
- `D`: Codex / Demo切替
- `I`: Reality Check
- `M`: サウンド切替
- `Esc`: Reality Checkを閉じる

サウンドは初期状態で有効です。ブラウザや一部WebViewでは自動再生制限があるため、初回だけウィンドウ内をクリックまたはキー入力すると音が始まります。設定はローカルに保存されます。

### 単体で体験を確認する

Codexが動いていない状態でも、`DEMO`を押すとlowからxhighまで火力が上がり、複数Agent化、グリーンウォッシュ式典、Chill植林まで一周します。

## サウンド設計

音声ファイルは同梱せず、Web Audio APIで軽量にリアルタイム合成します。

- **炉の環境音**: 稼働状態、熱、汚染、Reasoning Effortに応じて低音が変化
- **ハンマー**: 実際にToken燃焼が起きている間だけ打撃状態へ移行
- **Token結晶**: Token差分と並列Agent数に応じたチャイム
- **破壊イベント**: 伐採、工場拡張、エラー、式典に固有SE
- **Chill**: 雨音と非常に小さな持続和音。作業再開時は素早く消える
- **ミュート**: `M`またはツールバー。設定を保存

基礎音響は`audioDirector.ts`、風刺イベントとChill音響は`experienceAudio.ts`へ分離しています。

## 設計

```text
Codex JSONL
  ↓ Rust adapter / token delta normalization
AgentSnapshot
  ↓ application controller
Token combustion model
  ↓
World simulation ── World event queue ── Environmental debt
  ├─ PixelRenderer
  ├─ ExperienceOverlay
  ├─ AudioDirector
  └─ WorldPersistence
       ↓
Tauri window + Web Audio + localStorage
```

### 責務分割

- `src-tauri/src/codex/`: ログ探索、増分読み込み、Token差分化、状態正規化
- `src/domain/world.ts`: Token燃焼、破壊、植林、Chill、環境債務
- `src/domain/worldEvent.ts`: 表現に依存しないイベント契約
- `src/domain/eventDirector.ts`: ツールイベント、レアイベント、式典、イベント集約
- `src/application/appController.ts`: 入力・世界・表示・音・保存のオーケストレーション
- `src/infrastructure/worldPersistence.ts`: 永続化とオフライン回復
- `src/presentation/pixelRenderer.ts`: ジオラマとキャラクター描画
- `src/presentation/experienceOverlay.ts`: 迷言、式典、Chill、Reality Check
- `src/presentation/audioDirector.ts`: 基礎環境音と既存SE
- `src/presentation/experienceAudio.ts`: イベント音とChill和音

RendererとAudioは同じ状態・イベントを別々に解釈し、互いを直接呼びません。

## 検出と現実の環境負荷について

Token-FireはCodexの非公開内部状態へ侵入せず、ローカルに保存されたJSONLを読み取ります。ログ形式は将来変わる可能性があるため、監視実装は`src-tauri/src/codex/`へ隔離しています。

Token表示は厳密な環境負荷の換算ではありません。モデル、ハードウェア、バッチング、データセンター、電源構成などが不明なため、Wh・CO₂・水使用量を正確そうに捏造しません。あくまで実際の計算資源消費を題材にした風刺です。

## ライセンス

MIT
