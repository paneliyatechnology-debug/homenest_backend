/**
 * Migration: Add branch composite indexes and performance tuning
 *
 * Optimizations:
 * 1. Scope building unique names to ['branch_id', 'name'] instead of entire PG.
 * 2. Scope room unique numbers to ['branch_id', 'room_no'] instead of entire PG.
 * 3. Add composite indexes for high-frequency queries across branches, buildings, rooms,
 *    resident stays, payments, agreements, and visitors.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  // Helper to check if an index exists on a table
  const hasIndex = async (tableName, indexName) => {
    try {
      const result = await knex.raw(`SHOW INDEX FROM \`${tableName}\` WHERE Key_name = ?`, [indexName]);
      return result[0] && result[0].length > 0;
    } catch {
      return false;
    }
  };

  // 1. Buildings Table: Transition unique constraint from (pg_id, name) to (branch_id, name) + composite indexes
  const hasBuildings = await knex.schema.hasTable('buildings');
  if (hasBuildings) {
    if (await hasIndex('buildings', 'uq_buildings_pg_name')) {
      await knex.schema.alterTable('buildings', (table) => {
        table.dropUnique(['pg_id', 'name'], 'uq_buildings_pg_name');
      });
    }

    if (!(await hasIndex('buildings', 'uq_buildings_branch_name'))) {
      await knex.schema.alterTable('buildings', (table) => {
        table.unique(['branch_id', 'name'], 'uq_buildings_branch_name');
      });
    }

    if (!(await hasIndex('buildings', 'idx_buildings_branch_deleted'))) {
      await knex.schema.alterTable('buildings', (table) => {
        table.index(['branch_id', 'deleted_at'], 'idx_buildings_branch_deleted');
      });
    }
  }

  // 2. Rooms Table: Transition unique constraint from (pg_id, room_no) to (branch_id, room_no) + composite indexes
  const hasRooms = await knex.schema.hasTable('rooms');
  if (hasRooms) {
    if (await hasIndex('rooms', 'uq_rooms_pg_room_no')) {
      await knex.schema.alterTable('rooms', (table) => {
        table.dropUnique(['pg_id', 'room_no'], 'uq_rooms_pg_room_no');
      });
    }

    if (!(await hasIndex('rooms', 'uq_rooms_branch_room_no'))) {
      await knex.schema.alterTable('rooms', (table) => {
        table.unique(['branch_id', 'room_no'], 'uq_rooms_branch_room_no');
      });
    }

    if (!(await hasIndex('rooms', 'idx_rooms_branch_status_deleted'))) {
      await knex.schema.alterTable('rooms', (table) => {
        table.index(['branch_id', 'status', 'deleted_at'], 'idx_rooms_branch_status_deleted');
      });
    }

    if (!(await hasIndex('rooms', 'idx_rooms_branch_building_floor'))) {
      await knex.schema.alterTable('rooms', (table) => {
        table.index(['branch_id', 'building_id', 'floor_id'], 'idx_rooms_branch_building_floor');
      });
    }
  }

  // 3. Branches Table: Composite indexes for PG queries
  const hasBranches = await knex.schema.hasTable('branches');
  if (hasBranches) {
    if (!(await hasIndex('branches', 'idx_branches_pg_deleted'))) {
      await knex.schema.alterTable('branches', (table) => {
        table.index(['pg_id', 'deleted_at'], 'idx_branches_pg_deleted');
      });
    }
    if (!(await hasIndex('branches', 'idx_branches_pg_name'))) {
      await knex.schema.alterTable('branches', (table) => {
        table.index(['pg_id', 'name'], 'idx_branches_pg_name');
      });
    }
  }

  // 4. Resident Stays Table: Branch performance index
  const hasStays = await knex.schema.hasTable('resident_pg_stays');
  if (hasStays) {
    if (!(await hasIndex('resident_pg_stays', 'idx_stays_branch_status_deleted'))) {
      await knex.schema.alterTable('resident_pg_stays', (table) => {
        table.index(['branch_id', 'status', 'deleted_at'], 'idx_stays_branch_status_deleted');
      });
    }
    if (!(await hasIndex('resident_pg_stays', 'idx_stays_branch_resident'))) {
      await knex.schema.alterTable('resident_pg_stays', (table) => {
        table.index(['branch_id', 'resident_id'], 'idx_stays_branch_resident');
      });
    }
  }

  // 5. Payments Table: Branch performance index
  const hasPayments = await knex.schema.hasTable('payments');
  if (hasPayments) {
    if (!(await hasIndex('payments', 'idx_payments_branch_status_deleted'))) {
      await knex.schema.alterTable('payments', (table) => {
        table.index(['branch_id', 'status', 'deleted_at'], 'idx_payments_branch_status_deleted');
      });
    }
    if (!(await hasIndex('payments', 'idx_payments_branch_created'))) {
      await knex.schema.alterTable('payments', (table) => {
        table.index(['branch_id', 'created_at'], 'idx_payments_branch_created');
      });
    }
  }

  // 6. Agreements Table: Branch performance index
  const hasAgreements = await knex.schema.hasTable('agreements');
  if (hasAgreements) {
    if (!(await hasIndex('agreements', 'idx_agreements_branch_status_deleted'))) {
      await knex.schema.alterTable('agreements', (table) => {
        table.index(['branch_id', 'status', 'deleted_at'], 'idx_agreements_branch_status_deleted');
      });
    }
    if (!(await hasIndex('agreements', 'idx_agreements_branch_resident'))) {
      await knex.schema.alterTable('agreements', (table) => {
        table.index(['branch_id', 'resident_id'], 'idx_agreements_branch_resident');
      });
    }
  }

  // 7. Visitors Table: Branch performance index
  const hasVisitors = await knex.schema.hasTable('visitors');
  if (hasVisitors) {
    if (!(await hasIndex('visitors', 'idx_visitors_branch_status_deleted'))) {
      await knex.schema.alterTable('visitors', (table) => {
        table.index(['branch_id', 'status', 'deleted_at'], 'idx_visitors_branch_status_deleted');
      });
    }
    if (!(await hasIndex('visitors', 'idx_visitors_branch_visit_date'))) {
      await knex.schema.alterTable('visitors', (table) => {
        table.index(['branch_id', 'visit_date'], 'idx_visitors_branch_visit_date');
      });
    }
  }
};

export const down = async (knex) => {
  // Revert changes if needed
  try {
    await knex.schema.alterTable('buildings', (table) => {
      table.dropIndex(['branch_id', 'deleted_at'], 'idx_buildings_branch_deleted');
      table.dropUnique(['branch_id', 'name'], 'uq_buildings_branch_name');
      table.unique(['pg_id', 'name'], 'uq_buildings_pg_name');
    });
  } catch {}

  try {
    await knex.schema.alterTable('rooms', (table) => {
      table.dropIndex(['branch_id', 'status', 'deleted_at'], 'idx_rooms_branch_status_deleted');
      table.dropIndex(['branch_id', 'building_id', 'floor_id'], 'idx_rooms_branch_building_floor');
      table.dropUnique(['branch_id', 'room_no'], 'uq_rooms_branch_room_no');
      table.unique(['pg_id', 'room_no'], 'uq_rooms_pg_room_no');
    });
  } catch {}

  try {
    await knex.schema.alterTable('branches', (table) => {
      table.dropIndex(['pg_id', 'deleted_at'], 'idx_branches_pg_deleted');
      table.dropIndex(['pg_id', 'name'], 'idx_branches_pg_name');
    });
  } catch {}

  try {
    await knex.schema.alterTable('resident_pg_stays', (table) => {
      table.dropIndex(['branch_id', 'status', 'deleted_at'], 'idx_stays_branch_status_deleted');
      table.dropIndex(['branch_id', 'resident_id'], 'idx_stays_branch_resident');
    });
  } catch {}

  try {
    await knex.schema.alterTable('payments', (table) => {
      table.dropIndex(['branch_id', 'status', 'deleted_at'], 'idx_payments_branch_status_deleted');
      table.dropIndex(['branch_id', 'created_at'], 'idx_payments_branch_created');
    });
  } catch {}

  try {
    await knex.schema.alterTable('agreements', (table) => {
      table.dropIndex(['branch_id', 'status', 'deleted_at'], 'idx_agreements_branch_status_deleted');
      table.dropIndex(['branch_id', 'resident_id'], 'idx_agreements_branch_resident');
    });
  } catch {}

  try {
    await knex.schema.alterTable('visitors', (table) => {
      table.dropIndex(['branch_id', 'status', 'deleted_at'], 'idx_visitors_branch_status_deleted');
      table.dropIndex(['branch_id', 'visit_date'], 'idx_visitors_branch_visit_date');
    });
  } catch {}
};

