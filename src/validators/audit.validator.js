import { param, query } from 'express-validator';

export const auditIdParamValidator = [
  param('id')
    .notEmpty()
    .withMessage('Audit log ID is required')
    .isInt({ min: 1 })
    .withMessage('Audit log ID must be a positive integer'),
];

export const listAuditsQueryValidator = [
  query('branch_id')
    .optional()
    .trim()
    .custom((val) => {
      if (val === 'all' || val === '' || Number.isInteger(Number(val))) {
        return true;
      }
      throw new Error('branch_id must be a valid integer or "all"');
    }),

  query('pg_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('PG ID must be a positive integer'),

  query('module')
    .optional()
    .trim()
    .isString(),

  query('action')
    .optional()
    .trim()
    .isString(),

  query('user_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('user_id must be a positive integer'),

  query('user')
    .optional()
    .trim()
    .isString(),

  query('start_date')
    .optional()
    .trim()
    .isString(),

  query('end_date')
    .optional()
    .trim()
    .isString(),

  query('date_range')
    .optional()
    .trim()
    .isString(),

  query('search')
    .optional()
    .trim()
    .isString(),

  query('format')
    .optional()
    .trim()
    .toLowerCase()
    .customSanitizer((v) => (v === 'excel' ? 'xlsx' : v))
    .isIn(['pdf', 'xlsx'])
    .withMessage('format must be one of: pdf, xlsx'),

  query('page')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be an integer between 1 and 100'),
];

export const auditStatsQueryValidator = [
  query('branch_id')
    .optional()
    .trim()
    .custom((val) => {
      if (val === 'all' || val === '' || Number.isInteger(Number(val))) {
        return true;
      }
      throw new Error('branch_id must be a valid integer or "all"');
    }),

  query('pg_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('PG ID must be a positive integer'),

  query('start_date')
    .optional()
    .trim()
    .isString(),

  query('end_date')
    .optional()
    .trim()
    .isString(),

  query('date_range')
    .optional()
    .trim()
    .isString(),
];

export default {
  auditIdParamValidator,
  listAuditsQueryValidator,
  auditStatsQueryValidator,
};
