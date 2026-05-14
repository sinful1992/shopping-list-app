# Plan: Four UX Fixes

## Goals and Success Criteria

| # | Issue | Success |
|---|-------|---------|
| 1 | Settings has no follow-phone (system) theme option | Settings shows a 3-way control: System / Light / Dark; selecting System removes the stored preference so the app follows the OS |
| 2 | Item cards in shopping list view are hard to see | Cards have a clearly-distinguishable background on both dark and light themes |
| 3 | History totals do not appear after returning from a detail view | After visiting a detail and pressing back, the history list shows correct totals without a manual pull-to-refresh |
| 4 | Smart store-price suggestions only appear after manual refresh | Suggestions load automatically on first entry to the list screen and on return from any sub-screen |

---

## Root Cause Analysis

### Issue 1 - No System theme option
ThemeContext.tsx stores ThemePreference of 'light' | 'dark' | null. null already means follow system. The toggle() function only cycles between 'light' and 'dark', never setting null. The settings UI only exposes a single Switch, so there is no affordance to clear the preference.

### Issue 2 - Cards hard to see
ListDetailScreen.styles.ts itemRow.backgroundColor = theme.glass.subtle
- Dark: rgba(255,255,255,0.03) on #12121C background - 3% white, almost invisible
- Light: rgba(0,0,0,0.04) on #F0F2F5 background - 4% black, barely distinguishable
The border uses theme.border.subtle which is equally faint (5-6% opacity). The same pattern appears on HomeScreen list cards.

### Issue 3 - History totals missing after back-navigation
HistoryDetailScreen.loadListDetails() backfills totalAmount in WatermelonDB when it is null. HistoryScreen re-queries only when user/filter/sort deps change or on manual pull-to-refresh. There is no useFocusEffect to re-query when returning from HistoryDetailScreen.

### Issue 4 - Smart suggestions require manual refresh
loadPredictions() is triggered once inside InteractionManager.runAfterInteractions on mount, and manually via onRefresh. At the time InteractionManager fires (after navigation animation), either listFamilyGroupIdRef.current is undefined (list not yet loaded) or itemsRef.current.length is zero (WatermelonDB observer not yet fired). After both arrive, nothing re-triggers. On re-focus there is no useFocusEffect for predictions.

---

## Affected Files

| File | Change |
|------|--------|
| src/contexts/ThemeContext.tsx | Expose themeMode + setThemeMode; keep toggle for backward compat |
| src/screens/settings/SettingsScreen.tsx | Replace Switch with 3-button segmented control |
| src/screens/lists/ListDetailScreen.styles.ts | Increase itemRow card background contrast |
| src/screens/lists/HomeScreen.styles.ts | Increase listCard background contrast |
| src/screens/history/HistoryScreen.tsx | Add useFocusEffect to reload on focus |
| src/screens/lists/ListDetailScreen.tsx | Trigger predictions on item-observer first fire + useFocusEffect |

---

## Implementation Steps

### Step 1 - ThemeContext: expose themeMode and setThemeMode

File: src/contexts/ThemeContext.tsx

1. Export type ThemeMode = 'light' | 'dark' | 'system'.
2. Extend ThemeContextValue: add themeMode: ThemeMode and setThemeMode: (mode: ThemeMode) => Promise<void>. Keep existing toggle untouched.
3. Implement setThemeMode:
   - 'system' -> setPreference(null) + AsyncStorage.removeItem(STORAGE_KEY)
   - 'light'/'dark' -> setPreference(mode) + AsyncStorage.setItem(STORAGE_KEY, mode)
4. Derive themeMode: preference ?? 'system'
5. Provide all new values through the context provider.

### Step 2 - Settings: 3-way theme segmented control

File: src/screens/settings/SettingsScreen.tsx

