# Design Document

## Overview

This document provides detailed design specifications for all components in the Family Shopping List mobile application. Each component includes its purpose (from the architectural blueprint), file location, interface definitions with method signatures, data models, and requirement traceability.

## Design Principles

1. **Single Responsibility**: Each component has one clear purpose
2. **Dependency Injection**: Components receive dependencies rather than creating them
3. **Promise-based Async**: All async operations return Promises
4. **Offline-First**: Local storage is the source of truth; sync happens asynchronously
5. **Type Safety**: TypeScript for compile-time type checking
6. **React Native Best Practices**: Hooks, functional components, and Context API

---

## Component Specifications

### Component: AuthenticationModule

**Purpose**: Manages user registration, login, logout, and family group membership authentication via Firebase Authentication

**Location**: `src/services/AuthenticationModule.ts`

**Dependencies**:
- `@react-native-firebase/auth`
- `@react-native-firebase/database`

**Interface**:
```typescript
class AuthenticationModule {
  // Implements Req 1.1, 1.2
  async signUp(email: string, password: string): Promise<UserCredential>

  // Implements Req 1.2
  async signIn(email: string, password: string): Promise<UserCredential>

  // Implements Req 1.2
  async signInWithGoogle(): Promise<UserCredential>

  // Implements Req 1.6
  async signOut(): Promise<void>

  // Implements Req 1.3
  async getUserFamilyGroup(userId: string): Promise<FamilyGroup | null>

  // Implements Req 1.5
  async createFamilyGroup(groupName: string, userId: string): Promise<FamilyGroup>

  // Implements Req 1.4
  async joinFamilyGroup(invitationCode: string, userId: string): Promise<FamilyGroup>

  // Implements Req 1.2
  async getCurrentUser(): Promise<User | null>

  // Implements Req 1.2
  async getAuthToken(): Promise<string | null>

  // Listen for auth state changes
  onAuthStateChanged(callback: (user: User | null) => void): Unsubscribe
}
```

**Data Models**:
```typescript
interface User {
  uid: string
  email: string
  displayName: string | null
  familyGroupId: string | null
  createdAt: number
}

interface FamilyGroup {
  id: string
  name: string
  invitationCode: string
  createdBy: string
  memberIds: string[]
  createdAt: number
}

interface UserCredential {
  user: User
  token: string
}
```

**Implementation Notes**:
- Uses Firebase Authentication for user management
- Stores JWT tokens in AsyncStorage for persistence
- Family group data stored in Firebase Realtime Database at `/familyGroups/{groupId}`
- Invitation codes are 8-character alphanumeric strings (e.g., "A3F7K9M2")

---

### Component: ShoppingListManager

**Purpose**: Creates, reads, updates, and deletes shopping lists including metadata (name, creation date, status, completion date)

**Location**: `src/services/ShoppingListManager.ts`

**Dependencies**:
- `LocalStorageManager`
- `SyncEngine`

**Interface**:
```typescript
class ShoppingListManager {
  constructor(
    private localStorage: LocalStorageManager,
    private syncEngine: SyncEngine
  )

  // Implements Req 2.1, 2.2
  async createList(name: string, userId: string, familyGroupId: string): Promise<ShoppingList>

  // Implements Req 2.3
  async getAllActiveLists(familyGroupId: string): Promise<ShoppingList[]>

  // Implements Req 2.4
  async getListById(listId: string): Promise<ShoppingList | null>

  // Implements Req 2.5, 2.2
  async updateListName(listId: string, newName: string): Promise<ShoppingList>

  // Implements Req 2.7
  async markListAsCompleted(listId: string): Promise<ShoppingList>

  // Implements Req 2.6, 2.2
  async deleteList(listId: string): Promise<void>

  // Subscribe to list changes for real-time updates
  subscribeToListChanges(familyGroupId: string, callback: (lists: ShoppingList[]) => void): Unsubscribe
}
```

**Data Models**:
```typescript
interface ShoppingList {
  id: string
  name: string
  familyGroupId: string
  createdBy: string
  createdAt: number
  status: 'active' | 'completed' | 'deleted'
  completedAt: number | null
  receiptUrl: string | null
  receiptData: ReceiptData | null
  syncStatus: 'synced' | 'pending' | 'failed'
}

interface ReceiptData {
  merchantName: string | null
  purchaseDate: string | null
  totalAmount: number | null
  currency: string | null
  lineItems: ReceiptLineItem[]
  extractedAt: number
  confidence: number
}

interface ReceiptLineItem {
  description: string
  quantity: number | null
  price: number | null
}
```

