import agreementService from '../services/agreement.service.js';
import { success, successAction, AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';

/**
 * Controller managing Resident Agreement Records.
 */

/**
 * Create a new agreement record.
 * Returns strictly success, message, and id.
 */
export const createAgreement = async (req, res, next) => {
  try {
    const pg_id = req.body.pg_id ? Number(req.body.pg_id) : req.pg_id;
    if (!pg_id) {
      throw new AppError('PG facility ID is required. Please specify a PG or log in under a PG owner account', HTTP_STATUS.BAD_REQUEST);
    }

    const agreement = await agreementService.create({
      ...req.body,
      pg_id,
    });
    return successAction(res, 'Agreement created successfully', agreement.id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * Get all agreement records with filtering, searching, and pagination.
 */
export const getAllAgreements = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const is_resident = req.user.role === ROLES.RESIDENT;

    const owner_id = is_admin ? req.user.id : undefined;
    const resident_id = is_resident ? req.user.id : (req.query.resident_id || undefined);

    const {
      status,
      agreement_type,
      search,
      page = 1,
      limit = 10,
    } = req.query;

    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);

    const { agreements, pagination } = await agreementService.findAll({
      owner_id,
      resident_id,
      pg_id,
      status,
      agreement_type,
      search,
      page,
      limit,
    });

    return success(res, 'Agreements fetched successfully', agreements, HTTP_STATUS.OK, pagination);
  } catch (err) {
    next(err);
  }
};

/**
 * Get a specific agreement record by ID.
 */
export const getAgreementById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const agreement = await agreementService.findById(id);

    if (!agreement) {
      throw new AppError('Agreement record not found', HTTP_STATUS.NOT_FOUND);
    }

    // Role-based permission check
    const is_owner = req.user.role === ROLES.ADMIN && agreement.owner_id === req.user.id;
    const is_resident = req.user.role === ROLES.RESIDENT && agreement.resident_id === req.user.id;
    const is_super_admin = req.user.role === ROLES.SUPER_ADMIN;

    if (!is_owner && !is_resident && !is_super_admin) {
      throw new AppError('Access denied to this agreement record', HTTP_STATUS.FORBIDDEN);
    }

    return success(res, 'Agreement retrieved successfully', agreement);
  } catch (err) {
    next(err);
  }
};

/**
 * Update an agreement record by ID.
 * Returns strictly success, message, and id.
 */
export const updateAgreement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const agreement = await agreementService.findById(id);

    if (!agreement) {
      throw new AppError('Agreement record not found', HTTP_STATUS.NOT_FOUND);
    }

    if (req.user.role === ROLES.ADMIN && agreement.owner_id !== req.user.id) {
      throw new AppError('Access denied to update this agreement record', HTTP_STATUS.FORBIDDEN);
    }

    const updated = await agreementService.update(id, req.body);
    return successAction(res, 'Agreement updated successfully', updated.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Delete an agreement record by ID.
 * Returns strictly success, message, and id.
 */
export const deleteAgreement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const agreement = await agreementService.findById(id);

    if (!agreement) {
      throw new AppError('Agreement record not found', HTTP_STATUS.NOT_FOUND);
    }

    if (req.user.role === ROLES.ADMIN && agreement.owner_id !== req.user.id) {
      throw new AppError('Access denied to delete this agreement record', HTTP_STATUS.FORBIDDEN);
    }

    await agreementService.remove(id);
    return successAction(res, 'Agreement deleted successfully', parseInt(id, 10), HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Get KPI statistical counts for agreements (Total Agreements, Draft, Pending Sign, Signed, Expired).
 * Supports optional filtering by pg_id (branch) and agreement_type.
 */
export const getAgreementStats = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const is_resident = req.user.role === ROLES.RESIDENT;

    const owner_id = is_admin ? req.user.id : undefined;
    const resident_id = is_resident ? req.user.id : (req.query.resident_id || undefined);
    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);
    const agreement_type = req.query.agreement_type || undefined;

    const stats = await agreementService.getStats({
      owner_id,
      resident_id,
      pg_id,
      agreement_type,
    });
    return success(res, 'Agreement statistics retrieved successfully', stats);
  } catch (err) {
    next(err);
  }
};

export default {
  createAgreement,
  getAllAgreements,
  getAgreementById,
  updateAgreement,
  deleteAgreement,
  getAgreementStats,
};

