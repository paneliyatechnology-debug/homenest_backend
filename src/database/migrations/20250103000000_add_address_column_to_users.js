/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  const hasAddress = await knex.schema.hasColumn('users', 'address');
  if (!hasAddress) {
    await knex.schema.alterTable('users', (table) => {
      table.text('address').nullable().after('phone');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  const hasAddress = await knex.schema.hasColumn('users', 'address');
  if (hasAddress) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('address');
    });
  }
};

