# Token-Fire 意思決定記録

この文書は、コードを読まないと分からない設計判断と、将来の変更で意図せず壊しやすい前提を記録する。

- **Accepted**: 現在の実装とプロダクト方針として採用済み
- 数値は調整可能だが、判断の目的や副作用が変わる場合はこの文書も更新する
- F3の実機検証で変更が必要になった場合は、理由と影響範囲を追記する

## D-001 — Token-Fireは環境啓発ではなくブラックコメディである

**状態:** Accepted

AI推論の資源消費を、可愛い作業員が非情に環境破壊するデスクトップ玩具として表現する。ユーザーを責めず、破壊を気持ちよく見せた後に現実の計算資源消費が少しだけ残る体験にする。

### 帰結

- キャラクターは善良な環境保護者ではなく、全員が悪徳工場の共犯者
- 完了時は反省ではなく利益式典とグリーンウォッシュ
- 植林は次回燃焼分の森林在庫補充であり、善行ポイントにしない
- Chillは自然保護報酬ではなく、Agent利用後の人間の認知負荷を下げる休止時間
- ストリーク、エコ得点、ユーザーを責める通知は導入しない

## D-002 — 実際の生成Tokenだけを自動破壊の燃料にする

**状態:** Accepted

CodexがActiveである時間ではなく、Rust Adapterが算出した生成Token差分だけを自動破壊の燃料へ投入する。Input Contextの増加や重複した累積値は燃料に数えない。

### 理由

「Tokenを使った瞬間に何かが犠牲になる」という作品の因果関係を守るため。

### 帰結

- Token差分が0なら工場はアイドリングするだけで、Token由来の伐採を起こさない
- タスク終了直前の未処理Tokenは、完了・Abort判定の前に環境債務へ精算する
- Abort／Errorは`ZERO OUTPUT · FULL EMISSIONS`として成果なし・消費ありを残す
- `PLAY`中の手動焼却はToken由来ではない明示的な例外とし、`manualDamage`へ別計上する
- 大量Tokenでも論理QueueやRust Adapterで切り捨てず、表示イベント側だけを集約する

## D-003 — 電力は24段階の相対表現にし、実測値を装わない

**状態:** Accepted

Token量、モデル名、Reasoning Effort、並列Agent数から重み付きTokenを作り、24段階の可愛い言葉へ変換する。Wh、CO₂、水使用量として表示しない。

### 現在のヒューリスティック

- Effort倍率: `minimal 0.55 / low 0.8 / medium 1 / high 1.45 / xhigh 2.05`
- 並列Agent: 2体目以降、1体につき`+24%`
- モデル名から相対重みを推定
  - 小型・高速系: `0.68〜0.82`
  - 標準的なCodex／Sonnet／GPT-5系: `1.12`
  - Pro／Max／Opus／強Reasoning系: `1.42`
- 不明モデルは`1.0`

これは科学的測定ではなく演出上の順序尺度である。モデル名の分類や閾値を変更しても、実測値のような表示へ変えてはならない。ローカルモデルの実電力計測は対象外。

## D-004 — プロジェクト世界は作業ディレクトリで識別する

**状態:** Accepted

Codexの`project_path`をプロジェクト世界のキーとして使う。パスが取得できない場合だけSession IDへフォールバックする。同じ作業ディレクトリの複数セッションは同じ森と工場を共有する。

### 帰結

- ディレクトリ名変更・移動は別事業所として扱われる
- 同名ディレクトリでもパスが違えば別事業所
- パスが取れない一時セッションはSession単位の世界になる
- パスはローカル保存とユーザー操作によるJSON出力に含まれるが、天気取得などの外部通信へ送らない

### 見直し条件

Git Repositoryのremote URLや安定したWorkspace IDを安全に取得できるようになった場合。

## D-005 — 世界・設定・Event PackはローカルWebViewストレージへ保存する

**状態:** Accepted

現段階ではTauriのファイルDBを追加せず、WebViewの`localStorage`へ保存する。

### 保存キー

- 世界DB: `token-fire.worlds.v3`
- 設定: `token-fire.settings.v1`
- カスタムEvent Pack: `token-fire.event-packs.v1`

### 帰結

- 保存失敗や容量不足でもライブシミュレーションは継続する
- データベース全体をJSONとして手動エクスポートできる
- v2の単一世界は`Legacy Factory`へ移行する
- 本格的なファイル保存、暗号化、バックアップ、復元保証はF3で検証する

## D-006 — 記録量には静かな上限を設ける

**状態:** Accepted

コレクション圧と無制限な保存増加を避けるため、各事業所で以下だけを保持する。

