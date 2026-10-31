/**
 * Migration: Add deposit_amount column to payments table
 * Allows tracking refundable security deposit in itemized billing breakdown.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const up = async (knex) => {
  const hasCol = await knex.schema.hasColumn('payments', 'deposit_amount');
  if (!hasCol) {
    await knex.schema.alterTable('payments', (table) => {
      table.decimal('deposit_amount', 10, 2).notNullable().defaultTo(0.00).after('maintenance_amount');
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const down = async (knex) => {
  const hasCol = await knex.schema.hasColumn('payments', 'deposit_amount');
  if (hasCol) {
    await knex.schema.alterTable('payments', (table) => {
      table.dropColumn('deposit_amount');
    });
  }
};

