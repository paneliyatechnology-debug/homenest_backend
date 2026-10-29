import roomService from '../services/room.service.js';
import { success, successAction, AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';

/**
 * Controller for managing Room Inventory, Allocations, and Floor Plans.
 */

/**
 * Create a new room in a PG branch.
 * Supports image file upload via multer or image filename in request body.
 * Response carries strictly success, message, and id.
 */
export const createRoom = async (req, res, next) => {
  try {
    if (req.file) {
      req.body.image = req.file.filename;
    }

    const pg_id = req.body.pg_id ? Number(req.body.pg_id) : req.pg_id;
    if (!pg_id) {
      throw new AppError('Branch (PG ID) is required. Please select a PG facility or login under a PG owner account', HTTP_STATUS.BAD_REQUEST);
    }

    const room = await roomService.create({ ...req.body, pg_id });
    return successAction(res, 'Room created successfully', room.id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * Get paginated list of rooms with filters for branch, status, room type, and room number search.
 */
export const getAllRooms = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const owner_id = is_admin ? req.user.id : undefined;

    const {
      status,
      room_type,
      building_id,
      floor_id,
      search,
      page,
      limit,
    } = req.query;

    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);

    const { rooms, pagination } = await roomService.findAll({
      owner_id,
      pg_id,
      status,
      room_type,
      building_id,
      floor_id,
      search,
      page,
      limit,
    });

    return success(res, 'Rooms fetched successfully', rooms, HTTP_STATUS.OK, pagination);
  } catch (err) {
    next(err);
  }
};

/**
 * Get room details by ID.
 */
export const getRoomById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const room = await roomService.findById(id);

    if (!room) {
      throw new AppError('Room not found', HTTP_STATUS.NOT_FOUND);
    }

    // Role check: Admin can only view rooms belonging to their PGs
    if (req.user.role === ROLES.ADMIN && room.owner_id !== req.user.id) {
      throw new AppError('Access denied to this room facility', HTTP_STATUS.FORBIDDEN);
    }

    return success(res, 'Room retrieved successfully', room);
  } catch (err) {
    next(err);
  }
};

/**
 * Update room details.
 * Supports updating image via file upload or filename string.
 * Response carries strictly success, message, and id.
 */
export const updateRoom = async (req, res, next) => {
  try {
    const { id } = req.params;
    const room = await roomService.findById(id);

    if (!room) {
      throw new AppError('Room not found', HTTP_STATUS.NOT_FOUND);
    }

    if (req.user.role === ROLES.ADMIN && room.owner_id !== req.user.id) {
      throw new AppError('Access denied to update this room facility', HTTP_STATUS.FORBIDDEN);
    }

    if (req.file) {
      req.body.image = req.file.filename;
    }

    const updated_room = await roomService.update(id, req.body);
    return successAction(res, 'Room updated successfully', updated_room.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Delete a room by ID.
 * Response carries strictly success, message, and id.
 */
export const deleteRoom = async (req, res, next) => {
  try {
    const { id } = req.params;
    const room = await roomService.findById(id);

    if (!room) {
      throw new AppError('Room not found', HTTP_STATUS.NOT_FOUND);
    }

    if (req.user.role === ROLES.ADMIN && room.owner_id !== req.user.id) {
      throw new AppError('Access denied to delete this room facility', HTTP_STATUS.FORBIDDEN);
    }

    await roomService.remove(id);
    return successAction(res, 'Room deleted successfully', parseInt(id, 10), HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Get KPI statistical counts for rooms (Total, Occupied, Vacant, Maintenance, Out of Service).
 */
export const getRoomStats = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const owner_id = is_admin ? req.user.id : undefined;
    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);

    const stats = await roomService.getStats({ owner_id, pg_id });
    return success(res, 'Room statistics retrieved successfully', stats);
  } catch (err) {
    next(err);
  }
};

/**
 * Get distinct room building names and their floor lists.
 * Supports filtering by pg_id (or defaults automatically from JWT access_token).
 */
export const getRoomBuildings = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const owner_id = is_admin ? req.user.id : undefined;
    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);

    const buildings = await roomService.getBuildingsAndFloors({ owner_id, pg_id });
    return success(res, 'Room buildings and floors retrieved successfully', buildings);
  } catch (err) {
    next(err);
  }
};

export default {
  createRoom,
  getAllRooms,
  getRoomById,
  updateRoom,
  deleteRoom,
  getRoomStats,
  getRoomBuildings,
};
