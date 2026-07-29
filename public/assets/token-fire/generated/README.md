# Token-Fire generated production assets

These PNGs are production cutouts generated from the user-provided Token-Fire character and environment exploration sheets on 2026-07-21.

- `characters/`: Hinoko, Mebuki, Fuwame, Sumi, Mizumo, Kururi
- `expressions/`: four normalized, bottom-center-aligned frames per character
- `environment/`: active/recovery forges and healthy/scorched/recovery trees
- Source direction: hand-painted storybook game art, large readable silhouettes, cute industrial fantasy
- Processing: flat chroma background, local soft-matte removal, despill, 512 px working size
- Runtime boundary: PNGs are optional per-sprite overrides; lightweight props and VFX remain in `sprites.svg`
- Failure behavior: a missing generated PNG falls back to its matching frame in `sprites.svg`

Prompt invariant: preserve the reference character/module identity, remove labels and neighboring content, isolate one complete subject on a flat removable chroma background, and avoid shadows, floor planes, text, logos, watermarks, or unrelated props.

Expression frame order is character-specific and mapped from `CharacterMood` in the renderer. Frame `01` is the default expression; the remaining frames cover the moods the character actually uses rather than inventing a universal face set.

舞台枠や交換式背景紙を追加生成する場合のファイル単位の指示は、親ディレクトリの
`asset-requests.json`に記録する。PixiJS版は同じ役割を`Graphics`で描けるため、
その画像群が未生成でも動作と境界は変わらない。
