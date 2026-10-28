/**
 * Migration: Remove unwanted columns from 'users' table
 * Retains only core user attributes:
 * - id, name, email, password, phone, gender, address, role, is_active, created_at, updated_at
 *
 * All PG property details are stored in 'pgs'.
 * All room/bed allocations & rent history are stored in 'resident_pg_stays'.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  const unwantedColumns = [
    'date_of_birth',
    'address_line1',
    'city',
    'state',
    'pincode',
    'emergency_contact_name',
    'emergency_contact_relation',
    'emergency_contact_phone',
    'aadhar_card',
    'passport_photo',
    'address_proof',
    'education_certificate',
    'property_name',
    'room_number',
    'bed_number',
    'monthly_rent',
    'agreed_to_terms',
    'digital_signature',
  ];

  const columnsToDrop = [];
  for (const col of unwantedColumns) {
    const exists = await knex.schema.hasColumn('users', col);
    if (exists) {
      columnsToDrop.push(col);
    }
  }

  if (columnsToDrop.length > 0) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumns(columnsToDrop);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.alterTable('users', (table) => {
    table.date('date_of_birth').nullable();
    table.string('address_line1', 255).nullable();
    table.string('city', 100).nullable();
    table.string('state', 100).nullable();
    table.string('pincode', 10).nullable();
    table.string('emergency_contact_name', 100).nullable();
    table.string('emergency_contact_relation', 50).nullable();
    table.string('emergency_contact_phone', 20).nullable();
    table.string('aadhar_card', 500).nullable();
    table.string('passport_photo', 500).nullable();
    table.string('address_proof', 500).nullable();
    table.string('education_certificate', 500).nullable();
    table.string('property_name', 150).nullable();
    table.string('room_number', 50).nullable();
    table.string('bed_number', 50).nullable();
    table.decimal('monthly_rent', 10, 2).nullable();
    table.boolean('agreed_to_terms').defaultTo(false);
    table.text('digital_signature', 'longtext').nullable();
  });
};

