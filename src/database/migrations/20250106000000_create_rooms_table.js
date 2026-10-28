/**
 * Migration: Create 'rooms' table for Room Inventory, Allocation, and Floor Plan management
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  const roomsExists = await knex.schema.hasTable('rooms');
  if (!roomsExists) {
    await knex.schema.createTable('rooms', (table) => {
      table.increments('id').primary();
      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.string('room_no', 50).notNullable();
      table.string('room_type', 50).notNullable(); // e.g. single, double, triple, four_sharing
      table.string('building_name', 100).notNullable().defaultTo('Main Building');
      table.integer('floor').notNullable().defaultTo(1);
      table.integer('capacity').notNullable().defaultTo(1);
      table.string('size', 50).nullable(); // e.g. "12 m*2"
      table.string('image_url', 255).nullable();

      table.boolean('maintenance').notNullable().defaultTo(false);
      table.enum('status', ['occupied', 'vacant', 'maintenance', 'out_of_service'])
        .notNullable()
        .defaultTo('vacant');
      table.string('current_occupant_name', 150).nullable();

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      // Unique room number within the same PG branch
      table.unique(['pg_id', 'room_no'], 'uq_rooms_pg_room_no');

      // Indexes for fast lookup & filtering
      table.index('pg_id', 'idx_rooms_pg_id');
      table.index('status', 'idx_rooms_status');
      table.index('building_name', 'idx_rooms_building_name');
      table.index('floor', 'idx_rooms_floor');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('rooms');
};

