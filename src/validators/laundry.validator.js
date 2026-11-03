import { body, param, query } from 'express-validator';
import { ROLES } from '../constants/index.js';

export const LAUNDRY_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];
export const LAUNDRY_REQUEST_TYPES = ['Laundry', 'Room Cleaning', 'Maintenance', 'Other'];
export const LAUNDRY_SUBTYPES = ['Wash & Fold', 'Dry Cleaning', 'Washing & Dry Cleaning', 'Only Washing'];

/**
 * Validator for creating a Laundry Request (Resident Mobile & Admin Web Form)
 */
export const createLaundryRequestValidator = [
  body('resident_id')
    .if((val, { req }) => req.user && req.user.role !== ROLES.RESIDENT)
    .notEmpty()
    .withMessage('Resident ID is required when created by admin')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a valid positive integer'),

  body('request_type')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(LAUNDRY_REQUEST_TYPES)
    .withMessage(`Request type must be one of: ${LAUNDRY_REQUEST_TYPES.join(', ')}`),

  body('service_subtype')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Service subtype cannot exceed 100 characters'),

  body('pickup_date')
    .notEmpty()
    .withMessage('Pick up date is required')
    .isISO8601()
    .withMessage('Pick up date must be a valid date in YYYY-MM-DD format'),

  body('pickup_time')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Pick up time cannot exceed 50 characters'),

  body('items')
    .optional({ checkFalsy: true })
    .isArray()
    .withMessage('Items must be an array of laundry items'),

  body('items.*.name')
    .optional({ checkFalsy: true })
    .trim()
    .notEmpty()
    .withMessage('Item name is required'),

  body('items.*.quantity')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 0 })
    .withMessage('Item quantity must be a non-negative integer'),

  body('items.*.rate')
    .optional({ checkFalsy: true })
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('Item rate must be a non-negative number'),

  body('special_instructions')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Special instructions cannot exceed 500 characters'),

  body('assigned_to')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Assigned staff ID must be a positive integer'),
];

/**
 * Validator for updating status of a laundry request
 */
export const updateLaundryStatusValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Laundry request ID must be a positive integer'),

  body('status')
    .trim()
    .notEmpty()
    .withMessage('Status is required')
    .toLowerCase()
    .isIn(LAUNDRY_STATUSES)
    .withMessage(`Status must be one of: ${LAUNDRY_STATUSES.join(', ')}`),

  body('admin_notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Admin notes cannot exceed 1000 characters'),
];

/**
 * Validator for assigning a staff member to a laundry request
 */
export const assignStaffValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Laundry request ID must be a positive integer'),

  body('assigned_to')
    .notEmpty()
    .withMessage('Assigned staff ID is required')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Assigned staff ID must be a positive integer'),
];

/**
 * Validator for listing laundry requests
 */
export const listLaundryRequestsQueryValidator = [
  query('branch_id')
    .optional({ checkFalsy: true })
    .customSanitizer((val) => (val === 'all' || val === '' ? undefined : val))
    .optional()
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),

  query('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .custom((val) => {
      if (val === 'all' || val === '' || val === undefined) return true;
      if (!LAUNDRY_STATUSES.includes(val)) {
        throw new Error(`Status must be one of: all, ${LAUNDRY_STATUSES.join(', ')}`);
      }
      return true;
    }),

  query('type')
    .optional({ checkFalsy: true })
    .trim(),

  query('request_type')
    .optional({ checkFalsy: true })
    .trim(),

  query('tab')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['all', 'current', 'history', 'service', 'laundry'])
    .withMessage('Tab must be one of: all, current, history, service, laundry'),

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
 * Validator for KPI statistics query
 */
export const laundryStatsQueryValidator = [
  query('branch_id')
    .optional({ checkFalsy: true })
    .customSanitizer((val) => (val === 'all' || val === '' ? undefined : val))
    .optional()
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),

  query('type')
    .optional({ checkFalsy: true })
    .trim(),
];

/**
 * Validator for laundry request ID param
 */
export const laundryIdParamValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Laundry request ID must be a positive integer'),
];

/**
 * Validator for getting laundry catalog (optional branch_id query)
 */
export const getLaundryCatalogQueryValidator = [
  query('branch_id')
    .optional({ checkFalsy: true })
    .customSanitizer((val) => (val === 'all' || val === '' ? undefined : val))
    .optional()
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),
];

/**
 * Validator for updating laundry catalog and pricing (Branch-wise or All Branches)
 */
