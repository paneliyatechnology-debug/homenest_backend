import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';
import socketService, { SOCKET_EVENTS } from './socket.service.js';

/**
 * Standard ordinal floor name generator
 * @param {number|string} floorNumber
 * @returns {string} e.g. "Ground Floor", "1st Floor", "2nd Floor", etc.
 */
export const getFloorName = (floorNumber) => {
  const num = Number(floorNumber);
  if (num === 0) return 'Ground Floor';
  if (num === 1) return '1st Floor';
  if (num === 2) return '2nd Floor';
  if (num === 3) return '3rd Floor';
  return `${num}th Floor`;
};

export class BuildingService {
  /**
   * Get KPI statistics for Building & Floor Management
   * @param {Object} options - { user, pg_id, branch_id }
   * @returns {Promise<Object>} Building stats object
   */
  getStats = async (options = {}) => {
    const { user = null, pg_id: input_pg_id = null, branch_id = null } = options;

    let effectivePgId = input_pg_id ? Number(input_pg_id) : null;
    let ownerId = null;

    if (user && user.role === ROLES.ADMIN) {
      ownerId = user.id;
      if (!effectivePgId) {
        const pg = await db('pgs').where({ owner_id: user.id }).whereNull('deleted_at').first();
        if (pg) effectivePgId = pg.id;
      }
    }

    let query = db('buildings')
      .whereNull('buildings.deleted_at')
      .join('pgs', 'buildings.pg_id', 'pgs.id')
      .whereNull('pgs.deleted_at')
      .modify((qb) => {
        if (ownerId) {
          qb.where('pgs.owner_id', ownerId);
        }
        if (effectivePgId) {
          qb.where('buildings.pg_id', effectivePgId);
        }
        if (branch_id && branch_id !== 'all' && branch_id !== 'All') {
          qb.where('buildings.branch_id', Number(branch_id));
        }
      });

    const [bldgCount] = await query.clone().count('buildings.id as total_buildings');
    const bldgIds = (await query.clone().select('buildings.id')).map((b) => b.id);

    let totalFloors = 0;
    if (bldgIds.length > 0) {
      const [flrRes] = await db('floors')
        .whereIn('building_id', bldgIds)
        .whereNull('deleted_at')
        .count('id as total_floors');
      totalFloors = Number(flrRes?.total_floors) || 0;
    }

    let totalRooms = 0;
    if (bldgIds.length > 0) {
      const [rmRes] = await db('rooms')
        .whereIn('building_id', bldgIds)
        .whereNull('deleted_at')
        .count('id as total_rooms');
      totalRooms = Number(rmRes?.total_rooms) || 0;
    }

    return {
      total_buildings: Number(bldgCount?.total_buildings) || 0,
      total_floors: totalFloors,
      total_rooms: totalRooms,
    };
  };

