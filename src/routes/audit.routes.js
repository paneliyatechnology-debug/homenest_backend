import { Router } from 'express';
import auditController from '../controllers/audit.controller.js';
import {
  auditIdParamValidator,
  listAuditsQueryValidator,
  auditStatsQueryValidator,
} from '../validators/audit.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import ROLES from '../constants/roles.js';

const router = Router();

// All audit routes require authentication and Admin / Super Admin role
router.use(authenticate);
router.use(authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN));

/**
 * @route   GET /api/v1/audits/stats
 * @desc    Get KPI statistics cards for Administrative Activity Log (Total Activities, Today, Last 7 Days, Last 30 Days)
 * @access  Private (Admin / Super Admin)
 */
router.get(
  '/stats',
  validate(auditStatsQueryValidator),
  auditController.getAuditStats
);

/**
 * @route   GET /api/v1/audits/export
 * @desc    Export administrative activity logs to downloadable Excel (.xlsx) report
 * @access  Private (Admin / Super Admin)
 */
router.get(
  '/export',
  validate(listAuditsQueryValidator),
  auditController.exportAudits
);

/**
 * @route   GET /api/v1/audits
 * @desc    List paginated administrative activity logs with multi-field filtering (Modules, Actions, Users, Date Range, Search)
 * @access  Private (Admin / Super Admin)
 */
router.get(
  '/',
  validate(listAuditsQueryValidator),
  auditController.getAllAudits
);

/**
 * @route   GET /api/v1/audits/:id
 * @desc    Get single audit record details by ID (including before/after diffs & metadata)
 * @access  Private (Admin / Super Admin)
 */
router.get(
  '/:id',
  validate(auditIdParamValidator),
  auditController.getAuditById
);

export default router;
