import { Router } from 'express';
import userController from '../controllers/user.controller.js';
import {
  createUserValidator,
  updateUserValidator,
  updateProfileValidator,
  userIdParamValidator,
} from '../validators/user.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { handleUserPhotoUpload } from '../middlewares/upload.middleware.js';
import { ROLES } from '../constants/index.js';

const router = Router();

// Apply authentication to all user routes
router.use(authenticate);

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
 * @route   GET /api/v1/users/profile
 * @desc    Get current logged-in user profile
 * @access  Private (Any authenticated user)
 */
router.get('/profile', userController.getUserProfile);

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
