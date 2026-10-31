import { Router } from 'express';
import buildingController from '../controllers/building.controller.js';
import {
  listBuildingsValidator,
  createBuildingValidator,
  updateBuildingValidator,
  buildingIdParamValidator,
} from '../validators/building.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import ROLES from '../constants/roles.js';

const router = Router();

// All building routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/v1/buildings
 * @desc    Create a new building for a PG facility
 * @access  Private (Admin / Super Admin)
 */
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(createBuildingValidator),
  buildingController.createBuilding
);

/**
 * @route   GET /api/v1/buildings
 * @desc    List all buildings with floor and room counts
 * @access  Private
 */
router.get('/', validate(listBuildingsValidator), buildingController.getAllBuildings);

/**
 * @route   GET /api/v1/buildings/:id
 * @desc    Get building details with its list of floors
 * @access  Private
 */
router.get(
  '/:id',
  validate(buildingIdParamValidator),
  buildingController.getBuildingById
);

/**
 * @route   PUT /api/v1/buildings/:id
 * @desc    Update building details
 * @access  Private (Admin / Super Admin)
 */
router.put(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(updateBuildingValidator),
  buildingController.updateBuilding
);

/**
 * @route   DELETE /api/v1/buildings/:id
 * @desc    Soft delete building (cascades to floors if no active rooms)
 * @access  Private (Admin / Super Admin)
 */
router.delete(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(buildingIdParamValidator),
  buildingController.deleteBuilding
);

export default router;
