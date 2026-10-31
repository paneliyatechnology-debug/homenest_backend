import { body } from 'express-validator';
import userService from '../services/user.service.js';
import ROLES from '../constants/roles.js';

/**
 * Normalizes an Indian phone number to 10 digits
 * @param {string|number} phone
 * @returns {string} 10-digit mobile number
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
    .notEmpty()
    .withMessage('Owner password is required')
    .isLength({ min: 6 })
    .withMessage('Owner password must be at least 6 characters long'),

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

  body('pg_email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage('Please provide a valid PG contact email'),

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
      if (!user.is_active) {
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
      if (!user.is_active) {
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
