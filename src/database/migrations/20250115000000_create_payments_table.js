/**
 * Migration: Create payments table for billing, transactions, dues, and receipts.
 * Supports Admin Overview, History & Receipts, and Resident Mobile checkout & breakdown.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const up = async (knex) => {
  const exists = await knex.schema.hasTable('payments');
  if (!exists) {
    await knex.schema.createTable('payments', (table) => {
      table.increments('id').primary();
      table.string('transaction_id', 100).nullable().unique().index();
      table.string('receipt_no', 100).nullable().unique().index();
      table.integer('resident_id').unsigned().notNullable()
        .references('id').inTable('users').onDelete('CASCADE');
      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs').onDelete('CASCADE');
      table.integer('stay_id').unsigned().nullable()
        .references('id').inTable('resident_pg_stays').onDelete('SET NULL');
      table.integer('room_id').unsigned().nullable()
        .references('id').inTable('rooms').onDelete('SET NULL');
      table.string('title', 255).notNullable().defaultTo('Monthly Rent');
      table.enum('payment_type', ['rent', 'maintenance', 'security_deposit', 'electricity', 'other'])
        .notNullable().defaultTo('rent');
      table.date('billing_period_start').nullable();
      table.date('billing_period_end').nullable();
      table.date('due_date').nullable().index();
      table.decimal('rent_amount', 10, 2).notNullable().defaultTo(0.00);
      table.decimal('deposit_amount', 10, 2).notNullable().defaultTo(0.00);
      table.decimal('maintenance_amount', 10, 2).notNullable().defaultTo(0.00);
      table.decimal('electricity_amount', 10, 2).notNullable().defaultTo(0.00);
      table.decimal('other_amount', 10, 2).notNullable().defaultTo(0.00);
      table.decimal('amount', 10, 2).notNullable();
      table.decimal('paid_amount', 10, 2).notNullable().defaultTo(0.00);
      table.enum('payment_method', ['upi', 'card', 'net_banking', 'wallet', 'bank_transfer', 'cash']).nullable();
      table.string('payment_method_details', 100).nullable();
      table.string('upi_id', 100).nullable();
      table.string('upi_ref_no', 100).nullable();
      table.enum('status', ['paid', 'pending', 'overdue', 'refunded', 'failed'])
        .notNullable().defaultTo('pending').index();
      table.timestamp('paid_at').nullable().index();
      table.decimal('refund_amount', 10, 2).notNullable().defaultTo(0.00);
      table.text('refund_reason').nullable();
      table.timestamp('refunded_at').nullable();
      table.text('notes').nullable();
      table.timestamps(true, true);
      table.timestamp('deleted_at').nullable().defaultTo(null).index();

      table.index(['resident_id', 'status']);
      table.index(['pg_id', 'status']);
      table.index(['payment_type', 'status']);
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('payments');
};

