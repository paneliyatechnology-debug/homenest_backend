import { body, param, query } from 'express-validator';

/**
 * Validator for checking out / vacating a resident stay (Admin Direct Vacate)
 */
export const vacateStayValidator = [
  param('id')
    .notEmpty()
    .withMessage('Stay ID parameter is required')
    .isInt({ min: 1 })
    .withMessage('Stay ID must be a valid integer'),

  body('check_out_date')
    .optional()
    .isISO8601()
    .withMessage('Check-out date must be a valid date in YYYY-MM-DD format'),
];

/**
 * Validator for reviewing checkout details, dues calculation, and NOC preview (Image 1 Screen 2)
 */
export const checkoutReviewQueryValidator = [
  query('departure_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('departure_date must be a valid ISO8601 date (YYYY-MM-DD)'),

  query('resident_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('resident_id must be a positive integer'),

  query('stay_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('stay_id must be a positive integer'),
];

/**
 * Validator for submitting a checkout request (Image 1 Screen 1 & Screen 2)
 */
export const createCheckoutRequestValidator = [
  body('departure_date')
    .notEmpty()
    .withMessage('Departure date is required')
    .isISO8601()
    .withMessage('Departure date must be a valid ISO8601 date (YYYY-MM-DD)'),

  body('reason')
    .notEmpty()
    .withMessage('Reason for checkout is required')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Reason must be between 2 and 255 characters'),

  body('additional_notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Additional notes cannot exceed 1000 characters'),

  body('stay_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Stay ID must be a positive integer'),

  body('resident_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a positive integer'),
];

/**
 * Validator for listing checkout requests (Image 2 Web Table)
 */
export const listCheckoutRequestsQueryValidator = [
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
    .isIn(['all', 'pending', 'under_review', 'in_progress', 'approved', 'rejected', 'completed'])
    .withMessage('Status must be one of: all, pending, under_review, in_progress, approved, rejected, completed'),

  query('search')
    .optional({ checkFalsy: true })
    .trim(),

  query('start_date')
    .optional({ checkFalsy: true })
    .trim()
    .isISO8601()
    .withMessage('Start date must be in YYYY-MM-DD format'),

  query('end_date')
    .optional({ checkFalsy: true })
    .trim()
    .isISO8601()
    .withMessage('End date must be in YYYY-MM-DD format')
    .custom((endDate, { req }) => {
      if (req.query?.start_date && new Date(endDate) < new Date(req.query.start_date)) {
        throw new Error('End date cannot be earlier than start date');
      }
      return true;
    }),

  query('date_by')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['departure_date', 'created_at'])
    .withMessage('date_by must be either departure_date or created_at'),

  query('format')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .customSanitizer((val) => {
      if (val === 'exal' || val === 'xlsx') return 'excel';
      return val;
    })
    .isIn(['excel', 'pdf', 'xlsx'])
    .withMessage('format must be either excel, xlsx, or pdf'),
];

/**
 * Validator for checkout export endpoint (Excel or PDF)
 */
export const exportCheckoutQueryValidator = [
  query('format')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .customSanitizer((val) => {
      if (val === 'exal' || val === 'xlsx') return 'excel';
      return val;
    })
    .isIn(['excel', 'pdf', 'xlsx'])
    .withMessage('format must be either excel, xlsx, or pdf'),

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
    .isIn(['all', 'pending', 'under_review', 'in_progress', 'approved', 'rejected', 'completed'])
    .withMessage('Status must be one of: all, pending, under_review, in_progress, approved, rejected, completed'),

  query('search')
    .optional({ checkFalsy: true })
    .trim(),

  query('start_date')
    .optional({ checkFalsy: true })
    .trim()
    .isISO8601()
    .withMessage('Start date must be in YYYY-MM-DD format'),

  query('end_date')
    .optional({ checkFalsy: true })
    .trim()
    .isISO8601()
    .withMessage('End date must be in YYYY-MM-DD format')
    .custom((endDate, { req }) => {
      if (req.query?.start_date && new Date(endDate) < new Date(req.query.start_date)) {
        throw new Error('End date cannot be earlier than start date');
      }
      return true;
    }),

  query('date_by')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['departure_date', 'created_at'])
    .withMessage('date_by must be either departure_date or created_at'),
];

/**
 * Validator for checkout request ID parameter
 */
export const checkoutRequestIdParamValidator = [
  param('id')
    .notEmpty()
    .withMessage('Checkout request ID parameter is required')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Checkout request ID must be a valid positive integer'),
];

/**
 * Validator for updating checkout status, checklist clearance, and refund (Image 2 & Stepper)
 */
export const updateCheckoutStatusValidator = [
  param('id')
    .notEmpty()
    .withMessage('Checkout request ID parameter is required')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Checkout request ID must be a valid positive integer'),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['pending', 'under_review', 'in_progress', 'approved', 'rejected', 'completed'])
    .withMessage('Status must be one of: pending, under_review, in_progress, approved, rejected, completed'),

  body('clearance_room_inspected')
    .optional()
    .isBoolean()
    .withMessage('clearance_room_inspected must be a boolean (true/false)'),

  body('clearance_key_returned')
    .optional()
    .isBoolean()
    .withMessage('clearance_key_returned must be a boolean (true/false)'),

  body('clearance_dues_cleared')
    .optional()
    .isBoolean()
    .withMessage('clearance_dues_cleared must be a boolean (true/false)'),

  body('noc_issued')
    .optional()
    .isBoolean()
    .withMessage('noc_issued must be a boolean (true/false)'),

  body('refund_amount')
    .optional({ nullable: true })
    .toFloat()
    .isFloat({ min: 0 })
    .withMessage('refund_amount must be a non-negative number'),

  body('refund_processed')
    .optional()
    .isBoolean()
    .withMessage('refund_processed must be a boolean (true/false)'),

  body('admin_notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Admin notes cannot exceed 1000 characters'),
];

export default {
  vacateStayValidator,
  checkoutReviewQueryValidator,
  createCheckoutRequestValidator,
  listCheckoutRequestsQueryValidator,
  exportCheckoutQueryValidator,
  checkoutRequestIdParamValidator,
  updateCheckoutStatusValidator,
};

