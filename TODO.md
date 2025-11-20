# Family Shopping List - TODO & Implementation Plan

**Last Updated:** 2025-11-20
**Current Status:** Sprint 8 Complete, Sprint 7 Complete, Sprint 6 Complete (Categories & Item Organization)

---

## 🚀 IMMEDIATE NEXT STEPS

### Sprint 4: Google Play Publishing (Resume)
**Status:** Keystore issue fixed, ready to upload

- [ ] Download latest AAB from GitHub Actions (build with new keystore)
- [ ] Upload AAB to Google Play Internal Testing
- [ ] Create in-app products in Google Play Console:
  - [ ] Monthly subscription (`monthly`) - £9.99/month
  - [ ] Yearly subscription (`yearly`) - £99.99/year
  - [ ] Lifetime purchase (`lifetime`) - £199.99 one-time
- [ ] Link products to entitlement "Family shopping list pro" in RevenueCat
- [ ] Add products to "default" offering in RevenueCat Dashboard
- [ ] Add internal testers (barkus.giedrius@gmail.com)
- [ ] Test purchase flow in internal testing
- [ ] Verify subscription unlocks Pro features
- [ ] Test restore purchases functionality

---

## 📋 ACTIVE DEVELOPMENT

### Sprint 5 Phase 2: Simplified Item Interaction ✅ COMPLETED
**Goal:** Reduce item row complexity from 6+ interactive elements to 1

#### Implementation Tasks:

**2.1 Clean Item Rows** ✅ COMPLETED
- [x] Remove inline edit buttons from item rows
- [x] Make item rows read-only by default (checkbox + name + price display)
- [x] Create `ItemEditModal` component
- [x] Implement tap-to-edit functionality
- [x] Show edit modal when item is tapped
- [x] Include name and price fields in edit modal (category pending Sprint 6)
- [x] Add save/cancel buttons in modal
- [x] Update `ListDetailScreen.tsx` renderItem to use new clean design

**2.2 Swipe Actions** ❌ SKIPPED (user preference)
- Swipe actions removed from roadmap per user feedback

**2.3 Long Press Menu** ✅ COMPLETED
- [x] Implement long press gesture on item rows
- [x] Create context menu with options:
  - [x] Edit item
  - [x] Delete item
- [x] Use native action sheet on iOS, Alert dialog on Android

**Files Modified:**
- `src/screens/lists/ListDetailScreen.tsx` ✅ (updated renderItem, removed inline editors)
- `src/components/ItemEditModal.tsx` ✅ (new file created)

**Design Mockup:**
```
Clean Item Row (read-only):
┌────────────────────────────────────┐
│ ☐ Milk                      £2.50  │  ← Tap to edit
└────────────────────────────────────┘
  ← Swipe left (delete)  Swipe right → (edit)

Edit Modal:
┌────────────────────────────────────┐
│ Edit Item                     [X]  │
│                                    │
│ Name: [Milk_____________]          │
│ Price: [£2.50___]                  │
│ Category: [Dairy ▼]                │
│                                    │
│ [Delete]         [Cancel] [Save]   │
└────────────────────────────────────┘
```

---

### Sprint 5 Phase 3: Action Button Hierarchy ✅ COMPLETED
**Goal:** Clear visual distinction between primary and secondary actions

#### Implementation Tasks:

**3.1 Floating Action Button (FAB)** ✅ COMPLETED
- [x] Research FAB libraries or implement custom
- [x] Create primary FAB for "Start Shopping"
- [x] Position bottom-right with safe area insets
- [x] Animate FAB entrance/exit
- [x] Handle scroll-to-hide behavior (conditional rendering)

**3.2 Secondary Actions Menu** ✅ SIMPLIFIED IMPLEMENTATION
- [x] Move "Take Receipt Photo" to secondary position
- [x] Simplified as secondary button instead of bottom sheet
- [x] Import Receipt Items as separate conditional button
- Note: Bottom sheet menu deferred to later sprint

**3.3 Visual Hierarchy** ✅ COMPLETED
- [x] Update button styles for clear primary/secondary distinction
- [x] Primary: Large, filled, high contrast (Green FAB)
- [x] Secondary: Minimal style with lower visual weight
- [x] Ensure accessibility (color contrast, touch targets)

**Files Modified:**
- `src/screens/lists/ListDetailScreen.tsx` ✅
- `src/components/FloatingActionButton.tsx` ✅ (new file created)

---

## 🎯 SPRINT 6: List Management Enhancements ✅ COMPLETED

