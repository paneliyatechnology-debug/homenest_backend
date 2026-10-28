/**
 * Migration: Add resident profile fields to 'users' table
 * Matches the 'Create New Resident' portal interface:
 * - date_of_birth
 * - nationality
 * - marital_status
 * - occupation
 * - profile_photo
 * - status ('active', 'pending', 'inactive')
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  const hasDob = await knex.schema.hasColumn('users', 'date_of_birth');
  const hasNationality = await knex.schema.hasColumn('users', 'nationality');
  const hasMaritalStatus = await knex.schema.hasColumn('users', 'marital_status');
  const hasOccupation = await knex.schema.hasColumn('users', 'occupation');
  const hasProfilePhoto = await knex.schema.hasColumn('users', 'profile_photo');
  const hasStatus = await knex.schema.hasColumn('users', 'status');

  await knex.schema.alterTable('users', (table) => {
    if (!hasDob) table.date('date_of_birth').nullable();
    if (!hasNationality) table.string('nationality', 50).nullable().defaultTo('Indian');
    if (!hasMaritalStatus) table.string('marital_status', 50).nullable().defaultTo('single');
    if (!hasOccupation) table.string('occupation', 100).nullable();
    if (!hasProfilePhoto) table.string('profile_photo', 255).nullable();
    if (!hasStatus) {
      table.enum('status', ['active', 'pending', 'inactive']).notNullable().defaultTo('active');
    }
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumns([
      'date_of_birth',
      'nationality',
      'marital_status',
      'occupation',
      'profile_photo',
      'status',
    ]);
  });
};

