/**
 * Migration: Create agreements table for resident agreement records.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const up = async (knex) => {
  const exists = await knex.schema.hasTable('agreements');
  if (!exists) {
    await knex.schema.createTable('agreements', (table) => {
      table.increments('id').primary();
      table.string('agreement_no', 100).notNullable().unique();
      table.integer('resident_id').unsigned().notNullable()
        .references('id').inTable('users').onDelete('CASCADE');
      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs').onDelete('CASCADE');
      table.integer('room_id').unsigned().nullable()
        .references('id').inTable('rooms').onDelete('SET NULL');
      table.string('room_type', 50).nullable();
      table.string('agreement_type', 50).notNullable().defaultTo('rental');
      table.date('start_date').notNullable();
      table.date('end_date').nullable();
      table.enum('status', ['signed', 'pending', 'draft', 'expired']).defaultTo('draft').notNullable();
      table.timestamps(true, true);

      table.index(['resident_id', 'status']);
      table.index(['pg_id', 'status']);
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('agreements');
};