### Category Organization ✅ COMPLETED
- [x] Add category field to Item model
- [x] Update WatermelonDB schema (migration needed)
- [x] Create predefined categories list:
  - [x] Produce, Dairy, Meat, Bakery, Frozen, Pantry, Beverages, Household, Personal Care, Other
- [x] Implement category picker in item edit modal
- [x] Group items by category in list view
- [x] Show item count per category
- [ ] Add collapsible category sections (future enhancement)
- [ ] Implement drag-to-reorder categories (future enhancement)
- [ ] Add custom category creation (future enhancement)
- [ ] Category color coding (optional)

### Bulk Operations
- [ ] Add multi-select mode toggle button
- [ ] Implement checkbox selection for multiple items
- [ ] Create bulk actions toolbar:
  - [ ] Check all selected
  - [ ] Uncheck all selected
  - [ ] Delete selected
  - [ ] Move to another list
  - [ ] Change category
- [ ] Show selected count in toolbar
- [ ] Add "Select All" / "Deselect All" options
- [ ] Exit multi-select mode on action complete

### List Templates & Duplication
- [ ] Add "Duplicate List" function
- [ ] Create template toggle in list settings
- [ ] Save list as template (strips prices, checked status)
- [ ] Template picker when creating new list
- [ ] Share template with family group
- [ ] Recurring list support (weekly groceries auto-create)
- [ ] Template categories (Groceries, Household, etc.)

### Item Reordering
- [ ] Install drag-and-drop library (if needed)
- [ ] Implement drag handles on items
- [ ] Add "Sort by" options:
  - [ ] Manual (drag-to-reorder)
  - [ ] Category
  - [ ] Name (A-Z)
  - [ ] Price (low-high, high-low)
  - [ ] Recently added
  - [ ] Checked/unchecked
- [ ] Save sort preference per list
- [ ] Remember user's preferred sort order

**Files to Create/Modify:**
- Schema migration for categories
- `src/models/ItemModel.ts` (add category field)
- `src/screens/lists/ListDetailScreen.tsx` (category grouping)
- `src/components/CategoryPicker.tsx` (new)
- `src/components/BulkActionsToolbar.tsx` (new)
- `src/components/TemplatePickerModal.tsx` (new)

---

## 📊 SPRINT 7: History & Insights ✅ COMPLETED

### Enhanced History View ✅ COMPLETED
- [x] Add filter UI to history screen:
  - [x] Date range picker (last week, month, year, custom)
  - [x] Filter by shopper (family member)
  - [x] Filter by price range slider
  - [x] Search box for list names
- [x] Implement archive functionality (lists older than 90 days)
- [x] Add "Archived" tab/section
- [x] Restore archived list functionality
- [ ] Permanent delete for archived lists (future enhancement)

### Price Comparison ✅ COMPLETED
- [x] Track price history for each unique item name
- [x] Show price trends in item details:
  - [x] Last 5 prices for this item
  - [x] Average price
  - [x] Lowest/highest price paid
- [x] Price alerts: "This usually costs £X"
- [x] Price change indicator (↑ £0.50 more than usual)
- [x] Best price recommendations

### Analytics Dashboard ✅ COMPLETED
- [x] Create new "Insights" tab/screen (Analytics tab)
- [x] Most frequently purchased items (top 10):
  - [x] With purchase frequency
  - [x] Average price
  - [x] Last purchased date
- [x] Spending trends chart:
  - [x] Line chart showing monthly/weekly spending
  - [x] Bar chart for category spending
  - [x] Use `react-native-gifted-charts`
- [x] Summary statistics:
  - [x] Total spent this month
  - [x] Average shopping trip cost
  - [x] Number of trips this month
  - [x] Most expensive category

### Smart Insights ✅ COMPLETED
- [x] Analyze shopping patterns:
  - [x] "You spend most on: Produce (35%)"
  - [x] "Average shopping trip: £45.20"
  - [x] Store breakdown with "Best Avg" and "Most Visited" badges
- [x] Budget adherence metrics:
  - [x] Progress bars with color-coded alerts (50%, 75%, 90%, 100% thresholds)
  - [x] "You stayed under budget" indicators
- [x] Personalized recommendations:
  - [x] "Frequently Bought Together" modal
  - [x] Quick-add frequently purchased items

**Files Created:**
- `src/screens/analytics/AnalyticsScreen.tsx` ✅
- `src/components/FilterModal.tsx` ✅
- `src/services/AnalyticsService.ts` ✅
- `src/services/PriceHistoryService.ts` ✅
- `src/components/FrequentlyBoughtModal.tsx` ✅

---

