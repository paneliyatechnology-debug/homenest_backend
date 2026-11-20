import { Router } from 'express';
import stayController from '../controllers/stay.controller.js';
import {
  checkoutReviewQueryValidator,
  createCheckoutRequestValidator,
  listCheckoutRequestsQueryValidator,
  exportCheckoutQueryValidator,
  checkoutRequestIdParamValidator,
  updateCheckoutStatusValidator,
} from '../validators/stay.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import ROLES from '../constants/roles.js';

const router = Router();

// All stay management routes require authentication
router.use(authenticate);

// ============================================================================
// CHECKOUT & REFUND APPROVALS ROUTES (Under Stay Module)
// ============================================================================

/**
 * @route   GET /api/v1/stays/checkouts/review
 * @desc    Get resident checkout review, pending dues calculation & NOC preview
 * @access  Private (Resident / Admin / Super Admin)
 */
router.get(
  '/checkouts/review',
  validate(checkoutReviewQueryValidator),
  stayController.getCheckoutReview
);

/**
 * @route   POST /api/v1/stays/checkouts
 * @desc    Submit checkout departure request with notice details
 * @access  Private (Resident / Admin / Super Admin)
 */
router.post(
  '/checkouts',
  validate(createCheckoutRequestValidator),
  stayController.createCheckoutRequest
);

/**
 * @route   GET /api/v1/stays/checkouts/export
 * @desc    Export checkout and refund approvals report as Excel (.xlsx) or PDF (.pdf) based on format query param
 * @access  Private (Admin / Super Admin / Staff / Branch Manager)
 */
router.get(
  '/checkouts/export',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.STAFF, ROLES.BRANCH_MANAGER),
  validate(exportCheckoutQueryValidator),
  stayController.exportCheckouts
);

/**
 * @route   GET /api/v1/stays/checkouts
 * @desc    List checkout requests with status tabs, filters, and pagination
 * @access  Private (Resident / Admin / Super Admin / Staff / Branch Manager)
 */
router.get(
  '/checkouts',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.STAFF, ROLES.BRANCH_MANAGER, ROLES.RESIDENT),
  validate(listCheckoutRequestsQueryValidator),
  stayController.getAllCheckoutRequests
);

/**
 * @route   GET /api/v1/stays/checkouts/:id
 * @desc    Get checkout request details by ID
 * @access  Private (Resident / Admin / Super Admin / Staff / Branch Manager)
 */
router.get(
  '/checkouts/:id',
  validate(checkoutRequestIdParamValidator),
  stayController.getCheckoutRequestById
);

/**
 * @route   PATCH /api/v1/stays/checkouts/:id/status
 * @desc    Update checkout request status, checklist, NOC, and refund approval
 * @access  Private (Admin / Super Admin / Branch Manager)
 */
router.patch(
  '/checkouts/:id/status',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  validate(updateCheckoutStatusValidator),
  stayController.updateCheckoutStatus
);

/**
 * @route   DELETE /api/v1/stays/checkouts/:id
 * @desc    Cancel or delete checkout request
 * @access  Private (Resident / Admin / Super Admin)
 */
router.delete(
  '/checkouts/:id',
  validate(checkoutRequestIdParamValidator),
  stayController.deleteCheckoutRequest
);

export default router;

