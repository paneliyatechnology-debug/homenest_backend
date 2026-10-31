import { Router } from 'express';
import branchController from '../controllers/branch.controller.js';
import {
  listBranchesValidator,
  branchStatsValidator,
  branchIdParamValidator,
  createBranchValidator,
  updateBranchValidator,
} from '../validators/branch.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { handleBranchPhotoUpload } from '../middlewares/upload.middleware.js';
import ROLES from '../constants/roles.js';

const router = Router();

// All branch endpoints require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/branches/stats
 * @desc    Get KPI statistics for Branches dashboard cards (Total, Active, Under Maintenance, Upcoming)
 * @access  Private (Admin / Super Admin / Resident)
 */
router.get(
  '/stats',
  validate(branchStatsValidator),
  branchController.getBranchStats
);

/**
 * @route   GET /api/v1/branches
 * @desc    List all branches with filters (status, location, search, pg_id) and pagination
 * @access  Private (Admin / Super Admin / Resident)
 */
router.get(
  '/',
  validate(listBranchesValidator),
  branchController.getAllBranches
);

/**
 * @route   POST /api/v1/branches
 * @desc    Create a new branch with optional photo
 * @access  Private (Admin / Super Admin)
 */
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  handleBranchPhotoUpload,
  validate(createBranchValidator),
  branchController.createBranch
);

/**
 * @route   GET /api/v1/branches/:id
 * @desc    Get detailed branch record by ID
 * @access  Private (Admin / Super Admin / Resident)
 */
router.get(
  '/:id',
  validate(branchIdParamValidator),
  branchController.getBranchById
);

/**
 * @route   PUT /api/v1/branches/:id
 * @desc    Update branch details and optional photo
 * @access  Private (Admin / Super Admin)
 */
router.put(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  handleBranchPhotoUpload,
  validate(updateBranchValidator),
  branchController.updateBranch
);

/**
 * @route   DELETE /api/v1/branches/:id
 * @desc    Soft delete a branch
 * @access  Private (Admin / Super Admin)
 */
router.delete(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(branchIdParamValidator),
  branchController.deleteBranch
);

export default router;

