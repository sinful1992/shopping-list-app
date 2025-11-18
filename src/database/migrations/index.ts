import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations';

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
  ],
});
