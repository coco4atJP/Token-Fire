# Token-Fire generated production assets

These PNGs are production assets generated from the user-provided Token-Fire exploration sheets kept under `art-source/token-fire/references/`. Character production was completed on 2026-07-21; the stage, prop, and icon refresh was completed on 2026-08-09.

- `characters/`: Hinoko, Mebuki, Fuwame, Sumi, Mizumo, Kururi
- `expressions/`: four normalized, bottom-center-aligned frames per character
- `environment/`: active/recovery forges, healthy/scorched/recovery trees, shrub, and waterfall
- `props/`: hammer, watering can, Token crystal, log cart, and logs
- `theatre/`: active/recovery paper backdrops, stage floor, curtains, and proscenium
- Native icon master: `art-source/token-fire/app-icon.png`; `npm run icons` derives the Tauri platform set
- Source direction: hand-painted storybook game art, visible paper texture, large readable silhouettes, cute industrial fantasy
- Processing: flat chroma background, local soft-matte removal, despill, 512 px working size; small runtime props are downsampled to 256 px
- Runtime boundary: PNGs are optional per-sprite overrides; high-frequency flame, smoke, spark, rain, splash, and Token VFX remain in `sprites.svg`
- Failure behavior: a missing generated PNG falls back to its matching SVG frame or Pixi Graphics drawing

The active and recovery backdrops intentionally contain no factory, lake, character, or runtime prop. Those stateful elements are rendered in front so factory growth, damage, and recovery are never baked into a static image.

The retired English asset aliases (`emberbeak`, `spriglet`, `drizzle`, `cinder`, `vapo`, `axle`) are not packaged. Persistence migration still accepts those IDs and normalizes them to the canonical six character IDs.

Prompt invariant: preserve the reference character/module identity, remove labels and neighboring content, isolate one complete subject on a flat removable chroma background, and avoid shadows, floor planes, text, logos, watermarks, or unrelated props.

Expression frame order is character-specific and mapped from `CharacterMood` in the renderer. Frame `01` is the default expression; the remaining frames cover the moods the character actually uses rather than inventing a universal face set.

舞台枠、交換式背景紙、環境、可動小物を追加生成する場合のファイル単位の指示は、
親ディレクトリの`asset-requests.json`に記録する。PixiJS版は同じ役割を`Graphics`
または`sprites.svg`で描けるため、その画像群が未生成でも実行時の意味と境界は変わらない。
