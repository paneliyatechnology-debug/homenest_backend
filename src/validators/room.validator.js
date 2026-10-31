import { body, param } from 'express-validator';
import pgService from '../services/pg.service.js';

const ALLOWED_STATUSES = ['occupied', 'vacant', 'maintenance', 'out_of_service'];

/**
 * Validator for creating a new room.
 * Handles both multipart/form-data and JSON payloads.
 * Image is completely optional.
 */
export const createRoomValidator = [
  body('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch (PG ID) must be a valid integer')
    .custom(async (pg_id) => {
      const pg = await pgService.findById(pg_id);
      if (!pg) {
        throw new Error('Selected branch (PG) does not exist');
      }
      return true;
    }),

  body('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),

  body('room_no')
    .trim()
    .notEmpty()
    .withMessage('Room no. is required')
    .isLength({ min: 1, max: 50 })
    .withMessage('Room no. must be between 1 and 50 characters'),

  body('room_type')
    .trim()
    .notEmpty()
    .withMessage('Room type is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Room type must be between 2 and 50 characters'),

  body('building_id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Building ID (building_id) is required and must be a valid positive integer'),

  body('floor_id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Floor ID (floor_id) is required and must be a valid positive integer'),

  body('capacity')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Capacity must be at least 1'),

  body('size')
    .optional({ checkFalsy: true })
    .trim(),

  body('image')
    .optional({ nullable: true, checkFalsy: true })
    .trim(),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}`),
];

/**
 * Validator for updating an existing room.
 * Image is completely optional.
 */
export const updateRoomValidator = [
  param('id')
    .notEmpty()
    .withMessage('Room ID parameter is required')
    .isInt({ min: 1 })
    .withMessage('Room ID must be a valid integer'),

  body('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch (PG ID) must be a valid integer')
    .custom(async (pg_id) => {
      const pg = await pgService.findById(pg_id);
      if (!pg) {
        throw new Error('Selected branch (PG) does not exist');
      }
      return true;
    }),

  body('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),

  body('room_no')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Room no. must be between 1 and 50 characters'),

  body('room_type')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Room type must be between 2 and 50 characters'),

  body('building_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Building ID must be a valid positive integer'),

  body('floor_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Floor ID must be a valid positive integer'),

  body('capacity')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Capacity must be at least 1'),

  body('size')
    .optional({ checkFalsy: true })
    .trim(),

  body('image')
    .optional({ nullable: true, checkFalsy: true })
    .trim(),

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(ALLOWED_STATUSES)
    .withMessage(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}`),
];

/**
 * Validator for Room ID param.
 */
export const roomIdParamValidator = [
  param('id')
    .notEmpty()
    .withMessage('Room ID parameter is required')
    .isInt({ min: 1 })
    .withMessage('Room ID must be a valid integer'),
];

export default {
  createRoomValidator,
  updateRoomValidator,
  roomIdParamValidator,
};
