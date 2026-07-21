# AGENTS.md

このリポジトリでは、変更理由と境界を日本語で説明してください。

採用済みの判断、既定値、副作用、見直し条件は[`docs/DECISIONS.md`](docs/DECISIONS.md)を参照してください。挙動や制約の意味を変える変更では、コードだけでなく該当Decisionも更新してください。

## 最優先の設計原則

**責務分割・境界管理。**

- Codex固有形式をUIや世界シミュレーションへ漏らさない
- DOM/Tauri依存を`domain`へ持ち込まない
- 表現追加のために入力Adapterを変更しない
- 入力元追加のためにRendererを変更しない
- 非公開または不安定な外部形式は専用Adapterへ隔離する
- Tokenの累積値・差分化・重複排除はRust Adapterで完結させる
- RendererやAudioDirectorが破壊発生条件を独自判断しない
- 破壊・式典・Chillの意味は`WorldEvent`として一度だけ定義する
- 保存先やOS機能を`WorldState`へ直接混ぜない

## レイヤー

```text
src-tauri/src/codex       Codex JSONL adapter / Token差分正規化
src/domain                Token燃焼・世界状態・キャラクター・イベント契約
src/application           Director群とユースケースのオーケストレーション
src/infrastructure        Tauri IPC・OS機能・設定・プロジェクト別永続化
src/presentation          Canvas描画・DOM・音響・Replay書き出し
```

## 主要境界

```text
Codex JSONL
  ↓
AgentSnapshot
  ├─ project / model / session metadata
  ↓
Token combustion model
  ↓
WorldState + WorldEvent + EnvironmentalDebt
  ├─ CharacterDirector
  ├─ EventDirector / EventPackRegistry
  ├─ PixelRenderer / ExperienceOverlay
  ├─ AudioDirector / AttentionDirector
  ├─ ReplayRecorder / ReplayExporter
  └─ ProjectWorldPersistence
```

- `AgentSnapshot`は外部Agent状態、作業ディレクトリ、モデル名を正規化する境界
- `WorldState`は一つのプロジェクト事業所の連続シミュレーション境界
- `WorldEvent`は破壊、事故、式典、Chill、追加イベントパックを表現へ渡す境界
- `WorldPersistence`はプロジェクト別の森、工場、記録、Replayを保存する境界
- `AttentionDirector`は通知、音、イベント密度、Quiet時間を統制する境界
- Renderer、Audio、Overlayは互いを呼ばず、同じ状態とイベントを個別解釈する

## コンセプト上の不変条件

- キャラクターは可愛く、やっていることは非情にする
- Tokenを消費していないActive時間に、Token由来の伐採を発生させない
- 回復フェーズは善行ポイントではなく、次回燃焼分の森林在庫補充として描く
- 同時に、Agent利用後の認知負荷を下げるChillな休止時間として成立させる
- ユーザーを責めず、環境負荷の現実をブラックコメディとして扱う
- Token値をWh・CO₂・水使用量へ正確そうに偽換算しない
- Token量・モデル名・並列度による24段階の表現は、必ず「ふわっとした相対表現」と明示する
- 元ネタの台詞は低確率の隠し演出に留め、通常は独自の迷言を使う
- 工場成長は急な変身ではなく、小設備・配管・煙突がじんわり増える変化にする
- 記録棚とイベント履歴は「こういうこともあった」と振り返る場所にし、収集率・未解除数・ストリークを前面へ出さない
- Replayは原則として軽量な動作データを保存し、共有時に動画へ生成する
- ローカルモデルの実電力計測は対象にしない

## 操作と常駐

- 通常時はPC操作を奪わず、直接操作は`PLAY`中だけ有効にする
- 閉じる操作はTray退避、明示的な終了はTrayメニューへ分ける
- 承認待ち通知は便利さを優先するが、Quiet時間と通知頻度制限を必ず通す
- 外部天気は任意設定とし、位置情報権限を要求しない
- Fullscreen・画面共有などのOS固有Attention制御はF3以降で検証する

## 実装方針

- 動かない抽象化より、交換可能な小さな完成品を優先する
- 後方互換のないJSONL変更はParserだけで吸収する
- イベント大量発生はDirectorで集約し、表示・音響を渋滞させない
- 完了・エラー・承認待ちなど重要な状態遷移は通常イベントより優先する
- `prefers-reduced-motion`、ミュート、Quiet、Calmモードを尊重する
- カスタムイベントパックは入力を検証し、表現コードを直接実行させない
- 既存作品のキャラクターや素材を直接使用しない
- F3では新しい遊びを追加せず、署名・配布・更新・OS別E2Eへ集中する
- Project Key、保存上限、Replay方式、相対Energy尺度、Quiet既定値、外部通信、Event Pack Schema、Codex監視窓を変更する場合は`docs/DECISIONS.md`を同時更新する