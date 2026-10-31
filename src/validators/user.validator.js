import { body, param } from 'express-validator';
import db from '../config/db.js';
import ROLES from '../constants/roles.js';

const ALLOWED_STATUSES = ['active', 'pending', 'inactive'];
const ALLOWED_GENDERS = ['male', 'female', 'other'];
const ALLOWED_ROLES = [ROLES.RESIDENT, ROLES.ADMIN, ROLES.SUPER_ADMIN];

/**
 * Normalizes an Indian phone number to 10 digits
 */
const normalizePhone = (phone) => {
  if (!phone) return '';
  const cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return cleaned.slice(2);
  }
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return cleaned.slice(1);
  }
  return cleaned;
};

/**
 * Validator for creating a user (Resident, Admin, Super Admin)
 * Supports FormData / JSON with optional profile photo.
 */
export const createUserValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('E-mail is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^(\+91[\-\s]?)?[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit mobile number')
    .customSanitizer(normalizePhone),

  body('gender')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_GENDERS)
    .withMessage(`Gender must be one of: ${ALLOWED_GENDERS.join(', ')}`),

  body('role')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_ROLES)
    .withMessage(`Role must be one of: ${ALLOWED_ROLES.join(', ')}`),

  body('date_of_birth')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Date of birth must be a valid date in YYYY-MM-DD format'),

  body('nationality')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Nationality cannot exceed 50 characters'),

  body('marital_status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isLength({ max: 50 })
    .withMessage('Marital status cannot exceed 50 characters'),

  body('occupation')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Occupation cannot exceed 100 characters'),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}`),

  body('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('PG ID must be a valid integer')
    .custom(async (pg_id) => {
      const pg = await db('pgs').where({ id: pg_id }).whereNull('deleted_at').first();
      if (!pg) {
        throw new Error('PG facility not found');
      }
      return true;
    }),

  body('room_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Room ID must be a valid integer')
    .custom(async (room_id, { req }) => {
      const room = await db('rooms').where({ id: room_id }).whereNull('deleted_at').first();
      if (!room) {
        throw new Error('Room not found');
      }
      const targetPgId = req.body?.pg_id ? Number(req.body.pg_id) : (req.pg_id ? Number(req.pg_id) : null);
      if (targetPgId && Number(room.pg_id) !== targetPgId) {
        throw new Error('Selected room does not belong to the specified PG facility');
      }
      return true;
    }),

  body('room_no')
    .optional({ checkFalsy: true })
    .trim()
    .custom(async (room_no, { req }) => {
      if (req.body?.room_id) return true;
      const targetPgId = req.body?.pg_id ? Number(req.body.pg_id) : (req.pg_id ? Number(req.pg_id) : null);
      if (targetPgId && room_no) {
        const room = await db('rooms').where({ pg_id: targetPgId, room_no }).whereNull('deleted_at').first();
        if (!room) {
          throw new Error(`Room '${room_no}' not found for the specified PG facility`);
        }
      }
      return true;
    }),

  body('check_in_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Check in date must be a valid date in YYYY-MM-DD format'),

  body('check_out_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Check out date must be a valid date in YYYY-MM-DD format'),

  body('password')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),

  body('bed_number')
    .optional({ checkFalsy: true })
    .trim(),

  body('monthly_rent')
    .optional({ checkFalsy: true })
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('Monthly rent must be a non-negative number'),

  body('maintenance_amount')
    .optional({ checkFalsy: true })
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('Maintenance amount must be a non-negative number'),

  body('security_deposit')
    .optional({ checkFalsy: true })
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('Security deposit must be a non-negative number'),
];

/**
 * Validator for updating a user by ID
 */
