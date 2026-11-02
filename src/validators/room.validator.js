import { body, param, query } from 'express-validator';
import pgService from '../services/pg.service.js';
import { ROLES } from '../constants/index.js';

const ALLOWED_STATUSES = ['occupied', 'vacant', 'maintenance', 'out_of_service'];
export const SHIFT_STATUSES = ['pending', 'approved', 'rejected'];

/**
 * ==========================================
 * CORE ROOM VALIDATORS
 * ==========================================
 */

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

/**
 * ==========================================
 * ROOM SHIFT REQUEST VALIDATORS
 * ==========================================
 */

/**
 * Validator for creating a Room Shift Request
 * Supports both Resident mobile submission and Admin direct creation
 */
export const createRoomShiftValidator = [
  // Admin-specific: resident_id is required for Admin; auto-inferred for Resident
  body('resident_id')
    .if((val, { req }) => req.user && req.user.role !== ROLES.RESIDENT)
    .notEmpty()
    .withMessage('Resident ID is required when created by admin')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Resident ID must be a valid positive integer'),

  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Reason for room shift is required')
    .isLength({ min: 2, max: 150 })
    .withMessage('Reason must be between 2 and 150 characters'),

  // Resident flow: preferred_room_type is required
  body('preferred_room_type')
    .if((val, { req }) => req.user && req.user.role === ROLES.RESIDENT)
    .notEmpty()
    .withMessage('Preferred room type is required')
    .trim(),

  // Optional for admin flow
  body('preferred_room_type')
    .optional({ checkFalsy: true })
    .trim(),

  // Optional requested/preferred room ID
  body('requested_room_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Requested room ID must be a positive integer'),

  body('preferred_room_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Preferred room ID must be a positive integer'),

  // Resident flow: expected_move_date is required (Image 1)
  body('expected_move_date')
    .if((val, { req }) => req.user && req.user.role === ROLES.RESIDENT)
    .notEmpty()
    .withMessage('Expected move date is required')
    .isISO8601()
    .withMessage('Expected move date must be a valid date in YYYY-MM-DD format'),

  body('expected_move_date')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Expected move date must be a valid date in YYYY-MM-DD format'),

  body('additional_notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Additional notes cannot exceed 500 characters'),

  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),

  // Admin flow: status can be set directly (Image 3)
  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(SHIFT_STATUSES)
    .withMessage(`Status must be one of: ${SHIFT_STATUSES.join(', ')}`),

  body('current_room_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Current room ID must be a positive integer'),

  body('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),
];

/**
 * Validator for updating status of a room shift request (Approve / Reject)
 */
export const updateRoomShiftStatusValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Room shift request ID must be a positive integer'),

  body('status')
    .trim()
    .notEmpty()
    .withMessage('Status is required')
    .toLowerCase()
    .isIn(SHIFT_STATUSES)
    .withMessage(`Status must be one of: ${SHIFT_STATUSES.join(', ')}`),

  body('assigned_room_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Assigned room ID must be a positive integer'),

  body('admin_notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Admin notes cannot exceed 1000 characters'),
];

/**
 * Validator for listing room shift requests
 */
export const listRoomShiftsQueryValidator = [
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
      if (!SHIFT_STATUSES.includes(val)) {
        throw new Error(`Status must be one of: all, ${SHIFT_STATUSES.join(', ')}`);
      }
      return true;
    }),

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
 * Validator for room shift stats
 */
export const roomShiftStatsQueryValidator = [
  query('branch_id')
    .optional({ checkFalsy: true })
    .customSanitizer((val) => (val === 'all' || val === '' ? undefined : val))
    .optional()
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),
];

/**
 * Validator for ID param
 */
export const roomShiftIdParamValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Room shift request ID must be a positive integer'),
];

export default {
  createRoomValidator,
  updateRoomValidator,
  roomIdParamValidator,
  SHIFT_STATUSES,
  createRoomShiftValidator,
  updateRoomShiftStatusValidator,
  listRoomShiftsQueryValidator,
  roomShiftStatsQueryValidator,
  roomShiftIdParamValidator,
};
