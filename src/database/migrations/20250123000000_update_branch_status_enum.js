/**
 * Migration to update branch status ENUM to include 'maintenance'
 * (active | maintenance | upcoming)
 */
export async function up(knex) {
  // 1. Expand ENUM to allow 'maintenance'
  await knex.raw(`
    ALTER TABLE branches 
    MODIFY COLUMN status ENUM('active', 'maintenance', 'upcoming', 'under_maintenance') 
    NOT NULL DEFAULT 'active'
  `);

  // 2. Convert any existing 'under_maintenance' to 'maintenance'
  await knex('branches')
    .where('status', 'under_maintenance')
    .update({ status: 'maintenance' });
}

export async function down(knex) {
  await knex('branches')
    .where('status', 'maintenance')
    .update({ status: 'under_maintenance' });

  await knex.raw(`
    ALTER TABLE branches 
    MODIFY COLUMN status ENUM('active', 'under_maintenance', 'upcoming') 
    NOT NULL DEFAULT 'active'
  `);
}

