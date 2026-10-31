/**
 * Migration: Create PGs and Resident Stays tables
 * Enables:
 * 1. One Owner (role: 'admin') having multiple PGs.
 * 2. Relation table (resident_pg_stays) tracking residents staying in multiple PGs over time.
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  // 1. Create 'pgs' table
  const pgsExists = await knex.schema.hasTable('pgs');
  if (!pgsExists) {
    await knex.schema.createTable('pgs', (table) => {
      table.increments('id').primary();
      table.integer('owner_id').unsigned().notNullable()
        .references('id').inTable('users')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.string('name', 150).notNullable();
      table.enum('type', ['boys', 'girls', 'coed', 'other']).notNullable().defaultTo('coed');
      table.string('phone', 20).notNullable();
      table.string('email', 150).nullable();
      table.text('address').notNullable();
      table.string('city', 100).notNullable();
      table.string('state', 100).notNullable();
      table.string('pincode', 10).notNullable();

      table.integer('total_rooms').defaultTo(0);
      table.integer('total_beds').defaultTo(0);
      table.text('amenities').nullable(); // JSON string or comma-separated
      table.text('rules').nullable();
      table.enum('status', ['active', 'inactive']).notNullable().defaultTo('active');
      table.string('logo', 255).nullable();
      table.string('pg_upi_id', 100).nullable();
      table.string('pg_bank_name', 100).nullable();
      table.string('pg_account_number', 50).nullable();
      table.string('pg_ifsc_code', 20).nullable();
      table.string('pg_account_holder_name', 150).nullable();

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      // Indexes
      table.index('owner_id', 'idx_pgs_owner_id');
      table.index('city', 'idx_pgs_city');
      table.index('status', 'idx_pgs_status');
    });
  }

  // 2. Create 'resident_pg_stays' relation table
  const staysExists = await knex.schema.hasTable('resident_pg_stays');
  if (!staysExists) {
    await knex.schema.createTable('resident_pg_stays', (table) => {
      table.increments('id').primary();
      table.integer('resident_id').unsigned().notNullable()
        .references('id').inTable('users')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
      table.integer('pg_id').unsigned().notNullable()
        .references('id').inTable('pgs')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');

      table.string('room_number', 50).notNullable();
      table.string('bed_number', 50).notNullable();
      table.decimal('monthly_rent', 10, 2).notNullable();
      table.decimal('security_deposit', 10, 2).defaultTo(0.00);

      table.date('check_in_date').notNullable();
      table.date('check_out_date').nullable();
      table.enum('status', ['active', 'completed', 'cancelled']).notNullable().defaultTo('active');
      table.text('notes').nullable();

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      // Indexes for fast history & active stays lookups
      table.index('resident_id', 'idx_stays_resident_id');
      table.index('pg_id', 'idx_stays_pg_id');
      table.index('status', 'idx_stays_status');
      table.index(['resident_id', 'status'], 'idx_stays_resident_status');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTableIfExists('resident_pg_stays');
  await knex.schema.dropTableIfExists('pgs');
};

