# Design audit — what was implemented

Companion to `DESIGN_AUDIT.md`. Six commits on `dev`, **none validated on
device in either theme.**

| Version | Commit | Audit phase |
|---|---|---|
| 1.33.4 | `356af88` | 1 — status bar, category labels, analytics constants |
| 1.33.5 | `64033fb` | 2 — filled-button ink, text tokens, destructive weight |
| 1.34.0 | `2d79f17` | 3 — palette drift, pie palette |
| 1.34.1 | `6dcb93e` | 4 — hit slops, tabular numerals |
| 1.34.2 | `8385875` | layout side-effects of phase 1, found on review |
| 1.35.0 | `d39d739` | 5 + 6 — type scale, radius token, iconography, empty-state copy |
| 1.35.1 | `d564b04` | spacing/overflow side-effects of the icon swaps |
| 1.35.2–1.35.4 | | three defects the AVD pass found (below) |
| 1.35.5 | | the dead transparent border, from re-reading 1.34.2 |
| 1.36.0 | | analytics screen rebuilt as one scrolling surface |
| 1.36.1 | | pinned chart colours, from the static sweep |

## Where the audit was wrong

Three of its prescriptions did not survive re-measurement. Recorded here
because the reasoning matters more than the fix.

**§1.4's proposed fix would have spread the defect.** It said to switch failing
buttons to "the solid `accent.blue` / `gradient` pair that the FAB and the
complete-button already use — those are the two buttons in the app that look
and measure right." They do not: white on the dark theme's `gradient.buttonStart`
measures **2.42:1** and on `buttonEnd` **2.72:1**. The dark theme's accents are
*light* colours, so no light ink can sit on them. The actual fix is a
`text.onAccent` token that flips — `#111827` dark, `#FFFFFF` light — which also
caught the FAB, all six auth screens, the receipt save button and History's
delete button, none of which the audit had measured.

**§1.1 and §2.1 contradicted each other.** §1.1 reasoned "the status bar's
backgrounds don't flip with the theme, so pin the ink dark." §2.1 then asked to
replace those backgrounds with `accent.*` tokens — which *do* flip, and whose
light-theme values are dark. A pinned dark ink on `#16A34A` fails. Resolved by
pinning both: `STATUS_BAR` in `theme.ts` is deliberately theme-independent,
because the bar is a mode indicator that should read identically in-store
either way, and pinning surface *and* ink is what makes its contrast provable.
`accent.neutral`, which §2.1 asked for, turned out to have no other consumer.

**§1.2's justification was factually wrong.** It argued the category label
could drop its colour because "the label is already redundant with the emoji
glyph beside it." `AnimatedItemCard` rendered no emoji — the colour was the only
non-textual encoding there was. The fix stands, but the glyph had to be *added*,
and the row it went into was not budgeted for the extra width (fixed in 1.34.2).

## Scope taken beyond the audit

Same defect class, sites the audit had not measured: the six auth screens'
sign-in buttons, the FAB, `SizeEditModal`'s unit groups (pinned dark-theme hexes
used as text), `DetailsEditModal`'s selected category label, `PriceHistoryModal`'s
trend badge, all five modal drag handles (15% white — invisible on a light
sheet), Settings' danger-zone heading icon.

Three tokens had to move because they could not survive their own tint:
dark `accent.red` `#FF453A → #FF7A70`, light `accent.blue` `#2563EB → #1D4ED8`,
light `accent.purple` `#7C3AED → #6D28D9`. Light green/yellow/orange/red moved a
step darker for the same reason (§1.5).

## The regression test, and what it does not prove

`src/styles/__tests__/contrast.test.ts` — a self-contained WCAG 2.1 helper with
alpha compositing over a parent chain, asserting every token pair that was
fixed. It caught all three of the token adjustments above.

It asserts **token pairs, not call sites**. The parent chains handed to the
helper are a reconstruction of the view tree, not the tree. A green suite means
the palette is internally sound; it says nothing about how any given screen
actually composites.

## Outstanding

- **Device validation in light *and* dark.** This is the audit's own closing
  condition: every single-theme defect in Priority 1 shipped precisely because
  AVD validation had been dark-only. No master merge before it.
- Worth a specific look, as the places where box model changed rather than
  colour: shopping-mode expanded panel (Cancel/Done row, and the offline notice
  on a narrow screen), item rows with a long category name next to a size, and
  every screen touched by the type-scale collapse.
- `ReceiptViewScreen`'s till-roll block moved down a step with the rest (mono
  values 15→14, line items 13→12). The internal relationships are preserved, but
  the field label and its mono value are now the same size where the value used
  to be one larger. This is the one place the audit called the app's genuine
  point of view, so look at it deliberately rather than in passing.
- All 23 Ionicons names used across the batch were checked against the installed
  glyphmap. A wrong name renders as nothing — no type error, no test failure, no
  warning — so re-check if any are changed.
