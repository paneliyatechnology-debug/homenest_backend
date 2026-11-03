import laundryService from '../services/laundry.service.js';
import { success, successAction } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';

/**
 * Controller: Get laundry pricing catalog and pickup slot (Branch-wise or All Branches)
 */
export const getLaundryCatalog = async (req, res, next) => {
  try {
    const data = await laundryService.getLaundryCatalog(req.user, req.query);
    return success(res, 'Laundry catalog retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Update laundry catalog pricing (Branch-wise or All Branches Default)
 */
export const updateLaundryCatalog = async (req, res, next) => {
  try {
    const data = await laundryService.updateLaundryCatalog(req.user, req.body);
    return successAction(res, 'Laundry catalog updated successfully', data.branch_id || data.pg_id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Create new laundry request
 */
export const createLaundryRequest = async (req, res, next) => {
  try {
    const data = await laundryService.create(req.user, req.body);
    return successAction(res, 'Laundry request submitted successfully', data.id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Get all laundry requests with filtering and pagination
 */
export const getAllLaundryRequests = async (req, res, next) => {
  try {
    const { data, pagination } = await laundryService.findAll(req.user, req.query);
    return success(res, 'Laundry requests retrieved successfully', data, 200, pagination);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Get laundry request by ID
 */
export const getLaundryRequestById = async (req, res, next) => {
  try {
    const data = await laundryService.findById(req.params.id, req.user);
    return success(res, 'Laundry request details retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Get KPI statistics for laundry requests
 */
export const getLaundryStats = async (req, res, next) => {
  try {
    const data = await laundryService.getStats(req.user, req.query);
    return success(res, 'Laundry request statistics retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Update status of laundry request
 */
export const updateLaundryStatus = async (req, res, next) => {
  try {
    const data = await laundryService.updateStatus(req.params.id, req.user, req.body);
    return successAction(res, 'Laundry request status updated successfully', data.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Assign staff member to laundry request
 */
export const assignStaff = async (req, res, next) => {
  try {
    const data = await laundryService.assignStaff(req.params.id, req.user, req.body.assigned_to);
    return successAction(res, 'Staff member assigned successfully', data.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Cancel / Delete laundry request
 */
export const deleteLaundryRequest = async (req, res, next) => {
  try {
    await laundryService.remove(req.params.id, req.user);
    return successAction(res, 'Laundry request cancelled successfully', parseInt(req.params.id, 10), HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Get resident-wise laundry orders and payment history overview
 */
export const getResidentLaundryBilling = async (req, res, next) => {
  try {
    const targetResidentId = req.params.resident_id || req.query.resident_id;
    const data = await laundryService.getResidentLaundryBilling(req.user, targetResidentId);
    return success(res, 'Resident laundry billing summary retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Generate laundry payment invoice entries (Single or Bulk)
 */
export const createLaundryPaymentEntries = async (req, res, next) => {
  try {
    const data = await laundryService.createLaundryPaymentEntries(req.user, req.body);
    const paymentId = data.payments?.[0]?.id || null;
    return successAction(res, 'Laundry payment entry created successfully', paymentId, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Get residents list with their laundry details, summary, and payment status
 */
export const getAllResidentsWithLaundry = async (req, res, next) => {
  try {
    const { data, pagination } = await laundryService.findAllResidentsWithLaundry(req.user, req.query);
    return success(res, 'Laundry users list retrieved successfully', data, 200, pagination);
  } catch (err) {
    next(err);
  }
};

export const getLaundryUsers = getAllResidentsWithLaundry;

export default {
  getLaundryCatalog,
  updateLaundryCatalog,
  createLaundryRequest,
  getAllLaundryRequests,
  getLaundryRequestById,
  getLaundryStats,
  updateLaundryStatus,
  assignStaff,
  deleteLaundryRequest,
  getResidentLaundryBilling,
  createLaundryPaymentEntries,
  getAllResidentsWithLaundry,
  getLaundryUsers,
};
