import stayService from '../services/stay.service.js';
import { success, successAction, AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';

/**
 * Get logged-in resident's stay timeline across multiple PGs.
 * Supports pagination and filtering (status, pg_id, search).
 */
export const getMyStays = async (req, res, next) => {
  try {
    const resident_id = req.user.id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : '';
    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : null;
    const search = req.query.search ? String(req.query.search).trim() : '';

    const { stays, pagination } = await stayService.getResidentStayHistory(resident_id, {
      status,
      pg_id,
      search,
      page,
      limit,
    });

    return success(res, 'Resident stay records retrieved successfully', stays, HTTP_STATUS.OK, pagination);
  } catch (err) {
    next(err);
  }
};

/**
 * Get stay record by ID.
 */
export const getStayById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const stay = await stayService.findById(id);

    if (!stay) {
      throw new AppError('Stay record not found', HTTP_STATUS.NOT_FOUND);
    }

    const is_resident = req.user.id === stay.resident_id;
    const is_owner = req.user.id === stay.owner_id;
    const is_super_admin = req.user.role === ROLES.SUPER_ADMIN;

    if (!is_resident && !is_owner && !is_super_admin) {
      throw new AppError('Access denied to this stay record', HTTP_STATUS.FORBIDDEN);
    }

    return success(res, 'Stay details retrieved successfully', stay);
  } catch (err) {
    next(err);
  }
};

/**
 * Check-out / vacate resident from PG stay.
 * Response carries only success, message, and id.
 */
export const vacateStay = async (req, res, next) => {
  try {
    const { id } = req.params;
    const stay = await stayService.findById(id);

    if (!stay) {
      throw new AppError('Stay record not found', HTTP_STATUS.NOT_FOUND);
    }

    if (req.user.role !== ROLES.SUPER_ADMIN && req.user.id !== stay.owner_id) {
      throw new AppError('You do not have permission to vacate this stay', HTTP_STATUS.FORBIDDEN);
    }

    const updated_stay = await stayService.vacateStay(id, req.body);

    return successAction(res, 'Resident successfully checked out / vacated from PG', updated_stay.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * ============================================================================
 * CHECKOUT & REFUND APPROVALS CONTROLLERS
 * ============================================================================
 */

/**
 * Controller: Get resident checkout review, pending dues calculation & NOC preview (Image 1 Screen 2)
 */
export const getCheckoutReview = async (req, res, next) => {
  try {
    const data = await stayService.getCheckoutReview(req.user, req.query);
    return success(res, 'Checkout review and NOC calculations retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Submit checkout departure request (Image 1 Screen 1 & Screen 2)
 */
export const createCheckoutRequest = async (req, res, next) => {
  try {
    const data = await stayService.createCheckoutRequest(req.user, req.body);
    return success(res, 'Checkout request submitted successfully', data, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: List checkout requests for Admin Portal with tabs, filters, and export (Image 2 Web Table)
 */
export const getAllCheckoutRequests = async (req, res, next) => {
  try {
    const result = await stayService.findAllCheckoutRequests(req.user, req.query);

    // If an export file (Excel or PDF) was requested
    if (result.is_export) {
      const message = result.data.format === 'pdf'
        ? 'Checkout and refund approvals PDF report generated successfully'
        : 'Checkout and refund approvals Excel report generated successfully';

      return success(res, message, result.data);
    }

    const { data, summary, total_records } = result;
    return success(res, 'Checkout requests retrieved successfully', data, HTTP_STATUS.OK, {
      total_records: total_records ?? (Array.isArray(data) ? data.length : 0),
      summary,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Export checkout and refund approvals report as Excel (.xlsx) or PDF (.pdf) based on format query param
 */
export const exportCheckouts = async (req, res, next) => {
  try {
    const rawFormat = (req.query.format || 'excel').toLowerCase();
    const format = rawFormat === 'pdf' ? 'pdf' : 'excel';

    const result = await stayService.findAllCheckoutRequests(req.user, {
      ...req.query,
      format,
    });

    const message = format === 'pdf'
      ? 'Checkout and refund approvals PDF report generated successfully'
      : 'Checkout and refund approvals Excel report generated successfully';

    return success(res, message, result.data);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Get checkout request details by ID
 */
export const getCheckoutRequestById = async (req, res, next) => {
  try {
    const data = await stayService.findCheckoutRequestById(req.params.id, req.user);
    return success(res, 'Checkout request details retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Update checkout request status, checklist, NOC, and refund approval (Image 2 & Stepper)
 */
export const updateCheckoutStatus = async (req, res, next) => {
  try {
    const data = await stayService.updateCheckoutStatus(req.params.id, req.user, req.body);
    return success(res, 'Checkout request status updated successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Cancel or delete checkout request
 */
export const deleteCheckoutRequest = async (req, res, next) => {
  try {
    const data = await stayService.deleteCheckoutRequest(req.params.id, req.user);
    return success(res, 'Checkout request cancelled successfully', data);
  } catch (err) {
    next(err);
  }
};

export default {
  getMyStays,
  getStayById,
  vacateStay,
  getCheckoutReview,
  createCheckoutRequest,
  getAllCheckoutRequests,
  exportCheckouts,
  getCheckoutRequestById,
  updateCheckoutStatus,
  deleteCheckoutRequest,
};
