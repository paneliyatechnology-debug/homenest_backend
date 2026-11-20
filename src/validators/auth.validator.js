import { body } from 'express-validator';
import userService from '../services/user.service.js';
import { normalizePhone } from '../utils/phone.js';

/**
 * Validator for Dedicated PG Owner + Initial PG Registration Flow
 * Directly validates flat owner and PG facility fields
 */
export const registerOwnerWithPgValidator = [
  // Owner Personal Details
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Owner name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Owner name must be between 2 and 100 characters'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Owner email is required')
    .isEmail()
    .withMessage('Please provide a valid owner email address')
    .normalizeEmail()
    .custom(async (email) => {
      const existing_user = await userService.findByEmail(email);
      if (existing_user) {
        throw new Error('Owner email address is already registered');
      }
      return true;
    }),

  body('password')
    .optional({ checkFalsy: true })
    .isLength({ min: 6 })
    .withMessage('Owner password must be at least 6 characters long if provided'),

  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Owner phone number is required')
    .matches(/^(\+91[\-\s]?)?[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit owner phone number')
    .customSanitizer(normalizePhone)
    .custom(async (phone) => {
      const existing_phone = await userService.findByPhone(phone);
      if (existing_phone) {
        throw new Error('Owner phone number is already registered with another account');
      }
      return true;
    }),

  body('gender')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be one of: male, female, other'),

  body('address')
    .optional()
    .trim(),

  // PG Facility Details
  body('pg_name')
    .trim()
    .notEmpty()
    .withMessage('PG name is required')
    .isLength({ min: 2, max: 150 })
    .withMessage('PG name must be between 2 and 150 characters'),

  body('pg_type')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(['boys', 'girls', 'coed', 'other'])
    .withMessage('PG type must be one of: boys, girls, coed, other'),

  body('pg_phone')
    .optional()
    .trim()
    .matches(/^(\+91[\-\s]?)?[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit PG contact phone number'),

  body('pg_address')
    .trim()
    .notEmpty()
    .withMessage('PG address is required')
    .isLength({ min: 3 })
    .withMessage('PG address must be at least 3 characters long'),

  body('pg_city')
    .trim()
    .notEmpty()
    .withMessage('PG city is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('PG city must be between 2 and 100 characters'),

  body('pg_state')
    .trim()
    .notEmpty()
    .withMessage('PG state is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('PG state must be between 2 and 100 characters'),

  body('pg_pincode')
    .trim()
    .notEmpty()
    .withMessage('PG pincode is required')
    .matches(/^[1-9][0-9]{5}$/)
    .withMessage('Please provide a valid 6-digit Indian PIN code for PG'),

  body('total_rooms')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 0 })
    .withMessage('Total rooms must be a non-negative integer'),

  body('total_beds')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 0 })
    .withMessage('Total beds must be a non-negative integer'),

  body('amenities')
    .optional(),

  body('rules')
    .optional()
    .trim(),

  body('profile_photo')
    .optional()
    .trim(),

  body('logo')
    .optional()
    .trim(),

  // PG UPI & Banking Details (Optional at registration, recommended for checkout)
  body('pg_upi_id')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('PG UPI ID must be between 3 and 100 characters'),

  body('pg_bank_name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('PG bank name must be between 2 and 100 characters'),

  body('pg_account_number')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 6, max: 50 })
    .withMessage('PG bank account number must be between 6 and 50 characters'),

  body('pg_ifsc_code')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 4, max: 20 })
    .withMessage('PG IFSC code must be between 4 and 20 characters'),

  body('pg_account_holder_name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('PG account holder name must be between 2 and 150 characters'),
];

/**
 * Validator for Updating PG Facility & Owner details
 * All fields are optional to support partial updates
 */
