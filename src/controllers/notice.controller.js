import noticeService from '../services/notice.service.js';
import { success, successAction, successMessage } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';

/**
 * Controller for Property Notice & Communication Management
 */

/**
 * Get Notice Dashboard KPI statistics (Screen 1 Cards)
 * Returns total notices, drafts, scheduled, and sent counts.
 */
export const getNoticeStats = async (req, res, next) => {
  try {
    const stats = await noticeService.getStats({
      user: req.user,
      pg_id: req.query.pg_id,
      branch_id: req.query.branch_id,
    });
    return success(res, 'Notice statistics retrieved successfully', stats);
  } catch (err) {
    next(err);
  }
};

/**
 * Get paginated notices list with tabs, filters, and search (Screen 1 Table)
 */
export const getAllNotices = async (req, res, next) => {
  try {
    const { notices, pagination } = await noticeService.findAll(req.user, req.query);
    return success(res, 'Notices retrieved successfully', notices, HTTP_STATUS.OK, pagination);
  } catch (err) {
    next(err);
  }
};

/**
 * Get single notice details by ID
 */
export const getNoticeById = async (req, res, next) => {
  try {
    const notice = await noticeService.findById(req.params.id, req.user);
    return success(res, 'Notice details retrieved successfully', notice);
  } catch (err) {
    next(err);
  }
};

/**
 * Create a new notice or schedule a communication (Screen 2 Form)
 * Response strictly carries success, message, and id.
 */
export const createNotice = async (req, res, next) => {
  try {
    const result = await noticeService.create(req.body, req.file, req.user);
    return successAction(res, 'Notice created successfully', result.id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * Update an existing notice
 * Response strictly carries success, message, and id.
 */
export const updateNotice = async (req, res, next) => {
  try {
    const result = await noticeService.update(req.params.id, req.body, req.file, req.user);
    return successAction(res, 'Notice updated successfully', result.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Soft delete a notice
 * Response strictly carries success, message, and id.
 */
export const deleteNotice = async (req, res, next) => {
  try {
    const result = await noticeService.remove(req.params.id, req.user);
    return successAction(res, 'Notice deleted successfully', result.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Immediately publish / send a draft or scheduled notice
 * Response strictly carries success, message, and id.
 */
export const sendNotice = async (req, res, next) => {
  try {
    const result = await noticeService.sendNow(req.params.id, req.user);
    return successAction(res, 'Notice sent to residents successfully', result.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Retrieve Resident Notification Center notices list (Mobile Screen 1)
 */
export const getResidentNotices = async (req, res, next) => {
  try {
    const { notices, meta } = await noticeService.getResidentNotices(req.user, req.query);
    return success(res, 'Notifications retrieved successfully', notices, HTTP_STATUS.OK, meta);
  } catch (err) {
    next(err);
  }
};

/**
 * Get Resident Notice Detail by ID and automatically mark as read (Mobile Screen 2)
 */
export const getResidentNoticeById = async (req, res, next) => {
  try {
    const notice = await noticeService.getResidentNoticeById(req.params.id, req.user);
    return success(res, 'Notice details retrieved successfully', notice);
  } catch (err) {
    next(err);
  }
};

/**
 * Mark a single notice as read by resident
 */
export const markNoticeRead = async (req, res, next) => {
  try {
    await noticeService.markAsRead(req.params.id, req.user);
    return successAction(res, 'Notice marked as read', Number(req.params.id), HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Mark all notices as read for the authenticated resident
 */
export const markAllNoticesRead = async (req, res, next) => {
  try {
    await noticeService.markAllAsRead(req.user);
    return successMessage(res, 'All notices marked as read', HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

export default {
  getNoticeStats,
  getAllNotices,
  getNoticeById,
  createNotice,
  updateNotice,
  deleteNotice,
  sendNotice,
  getResidentNotices,
  getResidentNoticeById,
  markNoticeRead,
  markAllNoticesRead,
};