## 🚀 SPRINT 8: Advanced Features ✅ COMPLETED

### Receipt Improvements (Future Enhancement)
- [ ] Improve OCR accuracy (future enhancement)
- [ ] Manual receipt editing UI (future enhancement)
- [ ] Receipt image gallery (future enhancement)
- [ ] Receipt sharing (future enhancement)

### Smart Suggestions ✅ COMPLETED
- [x] Price prediction service:
  - [x] Analyze historical prices per item
  - [x] Predict price when adding item to list
  - [x] Show predicted total at list creation
  - [x] Update predictions as prices change
- [x] Frequent items suggestions:
  - [x] "You usually buy..." prompts when creating list
  - [x] Quick-add buttons for frequent items (FrequentlyBoughtModal)
  - [x] Smart price suggestions showing cheapest store per item
- [x] Store comparison:
  - [x] Bar chart comparing prices across stores
  - [x] "Best Deal" badges in PriceHistoryModal
  - [x] Smart suggestions showing where to save money

### Budget Alerts ✅ COMPLETED
- [x] Budget alert service with threshold checking (50%, 75%, 90%, 100%)
- [x] Budget configuration UI in BudgetScreen:
  - [x] Monthly/weekly budget limits
  - [x] Toggle to enable/disable alerts
  - [x] Settings persist via AsyncStorage
- [x] Color-coded progress bars (green → yellow → orange → red)
- [x] Alert messages based on spending level

### Advanced Filtering/Sorting ✅ COMPLETED
- [x] FilterModal component with:
  - [x] Date range picker
  - [x] Store selection
  - [x] Price range
  - [x] Categories
  - [x] Receipt status
- [x] SortDropdown component with 8 sorting options
- [x] Search functionality in HistoryScreen

### Theme & UI Enhancements ✅ COMPLETED
- [x] Centralized theme.ts with design constants
- [x] Liquid glass dark theme styling
- [x] Consistent styling across components

### Bug Fixes ✅ COMPLETED
- [x] Fixed urgent item completion not showing in resolved list
  - Added observeResolvedUrgentItems to LocalStorageManager
  - Added subscribeToResolvedUrgentItems to UrgentItemManager
  - Updated UrgentItemsScreen to observe both active and resolved items

**Files Created:**
- `src/styles/theme.ts` ✅
- `src/services/BudgetAlertService.ts` ✅
- `src/services/PricePredictionService.ts` ✅
- `src/components/FilterModal.tsx` ✅
- `src/components/SortDropdown.tsx` ✅
- `src/components/PriceHistoryModal.tsx` ✅ (enhanced with charts)

---

## 🔔 SPRINT 9: Notifications & Collaboration

### Push Notifications (Firebase Cloud Messaging)
- [ ] Configure FCM (already partially done)
- [ ] Notification types to implement:
  - [ ] Someone started shopping (real-time)
  - [ ] Urgent item added by family member
  - [ ] List completed by family member
  - [ ] Family member joined group
  - [ ] Item added to your list by someone else
  - [ ] Budget warning (approaching limit)
  - [ ] "Don't forget items!" reminder (scheduled)
- [ ] Notification settings screen:
  - [ ] Toggle each notification type on/off
  - [ ] Quiet hours (no notifications during sleep)
  - [ ] Notification sound selection
- [ ] In-app notification center:
  - [ ] Recent notifications list
  - [ ] Mark as read
  - [ ] Clear all
- [ ] Deep linking from notifications:
  - [ ] Open specific list when tapping notification
  - [ ] Open urgent items screen
  - [ ] Open family group settings

### Enhanced Family Features
- [ ] Family activity log:
  - [ ] Timeline of all family actions
  - [ ] "Mom added Milk to Groceries list"
  - [ ] "Dad completed Weekly Shopping"
  - [ ] Filter by family member
  - [ ] Filter by action type
- [ ] Item attribution:
  - [ ] Show who added each item
  - [ ] Small avatar/initial next to item
  - [ ] "Added by Mom • 2h ago"
- [ ] Shopping assignments:
  - [ ] Assign list to specific family member
  - [ ] "Dad, can you get milk?" feature
  - [ ] Assignment notifications
  - [ ] Accept/decline assignment
  - [ ] Due date for assignments
- [ ] Comments on items:
  - [ ] Add notes to specific items
  - [ ] "Get organic if possible"
  - [ ] "Brand doesn't matter"
  - [ ] Family members can reply
- [ ] Item voting:
  - [ ] Propose item to family
  - [ ] Vote yes/no on adding item
  - [ ] Auto-add if majority votes yes
  - [ ] "3/4 family members want cookies"
