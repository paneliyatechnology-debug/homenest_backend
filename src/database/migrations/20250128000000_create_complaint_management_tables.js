/**
 * Migration: Create Complaint Management Tables
 * Supports:
 * - complaint_categories (predefined fixed categories seeded)
 * - complaints (core complaint records, room/location, priority, WiFi subtypes)
 * - complaint_attachments (photo proofs)
 * - complaint_history (unified timeline: created, assigned, due date, status, update notes, resolved)
 * - complaint_feedback (resident rating & comments on resolved tickets with unique constraint)
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  // 1. Complaint Categories
  await knex.schema.createTable('complaint_categories', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable();
    table.string('key', 50).notNullable().unique();
    table.string('icon', 100).nullable();
    table.string('description', 255).nullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Seed predefined categories
  await knex('complaint_categories').insert([
    { name: 'Cleaning', key: 'cleaning', icon: 'sparkles', description: 'Room, bathroom, corridor, or premise cleaning issues' },
    { name: 'AC', key: 'ac', icon: 'air-conditioner', description: 'Air conditioner cooling, noise, or electrical issues' },
    { name: 'WiFi', key: 'wifi', icon: 'wifi', description: 'Internet connectivity, speed, or device connection issues' },
    { name: 'Water', key: 'water', icon: 'water-drop', description: 'Water supply, geyser, pressure, or drinking water issues' },
    { name: 'Food', key: 'food', icon: 'silverware-fork-knife', description: 'Meal quality, timing, hygiene, or catering issues' },
    { name: 'Electricity', key: 'electricity', icon: 'lightning-bolt', description: 'Power cuts, switches, sockets, fan, or lighting issues' },
    { name: 'Furniture', key: 'furniture', icon: 'bed', description: 'Bed, mattress, wardrobe, chair, or table issues' },
    { name: 'Plumbing', key: 'plumbing', icon: 'pipe', description: 'Drainage, pipe leakage, tap, or sanitary fixture issues' },
    { name: 'Appliances', key: 'appliances', icon: 'fridge', description: 'Washing machine, refrigerator, microwave, or TV issues' },
    { name: 'Other', key: 'other', icon: 'alert-circle', description: 'General or miscellaneous complaints' },
  ]);

  // 2. Complaints Table
  await knex.schema.createTable('complaints', (table) => {
    table.increments('id').primary();
    table.string('complaint_number', 50).notNullable().unique();

    table.integer('pg_id').unsigned().notNullable()
      .references('id').inTable('pgs')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    table.integer('branch_id').unsigned().notNullable()
      .references('id').inTable('branches')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    table.integer('room_id').unsigned().notNullable()
      .references('id').inTable('rooms')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    table.integer('resident_id').unsigned().notNullable()
      .references('id').inTable('users')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    table.integer('category_id').unsigned().notNullable()
      .references('id').inTable('complaint_categories')
      .onDelete('RESTRICT')
      .onUpdate('CASCADE');

    table.string('title', 150).nullable();
    table.text('description').notNullable();
    table.enum('priority', ['LOW', 'MEDIUM', 'HIGH']).defaultTo('MEDIUM');
    table.enum('status', ['OPEN', 'IN_PROGRESS', 'RESOLVED']).defaultTo('OPEN');

    // WiFi-specific optional subtypes
    table.enum('issue_type', ['NO_CONNECTION', 'SLOW_SPEED', 'INTERMITTENT_CONNECTION', 'OTHER']).nullable();
    table.enum('device_type', ['MOBILE', 'LAPTOP', 'TABLET', 'SMART_TV', 'OTHER']).nullable();

    table.integer('assigned_to').unsigned().nullable()
      .references('id').inTable('users')
      .onDelete('SET NULL')
      .onUpdate('CASCADE');

    table.timestamp('due_date').nullable();
    table.text('resolution_notes').nullable();
    table.timestamp('resolved_at').nullable();
    table.boolean('notify_updates').defaultTo(true);

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();

    // Composite & Performance Indexes
    table.index(['branch_id', 'status'], 'idx_complaints_branch_status');
    table.index(['resident_id', 'status'], 'idx_complaints_resident_status');
    table.index(['branch_id', 'created_at'], 'idx_complaints_branch_created');
    table.index('status', 'idx_complaints_status');
    table.index('category_id', 'idx_complaints_category');
    table.index('assigned_to', 'idx_complaints_assigned_to');
    table.index('deleted_at', 'idx_complaints_deleted_at');
  });

  // 3. Complaint Attachments Table
  await knex.schema.createTable('complaint_attachments', (table) => {
    table.increments('id').primary();

    table.integer('complaint_id').unsigned().notNullable()
      .references('id').inTable('complaints')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    table.string('file_name', 255).notNullable();
    table.string('file_url', 500).nullable();
    table.string('file_type', 50).nullable();
    table.integer('file_size').unsigned().nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('complaint_id', 'idx_complaint_attachments_complaint_id');
  });

  // 4. Complaint Unified Timeline / History Table
  await knex.schema.createTable('complaint_history', (table) => {
    table.increments('id').primary();

    table.integer('complaint_id').unsigned().notNullable()
      .references('id').inTable('complaints')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    table.enum('event_type', [
      'CREATED',
      'ASSIGNED',
      'STATUS_UPDATED',
      'DUE_DATE_UPDATED',
      'UPDATE_ADDED',
      'RESOLVED'
    ]).notNullable();

    table.text('description').notNullable();
    table.string('old_value', 255).nullable();
    table.string('new_value', 255).nullable();

    table.integer('performed_by').unsigned().notNullable()
      .references('id').inTable('users')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('complaint_id', 'idx_complaint_history_complaint_id');
  });

  // 5. Complaint Feedback Table (Enforces 1 feedback per complaint at DB level)
  await knex.schema.createTable('complaint_feedback', (table) => {
    table.increments('id').primary();

    table.integer('complaint_id').unsigned().notNullable().unique('uniq_complaint_feedback')
      .references('id').inTable('complaints')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    table.integer('resident_id').unsigned().notNullable()
      .references('id').inTable('users')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    table.integer('rating').notNullable(); // 1 to 5
    table.string('comments', 300).nullable();

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('resident_id', 'idx_complaint_feedback_resident_id');
  });
};

/**
 * Rollback Migration
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('complaint_feedback');
  await knex.schema.dropTableIfExists('complaint_history');
  await knex.schema.dropTableIfExists('complaint_attachments');
  await knex.schema.dropTableIfExists('complaints');
  await knex.schema.dropTableIfExists('complaint_categories');
};

