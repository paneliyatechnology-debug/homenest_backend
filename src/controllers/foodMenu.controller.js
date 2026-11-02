import foodMenuService from '../services/foodMenu.service.js';
import { success, successAction } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';

/**
 * Controller for Food Menu & Feedback Module (Unified Single-Table Architecture)
 */

/**
 * Get Food Menus Date-Wise with Start Date & End Date Filter
 * - Query filters: date, start_date, end_date, branch_id, meal_type, page, limit
 * - Accessible by Resident, Admin, and Super Admin
 */
export const getMenuByDateRange = async (req, res, next) => {
  try {
    const data = await foodMenuService.getMenuByDateRange(req.user, req.query);
    return success(res, 'Food menus retrieved successfully', data.menus, HTTP_STATUS.OK, {
      ...data.pagination,
      branch_id: data.branch_id,
      branch_name: data.branch_name,
      start_date: data.start_date,
      end_date: data.end_date,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get individual food menu item details by ID
 * - Accessible by Admin / Super Admin / Resident
 */
export const getMenuById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await foodMenuService.getMenuById(Number(id), req.user);
    return success(res, 'Food menu item retrieved successfully', item);
  } catch (err) {
    next(err);
  }
};
export const getMenuItemById = getMenuById;

/**
 * Create a single food menu item
 * - Admin specifies branch_id, menu_date (YYYY-MM-DD), meal_type, food name, timings, items
 * - Supports multipart/form-data with food image upload
 */
export const createMenu = async (req, res, next) => {
  try {
    const id = await foodMenuService.createMenu(req.body, req.file, req.user);
    return successAction(res, 'Food menu item created successfully', id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};
export const createMenuItem = createMenu;

/**
 * Update a food menu item
 * - Supports changing menu_date, image replacement, details
 */
export const updateMenu = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updatedId = await foodMenuService.updateMenu(Number(id), req.body, req.file, req.user);
    return successAction(res, 'Food menu item updated successfully', Number(updatedId), HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};
export const updateMenuItem = updateMenu;

/**
 * Delete a menu item (Soft delete)
 */
export const deleteMenu = async (req, res, next) => {
  try {
    const { id } = req.params;
    await foodMenuService.deleteMenu(Number(id), req.user);
    return successAction(res, 'Food menu item deleted successfully', Number(id), HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};
export const deleteMenuItem = deleteMenu;

// ==========================================
// Feedback Handlers
// ==========================================

/**
 * Submit or update resident food feedback for a menu item
 * - Resident only
 * - menu_id passed in URL param (/feedback/:menu_id) or form-data
 * - 1 to 5 stars rating, optional comments (max 300 chars), and optional image file
 * - meal_type, branch_id, pg_id, and feedback_date (timestamp) are automatically generated
 * - Automatically updates existing feedback if already submitted by this resident for this menu item
 */
export const submitFeedback = async (req, res, next) => {
  try {
    const payload = {
      ...req.body,
      menu_id: req.params.menu_id || req.params.id || req.params.menu_item_id || req.body.menu_id || req.body.menu_item_id,
    };
    const result = await foodMenuService.submitFeedback(payload, req.file, req.user);
    return successAction(res, result.message, result.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Get feedback for a specific menu item
 * - Resident: retrieves their submitted feedback for this menu item
 * - Admin/Super Admin: retrieves stats and list of all resident reviews for this item
 */
export const getFeedbackByMenuId = async (req, res, next) => {
  try {
    const menuId = req.params.id || req.params.menu_id;
    const data = await foodMenuService.getFeedbackByMenuId(Number(menuId), req.user);
    return success(res, 'Food feedback retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};
export const getFeedbackForMenuItem = getFeedbackByMenuId;

/**
 * Get resident's own feedback history
 */
export const getMyFeedback = async (req, res, next) => {
  try {
    const { feedback, pagination } = await foodMenuService.getMyFeedback(req.user, req.query);
    return success(res, 'My food feedback retrieved successfully', feedback, HTTP_STATUS.OK, pagination);
  } catch (err) {
    next(err);
  }
};

/**
 * Get branch-wise food feedback for Admin
 * - Filters by branch, date, start_date, end_date, meal category, rating
 */
export const getBranchFeedback = async (req, res, next) => {
  try {
    const { feedback, pagination, branch_name } = await foodMenuService.getBranchFeedback(req.query, req.user);
    return success(res, 'Branch food feedback retrieved successfully', feedback, HTTP_STATUS.OK, {
      ...pagination,
      branch_name,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get feedback ratings analytics summary for Admin
 * - Overall avg rating, meal breakdown, star breakdown
 */
export const getFeedbackSummary = async (req, res, next) => {
  try {
    const summary = await foodMenuService.getFeedbackSummary(req.query, req.user);
    return success(res, 'Food feedback ratings summary retrieved successfully', summary);
  } catch (err) {
    next(err);
  }
};

export default {
  getMenuByDateRange,
  getMenuById,
  getMenuItemById,
  createMenu,
  createMenuItem,
  updateMenu,
  updateMenuItem,
  deleteMenu,
  deleteMenuItem,
  submitFeedback,
  getFeedbackByMenuId,
  getFeedbackForMenuItem,
  getMyFeedback,
  getBranchFeedback,
  getFeedbackSummary,
};
