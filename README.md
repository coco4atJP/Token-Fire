# Token-Fire 🔥🌲

**Codex が働くほど森が燃え、止まると雨と植林で回復する。**  
ChatGPT / Codex Desktop の横に置いて眺める、Tauri 製のマスコット・デスクトップジオラマです。

> 「環境破壊はたのしいZOY!!」という悪趣味でコミカルな勢いに着想を得た、非公式・非提携のオリジナル作品です。既存作品のキャラクターや素材は使用していません。

## 現在できること

- `~/.codex/sessions/**/rollout-*.jsonl` を自動監視
- Codex Desktop / CLI の思考・ツール実行・完了を推定
- Token増加、Reasoning Effort、並列セッション数で火力が変化
- 稼働中は伐採・延焼・煙・Token精製・湖の蒸発
- 待機中は雨・冷却・植林・湖の回復
- 透明、枠なし、常時最前面のTauriウィンドウ
- Compact / Diorama / Wide の3サイズ
- Codexがなくても試せるデモモード
- ウィンドウ位置とサイズの復元
- 初回 `npm install` 時にOS別アイコンを自動生成
- 透明SVGアトラスからキャラクター・小物・環境を別パーツとして描画

## 登場キャラクター

- **Emberbeak** — Token Forgeを仕切る自称王。稼働中はハンマーを振り回す
- **Spriglet** — 待機中に植林と水やりを担当する植物精霊
- **Drizzle Puff** — 雨と冷却を担当する雲の相棒
- **Cinder Cub** — Token結晶を炉へ運び込む炉のグレムリン
- **Vapo** — 湖に住み、蒸気と水位に反応する水の生き物
- **Axle Beaver** — 丸太と台車を運ぶ建設メカニック

## 使い方

### 必要環境

- Node.js 20+
- Rust stable
- Tauri 2 のOS別ビルド要件
- Codex Desktop または Codex CLI

### 開発起動

```bash
npm install
npm run tauri dev
```

起動後は自動的にCodexのローカルセッションログを監視します。右上の操作ボタンはウィンドウへカーソルを置いた時だけ表示されます。

- `DEMO`: Codex入力と内蔵デモを切り替え
- `SIZE`: 3つの表示サイズを切り替え
- `×`: 終了
- 上端をドラッグ: 移動

### 単体で体験を確認する

Codexが動いていない状態でも、`DEMO` を押すとlowからxhighまで火力が上がり、複数Agent化してから雨と植林へ戻る一連の体験を確認できます。

## 設計

このプロジェクトでは、入力元と表現を直接結合しません。

```text
Codex JSONL
  ↓ infrastructure / adapter
AgentSnapshot
  ↓ application / controller
World simulation
  ↓ presentation / renderer
Sprite Atlas
  ↓ presentation / asset boundary
Tauri window
```

### 責務分割

- `src-tauri/src/codex/`
  - Codexログの探索、増分読み込み、JSON解析、状態正規化
- `src/domain/`
  - Agent状態と環境シミュレーション。TauriやDOMに依存しない
- `src/application/`
  - 入力Adapter、世界、Rendererのオーケストレーション
- `src/infrastructure/`
  - Tauri IPCとデモ入力
- `src/presentation/pixelRenderer.ts`
  - 世界状態を画面構成とアニメーションへ変換
- `src/presentation/spriteAtlas.ts`
  - アトラス座標、透過素材の読み込み、回転・反転・基準点を管理
- `public/assets/token-fire/sprites.svg`
  - キャラクター、小物、建物、樹木、天候エフェクトを分離した透明アトラス

HooksやApp Serverを追加する場合も、新しい入力Adapterから同じ `AgentSnapshot` 境界へ変換します。見た目を変更する場合も、シミュレーションへ触れずアトラスとRendererだけを交換できます。

## 検出について

Token-FireはCodexの非公開内部状態へ侵入せず、ローカルに保存されたJSONLを読み取ります。ログ形式は将来変わる可能性があるため、監視実装は `src-tauri/src/codex/` に隔離しています。

Token表示は厳密な環境負荷の換算ではありません。あくまでCodexの活動量をコミカルな破壊エネルギーとして表現するものです。

## ライセンス

MIT
