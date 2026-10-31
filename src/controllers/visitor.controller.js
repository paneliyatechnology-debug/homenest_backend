import visitorService from '../services/visitor.service.js';
import { success, successAction, AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';

/**
 * Controller managing Visitor Passes, Approvals, and Gate Access.
 */

/**
 * Get KPI dashboard statistics for Visitors
 */
export const getVisitorStats = async (req, res, next) => {
  try {
    const is_admin = [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(req.user.role);
    const is_resident = req.user.role === ROLES.RESIDENT;

    const owner_id = is_admin && req.user.role === ROLES.ADMIN ? req.user.id : undefined;
    const resident_id = is_resident ? req.user.id : (req.query.resident_id ? Number(req.query.resident_id) : undefined);
    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);
    const branch_id = req.query.branch_id ? Number(req.query.branch_id) : undefined;

    const stats = await visitorService.getStats({
      owner_id,
      resident_id,
      pg_id,
      branch_id,
    });

    return success(res, 'Visitor statistics retrieved successfully', stats);
  } catch (err) {
    next(err);
  }
};

/**
 * List visitor records with filters, search, and pagination.
 * Shared endpoint for Admin and Resident:
 * - Admin sees all visitors across their property/branch
 * - Resident sees only their own visitors
 */
export const getAllVisitors = async (req, res, next) => {
  try {
    const is_admin = [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(req.user.role);
    const is_resident = req.user.role === ROLES.RESIDENT;

    const owner_id = is_admin && req.user.role === ROLES.ADMIN ? req.user.id : undefined;
    const resident_id = is_resident ? req.user.id : (req.query.resident_id ? Number(req.query.resident_id) : undefined);
    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);
    const branch_id = req.query.branch_id ? Number(req.query.branch_id) : undefined;

    const {
      status,
      purpose,
      start_date,
      end_date,
      search,
      page = 1,
      limit = 10,
    } = req.query;

    const { visitors, pagination } = await visitorService.findAll({
      owner_id,
      resident_id,
      pg_id,
      branch_id,
      status,
      purpose,
      start_date,
      end_date,
      search,
      page,
      limit,
    });

    return success(res, 'Visitors retrieved successfully', visitors, HTTP_STATUS.OK, pagination);
  } catch (err) {
    next(err);
  }
};

/**
 * Get visitor record details by ID
 */
export const getVisitorById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const visitor = await visitorService.findById(id, req.user);

    return success(res, 'Visitor details retrieved successfully', visitor);
  } catch (err) {
    next(err);
  }
};

/**
 * Create a new visitor pass / request
 * - If Resident creates: Status is automatically 'pending' (requires admin approval)
 * - If Admin creates: Automatically 'approved' (or admin choice) and generates pass code & QR
 */
export const createVisitor = async (req, res, next) => {
  try {
    const visitor = await visitorService.create(req.body, req.user, req.file);

    const message = req.user.role === ROLES.RESIDENT
      ? 'Visitor request submitted successfully and is awaiting admin approval'
      : 'Visitor pass created and approved successfully';

    return successAction(res, message, visitor.id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * Update visitor pass details
 * - Residents can only update if status is 'pending'
 * - Admins can update at any time
 */
export const updateVisitor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await visitorService.update(id, req.body, req.user, req.file);

    return successAction(res, 'Visitor pass updated successfully', updated.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Change visitor pass status (Approve, Reject, In Office, Left)
 * Admin only. When approved, generates pass code and sends pass with QR code to resident email.
 */
export const updateVisitorStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

    const updated = await visitorService.updateStatus(id, { status, admin_notes }, req.user);

    return successAction(res, `Visitor status updated to ${status} successfully`, updated.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Scan QR Code for Gate Entry / Exit Tracking
 * - If Approved: Records Entry time & marks In Office
 * - If In Office: Records Exit time & marks Left
 */
export const scanVisitorQr = async (req, res, next) => {
  try {
    const { pass_code, gate_name, notes } = req.body;
    const result = await visitorService.scanQrCode(pass_code, req.user, { gate_name, notes });

    const message = result.action === 'ENTRY'
      ? `Visitor entry #${result.total_entries} recorded successfully at ${result.log_time}. Status updated to In Office.`
      : `Visitor exit recorded successfully at ${result.log_time}. Status updated to Left.`;

    return success(res, message, result);
  } catch (err) {
    next(err);
  }
};

/**
 * Get all movement logs (entries and exits) for a specific visitor pass
 */
export const getVisitorLogs = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await visitorService.getVisitorLogs(id, req.user);

    return success(res, 'Visitor movement logs retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * Real-time Gate monitoring: list all visitor entry & exit activity across property / branch
 */
export const getGateLogs = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const owner_id = is_admin ? req.user.id : undefined;
    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);
    const branch_id = req.query.branch_id ? Number(req.query.branch_id) : undefined;
    const visitor_id = req.query.visitor_id ? Number(req.query.visitor_id) : undefined;
    const resident_id = req.query.resident_id ? Number(req.query.resident_id) : undefined;
    const { type, date, search, page, limit } = req.query;

    const { logs, pagination } = await visitorService.getGateLogs({
      owner_id,
      pg_id,
      branch_id,
      visitor_id,
      resident_id,
      type,
      date,
      search,
      page,
      limit,
    });

    return success(res, 'Gate activity logs retrieved successfully', logs, HTTP_STATUS.OK, pagination);
  } catch (err) {
    next(err);
  }
};

/**
 * Delete visitor pass (Soft delete)
 * - Residents can only delete if status is 'pending'
 * - Admins can delete at any time
 */
export const deleteVisitor = async (req, res, next) => {
  try {
    const { id } = req.params;
    await visitorService.delete(id, req.user);

    return successAction(res, 'Visitor pass deleted successfully', parseInt(id, 10), HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

export default {
  getVisitorStats,
  getAllVisitors,
  getVisitorById,
  createVisitor,
  updateVisitor,
  updateVisitorStatus,
  scanVisitorQr,
  getVisitorLogs,
  getGateLogs,
  deleteVisitor,
};

