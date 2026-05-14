# Design System — `Virtual Bookshelf Simulator`

> Source: Stitch project `projects/801500470673603782` (Google Stitch). The full design system is mirrored here so the codebase has a single source of truth that survives even if the Stitch project changes.

## Identity

- **Project type:** Bookstore inventory companion app (Hebrew RTL)
- **Device type:** `MOBILE` (phones first; layouts must scale to tablets)
- **Color mode:** `LIGHT`
- **Tone:** Tactile, skeuomorphic, "estate library" warmth. Avoid stark white & flat modernism.

## Typography

Three Google Fonts used together for editorial contrast:

| Role     | Font                | Use cases                                |
|----------|---------------------|------------------------------------------|
| Headline | `Playfair Display`  | Screen titles, section titles            |
| Body     | `Source Sans Three` | Paragraphs, list rows, button labels     |
| Label    | `Literata`          | Tags, badges, "call number" style labels |

Hebrew fallback: since none of the Stitch fonts ship full Hebrew glyphs, the mobile app falls back to `Heebo` (sans-serif) and `David Libre` (serif) for any Hebrew text, while keeping the same hierarchy ratios.

### Type scale

```
display-lg        48 / 56   weight 700  (mobile 32 / 40)
headline-md       32 / 40   weight 600
headline-sm       24 / 32   weight 600
body-lg           18 / 28   weight 400
body-md           16 / 24   weight 400
label-md          14 / 20   weight 600
caption           12 / 16   weight 400
```

## Color tokens (light mode)

Pulled verbatim from `designTheme.namedColors`. Use the semantic name — never raw hex — everywhere in the app:

### Surfaces & background
- `background`               `#fffadf`  — Aged paper, primary screen background
- `surface`                  `#fffadf`
- `surface_dim`              `#e1dca9`
- `surface_bright`           `#fffadf`
- `surface_container_lowest` `#ffffff`
- `surface_container_low`    `#fbf5c1`
- `surface_container`        `#f6f0bb`
- `surface_container_high`   `#f0eab6`
- `surface_container_highest`/`surface_variant` `#eae4b1`
- `surface_tint`             `#77574d`
- `on_surface`               `#1e1c00`
- `on_surface_variant`       `#504441`
- `inverse_surface`          `#34310d`
- `inverse_on_surface`       `#f8f3be`
- `outline`                  `#827470`
- `outline_variant`          `#d4c3be`

### Primary — Wood
- `primary`                  `#442a22`
- `on_primary`               `#ffffff`
- `primary_container`        `#5d4037`
- `on_primary_container`     `#d4ada1`
- `primary_fixed`            `#ffdbd0`
- `primary_fixed_dim`        `#e7bdb1`
- `on_primary_fixed`         `#2c160e`
- `on_primary_fixed_variant` `#5d4037`
- `inverse_primary`          `#e7bdb1`

### Secondary — Gold accent
- `secondary`                `#735c00`
- `on_secondary`             `#ffffff`
- `secondary_container`      `#fed65b`
- `on_secondary_container`   `#745c00`
- `secondary_fixed`          `#ffe088`
- `secondary_fixed_dim`      `#e9c349`
- `on_secondary_fixed`       `#241a00`
- `on_secondary_fixed_variant` `#574500`

### Tertiary — Deep wood
- `tertiary`                 `#432b27`
- `on_tertiary`              `#ffffff`
- `tertiary_container`       `#5b413c`
- `on_tertiary_container`    `#d2aea8`
- `tertiary_fixed`           `#ffdad4`
- `tertiary_fixed_dim`       `#e3beb8`
- `on_tertiary_fixed`        `#2b1613`
- `on_tertiary_fixed_variant` `#5b403c`

### Status
- `error`                    `#ba1a1a`
- `on_error`                 `#ffffff`
- `error_container`          `#ffdad6`
- `on_error_container`       `#93000a`

## Shape & spacing

- **Base unit:** 4px
- **Spacing scale:** `xs 4 / sm 8 / md 16 / lg 24 / xl 48`
- **Section gap:** 32px (between rooms / categories)
- **Mobile margin:** 20px
- **Roundness:** `0.25rem` default (book-corner softness). Buttons 8px (more "touchable"). Use `9999px` only for chips/dots.

## Elevation language

- **L1 Paper:** the base aged-paper surface — no shadow.
- **L2 Inset:** inputs, search bars — `inset 0 2px 4px rgba(62,39,35,0.10)`.
- **L3 Floating / Spines:** book covers, cards — dual-layer shadow: a crisp 1px edge color + a soft `0 10px 20px rgba(0,0,0,0.15)`.
- **L4 Modal — "leather binding":** rich, deep ambient shadow for dialogs.

## Components — Stitch guidance applied to this app

- **Buttons (primary):** solid wood `primary_container` background, gold text. Hover/press → subtle lift via shadow transition.
- **Buttons (secondary):** outlined in gold (`secondary_fixed_dim`), wood text.
- **Inputs:** background 5% darker than paper, thin wood border that thickens on focus, inset L2 shadow.
- **Chips / Tags:** rectangular, cream background `secondary_fixed`, label font (`Literata`), small.
- **Cards ("folios"):** subtle vertical gradient on the left edge to mimic a page binding.
- **The "Shelf":** specialized container — items sit on a horizontal `primary_container` 2px line; each item gets a tiny contact shadow at its base.
- **Top navigation:** `primary_container` bar, gold icons.

## Hebrew RTL rules

1. **Mirror axis:** the app force-enables RTL (`I18nManager.forceRTL(true)`). All horizontal lists, icons-with-text, and nav items mirror automatically; do not hand-flip in CSS.
2. **The store-map ח shape:** the physical store map is **not** flipped — front-left-right unit positions reflect the real-world layout. RTL only affects text & list ordering.
3. **Strings:** every visible string lives in `mobile/src/i18n/he.ts`. No hard-coded Hebrew in components.
4. **Mixed strings:** if a Hebrew string contains English/numeric tokens, wrap them with Unicode LRM/RLM where it helps prevent display flips (`\u200e`, `\u200f`).
5. **Fonts:** Heebo for body, David Libre for headlines (Hebrew fallback for Playfair Display).

## Screen inventory (Stitch source)

The Stitch project contains 39 screens that cover the inventory app surface area. The eight (8) screens that map 1:1 to our brief are:

1. Home — Store Map (ח shape) — **Phase 1**
2. Unit Detail (with island side toggle) — **Phase 2**
3. Cell Detail / Book in Cell — **Phase 2**
4. Shortage List — **Phase 3**
5. Orders (3 tabs) — **Phase 3**
6. Add / Remove / Update inventory — **Phase 4**
7. New Book form — **Phase 4**
8. Notifications — **Phase 5**

The remaining Stitch screens are variants & state explorations and are not directly mapped to routes.

## Token export (machine-readable)

Both Stitch tokens (light theme) and the Hebrew typography overrides live in:

- `mobile/src/theme/tokens.ts` — the single import point for the app.
- `mobile/src/theme/index.ts` — exports `useTheme()` + the typed `Theme` shape.

The token map is kept in lock-step with this document — when Stitch changes, regenerate the JSON via `GET https://stitch.googleapis.com/v1/projects/801500470673603782` and update both files together.
