import floorService from '../services/floor.service.js';
import buildingService from '../services/building.service.js';
import { success, successAction, AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';

export const createFloor = async (req, res, next) => {
  try {
    const { building_id } = req.body;
    const building = await buildingService.findById(building_id);
    if (!building) {
      throw new AppError('Building not found', HTTP_STATUS.NOT_FOUND);
    }

    if (req.user.role === ROLES.ADMIN && building.owner_id !== req.user.id) {
      throw new AppError('Access denied to add floors to this building', HTTP_STATUS.FORBIDDEN);
    }

    const pg_id = req.body.pg_id ? Number(req.body.pg_id) : building.pg_id;
    const floor = await floorService.create({ ...req.body, pg_id });
    return successAction(res, 'Floor created successfully', floor.id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const getAllFloors = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const owner_id = is_admin ? req.user.id : undefined;
    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);
    const branch_id = req.query.branch_id ? Number(req.query.branch_id) : undefined;
    const building_id = req.query.building_id ? Number(req.query.building_id) : undefined;

    const { search, page, limit } = req.query;

    const { floors, pagination } = await floorService.findAll({
      pg_id,
      branch_id,
      building_id,
      owner_id,
      search,
      page,
      limit,
    });

    return success(res, 'Floors retrieved successfully', floors, HTTP_STATUS.OK, pagination);
  } catch (err) {
    next(err);
  }
};

export const getFloorById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const floor = await floorService.findById(id);

    if (!floor) {
      throw new AppError('Floor not found', HTTP_STATUS.NOT_FOUND);
    }

    if (req.user.role === ROLES.ADMIN && floor.owner_id !== req.user.id) {
      throw new AppError('Access denied to this floor', HTTP_STATUS.FORBIDDEN);
    }

    return success(res, 'Floor retrieved successfully', floor);
  } catch (err) {
    next(err);
  }
};

export const updateFloor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const floor = await floorService.findById(id);

    if (!floor) {
      throw new AppError('Floor not found', HTTP_STATUS.NOT_FOUND);
    }

    if (req.user.role === ROLES.ADMIN && floor.owner_id !== req.user.id) {
      throw new AppError('Access denied to update this floor', HTTP_STATUS.FORBIDDEN);
    }

    const updated = await floorService.update(id, req.body);
    return successAction(res, 'Floor updated successfully', updated.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

export const deleteFloor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const floor = await floorService.findById(id);

    if (!floor) {
      throw new AppError('Floor not found', HTTP_STATUS.NOT_FOUND);
    }

    if (req.user.role === ROLES.ADMIN && floor.owner_id !== req.user.id) {
      throw new AppError('Access denied to delete this floor', HTTP_STATUS.FORBIDDEN);
    }

    await floorService.remove(id);
    return successAction(res, 'Floor deleted successfully', parseInt(id, 10), HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

export default {
  createFloor,
  getAllFloors,
  getFloorById,
  updateFloor,
  deleteFloor,
};