**Implementation Notes**:
- IDs generated using UUID v4
- Default status is 'active' on creation
- Soft delete sets status to 'deleted' rather than removing from database
- syncStatus tracks whether changes have been synced to Firebase

---

### Component: ItemManager

**Purpose**: Manages individual shopping list items including adding, editing, removing, and toggling checked/unchecked status

**Location**: `src/services/ItemManager.ts`

**Dependencies**:
- `LocalStorageManager`
- `SyncEngine`

**Interface**:
```typescript
class ItemManager {
  constructor(
    private localStorage: LocalStorageManager,
    private syncEngine: SyncEngine
  )

  // Implements Req 3.1, 3.2
  async addItem(listId: string, name: string, quantity?: string): Promise<Item>

  // Implements Req 3.5, 3.2
  async updateItem(itemId: string, updates: Partial<Item>): Promise<Item>

  // Implements Req 3.3, 3.4, 3.2
  async toggleItemChecked(itemId: string): Promise<Item>

  // Implements Req 3.6, 3.2
  async deleteItem(itemId: string): Promise<void>

  // Get all items for a list
  async getItemsForList(listId: string): Promise<Item[]>

  // Subscribe to item changes for real-time updates - Implements Req 4.2
  subscribeToItemChanges(listId: string, callback: (items: Item[]) => void): Unsubscribe
}
```

**Data Models**:
```typescript
interface Item {
  id: string
  listId: string
  name: string
  quantity: string | null
  checked: boolean
  createdBy: string
  createdAt: number
  updatedAt: number
  syncStatus: 'synced' | 'pending' | 'failed'
}
```

**Implementation Notes**:
- Items are ordered by createdAt (oldest first)
- Checked items can optionally be moved to bottom of list in UI
- updatedAt timestamp updates on any modification for conflict resolution

---

### Component: SyncEngine

**Purpose**: Synchronizes all data (lists, items, metadata) between local storage and Firebase Realtime Database with conflict resolution

**Location**: `src/services/SyncEngine.ts`

**Dependencies**:
- `@react-native-firebase/database`
- `LocalStorageManager`
- `@react-native-netinfo/netinfo` (for connectivity status)

**Interface**:
```typescript
class SyncEngine {
  constructor(
    private localStorage: LocalStorageManager,
    private firebaseDb: FirebaseDatabase
  )

  // Implements Req 4.3, 4.6
  async syncPendingChanges(): Promise<SyncResult>

  // Implements Req 4.1, 4.2
  async pushChange(entityType: 'list' | 'item', entityId: string, operation: 'create' | 'update' | 'delete'): Promise<void>

  // Implements Req 4.4
  subscribeToRemoteChanges(familyGroupId: string, callback: (change: RemoteChange) => void): Unsubscribe

  // Implements Req 3.7, 4.5
  async resolveConflict(localEntity: any, remoteEntity: any): Promise<any>

  // Implements Req 9.5, 9.6
  async processOperationQueue(): Promise<void>

  // Get sync status
  getSyncStatus(): SyncStatus
}
```

**Data Models**:
```typescript
interface SyncResult {
  success: boolean
  syncedCount: number
  failedCount: number
  errors: SyncError[]
}

interface SyncError {
  entityId: string
  entityType: string
  error: string
}

interface RemoteChange {
  entityType: 'list' | 'item'
  entityId: string
  operation: 'create' | 'update' | 'delete'
  data: any
  timestamp: number
}

interface SyncStatus {
  isOnline: boolean
  pendingOperations: number
  lastSyncTimestamp: number | null
}

interface QueuedOperation {
  id: string
  entityType: 'list' | 'item'
  entityId: string
  operation: 'create' | 'update' | 'delete'
  data: any
  timestamp: number
  retryCount: number
}
```

**Implementation Notes**:
- Uses Firebase Realtime Database listeners for real-time updates
- Queue persisted in LocalStorageManager for offline resilience
- Retry logic: exponential backoff (1s, 2s, 4s, 8s, 16s) up to 5 attempts
- Conflict resolution: server timestamp wins (last-write-wins)
- Firebase paths: `/familyGroups/{groupId}/lists/{listId}` and `/familyGroups/{groupId}/items/{itemId}`

---

### Component: LocalStorageManager

**Purpose**: Persists shopping lists, items, and metadata locally using Realm/WatermelonDB for offline access and fast queries

**Location**: `src/services/LocalStorageManager.ts`

