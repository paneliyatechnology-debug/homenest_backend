/**
 * Migration: Create notices and notice_reads tables
 * Supports Property Notice Management & Scheduling for Admins
 * and Resident Notification Center with Read/Unread tracking.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  const hasNoticesTable = await knex.schema.hasTable('notices');
  if (!hasNoticesTable) {
    await knex.schema.createTable('notices', (table) => {
      table.increments('id').primary();

      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('branch_id').unsigned().nullable()
        .references('id').inTable('branches')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.integer('created_by').unsigned().nullable()
        .references('id').inTable('users')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.string('title', 255).notNullable();
      table.string('category', 100).notNullable().defaultTo('General');
      table.enum('priority', ['low', 'medium', 'high']).notNullable().defaultTo('medium');
      table.enum('audience_type', ['all', 'branch', 'room', 'resident']).notNullable().defaultTo('all');

      table.integer('target_room_id').unsigned().nullable()
        .references('id').inTable('rooms')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.integer('target_resident_id').unsigned().nullable()
        .references('id').inTable('users')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.text('content').notNullable();

      table.string('attachment_name', 255).nullable();
      table.string('attachment_original_name', 255).nullable();
      table.integer('attachment_size').nullable();
      table.string('attachment_mime', 100).nullable();

      table.timestamp('scheduled_at').nullable();
      table.timestamp('sent_at').nullable();
      table.enum('status', ['draft', 'scheduled', 'sent']).notNullable().defaultTo('draft');

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();

      // Scoping and filtering indexes
      table.index(['pg_id', 'status']);
      table.index(['pg_id', 'category']);
      table.index(['branch_id']);
      table.index(['audience_type']);
      table.index(['scheduled_at']);
      table.index(['deleted_at']);
    });
  }

  const hasNoticeReadsTable = await knex.schema.hasTable('notice_reads');
  if (!hasNoticeReadsTable) {
    await knex.schema.createTable('notice_reads', (table) => {
      table.increments('id').primary();

      table.integer('notice_id').unsigned().notNullable()
        .references('id').inTable('notices')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('resident_id').unsigned().notNullable()
        .references('id').inTable('users')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.timestamp('read_at').defaultTo(knex.fn.now());

      table.unique(['notice_id', 'resident_id']);
      table.index(['resident_id']);
    });
  }

  // Seed sample notices matching UI designs for PG facility 1 if PG exists
  const pg = await knex('pgs').whereNull('deleted_at').orderBy('id', 'asc').first();
  if (pg) {
    const admin = await knex('users').where({ role: 'admin' }).whereNull('deleted_at').first();
    const branch = await knex('branches').where({ pg_id: pg.id }).whereNull('deleted_at').first();

    const sampleNotices = [
      {
        pg_id: pg.id,
        branch_id: branch?.id || null,
        created_by: admin?.id || null,
        title: 'Maintenance Alert - Water Supply',
        category: 'Important',
        priority: 'high',
        audience_type: 'all',
        content: 'Dear Residents,\n\nThe water supply will be closed on 25 march (Wednesday) from 09:00 AM to 02:00 PM for maintenance work. Please store enough water in advance.\n\nWe regret the inconvenience caused.',
        attachment_name: 'Water_maintenance_Detail.pdf',
        attachment_original_name: 'Water_maintenance_Detail.pdf',
        attachment_size: 2411724, // ~2.3 MB
        attachment_mime: 'application/pdf',
        scheduled_at: new Date('2026-03-24T10:30:00'),
        sent_at: new Date('2026-03-24T10:30:00'),
        status: 'sent',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      },
      {
        pg_id: pg.id,
        branch_id: branch?.id || null,
        created_by: admin?.id || null,
        title: 'Electricity maintenance in your block (10 AM - 1 PM)',
        category: 'General',
        priority: 'medium',
        audience_type: 'all',
        content: 'Scheduled maintenance will be carried out on the electrical panel tomorrow between 10:00 AM and 01:00 PM. Backup power will remain operational for common areas.',
        scheduled_at: new Date('2026-03-24T10:30:00'),
        sent_at: new Date('2026-03-24T10:30:00'),
        status: 'sent',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      },
      {
        pg_id: pg.id,
        branch_id: branch?.id || null,
        created_by: admin?.id || null,
        title: 'New year celebration 2026',
        category: 'Event',
        priority: 'medium',
        audience_type: 'all',
        content: 'Join us for fun, food and music! Let us welcome the upcoming year together at the PG rooftop dining hall.',
        scheduled_at: new Date('2026-03-24T10:30:00'),
        sent_at: new Date('2026-03-24T10:30:00'),
        status: 'sent',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      },
      {
        pg_id: pg.id,
        branch_id: branch?.id || null,
        created_by: admin?.id || null,
        title: 'Wi-fi password has been updated.',
        category: 'General',
        priority: 'low',
        audience_type: 'all',
        content: 'The Wi-Fi access credentials for all resident floors have been updated. Please check your resident profile or contact the front desk for details.',
        scheduled_at: new Date('2026-03-24T10:30:00'),
        sent_at: new Date('2026-03-24T10:30:00'),
        status: 'sent',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      },
      {
        pg_id: pg.id,
        branch_id: branch?.id || null,
        created_by: admin?.id || null,
        title: 'Water supply maintenance',
        category: 'Maintenance',
        priority: 'high',
        audience_type: 'all',
        content: 'Routine overhead tank cleaning and plumbing pipeline maintenance is scheduled for next week.',
        scheduled_at: new Date('2025-12-05T10:24:00'),
        sent_at: null,
        status: 'scheduled',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      },
      {
        pg_id: pg.id,
        branch_id: branch?.id || null,
        created_by: admin?.id || null,
        title: 'Fire safety drill and training draft',
        category: 'Safety',
        priority: 'high',
        audience_type: 'all',
        content: 'Draft guidelines for the upcoming mandatory fire safety and evacuation drill.',
        scheduled_at: null,
        sent_at: null,
        status: 'draft',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      },
    ];

    await knex('notices').insert(sampleNotices);
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('notice_reads');
  await knex.schema.dropTableIfExists('notices');
};