- [ ] Family member roles:
  - [ ] Admin: Full control
  - [ ] Shopper: Can shop and edit
  - [ ] Viewer: Read-only access
  - [ ] Role assignment in family group settings

### Social Features (Future/Optional)
- [ ] Share list outside family:
  - [ ] Generate view-only link
  - [ ] Expires after X days
  - [ ] Password protection option
- [ ] One-time shared list:
  - [ ] Invite friends for party shopping
  - [ ] Everyone can add items
  - [ ] Temporary collaboration
- [ ] Public recipe lists:
  - [ ] Share "Ingredients for X Recipe"
  - [ ] Community templates
  - [ ] Browse popular recipes
- [ ] Community templates:
  - [ ] Browse templates created by others
  - [ ] Rate and review templates
  - [ ] Fork/copy template to your account

**Files to Create:**
- `src/screens/notifications/NotificationsScreen.tsx` (new)
- `src/screens/notifications/NotificationSettingsScreen.tsx` (new)
- `src/screens/family/ActivityLogScreen.tsx` (new)
- `src/services/NotificationService.ts` (enhance existing)
- `src/components/ItemComments.tsx` (new)
- `src/components/ItemVoting.tsx` (new)

---

## 🛠️ SPRINT 10: Technical Debt & Performance

### Database Optimization
- [ ] Implement proper WatermelonDB migrations:
  - [ ] Create migration system
  - [ ] Document migration steps
  - [ ] Test migrations thoroughly
  - [ ] Rollback strategy
- [ ] Add database indexes:
  - [ ] Index on `listId` for items
  - [ ] Index on `familyGroupId` for lists
  - [ ] Index on `createdAt` for sorting
  - [ ] Composite indexes for common queries
- [ ] Archive old lists:
  - [ ] Auto-archive completed lists after 90 days
  - [ ] Archive to separate table
  - [ ] Restore on demand
- [ ] Database cleanup tools:
  - [ ] Remove orphaned items (no parent list)
  - [ ] Remove duplicate items
  - [ ] Compress old data
  - [ ] Vacuum database
- [ ] Export/import database:
  - [ ] Export all data as JSON
  - [ ] Import from JSON backup
  - [ ] Selective export (lists only, etc.)

### Code Quality
- [ ] Enable TypeScript strict mode:
  - [ ] Fix all type errors
  - [ ] Add strict null checks
  - [ ] Remove any types
  - [ ] Add proper return types
- [ ] Unit tests:
  - [ ] ShoppingListManager tests
  - [ ] ItemManager tests
  - [ ] UsageTracker tests
  - [ ] PaymentService tests
  - [ ] SyncEngine tests
  - [ ] Aim for 80%+ coverage
- [ ] Integration tests:
  - [ ] Sync engine end-to-end tests
  - [ ] Payment flow tests
  - [ ] Multi-device sync tests
- [ ] E2E tests (Detox):
  - [ ] Login flow
  - [ ] Create list flow
  - [ ] Add items flow
  - [ ] Shopping mode flow
  - [ ] Complete list flow
- [ ] Error boundaries:
  - [ ] Wrap all screens in error boundaries
  - [ ] Graceful error UI
  - [ ] Error reporting to Sentry
  - [ ] Retry mechanisms
- [ ] Sentry integration:
  - [ ] Install @sentry/react-native
  - [ ] Configure Sentry DSN
  - [ ] Breadcrumbs for user actions
  - [ ] Release tracking
  - [ ] Source maps upload

### Offline Robustness
- [ ] Better offline indicators:
  - [ ] Persistent banner when offline
  - [ ] Sync status icon in header
  - [ ] "Last synced: X minutes ago"
- [ ] Conflict resolution UI:
  - [ ] Show conflicts to user when detected
  - [ ] Let user choose which version to keep
  - [ ] "Your version" vs "Server version"
  - [ ] Side-by-side comparison
- [ ] Manual sync trigger:
  - [ ] "Sync Now" button in settings
  - [ ] Pull-to-refresh triggers sync
  - [ ] Show sync progress
- [ ] Sync status dashboard:
  - [ ] Pending operations count
  - [ ] Failed operations list
  - [ ] Retry failed operations
  - [ ] Clear failed operations
- [ ] Offline queue visibility:
  - [ ] Show queued changes
  - [ ] Edit queued changes before sync
  - [ ] Cancel queued operations

### Performance Optimization
- [ ] Image optimization:
  - [ ] Compress receipt images before upload
  - [ ] Generate thumbnails for gallery
  - [ ] Lazy load images
  - [ ] Cache images locally
