import { Router } from 'express';
import userController from '../controllers/user.controller.js';
import {
  createUserValidator,
  updateUserValidator,
  updateProfileValidator,
  userIdParamValidator,
  createStaffValidator,
  updateStaffValidator,
  updateStaffStatusValidator,
  listStaffQueryValidator,
  staffStatsQueryValidator,
  staffDirectoryQueryValidator,
} from '../validators/user.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { handleUserPhotoUpload } from '../middlewares/upload.middleware.js';
import { ROLES } from '../constants/index.js';

const router = Router();

// Apply authentication to all user routes
router.use(authenticate);

// ==========================================
// STAFF MANAGEMENT ROUTES (Under User Module)
// ==========================================

/**
 * @route   GET /api/v1/users/staff/stats
 * @desc    Get staff dashboard KPI cards (total, active, on_leave, inactive, roles breakdown)
 * @access  Private (Admin / Super Admin)
 */
router.get(
  '/staff/stats',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(staffStatsQueryValidator),
  userController.getStaffStats
);

/**
 * @route   GET /api/v1/users/staff
 * @desc    Get staff listing / directory (Unified for Resident Branch Directory & Admin Multi-Branch Management)
 * @access  Private (Resident / Admin / Super Admin / Branch Manager)
 */
router.get(
  '/staff',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER, ROLES.RESIDENT),
  validate(listStaffQueryValidator),
  userController.getStaff
);

/**
 * @route   GET /api/v1/users/staff/directory
 * @desc    Backward compatibility alias -> routes to unified getStaff
 * @access  Private (Resident / Admin / Super Admin / Branch Manager)
 */
router.get(
  '/staff/directory',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER, ROLES.RESIDENT),
  validate(listStaffQueryValidator),
  userController.getStaff
);

/**
 * @route   POST /api/v1/users/staff
 * @desc    Create new staff user with multi-branch assignment and optional photo (Image 2 form)
 * @access  Private (Admin / Super Admin)
 */
router.post(
  '/staff',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  handleUserPhotoUpload,
  validate(createStaffValidator),
  userController.createStaff
);

/**
 * @route   GET /api/v1/users/staff/:id
 * @desc    Get staff details by ID
 * @access  Private (Admin / Super Admin)
 */
router.get(
  '/staff/:id',
  validate(userIdParamValidator),
  userController.getStaffById
);

/**
 * @route   PUT /api/v1/users/staff/:id
 * @desc    Update staff details (Image 2 Edit mode)
 * @access  Private (Admin / Super Admin)
 */
router.put(
  '/staff/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  handleUserPhotoUpload,
  validate(updateStaffValidator),
  userController.updateStaff
);

/**
 * @route   PATCH /api/v1/users/staff/:id/status
 * @desc    Quick update staff status (active | on_leave | inactive)
 * @access  Private (Admin / Super Admin)
 */
router.patch(
  '/staff/:id/status',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(updateStaffStatusValidator),
  userController.updateStaffStatus
);

/**
 * @route   DELETE /api/v1/users/staff/:id
 * @desc    Soft delete a staff member
 * @access  Private (Admin / Super Admin)
 */
router.delete(
  '/staff/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(userIdParamValidator),
  userController.deleteStaff
);

// ==========================================
// CORE USER & PROFILE ROUTES
// ==========================================

/**
 * @route   POST /api/v1/users
 * @desc    Create a new user (Resident, Admin, Super Admin).
 *          Supports FormData with optional 'profile_photo'. If resident, can allocate room.
 * @access  Private (Admin / Super Admin)
 */
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  handleUserPhotoUpload,
  validate(createUserValidator),
  userController.createUser
);

/**
 * @route   GET /api/v1/users
 * @desc    Get all users (filter by role e.g. 'role=resident', status, search, pagination)
 * @access  Private (Admin / Super Admin)
 */
router.get(
  '/',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  userController.getAllUsers
);

/**
 * @route   PUT /api/v1/users/profile
 * @desc    Update current logged-in user profile. Supports FormData with optional 'profile_photo'.
 * @access  Private (Any authenticated user)
 */
router.put(
  '/profile',
  handleUserPhotoUpload,
  validate(updateProfileValidator),
  userController.updateProfile
);

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get user by ID
 * @access  Private (Any authenticated user)
 */
router.get(
  '/:id',
  validate(userIdParamValidator),
  userController.getUserById
);

/**
 * @route   PUT /api/v1/users/:id
 * @desc    Update user by ID. Supports FormData with optional 'profile_photo'.
 * @access  Private (Admin / Super Admin)
 */
router.put(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  handleUserPhotoUpload,
  validate(updateUserValidator),
  userController.updateUser
);

/**
 * @route   DELETE /api/v1/users/:id
 * @desc    Delete user by ID
 * @access  Private (Admin / Super Admin)
 */
router.delete(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(userIdParamValidator),
  userController.deleteUser
);

export default router;
