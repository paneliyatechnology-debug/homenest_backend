import { body, param, query } from 'express-validator';

export const ALLOWED_POST_CATEGORIES = ['update', 'event', 'birthday', 'general'];
export const ALLOWED_FILTER_PILLS = ['all', 'updates', 'events', 'birthdays', 'update', 'event', 'birthday'];
export const ALLOWED_EVENT_STATUSES = ['ongoing', 'upcoming', 'past'];

/**
 * Validate post creation
 */
export const createPostValidator = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Post content cannot be empty')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Post content must not exceed 2000 characters'),

  body('category')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_POST_CATEGORIES)
    .withMessage(`Category must be one of: ${ALLOWED_POST_CATEGORIES.join(', ')}`),

  body('branch_id')
    .optional({ checkFalsy: true, nullable: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),
];

/**
 * Validate post update
 */
export const updatePostValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Post ID must be a positive integer'),

  body('content')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Post content must not exceed 2000 characters'),

  body('category')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_POST_CATEGORIES)
    .withMessage(`Category must be one of: ${ALLOWED_POST_CATEGORIES.join(', ')}`),
];

/**
 * Validate Post ID in route parameter
 */
export const postIdParamValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Post ID must be a positive integer'),
];

/**
 * Validate Comment ID in route parameter
 */
export const commentIdParamValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Comment ID must be a positive integer'),
];

/**
 * Validate listing community posts
 */
export const listPostsQueryValidator = [
  query('category')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_FILTER_PILLS)
    .withMessage(`Category filter must be one of: ${ALLOWED_FILTER_PILLS.join(', ')}`),

  query('search')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search query must not exceed 100 characters'),

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
 * Validate creating a comment on a post
 */
export const createCommentValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Post ID must be a positive integer'),

  body('content')
    .trim()
    .notEmpty()
    .withMessage('Comment content cannot be empty')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Comment content must not exceed 1000 characters'),
];

/**
 * Validate Event ID in route parameter
 */
export const eventIdParamValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Event ID must be a positive integer'),
];

/**
 * Validate creating a community event
 */
export const createEventValidator = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Event title is required')
    .isLength({ min: 2, max: 255 })
    .withMessage('Event title must be between 2 and 255 characters'),

  body('category')
    .trim()
    .notEmpty()
    .withMessage('Event category is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Event category must be between 2 and 100 characters'),

  body('event_date')
    .notEmpty()
    .withMessage('Event date is required')
    .isISO8601()
    .withMessage('Event date must be a valid ISO 8601 date / datetime string'),

  body('location')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('Location must not exceed 255 characters'),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_EVENT_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_EVENT_STATUSES.join(', ')}`),

  body('description')
    .optional({ checkFalsy: true })
    .trim(),

  body('branch_id')
    .optional({ checkFalsy: true, nullable: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),
];

/**
 * Validate updating a community event
 */
export const updateEventValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Event ID must be a positive integer'),

  body('title')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Event title must be between 2 and 255 characters'),

  body('category')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Event category must be between 2 and 100 characters'),

  body('event_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Event date must be a valid ISO 8601 date / datetime string'),

  body('location')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('Location must not exceed 255 characters'),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_EVENT_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_EVENT_STATUSES.join(', ')}`),

  body('description')
    .optional({ checkFalsy: true })
    .trim(),
];

/**
 * Validate listing community events
 */
export const listEventsQueryValidator = [
  query('timeline')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['all', 'ongoing', 'upcoming', 'past'])
    .withMessage('Timeline filter must be one of: all, ongoing, upcoming, past'),

  query('category')
    .optional({ checkFalsy: true })
    .trim(),

  query('search')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search query must not exceed 100 characters'),
];

