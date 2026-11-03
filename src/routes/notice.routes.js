import { Router } from 'express';
import * as noticeController from '../controllers/notice.controller.js';
import {
  createNoticeValidator,
  updateNoticeValidator,
  queryNoticesValidator,
  queryResidentNoticesValidator,
} from '../validators/notice.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { handleNoticeAttachmentUpload } from '../middlewares/upload.middleware.js';
import ROLES from '../constants/roles.js';

const router = Router();

// All notice routes require authentication
router.use(authenticate);

// ==========================================
// Resident Mobile Notification Center Routes
// (Placed before /:id param routes)
// ==========================================

/**
 * @route   GET /api/v1/notices/resident
 * @desc    Get resident notification center notices list with category pills & read status
 * @access  Private (Resident, Admin, Super Admin)
 */
router.get(
  '/resident',
  validate(queryResidentNoticesValidator),
  noticeController.getResidentNotices
);

/**
 * @route   PATCH /api/v1/notices/resident/read-all
 * @desc    Mark all notices as read for authenticated resident
 * @access  Private (Resident)
 */
router.patch(
  '/resident/read-all',
  noticeController.markAllNoticesRead
);

/**
 * @route   GET /api/v1/notices/resident/:id
 * @desc    Get notice details for resident and mark as read
 * @access  Private (Resident, Admin, Super Admin)
 */
router.get(
  '/resident/:id',
  noticeController.getResidentNoticeById
);

/**
 * @route   PATCH /api/v1/notices/resident/:id/read
 * @desc    Mark single notice as read by resident
 * @access  Private (Resident)
 */
router.patch(
  '/resident/:id/read',
  noticeController.markNoticeRead
);

// ==========================================
// Admin Notice Management Routes
// ==========================================

/**
 * @route   GET /api/v1/notices/stats
 * @desc    Get notice dashboard KPI statistics (Total, Drafts, Scheduled, Sent)
 * @access  Private (Admin / Super Admin / Branch Manager)
 */
router.get(
  '/stats',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  noticeController.getNoticeStats
);

/**
 * @route   GET /api/v1/notices
 * @desc    List notices with tab filtering (All, Drafts, Scheduled, Sent) and search
 * @access  Private (Admin / Super Admin / Branch Manager)
 */
router.get(
  '/',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  validate(queryNoticesValidator),
  noticeController.getAllNotices
);

/**
 * @route   POST /api/v1/notices
 * @desc    Create a new notice or schedule communication (Screen 2 Form)
 * @access  Private (Admin / Super Admin / Branch Manager)
 */
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  handleNoticeAttachmentUpload,
  validate(createNoticeValidator),
  noticeController.createNotice
);

/**
 * @route   GET /api/v1/notices/:id
 * @desc    Get notice details by ID
 * @access  Private (Admin / Super Admin / Branch Manager)
 */
router.get(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  noticeController.getNoticeById
);

/**
 * @route   PUT /api/v1/notices/:id
 * @desc    Update notice details or schedule
 * @access  Private (Admin / Super Admin / Branch Manager)
 */
router.put(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  handleNoticeAttachmentUpload,
  validate(updateNoticeValidator),
  noticeController.updateNotice
);

/**
 * @route   DELETE /api/v1/notices/:id
 * @desc    Soft delete a notice
 * @access  Private (Admin / Super Admin / Branch Manager)
 */
router.delete(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  noticeController.deleteNotice
);

/**
 * @route   POST /api/v1/notices/:id/send
 * @desc    Immediately publish / send a draft or scheduled notice
 * @access  Private (Admin / Super Admin / Branch Manager)
 */
router.post(
  '/:id/send',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  noticeController.sendNotice
);

export default router;

