# Token-Fire art source

このディレクトリは生成・編集時の参照原稿を置く場所で、Vite／Tauriの実行時には読み込まない。

- `app-icon.png`: 1024×1024のネイティブアイコン原稿。`npm run icons`で`src-tauri/icons/`のOS別成果物へ変換する
- `app-icon.request.json`: アイコンの参照元、生成日、使用prompt
- `references/character-modules-overview.png`: 旧英語名を含むキャラクター／小物の探索シート
- `references/environment-modules-overview.png`: 炉、地形、自然、天候、VFXの探索シート
- `references/world-character-exploration.png`: 世界観、キャラクター、色、シルエットの方向性
- `references/desktop-diorama-mockup.png`: デスクトップ常駐時の体験モック
- `references/character-production-sheet.png`: キャラクター分解・表情・小物の制作シート
- `references/environment-production-sheet.png`: 環境モジュールの制作シート

実行時PNGとファイル単位の指示は`public/assets/token-fire/generated/`および
`public/assets/token-fire/asset-requests.json`へ分離する。参照原稿の市松模様は画像へ
焼き込まれているため、ランタイムSpriteとして直接使用しない。
