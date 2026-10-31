/**
 * Migration: Create 'visitor_logs' table and add multi-entry tracking to 'visitors'
 *
 * Enables:
 * 1. Multiple entries and exits for a visitor within their authorized time period (visit_date to valid_until).
 * 2. Complete audit trail and real-time monitoring of all entry and exit events with timestamps, gate, and guard details.
 * 3. Accurate counting and historical tracking of visitor presence (in_office vs left).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  // 1. Add multi-entry tracking columns to 'visitors' table if missing
  const hasVisitors = await knex.schema.hasTable('visitors');
  if (hasVisitors) {
    await knex.schema.alterTable('visitors', (table) => {
      // Add valid_until for multi-day validity periods
      table.date('valid_until').nullable().after('visit_date');
      table.integer('total_entries').notNullable().defaultTo(0).after('status');
      table.string('last_entry_time', 20).nullable().after('entry_time');
      table.string('last_exit_time', 20).nullable().after('exit_time');
    });

    // Populate initial total_entries, valid_until, last_entry_time, last_exit_time for existing visitors
    await knex('visitors').update({
      valid_until: knex.ref('visit_date'),
      last_entry_time: knex.ref('entry_time'),
      last_exit_time: knex.ref('exit_time'),
    });

    // Set total_entries = 1 for visitors who already entered
    await knex('visitors')
      .whereIn('status', ['in_office', 'left'])
      .whereNotNull('entry_time')
      .update({ total_entries: 1 });
  }

  // 2. Create 'visitor_logs' table
  const hasLogs = await knex.schema.hasTable('visitor_logs');
  if (!hasLogs) {
    await knex.schema.createTable('visitor_logs', (table) => {
      table.increments('id').primary();
      table.integer('visitor_id').unsigned().notNullable()
        .references('id').inTable('visitors')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('branch_id').unsigned().nullable()
        .references('id').inTable('branches')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.string('pass_code', 50).notNullable();
      table.enum('type', ['entry', 'exit']).notNullable();
      table.date('log_date').notNullable();
      table.string('log_time', 20).notNullable(); // e.g. "10:24 AM"
      table.string('gate_name', 100).notNullable().defaultTo('Main Gate');
      table.integer('logged_by').unsigned().nullable()
        .references('id').inTable('users')
        .onDelete('SET NULL');
      table.text('notes').nullable();

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();

      // Performance Indexes
      table.index(['visitor_id', 'created_at'], 'idx_visitor_logs_visitor_created');
      table.index(['branch_id', 'log_date'], 'idx_visitor_logs_branch_date');
      table.index(['pg_id', 'log_date'], 'idx_visitor_logs_pg_date');
      table.index('pass_code', 'idx_visitor_logs_pass_code');
      table.index('type', 'idx_visitor_logs_type');
    });

    // Backfill logs from existing visitors
    const existingVisitors = await knex('visitors').whereNull('deleted_at');
    for (const v of existingVisitors) {
      if (v.entry_time) {
        await knex('visitor_logs').insert({
          visitor_id: v.id,
          pg_id: v.pg_id,
          branch_id: v.branch_id || null,
          pass_code: v.pass_code || `VP-${v.id}`,
          type: 'entry',
          log_date: v.visit_date,
          log_time: v.entry_time,
          gate_name: 'Main Gate',
          logged_by: v.created_by || null,
          notes: 'Initial check-in',
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        });
      }

      if (v.exit_time && v.status === 'left') {
        await knex('visitor_logs').insert({
          visitor_id: v.id,
          pg_id: v.pg_id,
          branch_id: v.branch_id || null,
          pass_code: v.pass_code || `VP-${v.id}`,
          type: 'exit',
          log_date: v.visit_date,
          log_time: v.exit_time,
          gate_name: 'Main Gate',
          logged_by: v.created_by || null,
          notes: 'Visitor departure',
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        });
      }
    }
  }
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('visitor_logs');

  const hasVisitors = await knex.schema.hasTable('visitors');
  if (hasVisitors) {
    await knex.schema.alterTable('visitors', (table) => {
      table.dropColumn('valid_until');
      table.dropColumn('total_entries');
      table.dropColumn('last_entry_time');
      table.dropColumn('last_exit_time');
    });
  }
};

