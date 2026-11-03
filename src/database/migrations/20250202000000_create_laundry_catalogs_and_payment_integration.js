/**
 * Migration: Create laundry_catalogs table and integrate laundry with payments.
 * 1. Alter payments table payment_type enum to include 'laundry'.
 * 2. Create laundry_catalogs table for branch-wise and PG-wide custom pricing and slots.
 * 3. Add is_billed and payment_id columns to laundry_requests table.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const up = async (knex) => {
  // 1. Alter payment_type enum in payments table
  await knex.raw(
    "ALTER TABLE `payments` MODIFY COLUMN `payment_type` ENUM('rent','maintenance','security_deposit','electricity','other','laundry') NOT NULL DEFAULT 'rent'"
  );

  // 2. Create laundry_catalogs table
  const hasCatalogs = await knex.schema.hasTable('laundry_catalogs');
  if (!hasCatalogs) {
    await knex.schema.createTable('laundry_catalogs', (table) => {
      table.increments('id').primary();
      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs').onDelete('CASCADE');
      table.integer('branch_id').unsigned().nullable()
        .references('id').inTable('branches').onDelete('CASCADE');
      table.json('items').notNullable(); // [{ name: 'Shirt', rate: 25 }, { name: 'T-Shirt', rate: 20 }, ...]
      table.string('pickup_time_slot', 100).notNullable().defaultTo('09:00 AM - 11:00 AM (Mon - Sat)');
      table.json('service_types').nullable(); // ['Wash & Fold', 'Dry Cleaning']
      table.json('important_notes').nullable();
      table.timestamps(true, true);
      table.timestamp('deleted_at').nullable();

      table.index(['pg_id', 'branch_id']);
      table.index('deleted_at');
    });
  }

  // 3. Add is_billed and payment_id to laundry_requests table if not present
  const hasIsBilled = await knex.schema.hasColumn('laundry_requests', 'is_billed');
  if (!hasIsBilled) {
    await knex.schema.alterTable('laundry_requests', (table) => {
      table.boolean('is_billed').notNullable().defaultTo(false);
      table.integer('payment_id').unsigned().nullable()
        .references('id').inTable('payments').onDelete('SET NULL');
      table.index(['resident_id', 'is_billed']);
      table.index(['payment_id']);
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const down = async (knex) => {
  const hasIsBilled = await knex.schema.hasColumn('laundry_requests', 'is_billed');
  if (hasIsBilled) {
    await knex.schema.alterTable('laundry_requests', (table) => {
      table.dropForeign('payment_id');
      table.dropColumn('payment_id');
      table.dropColumn('is_billed');
    });
  }

  await knex.schema.dropTableIfExists('laundry_catalogs');

  await knex.raw(
    "ALTER TABLE `payments` MODIFY COLUMN `payment_type` ENUM('rent','maintenance','security_deposit','electricity','other') NOT NULL DEFAULT 'rent'"
  );
};

