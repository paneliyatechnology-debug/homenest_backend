import userService from '../services/user.service.js';
import { success, successAction, AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';

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
    const branch_id = req.body.branch_id ? Number(req.body.branch_id) : undefined;
    const user = await userService.create({ ...req.body, pg_id, branch_id });
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

    const {
      role,
      status,
      search,
      page = 1,
      limit = 10,
    } = req.query;

    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (is_admin ? req.pg_id : undefined);
    const branch_id = req.query.branch_id ? Number(req.query.branch_id) : undefined;

    const { users, pagination } = await userService.findAll({
      role,
      status,
      pg_id,
      branch_id,
      owner_id,
      search,
      page,
      limit,
    });

    return success(res, 'Users fetched successfully', users, HTTP_STATUS.OK, pagination);
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
    const user = await userService.findById(id);

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

    const updated_user = await userService.update(req.user.id, req.body);
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

    const updated_user = await userService.update(id, req.body);
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


/**
 * ==========================================
 * STAFF MANAGEMENT CONTROLLER METHODS (Under User Module)
 * ==========================================
 */

/**
 * Get staff KPI statistics for admin dashboard (Image 1 cards)
 */
export const getStaffStats = async (req, res, next) => {
  try {
    const stats = await userService.getStaffStats(req.user, req.query);
    return success(res, 'Staff statistics retrieved successfully', stats);
  } catch (err) {
    next(err);
  }
};

/**
 * Get staff listing & contact directory (Unified for Resident Branch View & Admin Multi-Branch Management)
 */
export const getStaff = async (req, res, next) => {
  try {
    const result = await userService.getStaff(req.user, req.query);
    return success(
      res,
      'Staff list retrieved successfully',
      result.staff,
      HTTP_STATUS.OK,
      {
        ...result.pagination,
        ...(result.branch ? { branch: result.branch } : {}),
      }
    );
  } catch (err) {
    next(err);
  }
};

/**
 * Shared alias for staff directory
 */
export const getStaffDirectory = getStaff;

/**
 * Create a new staff member under user module (Image 2 form)
 */
export const createStaff = async (req, res, next) => {
  try {
    const result = await userService.createStaff(req.body, req.file, req.user);
    return success(res, 'Staff member added successfully', result, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * Get single staff details by ID
 */
export const getStaffById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const staff = await userService.getStaffById(Number(id), req.user);
    return success(res, 'Staff details retrieved successfully', staff);
  } catch (err) {
    next(err);
  }
};

/**
 * Update staff details (Image 2 Edit mode)
 */
export const updateStaff = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await userService.updateStaff(Number(id), req.body, req.file, req.user);
    return success(res, 'Staff member updated successfully', updated);
  } catch (err) {
    next(err);
  }
};

/**
 * Quick update staff status (active | on_leave | inactive)
 */
export const updateStaffStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await userService.updateStaffStatus(Number(id), req.body.status, req.user);
    return success(res, result.message, result);
  } catch (err) {
    next(err);
  }
};

/**
 * Soft delete staff member
 */
export const deleteStaff = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await userService.deleteStaff(Number(id), req.user);
    return success(res, result.message, result);
  } catch (err) {
    next(err);
  }
};


export default {
  createUser,
  getAllUsers,
  getUserById,
  updateProfile,
  updateUser,
  deleteUser,
  getStaffStats,
  getStaff,
  getStaffDirectory,
  createStaff,
  getStaffById,
  updateStaff,
  updateStaffStatus,
  deleteStaff,
};
