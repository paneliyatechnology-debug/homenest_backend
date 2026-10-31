import { body, param, query } from 'express-validator';
import db from '../config/db.js';

const ALLOWED_TYPES = ['rent', 'maintenance', 'security_deposit', 'electricity', 'other'];
const ALLOWED_METHODS = ['upi', 'card', 'net_banking', 'wallet', 'bank_transfer', 'cash'];
const ALLOWED_STATUSES = ['paid', 'pending', 'overdue', 'refunded', 'failed'];
const ALLOWED_FILTER_STATUSES = ['all', 'pending', 'paid', 'completed', 'overdue', 'refunded', 'refunds', 'failed'];

/**
 * Validator for listing payments (GET /api/v1/payments)
 */
export const listPaymentsValidator = [
  query('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_FILTER_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_FILTER_STATUSES.join(', ')}`),

  query('tab')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase(),

  query('resident_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a positive integer'),

  query('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('PG facility ID must be a positive integer'),

  query('room_type')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['single', 'double', 'triple'])
    .withMessage('Room type must be single, double, or triple'),

  query('payment_type')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_TYPES)
    .withMessage(`Payment type must be one of: ${ALLOWED_TYPES.join(', ')}`),

  query('payment_method')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_METHODS)
    .withMessage(`Payment method must be one of: ${ALLOWED_METHODS.join(', ')}`),

  query('start_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Start date must be in YYYY-MM-DD format'),

  query('end_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('End date must be in YYYY-MM-DD format'),

  query('date_by')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['due_date', 'paid_at', 'created_at'])
    .withMessage('date_by must be due_date, paid_at, or created_at'),

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
 * Validator for exporting payments report (GET /api/v1/payments/export)
 */
export const exportPaymentsValidator = [
  query('format')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['xlsx', 'excel', 'pdf', 'both', 'all'])
    .withMessage('Export format must be xlsx, pdf, or both'),

  query('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_FILTER_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_FILTER_STATUSES.join(', ')}`),

  query('tab')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase(),

  query('resident_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a positive integer'),

  query('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('PG facility ID must be a positive integer'),

  query('room_type')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['single', 'double', 'triple'])
    .withMessage('Room type must be single, double, or triple'),

  query('payment_type')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_TYPES)
    .withMessage(`Payment type must be one of: ${ALLOWED_TYPES.join(', ')}`),

  query('payment_method')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_METHODS)
    .withMessage(`Payment method must be one of: ${ALLOWED_METHODS.join(', ')}`),

  query('start_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Start date must be in YYYY-MM-DD format'),

  query('end_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('End date must be in YYYY-MM-DD format'),

  query('date_by')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['due_date', 'paid_at', 'created_at'])
    .withMessage('date_by must be due_date, paid_at, or created_at'),

  query('search')
    .optional({ checkFalsy: true })
    .trim(),
];

/**
 * Validator for Unified Payment Statistics (GET /api/v1/payments/stats)
 */
