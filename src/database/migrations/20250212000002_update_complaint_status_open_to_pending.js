/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // 1. Expand enum to include PENDING while keeping OPEN temporarily
  await knex.raw("ALTER TABLE complaints MODIFY COLUMN status ENUM('OPEN', 'PENDING', 'IN_PROGRESS', 'RESOLVED') DEFAULT 'PENDING'");

  // 2. Update existing records in complaints table
  await knex('complaints').where('status', 'OPEN').update({ status: 'PENDING' });

  // 3. Update timeline history
  await knex('complaint_history').where('new_value', 'OPEN').update({ new_value: 'PENDING' });
  await knex('complaint_history').where('old_value', 'OPEN').update({ old_value: 'PENDING' });

  // 4. Tighten enum to only PENDING, IN_PROGRESS, RESOLVED
  await knex.raw("ALTER TABLE complaints MODIFY COLUMN status ENUM('PENDING', 'IN_PROGRESS', 'RESOLVED') DEFAULT 'PENDING'");
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.raw("ALTER TABLE complaints MODIFY COLUMN status ENUM('OPEN', 'PENDING', 'IN_PROGRESS', 'RESOLVED') DEFAULT 'OPEN'");
  await knex('complaints').where('status', 'PENDING').update({ status: 'OPEN' });
  await knex('complaint_history').where('new_value', 'PENDING').update({ new_value: 'OPEN' });
  await knex('complaint_history').where('old_value', 'PENDING').update({ old_value: 'OPEN' });
  await knex.raw("ALTER TABLE complaints MODIFY COLUMN status ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED') DEFAULT 'OPEN'");
}