export const updateUserValidator = [
  param('id')
    .notEmpty()
    .withMessage('User ID parameter is required')
    .isInt({ min: 1 })
    .withMessage('User ID must be a valid integer'),

  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),

  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^(\+91[\-\s]?)?[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit mobile number')
    .customSanitizer(normalizePhone),

  body('gender')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_GENDERS)
    .withMessage(`Gender must be one of: ${ALLOWED_GENDERS.join(', ')}`),

  body('role')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_ROLES)
    .withMessage(`Role must be one of: ${ALLOWED_ROLES.join(', ')}`),

  body('date_of_birth')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Date of birth must be a valid date in YYYY-MM-DD format'),

  body('nationality')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Nationality cannot exceed 50 characters'),

  body('marital_status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isLength({ max: 50 })
    .withMessage('Marital status cannot exceed 50 characters'),

  body('occupation')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Occupation cannot exceed 100 characters'),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}`),

  body('address')
    .optional({ checkFalsy: true })
    .trim(),

  body('address_line_1')
    .optional({ checkFalsy: true })
    .trim(),

  body('city')
    .optional({ checkFalsy: true })
    .trim(),

  body('state')
    .optional({ checkFalsy: true })
    .trim(),

  body('pincode')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[1-9][0-9]{5}$/)
    .withMessage('Please provide a valid 6-digit Indian PIN code'),

  body('emergency_contact_name')
    .optional({ checkFalsy: true })
    .trim(),

  body('emergency_contact_relationship')
    .optional({ checkFalsy: true })
    .trim(),

  body('emergency_contact_phone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^(\+91[\-\s]?)?[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit emergency contact phone number')
    .customSanitizer(normalizePhone),

  body('aadhar_card')
    .optional({ checkFalsy: true }),

  body('address_proof')
    .optional({ checkFalsy: true }),

  body('education_certificate')
    .optional({ checkFalsy: true }),

  body('profile_photo')
    .optional({ checkFalsy: true }),

  body('passport_photo')
    .optional({ checkFalsy: true }),

  body('terms_accepted')
    .optional({ checkFalsy: true }),

  body('signature')
    .optional({ checkFalsy: true }),

  body('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('PG ID must be a valid integer')
    .custom(async (pg_id) => {
      const pg = await db('pgs').where({ id: pg_id }).whereNull('deleted_at').first();
      if (!pg) {
        throw new Error('PG facility not found');
      }
      return true;
    }),

  body('room_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Room ID must be a valid integer')
    .custom(async (room_id, { req }) => {
      const room = await db('rooms').where({ id: room_id }).whereNull('deleted_at').first();
      if (!room) {
        throw new Error('Room not found');
      }
      const targetPgId = req.body?.pg_id ? Number(req.body.pg_id) : (req.pg_id ? Number(req.pg_id) : null);
      if (targetPgId && Number(room.pg_id) !== targetPgId) {
        throw new Error('Selected room does not belong to the specified PG facility');
      }
      return true;
    }),

  body('bed_number')
    .optional({ checkFalsy: true })
    .trim(),

  body('monthly_rent')
    .optional({ checkFalsy: true })
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('Monthly rent must be a non-negative number'),

  body('security_deposit')
    .optional({ checkFalsy: true })
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('Security deposit must be a non-negative number'),

  body('check_in_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Check in date must be a valid date in YYYY-MM-DD format'),

  body('check_out_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Check out date must be a valid date in YYYY-MM-DD format'),
];

/**
 * Helper to identify Resident role for conditional validation
 */
const isResident = (req) => req.user?.role === ROLES.RESIDENT;

/**
 * Validator for updating user profile.
 * Dynamically adapts validation based on the authenticated user's role:
 * - RESIDENT: Validates all required onboarding fields together according to the UI
 *   (Personal Details, Address & Emergency Contact, Documents, Agreement & Signature).
 * - ADMIN / SUPER_ADMIN: All fields remain optional, preserving existing general profile update behavior.
 */
