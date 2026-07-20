# AGENTS.md

このリポジトリでは、変更理由と境界を日本語で説明してください。

## 最優先の設計原則

**責務分割・境界管理。**

- Codex固有形式をUIや世界シミュレーションへ漏らさない
- DOM/Tauri依存を`domain`に持ち込まない
- 表現追加のために入力Adapterを変更しない
- 入力元追加のためにRendererを変更しない
- 非公開または不安定な外部形式は、専用Adapter内へ隔離する
- Tokenの累積値・差分化・重複排除はRust Adapterで完結させる
- RendererやAudioDirectorが破壊発生条件を独自判断しない
- 破壊・式典・Chillの意味は`WorldEvent`として一度だけ定義する
- 永続化形式を`WorldState`やDOM操作へ直接混ぜない

## レイヤー

```text
src-tauri/src/codex       Codex JSONL adapter / Token差分正規化
src/domain                Token燃焼・世界状態・イベント契約
src/application           ユースケースとオーケストレーション
src/infrastructure        Tauri IPC・外部入力・永続化Adapter
src/presentation          Canvas描画・DOM・音響Presenter
```

## 主要境界

```text
Codex JSONL
  ↓
AgentSnapshot
  ↓
Token combustion model
  ↓
WorldState + WorldEvent
  ├─ PixelRenderer
  ├─ ExperienceOverlay
  ├─ AudioDirector
  └─ WorldPersistence
```

- `AgentSnapshot`は外部Agentの状態を正規化する境界
- `WorldState`は連続シミュレーションの境界
- `WorldEvent`は破壊、事故、式典、Chillを表現へ渡す境界
- `WorldPersistence`は保存先を隠蔽する境界
- RendererとAudioは互いを呼ばず、同じ状態とイベントを個別解釈する

## コンセプト上の不変条件

- キャラクターは可愛く、やっていることは非情にする
- Tokenを消費していないActive時間に、Token由来の伐採を発生させない
- 回復フェーズは善行ポイントではなく、次回燃焼分の森林在庫補充として描く
- 同時に、Agent利用後の認知負荷を下げるChillな休止時間として成立させる
- ユーザーを責めず、環境負荷の現実をブラックコメディとして扱う
- Token値をWh・CO₂・水使用量へ正確そうに偽換算しない
- 元ネタの台詞は低確率の隠し演出に留め、通常は独自の迷言を使う

## 実装方針

- MVPでも起動から終了まで体験を完結させる
- 動かない抽象化より、交換可能な小さな完成品を優先する
- 後方互換のないJSONL変更はParserだけで吸収する
- イベントの大量発生はDirectorで集約し、表示・音響を渋滞させない
- 完了・エラーなど重要な状態遷移は通常イベントより優先する
- `prefers-reduced-motion`とミュートを尊重する
- 既存作品のキャラクターや素材を直接使用しない
