import { ShoppingList, Item, ReceiptData, UrgentItem } from '../../models/types';
import { safeJsonParse } from '../../utils/safeJsonParse';
import { ShoppingListModel } from '../../database/models/ShoppingList';
import { ItemModel } from '../../database/models/Item';
import { UrgentItemModel } from '../../database/models/UrgentItem';

export function applyListCreate(record: ShoppingListModel, list: ShoppingList): void {
  record._raw.id = list.id;
  record.name = list.name;
  record.familyGroupId = list.familyGroupId;
  record.createdBy = list.createdBy;
  record.status = list.status;
  record.completedAt = list.completedAt;
  record.completedBy = list.completedBy;
  record.receiptUrl = list.receiptUrl;
  record.receiptData = list.receiptData ? JSON.stringify(list.receiptData) : null;
  record.syncStatus = list.syncStatus || 'pending';
  record.isLocked = list.isLocked;
  record.lockedBy = list.lockedBy;
  record.lockedByName = list.lockedByName;
  record.lockedByRole = list.lockedByRole;
  record.lockedAt = list.lockedAt;
  record.budget = list.budget;
  record.storeName = list.storeName || null;
  record.archived = list.archived || null;
  record.layoutApplied = list.layoutApplied ?? null;
  record.totalAmount = list.totalAmount ?? null;
  record.merchantName = list.merchantName ?? null;
  record.purchaseDate = list.purchaseDate ?? null;
  record.currency = list.currency ?? null;
}

export function applyListFullUpdate(record: ShoppingListModel, list: ShoppingList): void {
  record.name = list.name;
  record.status = list.status;
  record.completedAt = list.completedAt;
  record.completedBy = list.completedBy;
  record.receiptUrl = list.receiptUrl;
  record.receiptData = list.receiptData ? JSON.stringify(list.receiptData) : null;
  record.syncStatus = list.syncStatus || 'pending';
  record.isLocked = list.isLocked;
  record.lockedBy = list.lockedBy;
  record.lockedByName = list.lockedByName;
  record.lockedByRole = list.lockedByRole;
  record.lockedAt = list.lockedAt;
  record.budget = list.budget;
  record.storeName = list.storeName || null;
  record.archived = list.archived || null;
  record.layoutApplied = list.layoutApplied ?? null;
  record.totalAmount = list.totalAmount ?? null;
  record.merchantName = list.merchantName ?? null;
  record.purchaseDate = list.purchaseDate ?? null;
  record.currency = list.currency ?? null;
}

export function applyItemCreate(record: ItemModel, item: Item): void {
  record._raw.id = item.id;
  record.listId = item.listId;
  record.name = item.name;
  record.quantity = item.quantity;
  record.price = item.price;
  record.checked = item.checked;
  record.createdBy = item.createdBy;
  record.updatedAt = item.updatedAt;
  record.category = item.category || null;
  record.sortOrder = item.sortOrder ?? null;
  record.unitQty = item.unitQty ?? null;
  record.measurementUnit = item.measurementUnit ?? null;
  record.measurementValue = item.measurementValue ?? null;
}

export function applyItemFullUpdate(record: ItemModel, item: Item): void {
  record.name = item.name;
  record.quantity = item.quantity;
  record.price = item.price;
  record.checked = item.checked;
  record.updatedAt = item.updatedAt;
  record.category = item.category || null;
  record.sortOrder = item.sortOrder ?? null;
  record.unitQty = item.unitQty ?? null;
  record.measurementUnit = item.measurementUnit ?? null;
  record.measurementValue = item.measurementValue ?? null;
}

export function hasListChanged(local: ShoppingList, incoming: ShoppingList): boolean {
  return (
    local.name !== incoming.name ||
    local.status !== incoming.status ||
    local.isLocked !== incoming.isLocked ||
    local.lockedBy !== incoming.lockedBy ||
    local.completedAt !== incoming.completedAt ||
    local.completedBy !== incoming.completedBy ||
    local.budget !== incoming.budget ||
    local.storeName !== incoming.storeName ||
    local.archived !== incoming.archived ||
    local.receiptUrl !== incoming.receiptUrl ||
    (local.layoutApplied ?? false) !== (incoming.layoutApplied ?? false)
  );
}

export function listModelToType(model: ShoppingListModel): ShoppingList {
  return {
    id: model.id,
    name: model.name,
    familyGroupId: model.familyGroupId,
    createdBy: model.createdBy,
    createdAt: Number(model.createdAt),
    status: model.status as 'active' | 'completed' | 'deleted',
    completedAt: model.completedAt,
    completedBy: model.completedBy,
    receiptUrl: model.receiptUrl,
    receiptData: safeJsonParse<ReceiptData | null>(model.receiptData, null),
    syncStatus: model.syncStatus as 'synced' | 'pending' | 'failed',
    isLocked: model.isLocked,
    lockedBy: model.lockedBy,
    lockedByName: model.lockedByName,
    lockedByRole: model.lockedByRole as 'Dad' | 'Mom' | 'Son' | 'Daughter' | 'Older Son' | 'Older Daughter' | 'Younger Son' | 'Younger Daughter' | null,
    lockedAt: model.lockedAt,
    budget: model.budget,
    storeName: model.storeName,
    archived: model.archived,
    layoutApplied: model.layoutApplied,
    uncheckedItemsCount: model.uncheckedItemsCount,
    totalAmount: model.totalAmount,
    merchantName: model.merchantName,
    purchaseDate: model.purchaseDate,
    currency: model.currency,
  };
}

export function itemModelToType(model: ItemModel): Item {
  return {
    id: model.id,
    listId: model.listId,
    name: model.name,
    quantity: model.quantity,
    price: model.price,
    checked: model.checked,
    createdBy: model.createdBy,
    createdAt: Number(model.createdAt),
    updatedAt: model.updatedAt,
    syncStatus: model.syncStatus as 'synced' | 'pending' | 'failed',
    category: model.category,
    sortOrder: model.sortOrder,
    unitQty: model.unitQty,
    measurementUnit: model.measurementUnit,
    measurementValue: model.measurementValue,
  };
}

export function urgentItemModelToType(model: UrgentItemModel): UrgentItem {
  return {
    id: model.id,
    name: model.name,
    familyGroupId: model.familyGroupId,
    createdBy: model.createdBy,
    createdByName: model.createdByName,
    createdAt: Number(model.createdAt),
    resolvedBy: model.resolvedBy,
    resolvedByName: model.resolvedByName,
    resolvedAt: model.resolvedAt,
    price: model.price,
    status: model.status as 'active' | 'resolved',
    syncStatus: model.syncStatus as 'synced' | 'pending' | 'failed',
  };
}
