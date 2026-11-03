import complaintService from '../services/complaint.service.js';
import { success } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';

/**
 * Controller for Complaint Management Module
 */

/**
 * Get predefined complaint categories
 */
export const getCategories = async (req, res, next) => {
  try {
    const categories = await complaintService.getCategories();
    return success(res, 'Complaint categories retrieved successfully', categories);
  } catch (err) {
    next(err);
  }
};

/**
 * Create a new complaint (with optional attachments, WiFi fields)
 */
export const createComplaint = async (req, res, next) => {
  try {
    const files = req.filesList || [];
    const result = await complaintService.createComplaint(req.body, files, req.user);
    return success(res, 'Complaint registered successfully', result, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * List complaints (scoping based on role: Resident -> own, Admin -> property/branch)
 */
export const getComplaints = async (req, res, next) => {
  try {
    const result = await complaintService.getComplaints(req.user, req.query);
    return success(res, 'Complaints retrieved successfully', result.data, HTTP_STATUS.OK, result.pagination);
  } catch (err) {
    next(err);
  }
};

/**
 * Get complaint details by ID (with room info, attachments, timeline, feedback)
 */
export const getComplaintById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const complaint = await complaintService.getComplaintById(Number(id), req.user);
    return success(res, 'Complaint details retrieved successfully', complaint);
  } catch (err) {
    next(err);
  }
};

/**
 * Get complaint statistics and KPIs for Admin Dashboard
 */
export const getComplaintStats = async (req, res, next) => {
  try {
    const stats = await complaintService.getComplaintStats(req.user, req.query);
    return success(res, 'Complaint statistics retrieved successfully', stats);
  } catch (err) {
    next(err);
  }
};

/**
 * Assign complaint to staff / technician and set due date
 */
export const assignComplaint = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await complaintService.assignComplaint(Number(id), req.body, req.user);
    return success(res, result.message, result);
  } catch (err) {
    next(err);
  }
};

/**
 * Update complaint status (OPEN -> IN_PROGRESS -> RESOLVED)
 */
export const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await complaintService.updateStatus(Number(id), req.body, req.user);
    return success(res, result.message, result);
  } catch (err) {
    next(err);
  }
};

/**
 * Add note/message or progress update to timeline
 */
export const addUpdate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const files = req.filesList || [];
    const result = await complaintService.addUpdate(Number(id), req.body, files, req.user);
    return success(res, result.message, result);
  } catch (err) {
    next(err);
  }
};

/**
 * Submit resident feedback for resolved complaint
 */
export const submitFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await complaintService.submitFeedback(Number(id), req.body, req.user);
    return success(res, result.message, result, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export default {
  getCategories,
  createComplaint,
  getComplaints,
  getComplaintById,
  getComplaintStats,
  assignComplaint,
  updateStatus,
  addUpdate,
  submitFeedback,
};
