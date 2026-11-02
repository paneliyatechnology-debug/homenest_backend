/**
 * Merge food_menus and food_menu_items tables into a single unified food_menus table.
 * Removes duplicate parent-child separation and simplifies food_feedback foreign key to menu_id.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  // 1. Drop old foreign keys and unique index on food_feedback
  try {
    await knex.raw('ALTER TABLE `food_feedback` DROP FOREIGN KEY `food_feedback_menu_id_foreign`');
  } catch (err) {
    console.warn('[Migration Warning] food_feedback_menu_id_foreign drop skipped:', err.message);
  }

  try {
    await knex.raw('ALTER TABLE `food_feedback` DROP FOREIGN KEY `food_feedback_menu_item_id_foreign`');
  } catch (err) {
    console.warn('[Migration Warning] food_feedback_menu_item_id_foreign drop skipped:', err.message);
  }

  try {
    await knex.raw('ALTER TABLE `food_feedback` DROP INDEX `uniq_resident_menu_item`');
  } catch (err) {
    console.warn('[Migration Warning] uniq_resident_menu_item drop skipped:', err.message);
  }

  // 2. Set food_feedback.menu_id = food_feedback.menu_item_id (so it references the item ID)
  await knex.raw('UPDATE `food_feedback` SET `menu_id` = `menu_item_id` WHERE `menu_item_id` IS NOT NULL');

  // 3. Drop menu_item_id column from food_feedback if exists
  const hasMenuItemId = await knex.schema.hasColumn('food_feedback', 'menu_item_id');
  if (hasMenuItemId) {
    await knex.schema.alterTable('food_feedback', (table) => {
      table.dropColumn('menu_item_id');
    });
  }

  // 4. Create new merged food_menus_new table
  await knex.schema.dropTableIfExists('food_menus_new');
  await knex.schema.createTable('food_menus_new', (table) => {
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
    table.string('day_of_week', 20).notNullable();
    table.enum('meal_type', ['breakfast', 'lunch', 'dinner']).notNullable();
    table.string('name', 150).notNullable();
    table.string('description', 500).nullable();
    table.string('image', 255).nullable();
    table.string('start_time', 20).nullable();
    table.string('end_time', 20).nullable();
    table.string('included_items', 255).nullable();
    table.boolean('is_active').defaultTo(true);
    table.integer('sort_order').defaultTo(0);

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();

    table.index(['branch_id', 'menu_date'], 'idx_food_menus_branch_date');
    table.index(['branch_id', 'meal_type'], 'idx_food_menus_branch_meal');
    table.index('meal_type', 'idx_food_menus_meal_type');
    table.index('deleted_at', 'idx_food_menus_deleted_at');
  });

  // 5. Migrate data from food_menu_items + food_menus
  const hasMenuItemsTable = await knex.schema.hasTable('food_menu_items');
  if (hasMenuItemsTable) {
    await knex.raw(`
      INSERT INTO food_menus_new (
        id, pg_id, branch_id, menu_date, day_of_week, meal_type,
        name, description, image, start_time, end_time, included_items,
        is_active, sort_order, created_at, updated_at, deleted_at
      )
      SELECT
        fmi.id,
        fm.pg_id,
        fm.branch_id,
        fm.menu_date,
        fm.day_of_week,
        fmi.meal_type,
        fmi.name,
        fmi.description,
        fmi.image,
        fmi.start_time,
        fmi.end_time,
        fmi.included_items,
        fmi.is_active,
        fmi.sort_order,
        fmi.created_at,
        fmi.updated_at,
        fmi.deleted_at
      FROM food_menu_items fmi
      JOIN food_menus fm ON fmi.menu_id = fm.id
    `);

    await knex.schema.dropTableIfExists('food_menu_items');
  }

  // 6. Drop old food_menus table and rename food_menus_new to food_menus
  await knex.schema.dropTableIfExists('food_menus');
  await knex.schema.renameTable('food_menus_new', 'food_menus');

  // 7. Add foreign key and unique index on food_feedback
  await knex.schema.alterTable('food_feedback', (table) => {
    table.foreign('menu_id')
      .references('id').inTable('food_menus')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');

    table.unique(['resident_id', 'menu_id'], 'uniq_resident_menu');
  });
};

/**
 * Rollback migration
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  try {
    await knex.raw('ALTER TABLE `food_feedback` DROP FOREIGN KEY `food_feedback_menu_id_foreign`');
  } catch {}

  try {
    await knex.raw('ALTER TABLE `food_feedback` DROP INDEX `uniq_resident_menu`');
  } catch {}
};

