import { body, param } from 'express-validator';

/**
 * Validator for checking out / vacating a resident stay
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

export default {
  vacateStayValidator,
};

