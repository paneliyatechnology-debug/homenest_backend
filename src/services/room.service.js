import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';
import { buildFileUrl } from '../utils/url.js';
import { syncBranchStats, decrementBranchRoomsOnDelete } from './branch.service.js';

/**
 * Helper to attach full image URL to room object
 * @param {Object} room - Room record
 * @returns {Object} Formatted room
 */
const formatRoom = (room) => {
  if (!room) return null;
  const capacity = Number(room.capacity) || 1;
  const occupants = Number(room.current_occupants) || 0;
  const availableBeds = Math.max(0, capacity - occupants);

  const sharingLabel = room.room_type
    ? room.room_type
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ') + (room.room_type.toLowerCase().includes('sharing') ? '' : ' Sharing')
    : 'Standard';

  return {
    ...room,
    capacity,
    current_occupants: occupants,
    available_beds: availableBeds,
    is_available: availableBeds > 0 && room.status !== 'maintenance' && room.status !== 'out_of_service',
    sharing_label: sharingLabel,
    display_label: `Room ${room.room_no} (${sharingLabel}) - ${availableBeds} beds available`,
    image_url: buildFileUrl('rooms', room.image),
  };
};

/**
 * ============================================================================
 * CORE ROOM MANAGEMENT SERVICE
 * ============================================================================
 */

/**
 * Create a new room in a PG facility (branch).
 * @param {Object} data - Room details
 * @returns {Promise<Object>} Created room
 */
export const create = async (data) => {
  const {
    pg_id,
    room_no,
    room_type,
    building_id: input_building_id,
    floor_id: input_floor_id,
    capacity = 1,
    size = null,
    image = null,
    status = 'vacant',
  } = data;

  // Verify PG branch exists
  const pg = await db('pgs').where({ id: pg_id }).whereNull('deleted_at').first();
  if (!pg) {
    throw new AppError('PG facility (branch) not found', HTTP_STATUS.NOT_FOUND);
  }

  // Validate building_id
  const building_id = Number(input_building_id);
  const building = await db('buildings')
    .where({ id: building_id, pg_id })
    .whereNull('deleted_at')
    .first();

  if (!building) {
    throw new AppError('Selected building does not exist in this PG facility', HTTP_STATUS.NOT_FOUND);
  }

  // Validate floor_id
  const floor_id = Number(input_floor_id);
  const floor = await db('floors')
    .where({ id: floor_id, building_id })
    .whereNull('deleted_at')
    .first();

  if (!floor) {
    throw new AppError('Selected floor does not exist in this building', HTTP_STATUS.NOT_FOUND);
  }

  // Auto-resolve branch_id from request, building, or primary PG branch
  let branch_id = data.branch_id ? Number(data.branch_id) : (building.branch_id || null);
  if (!branch_id) {
    const defaultBranch = await db('branches')
      .where({ pg_id })
      .whereNull('deleted_at')
      .orderBy('id', 'asc')
      .first();
    if (defaultBranch) branch_id = defaultBranch.id;
  }

  // Enforce unique room number within the same branch among active rooms
  const roomFilter = branch_id ? { branch_id, room_no } : { pg_id, room_no };
  const existing_room = await db('rooms')
    .where(roomFilter)
    .whereNull('deleted_at')
    .first();
  if (existing_room) {
    throw new AppError(
      `Room '${room_no}' already exists in this branch`,
      HTTP_STATUS.CONFLICT
    );
  }

  const [id] = await db('rooms').insert({
    pg_id,
    branch_id,
    room_no,
    room_type: String(room_type).toLowerCase(),
    building_id,
    floor_id,
    capacity: Number(capacity) || 1,
    size: size || null,
    image: image || null,
    status,
  });

  if (branch_id) {
    await syncBranchStats(branch_id);
  }

  return findById(id);
};

/**
 * Retrieve paginated list of rooms with filtering and search.
 * Dynamically joins active resident stay to get current_occupant_name.
 * @param {Object} options - Query filters and pagination
 * @returns {Promise<{rooms: Array<Object>, pagination: Object}>}
 */
