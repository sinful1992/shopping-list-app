# Design Audit

*Audit date: 2026-07-24 · v1.33.3 · branch `dev` · scope: visual design, not code structure*

> **Status: all six phases implemented on `dev` (v1.33.4 – v1.35.0), not yet
> validated on device in either theme.** See `DESIGN_AUDIT_IMPLEMENTED.md` for
> what shipped, where the audit turned out to be wrong, and what is left.
> Contrast figures are now regression-tested in
> `src/styles/__tests__/contrast.test.ts`.

This is a **design** audit, companion to the internal improvement plan (which covers structure,
types, and tests). It looks only at what the user sees: colour, contrast, hierarchy,
touch targets, iconography, and copy.

**Method.** Read `src/styles/theme.ts`, `ThemeContext.tsx`, the three extracted
`.styles.ts` files (Home, ListDetail, Settings), `AnimatedItemCard.tsx`,
`AnimatedListCard.tsx`, `AnalyticsScreen.tsx`, `UrgentItemsScreen.tsx`, `CategoryService.ts`;
grepped token/colour/fontSize usage across all 43 style-bearing files. Every contrast
figure below is **computed** (WCAG 2.1 relative luminance, with alpha layers composited
against the real parent chain) — not eyeballed.

**Precondition:** light theme is genuinely reachable. `ThemeContext.tsx:30` follows the
system scheme by default, and `SettingsScreen.tsx:330-333` gives users an explicit
light/dark/system toggle. Light-theme defects are real defects, not dead code.

---

## Headline

`theme.ts` is a good, coherent token system — the problem is that **most of the UI doesn't
use it**, and where it does, the light theme was produced by darkening the accent hexes
without revisiting the *patterns* those accents sit inside. Two patterns break:

- **coloured surface + white text** fails in dark mode (the shopping status bar, filled buttons)
- **tinted text on tinted background** fails in light mode (badges, stat cards, prices)

Alongside those, a **third colour system** — the Material palette in `CategoryService.ts` —
is rendered as 11px text on every item row and is theme-independent, so it fails in
whichever theme it wasn't drawn for.

Token adoption across the 43 files that call `StyleSheet.create`:

| Token | Files importing it | Coverage |
|---|---|---|
| `RADIUS` | 18 | 42% |
| `SPACING` | 14 | 33% |
| `TYPOGRAPHY` | 13 | 30% |
| `NUMERIC` | 11 | 26% |
| `SHADOWS` | 5 | 12% |

Knock-on: **19 distinct font sizes** (9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24,
28, 32, 36, 42, 52, 64) against a scale defining 8, and **13 distinct border radii** (2, 4,
5, 6, 8, 10, 12, 14, 16, 20, 22, 24, 32) against a scale defining 7.

**What's already right:** `AnimatedItemCard.tsx` and `AnimatedListCard.tsx` — the two
most-looked-at surfaces — are the best-built files in the app. They use `RADIUS`, theme
tokens throughout, vector icons, `hitSlop` on every icon button, and `SYNC_ICONS` encodes
status by *shape first, colour second* (explicitly colour-blind safe). They're the
reference implementation for the rest of this document; most fixes below are "do what
these two files already do."

---

## Priority 1 — Measured contrast failures

Ratios are against the actual composited background. WCAG AA needs **4.5:1** for body
text, 3:1 for large (≥18px bold / ≥24px). Everything flagged below is small text.

### 1.1 Shopping-mode status bar is unreadable in dark theme (`ListDetailScreen.styles.ts:310-456`)

This bar is the *primary* in-store UI. Its backgrounds are hardcoded iOS system colours
that never flip with the theme, while its text is a mix of themed and hardcoded.

| Element | Dark theme | Light theme |
|---|---|---|
| `statusTextCompact` on `statusShopping` | **2.43:1 FAIL** | 8.23:1 pass |
| `statusTextCompact` on `statusLocked` | **2.65:1 FAIL** | 8.55:1 pass |
| `statusTextCompact` on `statusCompleted` | **3.84:1 FAIL** | 6.17:1 pass |
| `doneButtonText` on `doneButtonCompact` | **1.87:1 FAIL** | 10.27:1 pass |
| `cancelButtonText` on `cancelButtonExpanded` | **1.99:1 FAIL** | **1.81:1 FAIL** |
| `budgetBadgeText` on `budgetBadgeWarning` (11px) | **1.61:1 FAIL** | 11.12:1 pass |