- Not done, and not defects: converting the ~300 remaining `fontSize` literals
  to `TYPOGRAPHY` tokens, and the Analytics tab bar's four emoji (a labelled tab
  bar, so the glyph is decorative — the audit did not flag it).

## The AVD pass (2026-07-25) — what it found

Run on a Pixel_6 AVD in both themes. The theme was flipped through Settings'
Light/Dark control, never `adb shell cmd uimode night`: `ThemeContext.tsx:30`
persists a preference and only falls back to the system scheme, so once the
in-app control has been touched the OS-level flip is silently ignored. Mixing
the two methods yields two screenshots that differ for the wrong reason.

Three defects, all of them instances of things this batch claimed to have
fixed. They are corrected in 1.35.2 and 1.35.3.

1. **The create-list modal's Create button used `text.primary`.** Measured on
   device at 2.41:1 in light (`#111827` on `#3045D8`) and 2.54:1 in dark
   (`#FFFFFF` on `#829EFD`) — it failed *both* ways, because `text.primary`
   inverts per theme in the same direction as the surface. The same call-site
   miss was on HomeScreen's FAB icon (hardcoded `#FFFFFF`, so dark-only),
   ReceiptMatchScreen's apply label and spinner, and TermsAcceptanceScreen's
   spinner. `text.onAccent` measures ~7:1 on the same gradients.

2. **`modalButtonConfirm`'s `padding: 0` did nothing.** Yoga resolves
   `paddingVertical` / `paddingHorizontal` ahead of the `padding` shorthand, so
   `modalButton`'s `12` / `SPACING.xxl` survived and the confirm button was
   padded twice. The view bounds show it exactly: outer `[552,1380][934,1568]`
   against an inner gradient of `[618,1414][869,1534]` — a 66px and 34px shell.
   `modalButtons` is a row with the default `alignItems: stretch`, so Cancel
   grew to the taller sibling, which is what made it look oversized. Fixing the
   padding also recovers the third of Create's touch target that sat outside the
   visible button. Note the wrong fix here would be `alignItems: 'center'` on the
   row: it hides the symptom and leaves the phantom padding.

3. **`CustomAlert` drew its default and destructive labels with
   `text.primary`** while backing them with `accent.blue` / `accent.red` fills —
   2.42:1 measured. This is the widest-reaching instance, since it is every
   alert in the app.

### Why the contrast test did not catch any of it

`contrast.test.ts` asserts **token pairs**. The tokens were correct throughout;
what was wrong was which token each call site reached for. A passing suite here
says the palette is sound, not that the screens are. Closing that gap means
call-site linting, which was not built.

### Method notes

- `uiautomator dump` for exact view bounds. Arguing about Yoga precedence is
  weaker evidence than measuring the box.
- Sample real pixels and compute the ratio. At screenshot scale, 2.4:1 and
  4.6:1 look alike, and a missing icon reads as a slightly emptier row.
- Pixels behind an open modal are dimmed by the scrim. The shopping-mode bar
  reads 2.19:1 through it and 8.8:1 without it.

## Reviewing the rest of 1.34.2 (2026-07-25)

1.34.2 caused two of the four defects above, so the rest of it was read back.
One more thing in it was wrong.

**The transparent border on `doneButtonExpanded` was dead, and not inert.** It
was added so Done's outer box would match Cancel's, which has a real 1px
border — without it the gradient sat short inside a taller box. 1.35.4 then
gave the gradient `flex: 1`, which fills whatever height the row's stretch
hands out, and that is what actually solves the problem. The border stayed.
Because Yoga lays children out inside the padding box, it inset the gradient
1px on every side, and `doneButtonExpanded` sets no `backgroundColor` — so the
green shopping panel showed through as a hairline ring and Done's gradient
rendered 2px smaller than Cancel's outline. Removed in 1.35.5.

Its other two changes hold up. `categoryLabel`'s `flexShrink: 1` plus
`numberOfLines={1}` is the right mechanism — RN `Text` defaults to
`flexShrink: 0`, both siblings in `subRow` keep that default so all the shrink
lands on the label, and `itemContentColumn` is `flex: 1` so the row is
width-constrained. Still wants a long category next to a measurement on a
narrow screen to confirm it ellipsises rather than pushing the size off. The
`theme.ts` change was comment-only.

## The static sweep of the un-reached screens (2026-07-25)

`ReceiptViewScreen`, `HistoryScreen`, `HistoryDetailScreen`, `BudgetScreen`,
`AnalyticsScreen`, `ItemStoreComparison`, `SmartSavingsCard`,
`VolatileItemsChart` — read for the defect classes that produced the four
findings above, rather than device-inspected.

