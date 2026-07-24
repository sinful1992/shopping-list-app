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
  colour: shopping-mode expanded panel (Cancel/Done row), item rows with a long
  category name next to a size, and every screen touched by the type-scale
  collapse.
- Not done, and not defects: converting the ~300 remaining `fontSize` literals
  to `TYPOGRAPHY` tokens, and the Analytics tab bar's four emoji (a labelled tab
  bar, so the glyph is decorative — the audit did not flag it).