- 履歴: 最新160件
- Replay: 最新24件
- Replay frame: 最大900件を目安とし、超えたら偶数frameを残して半分へ間引く
- Event Discovery: 遭遇済みイベントの初回・最終・回数だけを保持
- `token-burn / tree-harvest / coolant-drain`の通常反復イベントは履歴棚へ毎回保存しない

古い出来事は自然に棚から消える。永続的な完全監査ログではなく、「最近こういうこともあった」と振り返るための記憶である。

## D-007 — Replayは動作データを保存し、共有時だけ動画化する

**状態:** Accepted

タスク中は約1秒ごとに世界の要約frameを記録し、動画ファイルは常時保存しない。共有操作時にCanvasで再構成し、WebMを生成する。

### 現在の出力

- 960×540
- 30fps
- 約7〜18秒へ圧縮
- VP9 → VP8 → WebMの順で利用可能な形式を選択
- `MediaRecorder`が使えない場合はReplay JSONを出力
- 音声は現在のReplay動画に含めない

過去の動作データを将来の新しい見た目で再生成できる一方、元の画面を完全再現する映像証拠ではない。

## D-008 — 工場成長は24段階だが、大きな変身として見せない

**状態:** Accepted

累積した重み付きTokenから24段階の`growthLevel`を算出し、小設備、配管、足場、煙突などを少しずつ追加する。主要シルエットを急激に切り替えない。

### 帰結

- UI上は`1/24〜24/24`として確認可能
- 内部の大分類`factoryTier`は6成長段階ごとの4区分だが、体験の主役にはしない
- 工場Milestoneは4成長段階ごとに控えめな文言で出す
- 成長通知、解除演出、進捗バーを前面へ出さない

## D-009 — 直接操作はPLAY中だけ、ジオラマ内部だけで行う

**状態:** Accepted

通常時はデスクトップ操作を奪わない。`PLAY`中だけDOMのInteraction Layerを有効化する。

### 現在の操作

- キャラクタークリック: 固有反応
- Drizzle Puffドラッグ: 雨の配送位置を横方向へ変更
- 森側の地面クリック: 近い木を手動焼却し、`manualDamage`へ記録

### 非採用

- 他アプリのウィンドウを足場にするOSレベル操作
- 通常時の常時クリック取得
- グローバルなカーソル監視

これらは干渉・権限・OS差が大きいため、別の明示的な意思決定なしに追加しない。

## D-010 — キャラクターの自律生活は低頻度の状態機械にする

**状態:** Accepted

高度なAgentやLLMをキャラクター制御へ使わず、決められたLife Beatを低頻度で選ぶ。稼働中とChillで候補を変え、式典を妨げない。

### 現在の概算間隔

- Active: 13〜30秒
- Chill: 9〜21秒

予測不能性を少し加えつつ、常駐アプリのCPU使用量と注意負荷を抑える。将来行動を増やす場合もRendererへ直接ランダム分岐を追加しない。

## D-011 — Attention Policyは山場を守るために使う

**状態:** Accepted

### 既定値

- モード: `Balanced`
- Quiet Hours: 23:00〜07:00
- 承認待ち通知: ON
- 完了通知: OFF
- Event SE上限: 8回／分
- Reduce Flash: OFF
- 手動Quiet: 30分
- 通知の最短間隔: 45秒
- WebViewが非表示の間はQuiet相当

### Event Packの実効概算間隔

- Chaos: 約12〜19秒
- Balanced: 約34〜56秒
- Calm: 約95〜156秒

Countdown速度と次回Timerの両方へMode倍率を反映しているため、Calm／Chaosの差は意図的に大きい。初回だけは共通Timer 26をMode倍率で消費する。

承認待ちなど重要な状態は通常イベントより優先するが、Quietと通知頻度制限を通す。深夜Quietは一時的にWAKEできる。

## D-012 — 外気天気は任意の手入力座標だけを使う

**状態:** Accepted

端末の時刻は常に利用する。天気連動は初期OFFで、位置情報権限を要求せず、ユーザーが入力した緯度・経度だけをOpen-Meteoへ送る。

### 現在値

- 初期表示地点: Yokohama `35.4437, 139.638`（天気取得はOFF）
- 更新間隔: 15分
- 失敗後の再試行: 30分
- 取得値: 現在気温、Weather Code

天気取得時だけ入力座標がOpen-Meteoへ送信される。Codexログ、プロジェクトパス、Token量、モデル名は送信しない。

## D-013 — Event Packはデータだけを許可し、コード実行を許可しない

**状態:** Accepted

Event PackはローカルJSONとして読み込み、条件・文章・Tone・重み・表示時間だけを許可する。JavaScript、HTML、CSS、任意URL、任意ファイルアクセスは許可しない。

### 現在の制限

