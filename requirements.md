# Requirements Document

## Introduction

This document defines the functional and non-functional requirements for the Family Shopping List mobile application. Each requirement includes specific, testable acceptance criteria that reference the exact component responsible for implementation.

## Glossary

- **Shopping List**: A collection of items to be purchased during a single shopping trip
- **Item**: An individual product on a shopping list with name, quantity, and checked status
- **Receipt**: A photo of a purchase receipt with optional extracted data (merchant, date, total, line items)
- **Family Group**: A collection of users who share access to shopping lists
- **Expenditure**: The total amount spent on a shopping trip, extracted from receipt OCR data
- **Sync**: Process of synchronizing data between local storage and Firebase Realtime Database

---

## Requirements

### Requirement 1: User Authentication and Family Group Management

#### Acceptance Criteria

1.1. WHEN a new user opens the app for the first time, THE **AuthenticationModule** SHALL display registration options (email/password, Google Sign-In).

1.2. WHEN a user provides valid email and password credentials, THE **AuthenticationModule** SHALL authenticate the user with Firebase Authentication and store JWT tokens locally.

1.3. WHEN authentication succeeds, THE **AuthenticationModule** SHALL retrieve the user's family group membership and grant access to shared shopping lists.

1.4. WHEN a user is not part of any family group, THE **UILayer** SHALL display options to create a new family group or join an existing one via invitation code.

1.5. WHEN a user creates a family group, THE **AuthenticationModule** SHALL generate a unique group ID and invitation code, storing it in Firebase Realtime Database.

1.6. WHEN a user logs out, THE **AuthenticationModule** SHALL clear local authentication tokens and return to the login screen.

---

### Requirement 2: Shopping List Creation and Management

#### Acceptance Criteria

2.1. WHEN an authenticated user taps "Create New List", THE **ShoppingListManager** SHALL create a new shopping list with user-provided name, current timestamp, "active" status, and the creating user's ID.

2.2. WHEN a shopping list is created, THE **SyncEngine** SHALL immediately synchronize the new list to Firebase Realtime Database for all family members.

2.3. WHEN a user views the home screen, THE **UILayer** SHALL display all active shopping lists for the family group, sorted by creation date (newest first).

2.4. WHEN a user taps on a shopping list, THE **UILayer** SHALL navigate to the list detail view showing all items in that list.

2.5. WHEN a user edits a shopping list name, THE **ShoppingListManager** SHALL update the list name and THE **SyncEngine** SHALL synchronize the change across all devices.

2.6. WHEN a user deletes a shopping list, THE **ShoppingListManager** SHALL mark the list as deleted (soft delete) and THE **SyncEngine** SHALL propagate the deletion to all family members' devices.

2.7. WHEN a user marks a shopping list as "completed", THE **ShoppingListManager** SHALL update the status to "completed", set the completion timestamp, and move it to the history view.

---

### Requirement 3: Shopping List Item Management

#### Acceptance Criteria

3.1. WHEN a user adds an item to a shopping list, THE **ItemManager** SHALL create a new item with user-provided name, optional quantity, "unchecked" status, and current timestamp.

3.2. WHEN an item is added, THE **SyncEngine** SHALL immediately synchronize the new item to Firebase Realtime Database for all family members viewing the same list.

3.3. WHEN a user checks off an item, THE **ItemManager** SHALL toggle the item's checked status to "checked" and THE **SyncEngine** SHALL update all connected devices in real-time.

3.4. WHEN a user unchecks an item, THE **ItemManager** SHALL toggle the item's checked status back to "unchecked" and synchronize the change.

3.5. WHEN a user edits an item's name or quantity, THE **ItemManager** SHALL update the item details and THE **SyncEngine** SHALL propagate changes to all devices.

3.6. WHEN a user deletes an item, THE **ItemManager** SHALL remove the item from the list and THE **SyncEngine** SHALL synchronize the deletion across all devices.

3.7. WHEN multiple users edit the same item simultaneously, THE **SyncEngine** SHALL use Firebase transactions to resolve conflicts with server timestamp as the source of truth.

---

### Requirement 4: Real-Time Synchronization

#### Acceptance Criteria

4.1. WHEN any family member adds, edits, or deletes a shopping list, THE **SyncEngine** SHALL propagate changes to all other family members' devices within 2 seconds.

