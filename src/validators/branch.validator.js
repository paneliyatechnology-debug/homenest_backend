import { body, param, query } from 'express-validator';

const STATUS_VALUES = ['active', 'maintenance', 'upcoming'];
const ALLOWED_STATUS_INPUTS = ['active', 'maintenance', 'upcoming', 'under_maintenance'];

export const listBranchesValidator = [
  query('status')
    .optional()
    .trim()
    .customSanitizer(v => v === 'under_maintenance' ? 'maintenance' : v)
    .isIn([...STATUS_VALUES, 'all'])
    .withMessage('Status must be one of: active, maintenance, upcoming, all'),

  query('search')
    .optional()
    .trim()
    .isString(),

  query('location')
    .optional()
    .trim()
    .isString(),

  query('pg_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('PG ID must be a positive integer'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be an integer greater than or equal to 1'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be an integer between 1 and 100'),
];

export const branchStatsValidator = [
  query('pg_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('PG ID must be a positive integer'),
];

export const branchIdParamValidator = [
  param('id')
    .notEmpty()
    .withMessage('Branch ID is required')
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),
];

export const createBranchValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Branch name is required')
    .isLength({ min: 2, max: 150 })
    .withMessage('Branch name must be between 2 and 150 characters'),

  body('location')
    .trim()
    .notEmpty()
    .withMessage('Location is required')
    .isLength({ min: 2, max: 255 })
    .withMessage('Location must be between 2 and 255 characters'),

  body('total_rooms')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Total rooms must be a non-negative integer'),

  body('status')
    .optional()
    .trim()
    .customSanitizer(v => v === 'under_maintenance' ? 'maintenance' : v)
    .isIn(STATUS_VALUES)
    .withMessage(`Status must be one of: ${STATUS_VALUES.join(', ')}`),

  body('pg_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('PG ID must be a positive integer'),
];

export const updateBranchValidator = [
  ...branchIdParamValidator,

  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('Branch name must be between 2 and 150 characters'),

  body('location')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Location must be between 2 and 255 characters'),

  body('total_rooms')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Total rooms must be a non-negative integer'),

  body('status')
    .optional()
    .trim()
    .customSanitizer(v => v === 'under_maintenance' ? 'maintenance' : v)
    .isIn(STATUS_VALUES)
    .withMessage(`Status must be one of: ${STATUS_VALUES.join(', ')}`),

  body('pg_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('PG ID must be a positive integer'),
];