Dark fails because `theme.text.primary` is white and the bar is saturated green/orange.
`cancelButtonText` fails in **both** themes — it's hardcoded `rgba(255,255,255,0.9)` over
a `rgba(255,255,255,0.15)` scrim, i.e. white on light green, in every configuration.

Note the internal inconsistency: on the *same bar*, `doneButtonText` uses
`theme.text.primary` while `cancelButtonText` is hardcoded white. In light theme they
render as two different colours side by side.

**Fix:** the backgrounds don't flip, so the text shouldn't either — pin all text on this
bar to a fixed dark ink and drop the `theme.text.primary` reference. Measured candidates
(worst of the six theme × state combinations):

| Ink | Worst case | Where |
|---|---|---|
| `#111827` | 4.62:1 | `statusCompleted` dark |
| `#0B1B10` | 4.64:1 | `statusCompleted` dark |
| `#000000` | 5.47:1 | `statusCompleted` dark |

A single ink works, but `statusCompleted`'s grey (`rgba(142,142,147,0.9)`) leaves almost
no margin. Either use `#000000`, or darken `statusCompleted` to open up headroom — the
grey is an untokenised colour that needs replacing anyway (§2.1). Also delete
`cancelButtonExpanded`'s white-on-white-scrim entirely and use an outlined button.

### 1.2 Category labels fail on every item row (`CategoryService.ts:33-44`)

The 12 category colours are a stock Material palette, hardcoded and theme-independent.
They're used as `categoryLabel` — **11px text** on the item card
(`AnimatedItemCard.tsx:172-175, 197`).

| Category | Dark card | Light card |
|---|---|---|
| Produce `#4CAF50` | 5.90 | **2.78 FAIL** |
| Dairy `#2196F3` | 5.25 | **3.12 FAIL** |
| Meat `#F44336` | **4.45 FAIL** | **3.68 FAIL** |
| Fish `#03A9F4` | 6.24 | **2.63 FAIL** |
| Bakery `#FF9800` | 7.61 | **2.16 FAIL** |
| Frozen `#00BCD4` | 7.14 | **2.30 FAIL** |
| Pantry `#795548` | **2.50 FAIL** | 6.55 |
| Beverages `#9C27B0` | **2.60 FAIL** | 6.30 |
| Household `#607D8B` | **3.75 FAIL** | **4.37 FAIL** |
| Personal Care `#E91E63` | **3.77 FAIL** | **4.35 FAIL** |
| Medicine `#FF5722` | 5.18 | **3.16 FAIL** |
| Other `#9E9E9E` | 6.12 | **2.68 FAIL** |

**5 of 12 fail in dark, 10 of 12 fail in light.** Household and Personal Care fail in both.
This is the highest-frequency defect in the app — it's on every row of every list.

**Fix:** the palette needs a light and a dark variant, same as the accents. Either add
`colorDark`/`colorLight` to the `Category` type and pick via `useTheme()`, or — cheaper and
arguably better — stop colouring the *text*. The label is already redundant with the
emoji glyph beside it; render it in `theme.text.secondary` and let the category emoji
carry the identity. That fixes all 24 cells with one change and removes a whole colour
system from the app.

### 1.3 Analytics stat cards and rank medals break in light theme (`AnalyticsScreen.tsx:54-57, 280`)

`STAT_CONFIG` and `RANK_COLORS` are **module-level constants holding dark-theme hexes**.
They can't respond to the theme, and they're used as *foreground* on a 12%-alpha tint of
themselves:

| Stat card icon | Dark | Light |
|---|---|---|
| Total Spent `#6EA8FE` | 6.39 | **1.98 FAIL** |
| Shopping Trips `#30D158` | 7.56 | **1.66 FAIL** |
| Avg per Trip `#A78BFA` | 5.75 | **2.20 FAIL** |
| Items Bought `#FFD60A` | 10.21 | **1.21 FAIL** |

| Rank medal | Dark card | Light card |
|---|---|---|
| Gold `#FFD60A` | 11.62 | **1.41 FAIL** |
| Silver `#C0C0C0` | 9.01 | **1.82 FAIL** |
| Bronze `#CD7F32` | 5.22 | **3.14 FAIL** |

