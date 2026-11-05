/**
 * Migration: Create audit_logs table for comprehensive Property & Branch wise System Auditing
 *
 * Tracks administrative and resident operations across:
 * - Authentication (Login, Logout, Password changes)
 * - User & Resident Management (Create, Update, Status Change, Delete)
 * - Room & Bed Inventory (Create, Update, Delete, Status change, Room shifts)
 * - Stay & Checkout (Check-in, Checkout request, Vacation, Approvals)
 * - Payments & Billing (Invoices, Offline payments, Status updates, Refunds)
 * - Complaints (File, Assignment, Status updates, Resolutions)
 * - Visitor Access (Pass creation, Approvals, QR Gate entry/exit scans)
 * - Notices & Communication (Create, Send, Delete, Audience targeting)
 * - Laundry & Food Menu Operations
 *
 * Supports comprehensive filtering by:
 * - pg_id (Multi-tenant property scoping)
 * - branch_id (Branch-wise audit trail)
 * - module (AUTH, USER, ROOM, PAYMENT, etc.)
 * - action (CREATE, UPDATE, DELETE, etc.)
 * - user_id (Actor / Performer)
 * - date range (start_date, end_date)
 * - search term
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  const hasAuditTable = await knex.schema.hasTable('audit_logs');
  if (!hasAuditTable) {
    await knex.schema.createTable('audit_logs', (table) => {
      table.increments('id').primary();

      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('branch_id').unsigned().nullable()
        .references('id').inTable('branches')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.integer('user_id').unsigned().nullable()
        .references('id').inTable('users')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.string('user_name', 150).nullable();
      table.string('user_role', 50).nullable();

      table.string('module', 50).notNullable();
      table.string('action', 100).notNullable();

      table.string('entity_type', 50).nullable();
      table.string('entity_id', 100).nullable();

      table.text('description').nullable();

      table.json('old_values').nullable();
      table.json('new_values').nullable();
      table.json('metadata').nullable();

      table.string('ip_address', 45).nullable();
      table.string('user_agent', 255).nullable();

      table.timestamp('created_at').defaultTo(knex.fn.now());

      // Composite & Performance Indexes for fast multi-tenant filtering
      table.index(['pg_id', 'created_at'], 'idx_audit_logs_pg_created');
      table.index(['branch_id', 'created_at'], 'idx_audit_logs_branch_created');
      table.index(['module', 'created_at'], 'idx_audit_logs_module_created');
      table.index(['action', 'created_at'], 'idx_audit_logs_action_created');
      table.index(['entity_type', 'entity_id'], 'idx_audit_logs_entity');
      table.index(['user_id', 'created_at'], 'idx_audit_logs_user_created');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('audit_logs');
};

