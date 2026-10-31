/**
 * Migration: Remove room_no and room_type columns from visitors table.
 *
 * Resident room details (room_no, room_type) are dynamically resolved
 * from the resident's active stay / rooms table, eliminating redundancy.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const up = async (knex) => {
  const hasVisitors = await knex.schema.hasTable('visitors');
  if (hasVisitors) {
    await knex.schema.alterTable('visitors', (table) => {
      table.dropColumns('room_no', 'room_type');
    });
  }
};

/**
 * Rollback migration: re-add room_no and room_type columns.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const down = async (knex) => {
  const hasVisitors = await knex.schema.hasTable('visitors');
  if (hasVisitors) {
    await knex.schema.alterTable('visitors', (table) => {
      table.string('room_no', 50).nullable().after('room_id');
      table.string('room_type', 50).nullable().after('room_no');
    });
  }
};