1.21:1 is effectively invisible. **Fix:** move `STAT_CONFIG`'s `color`/`bg` and
`RANK_COLORS` inside the component so they read from `theme.accent.*`, and add a
light-theme medal triad to the token file — medals need their own tokens, the metal
semantics don't map onto the accent palette.

### 1.4 Filled accent buttons

Two distinct problems that had looked like one. Themed buttons fail dark only; buttons
with hardcoded `#fff` fail in both.

| Button | Text colour | Dark | Light |
|---|---|---|---|
| `addButton` (`ListDetail:88`) | `theme.text.primary` | **3.39 FAIL** | 4.56 pass |
| `viewReceiptButton` (`ListDetail:252`) | `theme.text.primary` | **3.50 FAIL** | 4.74 pass |
| `modalButtonText` (`Settings:258`) | `#fff` | **3.50 FAIL** | **3.74 FAIL** |
| `retryBtnText` (`Analytics:483`) | `#fff` | **3.50 FAIL** | **3.74 FAIL** |
| `resolveButton` (`Urgent:392`) | `#fff` on `accent.green` | **2.02 FAIL** | **3.30 FAIL** |
| `createButton` (`Urgent:476`) | `#fff` on `#FF6B35` | **2.84 FAIL** | **2.84 FAIL** |
| logout (`Settings:166`) | `#fff` on `rgba(255,59,48,.8)` | 4.89 pass | **2.94 FAIL** |

Root cause: `accent.blueLight` is `rgba(110,168,254,0.8)` — an 80%-alpha *light* blue
designed as a fill tint, now used as a button surface in **11 places**.

**Fix (one decision):** stop putting light text on light accent fills. Use the solid
`accent.blue` / `gradient` pair that the FAB and the complete-button already use — those
are the two buttons in the app that look and measure right. Mechanical replacement of the
11 `backgroundColor: theme.accent.blueLight` sites. The four hardcoded-`#fff` sites need
the theme token restored *as well as* the surface change.

### 1.5 Tinted badges and prices fail in light theme

| Element | Dark | Light |
|---|---|---|
| `completedBadge` green on `greenDim` over `completedCard` | **3.67 FAIL** | **2.19 FAIL** |
| `shoppingBadge` orange on `orangeDim` | 5.93 | **2.96 FAIL** |
| `storeWarningText` yellow on `yellowDim` (`ListDetail:466`) | 5.96 | **1.99 FAIL** |
| `accent.green` price text on card | 8.11 | **3.30 FAIL** |

The light theme's accents are ~40% darker, but the `*Dim`/`*Subtle` alphas were carried
over unchanged, so tinted-on-tinted collapses. `completedBadge` is worse than it looks
because it composites over `completedCard`'s `greenSubtle` — three green layers.

**Fix:** in `LIGHT_THEME`, roughly halve the `*Dim` alphas (0.30 → 0.15) and darken the
foreground accents another step for text roles. Prices at 3.30:1 matter most — that's the
number users came to read.

### 1.6 `text.tertiary` and `text.dim` are below spec

`text.tertiary` `rgba(255,255,255,0.45)` measures 4.52:1 on `background.primary` but
**4.38:1 on `background.secondary`** — it fails on cards, which is where it's mostly used
(`listDateSecondary`, `categoryName`, `datePreview`). Light theme's `rgba(17,24,39,0.50)`
is **3.30:1**, failing everywhere.

The comment at `theme.ts:48-49` says these "must stay readable at small sizes." They
don't. **Fix:** dark `0.45 → 0.55`, light `0.50 → 0.62`.

`text.dim` measures 2.28:1 dark / 1.95:1 light. That's correct for its stated purpose
(disabled/placeholder), but `AnimatedItemCard.tsx:180-183` uses it for `addSizeText` — an
11px italic **call to action**. Interactive affordances shouldn't use the disabled token;
move it to `text.tertiary`.

---

## Priority 2 — Palette coherence

### 2.1 Four greens, three oranges, two yellows, three reds

`ListDetailScreen.styles.ts` and `SettingsScreen.styles.ts` use iOS system colours instead
of the tokens sitting right next to them:

