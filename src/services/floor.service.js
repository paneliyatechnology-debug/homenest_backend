import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';

export class FloorService {
  /**
   * Create a new floor under a building
   * @param {Object} data - { pg_id, building_id, floor_number, name }
   * @returns {Promise<Object>} Created floor
   */
  create = async (data) => {
    const {
      building_id,
      floor_number,
      name,
    } = data;

    // Check building exists
    const building = await db('buildings')
      .where({ id: building_id })
      .whereNull('deleted_at')
      .first();

    if (!building) {
      throw new AppError('Building not found', HTTP_STATUS.NOT_FOUND);
    }

    const pg_id = data.pg_id || building.pg_id;

    const fNum = Number(floor_number);

    // Check unique floor_number in building
    const existing = await db('floors')
      .where({ building_id, floor_number: fNum })
      .whereNull('deleted_at')
      .first();

    if (existing) {
      throw new AppError(
        `Floor ${fNum} already exists in building '${building.name}'`,
        HTTP_STATUS.CONFLICT
      );
    }

    const defaultName = fNum === 0 ? 'Ground Floor' : `Floor ${fNum}`;
    const floorName = name ? String(name).trim() : defaultName;

    const [id] = await db('floors').insert({
      pg_id,
      building_id,
      floor_number: fNum,
      name: floorName,
    });

    return this.findById(id);
  };

  /**
   * List floors with filtering and room counts
   * @param {Object} options
   * @returns {Promise<{floors: Array<Object>, pagination: Object}>}
   */
  findAll = async (options = {}) => {
    const {
      pg_id,
      building_id,
      owner_id,
      search,
      page = 1,
      limit = 10,
    } = options;

    const current_page = Math.max(1, parseInt(page, 10) || 1);
    const per_page = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (current_page - 1) * per_page;

    const base_query = db('floors')
      .whereNull('floors.deleted_at')
      .join('buildings', (join) => {
        join.on('floors.building_id', '=', 'buildings.id').andOnNull('buildings.deleted_at');
      })
      .join('pgs', (join) => {
        join.on('floors.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .modify((qb) => {
        if (owner_id) {
          qb.where('pgs.owner_id', owner_id);
        }
        if (pg_id) {
          qb.where('floors.pg_id', pg_id);
        }
        if (building_id) {
          qb.where('floors.building_id', building_id);
        }
        if (search) {
          qb.where((sqb) => {
            sqb.where('floors.name', 'like', `%${search}%`)
              .orWhere('buildings.name', 'like', `%${search}%`);
          });
        }
      });

    const count_res = await base_query.clone().count('floors.id as total').first();
    const total = count_res ? parseInt(count_res.total, 10) : 0;

    const raw_floors = await base_query
      .clone()
      .leftJoin('rooms', (join) => {
        join.on('floors.id', '=', 'rooms.floor_id').andOnNull('rooms.deleted_at');
      })
      .select(
        'floors.id',
        'floors.pg_id',
        'pgs.name as pg_name',
        'floors.building_id',
        'buildings.name as building_name',
        'floors.floor_number',
        'floors.name',
        db.raw('COUNT(DISTINCT rooms.id) as total_rooms'),
        'floors.created_at',
        'floors.updated_at'
      )
      .groupBy('floors.id', 'pgs.name', 'buildings.name')
      .orderBy('buildings.name', 'asc')
      .orderBy('floors.floor_number', 'asc')
      .limit(per_page)
      .offset(offset);

    const total_pages = Math.ceil(total / per_page) || 1;

    return {
      floors: raw_floors.map((f) => ({
        ...f,
        total_rooms: parseInt(f.total_rooms, 10) || 0,
      })),
      pagination: {
        total,
        page: current_page,
        limit: per_page,
        total_pages,
        has_next: current_page < total_pages,
        has_prev: current_page > 1,
      },
    };
  };

  /**
   * Find floor by ID with its list of rooms
   * @param {number|string} id
   * @returns {Promise<Object|null>}
   */
  findById = async (id) => {
    const floor = await db('floors')
      .where('floors.id', id)
      .whereNull('floors.deleted_at')
      .join('buildings', (join) => {
        join.on('floors.building_id', '=', 'buildings.id').andOnNull('buildings.deleted_at');
      })
      .join('pgs', (join) => {
        join.on('floors.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .select(
        'floors.id',
        'floors.pg_id',
        'pgs.name as pg_name',
        'pgs.owner_id',
        'floors.building_id',
        'buildings.name as building_name',
        'floors.floor_number',
        'floors.name',
        'floors.created_at',
        'floors.updated_at'
      )
      .first();

    if (!floor) return null;

    // Get rooms on this floor
    const rooms = await db('rooms')
      .where({ floor_id: id })
      .whereNull('deleted_at')
      .select(
        'id',
        'room_no',
        'room_type',
        'capacity',
        'status',
        'size',
        'image'
      )
      .orderBy('room_no', 'asc');

    return {
      ...floor,
      total_rooms: rooms.length,
      rooms,
    };
  };

  /**
   * Update floor details
   * @param {number|string} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  update = async (id, data) => {
    const floor = await this.findById(id);
    if (!floor) {
      throw new AppError('Floor not found', HTTP_STATUS.NOT_FOUND);
    }

    const { floor_number, name } = data;
    const update_payload = { updated_at: db.fn.now() };

    if (floor_number !== undefined && Number(floor_number) !== floor.floor_number) {
      const fNum = Number(floor_number);
      const existing = await db('floors')
        .where({ building_id: floor.building_id, floor_number: fNum })
        .whereNull('deleted_at')
        .whereNot({ id })
        .first();

      if (existing) {
        throw new AppError(
          `Floor ${fNum} already exists in building '${floor.building_name}'`,
          HTTP_STATUS.CONFLICT
        );
      }
      update_payload.floor_number = fNum;
    }

    if (name !== undefined) {
      update_payload.name = name ? String(name).trim() : null;
    }

    await db('floors').where({ id }).update(update_payload);
    return this.findById(id);
  };

  /**
   * Soft delete floor
   * @param {number|string} id
   * @returns {Promise<boolean>}
   */
  remove = async (id) => {
    const floor = await this.findById(id);
    if (!floor) {
      throw new AppError('Floor not found', HTTP_STATUS.NOT_FOUND);
    }

    // Check if active rooms exist on this floor
    const activeRooms = await db('rooms')
      .where({ floor_id: id })
      .whereNull('deleted_at')
      .first();

    if (activeRooms) {
      throw new AppError(
        'Cannot delete floor because active rooms are assigned to it. Please reassign or delete rooms first.',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    await db('floors')
      .where({ id })
      .whereNull('deleted_at')
      .update({ deleted_at: db.fn.now(), updated_at: db.fn.now() });

    return true;
  };
}

export default new FloorService();