**One real defect.** `ItemStoreComparison`'s bars were `'#30D158'` and
`'#007AFF'` — iOS system colours, pinned. The green bar marks the *cheapest
store*, the point of the chart, and measures **1.65:1** against the light card,
under the 3:1 WCAG 1.4.11 asks of a graphical object. §1.5 moved light green to
`#166534` for exactly this reason and this call site never got the token. Same
class as the four AVD findings: the token was right, the call site reached for
something else. Fixed with two other pinned-palette leftovers in 1.36.1.

**Clean.** Every filled-accent surface across the eight files
(`retryButton`, `saveButton`, `deleteButton`, `filterButton`, `retryBtn`)
already draws its label with `text.onAccent` — 1.33.5 caught them all. All
`height: '100%'` in the app resolve against definite-height parents (8/8/4/8px
progress tracks); `PriceEditModal`'s `padding: 0` is a bare `TextInput` reset
with no sibling padding to fight. Six icon names checked against the glyphmap.

**The till-roll block reads fine statically.** The concern was that `label` and
`value` are both 14 now where the value used to be one step larger. They still
differ three ways — `text.secondary` vs `text.primary`, weight 400 vs 600, and
proportional vs `RECEIPT_FONT` — which is what `theme.ts:170` says the scale is
for ("levels come from weight and colour; size marks the jumps"). `totalLabel`
14 against `totalValue` 20 keeps its jump. Worth eyes on the 12px mono line
items for legibility, but there is no hierarchy defect to fix.

## The second AVD pass (2026-07-26) — validating 1.35.5–1.36.2

Pixel_6 AVD, both themes, debug build over Metro. Everything claimed above was
measured rather than eyeballed; pixels sampled from `adb exec-out screencap`
and composited ratios computed, view boxes from `uiautomator dump`.

**Confirmed fixed:**

| Claim | Measured |
|---|---|
| Expanded panel: no ring, buttons aligned | Cancel `[42,552][561,671]`, Done `[587,552][1038,671]`; gradient's box **identical to its parent** (was inset 1px). All four inner edges sample gradient, not `#30D158` |
| Done Shopping ink | 7.32:1 dark, 7.36:1 light |
| Segmented control separates by surface | **6.80:1** dark, 4.42:1 light (was 1.06:1) — the container samples `#191923`, exactly the computed value |
| Segment label | 7.35:1 dark, 6.70:1 light |
| Analytics total / label / small print | 18.60:1 / 8.22:1 / 15.82:1 dark; 15.82:1 / 6.26:1 / 15.82:1 light |
| Prices tab aligns with Overview | Confirmed — the three components' own margins are gone |
| No crashes | logcat clean; only pre-existing Firebase deprecation warnings |

**One new defect, and it was shipping.** Opening the store picker in light mode
showed a pale blue-to-lavender Confirm button — the *dark* theme's gradient.
`StoreNamePicker`, `PriceEditModal`, `SizeEditModal`, `DetailsEditModal` and
`FilterModal` all pinned `['#6EA8FE', '#A78BFA']` **and** drew their label with
`text.primary`. In dark mode that is white on light blue: **2.42:1**. Fixed in
1.36.3, measured at 7.28:1 after.

Why the earlier passes missed it: the sweep covered the eight *screens* the
audit named, and these are shared *components*. And the 50% disabled opacity
disguises it — at rest the washed-out gradient reads as a plausible disabled
state in either theme, which is exactly what it looked like until the store
name was filled in and the button went to full opacity.

**Pre-existing, not caused by this batch** (verified by swapping the old
`AnalyticsScreen` back in over Fast Refresh and re-shooting): the Stores bar
chart renders `999999` as the top label of the tallest bar, with the real value
clipped above it. It reproduces identically on the pre-rebuild code. A
`react-native-gifted-charts` artifact — the label of a bar at full chart height
is clipped by the plot area and a width-reservation placeholder shows through.

## Still outstanding

- The Stores chart's `999999` top label (above) — pre-existing, unfixed.
- `FloatingActionButton`'s disabled state pins `['#48484A', '#3A3A3C']`, so a
  disabled FAB is near-black in light mode. Not a contrast failure (its white
  icon holds ~7:1 either way), and fixing it means choosing a disabled-surface
  treatment the palette has no token for, so it was left alone deliberately.
- `VolatileItemsChart`'s x-axis labels clip at both ends ("iscuits", "Bre").
  Pre-existing — the chart's own width is unchanged — but there is now ~46dp of
  spare width it could use.
- ReceiptViewScreen's till-roll block — legibility of 12px mono line items only;
  the hierarchy question above is answered.
- The offline notice with the network actually down.
- `ItemStoreComparison`'s green bar could not be exercised: it needs one item
  priced at two or more stores, and the test account has no such item. The fix
  is a token swap verified by arithmetic, not on screen.
- `ReceiptMatchScreen:693-698` still pins its badge tints as rgba literals with
  theme-tracking foregrounds. Not measured — that screen was swept in 1.35.2 and
  was out of scope here.