**Dependencies**:
- `@nozbe/watermelondb` or `realm`

**Interface**:
```typescript
class LocalStorageManager {
  // Lists
  async saveList(list: ShoppingList): Promise<ShoppingList>
  async getList(listId: string): Promise<ShoppingList | null>
  async getAllLists(familyGroupId: string): Promise<ShoppingList[]>
  async getActiveLists(familyGroupId: string): Promise<ShoppingList[]>
  async getCompletedLists(familyGroupId: string, startDate?: number, endDate?: number): Promise<ShoppingList[]>
  async updateList(listId: string, updates: Partial<ShoppingList>): Promise<ShoppingList>
  async deleteList(listId: string): Promise<void>

  // Items - Implements Req 9.2, 9.3
  async saveItem(item: Item): Promise<Item>
  async getItem(itemId: string): Promise<Item | null>
  async getItemsForList(listId: string): Promise<Item[]>
  async updateItem(itemId: string, updates: Partial<Item>): Promise<Item>
  async deleteItem(itemId: string): Promise<void>

  // Sync Queue - Implements Req 9.5
  async addToSyncQueue(operation: QueuedOperation): Promise<void>
  async getSyncQueue(): Promise<QueuedOperation[]>
  async removeFromSyncQueue(operationId: string): Promise<void>
  async clearSyncQueue(): Promise<void>

  // Receipt Data - Implements Req 6.4
  async saveReceiptData(listId: string, receiptData: ReceiptData): Promise<void>
  async getReceiptData(listId: string): Promise<ReceiptData | null>

  // Expenditure queries - Implements Req 7.2
  async getTotalExpenditureForDateRange(familyGroupId: string, startDate: number, endDate: number): Promise<number>
  async getListsWithReceiptsInDateRange(familyGroupId: string, startDate: number, endDate: number): Promise<ShoppingList[]>

  // Transactions for consistency - Implements Req 4.5
  async executeTransaction(callback: () => Promise<void>): Promise<void>
}
```

**Implementation Notes**:
- Uses WatermelonDB for reactive, offline-first data management
- Database schemas defined with decorators for models
- Indexes on: familyGroupId, status, createdAt, completedAt for fast queries
- Supports full-text search on list names and item names
- Transaction support ensures atomic operations

---

### Component: ReceiptCaptureModule

**Purpose**: Interfaces with device camera to capture receipt photos with automatic document boundary detection and cropping

**Location**: `src/services/ReceiptCaptureModule.ts`

**Dependencies**:
- `react-native-document-scanner-plugin`
- React Native permissions (camera access)

**Interface**:
```typescript
class ReceiptCaptureModule {
  // Implements Req 5.1, 5.2, 5.3
  async captureReceipt(): Promise<CaptureResult>

  // Implements Req 10.3, 10.4
  async requestCameraPermission(): Promise<boolean>

  // Check if camera permission is granted
  async hasCameraPermission(): Promise<boolean>
}
```

**Data Models**:
```typescript
interface CaptureResult {
  success: boolean
  filePath: string | null
  base64: string | null
  error: string | null
  cancelled: boolean
}
```

**Implementation Notes**:
- Uses `react-native-document-scanner-plugin` for automatic boundary detection
- Returns file path for upload, not base64 (unless specifically requested)
- Image quality set to 85 (0-100 scale) for optimal balance
- Maximum 1 scan per invocation (no batch scanning)
- Platform-specific permission handling (Info.plist for iOS, AndroidManifest.xml for Android)

---

### Component: ImageStorageManager

**Purpose**: Uploads receipt images to Firebase Cloud Storage, manages download URLs, and handles queued uploads during offline mode

**Location**: `src/services/ImageStorageManager.ts`

**Dependencies**:
- `@react-native-firebase/storage`
- `LocalStorageManager`

**Interface**:
```typescript
class ImageStorageManager {
  constructor(
    private firebaseStorage: FirebaseStorage,
    private localStorage: LocalStorageManager
  )

  // Implements Req 5.4, 5.5
  async uploadReceipt(filePath: string, listId: string, onProgress?: (progress: number) => void): Promise<string>

  // Implements Req 5.7
  async getReceiptDownloadUrl(storagePath: string): Promise<string>

  // Implements Req 5.6, 9.4, 9.7
  async queueReceiptForUpload(filePath: string, listId: string): Promise<void>

  // Implements Req 9.7
  async processUploadQueue(): Promise<UploadQueueResult>

  // Delete receipt from storage
  async deleteReceipt(storagePath: string): Promise<void>

  // Get upload queue status
  getQueuedUploadsCount(): Promise<number>
}
```

