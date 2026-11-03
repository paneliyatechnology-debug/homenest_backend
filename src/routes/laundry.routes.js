import { Router } from 'express';
import laundryController from '../controllers/laundry.controller.js';
import {
  createLaundryRequestValidator,
  updateLaundryStatusValidator,
  assignStaffValidator,
  listLaundryRequestsQueryValidator,
  laundryStatsQueryValidator,
  laundryIdParamValidator,
  getLaundryCatalogQueryValidator,
  updateLaundryCatalogValidator,
  residentLaundryBillingValidator,
  createLaundryPaymentValidator,
  listLaundryResidentsQueryValidator,
} from '../validators/laundry.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { ROLES } from '../constants/index.js';

const router = Router();

// All laundry routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/laundry/catalog
 * @desc    Get laundry service catalog, pricing, and pickup slots (Branch-wise or All Branches Default)
 * @access  Private (Resident / Admin / Super Admin)
 */
router.get(
  '/catalog',
  validate(getLaundryCatalogQueryValidator),
  laundryController.getLaundryCatalog
);

/**
 * @route   PUT /api/v1/laundry/catalog
 * @desc    Update laundry catalog items & pricing (Branch-wise or All Branches)
 * @access  Private (Admin / Super Admin)
 */
router.put(
  '/catalog',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(updateLaundryCatalogValidator),
  laundryController.updateLaundryCatalog
);

/**
 * @route   GET /api/v1/laundry/stats
 * @desc    Get KPI statistics for Laundry Requests dashboard cards (Total, In Progress, Pending, Completed)
 * @access  Private (Admin / Super Admin)
 */
router.get(
  '/stats',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(laundryStatsQueryValidator),
  laundryController.getLaundryStats
);

/**
 * @route   GET /api/v1/laundry/users
 * @desc    Get users list with their laundry details, summary, and payment status
 * @access  Private (Admin / Super Admin / Staff / Branch Manager)
 */
router.get(
  '/users',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.STAFF, ROLES.BRANCH_MANAGER),
  validate(listLaundryResidentsQueryValidator),
  laundryController.getAllResidentsWithLaundry
);

/**
 * @route   GET /api/v1/laundry/residents/:resident_id/billing
 * @desc    Get resident-wise laundry orders and payment history overview
 * @access  Private (Resident / Admin / Super Admin)
 */
router.get(
  '/residents/:resident_id/billing',
  validate(residentLaundryBillingValidator),
  laundryController.getResidentLaundryBilling
);

/**
 * @route   GET /api/v1/laundry/resident-billing
 * @desc    Get current resident's laundry orders and payment overview (shorthand for resident)
 * @access  Private (Resident / Admin / Super Admin)
 */
router.get(
  '/resident-billing',
  validate(residentLaundryBillingValidator),
  laundryController.getResidentLaundryBilling
);

/**
 * @route   POST /api/v1/laundry/payments
 * @desc    Create laundry payment entry for resident(s) so resident can pay dues (Supports Single & Bulk)
 * @access  Private (Admin / Super Admin)
 */
router.post(
  '/payments',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(createLaundryPaymentValidator),
  laundryController.createLaundryPaymentEntries
);

/**
 * @route   POST /api/v1/laundry
 * @desc    Submit a laundry request (Resident Mobile Form & Admin Web Form)
 * @access  Private (Resident / Admin / Super Admin)
 */
router.post(
  '/',
  validate(createLaundryRequestValidator),
  laundryController.createLaundryRequest
);

/**
 * @route   GET /api/v1/laundry
 * @desc    List laundry requests with status filters, search, and pagination
 * @access  Private (Resident / Admin / Super Admin / Staff)
 */
router.get(
  '/',
  validate(listLaundryRequestsQueryValidator),
  laundryController.getAllLaundryRequests
);

/**
 * @route   GET /api/v1/laundry/:id
 * @desc    Get laundry request details by ID
 * @access  Private (Resident / Admin / Super Admin / Staff)
 */
router.get(
  '/:id',
  validate(laundryIdParamValidator),
  laundryController.getLaundryRequestById
);

/**
 * @route   PATCH /api/v1/laundry/:id/status
 * @desc    Update status of laundry request (Pending -> In Progress -> Completed)
 * @access  Private (Admin / Super Admin / Staff)
 */
router.patch(
  '/:id/status',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.STAFF, ROLES.BRANCH_MANAGER),
  validate(updateLaundryStatusValidator),
  laundryController.updateLaundryStatus
);

/**
 * @route   PATCH /api/v1/laundry/:id/assign
 * @desc    Assign operational staff member to a laundry order
 * @access  Private (Admin / Super Admin)
 */
router.patch(
  '/:id/assign',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  validate(assignStaffValidator),
  laundryController.assignStaff
);

/**
 * @route   DELETE /api/v1/laundry/:id
 * @desc    Delete or cancel a laundry request
 * @access  Private (Resident / Admin / Super Admin)
 */
router.delete(
  '/:id',
  validate(laundryIdParamValidator),
  laundryController.deleteLaundryRequest
);

export default router;
