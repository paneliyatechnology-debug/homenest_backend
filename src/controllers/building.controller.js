import buildingService from '../services/building.service.js';
import { success, successAction, AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';
import { formatResponseDates } from '../utils/date.js';

/**
 * Get KPI statistical counts for buildings (Total Buildings, Total Floors, Total Rooms, Occupied Rooms, Vacant Rooms)
 * @route GET /api/v1/buildings/stats
 * @access Private
 */
export const getBuildingStats = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const stats = await buildingService.getStats({
      user: req.user,
      pg_id: req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined),
      branch_id: req.query.branch_id,
    });

    return success(res, 'Building statistics retrieved successfully', stats);
  } catch (err) {
    next(err);
  }
};

/**
 * Create a new building and assign its floors array in one request
 * @route POST /api/v1/buildings
 */
export const createBuilding = async (req, res, next) => {
  try {
    let pg_id = req.body.pg_id ? Number(req.body.pg_id) : req.pg_id;
    const branch_id = req.body.branch_id ? Number(req.body.branch_id) : undefined;

    if (!pg_id && req.resolved_branch) {
      pg_id = req.resolved_branch.pg_id;
    }

    if (!pg_id) {
      throw new AppError(
        'Branch (PG ID) is required. Please provide pg_id or login under a PG owner account',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const building = await buildingService.create({ ...req.body, pg_id, branch_id });

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Building created successfully with assigned floors',
      id: building.id,
      data: formatResponseDates(building),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * List all buildings with nested floors array and room counts
 * @route GET /api/v1/buildings
 */
export const getAllBuildings = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const owner_id = is_admin ? req.user.id : undefined;
    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);
    const branch_id = req.query.branch_id ? Number(req.query.branch_id) : undefined;

    const { search, page, limit } = req.query;

    const { buildings, pagination } = await buildingService.findAll({
      pg_id,
      branch_id,
      owner_id,
      search,
      page,
      limit,
    });

    return success(res, 'Buildings retrieved successfully', buildings, HTTP_STATUS.OK, pagination);
  } catch (err) {
    next(err);
  }
};

/**
 * Get single building details with its nested floors array
 * @route GET /api/v1/buildings/:id
 */
export const getBuildingById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const building = await buildingService.findById(id);

    if (!building) {
      throw new AppError('Building not found', HTTP_STATUS.NOT_FOUND);
    }

    if (req.user.role === ROLES.ADMIN && building.owner_id !== req.user.id) {
      throw new AppError('Access denied to this building', HTTP_STATUS.FORBIDDEN);
    }

    return success(res, 'Building retrieved successfully', building);
  } catch (err) {
    next(err);
  }
};

/**
 * Update building details and synchronize its assigned floors array
 * @route PUT /api/v1/buildings/:id
 */
export const updateBuilding = async (req, res, next) => {
  try {
    const { id } = req.params;
    const building = await buildingService.findById(id);

    if (!building) {
      throw new AppError('Building not found', HTTP_STATUS.NOT_FOUND);
    }

    if (req.user.role === ROLES.ADMIN && building.owner_id !== req.user.id) {
      throw new AppError('Access denied to update this building', HTTP_STATUS.FORBIDDEN);
    }

    const updated = await buildingService.update(id, req.body);
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Building and floors updated successfully',
      id: updated.id,
      data: formatResponseDates(updated),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Soft delete building and all its assigned floors
 * @route DELETE /api/v1/buildings/:id
 */
export const deleteBuilding = async (req, res, next) => {
  try {
    const { id } = req.params;
    const building = await buildingService.findById(id);

    if (!building) {
      throw new AppError('Building not found', HTTP_STATUS.NOT_FOUND);
    }

    if (req.user.role === ROLES.ADMIN && building.owner_id !== req.user.id) {
      throw new AppError('Access denied to delete this building', HTTP_STATUS.FORBIDDEN);
    }

    await buildingService.remove(id);
    return successAction(res, 'Building and associated floors deleted successfully', id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

export default {
  getBuildingStats,
  createBuilding,
  getAllBuildings,
  getBuildingById,
  updateBuilding,
  deleteBuilding,
};
