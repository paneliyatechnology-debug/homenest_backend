/**
 * Migration: Enforce 1 PG Per Admin with Multiple Branches Architecture
 *
 * Rules:
 * 1. Exactly 1 Admin owns only 1 PG property.
 * 2. That 1 PG property can have multiple branches.
 * 3. Consolidates any orphaned or secondary PG data to the owner's primary PG.
 * 4. Adds a UNIQUE constraint on pgs(owner_id) to guarantee 1-to-1 relationship at the DB level.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  // 1. Reassign any records pointing to secondary PGs (e.g. pg_id = 2) to owner's primary PG (pg_id = 1)
  const ownersWithMultiplePgs = await knex('pgs')
    .select('owner_id')
    .count('id as count')
    .whereNull('deleted_at')
    .groupBy('owner_id')
    .having('count', '>', 1);

  for (const row of ownersWithMultiplePgs) {
    const pgs = await knex('pgs')
      .where({ owner_id: row.owner_id })
      .whereNull('deleted_at')
      .orderBy('id', 'asc');

    if (pgs.length > 1) {
      const primaryPg = pgs[0];
      const secondaryPgIds = pgs.slice(1).map((p) => p.id);

      const domainTables = [
        'branches',
        'buildings',
        'floors',
        'rooms',
        'resident_pg_stays',
        'payments',
        'agreements',
        'visitors',
        'food_menus',
        'complaints',
        'users',
      ];

      for (const table of domainTables) {
        const hasTable = await knex.schema.hasTable(table);
        if (hasTable) {
          const hasPgId = await knex.schema.hasColumn(table, 'pg_id');
          if (hasPgId) {
            await knex(table)
              .whereIn('pg_id', secondaryPgIds)
              .update({ pg_id: primaryPg.id });
          }
        }
      }

      // Delete secondary PGs
      await knex('pgs').whereIn('id', secondaryPgIds).del();
    }
  }

  // 2. Add UNIQUE constraint on pgs.owner_id
  const hasUq = await knex.raw(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'pgs'
      AND CONSTRAINT_NAME = 'uq_pgs_owner_id'
  `);

  if (!hasUq[0] || hasUq[0].length === 0) {
    await knex.schema.alterTable('pgs', (table) => {
      table.unique(['owner_id'], 'uq_pgs_owner_id');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  const hasUq = await knex.raw(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'pgs'
      AND CONSTRAINT_NAME = 'uq_pgs_owner_id'
  `);

  if (hasUq[0] && hasUq[0].length > 0) {
    await knex.schema.alterTable('pgs', (table) => {
      table.dropUnique(['owner_id'], 'uq_pgs_owner_id');
    });
  }
};

