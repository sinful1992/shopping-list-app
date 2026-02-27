import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * WatermelonDB Schema
 * Defines database structure for offline-first storage
 * Implements Requirements: 4.4, 9.2, 9.3, 9.5
 */
export const schema = appSchema({
  version: 13,
  tables: [
    // Shopping Lists Table
    tableSchema({
      name: 'shopping_lists',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'family_group_id', type: 'string', isIndexed: true },
        { name: 'created_by', type: 'string', isIndexed: true },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'completed_at', type: 'number', isOptional: true, isIndexed: true },
        { name: 'completed_by', type: 'string', isOptional: true },
        { name: 'receipt_url', type: 'string', isOptional: true },
        { name: 'receipt_data', type: 'string', isOptional: true }, // JSON stringified
        { name: 'sync_status', type: 'string' },
        { name: 'is_locked', type: 'boolean' },
        { name: 'locked_by', type: 'string', isOptional: true },
        { name: 'locked_by_name', type: 'string', isOptional: true },
        { name: 'locked_by_role', type: 'string', isOptional: true },
        { name: 'locked_at', type: 'number', isOptional: true },
        { name: 'budget', type: 'number', isOptional: true },
        { name: 'store_name', type: 'string', isOptional: true, isIndexed: true }, // Sprint 6: Store tracking
        { name: 'archived', type: 'boolean', isOptional: true, isIndexed: true }, // Sprint 7: Archive functionality
        { name: 'layout_applied', type: 'boolean', isOptional: true },
        { name: 'unchecked_items_count', type: 'number', isOptional: true },
      ],
    }),

    // Items Table
    tableSchema({
      name: 'items',
      columns: [
        { name: 'list_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'quantity', type: 'string', isOptional: true },
        { name: 'price', type: 'number', isOptional: true },
        { name: 'checked', type: 'boolean' },
        { name: 'created_by', type: 'string' },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'sync_status', type: 'string' },
        { name: 'category', type: 'string', isOptional: true, isIndexed: true }, // Sprint 6: Category organization
        { name: 'sort_order', type: 'number', isOptional: true, isIndexed: true }, // Sprint 6: Drag-and-drop reordering
        { name: 'unit_qty', type: 'number', isOptional: true },
      ],
    }),

    // Sync Queue Table
    tableSchema({
      name: 'sync_queue',
      columns: [
        { name: 'entity_type', type: 'string' },
        { name: 'entity_id', type: 'string' },
        { name: 'operation', type: 'string' },
        { name: 'data', type: 'string' }, // JSON stringified
        { name: 'timestamp', type: 'number', isIndexed: true },
        { name: 'retry_count', type: 'number' },
        { name: 'next_retry_at', type: 'number', isOptional: true, isIndexed: true },
      ],
    }),

    // Urgent Items Table
    tableSchema({
      name: 'urgent_items',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'family_group_id', type: 'string', isIndexed: true },
        { name: 'created_by', type: 'string', isIndexed: true },
        { name: 'created_by_name', type: 'string' },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'resolved_by', type: 'string', isOptional: true },
        { name: 'resolved_by_name', type: 'string', isOptional: true },
        { name: 'resolved_at', type: 'number', isOptional: true, isIndexed: true },
        { name: 'price', type: 'number', isOptional: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'sync_status', type: 'string' },
      ],
    }),

    // Category History Table
    tableSchema({
      name: 'category_history',
      columns: [
        { name: 'family_group_id', type: 'string', isIndexed: true },
        { name: 'item_name_normalized', type: 'string', isIndexed: true },
        { name: 'category', type: 'string', isIndexed: true },
        { name: 'usage_count', type: 'number' },
        { name: 'last_used_at', type: 'number', isIndexed: true },
        { name: 'created_at', type: 'number', isIndexed: true },
      ],
    }),

    // Store Layouts Table
    tableSchema({
      name: 'store_layouts',
      columns: [
        { name: 'family_group_id', type: 'string', isIndexed: true },
        { name: 'store_name', type: 'string', isIndexed: true },
        { name: 'category_order', type: 'string' },
        { name: 'created_by', type: 'string' },
        { name: 'created_at', type: 'number', isIndexed: true },
        { name: 'updated_at', type: 'number' },
        { name: 'sync_status', type: 'string' },
      ],
    }),

    // Price History Table
    tableSchema({
      name: 'price_history',
      columns: [
        { name: 'item_name',            type: 'string' },
        { name: 'item_name_normalized', type: 'string', isIndexed: true },
        { name: 'price',                type: 'number' },
        { name: 'store_name',           type: 'string', isOptional: true },
        { name: 'list_id',              type: 'string', isOptional: true, isIndexed: true },
        { name: 'recorded_at',          type: 'number', isIndexed: true },
        { name: 'family_group_id',      type: 'string', isIndexed: true },
      ],
    }),
  ],
});
