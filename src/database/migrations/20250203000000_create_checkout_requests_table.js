/**
 * Migration: Create checkout_requests table
 * Supports Resident departure requests, review & NOC calculations,
 * checklist clearance, and Admin Checkout and Refund Approvals workflow.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  const hasTable = await knex.schema.hasTable('checkout_requests');
  if (!hasTable) {
    await knex.schema.createTable('checkout_requests', (table) => {
      table.increments('id').primary();

      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('branch_id').unsigned().notNullable()
        .references('id').inTable('branches')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('resident_id').unsigned().notNullable()
        .references('id').inTable('users')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('stay_id').unsigned().notNullable()
        .references('id').inTable('resident_pg_stays')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('room_id').unsigned().notNullable()
        .references('id').inTable('rooms')
        .onDelete('RESTRICT')
        .onUpdate('CASCADE');

      table.date('departure_date').notNullable();
      table.string('reason', 255).notNullable();
      table.text('additional_notes').nullable();

      // Financial snapshots at request/review time
      table.decimal('dues_amount', 10, 2).notNullable().defaultTo(0.00);
      table.text('dues_breakdown').nullable(); // JSON string of itemized dues
      table.decimal('deposit_amount', 10, 2).notNullable().defaultTo(0.00);
      table.decimal('estimated_refund', 10, 2).notNullable().defaultTo(0.00);
      table.decimal('refund_amount', 10, 2).nullable(); // Final approved refund

      // Status & Clearance Checklist
      table.enum('status', ['pending', 'under_review', 'in_progress', 'approved', 'rejected', 'completed'])
        .notNullable()
        .defaultTo('pending');

      table.boolean('clearance_room_inspected').notNullable().defaultTo(false);
      table.boolean('clearance_key_returned').notNullable().defaultTo(false);
      table.boolean('clearance_dues_cleared').notNullable().defaultTo(false);
      table.boolean('noc_issued').notNullable().defaultTo(false);
      table.boolean('refund_processed').notNullable().defaultTo(false);

      // Review audit details
      table.integer('reviewed_by').unsigned().nullable()
        .references('id').inTable('users')
        .onDelete('SET NULL');

      table.text('admin_notes').nullable();
      table.timestamp('reviewed_at').nullable();
      table.timestamp('completed_at').nullable();

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();

      // Indexes for performance
      table.index('pg_id', 'idx_checkout_requests_pg_id');
      table.index('branch_id', 'idx_checkout_requests_branch_id');
      table.index('resident_id', 'idx_checkout_requests_resident_id');
      table.index('stay_id', 'idx_checkout_requests_stay_id');
      table.index('status', 'idx_checkout_requests_status');
      table.index('deleted_at', 'idx_checkout_requests_deleted_at');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('checkout_requests');
};

