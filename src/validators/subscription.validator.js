import { body, param, query } from 'express-validator';

export const ALLOWED_PLAN_TYPES = ['monthly', 'quarterly', 'yearly'];

/**
 * Helper to normalize boolean / 1 / 0 input to integer 1 or 0
 */
const normalizeIsActive = (val) => {
  if (val === undefined || val === null || val === '') return undefined;
  if (val === 1 || val === '1' || val === true || val === 'true') return 1;
  if (val === 0 || val === '0' || val === false || val === 'false') return 0;
  return undefined;
};

/**
 * Validator for creating a new subscription plan
 */
export const createSubscriptionValidator = [
  body('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Property ID (pg_id) must be a positive integer'),

  body('name')
    .trim()
    .notEmpty()
    .withMessage('Plan name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Plan name must be between 2 and 100 characters'),

  body('plan_type')
    .trim()
    .notEmpty()
    .withMessage('Plan type is required')
    .toLowerCase()
    .isIn(ALLOWED_PLAN_TYPES)
    .withMessage(`Plan type must be one of: ${ALLOWED_PLAN_TYPES.join(', ')}`),

  body('price')
    .notEmpty()
    .withMessage('Price (INR) is required')
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('Price must be a valid positive number'),

  body('duration')
    .trim()
    .notEmpty()
    .withMessage('Duration is required (e.g. 1 Month, 3 Months, 1 Year)')
    .isLength({ min: 1, max: 50 })
    .withMessage('Duration string must be under 50 characters'),

  body('description')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),

  body('features')
    .optional()
    .custom((val) => {
      if (Array.isArray(val)) return true;
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed);
        } catch {
          return true;
        }
      }
      throw new Error('Features must be an array of service strings or JSON');
    }),

  body('is_active')
    .optional()
    .customSanitizer(normalizeIsActive)
    .isIn([0, 1])
    .withMessage('is_active must be 1 (active) or 0 (inactive)'),
];

/**
 * Validator for updating an existing subscription plan
 */
export const updateSubscriptionValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Subscription plan ID must be a positive integer'),

  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Plan name cannot be empty')
    .isLength({ min: 2, max: 100 })
    .withMessage('Plan name must be between 2 and 100 characters'),

  body('plan_type')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_PLAN_TYPES)
    .withMessage(`Plan type must be one of: ${ALLOWED_PLAN_TYPES.join(', ')}`),

  body('price')
    .optional()
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('Price must be a valid positive number'),

  body('duration')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Duration string must be under 50 characters'),

  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),

  body('features')
    .optional()
    .custom((val) => {
      if (val === null || Array.isArray(val)) return true;
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed);
        } catch {
          return true;
        }
      }
      throw new Error('Features must be an array of service strings');
    }),

  body('is_active')
    .optional()
    .customSanitizer(normalizeIsActive)
    .isIn([0, 1])
    .withMessage('is_active must be 1 (active) or 0 (inactive)'),
];

/**
 * Validator for quick status toggle (Pause / Activate Plan)
 */
export const updateStatusValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Subscription plan ID must be a positive integer'),

  body('is_active')
    .optional()
    .customSanitizer(normalizeIsActive)
    .isIn([0, 1])
    .withMessage('is_active must be 1 (active) or 0 (inactive)'),
];

/**
 * Validator for querying subscription plans list
 */
export const querySubscriptionsValidator = [
  query('page')
    .optional()
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .toInt()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('plan_type')
    .optional()
    .trim()
    .toLowerCase(),

  query('is_active')
    .optional()
    .customSanitizer(normalizeIsActive),

  query('status')
    .optional()
    .trim()
    .toLowerCase(),

  query('search')
    .optional()
    .trim(),

  query('pg_id')
    .optional()
    .toInt()
    .isInt({ min: 1 })
    .withMessage('pg_id must be a positive integer'),
];
