import { body, param, query } from 'express-validator';
import db from '../config/db.js';
import ROLES, { ALL_STAFF_ROLES, STAFF_ROLES } from '../constants/roles.js';

export const STAFF_STATUSES = ['active', 'on_leave', 'inactive'];
export const ALLOWED_STATUSES = ['active', 'pending', 'inactive', 'on_leave'];
export const ALLOWED_GENDERS = ['male', 'female', 'other'];
export const ALLOWED_ROLES = [ROLES.RESIDENT, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.STAFF];

/**
 * Normalizes an Indian phone number to 10 digits
 */
export const normalizePhone = (phone) => {
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
 * Helper to identify Resident role for conditional validation
 */
const isResident = (req) => req.user?.role === ROLES.RESIDENT;

/**
 * Helper to check whether an optional field was actually provided with non-empty content
 */
const hasContent = (val) => val !== undefined && val !== null && String(val).trim().length > 0;

/**
 * Validator for User ID in URL parameter (Reused across user & staff routes)
 */
export const userIdParamValidator = [
  param('id')
    .notEmpty()
    .withMessage('User ID parameter is required')
    .isInt({ min: 1 })
    .withMessage('User ID must be a valid integer'),
];

/**
 * Reusable Room Allocation Validators (Shared between createUser & updateUser)
 */
export const roomAllocationValidators = [
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
 * Validator for creating a user (Resident, Admin, Super Admin)
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

  body('password')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),

  ...roomAllocationValidators,
];

/**
 * Validator for updating a user by ID
 */
export const updateUserValidator = [
  ...userIdParamValidator,

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

  ...roomAllocationValidators,
];

/**
 * Validator for updating user profile.
 * - Resident role: Requires all personal, address, document, and agreement fields.
 * - Admin/Other roles: All fields optional, validating format only if provided.
 */
export const updateProfileValidator = [
  // Section 1: Personal Details
  body('name')
    .if((val, { req }) => isResident(req) || hasContent(val))
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),

  body('date_of_birth')
    .if((val, { req }) => isResident(req) || hasContent(val))
    .notEmpty()
    .withMessage('Date of birth is required')
    .isISO8601()
    .withMessage('Date of birth must be a valid date in YYYY-MM-DD format'),

  body('gender')
    .if((val, { req }) => isResident(req) || hasContent(val))
    .trim()
    .notEmpty()
    .withMessage('Gender is required')
    .toLowerCase()
    .isIn(ALLOWED_GENDERS)
    .withMessage(`Gender must be one of: ${ALLOWED_GENDERS.join(', ')}`),

  body('phone')
    .if((val, { req }) => isResident(req) || hasContent(val))
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^(\+91[\-\s]?)?[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit mobile number')
    .customSanitizer(normalizePhone),

  body('email')
    .if((val, { req }) => isResident(req) || hasContent(val))
    .trim()
    .notEmpty()
    .withMessage('Email address is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  // Section 2: Address & Emergency Contact
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
    .optional({ checkFalsy: true })
    .trim(),

  body('city')
    .if((val, { req }) => isResident(req) || hasContent(val))
    .trim()
    .notEmpty()
    .withMessage('City is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('City must be between 2 and 100 characters'),

  body('state')
    .if((val, { req }) => isResident(req) || hasContent(val))
    .trim()
    .notEmpty()
    .withMessage('State is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('State must be between 2 and 100 characters'),

  body('pincode')
    .if((val, { req }) => isResident(req) || hasContent(val))
    .trim()
    .notEmpty()
    .withMessage('Pincode is required')
    .matches(/^[1-9][0-9]{5}$/)
    .withMessage('Please provide a valid 6-digit Indian PIN code'),

  body('emergency_contact_name')
    .if((val, { req }) => isResident(req) || hasContent(val))
    .trim()
    .notEmpty()
    .withMessage('Emergency contact name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Emergency contact name must be between 2 and 100 characters'),

  body('emergency_contact_relationship')
    .if((val, { req }) => isResident(req) || hasContent(val))
    .trim()
    .notEmpty()
    .withMessage('Emergency contact relationship is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Relationship must be between 2 and 50 characters'),

  body('emergency_contact_phone')
    .if((val, { req }) => isResident(req) || hasContent(val))
    .trim()
    .notEmpty()
    .withMessage('Emergency contact phone number is required')
    .matches(/^(\+91[\-\s]?)?[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit mobile number for emergency contact')
    .customSanitizer(normalizePhone),

  // Section 3: Document Upload (Required for Resident Onboarding)
  body('aadhar_card')
    .if((val, { req }) => isResident(req))
    .custom((val, { req }) => {
      const doc = val || req.files?.aadhar_card?.[0]?.filename || req.user?.aadhar_card;
      if (!doc) {
        throw new Error('Aadhar card document is required');
      }
      return true;
    }),

  body('profile_photo')
    .if((val, { req }) => isResident(req))
    .custom((val, { req }) => {
      const photo = val || req.files?.profile_photo?.[0]?.filename || req.files?.passport_photo?.[0]?.filename || req.user?.profile_photo;
      if (!photo) {
        throw new Error('Passport size photo is required');
      }
      return true;
    }),

  body('address_proof')
    .if((val, { req }) => isResident(req))
    .custom((val, { req }) => {
      const doc = val || req.files?.address_proof?.[0]?.filename || req.user?.address_proof;
      if (!doc) {
        throw new Error('Address proof document is required');
      }
      return true;
    }),

  body('passport_photo')
    .optional({ checkFalsy: true }),

  body('education_certificate')
    .optional({ checkFalsy: true }),

  // Section 4: Agreement & Signature
  body('terms_accepted')
    .if((val, { req }) => isResident(req))
    .custom((val) => val === true || val === 'true' || val === 1 || val === '1')
    .withMessage('You must agree to the terms and conditions of HouseNest PG'),

  body('signature')
    .if((val, { req }) => isResident(req))
    .custom((val, { req }) => {
      const sig = val || req.files?.signature?.[0]?.filename || req.user?.signature;
      if (!sig) {
        throw new Error('Digital signature is required');
      }
      return true;
    }),

  // Optional profile attributes
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
 * Normalizes branch IDs from single value, array, or comma-separated string
 */
export const normalizeBranchIds = (value, { req }) => {
  let raw = req.body.branch_ids !== undefined ? req.body.branch_ids : req.body.branch_id;

  if (raw === undefined || raw === null || raw === '') {
    throw new Error('At least one branch must be assigned to staff');
  }

  let branchIds = [];
  if (Array.isArray(raw)) {
    branchIds = raw.map((v) => Number(v));
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        branchIds = parsed.map((v) => Number(v));
      } else {
        branchIds = [Number(parsed)];
      }
    } catch {
      branchIds = raw
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n));
    }
  } else if (typeof raw === 'number') {
    branchIds = [raw];
  }

  if (!branchIds.length || branchIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error('Branch IDs must be valid positive integers');
  }

  req.body.branch_ids = [...new Set(branchIds)];
  return true;
};

/**
 * Validator for creating staff under User module
 */
export const createStaffValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Staff name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Staff name must be between 2 and 100 characters'),

  body('staff_role')
    .custom((val, { req }) => {
      const roleVal = val || req.body.role;
      if (!roleVal || typeof roleVal !== 'string') {
        throw new Error('Staff role is required (one of: KITCHEN_STAFF, HOUSEKEEPING, SECURITY_GUARD, ACCOUNTANT, BRANCH_MANAGER, WARDEN, MAINTENANCE)');
      }
      return true;
    }),

  body().custom(normalizeBranchIds),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email address is required')
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail(),

  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^[+]?[\d\s\-]{8,20}$/)
    .withMessage('Please enter a valid phone number (8-20 digits)'),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(STAFF_STATUSES)
    .withMessage(`Status must be one of: ${STAFF_STATUSES.join(', ')}`),
];