export const paymentStatsValidator = [
  query('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('PG facility ID must be a positive integer'),

  query('start_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Start date must be in YYYY-MM-DD format'),

  query('end_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('End date must be in YYYY-MM-DD format'),
];

// Aliases for backward compatibility
export const overviewStatsValidator = paymentStatsValidator;
export const historyStatsValidator = paymentStatsValidator;

/**
 * Validator for Resident Mobile Overview (GET /api/v1/payments/resident/overview)
 */
export const residentOverviewValidator = [
  query('resident_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a positive integer'),
];

/**
 * Validator for Payment ID param
 */
export const paymentIdParamValidator = [
  param('id')
    .notEmpty()
    .withMessage('Payment ID parameter is required')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Payment ID must be a positive integer'),
];

/**
 * Validator for creating an invoice / payment bill
 */
export const createPaymentValidator = [
  body('resident_id')
    .notEmpty()
    .withMessage('Resident ID is required')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a valid integer')
    .custom(async (resident_id) => {
      const resident = await db('users').where({ id: resident_id }).whereNull('deleted_at').first();
      if (!resident) {
        throw new Error('Resident user not found');
      }
      return true;
    }),

  body('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('PG facility ID must be a valid integer')
    .custom(async (pg_id) => {
      const pg = await db('pgs').where({ id: pg_id }).whereNull('deleted_at').first();
      if (!pg) {
        throw new Error('PG facility not found');
      }
      return true;
    }),

  body('stay_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Stay ID must be a positive integer'),

  body('room_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Room ID must be a positive integer'),

  body('title')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Title must be between 2 and 255 characters'),

  body('payment_type')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_TYPES)
    .withMessage(`Payment type must be one of: ${ALLOWED_TYPES.join(', ')}`),

  body('due_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Due date must be a valid date in YYYY-MM-DD format'),

  body('billing_period_start')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Billing period start must be in YYYY-MM-DD format'),

  body('billing_period_end')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Billing period end must be in YYYY-MM-DD format'),

  body('amount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Amount must be a non-negative number'),

  body('rent_amount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Rent amount must be a non-negative number'),

  body('deposit_amount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Deposit amount must be a non-negative number'),

  body('maintenance_amount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Maintenance amount must be a non-negative number'),

  body('electricity_amount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Electricity amount must be a non-negative number'),

  body('other_amount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Other amount must be a non-negative number'),

  body('notes')
    .optional({ checkFalsy: true })
    .trim(),
];

/**
 * Validator for updating an existing invoice / payment bill
 */
export const updatePaymentValidator = [
  param('id')
    .notEmpty()
    .withMessage('Payment ID parameter is required')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Payment ID must be a positive integer'),

  body('resident_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a valid integer')
    .custom(async (resident_id) => {
      const resident = await db('users').where({ id: resident_id }).whereNull('deleted_at').first();
      if (!resident) {
        throw new Error('Resident user not found');
      }
      return true;
    }),

  body('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('PG facility ID must be a valid integer')
    .custom(async (pg_id) => {
      const pg = await db('pgs').where({ id: pg_id }).whereNull('deleted_at').first();
      if (!pg) {
        throw new Error('PG facility not found');
      }
      return true;
    }),

  body('stay_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Stay ID must be a positive integer'),

  body('room_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Room ID must be a positive integer'),

  body('title')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Title must be between 2 and 255 characters'),

  body('payment_type')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_TYPES)
    .withMessage(`Payment type must be one of: ${ALLOWED_TYPES.join(', ')}`),

  body('due_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Due date must be a valid date in YYYY-MM-DD format'),

  body('billing_period_start')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Billing period start must be in YYYY-MM-DD format'),

  body('billing_period_end')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Billing period end must be in YYYY-MM-DD format'),

  body('amount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Amount must be a non-negative number'),

  body('rent_amount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Rent amount must be a non-negative number'),

  body('deposit_amount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Deposit amount must be a non-negative number'),

  body('maintenance_amount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Maintenance amount must be a non-negative number'),

  body('electricity_amount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Electricity amount must be a non-negative number'),

  body('other_amount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Other amount must be a non-negative number'),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}`),

  body('notes')
    .optional({ checkFalsy: true })
    .trim(),
];

/**
 * Validator for recording or executing a payment checkout
 */
export const processPaymentValidator = [
  param('id')
    .notEmpty()
    .withMessage('Payment ID parameter is required')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Payment ID must be a positive integer'),

  body('payment_method')
    .notEmpty()
    .withMessage('Payment method is required')
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_METHODS)
    .withMessage(`Payment method must be one of: ${ALLOWED_METHODS.join(', ')}`),

  body('payment_method_details')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Payment method details must be between 2 and 100 characters'),
];

export default {
  listPaymentsValidator,
  exportPaymentsValidator,
  paymentStatsValidator,
  overviewStatsValidator,
  historyStatsValidator,
  residentOverviewValidator,
  paymentIdParamValidator,
  createPaymentValidator,
  updatePaymentValidator,
  processPaymentValidator,
};
