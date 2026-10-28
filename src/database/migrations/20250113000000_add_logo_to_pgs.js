/**
 * Migration: Add logo column to pgs table
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  const hasTable = await knex.schema.hasTable('pgs');
  if (hasTable) {
    const hasLogo = await knex.schema.hasColumn('pgs', 'logo');
    if (!hasLogo) {
      await knex.schema.table('pgs', (table) => {
        table.string('logo', 255).nullable().after('status');
      });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  const hasTable = await knex.schema.hasTable('pgs');
  if (hasTable) {
    const hasLogo = await knex.schema.hasColumn('pgs', 'logo');
    if (hasLogo) {
      await knex.schema.table('pgs', (table) => {
        table.dropColumn('logo');
      });
    }
  }
};

