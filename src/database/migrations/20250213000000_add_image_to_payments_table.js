/**
 * Migration: Add image column to payments table for payment proof / receipt screenshot uploads.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const up = async (knex) => {
  const hasCol = await knex.schema.hasColumn('payments', 'image');
  if (!hasCol) {
    await knex.schema.alterTable('payments', (table) => {
      table.string('image', 255).nullable().after('upi_ref_no');
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const down = async (knex) => {
  const hasCol = await knex.schema.hasColumn('payments', 'image');
  if (hasCol) {
    await knex.schema.alterTable('payments', (table) => {
      table.dropColumn('image');
    });
  }
};