**Data Models**:
```typescript
interface UploadQueueResult {
  processedCount: number
  successCount: number
  failedCount: number
  errors: UploadError[]
}

interface UploadError {
  listId: string
  filePath: string
  error: string
}

interface QueuedUpload {
  id: string
  filePath: string
  listId: string
  timestamp: number
  retryCount: number
}
```

**Implementation Notes**:
- Storage path structure: `/receipts/{familyGroupId}/{listId}/{timestamp}.jpg`
- Upload includes progress callbacks for UI feedback
- Queue persisted in LocalStorageManager
- Automatic retry on failure with exponential backoff
- Download URLs are CDN-cached by Firebase

---

### Component: ReceiptOCRProcessor

**Purpose**: Sends receipt images to Google Cloud Vision API, extracts structured data (merchant, date, total, line items), and stores extracted data in database

**Location**: `src/services/ReceiptOCRProcessor.ts`

**Dependencies**:
- Google Cloud Vision API (REST)
- `LocalStorageManager`
- `SyncEngine`

**Interface**:
```typescript
class ReceiptOCRProcessor {
  constructor(
    private apiKey: string,
    private localStorage: LocalStorageManager,
    private syncEngine: SyncEngine
  )

  // Implements Req 6.1, 6.2, 6.3, 6.4, 6.5
  async processReceipt(imageUrl: string, listId: string): Promise<OCRResult>

  // Implements Req 6.7, 9.8
  async queueOCRRequest(imageUrl: string, listId: string): Promise<void>

  // Implements Req 9.8
  async processOCRQueue(): Promise<OCRQueueResult>

  // Implements Req 6.6
  async retryFailedOCR(listId: string): Promise<OCRResult>

  // Get OCR processing status
  async getOCRStatus(listId: string): Promise<OCRStatus>
}
```

**Data Models**:
```typescript
interface OCRResult {
  success: boolean
  receiptData: ReceiptData | null
  confidence: number
  error: string | null
  apiUsageCount: number // Track for billing - Implements Req 6.8
}

interface OCRStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  confidence: number | null
  processedAt: number | null
}

interface OCRQueueResult {
  processedCount: number
  successCount: number
  failedCount: number
  errors: OCRError[]
}

interface OCRError {
  listId: string
  error: string
}

interface QueuedOCRRequest {
  id: string
  imageUrl: string
  listId: string
  timestamp: number
  retryCount: number
}
```

**Implementation Notes**:
- Google Cloud Vision API endpoint: `https://vision.googleapis.com/v1/images:annotate`
- Feature type: `DOCUMENT_TEXT_DETECTION` for receipt text extraction
- Response parsing: Extract merchant (first bold/large text), date (regex pattern), total (largest amount near bottom)
- Confidence threshold: 70% minimum for auto-acceptance
- API usage tracking stored locally and synced for billing monitoring
- Free tier: 1,000 requests/month, then $1.50 per 1,000

---

### Component: BudgetTracker

**Purpose**: Calculates total expenditure across shopping trips within user-specified date ranges and displays spending summaries

**Location**: `src/services/BudgetTracker.ts`

**Dependencies**:
- `LocalStorageManager`

**Interface**:
```typescript
class BudgetTracker {
  constructor(private localStorage: LocalStorageManager)

  // Implements Req 7.2, 7.3
  async calculateExpenditureForDateRange(
    familyGroupId: string,
    startDate: number,
    endDate: number
  ): Promise<ExpenditureSummary>

  // Implements Req 7.4
  async getExpenditureBreakdown(
    familyGroupId: string,
    startDate: number,
    endDate: number
  ): Promise<ExpenditureBreakdownItem[]>

  // Implements Req 7.7
  async getExpenditureByMember(
    familyGroupId: string,
    startDate: number,
    endDate: number,
    userId: string
  ): Promise<ExpenditureSummary>

  // Implements Req 7.5
  async getListsWithoutReceipts(
    familyGroupId: string,
    startDate: number,
    endDate: number
  ): Promise<ShoppingList[]>
}
```

**Data Models**:
```typescript
interface ExpenditureSummary {
  totalAmount: number
  currency: string
  listCount: number
  listsWithReceipts: number
  listsWithoutReceipts: number
  dateRange: {
    start: number
    end: number
  }
}

interface ExpenditureBreakdownItem {
  listId: string
  listName: string
  completedAt: number
  merchantName: string | null
  totalAmount: number | null
  createdBy: string
  hasReceipt: boolean
}
```