export const findAll = async (options = {}) => {
  const {
    pg_id,
    branch_id,
    owner_id,
    status,
    room_type,
    building_id,
    floor_id,
    search,
    page = 1,
    limit = 10,
  } = options;

  const current_page = Math.max(1, parseInt(page, 10) || 1);
  const per_page = Math.max(1, parseInt(limit, 10) || 10);
  const offset = (current_page - 1) * per_page;

  const base_query = db('rooms')
    .whereNull('rooms.deleted_at')
    .join('pgs', (join) => {
      join.on('rooms.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
    })
    .leftJoin('branches', (join) => {
      join.on('rooms.branch_id', '=', 'branches.id').andOnNull('branches.deleted_at');
    })
    .leftJoin('buildings', (join) => {
      join.on('rooms.building_id', '=', 'buildings.id').andOnNull('buildings.deleted_at');
    })
    .leftJoin('floors', (join) => {
      join.on('rooms.floor_id', '=', 'floors.id').andOnNull('floors.deleted_at');
    })
    .leftJoin('resident_pg_stays', (join) => {
      join
        .on('rooms.id', '=', 'resident_pg_stays.room_id')
        .andOn('resident_pg_stays.status', '=', db.raw('?', ['active']))
        .andOnNull('resident_pg_stays.deleted_at');
    })
    .leftJoin('users as occupant', (join) => {
      join.on('resident_pg_stays.resident_id', '=', 'occupant.id').andOnNull('occupant.deleted_at');
    })
    .modify((qb) => {
      if (owner_id) {
        qb.where('pgs.owner_id', owner_id);
      }
      if (pg_id) {
        qb.where('rooms.pg_id', pg_id);
      }
      if (branch_id) {
        qb.where('rooms.branch_id', branch_id);
      }
      if (status) {
        const normStatus = status.toLowerCase();
        if (normStatus === 'available') {
          qb.whereNotIn('rooms.status', ['maintenance', 'out_of_service'])
            .where((availQb) => {
              availQb.where('rooms.status', 'vacant')
                .orWhereRaw('(SELECT COUNT(id) FROM resident_pg_stays WHERE resident_pg_stays.room_id = rooms.id AND resident_pg_stays.status = ? AND resident_pg_stays.deleted_at IS NULL) < rooms.capacity', ['active']);
            });
        } else {
          qb.where('rooms.status', normStatus);
        }
      }
      if (room_type) {
        const normType = room_type.toLowerCase().replace(/\s+sharing/i, '').trim();
        qb.where((typeQb) => {
          typeQb.where('rooms.room_type', 'like', `%${normType}%`)
            .orWhere('rooms.room_type', room_type.toLowerCase());
        });
      }
      if (building_id) {
        qb.where('rooms.building_id', building_id);
      }
      if (floor_id) {
        qb.where('rooms.floor_id', floor_id);
      }
      if (search) {
        const search_term = `%${search}%`;
        qb.where((search_builder) => {
          search_builder
            .where('rooms.room_no', 'like', search_term)
            .orWhere('buildings.name', 'like', search_term)
            .orWhere('occupant.name', 'like', search_term);
        });
      }
    });

  const [{ total }] = await base_query.clone().countDistinct('rooms.id as total');

  const rows = await base_query
    .clone()
    .select(
      'rooms.*',
      'pgs.name as pg_name',
      'pgs.owner_id',
      'branches.name as branch_name',
      'buildings.name as building_name',
      'floors.name as floor_name',
      'floors.floor_number',
      db.raw('COUNT(resident_pg_stays.id) as current_occupants'),
      db.raw('GROUP_CONCAT(occupant.name SEPARATOR ", ") as current_occupant_name')
    )
    .groupBy('rooms.id')
    .orderBy('rooms.created_at', 'desc')
    .limit(per_page)
    .offset(offset);

  const rooms = rows.map(formatRoom);

  return {
    rooms,
    pagination: {
      page: current_page,
      limit: per_page,
      total_items: total || 0,
      total_pages: Math.ceil((total || 0) / per_page),
    },
  };
};

/**
 * Retrieve room details by ID.
 * @param {number|string} id - Room ID
 * @returns {Promise<Object>} Formatted room record
 */
export const findById = async (id) => {
  const room = await db('rooms')
    .where('rooms.id', id)
    .whereNull('rooms.deleted_at')
    .join('pgs', (join) => {
      join.on('rooms.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
    })
    .leftJoin('branches', (join) => {
      join.on('rooms.branch_id', '=', 'branches.id').andOnNull('branches.deleted_at');
    })
    .leftJoin('buildings', (join) => {
      join.on('rooms.building_id', '=', 'buildings.id').andOnNull('buildings.deleted_at');
    })
    .leftJoin('floors', (join) => {
      join.on('rooms.floor_id', '=', 'floors.id').andOnNull('floors.deleted_at');
    })
    .leftJoin('resident_pg_stays', (join) => {
      join
        .on('rooms.id', '=', 'resident_pg_stays.room_id')
        .andOn('resident_pg_stays.status', '=', db.raw('?', ['active']))
        .andOnNull('resident_pg_stays.deleted_at');
    })
    .leftJoin('users as occupant', (join) => {
      join.on('resident_pg_stays.resident_id', '=', 'occupant.id').andOnNull('occupant.deleted_at');
    })
    .select(
      'rooms.*',
      'pgs.name as pg_name',
      'pgs.owner_id',
      'branches.name as branch_name',
      'buildings.name as building_name',
      'floors.name as floor_name',
      'floors.floor_number',
      db.raw('COUNT(resident_pg_stays.id) as current_occupants'),
      db.raw('GROUP_CONCAT(occupant.name SEPARATOR ", ") as current_occupant_name')
    )
    .groupBy('rooms.id')
    .first();

  return formatRoom(room);
};

/**
 * Update room details.
 * @param {number|string} id - Room ID
 * @param {Object} data - Update payload
 * @returns {Promise<Object>} Formatted updated room
 */
export const update = async (id, data) => {
  const room = await findById(id);
  if (!room) {
    throw new AppError('Room not found', HTTP_STATUS.NOT_FOUND);
  }

  const {
    room_no,
    room_type,
    building_id: input_building_id,
    floor_id: input_floor_id,
    capacity,
    size,
    image,
    status,
    branch_id: input_branch_id,
  } = data;

  const targetBuildingId = input_building_id !== undefined ? Number(input_building_id) : room.building_id;
  const targetFloorId = input_floor_id !== undefined ? Number(input_floor_id) : room.floor_id;

  // Validate building if changed
  if (input_building_id !== undefined) {
    const building = await db('buildings')
      .where({ id: targetBuildingId, pg_id: room.pg_id })
      .whereNull('deleted_at')
      .first();
    if (!building) {
      throw new AppError('Selected building does not exist in this PG facility', HTTP_STATUS.NOT_FOUND);
    }
  }

  // Validate floor if changed
  if (input_floor_id !== undefined || input_building_id !== undefined) {
    const floor = await db('floors')
      .where({ id: targetFloorId, building_id: targetBuildingId })
      .whereNull('deleted_at')
      .first();
    if (!floor) {
      throw new AppError('Selected floor does not exist in this building', HTTP_STATUS.NOT_FOUND);
    }
  }

  const branch_id = input_branch_id !== undefined ? Number(input_branch_id) : room.branch_id;

  // Enforce unique room number in branch if room number was modified
  if (room_no && (room_no !== room.room_no || branch_id !== room.branch_id)) {
    const filter = branch_id ? { branch_id, room_no } : { pg_id: room.pg_id, room_no };
    const duplicate = await db('rooms')
      .where(filter)
      .whereNot('id', id)
      .whereNull('deleted_at')
      .first();
    if (duplicate) {
      throw new AppError(
        `Room '${room_no}' already exists in this branch`,
        HTTP_STATUS.CONFLICT
      );
    }
  }

  const update_data = {};
  if (room_no !== undefined) update_data.room_no = room_no;
  if (room_type !== undefined) update_data.room_type = String(room_type).toLowerCase();
  if (input_building_id !== undefined) update_data.building_id = targetBuildingId;
  if (input_floor_id !== undefined) update_data.floor_id = targetFloorId;
  if (input_branch_id !== undefined) update_data.branch_id = branch_id;
  if (capacity !== undefined) update_data.capacity = Number(capacity);
  if (size !== undefined) update_data.size = size;
  if (image !== undefined) update_data.image = image;
  if (status !== undefined) update_data.status = status;

  if (Object.keys(update_data).length > 0) {
    update_data.updated_at = db.fn.now();
    await db('rooms').where({ id }).update(update_data);
  }

  if (room.branch_id) {
    await syncBranchStats(room.branch_id);
  }
  if (branch_id && branch_id !== room.branch_id) {
    await syncBranchStats(branch_id);
  }

  return findById(id);
};

/**
 * Soft delete a room.
 * @param {number|string} id - Room ID
 * @returns {Promise<boolean>} Success indicator
 */
export const remove = async (id) => {
  const room = await findById(id);
  if (!room) {
    throw new AppError('Room not found', HTTP_STATUS.NOT_FOUND);
  }

  if (room.status === 'occupied') {
    throw new AppError(
      'Cannot delete room. Room is currently occupied by residents.',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const active_stay = await db('resident_pg_stays')
    .where({ room_id: id, status: 'active' })
    .whereNull('deleted_at')
    .first();

  if (active_stay) {
    throw new AppError(
      'Cannot delete a room with active resident stays.',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  await db('rooms').where({ id }).whereNull('deleted_at').update({
    deleted_at: db.fn.now(),
    updated_at: db.fn.now(),
  });

  if (room.branch_id) {
    await decrementBranchRoomsOnDelete(room.branch_id);
  }

  return true;
};

/**
 * Get KPI statistical counts for rooms (total, occupied, vacant, maintenance, out_of_service).
 * @param {Object} options - Scope options (e.g. pg_id, owner_id)
 * @returns {Promise<Object>} Statistics object
 */
export const getStats = async (options = {}) => {
  const { pg_id, branch_id, owner_id } = options;

  const base_query = db('rooms')
    .whereNull('rooms.deleted_at')
    .join('pgs', (join) => {
      join.on('rooms.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
    })
    .modify((qb) => {
      if (owner_id) {
        qb.where('pgs.owner_id', owner_id);
      }
      if (pg_id) {
        qb.where('rooms.pg_id', pg_id);
      }
      if (branch_id) {
        qb.where('rooms.branch_id', Number(branch_id));
      }
    });

  const [counts] = await base_query.select(
    db.raw('COUNT(rooms.id) as total_rooms'),
    db.raw("SUM(CASE WHEN rooms.status = 'occupied' THEN 1 ELSE 0 END) as occupied"),
    db.raw("SUM(CASE WHEN rooms.status = 'vacant' THEN 1 ELSE 0 END) as vacant"),
    db.raw("SUM(CASE WHEN rooms.status = 'maintenance' THEN 1 ELSE 0 END) as maintenance"),
    db.raw("SUM(CASE WHEN rooms.status = 'out_of_service' THEN 1 ELSE 0 END) as out_of_service")
  );

  return {
    total_rooms: parseInt(counts?.total_rooms, 10) || 0,
    occupied: parseInt(counts?.occupied, 10) || 0,
    vacant: parseInt(counts?.vacant, 10) || 0,
    maintenance: parseInt(counts?.maintenance, 10) || 0,
    out_of_service: parseInt(counts?.out_of_service, 10) || 0,
  };
};

/**
 * Get distinct room building names and their floor lists for a PG facility or owner.
 * @param {Object} options - Scope options (e.g. pg_id, owner_id)
 * @returns {Promise<Array<{building_name: string, floors: Array<number>, total_floors: number, total_rooms: number}>>}
 */
export const getBuildingsAndFloors = async (options = {}) => {
  const { pg_id, branch_id, owner_id } = options;

  const buildings_query = db('buildings')
    .whereNull('buildings.deleted_at')
    .join('pgs', (join) => {
      join.on('buildings.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
    })
    .modify((qb) => {
      if (owner_id) {
        qb.where('pgs.owner_id', owner_id);
      }
      if (pg_id) {
        qb.where('buildings.pg_id', pg_id);
      }
      if (branch_id) {
        qb.where('buildings.branch_id', Number(branch_id));
      }
    })
    .select(
      'buildings.id as building_id',
      'buildings.name as building_name',
      'buildings.pg_id',
      'pgs.name as pg_name'
    )
    .orderBy('buildings.name', 'asc');

  const buildings = await buildings_query;
  const buildingIds = buildings.map((b) => b.building_id);

  if (buildingIds.length === 0) {
    return [];
  }

  const floors = await db('floors')
    .whereIn('floors.building_id', buildingIds)
    .whereNull('floors.deleted_at')
    .leftJoin('rooms', (join) => {
      join.on('floors.id', '=', 'rooms.floor_id').andOnNull('rooms.deleted_at');
    })
    .select(
      'floors.id as floor_id',
      'floors.building_id',
      'floors.floor_number',
      'floors.name as floor_name',
      db.raw('COUNT(rooms.id) as total_rooms')
    )
    .groupBy('floors.id')
    .orderBy('floors.floor_number', 'asc');

  const floorsByBuilding = new Map();
  for (const f of floors) {
    if (!floorsByBuilding.has(f.building_id)) {
      floorsByBuilding.set(f.building_id, []);
    }
    floorsByBuilding.get(f.building_id).push({
      id: f.floor_id,
      floor_id: f.floor_id,
      floor_number: Number(f.floor_number),
      name: f.floor_name || `Floor ${f.floor_number}`,
      total_rooms: parseInt(f.total_rooms, 10) || 0,
    });
  }

  return buildings.map((b) => {
    const bFloors = floorsByBuilding.get(b.building_id) || [];
    const floor_numbers = bFloors.map((f) => f.floor_number);
    const total_rooms = bFloors.reduce((sum, f) => sum + f.total_rooms, 0);

    return {
      building_id: b.building_id,
      building_name: b.building_name,
      floors: floor_numbers,
      floor_details: bFloors,
      total_floors: bFloors.length,
      total_rooms,
    };
  });
};

/**
 * ============================================================================
 * ROOM SHIFT REQUEST MANAGEMENT (Integrated Under Room Module)
 * ============================================================================
 */

/**
 * Helper: Resolve PG for admin (1 Admin = 1 PG)
 */
const resolveAdminPg = async (user) => {
  if (user.role === ROLES.SUPER_ADMIN) {
    const pg = await db('pgs').whereNull('deleted_at').orderBy('id', 'asc').first();
    if (!pg) throw new AppError('No PG property found', HTTP_STATUS.NOT_FOUND);
    return pg;
  }

  const pg = await db('pgs').where({ owner_id: user.id }).whereNull('deleted_at').first();
  if (!pg) {
    throw new AppError('No active PG property found under your account', HTTP_STATUS.FORBIDDEN);
  }
  return pg;
};

/**
 * Helper: Formatter for Room Shift record
 */
const formatRoomShift = (row) => {
  if (!row) return null;

  return {
    id: Number(row.id),
    pg_id: Number(row.pg_id),
    branch_id: Number(row.branch_id),
    branch_name: row.branch_name || null,
    stay_id: row.stay_id ? Number(row.stay_id) : null,
    resident: {
      id: Number(row.resident_id),
      name: row.resident_name,
      email: row.resident_email,
      phone: row.resident_phone,
      profile_photo: row.resident_photo || null,
      photo_url: buildFileUrl('users', row.resident_photo),
    },
    current_room: {
      id: Number(row.current_room_id),
      room_no: row.current_room_no,
      room_type: row.current_room_type,
      building_name: row.current_building_name || null,
      floor_number: row.current_floor_number !== null ? Number(row.current_floor_number) : null,
    },
    requested_room: row.requested_room_id
      ? {
          id: Number(row.requested_room_id),
          room_no: row.requested_room_no,
          room_type: row.requested_room_type,
          building_name: row.requested_building_name || null,
          floor_number: row.requested_floor_number !== null ? Number(row.requested_floor_number) : null,
        }
      : null,
    preferred_room_type: row.preferred_room_type || null,
    reason: row.reason,
    additional_notes: row.additional_notes || null,
    notes: row.additional_notes || null,
    expected_move_date: row.expected_move_date ? String(row.expected_move_date).split('T')[0] : null,
    status: row.status,
    reviewed_by: row.reviewed_by ? Number(row.reviewed_by) : null,
    reviewer_name: row.reviewer_name || null,
    admin_notes: row.admin_notes || null,
    reviewed_at: row.reviewed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Base SQL query builder for Room Shift Requests with standard joins
 */
const baseShiftQuery = () => {
  return db('room_shift_requests')
    .whereNull('room_shift_requests.deleted_at')
    .join('users as resident', 'room_shift_requests.resident_id', 'resident.id')
    .join('branches', 'room_shift_requests.branch_id', 'branches.id')
    .join('rooms as current_room', 'room_shift_requests.current_room_id', 'current_room.id')
    .leftJoin('buildings as current_bld', 'current_room.building_id', 'current_bld.id')
    .leftJoin('floors as current_flr', 'current_room.floor_id', 'current_flr.id')
    .leftJoin('rooms as requested_room', 'room_shift_requests.requested_room_id', 'requested_room.id')
    .leftJoin('buildings as req_bld', 'requested_room.building_id', 'req_bld.id')
    .leftJoin('floors as req_flr', 'requested_room.floor_id', 'req_flr.id')
    .leftJoin('users as reviewer', 'room_shift_requests.reviewed_by', 'reviewer.id')
    .select(
      'room_shift_requests.*',
      'branches.name as branch_name',
      'resident.name as resident_name',
      'resident.email as resident_email',
      'resident.phone as resident_phone',
      'resident.profile_photo as resident_photo',
      'current_room.room_no as current_room_no',
      'current_room.room_type as current_room_type',
      'current_bld.name as current_building_name',
      'current_flr.floor_number as current_floor_number',
      'requested_room.room_no as requested_room_no',
      'requested_room.room_type as requested_room_type',
      'req_bld.name as requested_building_name',
      'req_flr.floor_number as requested_floor_number',
      'reviewer.name as reviewer_name'
    );
};

/**
 * Create a new room shift request for a resident.
 * Supports both resident self-service requests and administrative relocation entries.
 *
 * @param {Object} data - Request payload containing reason, preferred room/bed details
 * @param {Object} user - Authenticated user context
 * @returns {Promise<Object>} Created room shift request record
 */
export const createShift = async (data, user) => {
  let pgId;
  let branchId;
  let residentId;
  let currentRoomId;
  let stayId;
  let initialStatus = 'pending';

  if (user.role === ROLES.RESIDENT) {
    residentId = user.id;

    const activeStay = await db('resident_pg_stays')
      .where({ resident_id: residentId, status: 'active' })
      .whereNull('deleted_at')
      .first();

    if (!activeStay) {
      throw new AppError('Cannot submit room shift request without an active PG stay', HTTP_STATUS.BAD_REQUEST);
    }

    pgId = activeStay.pg_id;
    branchId = activeStay.branch_id;
    currentRoomId = activeStay.room_id;
    stayId = activeStay.id;

    const requestedRoomId = data.requested_room_id
      ? Number(data.requested_room_id)
      : data.preferred_room_id
      ? Number(data.preferred_room_id)
      : null;

    if (requestedRoomId && requestedRoomId === currentRoomId) {
      throw new AppError('Requested room cannot be the same as the resident current room', HTTP_STATUS.BAD_REQUEST);
    }

    const pendingRequest = await db('room_shift_requests')
      .where({ resident_id: residentId, status: 'pending' })
      .whereNull('deleted_at')
      .first();

    if (pendingRequest) {
      throw new AppError(
        'You already have a pending room shift request. Please wait for administration to review it.',
        HTTP_STATUS.CONFLICT
      );
    }
  } else {
    // Administrative direct reallocation flow
    residentId = Number(data.resident_id);

    const resident = await db('users')
      .where({ id: residentId, role: ROLES.RESIDENT })
      .whereNull('deleted_at')
      .first();

    if (!resident) {
      throw new AppError('Resident not found', HTTP_STATUS.NOT_FOUND);
    }

    const activeStay = await db('resident_pg_stays')
      .where({ resident_id: residentId, status: 'active' })
      .whereNull('deleted_at')
      .orderBy('id', 'desc')
      .first();

    if (!activeStay) {
      throw new AppError('Selected resident does not have an active stay record in any branch', HTTP_STATUS.BAD_REQUEST);
    }

    pgId = activeStay.pg_id;
    branchId = activeStay.branch_id;
    currentRoomId = activeStay.room_id;
    stayId = activeStay.id;

    if (data.status && ['pending', 'approved', 'rejected'].includes(data.status.toLowerCase())) {
      initialStatus = data.status.toLowerCase();
    }
  }

  const requestedRoomId = data.requested_room_id
    ? Number(data.requested_room_id)
    : data.preferred_room_id
    ? Number(data.preferred_room_id)
    : null;

  if (requestedRoomId && requestedRoomId === currentRoomId) {
    throw new AppError('Requested room cannot be the same as the resident current room', HTTP_STATUS.BAD_REQUEST);
  }

  if (requestedRoomId) {
    const requestedRoom = await db('rooms')
      .where({ id: requestedRoomId, branch_id: branchId })
      .whereNull('deleted_at')
      .first();

    if (!requestedRoom) {
      throw new AppError('Requested room not found in the resident branch', HTTP_STATUS.NOT_FOUND);
    }
  }

  const preferredRoomType = data.preferred_room_type || 'Double Sharing';
  const reason = data.reason;
  const additionalNotes = data.additional_notes || data.notes || null;
  const expectedMoveDate = data.expected_move_date || null;

  const [id] = await db('room_shift_requests').insert({
    pg_id: pgId,
    branch_id: branchId,
    stay_id: stayId,
    resident_id: residentId,
    current_room_id: currentRoomId,
    requested_room_id: requestedRoomId,
    preferred_room_type: preferredRoomType,
    reason,
    additional_notes: additionalNotes,
    expected_move_date: expectedMoveDate,
    status: initialStatus,
    reviewed_by: user.role !== ROLES.RESIDENT ? user.id : null,
    reviewed_at: initialStatus !== 'pending' ? db.fn.now() : null,
  });

  return await findShiftById(id, user);
};

/**
 * List room shift requests with status filters, search, and pagination.
 * Scoped automatically to resident's own requests or admin's facility.
 *
 * @param {Object} user - Authenticated user context
 * @param {Object} query - Query parameters (status, branch_id, search, page, limit)
 * @returns {Promise<{requests: Array<Object>, pagination: Object}>} Paginated shift requests
 */
export const findAllShifts = async (user, query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.max(1, parseInt(query.limit, 10) || 10);
  const offset = (page - 1) * limit;

  const base = baseShiftQuery();

  if (user.role === ROLES.RESIDENT) {
    base.where('room_shift_requests.resident_id', user.id);
  } else {
    const adminPg = await resolveAdminPg(user);
    base.where('room_shift_requests.pg_id', adminPg.id);

    if (query.branch_id && query.branch_id !== 'all') {
      base.where('room_shift_requests.branch_id', Number(query.branch_id));
    }
  }

  if (query.status && query.status !== 'all') {
    base.where('room_shift_requests.status', query.status.toLowerCase());
  }

  if (query.search) {
    const term = `%${query.search.trim()}%`;
    base.where(function () {
      this.where('resident.name', 'like', term)
        .orWhere('current_room.room_no', 'like', term)
        .orWhere('requested_room.room_no', 'like', term)
        .orWhere('room_shift_requests.reason', 'like', term);
    });
  }

  const [{ total }] = await base.clone().clearSelect().count('room_shift_requests.id as total');

  const rows = await base
    .clone()
    .orderBy('room_shift_requests.id', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    requests: rows.map(formatRoomShift),
    pagination: {
      page,
      limit,
      total_items: Number(total) || 0,
      total_pages: Math.ceil((Number(total) || 0) / limit),
    },
  };
};

/**
 * Get Room Shift Request Details by ID
 * @param {number} id - Request ID
 * @param {Object} user - Logged in user
 * @returns {Promise<Object>} Request details
 */
export const findShiftById = async (id, user) => {
  const row = await baseShiftQuery()
    .where('room_shift_requests.id', id)
    .first();

  if (!row) {
    throw new AppError('Room shift request not found', HTTP_STATUS.NOT_FOUND);
  }

  if (user.role === ROLES.RESIDENT && row.resident_id !== user.id) {
    throw new AppError('Access denied to this room shift request', HTTP_STATUS.FORBIDDEN);
  }

  if (user.role === ROLES.ADMIN) {
    const adminPg = await resolveAdminPg(user);
    if (row.pg_id !== adminPg.id) {
      throw new AppError('Access denied to this property room shift request', HTTP_STATUS.FORBIDDEN);
    }
  }

  return formatRoomShift(row);
};

/**
 * Retrieve KPI summary statistics for room shift requests (Total, Approved, Pending, Rejected).
 *
 * @param {Object} user - Authenticated user context
 * @param {Object} query - Optional branch filter
 * @returns {Promise<Object>} Aggregated KPI counts
 */
export const getShiftStats = async (user, query = {}) => {
  const adminPg = await resolveAdminPg(user);
  let branchId = query.branch_id && query.branch_id !== 'all' ? Number(query.branch_id) : null;

  const qb = db('room_shift_requests')
    .where('room_shift_requests.pg_id', adminPg.id)
    .whereNull('room_shift_requests.deleted_at');

  if (branchId) {
    qb.where('room_shift_requests.branch_id', branchId);
  }

  const [row] = await qb.select(
    db.raw('COUNT(room_shift_requests.id) as total_requests'),
    db.raw("SUM(CASE WHEN room_shift_requests.status = 'approved' THEN 1 ELSE 0 END) as approved"),
    db.raw("SUM(CASE WHEN room_shift_requests.status = 'pending' THEN 1 ELSE 0 END) as pending"),
    db.raw("SUM(CASE WHEN room_shift_requests.status = 'rejected' THEN 1 ELSE 0 END) as rejected")
  );

  return {
    pg_id: adminPg.id,
    branch_id: branchId,
    total_requests: Number(row?.total_requests || 0),
    total: Number(row?.total_requests || 0),
    approved: Number(row?.approved || 0),
    pending: Number(row?.pending || 0),
    rejected: Number(row?.rejected || 0),
  };
};

/**
 * Helper: Execute room transfer and sync occupancy atomically
 */
const executeRoomTransfer = async (requestId, targetRoomId, stay, user, adminNotes = null) => {
  const oldRoomId = stay.room_id;

  await db.transaction(async (trx) => {
    // 1. Verify target room exists in branch
    const targetRoom = await trx('rooms')
      .where({ id: targetRoomId, branch_id: stay.branch_id })
      .whereNull('deleted_at')
      .first();

    if (!targetRoom) {
      throw new AppError('Target room not found in the assigned branch', HTTP_STATUS.NOT_FOUND);
    }

    // 2. Transfer stay to new room
    await trx('resident_pg_stays')
      .where({ id: stay.id })
      .update({
        room_id: targetRoomId,
        notes: stay.notes ? `${stay.notes} | Shifted from Room ${oldRoomId} to ${targetRoomId}` : `Shifted from Room ${oldRoomId} to ${targetRoomId}`,
        updated_at: db.fn.now(),
      });

    // 3. Update old room status if now vacant
    const oldRemaining = await trx('resident_pg_stays')
      .where({ room_id: oldRoomId, status: 'active' })
      .whereNull('deleted_at')
      .first();

    if (!oldRemaining) {
      await trx('rooms').where({ id: oldRoomId }).update({ status: 'vacant', updated_at: db.fn.now() });
    }

    // 4. Update target room status
    const [{ count: targetActive }] = await trx('resident_pg_stays')
      .where({ room_id: targetRoomId, status: 'active' })
      .whereNull('deleted_at')
      .count('id as count');

    const targetCapacity = Number(targetRoom.capacity) || 1;
    const newStatus = Number(targetActive) >= targetCapacity ? 'occupied' : 'vacant';

    await trx('rooms').where({ id: targetRoomId }).update({
      status: newStatus,
      updated_at: db.fn.now(),
    });

    // 5. Update room shift record
    await trx('room_shift_requests')
      .where({ id: requestId })
      .update({
        requested_room_id: targetRoomId,
        status: 'approved',
        admin_notes: adminNotes,
        reviewed_by: user.id,
        reviewed_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

    // 6. Sync branch stats
    await syncBranchStats(stay.branch_id, trx);
  });
};

/**
 * Update Room Shift Status (Admin Approve / Reject)
 * @param {number} id - Shift request ID
 * @param {Object} data - Update payload
 * @param {Object} user - Logged in admin
 * @returns {Promise<Object>} Updated room shift request
 */
export const updateShiftStatus = async (id, data, user) => {
  const request = await findShiftById(id, user);

  if (request.status !== 'pending') {
    throw new AppError(`Room shift request has already been ${request.status}`, HTTP_STATUS.BAD_REQUEST);
  }

  const newStatus = data.status.toLowerCase();
  const adminNotes = data.admin_notes || null;
  const targetRoomId = data.assigned_room_id ? Number(data.assigned_room_id) : (request.requested_room?.id || null);

  if (newStatus === 'approved') {
    if (!targetRoomId) {
      throw new AppError('Target room must be specified to approve room shift', HTTP_STATUS.BAD_REQUEST);
    }

    let stay = null;
    if (request.stay_id) {
      stay = await db('resident_pg_stays')
        .where({ id: request.stay_id, status: 'active' })
        .whereNull('deleted_at')
        .first();
    }
    if (!stay) {
      stay = await db('resident_pg_stays')
        .where({ resident_id: request.resident.id, status: 'active' })
        .whereNull('deleted_at')
        .orderBy('id', 'desc')
        .first();
    }

    if (!stay) {
      throw new AppError('Active stay record for resident not found or already completed', HTTP_STATUS.BAD_REQUEST);
    }

    await executeRoomTransfer(id, targetRoomId, stay, user, adminNotes);
  } else {
    // Rejection
    await db('room_shift_requests')
      .where({ id })
      .update({
        status: 'rejected',
        admin_notes: adminNotes,
        reviewed_by: user.id,
        reviewed_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
  }

  return await findShiftById(id, user);
};

/**
 * Delete / Cancel Room Shift Request
 * @param {number} id - Shift request ID
 * @param {Object} user - Logged in user
 * @returns {Promise<boolean>} Success indicator
 */
export const deleteShift = async (id, user) => {
  const request = await findShiftById(id, user);

  if (user.role === ROLES.RESIDENT && request.status !== 'pending') {
    throw new AppError('Cannot cancel a room shift request that is already processed', HTTP_STATUS.BAD_REQUEST);
  }

  await db('room_shift_requests').where({ id }).update({
    deleted_at: db.fn.now(),
    updated_at: db.fn.now(),
  });

  return true;
};

export default {
  // Core Room methods
  create,
  findAll,
  findById,
  update,
  remove,
  getStats,
  getBuildingsAndFloors,

  // Room Shift methods
  createShift,
  findAllShifts,
  findShiftById,
  getShiftStats,
  updateShiftStatus,
  deleteShift,
};
