/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.alterTable('users', (table) => {
    // 1. Personal Details
    table.date('date_of_birth').nullable();
    table.enum('gender', ['male', 'female', 'other']).nullable();
    table.string('phone', 20).nullable();

    // 2. Current Address
    table.string('address_line1', 255).nullable();
    table.string('city', 100).nullable();
    table.string('state', 100).nullable();
    table.string('pincode', 10).nullable();

    // 2. Emergency Contact
    table.string('emergency_contact_name', 100).nullable();
    table.string('emergency_contact_relation', 50).nullable();
    table.string('emergency_contact_phone', 20).nullable();

    // 3. Document Uploads (URLs / storage paths)
    table.string('aadhar_card', 500).nullable();
    table.string('passport_photo', 500).nullable();
    table.string('address_proof', 500).nullable();
    table.string('education_certificate', 500).nullable();

    // 4. Room & Bed Allocation Details
    table.string('property_name', 150).nullable();
    table.string('room_number', 50).nullable();
    table.string('bed_number', 50).nullable();
    table.decimal('monthly_rent', 10, 2).nullable();

    // 5. Agreement & Digital Signature
    table.boolean('agreed_to_terms').defaultTo(false);
    table.text('digital_signature', 'longtext').nullable();

    // Additional indexing
    table.index('phone', 'idx_users_phone');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex('phone', 'idx_users_phone');
    table.dropColumns([
      'date_of_birth',
      'gender',
      'phone',
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
      'digital_signature'
    ]);
  });
};

