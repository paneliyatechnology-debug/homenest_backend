/**
 * Migration: Create room_shift_requests table
 * Supports Resident room change requests and Admin review/approval workflow.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  const hasTable = await knex.schema.hasTable('room_shift_requests');
  if (!hasTable) {
    await knex.schema.createTable('room_shift_requests', (table) => {
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

      table.integer('stay_id').unsigned().nullable()
        .references('id').inTable('resident_pg_stays')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.integer('current_room_id').unsigned().notNullable()
        .references('id').inTable('rooms')
        .onDelete('RESTRICT')
        .onUpdate('CASCADE');

      table.integer('requested_room_id').unsigned().nullable()
        .references('id').inTable('rooms')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.string('preferred_room_type', 50).nullable();
      table.string('reason', 150).notNullable();
      table.text('additional_notes').nullable();
      table.date('expected_move_date').nullable();

      table.enum('status', ['pending', 'approved', 'rejected'])
        .notNullable()
        .defaultTo('pending');

      table.integer('reviewed_by').unsigned().nullable()
        .references('id').inTable('users')
        .onDelete('SET NULL');

      table.text('admin_notes').nullable();
      table.timestamp('reviewed_at').nullable();

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();

      // Indexes for high-performance lookup
      table.index('pg_id', 'idx_room_shifts_pg_id');
      table.index('branch_id', 'idx_room_shifts_branch_id');
      table.index('resident_id', 'idx_room_shifts_resident_id');
      table.index('status', 'idx_room_shifts_status');
      table.index('deleted_at', 'idx_room_shifts_deleted_at');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('room_shift_requests');
};

