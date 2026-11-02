import { Router } from 'express';
import complaintController from '../controllers/complaint.controller.js';
import {
  createComplaintValidator,
  complaintIdParamValidator,
  listComplaintsQueryValidator,
  updateStatusValidator,
  assignComplaintValidator,
  addComplaintUpdateValidator,
  submitComplaintFeedbackValidator,
} from '../validators/complaint.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { handleComplaintAttachmentsUpload } from '../middlewares/upload.middleware.js';
import ROLES from '../constants/roles.js';

const router = Router();

// All complaint endpoints require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/complaints/categories
 * @desc    Get all predefined complaint categories
 * @access  Private (Resident / Admin / Super Admin)
 */
router.get(
  '/categories',
  complaintController.getCategories
);

/**
 * @route   GET /api/v1/complaints/stats
 * @desc    Get complaint KPIs/statistics (total, open, in_progress, resolved, overdue, by priority)
 * @access  Private (Admin / Super Admin)
 */
router.get(
  '/stats',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  complaintController.getComplaintStats
);

/**
 * @route   GET /api/v1/complaints
 * @desc    Get complaints list (Residents see own; Admins see branch/PG complaints)
 * @access  Private (Resident / Admin / Super Admin)
 */
router.get(
  '/',
  validate(listComplaintsQueryValidator),
  complaintController.getComplaints
);

/**
 * @route   POST /api/v1/complaints
 * @desc    Create a new complaint (with optional attachments, WiFi fields)
 * @access  Private (Resident / Admin / Super Admin)
 */
router.post(
  '/',
  handleComplaintAttachmentsUpload,
  validate(createComplaintValidator),
  complaintController.createComplaint
);

/**
 * @route   GET /api/v1/complaints/:id
 * @desc    Get complaint details by ID (with room info, attachments, timeline, feedback)
 * @access  Private (Resident / Admin / Super Admin)
 */
router.get(
  '/:id',
  validate(complaintIdParamValidator),
  complaintController.getComplaintById
);

/**
 * @route   PATCH /api/v1/complaints/:id/assignment
 * @desc    Assign or reassign complaint to staff with optional due date
 * @access  Private (Admin / Super Admin)
 */
router.patch(
  '/:id/assignment',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(assignComplaintValidator),
  complaintController.assignComplaint
);

/**
 * @route   PATCH /api/v1/complaints/:id/status
 * @desc    Update complaint status (OPEN -> IN_PROGRESS -> RESOLVED) with optional resolution notes
 * @access  Private (Admin / Super Admin)
 */
router.patch(
  '/:id/status',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(updateStatusValidator),
  complaintController.updateStatus
);

/**
 * @route   POST /api/v1/complaints/:id/updates
 * @desc    Add a message/note or update to complaint timeline with optional image attachments
 * @access  Private (Resident / Admin / Super Admin)
 */
router.post(
  '/:id/updates',
  handleComplaintAttachmentsUpload,
  validate(addComplaintUpdateValidator),
  complaintController.addUpdate
);

/**
 * @route   POST /api/v1/complaints/:id/feedback
 * @desc    Submit feedback/rating for a resolved complaint
 * @access  Private (Resident)
 */
router.post(
  '/:id/feedback',
  authorize(ROLES.RESIDENT),
  validate(submitComplaintFeedbackValidator),
  complaintController.submitFeedback
);

export default router;

