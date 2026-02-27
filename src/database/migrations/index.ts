import { schemaMigrations, addColumns, createTable } from '@nozbe/watermelondb/Schema/migrations';

/**
 * Database Migrations
 * Handles schema changes between versions
 */
export default schemaMigrations({
  migrations: [
    // Migration from version 6 to 7: Add category field to items
    {
      toVersion: 7,
      steps: [
        addColumns({
          table: 'items',
          columns: [
            { name: 'category', type: 'string', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },
    // Migration from version 7 to 8: Add store name, archive, and sort order
    {
      toVersion: 8,
      steps: [
        addColumns({
          table: 'shopping_lists',
          columns: [
            { name: 'store_name', type: 'string', isOptional: true, isIndexed: true },
            { name: 'archived', type: 'boolean', isOptional: true, isIndexed: true },
          ],
        }),
        addColumns({
          table: 'items',
          columns: [
            { name: 'sort_order', type: 'number', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },
    // Migration from version 8 to 9: Add category history tracking
    {
      toVersion: 9,
      steps: [
        createTable({
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
      ],
    },
    // Migration from version 9 to 10: Add unit quantity to items
    {
      toVersion: 10,
      steps: [
        addColumns({
          table: 'items',
          columns: [
            { name: 'unit_qty', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    // Migration from version 11 to 12: Add store_layouts table and layout_applied on lists
    {
      toVersion: 12,
      steps: [
        createTable({
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
        addColumns({
          table: 'shopping_lists',
          columns: [{ name: 'layout_applied', type: 'boolean', isOptional: true }],
        }),
      ],
    },
    // Migration from version 12 to 13: Add unchecked_items_count to shopping_lists
    {
      toVersion: 13,
      steps: [
        addColumns({
          table: 'shopping_lists',
          columns: [{ name: 'unchecked_items_count', type: 'number', isOptional: true }],
        }),
      ],
    },
    // Migration from version 10 to 11: Add price history table
    {
      toVersion: 11,
      steps: [
        createTable({
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
    },
  ],
});
