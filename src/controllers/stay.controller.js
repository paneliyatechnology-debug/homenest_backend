import stayService from '../services/stay.service.js';
import { success, successAction } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';

/**
 * ============================================================================
 * CHECKOUT & REFUND APPROVALS CONTROLLERS
 * ============================================================================
 */

/**
 * Retrieve resident departure preview, including pending rent, unbilled laundry dues, and security deposit refund calculation.
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
 * Submit a formal departure checkout request with planned vacation date, reason, and bank refund details.
 */
export const createCheckoutRequest = async (req, res, next) => {
  try {
    const data = await stayService.createCheckoutRequest(req.user, req.body);
    return successAction(res, 'Checkout request submitted successfully', data.id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * Retrieve paginated checkout departure requests with filter tabs (all, pending, approved, completed, rejected).
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
 * Update checkout request review status, inspection clearance checklist, NOC issuance, and security deposit refund.
 */
export const updateCheckoutStatus = async (req, res, next) => {
  try {
    const data = await stayService.updateCheckoutStatus(req.params.id, req.user, req.body);
    return successAction(res, 'Checkout request status updated successfully', data.id, HTTP_STATUS.OK);
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
    return successAction(res, 'Checkout request cancelled successfully', parseInt(req.params.id, 10), HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

export default {
  getCheckoutReview,
  createCheckoutRequest,
  getAllCheckoutRequests,
  exportCheckouts,
  getCheckoutRequestById,
  updateCheckoutStatus,
  deleteCheckoutRequest,
};
