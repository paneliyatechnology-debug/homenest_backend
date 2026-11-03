import fs from 'fs';
import path from 'path';

/**
 * Migration: Create community module tables:
 * - community_posts
 * - community_post_likes
 * - community_post_comments
 * - community_events
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  // 1. community_posts
  const hasPostsTable = await knex.schema.hasTable('community_posts');
  if (!hasPostsTable) {
    await knex.schema.createTable('community_posts', (table) => {
      table.increments('id').primary();

      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('branch_id').unsigned().nullable()
        .references('id').inTable('branches')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.integer('user_id').unsigned().notNullable()
        .references('id').inTable('users')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.text('content').notNullable();
      table.string('image', 255).nullable();
      table.string('category', 50).notNullable().defaultTo('update'); // 'update', 'event', 'birthday'
      table.integer('likes_count').unsigned().notNullable().defaultTo(0);
      table.integer('comments_count').unsigned().notNullable().defaultTo(0);

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();

      table.index(['pg_id', 'deleted_at']);
      table.index(['pg_id', 'category']);
      table.index(['branch_id']);
      table.index(['user_id']);
      table.index(['created_at']);
    });
  }

  // 2. community_post_likes
  const hasLikesTable = await knex.schema.hasTable('community_post_likes');
  if (!hasLikesTable) {
    await knex.schema.createTable('community_post_likes', (table) => {
      table.increments('id').primary();

      table.integer('post_id').unsigned().notNullable()
        .references('id').inTable('community_posts')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('user_id').unsigned().notNullable()
        .references('id').inTable('users')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.unique(['post_id', 'user_id']);
      table.index(['user_id']);
    });
  }

  // 3. community_post_comments
  const hasCommentsTable = await knex.schema.hasTable('community_post_comments');
  if (!hasCommentsTable) {
    await knex.schema.createTable('community_post_comments', (table) => {
      table.increments('id').primary();

      table.integer('post_id').unsigned().notNullable()
        .references('id').inTable('community_posts')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('user_id').unsigned().notNullable()
        .references('id').inTable('users')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.text('content').notNullable();

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();

      table.index(['post_id', 'deleted_at']);
      table.index(['user_id']);
      table.index(['created_at']);
    });
  }

  // 4. community_events
  const hasEventsTable = await knex.schema.hasTable('community_events');
  if (!hasEventsTable) {
    await knex.schema.createTable('community_events', (table) => {
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
      table.string('category', 100).notNullable().defaultTo('Food & Fun');
      table.timestamp('event_date').notNullable();
      table.string('location', 255).notNullable().defaultTo('Common room');
      table.string('image', 255).nullable();
      table.enum('status', ['ongoing', 'upcoming', 'past']).notNullable().defaultTo('upcoming');
      table.text('description').nullable();

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();

      table.index(['pg_id', 'status']);
      table.index(['pg_id', 'event_date']);
      table.index(['branch_id']);
      table.index(['deleted_at']);
    });
  }

  // Ensure uploads/community directory exists
  const communityDir = path.join(process.cwd(), 'uploads', 'community');
  if (!fs.existsSync(communityDir)) {
    fs.mkdirSync(communityDir, { recursive: true });
  }

  // Seed sample community data matching UI designs
  const pg = await knex('pgs').whereNull('deleted_at').orderBy('id', 'asc').first();
  if (pg) {
    const resident = await knex('users')
      .where({ role: 'resident' })
      .whereNull('deleted_at')
      .first();

    const admin = await knex('users')
      .where({ role: 'admin' })
      .whereNull('deleted_at')
      .first();

    const branch = await knex('branches')
      .where({ pg_id: pg.id })
      .whereNull('deleted_at')
      .first();

    const authorId = resident?.id || admin?.id || 1;

    // Seed Posts
    const postCount = await knex('community_posts').count('id as count').first();
    if (parseInt(postCount?.count || 0, 10) === 0) {
      await knex('community_posts').insert([
        {
          pg_id: pg.id,
          branch_id: branch?.id || null,
          user_id: authorId,
          content: 'Had an amazing time at the weekend movie night! Such a great vibe at HomeNest! 💚',
          image: null,
          category: 'update',
          likes_count: 24,
          comments_count: 5,
          created_at: new Date(Date.now() - 3 * 3600 * 1000), // 3h ago
          updated_at: new Date(Date.now() - 3 * 3600 * 1000),
        },
        {
          pg_id: pg.id,
          branch_id: branch?.id || null,
          user_id: authorId,
          content: 'Had an amazing time at the Yoga session! Such a great vibe at HomeNest! 💚',
          image: null,
          category: 'update',
          likes_count: 24,
          comments_count: 5,
          created_at: new Date(Date.now() - 5 * 3600 * 1000), // 5h ago
          updated_at: new Date(Date.now() - 5 * 3600 * 1000),
        },
      ]);
    }

    // Seed Events matching Screen 3
    const eventCount = await knex('community_events').count('id as count').first();
    if (parseInt(eventCount?.count || 0, 10) === 0) {
      await knex('community_events').insert([
        {
          pg_id: pg.id,
          branch_id: branch?.id || null,
          created_by: admin?.id || authorId,
          title: 'Food Festival',
          category: 'Food & Fun',
          event_date: new Date('2026-03-24T10:30:00'),
          location: 'Common room',
          image: null,
          status: 'ongoing',
          description: 'Join us for a fun-filled food extravaganza with dishes from various regions!',
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        },
        {
          pg_id: pg.id,
          branch_id: branch?.id || null,
          created_by: admin?.id || authorId,
          title: 'Movie night',
          category: 'Cultural',
          event_date: new Date('2026-03-24T10:30:00'),
          location: 'Common room',
          image: null,
          status: 'upcoming',
          description: 'Weekend movie screening in the common hall with popcorn and cold drinks.',
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        },
        {
          pg_id: pg.id,
          branch_id: branch?.id || null,
          created_by: admin?.id || authorId,
          title: 'Yoga Session',
          category: 'Wellness',
          event_date: new Date('2026-03-24T10:30:00'),
          location: 'Common room',
          image: null,
          status: 'past',
          description: 'Early morning wellness and yoga stretching session for residents.',
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        },
        {
          pg_id: pg.id,
          branch_id: branch?.id || null,
          created_by: admin?.id || authorId,
          title: 'Birthday Celebration',
          category: 'Celebration',
          event_date: new Date('2026-03-24T10:30:00'),
          location: 'Common room',
          image: null,
          status: 'past',
          description: 'Monthly birthday cake cutting ceremony celebrating all residents born in March!',
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        },
      ]);
    }
  }
};

/**
 * Rollback migration
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('community_post_comments');
  await knex.schema.dropTableIfExists('community_post_likes');
  await knex.schema.dropTableIfExists('community_posts');
  await knex.schema.dropTableIfExists('community_events');
};