- Pack ID: 英数字とハイフン、3〜64文字
- 最大200イベント／Pack
- Title最大120文字、Line最大240文字
- Duration: 1.5〜12秒
- Weight: 0.05〜20
- Tone: `destruction / warning / chill / ceremony`
- 条件: phase、Agent数、Energy Level、Tool、天気、時間帯

Event Packは新しい表現コードやSpriteを注入できない。高度な拡張機構を追加する場合は別のセキュリティ設計が必要。

## D-014 — Codex JSONLは不安定な外部形式として、保守的に監視する

**状態:** Accepted

Codex JSONLを正式な安定APIとはみなさず、Rust Adapterへ隔離する。読み取り失敗や未知recordはアプリ全体を停止させず無視・縮退する。

### 現在の監視値

- `CODEX_HOME`があれば使用、なければ`~/.codex`
- Sessions scan: 1.5秒間隔
- 新規追跡対象: 直近10分に更新された`rollout-*.jsonl`
- Active判定のstale window: 45秒
- Completed表示: 5秒
- 最大追跡file: 64
- 接続時Backfill: 最大1MiB
- 1回のLive read: 最大4MiB
- 途中行buffer: 最大256KiB
- 追跡開始後、更新から約60分経過したfileは追跡対象から除外
- Token差分は切り捨てず`saturating_add`し、表示負荷はWorld Event側で抑える

非常に古いSessionや巨大な過去ログを完全再生しない。JSONL形式変更はParser／Watcherだけで吸収する。

## D-015 — 閉じる・終了・自動起動を分離する

**状態:** Accepted

メイン画面の`×`は終了ではなくTrayへ隠す。明示的な終了はTrayメニューから行う。自動起動は初期OFFとする。

### 現在の常駐操作

- Tray左クリック: 表示してFocus
- Trayメニュー: 表示／隠す／終了
- Global Shortcut: `CmdOrControl+Shift+F`
- Single Instance: 2回目の起動は既存Windowを表示

OS別のTray・自動起動・Shortcut動作保証はF3の実機E2Eへ残す。

## D-016 — 通知権限は必要になった時だけ要求する

**状態:** Accepted

起動直後には通知権限を要求しない。承認待ち、完了、Errorなど通知対象が実際に発生し、設定で有効な場合にだけ権限を確認・要求する。権限拒否やPlugin失敗は通知だけを無効化し、シミュレーションを継続する。

## D-017 — F3では新しい遊びを増やさない

**状態:** Accepted

現在の機能セット以降、公開配布前のF3ではコード署名、Notarization、Installer、Updater、Release、OS別E2E、保存移行、復元、Privacy説明へ集中する。

機能追加と配布品質の不確実性を同時に増やさないため。見直しはWindows／macOSで常用可能なReleaseが作成された後に行う。

## D-018 — リアルタイム表示は有界にし、論理Tokenは欠落させない

**状態:** Accepted

Tokenの会計値と、画面へ同時に出す表現量を分離する。Token差分と未処理燃料は現実的なJavaScript安全整数の範囲で全量保持し、イベント・粒子・1frameの処理回数だけを制限する。

### 現在のBackpressure

- World Event待ちQueue: 最大8件
- Particle: 最大480個
- 1 updateのToken燃焼Event生成: 最大3回
- 1 updateの伐採Event生成: 最大2回
- Rust側のToken累積: `u64::saturating_add`
- TypeScript側のToken Queue: `Number.MAX_SAFE_INTEGER`まで保持

大量Token時は演出が集約・遅延することがあるが、環境債務の論理値を表示都合で切り捨てない。Event Queueから溢れた個別演出は省略され得る。

## D-019 — Offline Recoveryは最大12時間の部分回復にする

**状態:** Accepted

アプリ停止中も世界を完全停止させず、再起動時に最大12時間分だけ熱・汚染・水位・植林を回復させる。長期間閉じただけで環境債務や焼け跡が完全に消える設計にはしない。

### 現在の挙動

- 熱、汚染を時間に応じて低下
- 水位、雨を時間に応じて回復
- 燃焼中の木は再起動時に焦げ木へ確定
- 焦げ木は2.5時間経過後から苗木化
- 苗木は時間に応じて成長
- 累計Token、伐採数、事故、工場成長は減らさない

Chillな自然回復と「使った痕跡が残る」長期世界を両立するため。

---

## 変更時のチェック

以下を変更するPRでは、この文書の該当Decisionも確認する。

- Tokenの数え方、モデル重み、Effort倍率、24段階閾値
- Project Key、保存形式、保持上限、Offline Recovery
- Replayの収録・保存・動画生成方法
- Quiet、通知、SE頻度、イベント間隔
- 天気・外部通信・位置情報
- Event Pack Schemaと安全境界
- Codex JSONLの監視時間窓・容量上限
- Realtime Queue、Particle、Backpressure
- Tray、終了、自動起動、Shortcut
