/**
 * Migration: Add 'in_review' status to payments table ENUM.
 * Allows residents to submit payment proof for admin verification.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const up = async (knex) => {
  await knex.raw(`
    ALTER TABLE payments 
    MODIFY COLUMN status ENUM('paid', 'pending', 'in_review', 'overdue', 'refunded', 'failed') 
    NOT NULL DEFAULT 'pending'
  `);
};

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const down = async (knex) => {
  await knex('payments')
    .where('status', 'in_review')
    .update({ status: 'pending' });

  await knex.raw(`
    ALTER TABLE payments 
    MODIFY COLUMN status ENUM('paid', 'pending', 'overdue', 'refunded', 'failed') 
    NOT NULL DEFAULT 'pending'
  `);
};