| Hardcoded | Should be | Delta |
|---|---|---|
| `rgba(52,199,89,…)` `statusShopping` | `accent.green` `#30D158` | different green |
| `rgba(255,149,0,…)` `statusLocked` | `accent.orange` `#FFB340` | different orange |
| `rgba(255,204,0,…)` `budgetBadgeWarning` | `accent.yellow` `#FFD60A` | different yellow |
| `rgba(255,59,48,…)` `budgetBadgeOver` | `accent.red` `#FF453A` | different red |
| `rgba(142,142,147,…)` `statusCompleted` | *no token* | needs `accent.neutral` |
| `#FF6B35` (`Urgent:476`) | *no token* | a fifth orange |
| `#FF3B30` (`Settings:160`) | `accent.red` | different red |
| `rgba(255,0,0,0.5)` (`Settings:373`) | `accent.redDim` | pure red, unused elsewhere |

Plus the 12 Material category colours (§1.2) as an entirely separate system. Nobody
notices any one of these. Collectively they're why the app reads as assembled rather than
designed. **Fix:** add `accent.neutral` and the medal triad to the token file, then
replace all of the above. Mechanical, low-risk, high visual return.

### 2.2 Analytics pie palette is half-themed (`AnalyticsScreen.tsx:170`)

```js
const PIE_COLORS = [theme.accent.blue, theme.accent.green, '#FFD60A', '#FF453A', theme.accent.purple];
```

Three entries flip with the theme, two don't. In light mode the pie is three muted colours
and two neon ones. **Fix:** all five from `theme.accent`.

Separately: it's a 5-way categorical scale using blue/green/yellow/red/purple, with
red-green adjacency, carrying category identity via colour-dot legend alone. Label slices
directly or add a value column so colour isn't the sole encoding — the same principle
`AnimatedListCard`'s `SYNC_ICONS` already applies correctly.

---

## Priority 3 — Hierarchy and rhythm

### 3.1 The type scale doesn't produce levels

`TYPOGRAPHY.fontSize` defines 8 steps; 13 of 43 style files import it. In the screen
chrome, 13/14/15/16/17 land on adjacent rows. `HomeScreen.styles.ts` runs 20/17/15/14/13/12
down one card — six sizes, no discernible hierarchy, because 15-vs-14 and 17-vs-16 aren't
perceptible differences. It reads as one flat weight-band.

(Scoped note: `AnimatedItemCard` is *not* the offender here — it uses 16/13/12/11 with
weight and colour doing the rest, which is the right approach. The drift is in screen
chrome and modals.)

**Fix:** collapse to the defined ramp — 12 (meta) / 14 (body) / 16 (emphasis) / 20 (title)
/ 24 (screen title) — and carry remaining hierarchy in weight and colour, which the theme
supports well. Single highest-return change for how the app looks; typography only, no logic.

The scale also has a gap: `xxxl: 24` jumps straight to `huge: 42`, but 28, 32, 36, 52 and
64 are all in use, unnamed.

### 3.2 Spacing token used as a radius token

`HomeScreen.styles.ts:57` — `borderRadius: SPACING.sm`. It happens to equal `RADIUS.small`,
so it looks fine and will silently break the day spacing is retuned. One-line fix.

### 3.3 Money doesn't consistently use tabular numerals

`NUMERIC` exists and is correct, but 7 files rendering `£` define their own `StyleSheet`
without it: `UrgentItemsScreen`, `FilterModal`, `FrequentlyBoughtModal`, `PriceEditModal`,
**`PriceHistoryModal`**, `ReceiptPreviewOverlay`, `SizeEditModal`. `PriceHistoryModal` is
the worst case — a column of prices that don't align is exactly what the token exists for.

---

## Priority 4 — Touch targets

Android's Material minimum is 48dp; Apple's is 44pt. Across **170** `TouchableOpacity`
instances the app has 3 `minWidth: 44` declarations and 8 `hitSlop` uses — and 5 of those
8 are in `AnimatedItemCard` alone.

Icon-only controls well under the minimum:

| Style | Padding | Approx. target |
|---|---|---|
| `backButton`, `arrowButton`, `expandButton`, `collapseButton` (`ListDetail`) | 4 | ~28–32dp |
| `editIcon`, `deleteButton` (`ListDetail`) | 5 | ~30dp |
| `deleteIconButton` (`Home`) | 4 | ~26dp |
| `copyButton`, `editButton` (`Settings`) | 4–5 | ~30dp |

`frequentItemsButton` in the same file sets `minWidth: 44`, and `AnimatedItemCard` sets
`hitSlop` on all five of its icon buttons — the intent exists, it just wasn't propagated
to the screens. Fix `arrowButton` (repeated fine-motor action) and `deleteIconButton`
(destructive, smallest target in the app) first.

