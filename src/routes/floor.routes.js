import { Router } from 'express';
import floorController from '../controllers/floor.controller.js';
import {
  listFloorsValidator,
  createFloorValidator,
  updateFloorValidator,
  floorIdParamValidator,
} from '../validators/floor.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import ROLES from '../constants/roles.js';

const router = Router();

// All floor routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/v1/floors
 * @desc    Create a new floor under a building
 * @access  Private (Admin / Super Admin)
 */
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(createFloorValidator),
  floorController.createFloor
);

/**
 * @route   GET /api/v1/floors
 * @desc    List all floors (filter by building_id, pg_id)
 * @access  Private
 */
router.get('/', validate(listFloorsValidator), floorController.getAllFloors);

/**
 * @route   GET /api/v1/floors/:id
 * @desc    Get floor details with list of rooms
 * @access  Private
 */
router.get(
  '/:id',
  validate(floorIdParamValidator),
  floorController.getFloorById
);

/**
 * @route   PUT /api/v1/floors/:id
 * @desc    Update floor details
 * @access  Private (Admin / Super Admin)
 */
router.put(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(updateFloorValidator),
  floorController.updateFloor
);

/**
 * @route   DELETE /api/v1/floors/:id
 * @desc    Soft delete floor (allowed only if no active rooms)
 * @access  Private (Admin / Super Admin)
 */
router.delete(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(floorIdParamValidator),
  floorController.deleteFloor
);

export default router;