export const updateProfileValidator = [
  // ==========================================
  // Screen 1: Personal Details
  // ==========================================
  body('name')
    .if((val, { req }) => isResident(req))
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),

  body('name')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),

  body('date_of_birth')
    .if((val, { req }) => isResident(req))
    .notEmpty()
    .withMessage('Date of birth is required')
    .isISO8601()
    .withMessage('Date of birth must be a valid date in YYYY-MM-DD format'),

  body('date_of_birth')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Date of birth must be a valid date in YYYY-MM-DD format'),

  body('gender')
    .if((val, { req }) => isResident(req))
    .trim()
    .notEmpty()
    .withMessage('Gender is required')
    .toLowerCase()
    .isIn(ALLOWED_GENDERS)
    .withMessage(`Gender must be one of: ${ALLOWED_GENDERS.join(', ')}`),

  body('gender')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_GENDERS)
    .withMessage(`Gender must be one of: ${ALLOWED_GENDERS.join(', ')}`),

  body('phone')
    .if((val, { req }) => isResident(req))
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^(\+91[\-\s]?)?[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit mobile number')
    .customSanitizer(normalizePhone),

  body('phone')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^(\+91[\-\s]?)?[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit mobile number')
    .customSanitizer(normalizePhone),

  body('email')
    .if((val, { req }) => isResident(req))
    .trim()
    .notEmpty()
    .withMessage('Email address is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('email')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  // ==========================================
  // Screen 2: Address and Emergency Contact
  // ==========================================
  body('address_line_1')
    .if((val, { req }) => isResident(req))
    .custom((val, { req }) => {
      const addr = val || req.body?.address;
      if (!addr || !String(addr).trim()) {
        throw new Error('Address Line 1 is required');
      }
      return true;
    }),

  body('address')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true })
    .trim(),

  body('address_line_1')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true })
    .trim(),

  body('city')
    .if((val, { req }) => isResident(req))
    .trim()
    .notEmpty()
    .withMessage('City is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('City must be between 2 and 100 characters'),

  body('city')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true })
    .trim(),

  body('state')
    .if((val, { req }) => isResident(req))
    .trim()
    .notEmpty()
    .withMessage('State is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('State must be between 2 and 100 characters'),

  body('state')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true })
    .trim(),

  body('pincode')
    .if((val, { req }) => isResident(req))
    .trim()
    .notEmpty()
    .withMessage('Pincode is required')
    .matches(/^[1-9][0-9]{5}$/)
    .withMessage('Please provide a valid 6-digit Indian PIN code'),

  body('pincode')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true })
    .trim(),

  body('emergency_contact_name')
    .if((val, { req }) => isResident(req))
    .trim()
    .notEmpty()
    .withMessage('Emergency contact name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Emergency contact name must be between 2 and 100 characters'),

  body('emergency_contact_name')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true })
    .trim(),

  body('emergency_contact_relationship')
    .if((val, { req }) => isResident(req))
    .trim()
    .notEmpty()
    .withMessage('Emergency contact relationship is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Relationship must be between 2 and 50 characters'),

  body('emergency_contact_relationship')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true })
    .trim(),

  body('emergency_contact_phone')
    .if((val, { req }) => isResident(req))
    .trim()
    .notEmpty()
    .withMessage('Emergency contact phone number is required')
    .matches(/^(\+91[\-\s]?)?[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit mobile number for emergency contact')
    .customSanitizer(normalizePhone),

  body('emergency_contact_phone')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true })
    .trim(),

  // ==========================================
  // Screen 3: Document Upload
  // ==========================================
  body('aadhar_card')
    .if((val, { req }) => isResident(req))
    .custom((val, { req }) => {
      const doc = val || req.files?.aadhar_card?.[0]?.filename || req.user?.aadhar_card;
      if (!doc) {
        throw new Error('Aadhar card document is required');
      }
      return true;
    }),

  body('aadhar_card')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true }),

  body('profile_photo')
    .if((val, { req }) => isResident(req))
    .custom((val, { req }) => {
      const photo = val || req.files?.profile_photo?.[0]?.filename || req.files?.passport_photo?.[0]?.filename || req.user?.profile_photo;
      if (!photo) {
        throw new Error('Passport size photo is required');
      }
      return true;
    }),

  body('profile_photo')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true }),

  body('passport_photo')
    .optional({ checkFalsy: true }),

  body('address_proof')
    .if((val, { req }) => isResident(req))
    .custom((val, { req }) => {
      const doc = val || req.files?.address_proof?.[0]?.filename || req.user?.address_proof;
      if (!doc) {
        throw new Error('Address proof document is required');
      }
      return true;
    }),

  body('address_proof')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true }),

  body('education_certificate')
    .optional({ checkFalsy: true }),

  // ==========================================
  // Screen 4 / 5 of 6: Agreement & Signature
  // ==========================================
  body('terms_accepted')
    .if((val, { req }) => isResident(req))
    .custom((val) => val === true || val === 'true' || val === 1 || val === '1')
    .withMessage('You must agree to the terms and conditions of HouseNest PG'),

  body('terms_accepted')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true }),

  body('signature')
    .if((val, { req }) => isResident(req))
    .custom((val, { req }) => {
      const sig = val || req.files?.signature?.[0]?.filename || req.user?.signature;
      if (!sig) {
        throw new Error('Digital signature is required');
      }
      return true;
    }),

  body('signature')
    .if((val, { req }) => !isResident(req))
    .optional({ checkFalsy: true }),

  // ==========================================
  // Additional profile fields (Optional for all)
  // ==========================================
  body('nationality')
    .optional({ checkFalsy: true })
    .trim(),

  body('marital_status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase(),

  body('occupation')
    .optional({ checkFalsy: true })
    .trim(),
];

/**
 * Validator for User ID in URL parameter
 */
export const userIdParamValidator = [
  param('id')
    .notEmpty()
    .withMessage('User ID parameter is required')
    .isInt({ min: 1 })
    .withMessage('User ID must be a valid integer'),
];

export default {
  createUserValidator,
  updateUserValidator,
  updateProfileValidator,
  userIdParamValidator,
};