4.2. WHEN any family member adds, edits, checks, or deletes an item, THE **SyncEngine** SHALL propagate changes to all other family members' devices within 2 seconds.

4.3. WHEN a device regains internet connectivity after being offline, THE **SyncEngine** SHALL automatically upload all queued changes to Firebase Realtime Database.

4.4. WHEN the **SyncEngine** detects incoming changes from Firebase Realtime Database, it SHALL update THE **LocalStorageManager** and trigger UI refresh via THE **UILayer**.

4.5. WHEN multiple users modify the same shopping list simultaneously, THE **SyncEngine** SHALL use Firebase transactions to ensure data consistency.

4.6. WHEN synchronization fails due to network errors, THE **SyncEngine** SHALL retry with exponential backoff (1s, 2s, 4s, 8s) up to 5 attempts.

---

### Requirement 5: Receipt Photo Capture

#### Acceptance Criteria

5.1. WHEN a user taps "Add Receipt" on a completed shopping list, THE **UILayer** SHALL invoke THE **ReceiptCaptureModule** to open the device camera.

5.2. WHEN the camera opens, THE **ReceiptCaptureModule** SHALL activate automatic document boundary detection to highlight receipt edges.

5.3. WHEN a user captures a photo, THE **ReceiptCaptureModule** SHALL automatically crop the image to the detected receipt boundaries and return the file path.

5.4. WHEN the receipt image is captured, THE **ImageStorageManager** SHALL upload the image to Firebase Cloud Storage with progress indication.

5.5. WHEN the upload completes, THE **ImageStorageManager** SHALL store the Firebase Storage reference URL in THE **LocalStorageManager** linked to the shopping list.

5.6. WHEN the device is offline, THE **ImageStorageManager** SHALL queue the receipt image for upload and process the queue when connectivity is restored.

5.7. WHEN a user views a shopping list with a receipt, THE **UILayer** SHALL display a receipt thumbnail that opens the full image when tapped.

---

### Requirement 6: Receipt OCR Processing

#### Acceptance Criteria

6.1. WHEN a receipt image is successfully uploaded to Firebase Cloud Storage, THE **ImageStorageManager** SHALL trigger THE **ReceiptOCRProcessor** with the image URL.

6.2. WHEN triggered, THE **ReceiptOCRProcessor** SHALL send the receipt image to Google Cloud Vision API as a base64-encoded payload.

6.3. WHEN Google Cloud Vision API returns results, THE **ReceiptOCRProcessor** SHALL extract merchant name, purchase date, total amount, and line items from the JSON response.

6.4. WHEN data extraction succeeds, THE **ReceiptOCRProcessor** SHALL store the extracted data in THE **LocalStorageManager** linked to the shopping list ID.

6.5. WHEN extraction completes, THE **SyncEngine** SHALL synchronize the extracted receipt data to Firebase Realtime Database for all family members.

6.6. WHEN OCR extraction fails or confidence scores are below 70%, THE **ReceiptOCRProcessor** SHALL store a "processing_failed" status and allow manual entry via THE **UILayer**.

6.7. WHEN the device is offline, THE **ReceiptOCRProcessor** SHALL queue OCR requests and process them when connectivity is restored.

6.8. WHEN the monthly free tier limit (1,000 requests) is reached, THE **ReceiptOCRProcessor** SHALL continue processing using paid tier and log API usage for cost tracking.

---

### Requirement 7: Expenditure Tracking and Budget Analysis

#### Acceptance Criteria

7.1. WHEN a user navigates to the Budget/Expenditure screen, THE **UILayer** SHALL display date range selectors (start date and end date) with default to current month.

7.2. WHEN a user selects a date range, THE **BudgetTracker** SHALL query THE **LocalStorageManager** for all completed shopping lists within that range.

7.3. WHEN the query completes, THE **BudgetTracker** SHALL sum all receipt totals (from OCR extracted data) and display the total expenditure amount.

7.4. WHEN displaying expenditure, THE **UILayer** SHALL show a breakdown by shopping trip including: date, merchant name (if extracted), and total amount.

7.5. WHEN no receipt data is available for a shopping list, THE **BudgetTracker** SHALL exclude that list from calculations and display a count of lists without receipt data.

7.6. WHEN the user changes the date range, THE **BudgetTracker** SHALL recalculate totals in real-time without requiring a screen refresh.