export const updateLaundryCatalogValidator = [
  body('branch_id')
    .optional({ nullable: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),

  body('apply_to_all_branches')
    .optional()
    .isBoolean()
    .withMessage('apply_to_all_branches must be a boolean (true or false)'),

  body('pickup_time_slot')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Pickup time slot cannot exceed 100 characters'),

  body('service_types')
    .optional()
    .isArray()
    .withMessage('Service types must be an array of strings'),

  body('items')
    .notEmpty()
    .withMessage('Items array is required')
    .isArray({ min: 1 })
    .withMessage('Items must be a non-empty array of catalog items'),

  body('items.*.name')
    .trim()
    .notEmpty()
    .withMessage('Each item must have a non-empty name'),

  body('items.*.rate')
    .notEmpty()
    .withMessage('Each item must have a rate')
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('Item rate must be a non-negative number'),
];

/**
 * Validator for getting resident-wise laundry and payment summary
 */
export const residentLaundryBillingValidator = [
  param('resident_id')
    .optional()
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a positive integer'),

  query('resident_id')
    .optional()
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a positive integer'),
];

/**
 * Validator for generating laundry payment entry (Single or Multiple/Bulk Residents)
 */
export const createLaundryPaymentValidator = [
  body('title')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Title must be between 2 and 255 characters'),

  body('due_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Due date must be a valid date in YYYY-MM-DD format'),

  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),

  // Either 'entries' array (bulk) OR single 'resident_id' must be provided
  body().custom((val, { req }) => {
    const hasEntries = Array.isArray(req.body.entries) && req.body.entries.length > 0;
    const hasSingleResident = req.body.resident_id !== undefined && req.body.resident_id !== null && req.body.resident_id !== '';

    if (!hasEntries && !hasSingleResident) {
      throw new Error('Please provide either a single resident_id or an entries array for multiple residents');
    }

    if (hasSingleResident && (!Number.isInteger(Number(req.body.resident_id)) || Number(req.body.resident_id) < 1)) {
      throw new Error('resident_id must be a positive integer');
    }

    if (hasEntries) {
      for (let i = 0; i < req.body.entries.length; i++) {
        const item = req.body.entries[i];
        if (!item.resident_id || !Number.isInteger(Number(item.resident_id)) || Number(item.resident_id) < 1) {
          throw new Error(`Entry at index ${i} must have a valid positive resident_id`);
        }
        if (item.amount !== undefined && item.amount !== null && (isNaN(Number(item.amount)) || Number(item.amount) < 0)) {
          throw new Error(`Entry at index ${i} has an invalid amount; must be a non-negative number`);
        }
        if (item.laundry_request_ids !== undefined && !Array.isArray(item.laundry_request_ids)) {
          throw new Error(`Entry at index ${i} laundry_request_ids must be an array of IDs`);
        }
      }
    }

    return true;
  }),
];

/**
 * Validator for listing residents with laundry details
 */
export const listLaundryResidentsQueryValidator = [
  query('branch_id')
    .optional({ checkFalsy: true })
    .customSanitizer((val) => (val === 'all' || val === '' ? undefined : val))
    .optional()
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),

  query('search')
    .optional({ checkFalsy: true })
    .trim(),

  query('laundry_status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['all', 'has_orders', 'has_unbilled', 'has_due', 'active_orders'])
    .withMessage('laundry_status must be one of: all, has_orders, has_unbilled, has_due, active_orders'),

  query('sort_by')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['name', 'room_no', 'total_orders', 'unbilled_amount', 'total_due', 'created_at'])
    .withMessage('sort_by must be one of: name, room_no, total_orders, unbilled_amount, total_due, created_at'),

  query('order')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['asc', 'desc'])
    .withMessage('order must be either asc or desc'),

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

export const listLaundryUsersQueryValidator = listLaundryResidentsQueryValidator;

export default {
  LAUNDRY_STATUSES,
  LAUNDRY_REQUEST_TYPES,
  LAUNDRY_SUBTYPES,
  createLaundryRequestValidator,
  updateLaundryStatusValidator,
  assignStaffValidator,
  listLaundryRequestsQueryValidator,
  laundryStatsQueryValidator,
  laundryIdParamValidator,
  getLaundryCatalogQueryValidator,
  updateLaundryCatalogValidator,
  residentLaundryBillingValidator,
  createLaundryPaymentValidator,
  listLaundryResidentsQueryValidator,
  listLaundryUsersQueryValidator,
};