- [ ] Lazy loading:
  - [ ] Paginate history (load 20 at a time)
  - [ ] Virtual scrolling for long lists
  - [ ] Lazy load old data
- [ ] Virtual scrolling:
  - [ ] Use FlatList optimizations
  - [ ] `getItemLayout` for fixed heights
  - [ ] `removeClippedSubviews`
  - [ ] `maxToRenderPerBatch`
- [ ] Bundle size optimization:
  - [ ] Analyze bundle with `react-native-bundle-visualizer`
  - [ ] Code splitting for screens
  - [ ] Remove unused dependencies
  - [ ] Tree-shaking
- [ ] Memory leak fixes:
  - [ ] Audit all useEffect cleanup functions
  - [ ] Remove event listeners properly
  - [ ] Cancel pending promises on unmount
  - [ ] Profile with React DevTools

**Files to Create/Modify:**
- `src/database/migrations/` (new directory)
- `tests/unit/` (new directory)
- `tests/integration/` (new directory)
- `tests/e2e/` (new directory)
- `src/components/ErrorBoundary.tsx` (new)
- `src/screens/sync/SyncStatusScreen.tsx` (new)

---

## 📝 TECHNICAL NOTES

### Architecture Decisions Made
1. **Firebase Realtime Database** for sync (not Supabase realtime due to RN compatibility)
2. **WatermelonDB** for local storage (offline-first)
3. **RevenueCat** for payments (cross-platform subscriptions)
4. **Family-level subscriptions** (one pays, all benefit)
5. **Owner email whitelist** for unlimited free access

### Code Style Guidelines
- Use TypeScript for all new files
- Use functional components with hooks
- Use `async/await` over promises where possible
- Add JSDoc comments for complex functions
- Follow existing naming conventions
- Keep files under 500 lines where possible

### Testing Strategy
- Unit tests for business logic (services, managers)
- Integration tests for sync and payment flows
- E2E tests for critical user journeys
- Manual testing on both iOS and Android
- Internal testing before production release

### Performance Targets
- App launch: < 2 seconds
- Screen transitions: < 300ms
- Sync operation: < 1 second for typical list
- Image upload: < 3 seconds for receipt
- Memory usage: < 100MB typical, < 200MB peak

### Accessibility Requirements
- All interactive elements min 44x44pt
- Color contrast ratio min 4.5:1
- Support for screen readers
- Support for dynamic text sizes
- Keyboard navigation (where applicable)

---

## 🚫 OUT OF SCOPE (For Now)

These features were discussed but are not planned for immediate implementation:

- iOS support (Android-first, iOS later)
- Web app version
- Desktop app
- Integration with external services (Alexa, Google Home)
- Barcode scanning for items
- Store maps / aisle navigation
- Coupon integration
- Recipe integration
- Meal planning
- Inventory tracking (what's in pantry/fridge)
- Smart home integration

---

## 🎯 SUCCESS METRICS

### User Engagement
- [ ] Daily active users (DAU)
- [ ] Weekly active users (WAU)
- [ ] Average sessions per user per week
- [ ] Average time spent in app
- [ ] Lists created per user per week
- [ ] Items added per user per week

### Feature Adoption
- [ ] % users using receipt scanning
- [ ] % users using shopping mode
- [ ] % users using urgent items
- [ ] % users in family groups
- [ ] % users with active subscriptions

### Performance
- [ ] App crash rate < 1%
- [ ] ANR (App Not Responding) rate < 0.5%
- [ ] Average sync time
- [ ] Offline mode usage

### Revenue (if monetized)
- [ ] Free to paid conversion rate
- [ ] Monthly recurring revenue (MRR)
- [ ] Churn rate
- [ ] Average revenue per user (ARPU)

---

## 📚 RESOURCES & REFERENCES

### Documentation
- [React Native Docs](https://reactnative.dev/docs/getting-started)
- [WatermelonDB Docs](https://watermelondb.dev/docs)
- [Firebase Docs](https://firebase.google.com/docs)
- [RevenueCat Docs](https://www.revenuecat.com/docs)

### Design Inspiration
- Todoist (task management UX)
- AnyList (shopping-specific features)
- OurGroceries (family collaboration)
- Microsoft To Do (clean UI)

### Code Repositories
- GitHub: `github.com/sinful1992/shopping-list-app`
- RevenueCat Dashboard: `app.revenuecat.com`
- Firebase Console: `console.firebase.google.com`
- Google Play Console: `play.google.com/console`

---

**End of TODO List**
