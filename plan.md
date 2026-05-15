# Plan: OCR Overlay Visibility, Match Screen Contrast, Settings Theme Row Layout

## Goals and Success Criteria

| # | Issue | Success Criterion |
|---|-------|-------------------|
| 1 | OCR scan overlay nearly invisible over receipt photo | Card clearly readable in all lighting; text, buttons, status info legible on the dark overlay |
| 2 | Post-scan ReceiptMatchScreen low contrast in light mode | Match cards and skip button have clear visual boundaries on both themes |
| 3 | Settings theme-selector row broken layout — blank gaps, buttons detached from label | Auto/Light/Dark sits directly under label; row compact and readable |

---

## Root Cause Analysis

### Bug 1 — OCR overlay invisible (ReceiptPreviewOverlay.tsx)

  card.backgroundColor = theme.glass.elevated = rgba(255,255,255,0.08)

8% white — effectively transparent. When this card sits on top of a receipt photo
(white paper filling the screen) the card surface disappears. In dark mode text is
#fff, rendering white-on-white-receipt. In light mode text switches to #111827 which
is dark-on-transparent — equally illegible against the background photo.

Button styles on the same card:
  retakeButton.backgroundColor = theme.glass.medium  = rgba(255,255,255,0.05)  near invisible
  retakeButton.borderColor     = theme.border.medium = rgba(255,255,255,0.08)  near invisible

The overlay is ALWAYS rendered over a camera feed or captured photo, never over a
solid themed background. App-theme colour values are irrelevant here — the overlay
must be permanently opaque and dark.

### Bug 2 — ReceiptMatchScreen low contrast in light mode (ReceiptMatchScreen.tsx)

  matchCard.backgroundColor = theme.glass.subtle = rgba(0,0,0,0.04) in light mode

4% opacity black on #F0F2F5 page background — cards are practically invisible,
indistinguishable from the page background.

  skipButton.backgroundColor = theme.glass.subtle   = rgba(0,0,0,0.04)  invisible fill
  skipButton.borderColor     = theme.border.medium   = rgba(0,0,0,0.10)  barely visible

Skip button appears as a ghost in light mode. Dark mode is unaffected.

### Bug 3 — Settings theme row layout broken

Row structure:
  settingRow (flexDirection: row, alignItems: center)
    settingInfo (flex: 1)           <-- consumes ALL horizontal space
    themeSegmentedRow (no flex, no width)
      themeButton (flex: 1)   --+
      themeButton (flex: 1)     +-- three flex:1 children inside a 0-width parent
      themeButton (flex: 1)   --+

settingInfo with flex:1 in a row consumes all available width. themeSegmentedRow
receives 0 remaining width. Its three flex:1 children have no bounded dimension.
Yoga on Android collapses the container and stacks content vertically — causing the
large blank whitespace and the segmented control appearing detached from its label.

Fix: Change the Theme row from horizontal settingRow to vertical themeSettingBlock
(column). Label and description stack above the segmented row. With full container
width available, themeButton flex:1 distributes evenly across the three buttons.

---

## Affected Files

| File | Change Summary |
|------|----------------|
| src/components/ReceiptPreviewOverlay.tsx | Harden card to opaque dark; hardcode text/button colours inside overlay |
| src/screens/receipts/ReceiptMatchScreen.tsx | matchCard -> theme.background.secondary; skipButton -> glass.strong / border.strong |
| src/screens/settings/SettingsScreen.styles.ts | Add themeSettingBlock style (column layout, paddingVertical 8) |
| src/screens/settings/SettingsScreen.tsx | Use themeSettingBlock instead of settingRow for Theme row only |

---

## Implementation Steps

### Step 1 — src/components/ReceiptPreviewOverlay.tsx

Harden card and all inner styles to hardcoded dark values.
Accent colours (blue, orange, green) still come from theme — readable on a dark surface.

