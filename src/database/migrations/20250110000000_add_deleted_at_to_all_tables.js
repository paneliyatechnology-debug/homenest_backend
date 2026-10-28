/**
 * Migration: Add deleted_at column for soft delete support across all modules.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const up = async (knex) => {
  const tables = ['users', 'pgs', 'rooms', 'resident_pg_stays', 'agreements'];

  for (const tableName of tables) {
    const hasColumn = await knex.schema.hasColumn(tableName, 'deleted_at');
    if (!hasColumn) {
      await knex.schema.alterTable(tableName, (table) => {
        table.timestamp('deleted_at').nullable().defaultTo(null).index();
      });
    }
  }
};

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const down = async (knex) => {
  const tables = ['agreements', 'resident_pg_stays', 'rooms', 'pgs', 'users'];

  for (const tableName of tables) {
    const hasColumn = await knex.schema.hasColumn(tableName, 'deleted_at');
    if (hasColumn) {
      await knex.schema.alterTable(tableName, (table) => {
        table.dropColumn('deleted_at');
      });
    }
  }
};

