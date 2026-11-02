/**
 * Add image column, convert feedback_date to timestamp, and update unique constraint in food_feedback table
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  const hasImage = await knex.schema.hasColumn('food_feedback', 'image');

  await knex.schema.alterTable('food_feedback', (table) => {
    if (!hasImage) {
      table.string('image', 255).nullable().after('comments');
    }
  });

  // Drop old unique constraint on (resident_id, feedback_date, meal_type) if present
  try {
    await knex.raw('ALTER TABLE `food_feedback` DROP INDEX `uniq_resident_meal_date`');
  } catch (err) {
    console.warn('[Migration Warning] uniq_resident_meal_date index drop skipped:', err.message);
  }

  // Alter feedback_date to TIMESTAMP with current timestamp default
  await knex.raw('ALTER TABLE `food_feedback` MODIFY COLUMN `feedback_date` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');

  // Add unique index on (resident_id, menu_item_id) to prevent duplicate feedback per menu item
  try {
    await knex.raw('ALTER TABLE `food_feedback` ADD UNIQUE KEY `uniq_resident_menu_item` (`resident_id`, `menu_item_id`)');
  } catch (err) {
    console.warn('[Migration Warning] uniq_resident_menu_item index creation skipped:', err.message);
  }
};

/**
 * Rollback migration
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  try {
    await knex.raw('ALTER TABLE `food_feedback` DROP INDEX `uniq_resident_menu_item`');
  } catch {}

  try {
    await knex.raw('ALTER TABLE `food_feedback` MODIFY COLUMN `feedback_date` DATE NOT NULL');
  } catch {}

  try {
    await knex.raw('ALTER TABLE `food_feedback` ADD UNIQUE KEY `uniq_resident_meal_date` (`resident_id`, `feedback_date`, `meal_type`)');
  } catch {}

  const hasImage = await knex.schema.hasColumn('food_feedback', 'image');
  if (hasImage) {
    await knex.schema.alterTable('food_feedback', (table) => {
      table.dropColumn('image');
    });
  }
};