Changes inside createStyles:

  card.backgroundColor          theme.glass.elevated  ->  rgba(18, 18, 30, 0.94)
  card.borderColor              theme.border.medium   ->  rgba(255, 255, 255, 0.12)
  loadingText.color             theme.text.primary    ->  #fff
  errorText.color               theme.text.secondary  ->  rgba(255, 255, 255, 0.75)
  fieldLabel.color              theme.text.secondary  ->  rgba(255, 255, 255, 0.60)
  fieldValue.color              theme.text.primary    ->  #fff
  fieldValueMissing.color       theme.text.tertiary   ->  rgba(255, 255, 255, 0.38)
  retakeButton.backgroundColor  theme.glass.medium    ->  rgba(255, 255, 255, 0.15)
  retakeButton.borderColor      theme.border.medium   ->  rgba(255, 255, 255, 0.28)
  retakeButtonText.color        theme.text.primary    ->  #fff
  galleryLinkText.color         theme.text.tertiary   ->  rgba(255, 255, 255, 0.55)

NOT changed: confirmButton.backgroundColor, confirmButtonText.color, badge colours,
confidenceText, confidenceBadge.

### Step 2 — src/screens/receipts/ReceiptMatchScreen.tsx (inside createStyles)

  matchCard.backgroundColor   theme.glass.subtle  ->  theme.background.secondary
    Light: #FFFFFF on #F0F2F5 -- clearly visible card
    Dark:  #1E1E2E on #12121C -- slightly elevated card, correct

  skipButton.backgroundColor  theme.glass.subtle  ->  theme.glass.strong
    Light: rgba(0,0,0,0.12) -- visible ghost button

  skipButton.borderColor      theme.border.medium ->  theme.border.strong
    Light: rgba(0,0,0,0.14) -- readable border

No other changes; dark mode results verified not to regress.

### Step 3 — src/screens/settings/SettingsScreen.styles.ts

Add after settingRow:

  themeSettingBlock: {
    paddingVertical: 8,
    // default flexDirection is column
    // themeSegmentedRow gets full width; flex:1 buttons work correctly
  },

settingRow, themeSegmentedRow, themeButton are NOT modified.
settingRow is still used by Haptic Feedback and OCR Server rows.

### Step 4 — src/screens/settings/SettingsScreen.tsx

Single JSX change — Theme row outer wrapper only:
  Wrap the Theme row in themeSettingBlock instead of settingRow.
Children (settingInfo, themeSegmentedRow) are unchanged.

---

## Test Strategy

  ReceiptCameraScreen dark theme  | Scan white receipt  | Overlay opaque; text/buttons readable over white paper
  ReceiptCameraScreen light theme | Scan white receipt  | Card still dark — hardcoded, not themed
  ReceiptCameraScreen             | Error state         | Warning icon, error message, Try again + Retake all visible
  ReceiptCameraScreen             | Success state       | Merchant/Date/Total/Items readable; Retake + Confirm visible
  ReceiptMatchScreen              | Light mode          | Match cards white on gray — distinct; Skip has visible border
  ReceiptMatchScreen              | Dark mode           | No regression — slightly elevated cards on dark bg
  ReceiptMatchScreen              | Reject a match      | Strikethrough and opacity still visible on white card
  SettingsScreen                  | Light mode          | Theme label visible; segmented control directly below; no gap
  SettingsScreen                  | Dark mode           | Compact layout; inactive buttons subtle; active button blue
  SettingsScreen                  | Tap theme options   | Preference persists; UI switches immediately
  SettingsScreen                  | Haptic Feedback row | Uses settingRow (horizontal) — unaffected
  SettingsScreen                  | OCR Server row      | Uses settingRow (horizontal) — unaffected

---

## Known Constraints

- Android only — iOS is out of scope.
- No build commands — CI handles builds via GitHub Actions.
- Overlay colours are intentionally hardcoded: ReceiptPreviewOverlay is always rendered
  over camera/photo content. Using themed colours causes the card to be invisible when
  the user is in light mode. This is a deliberate design decision, not a theme gap.
- Dark mode regression check for matchCard: theme.background.secondary in dark is #1E1E2E,
  slightly lighter than page background #12121C. Cards become MORE distinguishable.
- settingRow style is preserved — still used by Haptic Feedback and OCR Server rows.
  Only the Theme row adopts the new column layout.
- settingInfo.marginRight:12 has no visible effect in a column parent; left unchanged.
