# OS別E2E受入表

Release draftごとに実機で実施し、OS build番号・端末・DPI・結果・証跡pathを記録する。未実施をPASSとして扱わない。

## macOS arm64／x86_64

- [ ] Developer ID署名、Notarization、staplingを検証
- [ ] DMG install、初回起動、上書きinstall、Applicationsから削除
- [ ] 380×240／560×350／800×480、Retina DPR 2、透明角、複数monitor
- [ ] Tray左click表示、右click menu、閉じる→Tray、終了だけprocess終了
- [ ] 自動起動、通知許可拒否、Cmd+Shift+F、Quiet／Wake、Calm
- [ ] Replay代表画像とWebM／JSON fallback、クラッシュ後World／Replay復元
- [ ] Fullscreen、画面共有、Focus／Do Not Disturb、sleep復帰

## Windows x86_64

- [ ] Authenticode署名を検証し、MSI／NSIS install・upgrade・uninstall
- [ ] 100%／150%／200% DPI、380×240、透明角、複数monitor
- [ ] Tray左／右click、閉じる→Tray、終了、taskbar非表示
- [ ] 自動起動、通知許可、Ctrl+Shift+F、Quiet／Wake、Calm
- [ ] P／L／Q／Escape／Tab、Replay代表画像とWebM／JSON fallback
- [ ] クラッシュ後World／Replay復元、sleep復帰
- [ ] Fullscreen、画面共有、Do Not Disturb相当との干渉確認

## 共通性能・表示契約

- [ ] 7 scene × 3 viewportのcapture差分を承認
- [ ] 主要文字12px以上、操作領域32px以上、clipping／意図しない重なり0
- [ ] Active p95 ≤ 3ms、hidden render 0、reduced-motionでspring／粒子／明滅停止
- [ ] fixture無音、Quiet無音、Calm cue間隔1400ms以上
