/**
 * Migration: Create 'branches' table and add 'branch_id' to all domain tables
 * Enables:
 * 1. Admin/PG having multiple branches.
 * 2. Scoping and filtering buildings, rooms, resident stays, payments, agreements, and visitors by branch.
 * 3. Seamlessly backfills existing data so no historical records are broken.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  // 1. Create 'branches' table
  const hasBranches = await knex.schema.hasTable('branches');
  if (!hasBranches) {
    await knex.schema.createTable('branches', (table) => {
      table.increments('id').primary();
      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.string('name', 150).notNullable();
      table.string('location', 255).notNullable();
      table.string('branch_photo', 255).nullable();

      table.integer('total_rooms').notNullable().defaultTo(0);
      table.integer('occupied_rooms').notNullable().defaultTo(0);
      table.integer('available_rooms').notNullable().defaultTo(0);

      table.enum('status', ['active', 'under_maintenance', 'upcoming'])
        .notNullable()
        .defaultTo('active');

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();

      // Indexes
      table.index('pg_id', 'idx_branches_pg_id');
      table.index('status', 'idx_branches_status');
      table.index('deleted_at', 'idx_branches_deleted_at');
    });
  }

  // Helper to add branch_id column to an existing table if not present
  const addBranchIdIfMissing = async (tableName) => {
    const hasCol = await knex.schema.hasColumn(tableName, 'branch_id');
    if (!hasCol) {
      await knex.schema.alterTable(tableName, (table) => {
        table.integer('branch_id').unsigned().nullable()
          .references('id').inTable('branches')
          .onDelete('SET NULL')
          .onUpdate('CASCADE');
        table.index('branch_id', `idx_${tableName}_branch_id`);
      });
    }
  };

  // 2. Add branch_id to domain tables
  const domainTables = [
    'buildings',
    'rooms',
    'resident_pg_stays',
    'payments',
    'agreements',
    'visitors',
  ];

  for (const tableName of domainTables) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (tableExists) {
      await addBranchIdIfMissing(tableName);
    }
  }

  // 3. Backfill initial default branch for any existing PGs
  const existingPgs = await knex('pgs').whereNull('deleted_at').select('id', 'name', 'city', 'address', 'total_rooms');
  for (const pg of existingPgs) {
    // Check if PG already has a branch
    let branch = await knex('branches').where({ pg_id: pg.id }).whereNull('deleted_at').first();
    if (!branch) {
      const [newBranchId] = await knex('branches').insert({
        pg_id: pg.id,
        name: 'Main Branch',
        location: pg.city || pg.address || 'Ahmedabad',
        total_rooms: Number(pg.total_rooms) || 0,
        occupied_rooms: 0,
        available_rooms: Number(pg.total_rooms) || 0,
        status: 'active',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
      branch = { id: newBranchId };
    }

    // Backfill branch_id across existing records belonging to this pg_id
    for (const tableName of domainTables) {
      const tableExists = await knex.schema.hasTable(tableName);
      if (tableExists) {
        await knex(tableName)
          .where({ pg_id: pg.id })
          .whereNull('branch_id')
          .update({ branch_id: branch.id });
      }
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  const domainTables = [
    'visitors',
    'agreements',
    'payments',
    'resident_pg_stays',
    'rooms',
    'buildings',
  ];

  for (const tableName of domainTables) {
    const hasCol = await knex.schema.hasColumn(tableName, 'branch_id');
    if (hasCol) {
      await knex.schema.alterTable(tableName, (table) => {
        table.dropForeign('branch_id');
        table.dropIndex('branch_id', `idx_${tableName}_branch_id`);
        table.dropColumn('branch_id');
      });
    }
  }

  await knex.schema.dropTableIfExists('branches');
};

