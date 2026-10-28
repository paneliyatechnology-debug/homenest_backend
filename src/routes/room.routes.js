import { Router } from 'express';
import roomController from '../controllers/room.controller.js';
import {
  createRoomValidator,
  updateRoomValidator,
  roomIdParamValidator,
} from '../validators/room.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { handleRoomImageUpload } from '../middlewares/upload.middleware.js';
import ROLES from '../constants/roles.js';

const router = Router();

// All room management routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/rooms/stats
 * @desc    Get KPI statistical counts for rooms (Total, Occupied, Vacant, Maintenance, Out of Service)
 * @access  Private
 */
router.get('/stats', roomController.getRoomStats);

/**
 * @route   GET /api/v1/rooms/buildings
 * @desc    Get distinct room building names and their floor list array
 * @access  Private
 */
router.get('/buildings', roomController.getRoomBuildings);

/**
 * @route   POST /api/v1/rooms
 * @desc    Add a new room to a PG facility (branch). Supports FormData with optional image file.
 * @access  Private (Admin / Super Admin)
 */
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  handleRoomImageUpload,
  validate(createRoomValidator),
  roomController.createRoom
);

/**
 * @route   GET /api/v1/rooms
 * @desc    List rooms with filters (branch, status, room type, search, pagination)
 * @access  Private
 */
router.get('/', roomController.getAllRooms);

/**
 * @route   GET /api/v1/rooms/:id
 * @desc    Get details of a specific room by ID
 * @access  Private
 */
router.get('/:id', validate(roomIdParamValidator), roomController.getRoomById);

/**
 * @route   PUT /api/v1/rooms/:id
 * @desc    Update room details. Supports FormData with optional image file.
 * @access  Private (Admin / Super Admin)
 */
router.put(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  handleRoomImageUpload,
  validate(updateRoomValidator),
  roomController.updateRoom
);

/**
 * @route   DELETE /api/v1/rooms/:id
 * @desc    Delete a room (also removes local image file if present)
 * @access  Private (Admin / Super Admin)
 */
router.delete(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(roomIdParamValidator),
  roomController.deleteRoom
);

export default router;
