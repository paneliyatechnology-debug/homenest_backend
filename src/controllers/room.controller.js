import roomService from '../services/room.service.js';
import { success, successAction, AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';

/**
 * Controller for managing Room Inventory, Allocations, and Room Shift Requests.
 */

/**
 * ============================================================================
 * CORE ROOM MANAGEMENT CONTROLLERS
 * ============================================================================
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
    const branch_id = req.body.branch_id ? Number(req.body.branch_id) : undefined;
    if (!pg_id) {
      throw new AppError('Branch (PG ID) is required. Please select a PG facility or login under a PG owner account', HTTP_STATUS.BAD_REQUEST);
    }

    const room = await roomService.create({ ...req.body, pg_id, branch_id });
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

    let pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);
    let branch_id = req.query.branch_id ? Number(req.query.branch_id) : undefined;

    // If resident is requesting rooms, auto-scope to their active branch
    if (req.user.role === ROLES.RESIDENT) {
      branch_id = req.user.room_info?.branch_id || req.branch_id || req.user.branch_id || undefined;
      pg_id = req.user.pg_id || req.pg_id || undefined;
    }

    const { rooms, pagination } = await roomService.findAll({
      owner_id,
      pg_id,
      branch_id,
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
    const branch_id = req.query.branch_id ? Number(req.query.branch_id) : undefined;

    const stats = await roomService.getStats({ owner_id, pg_id, branch_id });
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
    const branch_id = req.query.branch_id ? Number(req.query.branch_id) : undefined;

    const buildings = await roomService.getBuildingsAndFloors({ owner_id, pg_id, branch_id });
    return success(res, 'Room buildings and floors retrieved successfully', buildings);
  } catch (err) {
    next(err);
  }
};

/**
 * ============================================================================
 * ROOM SHIFT REQUEST CONTROLLERS (Integrated Under Room Module)
 * ============================================================================
 */

/**
 * Create a new room shift request (Resident Mobile & Admin Web Form)
 */
export const createRoomShift = async (req, res, next) => {
  try {
    const result = await roomService.createShift(req.body, req.user);
    return successAction(res, 'Room shift request submitted successfully', result.id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * Retrieve paginated room relocation and shift requests with status and branch filtering.
 */
export const getAllRoomShifts = async (req, res, next) => {
  try {
    const result = await roomService.findAllShifts(req.user, req.query);
    return success(
      res,
      'Room shift requests retrieved successfully',
      result.requests,
      HTTP_STATUS.OK,
      result.pagination
    );
  } catch (err) {
    next(err);
  }
};

/**
 * Retrieve KPI dashboard summary statistics for room shift requests (Total, Approved, Pending, Rejected).
 */
export const getRoomShiftStats = async (req, res, next) => {
  try {
    const stats = await roomService.getShiftStats(req.user, req.query);
    return success(res, 'Room shift statistics retrieved successfully', stats);
  } catch (err) {
    next(err);
  }
};

/**
 * Get room shift request details by ID
 */
export const getRoomShiftById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await roomService.findShiftById(Number(id), req.user);
    return success(res, 'Room shift request details retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * Update room shift request status (Admin Approve / Reject)
 */
export const updateRoomShiftStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await roomService.updateShiftStatus(Number(id), req.body, req.user);
    return successAction(res, `Room shift request ${result.status} successfully`, result.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

/**
 * Delete / Cancel room shift request
 */
export const deleteRoomShift = async (req, res, next) => {
  try {
    const { id } = req.params;
    await roomService.deleteShift(Number(id), req.user);
    return successAction(res, 'Room shift request deleted successfully', Number(id));
  } catch (err) {
    next(err);
  }
};

export default {
  // Core Room
  createRoom,
  getAllRooms,
  getRoomById,
  updateRoom,
  deleteRoom,
  getRoomStats,
  getRoomBuildings,

  // Room Shift
  createRoomShift,
  getAllRoomShifts,
  getRoomShiftStats,
  getRoomShiftById,
  updateRoomShiftStatus,
  deleteRoomShift,
};
