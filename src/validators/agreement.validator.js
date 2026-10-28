import { body, param, query } from 'express-validator';
import db from '../config/db.js';

const ALLOWED_STATUSES = ['signed', 'pending', 'draft', 'expired'];

/**
 * Validator for creating a new agreement
 */
export const createAgreementValidator = [
  body('resident_id')
    .notEmpty()
    .withMessage('Resident ID is required')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a valid integer')
    .custom(async (resident_id) => {
      const resident = await db('users').where({ id: resident_id }).whereNull('deleted_at').first();
      if (!resident) {
        throw new Error('Resident user not found');
      }
      return true;
    }),

  body('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('PG facility ID must be a valid integer')
    .custom(async (pg_id) => {
      const pg = await db('pgs').where({ id: pg_id }).whereNull('deleted_at').first();
      if (!pg) {
        throw new Error('PG facility not found');
      }
      return true;
    }),

  body('agreement_no')
    .trim()
    .notEmpty()
    .withMessage('Agreement number is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Agreement number must be between 2 and 100 characters'),

  body('room_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Room ID must be a valid integer')
    .custom(async (room_id, { req }) => {
      const room = await db('rooms').where({ id: room_id }).whereNull('deleted_at').first();
      if (!room) {
        throw new Error('Room not found');
      }
      if (req.body?.pg_id && Number(room.pg_id) !== Number(req.body.pg_id)) {
        throw new Error('Room does not belong to the selected PG facility');
      }
      return true;
    }),

  body('room_type')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Room type must be between 2 and 50 characters'),

  body('agreement_type')
    .trim()
    .notEmpty()
    .withMessage('Agreement type is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Agreement type must be between 2 and 50 characters'),

  body('start_date')
    .notEmpty()
    .withMessage('Start date is required')
    .isISO8601()
    .withMessage('Start date must be a valid date in YYYY-MM-DD format'),

  body('end_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('End date must be a valid date in YYYY-MM-DD format')
    .custom((end_date, { req }) => {
      if (req.body?.start_date && new Date(end_date) < new Date(req.body.start_date)) {
        throw new Error('End date cannot be earlier than start date');
      }
      return true;
    }),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}`),
];

/**
 * Validator for updating an agreement
 */
export const updateAgreementValidator = [
  param('id')
    .notEmpty()
    .withMessage('Agreement ID parameter is required')
    .isInt({ min: 1 })
    .withMessage('Agreement ID must be a valid integer'),

  body('agreement_no')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Agreement number must be between 2 and 100 characters'),

  body('room_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Room ID must be a valid integer'),

  body('room_type')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Room type must be between 2 and 50 characters'),

  body('agreement_type')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Agreement type must be between 2 and 50 characters'),

  body('start_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Start date must be a valid date in YYYY-MM-DD format'),

  body('end_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('End date must be a valid date in YYYY-MM-DD format'),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}`),
];

/**
 * Validator for Agreement ID param
 */
export const agreementIdParamValidator = [
  param('id')
    .notEmpty()
    .withMessage('Agreement ID parameter is required')
    .isInt({ min: 1 })
    .withMessage('Agreement ID must be a valid integer'),
];

export default {
  createAgreementValidator,
  updateAgreementValidator,
  agreementIdParamValidator,
};

