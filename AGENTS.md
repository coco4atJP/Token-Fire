# AGENTS.md

このリポジトリでは、変更理由と境界を日本語で説明してください。

## 最優先の設計原則

**責務分割・境界管理。**

- Codex固有形式をUIや世界シミュレーションへ漏らさない
- DOM/Tauri依存を `domain` に持ち込まない
- 表現追加のために入力Adapterを変更しない
- 入力元追加のためにRendererを変更しない
- 非公開または不安定な外部形式は、専用Adapter内へ隔離する

## レイヤー

```text
src-tauri/src/codex  Codex JSONL adapter
src/domain           純粋な状態・シミュレーション
src/application      ユースケースとオーケストレーション
src/infrastructure   Tauri IPC・外部入力
src/presentation     Canvas描画・DOM
```

## 実装方針

- MVPでも起動から終了まで体験を完結させる
- 動かない抽象化より、交換可能な小さな完成品を優先する
- 後方互換のないJSONL変更はParserだけで吸収する
- Token値を実環境負荷として断定しない
- 既存作品のキャラクターや素材を直接使用しない
