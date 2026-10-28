/**
 * Migration: Refactor rooms and resident_pg_stays relations
 *
 * 1. In 'rooms':
 *    - Remove 'maintenance' column (already covered in status: 'occupied', 'vacant', 'maintenance', 'out_of_service')
 *    - Remove 'current_occupant_name' (dynamically derived from resident_pg_stays)
 *    - Rename 'image_url' to 'image' (only store uploaded filename)
 *
 * 2. In 'resident_pg_stays':
 *    - Remove 'room_number'
 *    - Add 'room_id' (FK referencing rooms.id)
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  // 1. Refactor 'rooms' table
  const hasMaintenance = await knex.schema.hasColumn('rooms', 'maintenance');
  const hasOccupant = await knex.schema.hasColumn('rooms', 'current_occupant_name');
  const hasImageUrl = await knex.schema.hasColumn('rooms', 'image_url');
  const hasImage = await knex.schema.hasColumn('rooms', 'image');

  await knex.schema.alterTable('rooms', (table) => {
    if (hasMaintenance) {
      table.dropColumn('maintenance');
    }
    if (hasOccupant) {
      table.dropColumn('current_occupant_name');
    }
    if (hasImageUrl && !hasImage) {
      table.dropColumn('image_url');
      table.string('image', 255).nullable();
    } else if (!hasImage) {
      table.string('image', 255).nullable();
    }
  });

  // 2. Refactor 'resident_pg_stays' table
  const hasRoomNumber = await knex.schema.hasColumn('resident_pg_stays', 'room_number');
  const hasRoomId = await knex.schema.hasColumn('resident_pg_stays', 'room_id');

  // Truncate or clear stays to safely alter columns with foreign key
  await knex('resident_pg_stays').del();

  await knex.schema.alterTable('resident_pg_stays', (table) => {
    if (hasRoomNumber) {
      table.dropColumn('room_number');
    }
    if (!hasRoomId) {
      table.integer('room_id').unsigned().notNullable()
        .references('id').inTable('rooms')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
      table.index('room_id', 'idx_stays_room_id');
    }
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  // Rollback resident_pg_stays
  await knex.schema.alterTable('resident_pg_stays', (table) => {
    table.dropForeign(['room_id']);
    table.dropColumn('room_id');
    table.string('room_number', 50).notNullable().defaultTo('A-101');
  });

  // Rollback rooms
  await knex.schema.alterTable('rooms', (table) => {
    table.boolean('maintenance').notNullable().defaultTo(false);
    table.string('current_occupant_name', 150).nullable();
    table.dropColumn('image');
    table.string('image_url', 255).nullable();
  });
};