**Implementation Notes**:
- All calculations in real-time from local database
- Currency defaults to USD; extracted from OCR data if available
- Lists without receipt data excluded from total but counted separately
- Supports filtering by individual family member via createdBy field

---

### Component: HistoryTracker

**Purpose**: Retrieves and displays historical shopping trips filtered by date, status, or family member with associated receipts

**Location**: `src/services/HistoryTracker.ts`

**Dependencies**:
- `LocalStorageManager`
- `ImageStorageManager`

**Interface**:
```typescript
class HistoryTracker {
  constructor(
    private localStorage: LocalStorageManager,
    private imageStorage: ImageStorageManager
  )

  // Implements Req 8.1
  async getCompletedLists(familyGroupId: string): Promise<ShoppingList[]>

  // Implements Req 8.5
  async getListsByDateRange(
    familyGroupId: string,
    startDate: number,
    endDate: number
  ): Promise<ShoppingList[]>

  // Implements Req 8.6
  async getListsByReceiptStatus(
    familyGroupId: string,
    hasReceipt: boolean
  ): Promise<ShoppingList[]>

  // Implements Req 8.7
  async searchListsByName(
    familyGroupId: string,
    searchQuery: string
  ): Promise<ShoppingList[]>

  // Implements Req 8.3
  async getListDetails(listId: string): Promise<ListDetails>

  // Get history with pagination
  async getHistoryPage(
    familyGroupId: string,
    offset: number,
    limit: number
  ): Promise<PaginatedHistory>
}
```

**Data Models**:
```typescript
interface ListDetails {
  list: ShoppingList
  items: Item[]
  receiptUrl: string | null
  receiptData: ReceiptData | null
}

interface PaginatedHistory {
  lists: ShoppingList[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
}
```

**Implementation Notes**:
- Default sort: completedAt descending (newest first)
- Search is case-insensitive and supports partial matching
- Pagination recommended for large datasets (20 items per page)
- Includes item counts in list summaries for quick overview

---

### Component: UILayer

**Purpose**: Renders React Native components for all user interactions including list views, item management, camera interface, and history browsing

**Location**: `src/screens/` and `src/components/`

**Key Screens**:
```
src/screens/
  ├── auth/
  │   ├── LoginScreen.tsx           # Implements Req 1.1, 1.2
  │   ├── SignUpScreen.tsx          # Implements Req 1.1
  │   └── FamilyGroupScreen.tsx     # Implements Req 1.4, 1.5
  ├── lists/
  │   ├── HomeScreen.tsx            # Implements Req 2.3
  │   ├── ListDetailScreen.tsx      # Implements Req 2.4, 3.1-3.6
  │   └── CreateListScreen.tsx      # Implements Req 2.1
  ├── receipts/
  │   ├── ReceiptCameraScreen.tsx   # Implements Req 5.1, 5.2
  │   └── ReceiptViewScreen.tsx     # Implements Req 5.7, 8.4
  ├── budget/
  │   └── BudgetScreen.tsx          # Implements Req 7.1-7.7
  └── history/
      ├── HistoryScreen.tsx         # Implements Req 8.1, 8.2
      └── HistoryDetailScreen.tsx   # Implements Req 8.3, 8.4
```

**Key Components**:
```
src/components/
  ├── ShoppingListCard.tsx          # Display list summary with receipt thumbnail
  ├── ItemRow.tsx                   # Display individual item with checkbox
  ├── ReceiptPreview.tsx            # Show receipt thumbnail
  ├── ExpenditureChart.tsx          # Visualize spending over time
  ├── DateRangePicker.tsx           # Date range selector for budget/history
  ├── OfflineIndicator.tsx          # Implements Req 9.1
  └── SyncStatusBadge.tsx           # Show sync status for lists/items
```

**React Native Patterns**:
- Functional components with React Hooks
- Context API for global state (AuthContext, SyncContext)
- React Navigation for routing
- FlatList for performant list rendering
- Implements Req 10.1, 10.2: Platform-specific styling

**Platform-Specific UI**:
```typescript
// iOS - Implements Req 10.1
import { Platform } from 'react-native'

const styles = StyleSheet.create({
  button: {
    ...Platform.select({
      ios: {
        backgroundColor: '#007AFF',
        borderRadius: 10,
      },
      android: {
        backgroundColor: '#2196F3',
        borderRadius: 2,
        elevation: 2,
      },
    }),
  },
})
```

