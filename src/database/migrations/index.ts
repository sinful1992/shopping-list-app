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
  ],
});