7.7. WHEN displaying budget data, THE **UILayer** SHALL allow filtering by family member (who created the shopping list) to track individual spending.

---

### Requirement 8: Historical Shopping List Tracking

#### Acceptance Criteria

8.1. WHEN a user navigates to the History screen, THE **HistoryTracker** SHALL retrieve all completed shopping lists from THE **LocalStorageManager** sorted by completion date (newest first).

8.2. WHEN displaying historical lists, THE **UILayer** SHALL show list name, completion date, item count, and receipt thumbnail (if available).

8.3. WHEN a user taps on a historical list, THE **UILayer** SHALL display full list details including all items, checked/unchecked status, and full receipt image.

8.4. WHEN viewing a historical list with OCR data, THE **UILayer** SHALL display extracted receipt information (merchant, date, total) prominently below the list items.

8.5. WHEN a user applies date range filters, THE **HistoryTracker** SHALL filter lists by completion date and update the display immediately.

8.6. WHEN a user applies status filters (with/without receipts), THE **HistoryTracker** SHALL filter accordingly and display the filtered results.

8.7. WHEN a user searches historical lists by name, THE **HistoryTracker** SHALL perform case-insensitive partial matching and display results in real-time.

---

### Requirement 9: Offline Functionality

#### Acceptance Criteria

9.1. WHEN the device loses internet connectivity, THE **UILayer** SHALL display an offline indicator but allow full app usage.

9.2. WHEN offline, THE **ShoppingListManager** SHALL create, edit, and delete shopping lists using THE **LocalStorageManager** exclusively.

9.3. WHEN offline, THE **ItemManager** SHALL add, edit, check/uncheck, and delete items with all changes persisted to THE **LocalStorageManager**.

9.4. WHEN offline, THE **ReceiptCaptureModule** and THE **ImageStorageManager** SHALL allow receipt photo capture with images queued for upload.

9.5. WHEN offline, THE **SyncEngine** SHALL queue all changes (lists, items, metadata) with operation type (create/update/delete) and timestamps.

9.6. WHEN connectivity is restored, THE **SyncEngine** SHALL process the operation queue in chronological order, syncing all changes to Firebase Realtime Database.

9.7. WHEN connectivity is restored, THE **ImageStorageManager** SHALL process the upload queue in order, uploading all queued receipt images.

9.8. WHEN connectivity is restored, THE **ReceiptOCRProcessor** SHALL process queued OCR requests for uploaded receipts.

9.9. WHEN offline changes conflict with server changes, THE **SyncEngine** SHALL use server timestamp as the source of truth and notify the user of conflicts via THE **UILayer**.

---

### Requirement 10: Cross-Platform Mobile Support

#### Acceptance Criteria

10.1. WHEN the app is installed on an iOS device, THE **UILayer** SHALL render native-looking iOS components following Apple Human Interface Guidelines.

10.2. WHEN the app is installed on an Android device, THE **UILayer** SHALL render native-looking Android components following Material Design guidelines.

10.3. WHEN accessing device camera on iOS, THE **ReceiptCaptureModule** SHALL request camera permissions via Info.plist NSCameraUsageDescription.

10.4. WHEN accessing device camera on Android, THE **ReceiptCaptureModule** SHALL request camera permissions via Android permissions system.

10.5. WHEN storing data locally on iOS, THE **LocalStorageManager** SHALL use Realm/WatermelonDB with iOS-optimized file paths.

10.6. WHEN storing data locally on Android, THE **LocalStorageManager** SHALL use Realm/WatermelonDB with Android-optimized file paths.

10.7. WHEN the app is built for distribution, the React Native build process SHALL generate native iOS .ipa and Android .apk/.aab files for respective app stores.

---

## Summary

- **Total Requirements**: 10
- **Total Acceptance Criteria**: 67
- **Components Referenced**: AuthenticationModule, ShoppingListManager, ItemManager, SyncEngine, LocalStorageManager, ReceiptCaptureModule, ImageStorageManager, ReceiptOCRProcessor, BudgetTracker, HistoryTracker, UILayer

All acceptance criteria are testable, measurable, and assigned to specific components from the architectural blueprint. Each criterion follows the format: WHEN [trigger], THE **[Component]** SHALL [behavior].

---

**Requirements Documentation Complete**: 10 requirements with 67 testable acceptance criteria, all mapped to blueprint components.

**Ready to proceed to Phase 3: Detailed Design?**
