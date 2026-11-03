import { body, query, check } from 'express-validator';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

export const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

/**
 * Validator for menu ID parameter (supports :id or :menu_id in URL params)
 */
export const menuIdParamValidator = [
  check('id')
    .customSanitizer((val, { req }) => req.params?.id || req.params?.menu_id || val)
    .notEmpty()
    .withMessage('Valid menu ID is required')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Menu ID must be a valid positive integer'),
];

export const menuItemIdParamValidator = menuIdParamValidator;

/**
 * Validator for retrieving food menu (Date-wise & Range-wise)
 * Supports:
 * - ?date=2026-11-01
 * - ?start_date=2026-11-01&end_date=2026-11-07
 * - ?branch_id=1
 * - ?meal_type=breakfast
 */
export const getMenuQueryValidator = [
  query('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),

  query('date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Date must be in YYYY-MM-DD format'),

  query('start_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Start date must be in YYYY-MM-DD format'),

  query('end_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('End date must be in YYYY-MM-DD format'),

  query('meal_type')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['all', ...MEAL_TYPES])
    .withMessage(`Meal category must be 'all' or one of: ${MEAL_TYPES.join(', ')}`),

  query('day_of_week')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(DAYS_OF_WEEK)
    .withMessage(`Day of week must be one of: ${DAYS_OF_WEEK.join(', ')}`),

  query('page')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 }),

  query('limit')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1, max: 100 }),
];

/**
 * Validator for creating a single food menu item
 */
export const createMenuValidator = [
  body('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),

  body('menu_date')
    .customSanitizer((val, { req }) => val || req.body?.date)
    .trim()
    .notEmpty()
    .withMessage('Menu date is required (YYYY-MM-DD)')
    .isISO8601()
    .withMessage('Menu date must be a valid date in YYYY-MM-DD format'),

  body('meal_type')
    .trim()
    .notEmpty()
    .withMessage('Meal category is required')
    .toLowerCase()
    .isIn(MEAL_TYPES)
    .withMessage(`Meal category must be one of: ${MEAL_TYPES.join(', ')}`),

  body('name')
    .trim()
    .notEmpty()
    .withMessage('Food name is required')
    .isLength({ min: 2, max: 150 })
    .withMessage('Food name must be between 2 and 150 characters'),

  body('description')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),

  body('start_time')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('Start time cannot exceed 20 characters'),

  body('end_time')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('End time cannot exceed 20 characters'),

  body('included_items')
    .optional({ checkFalsy: true })
    .customSanitizer((val) => {
      if (Array.isArray(val)) return val.join(', ');
      return typeof val === 'string' ? val.trim() : val;
    })
    .isLength({ max: 255 })
    .withMessage('Included items cannot exceed 255 characters'),

  body('is_active')
    .optional()
    .customSanitizer((val) => {
      if (val === 'true' || val === true || val === 1 || val === '1') return true;
      if (val === 'false' || val === false || val === 0 || val === '0') return false;
      return Boolean(val);
    }),

  body('sort_order')
    .optional()
    .toInt()
    .isInt({ min: 0 })
    .withMessage('Sort order must be a non-negative integer'),
];

export const createMenuItemValidator = createMenuValidator;

/**
 * Validator for updating a food menu item
 */
export const updateMenuValidator = [
  ...menuIdParamValidator,

  body('menu_date')
    .optional({ checkFalsy: true })
    .customSanitizer((val, { req }) => val || req.body?.date)
    .isISO8601()
    .withMessage('Menu date must be a valid date in YYYY-MM-DD format'),

  body('meal_type')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(MEAL_TYPES)
    .withMessage(`Meal category must be one of: ${MEAL_TYPES.join(', ')}`),

  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('Food name must be between 2 and 150 characters'),

  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),

  body('start_time')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('Start time cannot exceed 20 characters'),

  body('end_time')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('End time cannot exceed 20 characters'),

  body('included_items')
    .optional({ nullable: true })
    .customSanitizer((val) => {
      if (Array.isArray(val)) return val.join(', ');
      return typeof val === 'string' ? val.trim() : val;
    })
    .isLength({ max: 255 })
    .withMessage('Included items cannot exceed 255 characters'),

  body('is_active')
    .optional()
    .customSanitizer((val) => {
      if (val === 'true' || val === true || val === 1 || val === '1') return true;
      if (val === 'false' || val === false || val === 0 || val === '0') return false;
      return Boolean(val);
    }),

  body('sort_order')
    .optional()
    .toInt()
    .isInt({ min: 0 })
    .withMessage('Sort order must be a non-negative integer'),
];

export const updateMenuItemValidator = updateMenuValidator;

/**
 * Validator for submitting food feedback
 * - menu_id is passed in the URL (e.g. /:id/feedback or /feedback/:id) or form-data body
 * - meal_type & feedback_date are automatically derived by the server
 * - rating (1-5 stars) is required
 * - comments (max 300 chars) and image file are optional
 */
export const submitFeedbackValidator = [
  check('menu_id')
    .customSanitizer((val, { req }) => req.params?.menu_id || req.params?.id || req.params?.menu_item_id || req.body?.menu_id || req.body?.menu_item_id || val)
    .notEmpty()
    .withMessage('Valid menu ID is required in URL or body')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Menu ID must be a positive integer'),

  body('rating')
    .notEmpty()
    .withMessage('Rating is required')
    .toInt()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be an integer between 1 and 5 stars'),

  body('comments')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 300 })
    .withMessage('Comments cannot exceed 300 characters'),
];

/**
 * Validator for querying feedback logs & reports
 */
export const listFeedbackQueryValidator = [
  query('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 }),

  query('date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Date must be a valid date in YYYY-MM-DD format'),

  query('start_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Start date must be in YYYY-MM-DD format'),

  query('end_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('End date must be in YYYY-MM-DD format'),

  query('meal_type')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['all', ...MEAL_TYPES])
    .withMessage(`Meal category must be 'all' or one of: ${MEAL_TYPES.join(', ')}`),

  query('rating')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating filter must be between 1 and 5'),

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
  MEAL_TYPES,
  DAYS_OF_WEEK,
  menuIdParamValidator,
  menuItemIdParamValidator,
  getMenuQueryValidator,
  createMenuValidator,
  createMenuItemValidator,
  updateMenuValidator,
  updateMenuItemValidator,
  submitFeedbackValidator,
  listFeedbackQueryValidator,
};
