# Theme (colours and typography)

All colours come from design tokens — CSS variables in `web/src/styles/main.css` (`--c-brand-*`, `--c-neutral-*`,
`--c-ink`, `--c-success-*`, `--c-danger-*`, `--c-warning-*`). `web/tailwind.config.js` maps Tailwind's colour names
onto them, so existing classes follow the palette without markup changes:

| Tailwind names | Token | Used for |
|---|---|---|
| `primary`, `blue` | brand blue (600 = #2554EB) | primary buttons, links, focus rings, active navigation item |
| `gray`, `stone`, `neutral`, `slate` | cool neutral | text, borders, surfaces, table headers |
| `black` | navy ink #0C1426 | sidebar, selected chips / tabs, dark buttons, overlays |
| `success`, `green`, `emerald` | green | paid, received, success messages |
| `danger`, `red` | red | errors, destructive actions, amounts due |
| `warning`, `amber` | amber | overdue, low stock, warnings |

Charts and SVG strokes read the same tokens through `tokenColor()` (`web/src/utils/theme.js`).

Contrast (white text / text on white): brand 600 5.9:1, success button (700) 5.5:1, danger 600 4.8:1, secondary
text (neutral 500) 4.8:1.

Typography: **Inter** (variable) for Latin text and digits in French, English and Arabic screens; **IBM Plex Sans
Arabic** (SIL Open Font License) for Arabic script — one font stack, so mixed Arabic / Latin lines keep both scripts
in their own designed face. Tables use tabular figures so amounts line up. Font sizes, weights and spacing of the
components are unchanged; RTL is unchanged.
