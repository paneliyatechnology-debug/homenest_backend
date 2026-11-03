/**
 * Migration: Create subscription_plans table
 * Supports managing, configuring, and viewing resident subscription plans
 * with plan types, pricing, duration, included features/services, and is_active flag.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  const hasTable = await knex.schema.hasTable('subscription_plans');
  if (!hasTable) {
    await knex.schema.createTable('subscription_plans', (table) => {
      table.increments('id').primary();

      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.string('name', 100).notNullable();
      table.enum('plan_type', ['monthly', 'quarterly', 'yearly']).notNullable().defaultTo('monthly');
      table.decimal('price', 10, 2).notNullable().defaultTo(0.00);
      table.string('duration', 50).notNullable().defaultTo('1 Month');
      table.text('description').nullable();
      table.json('features').nullable(); // Array of included feature strings e.g. ["WiFi Access", "Laundry service"]

      table.boolean('is_active').notNullable().defaultTo(true); // 1 = Active, 0 = Inactive
      table.integer('subscribers_count').unsigned().notNullable().defaultTo(0);

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.timestamp('deleted_at').nullable();

      // Performance and scoping indexes
      table.index(['pg_id', 'is_active']);
      table.index(['pg_id', 'plan_type']);
      table.index(['deleted_at']);
    });

    // Seed initial plans matching Admin Portal designs for PG facility 1 if PG exists
    const pg = await knex('pgs').whereNull('deleted_at').orderBy('id', 'asc').first();
    if (pg) {
      await knex('subscription_plans').insert([
        {
          pg_id: pg.id,
          name: 'Basic Plan',
          plan_type: 'monthly',
          price: 8999.00,
          duration: '1 Month',
          description: 'Standard monthly plan covering essential living facilities with WiFi and housekeeping.',
          features: JSON.stringify(['WiFi Access', 'Laundry service', 'Housekeeping', 'Maintenance support']),
          is_active: 1,
          subscribers_count: 78,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        },
        {
          pg_id: pg.id,
          name: 'Basic Plan (Paused)',
          plan_type: 'monthly',
          price: 8999.00,
          duration: '1 Month',
          description: 'Standard monthly plan temporarily paused for new subscriptions.',
          features: JSON.stringify(['WiFi Access', 'Laundry service', 'Maintenance support']),
          is_active: 0,
          subscribers_count: 78,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        },
        {
          pg_id: pg.id,
          name: 'Quarterly Saver Plan',
          plan_type: 'quarterly',
          price: 24999.00,
          duration: '3 Months',
          description: 'Quarterly subscription plan offering discounted rates for 3 months commitment.',
          features: JSON.stringify(['WiFi Access', 'Laundry service', 'Housekeeping', 'Maintenance support', 'Room cleaning']),
          is_active: 1,
          subscribers_count: 78,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        },
        {
          pg_id: pg.id,
          name: 'Yearly Plan',
          plan_type: 'yearly',
          price: 99999.00,
          duration: '1 Year',
          description: 'Full year all-inclusive subscription with maximum savings and priority facilities.',
          features: JSON.stringify(['WiFi Access', 'Laundry service', 'Housekeeping', 'Maintenance support', 'Room cleaning', 'Priority support']),
          is_active: 0,
          subscribers_count: 78,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        },
        {
          pg_id: pg.id,
          name: 'Premium Plan',
          plan_type: 'monthly',
          price: 8999.00,
          duration: '1 Month',
          description: 'Our premium plan gives you the complete living experience with all essential services and extra benefits for a hassle-free stay.',
          features: JSON.stringify([
            'WiFi Access',
            'Laundry service',
            'Housekeeping',
            'Maintenance support',
            'Room cleaning',
            'Food credits',
            'Priority support',
            'Discounts',
          ]),
          is_active: 1,
          subscribers_count: 54,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        },
      ]);
    }
  }
};

/**
 * Rollback migration
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('subscription_plans');
};
