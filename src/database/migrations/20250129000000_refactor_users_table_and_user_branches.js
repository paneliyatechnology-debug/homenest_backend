/**
 * Migration: Refactor users table and create user_branches
 * - Sets strict ENUM for user role: 'super_admin', 'admin', 'resident', 'staff'
 * - Adds staff_role ENUM for operational staff roles
 * - Adds pg_id to users for multi-tenant property scoping
 * - Extends status ENUM to: 'active', 'pending', 'inactive', 'on_leave'
 * - Drops duplicate is_active column (replaced completely by status)
 * - Makes password nullable (for staff members who do not require login passwords)
 * - Creates user_branches table for unified multi-branch management across Residents, Admins, and Staff
 * - Backfills user_branches for existing active residents and admins
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  // 1. Sync any inactive users before dropping is_active
  const hasIsActive = await knex.schema.hasColumn('users', 'is_active');
  if (hasIsActive) {
    await knex.raw("UPDATE `users` SET `status` = 'inactive' WHERE `is_active` = 0 OR `is_active` = false");
  }

  // 2. Alter users table columns and schema
  await knex.schema.alterTable('users', (table) => {
    if (hasIsActive) {
      table.dropColumn('is_active');
    }

    table.enum('staff_role', [
      'KITCHEN_STAFF',
      'HOUSEKEEPING',
      'SECURITY_GUARD',
      'ACCOUNTANT',
      'BRANCH_MANAGER',
      'WARDEN',
      'MAINTENANCE',
    ]).nullable();

    table.integer('pg_id').unsigned().nullable()
      .references('id').inTable('pgs')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');

    table.index(['pg_id', 'role'], 'idx_users_pg_role');
    table.index(['pg_id', 'staff_role'], 'idx_users_pg_staff_role');
    table.index('role', 'idx_users_role');
    table.index('status', 'idx_users_status');
  });

  // Alter role enum, status enum, and nullable password
  await knex.raw("ALTER TABLE `users` MODIFY COLUMN `role` ENUM('super_admin', 'admin', 'resident', 'staff') NOT NULL DEFAULT 'resident'");
  await knex.raw("ALTER TABLE `users` MODIFY COLUMN `status` ENUM('active', 'pending', 'inactive', 'on_leave') NOT NULL DEFAULT 'active'");
  await knex.raw('ALTER TABLE `users` MODIFY COLUMN `password` VARCHAR(255) NULL');

  // 3. Create user_branches junction table (Many-to-Many: 1 user can be assigned to multiple branches)
  const hasUserBranchesTable = await knex.schema.hasTable('user_branches');
  if (!hasUserBranchesTable) {
    await knex.schema.createTable('user_branches', (table) => {
      table.increments('id').primary();

      table.integer('user_id').unsigned().notNullable()
        .references('id').inTable('users')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('branch_id').unsigned().notNullable()
        .references('id').inTable('branches')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.timestamp('created_at').defaultTo(knex.fn.now());

      // Constraints and Indexes
      table.unique(['user_id', 'branch_id'], 'uniq_user_branch');
      table.index('user_id', 'idx_user_branches_user_id');
      table.index('branch_id', 'idx_user_branches_branch_id');
    });
  }

  // 4. Backfill user_branches for existing residents and admins for complete consistency
  try {
    // A. Residents: link active stays to user_branches
    const activeStays = await knex('resident_pg_stays')
      .where({ status: 'active' })
      .whereNotNull('branch_id')
      .whereNull('deleted_at')
      .select('resident_id as user_id', 'branch_id');

    for (const stay of activeStays) {
      const exists = await knex('user_branches')
        .where({ user_id: stay.user_id, branch_id: stay.branch_id })
        .first();
      if (!exists) {
        await knex('user_branches').insert({
          user_id: stay.user_id,
          branch_id: stay.branch_id,
        });
      }
    }

    // B. Admins: link property branches to user_branches
    const adminBranches = await knex('pgs')
      .join('branches', 'pgs.id', 'branches.pg_id')
      .whereNull('pgs.deleted_at')
      .whereNull('branches.deleted_at')
      .select('pgs.owner_id as user_id', 'branches.id as branch_id');

    for (const ab of adminBranches) {
      const exists = await knex('user_branches')
        .where({ user_id: ab.user_id, branch_id: ab.branch_id })
        .first();
      if (!exists) {
        await knex('user_branches').insert({
          user_id: ab.user_id,
          branch_id: ab.branch_id,
        });
      }
    }
  } catch (err) {
    console.warn('[Migration Warning] Error backfilling user_branches:', err.message);
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('user_branches');

  await knex.schema.alterTable('users', (table) => {
    table.dropForeign('pg_id');
    table.dropIndex(['pg_id', 'role'], 'idx_users_pg_role');
    table.dropIndex(['pg_id', 'staff_role'], 'idx_users_pg_staff_role');
    table.dropIndex('role', 'idx_users_role');
    table.dropIndex('status', 'idx_users_status');
    table.dropColumn('staff_role');
    table.dropColumn('pg_id');
    table.boolean('is_active').notNullable().defaultTo(true);
  });

  await knex.raw('ALTER TABLE `users` MODIFY COLUMN `role` VARCHAR(20) NOT NULL DEFAULT "user"');
  await knex.raw("ALTER TABLE `users` MODIFY COLUMN `status` ENUM('active', 'pending', 'inactive') NOT NULL DEFAULT 'active'");
  await knex.raw('ALTER TABLE `users` MODIFY COLUMN `password` VARCHAR(255) NOT NULL');
};

