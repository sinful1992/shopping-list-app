import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * WatermelonDB Schema
 * Defines database structure for offline-first storage
 * Implements Requirements: 4.4, 9.2, 9.3, 9.5
 */
export const schema = appSchema({
  version: 5,
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
  ],
});
