import { body, param, query } from 'express-validator';

const ALLOWED_STATUSES = ['pending', 'approved', 'rejected', 'in_office', 'left'];
const ALLOWED_FILTER_STATUSES = ['all', 'pending', 'approved', 'rejected', 'in_office', 'left'];

/**
 * Validator for listing visitors (GET /api/v1/visitors)
 */
export const listVisitorsValidator = [
  query('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_FILTER_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_FILTER_STATUSES.join(', ')}`),

  query('purpose')
    .optional({ checkFalsy: true })
    .trim(),

  query('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('PG branch ID must be a positive integer'),

  query('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),

  query('resident_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a positive integer'),

  query('start_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Start date must be a valid date in YYYY-MM-DD format'),

  query('end_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('End date must be a valid date in YYYY-MM-DD format'),

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
 * Validator for visitor dashboard stats (GET /api/v1/visitors/stats)
 */
export const visitorStatsValidator = [
  query('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('PG branch ID must be a positive integer'),

  query('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),
];

/**
 * Validator for creating a new visitor (POST /api/v1/visitors)
 */
export const createVisitorValidator = [
  body('visitor_name')
    .trim()
    .notEmpty()
    .withMessage('Visitor name is required')
    .isLength({ min: 2, max: 150 })
    .withMessage('Visitor name must be between 2 and 150 characters'),

  body('visitor_phone')
    .trim()
    .notEmpty()
    .withMessage('Visitor phone number is required')
    .matches(/^[+]?[0-9\s-]{7,20}$/)
    .withMessage('Please provide a valid contact phone number'),

  body('purpose')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Purpose cannot exceed 100 characters'),

  body('visit_date')
    .trim()
    .notEmpty()
    .withMessage('Visit date is required')
    .isISO8601()
    .withMessage('Visit date must be a valid date in YYYY-MM-DD format'),

  body('valid_until')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Valid until date must be a valid date in YYYY-MM-DD format'),

  body('entry_time')
    .optional({ checkFalsy: true })
    .trim(),

  body('resident_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a positive integer'),

  body('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('PG facility ID must be a positive integer'),

  body('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}`),

  body('admin_notes')
    .optional({ checkFalsy: true })
    .trim(),
];

/**
 * Validator for updating a visitor pass (PUT /api/v1/visitors/:id)
 */
export const updateVisitorValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Visitor ID must be a valid positive integer'),

  body('visitor_name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('Visitor name must be between 2 and 150 characters'),

  body('visitor_phone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[+]?[0-9\s-]{7,20}$/)
    .withMessage('Please provide a valid contact phone number'),

  body('purpose')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Purpose cannot exceed 100 characters'),

  body('visit_date')
    .optional({ checkFalsy: true })
    .trim()
    .isISO8601()
    .withMessage('Visit date must be a valid date in YYYY-MM-DD format'),

  body('valid_until')
    .optional({ checkFalsy: true })
    .trim()
    .isISO8601()
    .withMessage('Valid until date must be a valid date in YYYY-MM-DD format'),

  body('entry_time')
    .optional({ checkFalsy: true })
    .trim(),

  body('exit_time')
    .optional({ checkFalsy: true })
    .trim(),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}`),

  body('admin_notes')
    .optional({ checkFalsy: true })
    .trim(),

  body('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),
];

/**
 * Validator for changing visitor pass status (PATCH /api/v1/visitors/:id/status)
 */
export const updateVisitorStatusValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Visitor ID must be a valid positive integer'),

  body('status')
    .trim()
    .notEmpty()
    .withMessage('Status is required')
    .toLowerCase()
    .isIn(ALLOWED_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}`),

  body('admin_notes')
    .optional({ checkFalsy: true })
    .trim(),

  body('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),
];

/**
 * Validator for QR code scanning (POST /api/v1/visitors/scan)
 */
export const scanVisitorQrValidator = [
  body('pass_code')
    .trim()
    .notEmpty()
    .withMessage('Pass code is required for gate QR verification'),

  body('gate_name')
    .optional({ checkFalsy: true })
    .trim(),

  body('notes')
    .optional({ checkFalsy: true })
    .trim(),
];

/**
 * Validator for ID param (/api/v1/visitors/:id)
 */
export const visitorIdParamValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Visitor ID must be a valid positive integer'),
];

/**
 * Validator for listing Gate activity logs (/api/v1/visitors/gate/logs)
 */
export const listGateLogsValidator = [
  query('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 }),

  query('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 }),

  query('visitor_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Visitor ID must be a positive integer'),

  query('resident_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a positive integer'),

  query('type')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['all', 'entry', 'exit'])
    .withMessage('Type must be all, entry, or exit'),

  query('date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Date must be in YYYY-MM-DD format'),

  query('search')
    .optional({ checkFalsy: true })
    .trim(),

  query('page')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 }),

  query('limit')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1, max: 100 }),
];

export default {
  listVisitorsValidator,
  visitorStatsValidator,
  createVisitorValidator,
  updateVisitorValidator,
  updateVisitorStatusValidator,
  scanVisitorQrValidator,
  visitorIdParamValidator,
  listGateLogsValidator,
};