---

## Data Flow Diagrams

### Create Shopping List Flow
```
User (UILayer)
  → ShoppingListManager.createList()
    → LocalStorageManager.saveList()
    → SyncEngine.pushChange('list', listId, 'create')
      → Firebase Realtime Database
        → Other devices receive change
          → LocalStorageManager.saveList()
            → UILayer re-renders
```

### Receipt Capture and OCR Flow
```
User (UILayer)
  → ReceiptCaptureModule.captureReceipt()
    → Device Camera
      → Returns filePath
  → ImageStorageManager.uploadReceipt(filePath, listId)
    → Firebase Cloud Storage
      → Returns storageUrl
  → ReceiptOCRProcessor.processReceipt(storageUrl, listId)
    → Google Cloud Vision API
      → Returns extracted data
  → LocalStorageManager.saveReceiptData(listId, receiptData)
  → SyncEngine.pushChange('list', listId, 'update')
    → Other devices receive OCR data
```

### Offline to Online Sync Flow
```
Device goes offline
  → User makes changes (add/edit/delete lists/items)
    → LocalStorageManager.save()
    → SyncEngine.addToQueue()

Device regains connectivity
  → SyncEngine detects online status
  → SyncEngine.processOperationQueue()
    → For each queued operation:
      → Push to Firebase Realtime Database
      → On success: remove from queue
      → On failure: retry with backoff
  → ImageStorageManager.processUploadQueue()
    → Upload queued receipts
  → ReceiptOCRProcessor.processOCRQueue()
    → Process queued OCR requests
```

---

## Database Schema (WatermelonDB)

### ShoppingLists Table
```javascript
tableSchema({
  name: 'shopping_lists',
  columns: [
    { name: 'name', type: 'string' },
    { name: 'family_group_id', type: 'string', isIndexed: true },
    { name: 'created_by', type: 'string', isIndexed: true },
    { name: 'created_at', type: 'number', isIndexed: true },
    { name: 'status', type: 'string', isIndexed: true },
    { name: 'completed_at', type: 'number', isOptional: true, isIndexed: true },
    { name: 'receipt_url', type: 'string', isOptional: true },
    { name: 'receipt_data', type: 'string', isOptional: true }, // JSON stringified
    { name: 'sync_status', type: 'string' },
  ]
})
```

### Items Table
```javascript
tableSchema({
  name: 'items',
  columns: [
    { name: 'list_id', type: 'string', isIndexed: true },
    { name: 'name', type: 'string' },
    { name: 'quantity', type: 'string', isOptional: true },
    { name: 'checked', type: 'boolean' },
    { name: 'created_by', type: 'string' },
    { name: 'created_at', type: 'number', isIndexed: true },
    { name: 'updated_at', type: 'number' },
    { name: 'sync_status', type: 'string' },
  ]
})
```

### SyncQueue Table
```javascript
tableSchema({
  name: 'sync_queue',
  columns: [
    { name: 'entity_type', type: 'string' },
    { name: 'entity_id', type: 'string' },
    { name: 'operation', type: 'string' },
    { name: 'data', type: 'string' }, // JSON stringified
    { name: 'timestamp', type: 'number', isIndexed: true },
    { name: 'retry_count', type: 'number' },
  ]
})
```

---

## Security Considerations

### Authentication
- Firebase Authentication handles password hashing and token management
- JWT tokens stored securely in AsyncStorage (encrypted on iOS via Keychain)
- Automatic token refresh handled by Firebase SDK

### Authorization
- Firebase Security Rules enforce family group access:
```json
{
  "rules": {
    "familyGroups": {
      "$groupId": {
        ".read": "auth != null && data.child('memberIds').val().contains(auth.uid)",
        ".write": "auth != null && data.child('memberIds').val().contains(auth.uid)"
      }
    }
  }
}
```

### API Keys
- Google Cloud Vision API key stored in environment variables
- API key restricted to:
  - Specific iOS bundle ID and Android package name
  - Vision API only (no other Google Cloud services)
  - Optional: IP address restrictions for added security

### Data Privacy
- Receipt images stored in Firebase Storage with authenticated access only
- Receipt data encrypted at rest (Firebase default)
- No personally identifiable information in OCR data unless on receipt

---

**Detailed Design Complete**: All 11 components specified with interfaces, data models, implementation notes, and requirement traceability. File locations established following React Native project structure.

**Ready to proceed to Phase 4: Task Decomposition?**
