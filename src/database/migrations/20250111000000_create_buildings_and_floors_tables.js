/**
 * Migration: Create 'buildings' and 'floors' tables and link to 'rooms'
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  // 1. Create buildings table
  const hasBuildings = await knex.schema.hasTable('buildings');
  if (!hasBuildings) {
    await knex.schema.createTable('buildings', (table) => {
      table.increments('id').primary();
      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.string('name', 100).notNullable();
      table.text('description').nullable();
      table.enum('status', ['active', 'inactive']).notNullable().defaultTo('active');

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();

      table.index('pg_id', 'idx_buildings_pg_id');
      table.index('deleted_at', 'idx_buildings_deleted_at');
      table.unique(['pg_id', 'name'], 'uq_buildings_pg_name');
    });
  }

  // 2. Create floors table
  const hasFloors = await knex.schema.hasTable('floors');
  if (!hasFloors) {
    await knex.schema.createTable('floors', (table) => {
      table.increments('id').primary();
      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('building_id').unsigned().notNullable()
        .references('id').inTable('buildings')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('floor_number').notNullable().defaultTo(1);
      table.string('name', 100).nullable(); // e.g. "Ground Floor", "1st Floor"
      table.enum('status', ['active', 'inactive']).notNullable().defaultTo('active');

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();

      table.index('pg_id', 'idx_floors_pg_id');
      table.index('building_id', 'idx_floors_building_id');
      table.index('deleted_at', 'idx_floors_deleted_at');
      table.unique(['building_id', 'floor_number'], 'uq_floors_building_floor_number');
    });
  }

  // 3. Add building_id and floor_id to rooms table
  const hasBuildingIdCol = await knex.schema.hasColumn('rooms', 'building_id');
  if (!hasBuildingIdCol) {
    await knex.schema.alterTable('rooms', (table) => {
      table.integer('building_id').unsigned().nullable()
        .references('id').inTable('buildings')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.integer('floor_id').unsigned().nullable()
        .references('id').inTable('floors')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.index('building_id', 'idx_rooms_building_id');
      table.index('floor_id', 'idx_rooms_floor_id');
    });
  }

  // 4. Backfill existing rooms data into buildings and floors
  const existingRooms = await knex('rooms').select('id', 'pg_id', 'building_name', 'floor');
  for (const r of existingRooms) {
    const bName = (r.building_name || 'Main Building').trim();
    const fNum = Number(r.floor) || 1;

    // Check or insert building
    let building = await knex('buildings').where({ pg_id: r.pg_id, name: bName }).first();
    if (!building) {
      const [newBId] = await knex('buildings').insert({
        pg_id: r.pg_id,
        name: bName,
        status: 'active',
      });
      building = { id: newBId };
    }

    // Check or insert floor
    let floor = await knex('floors').where({ building_id: building.id, floor_number: fNum }).first();
    if (!floor) {
      const floorName = fNum === 0 ? 'Ground Floor' : `Floor ${fNum}`;
      const [newFId] = await knex('floors').insert({
        pg_id: r.pg_id,
        building_id: building.id,
        floor_number: fNum,
        name: floorName,
        status: 'active',
      });
      floor = { id: newFId };
    }

    // Update room
    await knex('rooms').where({ id: r.id }).update({
      building_id: building.id,
      floor_id: floor.id,
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  const hasBuildingId = await knex.schema.hasColumn('rooms', 'building_id');
  if (hasBuildingId) {
    await knex.schema.alterTable('rooms', (table) => {
      table.dropForeign(['building_id']);
      table.dropForeign(['floor_id']);
      table.dropColumn('building_id');
      table.dropColumn('floor_id');
    });
  }

  await knex.schema.dropTableIfExists('floors');
  await knex.schema.dropTableIfExists('buildings');
};

