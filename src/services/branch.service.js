import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';
import { buildFileUrl } from '../utils/url.js';
import { deleteBranchPhotoFile } from '../middlewares/upload.middleware.js';

/**
 * Service managing Property Branches.
 * Enables multi-branch management under a PG facility.
 */
class BranchService {
  /**
   * Helper: Format branch record with file URLs and numeric counters
   * @param {Object} branch - Raw database branch object
   * @returns {Object} Formatted branch object
   */
  formatBranch = (branch) => {
    if (!branch) return null;

    const actualTotal = branch.actual_total_rooms !== undefined ? Number(branch.actual_total_rooms) : null;
    const actualOccupied = branch.actual_occupied_rooms !== undefined ? Number(branch.actual_occupied_rooms) : null;

    const configuredTotal = Number(branch.total_rooms) || 0;
    const total_rooms = actualTotal !== null && actualTotal > 0
      ? Math.max(configuredTotal, actualTotal)
      : configuredTotal;

    const occupied_rooms = actualOccupied !== null
      ? actualOccupied
      : Number(branch.occupied_rooms || 0);

    const available_rooms = Math.max(0, total_rooms - occupied_rooms);

    return {
      id: Number(branch.id),
      pg_id: Number(branch.pg_id),
      pg_name: branch.pg_name || null,
      name: branch.name,
      location: branch.location,
      branch_photo: branch.branch_photo || null,
      branch_photo_url: buildFileUrl('branches', branch.branch_photo),
      total_rooms,
      occupied_rooms,
      available_rooms,
      status: branch.status,
      created_at: branch.created_at,
      updated_at: branch.updated_at,
    };
  };

  /**
   * Resolve PG ID for admin/super_admin/resident
   * @param {Object} user - Authenticated user
   * @param {number|string|null} preferred_pg_id - Optional PG ID
   * @returns {Promise<number>} Resolved PG ID
   */
  resolvePgId = async (user, preferred_pg_id = null) => {
    if (user.role === ROLES.SUPER_ADMIN && preferred_pg_id) {
      return Number(preferred_pg_id);
    }

    if (user.role === ROLES.ADMIN) {
      if (preferred_pg_id) {
        const owned = await db('pgs')
          .where({ id: preferred_pg_id, owner_id: user.id })
          .whereNull('deleted_at')
          .first();
        if (owned) return Number(preferred_pg_id);
      }
      const pg = await db('pgs')
        .where({ owner_id: user.id })
        .whereNull('deleted_at')
        .orderBy('id', 'asc')
        .first();
      if (!pg) {
        throw new AppError('No PG facility registered under your account', HTTP_STATUS.BAD_REQUEST);
      }
      return Number(pg.id);
    }

    if (user.role === ROLES.RESIDENT) {
      const stay = await db('resident_pg_stays')
        .where({ resident_id: user.id, status: 'active' })
        .whereNull('deleted_at')
        .orderBy('id', 'desc')
        .first();
      if (!stay) {
        throw new AppError('No active PG stay found for your resident account', HTTP_STATUS.BAD_REQUEST);
      }
      return Number(stay.pg_id);
    }

    if (preferred_pg_id) return Number(preferred_pg_id);
    throw new AppError('PG facility identification is required', HTTP_STATUS.BAD_REQUEST);
  };