/**
 * Validator for updating staff under User module
 */
export const updateStaffValidator = [
  ...userIdParamValidator,

  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Staff name must be between 2 and 100 characters'),

  body().custom((val, { req }) => {
    if (req.body.branch_ids !== undefined || req.body.branch_id !== undefined) {
      return normalizeBranchIds(val, { req });
    }
    return true;
  }),

  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail(),

  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[+]?[\d\s\-]{8,20}$/)
    .withMessage('Please enter a valid phone number (8-20 digits)'),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(STAFF_STATUSES)
    .withMessage(`Status must be one of: ${STAFF_STATUSES.join(', ')}`),
];

/**
 * Validator for updating staff status
 */
export const updateStaffStatusValidator = [
  ...userIdParamValidator,

  body('status')
    .trim()
    .notEmpty()
    .withMessage('Status is required')
    .toLowerCase()
    .isIn(STAFF_STATUSES)
    .withMessage(`Status must be one of: ${STAFF_STATUSES.join(', ')}`),
];

/**
 * Shared branch_id query parameter validator
 */
export const branchIdQueryValidator = query('branch_id')
  .optional({ checkFalsy: true })
  .customSanitizer((val) => {
    if (val === 'all' || val === '' || val === undefined || val === null) {
      return undefined;
    }
    return val;
  })
  .optional()
  .toInt()
  .isInt({ min: 1 })
  .withMessage('Branch ID must be a positive integer');

/**
 * Validator for listing staff members and directory query parameters
 */
export const listStaffQueryValidator = [
  branchIdQueryValidator,

  query('staff_role')
    .optional({ checkFalsy: true })
    .trim(),

  query('role')
    .optional({ checkFalsy: true })
    .trim(),

  query('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .custom((val) => {
      if (val === 'all' || val === '' || val === undefined) return true;
      if (!STAFF_STATUSES.includes(val)) {
        throw new Error('Status filter must be all, active, on_leave, or inactive');
      }
      return true;
    }),

  query('search')
    .optional({ checkFalsy: true })
    .trim(),

  query('page')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];

/**
 * Validator for staff stats query params
 */
export const staffStatsQueryValidator = [
  branchIdQueryValidator,
];

/**
 * Shared alias for staff directory query validator
 */
export const staffDirectoryQueryValidator = listStaffQueryValidator;

export default {
  createUserValidator,
  updateUserValidator,
  updateProfileValidator,
  userIdParamValidator,
  roomAllocationValidators,
  normalizePhone,
  normalizeBranchIds,
  createStaffValidator,
  updateStaffValidator,
  updateStaffStatusValidator,
  branchIdQueryValidator,
  listStaffQueryValidator,
  staffStatsQueryValidator,
  staffDirectoryQueryValidator,
  STAFF_STATUSES,
  ALLOWED_STATUSES,
  ALLOWED_GENDERS,
  ALLOWED_ROLES,
};