  /**
   * Create a new building along with its assigned floors array in a single transaction
   * @param {Object} data - { pg_id, branch_id, name, total_floors, starting_floor, floors }
   * @returns {Promise<Object>} Created building with nested floors
   */
  create = async (data) => {
    const {
      pg_id: input_pg_id,
      branch_id: input_branch_id,
      name,
      total_floors,
      starting_floor = 1,
      floors: input_floors,
    } = data;

    let branch_id = input_branch_id ? Number(input_branch_id) : null;
    let pg_id = input_pg_id ? Number(input_pg_id) : null;

    if (branch_id) {
      const branch = await db('branches').where({ id: branch_id }).whereNull('deleted_at').first();
      if (!branch) {
        throw new AppError('Selected branch not found', HTTP_STATUS.NOT_FOUND);
      }
      if (!pg_id) pg_id = branch.pg_id;
    }

    if (!branch_id) {
      throw new AppError('Branch ID is required', HTTP_STATUS.BAD_REQUEST);
    }

    // Verify that target PG facility exists and is active
    const pg = await db('pgs').where({ id: pg_id }).whereNull('deleted_at').first();
    if (!pg) {
      throw new AppError('PG facility not found', HTTP_STATUS.NOT_FOUND);
    }

    // Enforce unique building name within the target branch (duplicates allowed across different branches)
    const existing = await db('buildings')
      .where({ branch_id })
      .whereRaw('LOWER(TRIM(name)) = ?', [String(name).trim().toLowerCase()])
      .whereNull('deleted_at')
      .first();

    if (existing) {
      throw new AppError(
        `Building '${name.trim()}' already exists in this branch`,
        HTTP_STATUS.CONFLICT
      );
    }

    // Determine floors array to assign to this building:
    let floorsToInsert = [];
    if (Array.isArray(input_floors) && input_floors.length > 0) {
      floorsToInsert = input_floors.map((f, idx) => {
        const fNum = f.floor_number !== undefined && f.floor_number !== null
          ? Number(f.floor_number)
          : (idx + 1);
        return {
          floor_number: fNum,
          name: f.name ? String(f.name).trim() : getFloorName(fNum),
        };
      });
    } else if (total_floors !== undefined && total_floors !== null) {
      const count = Math.max(1, parseInt(total_floors, 10) || 1);
      const start = Number(starting_floor) === 0 ? 0 : 1;
      for (let i = 0; i < count; i++) {
        const fNum = start + i;
        floorsToInsert.push({
          floor_number: fNum,
          name: getFloorName(fNum),
        });
      }
    } else {
      // Default: create at least 1st Floor
      floorsToInsert.push({
        floor_number: 1,
        name: '1st Floor',
      });
    }

    // Enforce unique floor names and floor numbers within this building (duplicates allowed across different buildings)
    const seenFloorNames = new Set();
    const seenFloorNumbers = new Set();
    for (const f of floorsToInsert) {
      const norm = String(f.name).trim().toLowerCase();
      if (seenFloorNames.has(norm)) {
        throw new AppError(
          `Floor name '${f.name}' cannot be duplicated in the same building`,
          HTTP_STATUS.CONFLICT
        );
      }
      seenFloorNames.add(norm);

      if (f.floor_number !== undefined && f.floor_number !== null) {
        if (seenFloorNumbers.has(f.floor_number)) {
          throw new AppError(
            `Floor number '${f.floor_number}' cannot be duplicated in the same building`,
            HTTP_STATUS.CONFLICT
          );
        }
        seenFloorNumbers.add(f.floor_number);
      }
    }

    const createdBuildingId = await db.transaction(async (trx) => {
      const [newId] = await trx('buildings').insert({
        pg_id,
        branch_id,
        name: String(name).trim(),
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

      if (floorsToInsert.length > 0) {
        const floorRows = floorsToInsert.map((f) => ({
          pg_id,
          building_id: newId,
          floor_number: f.floor_number,
          name: f.name,
          created_at: db.fn.now(),
          updated_at: db.fn.now(),
        }));
        await trx('floors').insert(floorRows);
      }

      return newId;
    });

    try {
      socketService.emitStatsUpdated(pg_id, SOCKET_EVENTS.BUILDING_STATS_UPDATED, { building_id: createdBuildingId });
    } catch (e) {}

    return this.findById(createdBuildingId);
  };

  /**
   * Retrieve list of buildings with filtering, nested floors array, and room counts
   * @param {Object} options
   * @returns {Promise<{buildings: Array<Object>, pagination: Object}>}
   */
  findAll = async (options = {}) => {
    const {
      pg_id,
      branch_id,
      owner_id,
      search,
      page = 1,
      limit = 10,
    } = options;

    const current_page = Math.max(1, parseInt(page, 10) || 1);
    const per_page = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (current_page - 1) * per_page;

    const base_query = db('buildings')
      .whereNull('buildings.deleted_at')
      .join('pgs', (join) => {
        join.on('buildings.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .leftJoin('branches', (join) => {
        join.on('buildings.branch_id', '=', 'branches.id').andOnNull('branches.deleted_at');
      })
      .modify((qb) => {
        if (owner_id) {
          qb.where('pgs.owner_id', owner_id);
        }
        if (pg_id) {
          qb.where('buildings.pg_id', pg_id);
        }
        if (branch_id && branch_id !== 'all') {
          qb.where('buildings.branch_id', Number(branch_id));
        }
        if (search) {
          qb.where((sqb) => {
            sqb.where('buildings.name', 'like', `%${search}%`)
               .orWhere('branches.name', 'like', `%${search}%`);
          });
        }
      });

    // 1. Get total count
    const total_res = await base_query.clone().count('buildings.id as total').first();
    const total_records = total_res ? parseInt(total_res.total, 10) : 0;
    const total_pages = Math.ceil(total_records / per_page) || 1;

    // 2. Query buildings page
    const buildings = await base_query
      .clone()
      .select(
        'buildings.id',
        'buildings.pg_id',
        'buildings.branch_id',
        'pgs.name as pg_name',
        db.raw('COALESCE(branches.name, pgs.name) as branch_name'),
        'branches.name as branch_title',
        'buildings.name',
        'buildings.created_at',
        'buildings.updated_at'
      )
      .orderBy('buildings.id', 'desc')
      .limit(per_page)
      .offset(offset);

    if (buildings.length === 0) {
      return {
        buildings: [],
        pagination: {
          page: current_page,
          limit: per_page,
          total_records,
          total_pages,
          has_next: false,
          has_prev: current_page > 1,
        },
      };
    }

    // 3. Batch load all assigned floors and room counts for these buildings
    const buildingIds = buildings.map((b) => b.id);
    const floors = await db('floors')
      .whereIn('floors.building_id', buildingIds)
      .whereNull('floors.deleted_at')
      .leftJoin('rooms', (join) => {
        join.on('floors.id', '=', 'rooms.floor_id').andOnNull('rooms.deleted_at');
      })
      .select(
        'floors.id',
        'floors.building_id',
        'floors.floor_number',
        'floors.name',
        db.raw('COUNT(rooms.id) as total_rooms'),
        'floors.created_at',
        'floors.updated_at'
      )
      .groupBy('floors.id')
      .orderBy('floors.floor_number', 'asc');

    const floorsByBuilding = new Map();
    for (const f of floors) {
      if (!floorsByBuilding.has(f.building_id)) {
        floorsByBuilding.set(f.building_id, []);
      }
      floorsByBuilding.get(f.building_id).push({
        id: f.id,
        building_id: f.building_id,
        floor_number: Number(f.floor_number),
        name: f.name,
        total_rooms: parseInt(f.total_rooms, 10) || 0,
        created_at: f.created_at,
        updated_at: f.updated_at,
      });
    }

    const enrichedBuildings = buildings.map((b) => {
      const bFloors = floorsByBuilding.get(b.id) || [];
      const totalRooms = bFloors.reduce((sum, f) => sum + f.total_rooms, 0);
      return {
        ...b,
        total_floors: bFloors.length,
        total_rooms: totalRooms,
        floors: bFloors,
      };
    });

    return {
      buildings: enrichedBuildings,
      pagination: {
        page: current_page,
        limit: per_page,
        total_records,
        total_pages,
        has_next: current_page < total_pages,
        has_prev: current_page > 1,
      },
    };
  };

  /**
   * Find building by ID with its assigned array of floors and room counts
   * @param {number|string} id
   * @returns {Promise<Object|null>}
   */
  findById = async (id) => {
    const building = await db('buildings')
      .where('buildings.id', id)
      .whereNull('buildings.deleted_at')
      .join('pgs', (join) => {
        join.on('buildings.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .leftJoin('branches', (join) => {
        join.on('buildings.branch_id', '=', 'branches.id').andOnNull('branches.deleted_at');
      })
      .select(
        'buildings.id',
        'buildings.pg_id',
        'buildings.branch_id',
        'pgs.name as pg_name',
        db.raw('COALESCE(branches.name, pgs.name) as branch_name'),
        'branches.name as branch_title',
        'pgs.owner_id',
        'buildings.name',
        'buildings.created_at',
        'buildings.updated_at'
      )
      .first();

    if (!building) return null;

    // Retrieve assigned floors and room counts for this building
    const floors = await db('floors')
      .where('floors.building_id', id)
      .whereNull('floors.deleted_at')
      .leftJoin('rooms', (join) => {
        join.on('floors.id', '=', 'rooms.floor_id').andOnNull('rooms.deleted_at');
      })
      .select(
        'floors.id',
        'floors.building_id',
        'floors.floor_number',
        'floors.name',
        db.raw('COUNT(rooms.id) as total_rooms'),
        'floors.created_at',
        'floors.updated_at'
      )
      .groupBy('floors.id')
      .orderBy('floors.floor_number', 'asc');

    // Total rooms in building
    const roomsCount = await db('rooms')
      .where({ building_id: id })
      .whereNull('deleted_at')
      .count('id as total')
      .first();

    return {
      ...building,
      total_floors: floors.length,
      total_rooms: roomsCount ? parseInt(roomsCount.total, 10) : 0,
      floors: floors.map((f) => ({
        id: f.id,
        building_id: f.building_id,
        floor_number: Number(f.floor_number),
        name: f.name,
        total_rooms: parseInt(f.total_rooms, 10) || 0,
        created_at: f.created_at,
        updated_at: f.updated_at,
      })),
    };
  };

  /**
   * Update building details and synchronize its assigned array of floors
   * @param {number|string} id
   * @param {Object} data - { name, branch_id, total_floors, floors }
   * @returns {Promise<Object>} Updated building with fresh array of floors
   */
  update = async (id, data) => {
    const building = await this.findById(id);
    if (!building) {
      throw new AppError('Building not found', HTTP_STATUS.NOT_FOUND);
    }

    const { name, branch_id, total_floors, floors } = data;
    const update_payload = { updated_at: db.fn.now() };

    let targetBranchId = building.branch_id;
    if (branch_id !== undefined && branch_id !== null) {
      targetBranchId = Number(branch_id);
      const branch = await db('branches').where({ id: targetBranchId }).whereNull('deleted_at').first();
      if (!branch) {
        throw new AppError('Selected branch not found', HTTP_STATUS.NOT_FOUND);
      }
      update_payload.branch_id = targetBranchId;

      // Cascade branch_id update to all rooms belonging to this building
      if (targetBranchId !== building.branch_id) {
        await db('rooms').where({ building_id: id }).whereNull('deleted_at').update({
          branch_id: targetBranchId,
          updated_at: db.fn.now(),
        });
      }
    }

    if (
      (name && name.trim() !== building.name) ||
      (branch_id !== undefined && Number(branch_id) !== building.branch_id)
    ) {
      const checkName = name ? name.trim() : building.name;
      const existing = await db('buildings')
        .where({ branch_id: targetBranchId })
        .whereRaw('LOWER(TRIM(name)) = ?', [checkName.toLowerCase()])
        .whereNull('deleted_at')
        .whereNot({ id })
        .first();

      if (existing) {
        throw new AppError(
          `Building '${checkName}' already exists in this branch`,
          HTTP_STATUS.CONFLICT
        );
      }
      if (name) update_payload.name = name.trim();
    }

    // Validate floor names and numbers within this building if floors array is passed
    if (Array.isArray(floors)) {
      const seenFloorNames = new Set();
      const seenFloorNumbers = new Set();
      for (const f of floors) {
        if (!f || typeof f !== 'object') continue;
        const fNum = f.floor_number !== undefined && f.floor_number !== null ? Number(f.floor_number) : null;
        const fName = f.name && String(f.name).trim() ? String(f.name).trim() : (fNum !== null ? getFloorName(fNum) : null);

        if (fName) {
          const norm = fName.toLowerCase();
          if (seenFloorNames.has(norm)) {
            throw new AppError(
              `Floor name '${fName}' cannot be duplicated in the same building`,
              HTTP_STATUS.CONFLICT
            );
          }
          seenFloorNames.add(norm);
        }

        if (fNum !== null && !isNaN(fNum)) {
          if (seenFloorNumbers.has(fNum)) {
            throw new AppError(
              `Floor number '${fNum}' cannot be duplicated in the same building`,
              HTTP_STATUS.CONFLICT
            );
          }
          seenFloorNumbers.add(fNum);
        }
      }
    }

    await db.transaction(async (trx) => {
      if (Object.keys(update_payload).length > 0) {
        await trx('buildings').where({ id }).update(update_payload);
      }

      // Synchronize assigned floors when floors array is passed
      if (Array.isArray(floors)) {
        const existingFloors = await trx('floors').where({ building_id: id }).whereNull('deleted_at');
        const existingById = new Map(existingFloors.map((f) => [Number(f.id), f]));
        const existingByNum = new Map(existingFloors.map((f) => [Number(f.floor_number), f]));
        const retainedFloorIds = new Set();

        for (const f of floors) {
          const fNum = f.floor_number !== undefined && f.floor_number !== null
            ? Number(f.floor_number)
            : null;
          let matchedFloor = null;

          if (f.id && existingById.has(Number(f.id))) {
            matchedFloor = existingById.get(Number(f.id));
          } else if (fNum !== null && existingByNum.has(fNum) && !retainedFloorIds.has(existingByNum.get(fNum).id)) {
            matchedFloor = existingByNum.get(fNum);
          }

          if (matchedFloor) {
            retainedFloorIds.add(matchedFloor.id);
            const fUpdate = { updated_at: db.fn.now() };
            if (f.name) fUpdate.name = String(f.name).trim();
            if (fNum !== null) fUpdate.floor_number = fNum;
            await trx('floors').where({ id: matchedFloor.id }).update(fUpdate);
          } else {
            const finalNum = fNum !== null ? fNum : (existingFloors.length + 1);
            const [newFloorId] = await trx('floors').insert({
              pg_id: building.pg_id,
              building_id: id,
              floor_number: finalNum,
              name: f.name ? String(f.name).trim() : getFloorName(finalNum),
              created_at: db.fn.now(),
              updated_at: db.fn.now(),
            });
            retainedFloorIds.add(newFloorId);
          }
        }

        // Soft-delete any existing floors omitted from the payload array
        for (const existingFloor of existingFloors) {
          if (!retainedFloorIds.has(existingFloor.id)) {
            const roomsOnFloor = await trx('rooms')
              .where({ floor_id: existingFloor.id })
              .whereNull('deleted_at')
              .count('id as total')
              .first();
            const count = roomsOnFloor ? parseInt(roomsOnFloor.total, 10) : 0;
            if (count > 0) {
              throw new AppError(
                `Cannot remove '${existingFloor.name}' because ${count} room(s) are assigned to it. Please reassign or delete the rooms first.`,
                HTTP_STATUS.BAD_REQUEST
              );
            }
            await trx('floors').where({ id: existingFloor.id }).update({
              deleted_at: db.fn.now(),
              updated_at: db.fn.now(),
            });
          }
        }
      } else if (total_floors !== undefined && total_floors !== null) {
        // Adjust floor count via total_floors count
        const count = Math.max(1, parseInt(total_floors, 10) || 1);
        const existingFloors = await trx('floors')
          .where({ building_id: id })
          .whereNull('deleted_at')
          .orderBy('floor_number', 'asc');

        if (existingFloors.length < count) {
          const maxFloorNum = existingFloors.length > 0
            ? Math.max(...existingFloors.map((f) => f.floor_number))
            : 0;
          const toAdd = count - existingFloors.length;
          const rows = [];
          for (let i = 1; i <= toAdd; i++) {
            const nextNum = maxFloorNum + i;
            rows.push({
              pg_id: building.pg_id,
              building_id: id,
              floor_number: nextNum,
              name: getFloorName(nextNum),
              created_at: db.fn.now(),
              updated_at: db.fn.now(),
            });
          }
          await trx('floors').insert(rows);
        }
      }
    });

    try {
      socketService.emitStatsUpdated(building.pg_id, SOCKET_EVENTS.BUILDING_STATS_UPDATED, { building_id: id });
    } catch (e) {}

    return this.findById(id);
  };

  /**
   * Soft delete building and all its assigned floors
   * @param {number|string} id
   * @returns {Promise<boolean>}
   */
  remove = async (id) => {
    const building = await this.findById(id);
    if (!building) {
      throw new AppError('Building not found', HTTP_STATUS.NOT_FOUND);
    }

    // Guard against deleting building while active rooms are assigned to it
    const activeRooms = await db('rooms')
      .where({ building_id: id })
      .whereNull('deleted_at')
      .count('id as total')
      .first();

    const count = activeRooms ? parseInt(activeRooms.total, 10) : 0;
    if (count > 0) {
      throw new AppError(
        `Cannot delete building because ${count} active room(s) are assigned to it. Please reassign or delete rooms first.`,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    await db.transaction(async (trx) => {
      // Soft delete all assigned floors under this building
      await trx('floors')
        .where({ building_id: id })
        .whereNull('deleted_at')
        .update({ deleted_at: db.fn.now(), updated_at: db.fn.now() });

      // Soft delete building
      await trx('buildings')
        .where({ id })
        .whereNull('deleted_at')
        .update({ deleted_at: db.fn.now(), updated_at: db.fn.now() });
    });

    try {
      socketService.emitStatsUpdated(building.pg_id, SOCKET_EVENTS.BUILDING_STATS_UPDATED, { building_id: id, deleted: true });
    } catch (e) {}

    return true;
  };
}

export default new BuildingService();
