# 音響世界観監査 — 紙芝居工場

実施日: 2026-08-26

## 境界

音は`WorldState`と`WorldEvent`を解釈する表現であり、破壊・式典・Chillの発生条件を判断しない。発音可否は`AttentionDirector`、Quiet、Attention mode、共通cue gateを通す。開発fixtureは無音のまま維持する。

## 採用する音色

- 木: hammerは短い帯域制限noiseと低いtriangleの組み合わせ。硬いデジタルclickは使わない
- 真鍮: approval、milestone、式典はsine／triangleの短い倍音。高域は細く、連打しない
- 遠い炉: 43Hz／67Hzのtriangleをlow-passへ通し、近接した機械buzzより舞台奥の連続音として扱う
- 雨とChill: filtered noiseと低い二音。回復を報酬ファンファーレにしない
- Error: 低い下降triangleと短いnoise。square alarmのゲーム的な刺さりを避ける

## 間の契約

- 同じupdateで状態、道具、Token、台詞が重なっても発音は一つ
- 最小間隔はCalm 1400ms、Balanced 900ms、Chaos 650ms
- Error／Approvalなど重要音だけ、通常音の250ms後から優先可能
- Quietでは基礎Directorを含む全cueとambientを無音へ寄せる
- fixtureではAudioContextをunlockせず、通知・発音副作用を起こさない

見直し条件は、OS実機でWebAudioの音量差、復帰直後の遅延発音、または重要通知の聞き逃しが確認された場合とする。