1. Destructure themeMode and setThemeMode from useTheme().
2. Remove the existing Switch row for "Light Mode".
3. Replace with an inline row containing three TouchableOpacity buttons (System | Light | Dark).
   - Active button: theme.accent.blueSubtle bg, theme.accent.blue text, theme.accent.blueDim border.
   - Inactive: theme.glass.subtle bg, theme.text.secondary text.
4. Row label: "Theme" / "Auto follows your phone, or force light/dark".

### Step 3 - Card visibility

File: src/screens/lists/ListDetailScreen.styles.ts
- itemRow.backgroundColor: theme.glass.subtle -> theme.background.secondary
  (Dark: #1E1E2E on #12121C; Light: #FFFFFF on #F0F2F5)
- itemRow.borderColor: theme.border.subtle -> theme.border.strong

File: src/screens/lists/HomeScreen.styles.ts
- listCard.backgroundColor: theme.glass.subtle -> theme.background.secondary
- listCard.borderColor: theme.border.subtle -> theme.border.strong

### Step 4 - History: reload on focus

File: src/screens/history/HistoryScreen.tsx

1. Add useFocusEffect to the @react-navigation/native import.
2. Add useFocusEffect after existing useEffect blocks:
   useFocusEffect(useCallback(() => { if (user) { loadHistory(true); } }, [user]));
   Fires every time the screen gains focus, re-queries WatermelonDB, picks up backfilled totalAmount.

### Step 5 - Smart suggestions: load on screen entry

File: src/screens/lists/ListDetailScreen.tsx

Part A - items observer trigger (handles initial load when InteractionManager fires too early):
- Add predictionsLoadedRef = useRef(false) near other refs.
- Reset to false in cleanup of main useEffect([listId]).
- In WatermelonDB items observer, after calculateShoppingStats(mergedItems), add:
    if (!predictionsLoadedRef.current && mergedItems.length > 0 && listFamilyGroupIdRef.current) {
      predictionsLoadedRef.current = true;
      predictPricesFromHistory(mergedItems, listFamilyGroupIdRef.current);
    }

Part B - useFocusEffect trigger (handles return-to-screen):
- Add alongside existing store-layout useFocusEffect:
    useFocusEffect(useCallback(() => {
      const fgid = listFamilyGroupIdRef.current;
      const currentItems = itemsRef.current;
      if (fgid && currentItems.length > 0) {
        predictPricesFromHistory(currentItems, fgid);
      }
    }, [predictPricesFromHistory]));
- predictPricesFromHistory is stable useCallback([]) so no render loops.

---

## Test Strategy

| Scenario | Expected |
|----------|----------|
| Settings -> tap System | App follows OS theme; stored preference is cleared |
| Settings -> tap Dark | App stays dark regardless of OS theme |
| Settings -> tap Light | App stays light regardless of OS theme |
| Tap System after explicit dark/light | OS theme resumes immediately |
| Shopping list dark theme | Item cards #1E1E2E on #12121C - visibly distinct |
| Shopping list light theme | Item cards #FFFFFF on #F0F2F5 - clearly visible |
| Home screen light theme | List cards are white with a defined border |
| Complete trip -> History -> tap entry -> back | Total amount shows without pull-to-refresh |
| First-time open of a shopping list | Smart suggestions appear without pull-to-refresh |
| Leave list and return | Smart suggestions refresh on re-entry |

---

## Known Constraints

- toggle() is kept in ThemeContextValue for backward compatibility.
- useFocusEffect in HistoryScreen and the existing useEffect([user,...]) will both call loadHistory(true) on first mount - one extra query, idempotent, not a correctness issue.
- The items-observer prediction trigger and InteractionManager call can both fire on first mount; both are idempotent. predictionsLoadedRef prevents repeated fires on subsequent item changes.
- background.secondary for card backgrounds (#FFFFFF light / #1E1E2E dark) is the correct semantic token: intentionally one step lighter/darker than background.primary in both themes, matching the existing design contract in theme.ts.
