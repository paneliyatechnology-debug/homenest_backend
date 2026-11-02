/**
 * Migration: Create 'food_menus', 'food_menu_items', and 'food_feedback' tables.
 *
 * Architecture:
 * 1. food_menus: Stores branch-wise date-wise food menu scheduling (by calendar menu_date).
 *    One menu per branch per specific date. Also auto-stores day_of_week for easy display.
 * 2. food_menu_items: Individual food items under each meal category (Breakfast, Lunch, Dinner).
 * 3. food_feedback: Resident meal feedback (ratings 1-5, comments max 300 chars) scoped by date and meal.
 *    Enforces unique constraint on (resident_id, feedback_date, meal_type) to prevent duplicates.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  // 1. Create 'food_menus' table (Date-wise)
  const hasMenusTable = await knex.schema.hasTable('food_menus');
  if (!hasMenusTable) {
    await knex.schema.createTable('food_menus', (table) => {
      table.increments('id').primary();
      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('branch_id').unsigned().notNullable()
        .references('id').inTable('branches')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.date('menu_date').notNullable();
      table.string('day_of_week', 20).notNullable(); // e.g. 'monday', 'saturday'

      table.boolean('is_active').notNullable().defaultTo(true);

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();

      // Unique constraint: one menu per branch per calendar date
      table.unique(['branch_id', 'menu_date'], 'uniq_branch_menu_date');

      // Indexes
      table.index(['branch_id', 'menu_date'], 'idx_food_menus_branch_date');
      table.index('menu_date', 'idx_food_menus_date');
      table.index('pg_id', 'idx_food_menus_pg_id');
      table.index('is_active', 'idx_food_menus_is_active');
      table.index('deleted_at', 'idx_food_menus_deleted_at');
    });
  }

  // 2. Create 'food_menu_items' table
  const hasItemsTable = await knex.schema.hasTable('food_menu_items');
  if (!hasItemsTable) {
    await knex.schema.createTable('food_menu_items', (table) => {
      table.increments('id').primary();
      table.integer('menu_id').unsigned().notNullable()
        .references('id').inTable('food_menus')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.enum('meal_type', ['breakfast', 'lunch', 'dinner']).notNullable();
      table.string('name', 150).notNullable();
      table.text('description').nullable();
      table.string('image', 255).nullable();
      table.string('start_time', 20).nullable(); // e.g. "07:30 AM"
      table.string('end_time', 20).nullable();   // e.g. "09:30 AM"
      table.text('included_items').nullable();   // e.g. "Tea, Fresh Fruits"
      table.boolean('is_active').notNullable().defaultTo(true);
      table.integer('sort_order').notNullable().defaultTo(0);

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();

      // Indexes
      table.index('menu_id', 'idx_food_items_menu_id');
      table.index('meal_type', 'idx_food_items_meal_type');
      table.index('is_active', 'idx_food_items_is_active');
      table.index('deleted_at', 'idx_food_items_deleted_at');
    });
  }

  // 3. Create 'food_feedback' table
  const hasFeedbackTable = await knex.schema.hasTable('food_feedback');
  if (!hasFeedbackTable) {
    await knex.schema.createTable('food_feedback', (table) => {
      table.increments('id').primary();
      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('branch_id').unsigned().notNullable()
        .references('id').inTable('branches')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('resident_id').unsigned().notNullable()
        .references('id').inTable('users')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.integer('menu_id').unsigned().nullable()
        .references('id').inTable('food_menus')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.integer('menu_item_id').unsigned().nullable()
        .references('id').inTable('food_menu_items')
        .onDelete('SET NULL')
        .onUpdate('CASCADE');

      table.enum('meal_type', ['breakfast', 'lunch', 'dinner']).notNullable();
      table.date('feedback_date').notNullable();
      table.tinyint('rating').unsigned().notNullable(); // 1 - 5 stars
      table.string('comments', 300).nullable(); // Max 300 characters

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();

      // Unique constraint to prevent duplicate feedback for the same resident, meal, and date
      table.unique(['resident_id', 'feedback_date', 'meal_type'], 'uniq_resident_meal_date');

      // Indexes for fast reporting and queries
      table.index(['branch_id', 'feedback_date'], 'idx_feedback_branch_date');
      table.index('resident_id', 'idx_feedback_resident_id');
      table.index('meal_type', 'idx_feedback_meal_type');
      table.index('rating', 'idx_feedback_rating');
      table.index('deleted_at', 'idx_feedback_deleted_at');
    });
  }
};

/**
 * Rollback migration
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('food_feedback');
  await knex.schema.dropTableIfExists('food_menu_items');
  await knex.schema.dropTableIfExists('food_menus');
};
