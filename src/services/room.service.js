import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import { buildFileUrl } from '../utils/url.js';
import { syncBranchStats, decrementBranchRoomsOnDelete } from './branch.service.js';

/**
 * Helper to attach full image URL to room object
 * @param {Object} room - Room record
 * @returns {Object} Formatted room
 */
const formatRoom = (room) => {
  if (!room) return null;
  return {
    ...room,
    image_url: buildFileUrl('rooms', room.image),
  };
};

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

  // Check unique room_no in same PG branch among active rooms
  const existing_room = await db('rooms')
    .where({ pg_id, room_no })
    .whereNull('deleted_at')
    .first();
  if (existing_room) {
    throw new AppError(
      `Room '${room_no}' already exists in this PG branch`,
      HTTP_STATUS.CONFLICT
    );
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
        qb.where('rooms.branch_id', Number(branch_id));
      }
      if (status) {
        qb.where('rooms.status', status);
      }
      if (room_type) {
        qb.where('rooms.room_type', String(room_type).toLowerCase());
      }
      if (building_id) {
        qb.where('rooms.building_id', Number(building_id));
      }
      if (floor_id) {
        qb.where('rooms.floor_id', Number(floor_id));
      }
      if (search) {
        qb.where((search_qb) => {
          search_qb
            .where('rooms.room_no', 'like', `%${search}%`)
            .orWhere('occupant.name', 'like', `%${search}%`)
            .orWhere('buildings.name', 'like', `%${search}%`)
            .orWhere('branches.name', 'like', `%${search}%`)
            .orWhere('pgs.name', 'like', `%${search}%`);
        });
      }
    });

  // Count total records
  const count_result = await base_query.clone().count('rooms.id as total').first();
  const total = count_result ? parseInt(count_result.total, 10) : 0;

  // Fetch paginated rows
  const raw_rooms = await base_query
    .clone()
    .select(
      'rooms.id',
      'rooms.pg_id',
      'rooms.branch_id',
      db.raw('COALESCE(branches.name, pgs.name) as branch_name'),
      'branches.name as branch_title',
      'rooms.building_id',
      'buildings.name as building_name',
      'rooms.floor_id',
      'floors.floor_number as floor',
      'floors.name as floor_name',
      'rooms.room_no',
      'rooms.room_type',
      'rooms.capacity',
      'rooms.size',
      'rooms.image',
      'rooms.status',
      'occupant.name as current_occupant_name',
      'rooms.created_at',
      'rooms.updated_at',
      'rooms.deleted_at'
    )
    .orderBy('buildings.name', 'asc')
    .orderBy('floors.floor_number', 'asc')
    .orderBy('rooms.room_no', 'asc')
    .limit(per_page)
    .offset(offset);

  const rooms = raw_rooms.map((r) => formatRoom(r));

  return {
    rooms,
    pagination: {
      total,
      page: current_page,
      limit: per_page,
      total_pages: Math.ceil(total / per_page) || 1,
    },
  };
};

/**
 * Find single room by ID with dynamic current occupant and image URL.
 * @param {number|string} id - Room primary key
 * @returns {Promise<Object|null>} Room details
 */
export const findById = async (id) => {
  const raw_room = await db('rooms')
    .where('rooms.id', id)
    .whereNull('rooms.deleted_at')
    .join('pgs', (join) => {
      join.on('rooms.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
    })
    .join('users as owner', (join) => {
      join.on('pgs.owner_id', '=', 'owner.id').andOnNull('owner.deleted_at');
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
      'rooms.id',
      'rooms.pg_id',
      'rooms.branch_id',
      db.raw('COALESCE(branches.name, pgs.name) as branch_name'),
      'branches.name as branch_title',
      'pgs.owner_id',
      'owner.name as owner_name',
      'rooms.room_no',
      'rooms.room_type',
      'rooms.building_id',
      'buildings.name as building_name',
      'rooms.floor_id',
      'floors.floor_number as floor',
      'floors.name as floor_name',
      'rooms.capacity',
      'rooms.size',
      'rooms.image',
      'rooms.status',
      'occupant.name as current_occupant_name',
      'rooms.created_at',
      'rooms.updated_at',
      'rooms.deleted_at'
    )
    .first();

  return formatRoom(raw_room);
};

/**
 * Update an existing room.
 * @param {number|string} id - Room ID
 * @param {Object} data - Updated fields
 * @returns {Promise<Object>} Updated room
 */
export const update = async (id, data) => {
  const room = await findById(id);
  if (!room) {
    throw new AppError('Room not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check unique room_no if room_no or pg_id is being changed
  if (data.room_no && data.room_no !== room.room_no) {
    const target_pg_id = data.pg_id || room.pg_id;
    const existing = await db('rooms')
      .where({ pg_id: target_pg_id, room_no: data.room_no })
      .whereNull('deleted_at')
      .whereNot({ id })
      .first();

    if (existing) {
      throw new AppError(
        `Room '${data.room_no}' already exists in this PG branch`,
        HTTP_STATUS.CONFLICT
      );
    }
  }

  const update_payload = {
    ...(data.pg_id !== undefined && { pg_id: data.pg_id }),
    ...(data.branch_id !== undefined && { branch_id: Number(data.branch_id) }),
    ...(data.room_no !== undefined && { room_no: data.room_no }),
    ...(data.room_type !== undefined && { room_type: String(data.room_type).toLowerCase() }),
    ...(data.capacity !== undefined && { capacity: Number(data.capacity) }),
    ...(data.size !== undefined && { size: data.size }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.status !== undefined && { status: data.status }),
    updated_at: db.fn.now(),
  };

  // Handle building_id update
  if (data.building_id !== undefined) {
    const bId = Number(data.building_id);
    const targetPg = data.pg_id || room.pg_id;
    const b = await db('buildings').where({ id: bId, pg_id: targetPg }).whereNull('deleted_at').first();
    if (!b) {
      throw new AppError('Building not found in this PG facility', HTTP_STATUS.NOT_FOUND);
    }
    update_payload.building_id = b.id;
  }

  // Handle floor_id update
  if (data.floor_id !== undefined) {
    const fId = Number(data.floor_id);
    const targetBuildingId = update_payload.building_id || room.building_id;
    const f = await db('floors').where({ id: fId, building_id: targetBuildingId }).whereNull('deleted_at').first();
    if (!f) {
      throw new AppError('Floor not found in this building', HTTP_STATUS.NOT_FOUND);
    }
    update_payload.floor_id = f.id;
  }

  await db('rooms').where({ id }).whereNull('deleted_at').update(update_payload);

  if (room.branch_id) {
    await syncBranchStats(room.branch_id);
  }
  if (update_payload.branch_id && update_payload.branch_id !== room.branch_id) {
    await syncBranchStats(update_payload.branch_id);
  }

  return findById(id);
};

/**
 * Delete a room by ID (Soft Delete).
 * @param {number|string} id - Room ID
 * @returns {Promise<boolean>}
 */
export const remove = async (id) => {
  const room = await findById(id);
  if (!room) {
    throw new AppError('Room not found', HTTP_STATUS.NOT_FOUND);
  }

  if (room.status === 'occupied') {
    throw new AppError(
      'Cannot delete an occupied room. Please vacate or relocate resident first.',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  // Check if room has active resident stays
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

export default {
  create,
  findAll,
  findById,
  update,
  remove,
  getStats,
  getBuildingsAndFloors,
};
