import { body, param, query } from 'express-validator';

export const ALLOWED_PRIORITIES = ['low', 'medium', 'high'];
export const ALLOWED_STATUSES = ['draft', 'scheduled', 'sent'];
export const ALLOWED_AUDIENCES = ['all', 'branch', 'room', 'resident'];

/**
 * Validator for creating a new property notice or announcement
 */
export const createNoticeValidator = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Notice title is required')
    .isLength({ min: 2, max: 255 })
    .withMessage('Notice title must be between 2 and 255 characters'),

  body('category')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Category must not exceed 100 characters'),

  body('priority')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_PRIORITIES)
    .withMessage(`Priority must be one of: ${ALLOWED_PRIORITIES.join(', ')}`),

  body('audience_type')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_AUDIENCES)
    .withMessage(`Audience type must be one of: ${ALLOWED_AUDIENCES.join(', ')}`),

  body('branch_id')
    .optional({ checkFalsy: true, nullable: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),

  body('room_id')
    .optional({ checkFalsy: true, nullable: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Room ID must be a positive integer'),

  body('resident_id')
    .optional({ checkFalsy: true, nullable: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a positive integer'),

  body('content')
    .trim()
    .notEmpty()
    .withMessage('Notice content / message is required'),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}`),

  body('scheduled_at')
    .optional({ checkFalsy: true, nullable: true })
    .trim(),

  body('schedule_date')
    .optional({ checkFalsy: true, nullable: true })
    .trim(),

  body('schedule_time')
    .optional({ checkFalsy: true, nullable: true })
    .trim(),
];

/**
 * Validator for updating an existing notice
 */
export const updateNoticeValidator = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid notice ID is required'),

  body('title')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Notice title must be between 2 and 255 characters'),

  body('category')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Category must not exceed 100 characters'),

  body('priority')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_PRIORITIES)
    .withMessage(`Priority must be one of: ${ALLOWED_PRIORITIES.join(', ')}`),

  body('audience_type')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_AUDIENCES)
    .withMessage(`Audience type must be one of: ${ALLOWED_AUDIENCES.join(', ')}`),

  body('branch_id')
    .optional({ checkFalsy: true, nullable: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),

  body('room_id')
    .optional({ checkFalsy: true, nullable: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Room ID must be a positive integer'),

  body('resident_id')
    .optional({ checkFalsy: true, nullable: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a positive integer'),

  body('content')
    .optional({ checkFalsy: true })
    .trim(),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}`),

  body('scheduled_at')
    .optional({ checkFalsy: true, nullable: true })
    .trim(),

  body('schedule_date')
    .optional({ checkFalsy: true, nullable: true })
    .trim(),
];

/**
 * Validator for querying notices list (Admin)
 */
export const queryNoticesValidator = [
  query('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase(),

  query('tab')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase(),

  query('category')
    .optional({ checkFalsy: true })
    .trim(),

  query('priority')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase(),

  query('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),

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

/**
 * Validator for querying resident notification center
 */
export const queryResidentNoticesValidator = [
  query('category')
    .optional({ checkFalsy: true })
    .trim(),

  query('is_read')
    .optional({ checkFalsy: true })
    .toBoolean(),

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

export default {
  createNoticeValidator,
  updateNoticeValidator,
  queryNoticesValidator,
  queryResidentNoticesValidator,
};

