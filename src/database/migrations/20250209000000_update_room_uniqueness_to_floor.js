/**
 * Migration: Drop uq_rooms_branch_room_no to allow duplicate room numbers across different floors,
 * and add index on (floor_id, room_no) for fast per-floor lookup.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  const hasTable = await knex.schema.hasTable('rooms');
  if (!hasTable) return;

  try {
    await knex.raw('ALTER TABLE rooms DROP INDEX uq_rooms_branch_room_no');
  } catch (err) {
    console.warn('[Migration] Note: uq_rooms_branch_room_no index might not exist or already dropped:', err.message);
  }

  try {
    await knex.schema.alterTable('rooms', (table) => {
      table.index(['floor_id', 'room_no'], 'idx_rooms_floor_room_no');
    });
  } catch (err) {
    console.warn('[Migration] Note: idx_rooms_floor_room_no index might already exist:', err.message);
  }
};

export const down = async (knex) => {
  const hasTable = await knex.schema.hasTable('rooms');
  if (!hasTable) return;

  try {
    await knex.schema.alterTable('rooms', (table) => {
      table.dropIndex(['floor_id', 'room_no'], 'idx_rooms_floor_room_no');
    });
  } catch {}

  try {
    await knex.schema.alterTable('rooms', (table) => {
      table.unique(['branch_id', 'room_no'], 'uq_rooms_branch_room_no');
    });
  } catch {}
};
