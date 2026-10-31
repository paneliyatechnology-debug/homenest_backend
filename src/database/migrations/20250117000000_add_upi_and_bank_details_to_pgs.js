/**
 * Migration: Add PG UPI and Bank Details columns to pgs table
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  const hasTable = await knex.schema.hasTable('pgs');
  if (hasTable) {
    const hasUpi = await knex.schema.hasColumn('pgs', 'pg_upi_id');
    if (!hasUpi) {
      await knex.schema.table('pgs', (table) => {
        table.string('pg_upi_id', 100).nullable().after('logo');
        table.string('pg_bank_name', 100).nullable().after('pg_upi_id');
        table.string('pg_account_number', 50).nullable().after('pg_bank_name');
        table.string('pg_ifsc_code', 20).nullable().after('pg_account_number');
        table.string('pg_account_holder_name', 150).nullable().after('pg_ifsc_code');
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
    const hasUpi = await knex.schema.hasColumn('pgs', 'pg_upi_id');
    if (hasUpi) {
      await knex.schema.table('pgs', (table) => {
        table.dropColumns(
          'pg_upi_id',
          'pg_bank_name',
          'pg_account_number',
          'pg_ifsc_code',
          'pg_account_holder_name'
        );
      });
    }
  }
};
