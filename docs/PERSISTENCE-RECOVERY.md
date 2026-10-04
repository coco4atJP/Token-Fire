# 世界保存の復旧・物理サイズ受入

## 対象

旧0.1.0のWebKit LocalStorage WAL肥大化を受け、常駐版の世界保存をTauri app-dataの`worlds-v3`へ移す。旧データの自動削除はしない。新しいproject保存は現在・前回backup・一時fileだけを持ち、容量不足でも古いprojectを勝手に捨てない。

## 旧WALの安全な扱い

1. まずToken-Fireを完全終了する。Trayへ隠すだけでは終了にならない。関連WebKitプロセスが当該保存領域を開いていないことを確認する
2. SQLite本体、`-wal`、`-shm`を一式として扱う。WAL単独削除や、アプリ稼働中のコピー・切詰めをしない
3. 十分な空き容量のある別ボリュームへ整合性のある退避を作る。巨大WALを空きの少ない同一SSDへ複製しない。退避ができない場合は削除せず、DB復旧に詳しい担当者へ引き継ぐ
4. SQLiteの正式なbackup/checkpoint手順はアプリと関連プロセスを完全停止した検証用コピーで行い、元のDB一式を残す。`wal_checkpoint(TRUNCATE)`の実行だけで内容保全を保証したことにしない
5. 修正版の移行後、project数、累積Token、履歴、Replayを確認しJSON exportを保管する。読込失敗やfuture versionのときは書込を止める。以前の版を起動して新形式へ上書きしない

本patchはユーザー端末のWebKit保存領域に直接触らない。実機の旧DBが未検証の段階では「回収済」「容量復旧済」と案内しない。

## macOS/Windowsのリリース受入（未実施なら配布不可）

- 同一commitのnative buildで起動前、24時間後、正常終了後、再起動後の`world_storage_status`を記録する。payload合計64MiB以下、各current/backup/temp4MiB以下、project数1024以下、ファイル数3072以下をassertする。実際のディレクトリ占有block数も記録し、metadata分を含む上限80MiB以下を確認する
- 旧WebKit LocalStorageディレクトリの開始/終了時bytesを記録し、世界checkpointに連動した増加がないことを確認する。設定変更の少量書込は別記する
- 30分idle/hidden（新Tokenなし）ではworld保存回数が増えない。hiddenでも新Token受領・燃焼は保存される
- visible active、hidden active、project切替中、終了要求中の各時点でプロセスを強制終了し、直近checkpointのToken合計・未燃焼Queueが復元されることを確認する。保存遅延と損失窓を測定する
- disk full、権限拒否、置換失敗を注入し、以前のcurrent/backupを保持、UI警告、pending再試行、終了中断を確認する。Windows実機でも行う
- currentを検証用コピー上で切り詰め、backup復元を確認する。future versionはbackupへ勝手に巻き戻さず、書込禁止と原本保持を確認する
- v2、v3、旧キャラクター名、複数projectの移行後、再起動して重複書込しないことを確認する

モック試験・TypeScript buildはnative filesystem、OS強制終了、24時間実稼働試験の代わりにならない。全項目のログが揃うまで修正候補として扱う。
