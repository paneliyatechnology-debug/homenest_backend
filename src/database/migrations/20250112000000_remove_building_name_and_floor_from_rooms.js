/**
 * Migration: Remove 'building_name' and 'floor' columns from 'rooms' table
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  const hasBuildingName = await knex.schema.hasColumn('rooms', 'building_name');
  const hasFloor = await knex.schema.hasColumn('rooms', 'floor');

  if (hasBuildingName || hasFloor) {
    await knex.schema.alterTable('rooms', (table) => {
      if (hasBuildingName) {
        try {
          table.dropIndex([], 'idx_rooms_building_name');
        } catch (e) {
          // Ignore if index already dropped
        }
        table.dropColumn('building_name');
      }
      if (hasFloor) {
        try {
          table.dropIndex([], 'idx_rooms_floor');
        } catch (e) {
          // Ignore if index already dropped
        }
        table.dropColumn('floor');
      }
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.alterTable('rooms', (table) => {
    table.string('building_name', 100).nullable().defaultTo('Main Building');
    table.integer('floor').nullable().defaultTo(1);
    table.index('building_name', 'idx_rooms_building_name');
    table.index('floor', 'idx_rooms_floor');
  });
};

