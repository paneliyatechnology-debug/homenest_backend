/**
 * Migration: Remove 'description' and 'status' columns from 'buildings' and 'floors' tables
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  // 1. Alter buildings table
  const hasBuildings = await knex.schema.hasTable('buildings');
  if (hasBuildings) {
    const hasDesc = await knex.schema.hasColumn('buildings', 'description');
    const hasStatus = await knex.schema.hasColumn('buildings', 'status');

    await knex.schema.alterTable('buildings', (table) => {
      if (hasDesc) {
        table.dropColumn('description');
      }
      if (hasStatus) {
        table.dropColumn('status');
      }
    });
  }

  // 2. Alter floors table
  const hasFloors = await knex.schema.hasTable('floors');
  if (hasFloors) {
    const hasFloorDesc = await knex.schema.hasColumn('floors', 'description');
    const hasFloorStatus = await knex.schema.hasColumn('floors', 'status');

    await knex.schema.alterTable('floors', (table) => {
      if (hasFloorDesc) {
        table.dropColumn('description');
      }
      if (hasFloorStatus) {
        table.dropColumn('status');
      }
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  // 1. Restore buildings columns
  const hasBuildings = await knex.schema.hasTable('buildings');
  if (hasBuildings) {
    const hasDesc = await knex.schema.hasColumn('buildings', 'description');
    const hasStatus = await knex.schema.hasColumn('buildings', 'status');

    await knex.schema.alterTable('buildings', (table) => {
      if (!hasDesc) {
        table.text('description').nullable();
      }
      if (!hasStatus) {
        table.enum('status', ['active', 'inactive']).notNullable().defaultTo('active');
      }
    });
  }

  // 2. Restore floors columns
  const hasFloors = await knex.schema.hasTable('floors');
  if (hasFloors) {
    const hasFloorStatus = await knex.schema.hasColumn('floors', 'status');

    await knex.schema.alterTable('floors', (table) => {
      if (!hasFloorStatus) {
        table.enum('status', ['active', 'inactive']).notNullable().defaultTo('active');
      }
    });
  }
};

