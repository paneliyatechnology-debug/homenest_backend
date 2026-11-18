/**
 * Migration: Add agreement_file column to users table.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const up = async (knex) => {
  const hasCol = await knex.schema.hasColumn('users', 'agreement_file');
  if (!hasCol) {
    await knex.schema.alterTable('users', (table) => {
      table.string('agreement_file', 255).nullable().after('education_certificate');
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const down = async (knex) => {
  const hasCol = await knex.schema.hasColumn('users', 'agreement_file');
  if (hasCol) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('agreement_file');
    });
  }
};
