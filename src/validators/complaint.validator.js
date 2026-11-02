import { body, param, query } from 'express-validator';

export const COMPLAINT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];
export const COMPLAINT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
export const WIFI_ISSUE_TYPES = ['NO_CONNECTION', 'SLOW_SPEED', 'INTERMITTENT_CONNECTION', 'OTHER'];
export const WIFI_DEVICE_TYPES = ['MOBILE', 'LAPTOP', 'TABLET', 'SMART_TV', 'OTHER'];

/**
 * Validator for creating a complaint
 */
export const createComplaintValidator = [
  body('category_id')
    .notEmpty()
    .withMessage('Category ID or identifier is required')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Category ID must be a valid positive integer'),

  body('description')
    .trim()
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ min: 5, max: 500 })
    .withMessage('Description must be between 5 and 500 characters'),

  body('location_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Location ID (Room ID) must be a positive integer'),

  body('title')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 150 })
    .withMessage('Title cannot exceed 150 characters'),

  body('priority')
    .optional({ checkFalsy: true })
    .trim()
    .toUpperCase()
    .isIn(COMPLAINT_PRIORITIES)
    .withMessage(`Priority must be one of: ${COMPLAINT_PRIORITIES.join(', ')}`),

  body('issue_type')
    .optional({ checkFalsy: true })
    .trim()
    .toUpperCase()
    .isIn(WIFI_ISSUE_TYPES)
    .withMessage(`Issue type must be one of: ${WIFI_ISSUE_TYPES.join(', ')}`),

  body('device_type')
    .optional({ checkFalsy: true })
    .trim()
    .toUpperCase()
    .customSanitizer((val) => {
      if (typeof val === 'string') {
        return val.trim().replace(/\s+/g, '_').toUpperCase();
      }
      return val;
    })
    .isIn(WIFI_DEVICE_TYPES)
    .withMessage(`Device type must be one of: ${WIFI_DEVICE_TYPES.join(', ')}`),

  body('notify_updates')
    .optional()
    .customSanitizer((val) => {
      if (val === 'true' || val === true || val === 1 || val === '1') return true;
      if (val === 'false' || val === false || val === 0 || val === '0') return false;
      return Boolean(val);
    }),
];

/**
 * Validator for complaint ID URL parameter
 */
export const complaintIdParamValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Complaint ID must be a valid positive integer'),
];

/**
 * Validator for listing complaints with filters and pagination
 */
export const listComplaintsQueryValidator = [
  query('status')
    .optional({ checkFalsy: true })
    .trim()
    .toUpperCase()
    .isIn(['ALL', ...COMPLAINT_STATUSES])
    .withMessage(`Status filter must be ALL or one of: ${COMPLAINT_STATUSES.join(', ')}`),

  query('category_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Category ID must be a positive integer'),

  query('category')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase(),

  query('priority')
    .optional({ checkFalsy: true })
    .trim()
    .toUpperCase()
    .isIn(['ALL', ...COMPLAINT_PRIORITIES])
    .withMessage(`Priority filter must be ALL or one of: ${COMPLAINT_PRIORITIES.join(', ')}`),

  query('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),

  query('search')
    .optional({ checkFalsy: true })
    .trim(),

  query('start_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Start date must be in YYYY-MM-DD format'),

  query('end_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('End date must be in YYYY-MM-DD format'),

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
 * Validator for updating complaint status
 */
export const updateStatusValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Complaint ID must be a positive integer'),

  body('status')
    .trim()
    .notEmpty()
    .withMessage('Status is required')
    .toUpperCase()
    .isIn(COMPLAINT_STATUSES)
    .withMessage(`Status must be one of: ${COMPLAINT_STATUSES.join(', ')}`),

  body('resolution_notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Resolution notes cannot exceed 1000 characters'),
];

/**
 * Validator for assigning a complaint
 */
export const assignComplaintValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Complaint ID must be a positive integer'),

  body().custom((val, { req }) => {
    const assignedId = req.body.assigned_to !== undefined ? req.body.assigned_to : req.body.assigned_to_user_id;
    if (assignedId === undefined || assignedId === null || assignedId === '' || isNaN(Number(assignedId)) || Number(assignedId) <= 0) {
      throw new Error('Assigned staff / user ID is required (assigned_to or assigned_to_user_id) and must be a positive integer');
    }
    req.body.assigned_to = Number(assignedId);
    return true;
  }),

  body('due_date')
    .optional({ checkFalsy: true })
    .trim()
    .isISO8601()
    .withMessage('Due date must be a valid ISO 8601 date/timestamp'),
];

/**
 * Validator for adding an update / resolution note
 */
export const addComplaintUpdateValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Complaint ID must be a positive integer'),

  body().custom((val, { req }) => {
    const text = req.body.message || req.body.notes;
    if (!text || typeof text !== 'string' || text.trim().length < 2 || text.trim().length > 1000) {
      throw new Error('Update message or note is required (message or notes) and must be between 2 and 1000 characters');
    }
    req.body.message = text.trim();
    return true;
  }),
];

/**
 * Validator for submitting complaint feedback
 */
export const submitComplaintFeedbackValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Complaint ID must be a positive integer'),

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

export default {
  COMPLAINT_STATUSES,
  COMPLAINT_PRIORITIES,
  WIFI_ISSUE_TYPES,
  WIFI_DEVICE_TYPES,
  createComplaintValidator,
  complaintIdParamValidator,
  listComplaintsQueryValidator,
  updateStatusValidator,
  assignComplaintValidator,
  addComplaintUpdateValidator,
  submitComplaintFeedbackValidator,
};
