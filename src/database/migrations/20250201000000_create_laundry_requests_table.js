/**
 * Migration: Create Laundry Requests Table
 * Supports Laundry Requests for both Resident Mobile App and Admin Portal.
 */
export const up = async (knex) => {
  await knex.schema.createTable('laundry_requests', (table) => {
    table.increments('id').primary();
    table.string('request_number', 50).notNullable().unique();
    table.integer('pg_id').unsigned().notNullable();
    table.integer('branch_id').unsigned().notNullable();
    table.integer('resident_id').unsigned().notNullable();
    table.integer('room_id').unsigned().nullable();
    table.string('request_type', 50).notNullable().defaultTo('Laundry'); // Laundry, Room Cleaning, Maintenance, Other
    table.string('service_subtype', 100).nullable(); // Wash & Fold, Dry Cleaning, Washing & Dry Cleaning, Only Washing
    table.json('items').nullable(); // [{ name: 'Shirt', rate: 20, quantity: 2, total: 40 }]
    table.integer('total_items_count').unsigned().notNullable().defaultTo(0);
    table.decimal('total_amount', 10, 2).notNullable().defaultTo(0.00);
    table.date('pickup_date').notNullable();
    table.string('pickup_time', 50).nullable(); // '09:00 AM - 11:00 AM'
    table.text('special_instructions').nullable();
    table.enu('status', ['pending', 'in_progress', 'completed', 'cancelled']).notNullable().defaultTo('pending');
    table.integer('assigned_to').unsigned().nullable(); // Staff member user ID
    table.text('admin_notes').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();

    // Foreign Keys
    table.foreign('pg_id').references('id').inTable('pgs').onDelete('CASCADE');
    table.foreign('branch_id').references('id').inTable('branches').onDelete('CASCADE');
    table.foreign('resident_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('room_id').references('id').inTable('rooms').onDelete('SET NULL');
    table.foreign('assigned_to').references('id').inTable('users').onDelete('SET NULL');

    // Indexes
    table.index(['branch_id', 'status']);
    table.index(['resident_id']);
    table.index(['assigned_to']);
    table.index(['request_type']);
    table.index(['deleted_at']);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('laundry_requests');
};

