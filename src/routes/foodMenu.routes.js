import { Router } from 'express';
import foodMenuController from '../controllers/foodMenu.controller.js';
import {
  getMenuQueryValidator,
  menuIdParamValidator,
  createMenuValidator,
  updateMenuValidator,
  submitFeedbackValidator,
  listFeedbackQueryValidator,
} from '../validators/foodMenu.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { handleFoodMenuImageUpload, handleFoodFeedbackImageUpload } from '../middlewares/upload.middleware.js';
import ROLES from '../constants/roles.js';

const router = Router();

// All food menu & feedback endpoints require authentication
router.use(authenticate);

// ==========================================
// 1. Food Feedback Endpoints (Resident & Admin)
// Note: Placed above /:id to prevent route shadowing
// ==========================================

/**
 * @route   GET /api/v1/food-menu/feedback/my
 * @desc    Get resident's own feedback history
 * @access  Private (Resident)
 */
router.get(
  '/feedback/my',
  authorize(ROLES.RESIDENT),
  validate(listFeedbackQueryValidator),
  foodMenuController.getMyFeedback
);

/**
 * @route   GET /api/v1/food-menu/feedback/summary
 * @desc    Get ratings summary and analytics (overall avg rating, meal breakdown, star breakdown)
 * @access  Private (Admin / Super Admin)
 */
router.get(
  '/feedback/summary',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(listFeedbackQueryValidator),
  foodMenuController.getFeedbackSummary
);

/**
 * @route   GET /api/v1/food-menu/feedback
 * @desc    Get branch-wise resident food feedback list with filters (start_date, end_date, date, meal_type, rating)
 * @access  Private (Admin / Super Admin)
 */
router.get(
  '/feedback',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(listFeedbackQueryValidator),
  foodMenuController.getBranchFeedback
);

/**
 * @route   GET /api/v1/food-menu/:id/feedback  (Standard RESTful Path)
 * @route   GET /api/v1/food-menu/feedback/:id (Supported Alias)
 * @desc    Get feedback for a specific food menu item
 *          - Resident: retrieves their submitted feedback for this menu item (or null)
 *          - Admin / Super Admin: retrieves stats and all resident feedback for this menu item
 * @access  Private (Resident / Admin / Super Admin)
 */
router.get(
  '/:id/feedback',
  validate(menuIdParamValidator),
  foodMenuController.getFeedbackByMenuId
);

router.get(
  '/feedback/:id',
  validate(menuIdParamValidator),
  foodMenuController.getFeedbackByMenuId
);

/**
 * @route   POST /api/v1/food-menu/:id/feedback  (Standard RESTful Path)
 * @route   POST /api/v1/food-menu/feedback/:id (Supported Alias)
 * @route   POST /api/v1/food-menu/feedback     (Supported Alias with menu_id in body)
 * @desc    Submit or update resident feedback for a specific food menu item
 *          - Request body: multipart/form-data with rating (1-5), optional comments, optional image
 *          - Auto-populates: menu_id, meal_type, branch_id, pg_id, and feedback_date (timestamp)
 *          - Automatically updates existing feedback if already submitted by this resident
 * @access  Private (Resident)
 */
router.post(
  '/:id/feedback',
  authorize(ROLES.RESIDENT),
  handleFoodFeedbackImageUpload,
  validate(submitFeedbackValidator),
  foodMenuController.submitFeedback
);

router.post(
  '/feedback/:id',
  authorize(ROLES.RESIDENT),
  handleFoodFeedbackImageUpload,
  validate(submitFeedbackValidator),
  foodMenuController.submitFeedback
);

router.post(
  '/feedback',
  authorize(ROLES.RESIDENT),
  handleFoodFeedbackImageUpload,
  validate(submitFeedbackValidator),
  foodMenuController.submitFeedback
);

// ==========================================
// 2. Food Menu Endpoints (Date-wise CRUD)
// ==========================================

/**
 * @route   GET /api/v1/food-menu
 * @desc    Get food menu date-wise with start_date & end_date or single date filter
 *          - ?start_date=2026-11-01&end_date=2026-11-07
 *          - ?date=2026-11-01
 *          - ?branch_id=1&meal_type=breakfast
 * @access  Private (Resident / Admin / Super Admin)
 */
router.get(
  '/',
  validate(getMenuQueryValidator),
  foodMenuController.getMenuByDateRange
);

/**
 * @route   POST /api/v1/food-menu
 * @desc    Create a food menu item
 *          - Supports multipart/form-data with food image upload
 * @access  Private (Admin / Super Admin)
 */
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  handleFoodMenuImageUpload,
  validate(createMenuValidator),
  foodMenuController.createMenu
);

/**
 * @route   GET /api/v1/food-menu/:id
 * @desc    Get details of a single food menu item
 * @access  Private (Resident / Admin / Super Admin)
 */
router.get(
  '/:id',
  validate(menuIdParamValidator),
  foodMenuController.getMenuById
);

/**
 * @route   PUT /api/v1/food-menu/:id
 * @desc    Update a food menu item (menu_date, meal_type, name, timings, image, etc.)
 * @access  Private (Admin / Super Admin)
 */
router.put(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  handleFoodMenuImageUpload,
  validate(updateMenuValidator),
  foodMenuController.updateMenu
);

/**
 * @route   DELETE /api/v1/food-menu/:id
 * @desc    Delete a food menu item (soft delete)
 * @access  Private (Admin / Super Admin)
 */
router.delete(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(menuIdParamValidator),
  foodMenuController.deleteMenu
);

export default router;
