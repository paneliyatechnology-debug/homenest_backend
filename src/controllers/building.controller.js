import buildingService from '../services/building.service.js';
import { success, successAction, AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';

export const createBuilding = async (req, res, next) => {
  try {
    const pg_id = req.body.pg_id ? Number(req.body.pg_id) : req.pg_id;
    if (!pg_id) {
      throw new AppError(
        'Branch (PG ID) is required. Please provide pg_id or login under a PG owner account',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const building = await buildingService.create({ ...req.body, pg_id });
    return successAction(res, 'Building created successfully', building.id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const getAllBuildings = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const owner_id = is_admin ? req.user.id : undefined;
    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);

    const { search, status, page, limit } = req.query;

    const { buildings, pagination } = await buildingService.findAll({
      pg_id,
      owner_id,
      search,
      status,
      page,
      limit,
    });

    return success(res, 'Buildings retrieved successfully', buildings, HTTP_STATUS.OK, pagination);
  } catch (err) {
    next(err);
  }
};

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
    return successAction(res, 'Building updated successfully', updated.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

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
    return successAction(res, 'Building deleted successfully', parseInt(id, 10), HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

export default {
  createBuilding,
  getAllBuildings,
  getBuildingById,
  updateBuilding,
  deleteBuilding,
};

