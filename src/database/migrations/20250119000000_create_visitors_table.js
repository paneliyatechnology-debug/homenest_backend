/**
 * Migration: Create visitors table for tracking guest access, passes, gate entry/exit, and approvals.
 * Supports Admin gate operations and Resident mobile visitor requests.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const up = async (knex) => {
  const exists = await knex.schema.hasTable('visitors');
  if (!exists) {
    await knex.schema.createTable('visitors', (table) => {
      table.increments('id').primary();
      table.string('pass_code', 50).nullable().unique().index();
      table.string('visitor_name', 150).notNullable();
      table.string('visitor_phone', 20).notNullable();
      table.string('visitor_photo', 255).nullable();
      table.integer('resident_id').unsigned().notNullable()
        .references('id').inTable('users').onDelete('CASCADE');
      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs').onDelete('CASCADE');
      table.integer('room_id').unsigned().nullable()
        .references('id').inTable('rooms').onDelete('SET NULL');
      table.string('room_no', 50).nullable();
      table.string('room_type', 50).nullable();
      table.string('purpose', 100).notNullable().defaultTo('Meeting');
      table.date('visit_date').notNullable().index();
      table.string('entry_time', 20).nullable();
      table.string('exit_time', 20).nullable();
      table.enum('status', ['pending', 'approved', 'rejected', 'in_office', 'left'])
        .notNullable().defaultTo('pending').index();
      table.text('qr_code').nullable();
      table.text('admin_notes').nullable();
      table.integer('created_by').unsigned().nullable()
        .references('id').inTable('users').onDelete('SET NULL');
      table.timestamps(true, true);
      table.timestamp('deleted_at').nullable().defaultTo(null).index();

      table.index(['pg_id', 'status']);
      table.index(['resident_id', 'status']);
      table.index(['pg_id', 'visit_date']);
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('visitors');
};

