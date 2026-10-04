# Feedback: WebKit LocalStorage WALの無制限増加

## 要約

2026-09-15、macOS 26.6.2上のToken Fire 0.1.0で、WebKit LocalStorageの
`localstorage.sqlite3-wal`が約118.3 GBまで増加し、494.3 GBの内蔵SSDの空き容量が
約9.1 GBまで減少した。

これは保存する世界DB自体の肥大化ではない。約964 KBの`token-fire.worlds.v3`を
稼働中に5秒ごとにデータベース全体として`localStorage.setItem`へ渡し続ける一方、
WebKit内のSQLite WALがチェックポイント／切り詰めされず、同じデータの更新履歴が
追記され続けたことが直接原因である。

公開・常用可能なビルドへ進む前に、P0のデータ安全性・ディスク枯渇バグとして扱う。

## 実機で確認した事実

- Bundle ID: `jp.coco4at.token-fire`
- Version: `0.1.0`
- 連続稼働時間: 約8日6時間
- LocalStorage本体: 約0.97 MB
- `localstorage.sqlite3-shm`: 約229.7 MB
- `localstorage.sqlite3-wal`: 118,299,710,672 bytes
- WALの5秒間の増加量: 3,460,800 bytes
- 観測時の増加速度: 約0.69 MB/秒（単純換算で約60 GB/日）
- 保存キー`token-fire.worlds.v3`の値: 963,968 bytes
- WebKit NetworkingプロセスがWALを開いたまま継続書き込みしていた
- Time Machineローカルスナップショットは0件であり、本件の原因ではない

対象パス:

```text
~/Library/WebKit/jp.coco4at.token-fire/WebsiteData/Default/<origin>/<origin>/LocalStorage/
  localstorage.sqlite3
  localstorage.sqlite3-shm
  localstorage.sqlite3-wal
```

## コード上の原因

`src/application/appController.ts`の`advanceSimulationTo`は、表示中のシミュレーションで
5秒経過するたびに、変更有無を判定せず`this.persistence.save(this.world)`を呼ぶ。

`src/infrastructure/worldPersistence.ts`の`BrowserWorldPersistence.save`は、対象プロジェクトを
更新した後、全プロジェクトを含む`this.database`全体を毎回`JSON.stringify`し、同じ単一キーへ
`localStorage.setItem`する。

この組み合わせにより、保存対象が約1 MBでも長時間常駐時の書き込み量は無制限になる。
D-006の履歴・Replay件数上限はJSON値の論理サイズを制限するが、WebKit/SQLiteの物理WALサイズを
制限しないため、現在の上限設計だけではディスク枯渇を防げない。

## 必須の修正方針

1. 5秒ごとの無条件な全DB保存を廃止する。
2. WorldStateにdirty判定またはrevisionを設け、意味のある変更がある場合だけ保存する。
3. 複数変更をdebounce/coalesceし、同一内容を再保存しない。
4. 全プロジェクトDBの再直列化ではなく、変更されたプロジェクトだけを保存できる境界へ移行する。
5. 常駐利用を前提に、アプリ非表示・アイドル中の書き込みを停止する。
6. 終了、project切替、重要イベントなど、耐障害性に必要な境界では明示的にflushする。
7. WebView LocalStorageを継続利用する場合でも、WALの物理増加を実機で監視する。根本的には
   Tauri側の明示的な永続化層または適切に管理されたSQLite/ファイル保存への移行を検討する。
8. D-005およびD-006へ「論理保存上限だけでなく、物理書き込み量とWAL増加も制限する」契約を追加する。

## 回帰テスト／受入条件

- 内容が変化しない状態で30分稼働しても、永続化書き込み回数が増え続けない。
- 通常シミュレーションを24時間相当実行し、保存領域の物理サイズが設定した上限内に収まる。
- 同じWorldStateを連続して`save`しても、2回目以降は永続層へ書き込まない。
- 非表示・アイドル中は定期保存しない。
- 強制終了後も、明示した最大損失窓（現行契約では5秒）以内の状態を復元できる。
- v2→v3移行、破損JSON fallback、未知future version非破壊の既存契約を維持する。
- macOS実機E2Eで、LocalStorageディレクトリまたは新永続層の開始時／終了時サイズを記録し、
  許容値を超えた場合に失敗させる。

## リリース判断

修正版で長時間稼働試験と物理保存サイズの回帰試験が通るまで、Token Fire 0.1.0を常駐利用・配布しない。
既存ユーザー向けには、アプリ終了後に異常WALを安全に回収する移行／復旧手順を用意する。
