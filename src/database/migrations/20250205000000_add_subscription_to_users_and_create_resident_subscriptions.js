/**
 * Migration: Add subscription_plan_id to users and create resident_subscriptions table
 * Supports assigning optional subscription plans when onboarding residents,
 * tracking plan purchase history, and incrementing subscription plan subscriber counts.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  // 1. Add subscription_plan_id to users table if not exists
  const hasUserCol = await knex.schema.hasColumn('users', 'subscription_plan_id');
  if (!hasUserCol) {
    await knex.schema.alterTable('users', (table) => {
      table.integer('subscription_plan_id').unsigned().nullable()
        .references('id').inTable('subscription_plans')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.index(['subscription_plan_id']);
    });
  }

  // 2. Create resident_subscriptions table to track resident plan purchases & periods
  const hasSubTable = await knex.schema.hasTable('resident_subscriptions');
  if (!hasSubTable) {
    await knex.schema.createTable('resident_subscriptions', (table) => {
      table.increments('id').primary();

      table.integer('resident_id').unsigned().notNullable()
        .references('id').inTable('users')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('subscription_plan_id').unsigned().notNullable()
        .references('id').inTable('subscription_plans')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.decimal('price', 10, 2).notNullable().defaultTo(0.00);
      table.date('start_date').notNullable();
      table.date('end_date').nullable();
      table.enum('status', ['active', 'cancelled', 'expired']).notNullable().defaultTo('active');

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();

      // Indexes for fast lookups
      table.index(['resident_id', 'status']);
      table.index(['subscription_plan_id']);
      table.index(['pg_id']);
    });
  }
};

/**
 * Rollback migration
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('resident_subscriptions');

  const hasUserCol = await knex.schema.hasColumn('users', 'subscription_plan_id');
  if (hasUserCol) {
    await knex.schema.alterTable('users', (table) => {
      table.dropForeign(['subscription_plan_id']);
      table.dropColumn('subscription_plan_id');
    });
  }
};

