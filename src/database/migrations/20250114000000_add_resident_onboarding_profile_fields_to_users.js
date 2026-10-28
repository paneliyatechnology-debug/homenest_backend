/**
 * Migration: Add resident onboarding profile fields to users table
 * Matches the Resident Onboarding Mobile UI:
 * 1. Current Address (address_line_1, city, state, pincode)
 * 2. Emergency Contact (emergency_contact_name, emergency_contact_relationship, emergency_contact_phone)
 * 3. Document Uploads (aadhar_card, address_proof, education_certificate)
 * 4. Agreement & Signature (terms_accepted, terms_accepted_at, signature)
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  const hasTable = await knex.schema.hasTable('users');
  if (!hasTable) return;

  const hasAddressLine1 = await knex.schema.hasColumn('users', 'address_line_1');
  const hasCity = await knex.schema.hasColumn('users', 'city');
  const hasState = await knex.schema.hasColumn('users', 'state');
  const hasPincode = await knex.schema.hasColumn('users', 'pincode');

  const hasEmergencyName = await knex.schema.hasColumn('users', 'emergency_contact_name');
  const hasEmergencyRel = await knex.schema.hasColumn('users', 'emergency_contact_relationship');
  const hasEmergencyPhone = await knex.schema.hasColumn('users', 'emergency_contact_phone');

  const hasAadhar = await knex.schema.hasColumn('users', 'aadhar_card');
  const hasAddressProof = await knex.schema.hasColumn('users', 'address_proof');
  const hasEducationCert = await knex.schema.hasColumn('users', 'education_certificate');

  const hasTerms = await knex.schema.hasColumn('users', 'terms_accepted');
  const hasTermsAt = await knex.schema.hasColumn('users', 'terms_accepted_at');
  const hasSignature = await knex.schema.hasColumn('users', 'signature');

  await knex.schema.alterTable('users', (table) => {
    if (!hasAddressLine1) table.string('address_line_1', 255).nullable().after('address');
    if (!hasCity) table.string('city', 100).nullable().after('address');
    if (!hasState) table.string('state', 100).nullable().after('city');
    if (!hasPincode) table.string('pincode', 20).nullable().after('state');

    if (!hasEmergencyName) table.string('emergency_contact_name', 100).nullable().after('pincode');
    if (!hasEmergencyRel) table.string('emergency_contact_relationship', 50).nullable().after('emergency_contact_name');
    if (!hasEmergencyPhone) table.string('emergency_contact_phone', 20).nullable().after('emergency_contact_relationship');

    if (!hasAadhar) table.string('aadhar_card', 255).nullable().after('profile_photo');
    if (!hasAddressProof) table.string('address_proof', 255).nullable().after('aadhar_card');
    if (!hasEducationCert) table.string('education_certificate', 255).nullable().after('address_proof');

    if (!hasTerms) table.boolean('terms_accepted').defaultTo(false).notNullable().after('education_certificate');
    if (!hasTermsAt) table.timestamp('terms_accepted_at').nullable().after('terms_accepted');
    if (!hasSignature) table.text('signature').nullable().after('terms_accepted_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  const hasTable = await knex.schema.hasTable('users');
  if (!hasTable) return;

  await knex.schema.alterTable('users', (table) => {
    table.dropColumns([
      'address_line_1',
      'city',
      'state',
      'pincode',
      'emergency_contact_name',
      'emergency_contact_relationship',
      'emergency_contact_phone',
      'aadhar_card',
      'address_proof',
      'education_certificate',
      'terms_accepted',
      'terms_accepted_at',
      'signature',
    ]);
  });
};

