import { ShoppingList, Item, UrgentItem, StoreLayout, ListStatus, FamilyRole, ReceiptData, UrgentItemStatus } from '../../models/types';
import { CategoryType } from '../CategoryService';

/**
 * Firebase → domain-type mappers.
 *
 * Single source of truth for every default applied when hydrating entities
 * from Firebase RTDB payloads (previously duplicated between the initial
 * get() blocks and the syncXToLocal methods in FirebaseSyncListener).
 *
 * Defaulting policy: `??` everywhere — only null/undefined fall back, so
 * legitimate 0 (budget, totalAmount, price) and false values survive.
 * For string fields Firebase never stores empty strings as "missing", so
 * `??` and `||` are equivalent in practice; `??` is used for consistency.
 */

export interface FirebaseListPayload {
  name?: string;
  familyGroupId?: string;
  createdBy?: string;
  createdAt?: number;
  status?: ListStatus;
  completedAt?: number | null;
  completedBy?: string | null;
  receiptUrl?: string | null;
  receiptData?: ReceiptData | null;
  isLocked?: boolean;
  lockedBy?: string | null;
  lockedByName?: string | null;
  lockedByRole?: FamilyRole | null;
  lockedAt?: number | null;
  budget?: number | null;
  storeName?: string | null;
  archived?: boolean | null;
  layoutApplied?: boolean | null;
  totalAmount?: number | null;
  merchantName?: string | null;
  purchaseDate?: string | null;
  currency?: string | null;
}

export function mapFirebaseList(
  id: string,
  data: FirebaseListPayload,
  fallbackFamilyGroupId: string
): ShoppingList {
  return {
    id,
    name: data.name ?? '',
    familyGroupId: data.familyGroupId ?? fallbackFamilyGroupId,
    createdBy: data.createdBy ?? '',
    createdAt: data.createdAt ?? Date.now(),
    status: data.status ?? 'active',
    completedAt: data.completedAt ?? null,
    completedBy: data.completedBy ?? null,
    receiptUrl: data.receiptUrl ?? null,
    receiptData: data.receiptData ?? null,
    syncStatus: 'synced',
    isLocked: data.isLocked ?? false,
    lockedBy: data.lockedBy ?? null,
    lockedByName: data.lockedByName ?? null,
    lockedByRole: data.lockedByRole ?? null,
    lockedAt: data.lockedAt ?? null,
    budget: data.budget ?? null,
    storeName: data.storeName ?? null,
    archived: data.archived ?? false,
    layoutApplied: data.layoutApplied ?? false,
    totalAmount: data.totalAmount ?? null,
    merchantName: data.merchantName ?? null,
    purchaseDate: data.purchaseDate ?? null,
    currency: data.currency ?? null,
  };
}

export interface FirebaseItemPayload {
  name?: string;
  quantity?: string | null;
  price?: number | null;
  checked?: boolean;
  createdBy?: string;
  createdAt?: number;
  updatedAt?: number;
  category?: string | null;
  sortOrder?: number | null;
  unitQty?: number | null;
  measurementUnit?: string | null;
  measurementValue?: number | null;
}

export function mapFirebaseItem(id: string, listId: string, data: FirebaseItemPayload): Item {
  return {
    id,
    listId,
    name: data.name ?? '',
    quantity: data.quantity ?? null,
    price: data.price ?? null,
    checked: data.checked ?? false,
    createdBy: data.createdBy ?? '',
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? Date.now(),
    syncStatus: 'synced',
    category: data.category ?? null,
    sortOrder: data.sortOrder ?? null,
    unitQty: data.unitQty ?? null,
    measurementUnit: data.measurementUnit ?? null,
    measurementValue: data.measurementValue ?? null,
  };
}

export interface FirebaseUrgentItemPayload {
  name?: string;
  familyGroupId?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: number;
  resolvedBy?: string | null;
  resolvedByName?: string | null;
  resolvedAt?: number | null;
  price?: number | null;
  status?: UrgentItemStatus;
}

export function mapFirebaseUrgentItem(
  id: string,
  data: FirebaseUrgentItemPayload,
  fallbackFamilyGroupId: string
): UrgentItem {
  return {
    id,
    name: data.name ?? '',
    familyGroupId: data.familyGroupId ?? fallbackFamilyGroupId,
    createdBy: data.createdBy ?? '',
    createdByName: data.createdByName ?? '',
    createdAt: data.createdAt ?? Date.now(),
    resolvedBy: data.resolvedBy ?? null,
    resolvedByName: data.resolvedByName ?? null,
    resolvedAt: data.resolvedAt ?? null,
    price: data.price ?? null,
    status: data.status ?? 'active',
    syncStatus: 'synced',
  };
}

export interface FirebaseStoreLayoutPayload {
  familyGroupId?: string;
  storeName?: string;
  categoryOrder?: CategoryType[];
  createdBy?: string;
  createdAt?: number;
  updatedAt?: number;
}

export function mapFirebaseStoreLayout(
  id: string,
  data: FirebaseStoreLayoutPayload,
  fallbackFamilyGroupId: string
): StoreLayout {
  return {
    id,
    familyGroupId: data.familyGroupId ?? fallbackFamilyGroupId,
    storeName: data.storeName ?? '',
    // categoryOrder from Firebase arrives as a native JS array (RTDB reconstructs it)
    categoryOrder: data.categoryOrder ?? [],
    createdBy: data.createdBy ?? '',
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? Date.now(),
    syncStatus: 'synced',
  };
}