**Fix:** `hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}` on each — no layout change, no
visual change.

---

## Priority 5 — Iconography and copy

### 5.1 Emoji as chrome

`react-native-vector-icons` is used in 24 files, but emoji still carry UI meaning in a
handful of places. Category glyphs are content and are fine. These aren't:

| Where | Issue |
|---|---|
| `PriceHistoryModal.tsx:78-80` `📈/📉/➡️` | **Trend encoded in emoji alone** — no text alternative for screen readers. An arrow icon + signed percentage would carry it properly. |
| `UrgentItemsScreen.tsx:201` `🔥` | Sole FAB label; doesn't say what the button does, and renders differently across OEM font stacks. |
| `AnalyticsScreen.tsx:127,140` `⚠️ 📊` | Error/empty icons, inconsistent with the vector icons used for the same purpose elsewhere. |
| `AnalyticsScreen.tsx:54-57` `£ 🛍 ~ #` | Stat-card icons mix a currency symbol, an emoji, a tilde and a hash — four glyph systems in one 2×2 grid. |
| `ListDetail:949,979`, `ReceiptView:408,424`, `Settings:543` | Emoji inline in sentences. |

### 5.2 Empty states are bare negations

"No resolved items." "No family members." "No items in this list." "No completed shopping
trips." "No data yet." An empty screen is the best moment to teach a feature, and only
`HomeScreen` takes it ("Tap + to create your first list").

Rewrites — state plus next action, active voice, verb matching the control that performs it:

| Screen | Current | Suggested |
|---|---|---|
| `UrgentItemsScreen` | "No active urgent items" | "Nothing urgent right now — tap + when you need something picked up" |
| `HistoryScreen` | "No completed shopping trips" | "Finished trips land here — complete a list to start your history" |
| `ListDetailScreen` | "No items yet" | "Add your first item above" |
| `AnalyticsScreen` | "No data yet" | "Complete a few shopping trips and your spending trends appear here" |
| `SettingsScreen` | "No family members" | "Invite someone to share lists with them" |

### 5.3 Destructive-action visual weight

`SettingsScreen` gives logout and delete-account near-identical treatment — both filled
red with a coloured glow. Logout is reversible in one tap; delete-account is permanent.
**Fix:** make logout a quiet outlined button, reserve filled red for delete-account. Also
removes one of the failures in §1.4.

---

## One identity-level suggestion (not a defect)

`ReceiptViewScreen` already has a `RECEIPT_FONT` monospace treatment. It's the only place
in the app with a genuine visual point of view, and it's earned — a till roll is what this
product is *about*. It could extend, with restraint, to the other moments where the app is
a record of a transaction: the running total in shopping mode, the completed-list header in
History, the price column in `PriceHistoryModal`. Monospace plus tabular figures in exactly
those places and nowhere else would give the app a signature without a new font asset or
touching the rest of the UI.

Deliberately **not** proposing: a new display typeface (no bundled fonts; native asset work
on a shipped app isn't worth it), or a palette rework beyond fixing the drift above — the
palette is fine, it just isn't applied consistently.

---

## Suggested sequencing

Each phase = one `dev` batch, AVD-validated in **both** themes before merge. All of this is
CSS-equivalent work: no logic changes, no migrations.

| Phase | Contents | Bump |
|---|---|---|
| 1 | 1.2 category labels, 1.1 status bar, 1.3 Analytics constants — the "can't read it" set | `fix(ui)` patch |
| 2 | 1.4 button pattern, 1.5 light-theme `*Dim` alphas, 1.6 text tokens, 5.3 destructive weight | `fix(ui)` patch |
| 3 | 2.1 palette drift + new tokens, 2.2 pie palette | `style(ui)` minor |
| 4 | 4 hit slops, 3.3 `NUMERIC` on the 7 money files | `fix(ui)` patch |
| 5 | 3.1 type scale collapse (screen by screen), 3.2 radius token | `style(ui)` minor |
| 6 | 5.1 icon consolidation, 5.2 empty-state copy | `style(ui)` minor |

Phases 1–2 fix actual "can't read it" bugs; do those regardless of appetite for the rest.
Phase 1 leads with §1.2 because it's the only one on every row of every screen.

**Validation note:** the AVD must be checked in light mode explicitly. Every single-theme
defect in Priority 1 has shipped precisely because validation has been dark-only.
