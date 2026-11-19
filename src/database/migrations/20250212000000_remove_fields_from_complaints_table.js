/**
 * Migration: Remove priority, notify_updates, issue_type, and device_type from complaints table.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const up = async (knex) => {
  const hasPriority = await knex.schema.hasColumn('complaints', 'priority');
  const hasNotify = await knex.schema.hasColumn('complaints', 'notify_updates');
  const hasIssueType = await knex.schema.hasColumn('complaints', 'issue_type');
  const hasDeviceType = await knex.schema.hasColumn('complaints', 'device_type');

  await knex.schema.alterTable('complaints', (table) => {
    if (hasPriority) table.dropColumn('priority');
    if (hasNotify) table.dropColumn('notify_updates');
    if (hasIssueType) table.dropColumn('issue_type');
    if (hasDeviceType) table.dropColumn('device_type');
  });
};

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export const down = async (knex) => {
  await knex.schema.alterTable('complaints', (table) => {
    table.enum('priority', ['LOW', 'MEDIUM', 'HIGH']).defaultTo('MEDIUM');
    table.enum('issue_type', ['NO_CONNECTION', 'SLOW_SPEED', 'INTERMITTENT_CONNECTION', 'OTHER']).nullable();
    table.enum('device_type', ['MOBILE', 'LAPTOP', 'TABLET', 'SMART_TV', 'OTHER']).nullable();
    table.boolean('notify_updates').defaultTo(true);
  });
};
