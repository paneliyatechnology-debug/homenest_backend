import userService from '../services/user.service.js';
import { success, successAction, AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';

const getBaseUrl = (req) => `${req.protocol}://${req.get('host')}`;

/**
 * Controller managing User accounts across all roles (Resident, Admin, Super Admin).
 */

/**
 * Create a new user (Resident, Admin, Super Admin)
 * Supports FormData with optional 'profile_photo' file.
 * If creating resident with room assignment, allocates stay atomically.
 */
export const createUser = async (req, res, next) => {
  try {
    if (req.file) {
      req.body.profile_photo = req.file.filename;
    }

    const pg_id = req.body.pg_id ? Number(req.body.pg_id) : req.pg_id;
    const base_url = getBaseUrl(req);
    const user = await userService.create({ ...req.body, pg_id }, base_url);
    return successAction(res, 'User created successfully', user.id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * Get all users with filtering by role, status, pg_id, and search.
 */
export const getAllUsers = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const owner_id = is_admin ? req.user.id : undefined;
    const base_url = getBaseUrl(req);

    const {
      role,
      status,
      search,
      page = 1,
      limit = 10,
    } = req.query;

    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (is_admin ? req.pg_id : undefined);

    const { users, pagination } = await userService.findAll({
      role,
      status,
      pg_id,
      owner_id,
      search,
      page,
      limit,
      base_url,
    });

    return success(res, 'Users fetched successfully', users, HTTP_STATUS.OK, pagination);
  } catch (err) {
    next(err);
  }
};

/**
 * Get current authenticated user profile.
 */
export const getUserProfile = async (req, res, next) => {
  try {
    const base_url = getBaseUrl(req);
    const user = await userService.findById(req.user.id, base_url);

    if (!user) {
      throw new AppError('User profile not found', HTTP_STATUS.NOT_FOUND);
    }

    return success(res, 'Profile retrieved successfully', user);
  } catch (err) {
    next(err);
  }
};

/**
 * Get user by primary ID.
 */
export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const base_url = getBaseUrl(req);
    const user = await userService.findById(id, base_url);

    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    return success(res, 'User retrieved successfully', user);
  } catch (err) {
    next(err);
  }
};

/**
 * Update authenticated user profile.
 * Supports FormData with optional 'profile_photo'.
 */
export const updateProfile = async (req, res, next) => {
  try {
    if (req.file) {
      req.body.profile_photo = req.file.filename;
    }

    const base_url = getBaseUrl(req);
    const updated_user = await userService.update(req.user.id, req.body, base_url);
    return successAction(res, 'Profile updated successfully', updated_user.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Update user by ID (Admin / Super Admin).
 * Supports FormData with optional 'profile_photo'.
 */
export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (req.file) {
      req.body.profile_photo = req.file.filename;
    }

    const base_url = getBaseUrl(req);
    const updated_user = await userService.update(id, req.body, base_url);
    return successAction(res, 'User updated successfully', updated_user.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Delete user by ID (Admin / Super Admin).
 * Vacates any room stays and removes profile photo.
 */
export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    await userService.remove(id);
    return successAction(res, 'User deleted successfully', parseInt(id, 10), HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

export default {
  createUser,
  getAllUsers,
  getUserProfile,
  getUserById,
  updateProfile,
  updateUser,
  deleteUser,
};
