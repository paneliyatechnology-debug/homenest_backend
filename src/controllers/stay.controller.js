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

export default {
  getMyStays,
  getStayById,
  vacateStay,
};
