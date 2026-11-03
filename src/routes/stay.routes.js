import { Router } from 'express';
import stayController from '../controllers/stay.controller.js';
import {
  vacateStayValidator,
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
 * @desc    Get resident checkout review, pending dues calculation & NOC preview (Image 1 Screen 2)
 * @access  Private (Resident / Admin / Super Admin)
 */
router.get(
  '/checkouts/review',
  validate(checkoutReviewQueryValidator),
  stayController.getCheckoutReview
);

/**
 * @route   POST /api/v1/stays/checkouts
 * @desc    Submit checkout departure request (Image 1 Screen 1 & Screen 2)
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
 * @desc    List checkout requests for Admin Portal with tabs, filters, and export (Image 2 Web Table)
 * @access  Private (Admin / Super Admin / Staff / Branch Manager)
 */
router.get(
  '/checkouts',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.STAFF, ROLES.BRANCH_MANAGER),
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
 * @desc    Update checkout request status, checklist, NOC, and refund approval (Image 2 & Stepper)
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

// ============================================================================
// CORE STAY & VACATE ROUTES
// ============================================================================

/**
 * @route   GET /api/v1/stays/my-history
 * @desc    Get logged-in resident's stay timeline across multiple PGs
 * @access  Private (Resident)
 */
router.get('/my-history', stayController.getMyStays);

/**
 * @route   GET /api/v1/stays/:id
 * @desc    Get details of a specific stay record
 * @access  Private
 */
router.get('/:id', stayController.getStayById);

/**
 * @route   PUT /api/v1/stays/:id/vacate
 * @desc    Check-out / vacate resident from PG (Direct Admin Vacate)
 * @access  Private (PG Owner / Super Admin)
 */
router.put(
  '/:id/vacate',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(vacateStayValidator),
  stayController.vacateStay
);

export default router;

