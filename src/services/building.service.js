import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';

export class BuildingService {
  /**
   * Create a new building for a PG facility
   * @param {Object} data - { pg_id, name }
   * @returns {Promise<Object>} Created building
   */
  create = async (data) => {
    const {
      pg_id: input_pg_id,
      branch_id: input_branch_id,
      name,
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

    // Check PG exists
    const pg = await db('pgs').where({ id: pg_id }).whereNull('deleted_at').first();
    if (!pg) {
      throw new AppError('PG facility not found', HTTP_STATUS.NOT_FOUND);
    }

    // Check unique name in same branch
    const existing = await db('buildings')
      .where({ branch_id, name: String(name).trim() })
      .whereNull('deleted_at')
      .first();

    if (existing) {
      throw new AppError(
        `Building '${name}' already exists in this branch`,
        HTTP_STATUS.CONFLICT
      );
    }

    const [id] = await db('buildings').insert({
      pg_id,
      branch_id,
      name: String(name).trim(),
    });

    return this.findById(id);
  };

  /**
   * Retrieve list of buildings with filtering, counts of floors and rooms.
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
        if (branch_id) {
          qb.where('buildings.branch_id', Number(branch_id));
        }
        if (search) {
          qb.where((sqb) => {
            sqb.where('buildings.name', 'like', `%${search}%`)
              .orWhere('branches.name', 'like', `%${search}%`)
              .orWhere('pgs.name', 'like', `%${search}%`);
          });
        }
      });

    const count_res = await base_query.clone().count('buildings.id as total').first();
    const total = count_res ? parseInt(count_res.total, 10) : 0;

    const raw_buildings = await base_query
      .clone()
      .leftJoin('floors', (join) => {
        join.on('buildings.id', '=', 'floors.building_id').andOnNull('floors.deleted_at');
      })
      .leftJoin('rooms', (join) => {
        join.on('buildings.id', '=', 'rooms.building_id').andOnNull('rooms.deleted_at');
      })
      .select(
        'buildings.id',
        'buildings.pg_id',
        'buildings.branch_id',
        'pgs.name as pg_name',
        db.raw('COALESCE(branches.name, pgs.name) as branch_name'),
        'branches.name as branch_title',
        'buildings.name',
        db.raw('COUNT(DISTINCT floors.id) as total_floors'),
        db.raw('COUNT(DISTINCT rooms.id) as total_rooms'),
        'buildings.created_at',
        'buildings.updated_at'
      )
      .groupBy('buildings.id', 'pgs.name')
      .orderBy('buildings.name', 'asc')
      .limit(per_page)
      .offset(offset);

    const total_pages = Math.ceil(total / per_page) || 1;

    return {
      buildings: raw_buildings.map((b) => ({
        ...b,
        total_floors: parseInt(b.total_floors, 10) || 0,
        total_rooms: parseInt(b.total_rooms, 10) || 0,
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
   * Find building by ID with its list of floors
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

    // Fetch floors belonging to this building
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
        ...f,
        total_rooms: parseInt(f.total_rooms, 10) || 0,
      })),
    };
  };

  /**
   * Update building details
   * @param {number|string} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  update = async (id, data) => {
    const building = await this.findById(id);
    if (!building) {
      throw new AppError('Building not found', HTTP_STATUS.NOT_FOUND);
    }

    const { name, branch_id } = data;
    const update_payload = { updated_at: db.fn.now() };

    let targetBranchId = building.branch_id;
    if (branch_id !== undefined) {
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
        .where({ branch_id: targetBranchId, name: checkName })
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

    await db('buildings').where({ id }).update(update_payload);
    return this.findById(id);
  };

  /**
   * Soft delete building
   * @param {number|string} id
   * @returns {Promise<boolean>}
   */
  remove = async (id) => {
    const building = await this.findById(id);
    if (!building) {
      throw new AppError('Building not found', HTTP_STATUS.NOT_FOUND);
    }

    // Check if active rooms exist under this building
    const activeRooms = await db('rooms')
      .where({ building_id: id })
      .whereNull('deleted_at')
      .first();

    if (activeRooms) {
      throw new AppError(
        'Cannot delete building because active rooms are assigned to it. Please reassign or delete rooms first.',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    await db.transaction(async (trx) => {
      // Soft delete all floors under this building
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

    return true;
  };
}

export default new BuildingService();
