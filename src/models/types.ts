// Core User and Authentication Types

export interface User {
  uid: string;
  email: string;
  displayName: string | null;
  familyGroupId: string | null;
  createdAt: number;
}

export interface FamilyGroup {
  id: string;
  name: string;
  invitationCode: string;
  createdBy: string;
  memberIds: string[];
  createdAt: number;
}

export interface UserCredential {
  user: User;
  token: string;
}

// Shopping List Types

export type ListStatus = 'active' | 'completed' | 'deleted';
export type SyncStatus = 'synced' | 'pending' | 'failed';

export interface ShoppingList {
  id: string;
  name: string;
  familyGroupId: string;
  createdBy: string;
  createdAt: number;
  status: ListStatus;
  completedAt: number | null;
  receiptUrl: string | null;
  receiptData: ReceiptData | null;
  syncStatus: SyncStatus;
}

export interface Item {
  id: string;
  listId: string;
  name: string;
  quantity: string | null;
  price: number | null;
  checked: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  syncStatus: SyncStatus;
}

// Receipt Types

export interface ReceiptData {
  merchantName: string | null;
  purchaseDate: string | null;
  totalAmount: number | null;
  currency: string | null;
  lineItems: ReceiptLineItem[];
  extractedAt: number;
  confidence: number;
}

export interface ReceiptLineItem {
  description: string;
  quantity: number | null;
  price: number | null;
}

// Google Cloud Vision API Response Types
export interface VisionVertex {
  x?: number;
  y?: number;
}

export interface VisionBoundingPoly {
  vertices: VisionVertex[];
}

export interface VisionEntityAnnotation {
  locale?: string;
  description: string;
  boundingPoly: VisionBoundingPoly;
  confidence?: number;
}

export interface VisionApiResponse {
  responses: VisionAnnotateImageResponse[];
}

export interface VisionAnnotateImageResponse {
  textAnnotations?: VisionEntityAnnotation[];
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export interface CaptureResult {
  success: boolean;
  filePath: string | null;
  base64: string | null;
  error: string | null;
  cancelled: boolean;
}

// OCR Types

export type OCRStatusType = 'pending' | 'processing' | 'completed' | 'failed';

export interface OCRResult {
  success: boolean;
  receiptData: ReceiptData | null;
  confidence: number;
  error: string | null;
  apiUsageCount: number;
}

export interface OCRStatus {
  status: OCRStatusType;
  confidence: number | null;
  processedAt: number | null;
}

export interface QueuedOCRRequest {
  id: string;
  imageUrl: string;
  listId: string;
  timestamp: number;
  retryCount: number;
}

// Sync Types

export type EntityType = 'list' | 'item' | 'urgentItem';
export type Operation = 'create' | 'update' | 'delete';

export interface QueuedOperation {
  id: string;
  entityType: EntityType;
  entityId: string;
  operation: Operation;
  data: any;
  timestamp: number;
  retryCount: number;
}

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  errors: SyncError[];
}

export interface SyncError {
  entityId: string;
  entityType: string;
  error: string;
}

export interface RemoteChange {
  entityType: EntityType;
  entityId: string;
  operation: Operation;
  data: any;
  timestamp: number;
}

export interface SyncEngineStatus {
  isOnline: boolean;
  pendingOperations: number;
  lastSyncTimestamp: number | null;
}

// Storage Types

export interface QueuedUpload {
  id: string;
  filePath: string;
  listId: string;
  timestamp: number;
  retryCount: number;
}

export interface UploadQueueResult {
  processedCount: number;
  successCount: number;
  failedCount: number;
  errors: UploadError[];
}

export interface UploadError {
  listId: string;
  filePath: string;
  error: string;
}

export interface OCRQueueResult {
  processedCount: number;
  successCount: number;
  failedCount: number;
  errors: OCRError[];
}

export interface OCRError {
  listId: string;
  error: string;
}

// Urgent Item Types

export type UrgentItemStatus = 'active' | 'resolved';

export interface UrgentItem {
  id: string;
  name: string;
  familyGroupId: string;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolvedAt: number | null;
  price: number | null;
  status: UrgentItemStatus;
  syncStatus: SyncStatus;
}

// Budget and Expenditure Types

export interface ExpenditureSummary {
  totalAmount: number;
  currency: string;
  listCount: number;
  listsWithReceipts: number;
  listsWithoutReceipts: number;
  dateRange: {
    start: number;
    end: number;
  };
}

export interface ExpenditureBreakdownItem {
  listId: string;
  listName: string;
  completedAt: number;
  merchantName: string | null;
  totalAmount: number | null;
  createdBy: string;
  hasReceipt: boolean;
}

// History Types

export interface ListDetails {
  list: ShoppingList;
  items: Item[];
  receiptUrl: string | null;
  receiptData: ReceiptData | null;
}

export interface PaginatedHistory {
  lists: ShoppingList[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

// Utility Types

export type Unsubscribe = () => void;