  /**
   * Create a new branch
   * @param {Object} data - Branch fields
   * @param {Object} user - Authenticated user
   * @param {Object} [trx=null] - Optional Knex transaction
   * @returns {Promise<Object>} Created branch
   */
  create = async (data, user, trx = null) => {
    const query = trx ? db('branches').transacting(trx) : db('branches');
    const pgsQuery = trx ? db('pgs').transacting(trx) : db('pgs');

    const pg_id = await this.resolvePgId(user, data.pg_id);

    const pg = await pgsQuery.where({ id: pg_id }).whereNull('deleted_at').first();
    if (!pg) {
      throw new AppError('PG facility not found', HTTP_STATUS.NOT_FOUND);
    }

    // Check unique branch name in same PG
    const existing = await query
      .where({ pg_id, name: String(data.name).trim() })
      .whereNull('deleted_at')
      .first();

    if (existing) {
      throw new AppError(`A branch named '${data.name}' already exists in your PG facility`, HTTP_STATUS.CONFLICT);
    }

    const total_rooms = Number(data.total_rooms) || 0;
    const occupied_rooms = 0;
    const available_rooms = total_rooms;

    const [branch_id] = await query.insert({
      pg_id,
      name: String(data.name).trim(),
      location: String(data.location).trim(),
      branch_photo: data.branch_photo || null,
      total_rooms,
      occupied_rooms,
      available_rooms,
      status: data.status === 'under_maintenance' ? 'maintenance' : (data.status || 'active'),
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    await this.syncBranchStats(branch_id, trx);

    return await this.findById(branch_id, { user, trx });
  };

  /**
   * Find all branches with filters and pagination
   * @param {Object} options
   * @returns {Promise<{ branches: Array<Object>, pagination: Object }>}
   */
  findAll = async (options = {}) => {
    const {
      user = null,
      pg_id = null,
      status = '',
      search = '',
      location = '',
      sort_by = 'created_at',
      order = 'desc',
      page = 1,
      limit = 10,
    } = options;

    const current_page = Math.max(1, parseInt(page, 10) || 1);
    const per_page = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (current_page - 1) * per_page;

    let resolved_pg_id = pg_id;
    if (user && user.role === ROLES.ADMIN && !pg_id) {
      resolved_pg_id = await this.resolvePgId(user);
    } else if (user && user.role === ROLES.RESIDENT) {
      resolved_pg_id = await this.resolvePgId(user);
    }

    const baseQuery = () => {
      let qb = db('branches')
        .whereNull('branches.deleted_at')
        .join('pgs', 'branches.pg_id', 'pgs.id')
        .whereNull('pgs.deleted_at');

      if (user && user.role === ROLES.ADMIN) {
        qb = qb.where('pgs.owner_id', user.id);
      }

      if (resolved_pg_id) {
        qb = qb.where('branches.pg_id', resolved_pg_id);
      }

      if (status && status !== 'all') {
        const canonicalStatus = status === 'under_maintenance' ? 'maintenance' : status;
        qb = qb.whereIn('branches.status', canonicalStatus === 'maintenance' ? ['maintenance', 'under_maintenance'] : [canonicalStatus]);
      }

      if (location) {
        qb = qb.where('branches.location', 'like', `%${location}%`);
      }

      if (search) {
        const searchPattern = `%${search}%`;
        qb = qb.where((inner) => {
          inner
            .where('branches.name', 'like', searchPattern)
            .orWhere('branches.location', 'like', searchPattern)
            .orWhere('pgs.name', 'like', searchPattern);
        });
      }

      return qb;
    };

    // Count query
    const [{ total }] = await baseQuery().count('branches.id as total');
    const total_records = Number(total) || 0;

    const validSortColumns = {
      id: 'branches.id',
      name: 'branches.name',
      location: 'branches.location',
      status: 'branches.status',
      total_rooms: 'branches.total_rooms',
      occupied_rooms: 'branches.occupied_rooms',
      available_rooms: 'branches.available_rooms',
      created_at: 'branches.created_at',
      updated_at: 'branches.updated_at',
    };

    const sortColumn = validSortColumns[sort_by] || 'branches.created_at';
    const sortDirection = String(order).toLowerCase() === 'asc' ? 'asc' : 'desc';

    // Data query with subqueries for real-time room statistics
    const branches = await baseQuery()
      .select(
        'branches.*',
        'pgs.name as pg_name',
        db.raw(`(
          SELECT COUNT(*) FROM rooms
          WHERE rooms.branch_id = branches.id AND rooms.deleted_at IS NULL
        ) as actual_total_rooms`),
        db.raw(`(
          SELECT COUNT(*) FROM rooms
          WHERE rooms.branch_id = branches.id AND rooms.status = 'occupied' AND rooms.deleted_at IS NULL
        ) as actual_occupied_rooms`),
        db.raw(`(
          SELECT COUNT(*) FROM rooms
          WHERE rooms.branch_id = branches.id AND rooms.status = 'vacant' AND rooms.deleted_at IS NULL
        ) as actual_available_rooms`)
      )
      .orderBy(sortColumn, sortDirection)
      .orderBy('branches.id', 'desc')
      .limit(per_page)
      .offset(offset);

    const formattedBranches = branches.map(this.formatBranch);
    const total_pages = Math.ceil(total_records / per_page) || 1;

    return {
      branches: formattedBranches,
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
   * Find branch by primary ID
   * @param {number|string} id - Branch ID
   * @param {Object} options - { user, trx }
   * @returns {Promise<Object>} Formatted branch
   */
  findById = async (id, options = {}) => {
    const { user = null, trx = null } = options;
    const query = trx ? db('branches').transacting(trx) : db('branches');

    let qb = query
      .where('branches.id', id)
      .whereNull('branches.deleted_at')
      .join('pgs', 'branches.pg_id', 'pgs.id')
      .whereNull('pgs.deleted_at')
      .select(
        'branches.*',
        'pgs.name as pg_name',
        'pgs.owner_id',
        db.raw(`(
          SELECT COUNT(*) FROM rooms
          WHERE rooms.branch_id = branches.id AND rooms.deleted_at IS NULL
        ) as actual_total_rooms`),
        db.raw(`(
          SELECT COUNT(*) FROM rooms
          WHERE rooms.branch_id = branches.id AND rooms.status = 'occupied' AND rooms.deleted_at IS NULL
        ) as actual_occupied_rooms`),
        db.raw(`(
          SELECT COUNT(*) FROM rooms
          WHERE rooms.branch_id = branches.id AND rooms.status = 'vacant' AND rooms.deleted_at IS NULL
        ) as actual_available_rooms`)
      );

    const branch = await qb.first();
    if (!branch) {
      throw new AppError('Branch not found', HTTP_STATUS.NOT_FOUND);
    }

    // Role ownership check
    if (user && user.role === ROLES.ADMIN && branch.owner_id !== user.id) {
      throw new AppError('Access denied. You do not own this branch', HTTP_STATUS.FORBIDDEN);
    }

    return this.formatBranch(branch);
  };

  /**
   * Update branch details
   * @param {number|string} id - Branch ID
   * @param {Object} data - Update payload
   * @param {Object} user - Authenticated user
   * @returns {Promise<Object>} Updated branch
   */
  update = async (id, data, user) => {
    const existing = await this.findById(id, { user });

    // Check unique name if name is changed
    if (data.name && String(data.name).trim().toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await db('branches')
        .where({ pg_id: existing.pg_id, name: String(data.name).trim() })
        .whereNot({ id })
        .whereNull('deleted_at')
        .first();

      if (duplicate) {
        throw new AppError(`A branch named '${data.name}' already exists in your PG facility`, HTTP_STATUS.CONFLICT);
      }
    }

    const updatePayload = {
      updated_at: db.fn.now(),
    };

    if (data.name !== undefined) updatePayload.name = String(data.name).trim();
    if (data.location !== undefined) updatePayload.location = String(data.location).trim();
    if (data.status !== undefined) {
      updatePayload.status = data.status === 'under_maintenance' ? 'maintenance' : data.status;
    }

    if (data.total_rooms !== undefined) updatePayload.total_rooms = Number(data.total_rooms) || 0;

    if (data.branch_photo !== undefined) {
      if (existing.branch_photo && existing.branch_photo !== data.branch_photo) {
        deleteBranchPhotoFile(existing.branch_photo);
      }
      updatePayload.branch_photo = data.branch_photo;
    }

    await db('branches').where({ id }).update(updatePayload);
    await this.syncBranchStats(id);

    return await this.findById(id, { user });
  };

  /**
   * Soft delete branch
   * @param {number|string} id - Branch ID
   * @param {Object} user - Authenticated user
   * @returns {Promise<boolean>}
   */
  delete = async (id, user) => {
    const existing = await this.findById(id, { user });

    // Delete photo if exists
    if (existing.branch_photo) {
      deleteBranchPhotoFile(existing.branch_photo);
    }

    await db('branches').where({ id }).update({
      deleted_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    return true;
  };

  /**
   * Get KPI statistics for Branches dashboard cards:
   * Total Branches, Active, Under Maintenance, Upcoming
   * @param {Object} options - { user, pg_id }
   * @returns {Promise<Object>} KPI statistics object
   */
  getStats = async (options = {}) => {
    const { user = null, pg_id = null } = options;

    let resolved_pg_id = pg_id;
    if (user && user.role === ROLES.ADMIN && !pg_id) {
      resolved_pg_id = await this.resolvePgId(user);
    } else if (user && user.role === ROLES.RESIDENT) {
      resolved_pg_id = await this.resolvePgId(user);
    }

    let qb = db('branches')
      .whereNull('branches.deleted_at')
      .join('pgs', 'branches.pg_id', 'pgs.id')
      .whereNull('pgs.deleted_at');

    if (user && user.role === ROLES.ADMIN) {
      qb = qb.where('pgs.owner_id', user.id);
    }

    if (resolved_pg_id) {
      qb = qb.where('branches.pg_id', resolved_pg_id);
    }

    const stats = await qb.select(
      db.raw('COUNT(branches.id) as total_branches'),
      db.raw("SUM(CASE WHEN branches.status = 'active' THEN 1 ELSE 0 END) as active"),
      db.raw("SUM(CASE WHEN branches.status IN ('maintenance', 'under_maintenance') THEN 1 ELSE 0 END) as maintenance"),
      db.raw("SUM(CASE WHEN branches.status = 'upcoming' THEN 1 ELSE 0 END) as upcoming")
    ).first();

    const maintenanceCount = Number(stats?.maintenance) || 0;

    return {
      total_branches: Number(stats?.total_branches) || 0,
      active: Number(stats?.active) || 0,
      maintenance: maintenanceCount,
      upcoming: Number(stats?.upcoming) || 0,
    };
  };

  /**
   * Automatically synchronize total_rooms, occupied_rooms, and available_rooms
   * for a branch based on real rooms and resident assignments.
   * @param {number|string} branch_id
   * @param {Object|null} trx - Optional Knex transaction
   * @returns {Promise<void>}
   */
  syncBranchStats = async (branch_id, trx = null) => {
    if (!branch_id) return;
    const bId = Number(branch_id);
    if (!bId || isNaN(bId)) return;

    const qb = trx || db;

    const branch = await qb('branches').where({ id: bId }).whereNull('deleted_at').first();
    if (!branch) return;

    const roomStats = await qb('rooms')
      .where({ branch_id: bId })
      .whereNull('deleted_at')
      .select(
        db.raw('COUNT(*) as total_rooms_count'),
        db.raw("SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied_count"),
        db.raw("SUM(CASE WHEN status = 'vacant' THEN 1 ELSE 0 END) as vacant_count")
      )
      .first();

    const actualRooms = Number(roomStats?.total_rooms_count) || 0;
    const occupiedCount = Number(roomStats?.occupied_count) || 0;

    const configuredTotal = Number(branch.total_rooms) || 0;
    const total_rooms = actualRooms > 0 ? Math.max(configuredTotal, actualRooms) : configuredTotal;
    const occupied_rooms = occupiedCount;
    const available_rooms = Math.max(0, total_rooms - occupied_rooms);

    await qb('branches').where({ id: bId }).update({
      total_rooms,
      occupied_rooms,
      available_rooms,
      updated_at: db.fn.now(),
    });
  };

  /**
   * Decrement branch total_rooms and available_rooms when a room is deleted.
   * Ensures capacity and availability counts decrease in lockstep.
   * @param {number|string} branch_id
   * @param {Object|null} trx - Optional Knex transaction
   * @returns {Promise<void>}
   */
  decrementBranchRoomsOnDelete = async (branch_id, trx = null) => {
    if (!branch_id) return;
    const bId = Number(branch_id);
    if (!bId || isNaN(bId)) return;

    const qb = trx || db;

    const branch = await qb('branches').where({ id: bId }).whereNull('deleted_at').first();
    if (!branch) return;

    const roomStats = await qb('rooms')
      .where({ branch_id: bId })
      .whereNull('deleted_at')
      .select(
        db.raw('COUNT(*) as total_rooms_count'),
        db.raw("SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied_count"),
        db.raw("SUM(CASE WHEN status = 'vacant' THEN 1 ELSE 0 END) as vacant_count")
      )
      .first();

    const actualRooms = Number(roomStats?.total_rooms_count) || 0;
    const occupiedCount = Number(roomStats?.occupied_count) || 0;

    const currentTotal = Number(branch.total_rooms) || 0;
    // Decrement total_rooms by 1, staying consistent with actual existing rooms
    const newTotal = Math.max(actualRooms, Math.max(0, currentTotal - 1));
    const newOccupied = occupiedCount;
    const newAvailable = Math.max(0, newTotal - newOccupied);

    await qb('branches').where({ id: bId }).update({
      total_rooms: newTotal,
      occupied_rooms: newOccupied,
      available_rooms: newAvailable,
      updated_at: db.fn.now(),
    });
  };
}

const branchService = new BranchService();
export const syncBranchStats = branchService.syncBranchStats;
export const decrementBranchRoomsOnDelete = branchService.decrementBranchRoomsOnDelete;
export default branchService;

