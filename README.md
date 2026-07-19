# Token-Fire 🔥🌲

**Codex が働くほど森が燃え、止まると雨と植林で回復する。**  
ChatGPT / Codex Desktop の横に置いて眺める、Tauri 製のドット絵デスクトップ・ジオラマです。

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
- 6体のオリジナルマスコットと透明SVGアトラス

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

## キャラクター

- **Emberbeak**: 炉を率いる自称王。思考中はハンマーを構え、作業中に叩く
- **Cinder Cub**: Token結晶を扱う炉の作業員。並列Agent時は仲間が増える
- **Axle Beaver**: 丸太台車を往復させる運搬係
- **Vapo**: 湖の水位と蒸気を見守る水の精
- **Spriglet**: 待機中に植林と水やりを担当
- **Drizzle Puff**: 回復フェーズで雨を運ぶ雲の精

## 設計

このプロジェクトでは、入力元と表現を直接結合しません。

```text
Codex JSONL
  ↓ infrastructure / adapter
AgentSnapshot
  ↓ application / controller
World simulation
  ↓ presentation / renderer
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
- `src/presentation/sceneLayout.ts`
  - キャラクター、設備、小物のワールド座標と表示寸法
- `src/presentation/pixelRenderer.ts`
  - 状態に応じた動作、描画順、エフェクト
- `src/presentation/spriteAtlas.ts`
  - SVGアトラスの切り出し、アンカー、回転、反転

HooksやApp Serverを追加する場合も、新しい入力Adapterから同じ `AgentSnapshot` 境界へ変換します。

## 検出について

Token-FireはCodexの非公開内部状態へ侵入せず、ローカルに保存されたJSONLを読み取ります。ログ形式は将来変わる可能性があるため、監視実装は `src-tauri/src/codex/` に隔離しています。

Token表示は厳密な環境負荷の換算ではありません。あくまでCodexの活動量をコミカルな破壊エネルギーとして表現するものです。

## ライセンス

MIT