export const updateOwnerWithPgValidator = [
  // Owner Personal Details (Optional)
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Owner name must be between 2 and 100 characters'),

  body('owner_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Owner name must be between 2 and 100 characters'),

  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Please provide a valid owner email address')
    .normalizeEmail(),

  body('owner_email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Please provide a valid owner email address')
    .normalizeEmail(),

  body('phone')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.phone = null;
        return true;
      }
      return /^(\+91[\-\s]?)?[6-9]\d{9}$/.test(val);
    })
    .withMessage('Please provide a valid 10-digit owner phone number')
    .customSanitizer(normalizePhone),

  body('owner_phone')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.owner_phone = null;
        return true;
      }
      return /^(\+91[\-\s]?)?[6-9]\d{9}$/.test(val);
    })
    .withMessage('Please provide a valid 10-digit owner phone number')
    .customSanitizer(normalizePhone),

  body('gender')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.gender = null;
        return true;
      }
      return ['male', 'female', 'other'].includes(String(val).toLowerCase());
    })
    .withMessage('Gender must be one of: male, female, other'),

  body('address')
    .optional({ checkFalsy: true, nullable: true }),

  body('owner_address')
    .optional({ checkFalsy: true, nullable: true }),

  // PG Facility Details (Optional)
  body('pg_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('PG name must be between 2 and 150 characters'),

  body('pg_type')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.pg_type = null;
        return true;
      }
      return ['boys', 'girls', 'coed', 'other'].includes(String(val).toLowerCase());
    })
    .withMessage('PG type must be one of: boys, girls, coed, other'),

  body('type')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.type = null;
        return true;
      }
      return ['boys', 'girls', 'coed', 'other'].includes(String(val).toLowerCase());
    })
    .withMessage('PG type must be one of: boys, girls, coed, other'),

  body('pg_phone')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.pg_phone = null;
        return true;
      }
      return /^(\+91[\-\s]?)?[6-9]\d{9}$/.test(val);
    })
    .withMessage('Please provide a valid 10-digit PG contact phone number'),

  body('pg_address')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.pg_address = null;
        return true;
      }
      return String(val).trim().length >= 3;
    })
    .withMessage('PG address must be at least 3 characters long'),

  body('pg_city')
    .optional({ checkFalsy: true, nullable: true }),

  body('city')
    .optional({ checkFalsy: true, nullable: true }),

  body('pg_state')
    .optional({ checkFalsy: true, nullable: true }),

  body('state')
    .optional({ checkFalsy: true, nullable: true }),

  body('pg_pincode')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.pg_pincode = null;
        return true;
      }
      return /^[1-9][0-9]{5}$/.test(val);
    })
    .withMessage('Please provide a valid 6-digit Indian PIN code for PG'),

  body('pincode')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.pincode = null;
        return true;
      }
      return /^[1-9][0-9]{5}$/.test(val);
    })
    .withMessage('Please provide a valid 6-digit Indian PIN code for PG'),

  body('total_rooms')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.total_rooms = null;
        return true;
      }
      const num = Number(val);
      return Number.isInteger(num) && num >= 0;
    })
    .withMessage('Total rooms must be a non-negative integer'),

  body('total_beds')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.total_beds = null;
        return true;
      }
      const num = Number(val);
      return Number.isInteger(num) && num >= 0;
    })
    .withMessage('Total beds must be a non-negative integer'),

  body('amenities')
    .optional(),

  body('rules')
    .optional({ checkFalsy: true, nullable: true }),

  body('status')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.status = null;
        return true;
      }
      return ['active', 'inactive', 'under_maintenance'].includes(String(val).toLowerCase());
    })
    .withMessage('PG status must be one of: active, inactive, under_maintenance'),

  body('profile_photo')
    .optional()
    .trim(),

  body('logo')
    .optional()
    .trim(),

  // PG UPI & Banking Details
  body('pg_upi_id')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.pg_upi_id = null;
        return true;
      }
      return String(val).trim().length >= 3 && String(val).trim().length <= 100;
    })
    .withMessage('PG UPI ID must be between 3 and 100 characters'),

  body('pg_bank_name')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.pg_bank_name = null;
        return true;
      }
      return String(val).trim().length >= 2 && String(val).trim().length <= 100;
    })
    .withMessage('PG bank name must be between 2 and 100 characters'),

  body('pg_account_number')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.pg_account_number = null;
        return true;
      }
      return String(val).trim().length >= 6 && String(val).trim().length <= 50;
    })
    .withMessage('PG bank account number must be between 6 and 50 characters'),

  body('pg_ifsc_code')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.pg_ifsc_code = null;
        return true;
      }
      return String(val).trim().length >= 4 && String(val).trim().length <= 20;
    })
    .withMessage('PG IFSC code must be between 4 and 20 characters'),

  body('pg_account_holder_name')
    .optional({ checkFalsy: true, nullable: true })
    .custom((val, { req }) => {
      if (val === 'null' || !val) {
        req.body.pg_account_holder_name = null;
        return true;
      }
      return String(val).trim().length >= 2 && String(val).trim().length <= 150;
    })
    .withMessage('PG account holder name must be between 2 and 150 characters'),
];


/**
 * Validator for Email/Password Login
 */
export const loginValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

/**
 * Validator for Send OTP to Mobile Number
 */
export const sendOtpValidator = [
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^(\+91[\-\s]?)?[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit mobile number')
    .customSanitizer(normalizePhone)
    .custom(async (phone) => {
      const user = await userService.findByPhone(phone);
      if (!user) {
        throw new Error('No registered user found with this mobile number. Please register first.');
      }
      if (user.status !== 'active') {
        throw new Error('Your account is deactivated. Please contact support.');
      }
      return true;
    }),
];

/**
 * Validator for Verifying Mobile OTP
 */
export const verifyOtpValidator = [
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^(\+91[\-\s]?)?[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit mobile number')
    .customSanitizer(normalizePhone),

  body('otp')
    .trim()
    .notEmpty()
    .withMessage('OTP is required')
    .isLength({ min: 4, max: 6 })
    .withMessage('OTP must be between 4 and 6 digits'),
];

/**
 * Validator for Forgot Password (Brevo Email Dispatch)
 */
export const forgotPasswordValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .custom(async (email) => {
      const user = await userService.findByEmail(email);
      if (!user) {
        throw new Error('No account found with this email address.');
      }
      if (user.status !== 'active') {
        throw new Error('Your account is deactivated. Please contact support.');
      }
      return true;
    }),
];

/**
 * Validator for Reset Password
 * Fields: token, password
 */
export const resetPasswordValidator = [
  body('token')
    .trim()
    .notEmpty()
    .withMessage('Password reset token is required'),

  body('password')
    .custom((val, { req }) => {
      const p = val || req.body.new_password;
      if (!p) {
        throw new Error('Password is required');
      }
      if (typeof p !== 'string' || p.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }
      return true;
    }),
];

export default {
  registerOwnerWithPgValidator,
  loginValidator,
  sendOtpValidator,
  verifyOtpValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
};
