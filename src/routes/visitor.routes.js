import { Router } from 'express';
import visitorController from '../controllers/visitor.controller.js';
import {
  listVisitorsValidator,
  visitorStatsValidator,
  createVisitorValidator,
  updateVisitorValidator,
  updateVisitorStatusValidator,
  scanVisitorQrValidator,
  visitorIdParamValidator,
  listGateLogsValidator,
} from '../validators/visitor.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { handleVisitorPhotoUpload } from '../middlewares/upload.middleware.js';
import ROLES from '../constants/roles.js';

const router = Router();

// All visitor endpoints require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/visitors/stats
 * @desc    Get KPI statistics for Visitors dashboard (Total, Today, Active on-site, Pending approval)
 * @access  Private (Admin / Resident)
 */
router.get(
  '/stats',
  validate(visitorStatsValidator),
  visitorController.getVisitorStats
);

/**
 * @route   POST /api/v1/visitors/scan
 * @desc    Scan QR Code to manage Entry and Exit automatically
 *          - If pass is approved: marks 'in_office' (Entry time recorded)
 *          - If pass is in_office: marks 'left' (Exit time recorded)
 * @access  Private (Admin / Super Admin)
 */
router.post(
  '/scan',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(scanVisitorQrValidator),
  visitorController.scanVisitorQr
);

/**
 * @route   GET /api/v1/visitors
 * @desc    List all visitors with filters (purpose, status, branch, date range, search) and pagination.
 *          Shared API:
 *          - Admin views all visitors across their property
 *          - Resident views only their own visitors
 * @access  Private (Admin / Resident)
 */
router.get(
  '/',
  validate(listVisitorsValidator),
  visitorController.getAllVisitors
);

/**
 * @route   POST /api/v1/visitors
 * @desc    Create a new visitor pass / request
 *          - Resident: Status is forced to 'pending' (requires admin approval)
 *          - Admin: Defaults to 'approved' (generates pass code, QR code, and sends pass email to resident)
 * @access  Private (Admin / Resident)
 */
router.post(
  '/',
  handleVisitorPhotoUpload,
  validate(createVisitorValidator),
  visitorController.createVisitor
);

/**
 * @route   GET /api/v1/visitors/gate/logs
 * @desc    Real-time gate monitoring: list all visitor entry & exit logs across the property
 * @access  Private (Admin / Super Admin)
 */
router.get(
  '/gate/logs',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(listGateLogsValidator),
  visitorController.getGateLogs
);

/**
 * @route   GET /api/v1/visitors/:id/logs
 * @desc    Get complete entry and exit movement audit trail for a specific visitor pass
 * @access  Private (Admin / Resident)
 */
router.get(
  '/:id/logs',
  validate(visitorIdParamValidator),
  visitorController.getVisitorLogs
);

/**
 * @route   GET /api/v1/visitors/:id
 * @desc    Get detailed visitor record by ID
 * @access  Private (Admin / Resident)
 */
router.get(
  '/:id',
  validate(visitorIdParamValidator),
  visitorController.getVisitorById
);

/**
 * @route   PUT /api/v1/visitors/:id
 * @desc    Update visitor pass details
 *          - Resident can only update if status is 'pending'
 *          - Admin can update anytime
 * @access  Private (Admin / Resident)
 */
router.put(
  '/:id',
  handleVisitorPhotoUpload,
  validate(updateVisitorValidator),
  visitorController.updateVisitor
);

/**
 * @route   PATCH /api/v1/visitors/:id/status
 * @desc    Approve, reject, or update visitor pass status.
 *          Approving generates QR code and emails pass to resident.
 * @access  Private (Admin / Super Admin)
 */
router.patch(
  '/:id/status',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(updateVisitorStatusValidator),
  visitorController.updateVisitorStatus
);

/**
 * @route   DELETE /api/v1/visitors/:id
 * @desc    Soft delete visitor pass
 *          - Resident can only delete if status is 'pending'
 *          - Admin can delete anytime
 * @access  Private (Admin / Resident)
 */
router.delete(
  '/:id',
  validate(visitorIdParamValidator),
  visitorController.deleteVisitor
);

export default router;

