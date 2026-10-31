import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import { syncBranchStats } from './branch.service.js';

/**
 * Service managing resident stays across multiple PGs.
 * Supports residents moving between PGs over time (e.g. Month 1 at PG A, Month 3 at PG B),
 * tracking active vs past stays, rooms, beds, and rent/deposit agreements.
 */
class StayService {
  /**
   * Find stay record by ID with associated PG, room, and resident details
   * @param {number|string} id - Stay record ID
   * @param {object} [trx=null] - Optional Knex transaction instance
   * @returns {Promise<object|null>}
   */
  findById = async (id, trx = null) => {
    const query = trx ? db('resident_pg_stays').transacting(trx) : db('resident_pg_stays');

    return await query
      .where('resident_pg_stays.id', id)
      .whereNull('resident_pg_stays.deleted_at')
      .join('pgs', (join) => {
        join.on('resident_pg_stays.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .join('rooms', (join) => {
        join.on('resident_pg_stays.room_id', '=', 'rooms.id').andOnNull('rooms.deleted_at');
      })
      .join('users as resident', (join) => {
        join.on('resident_pg_stays.resident_id', '=', 'resident.id').andOnNull('resident.deleted_at');
      })
      .join('users as owner', (join) => {
        join.on('pgs.owner_id', '=', 'owner.id').andOnNull('owner.deleted_at');
      })
      .leftJoin('branches', (join) => {
        join.on('resident_pg_stays.branch_id', '=', 'branches.id').andOnNull('branches.deleted_at');
      })
      .leftJoin('buildings', 'rooms.building_id', 'buildings.id')
      .leftJoin('floors', 'rooms.floor_id', 'floors.id')
      .select(
        'resident_pg_stays.*',
        'resident_pg_stays.branch_id',
        db.raw('COALESCE(branches.name, pgs.name) as branch_name'),
        'rooms.room_no as room_number',
        'rooms.room_type',
        'floors.floor_number as room_floor',
        'buildings.name as room_building',
        'pgs.name as pg_name',
        'pgs.type as pg_type',
        'pgs.address as pg_address',
        'pgs.city as pg_city',
        'pgs.state as pg_state',
        'pgs.pincode as pg_pincode',
        'pgs.phone as pg_phone',
        'owner.id as owner_id',
        'owner.name as owner_name',
        'owner.phone as owner_phone',
        'resident.name as resident_name',
        'resident.email as resident_email',
        'resident.phone as resident_phone'
      )
      .first();
  };

  /**
   * Vacate / Check-out resident from PG stay
   * Updates room status to 'vacant' if no remaining active residents in this room.
   * @param {number|string} stay_id
   * @param {object} options
   * @returns {Promise<object>} Updated stay record
   */
  vacateStay = async (stay_id, { check_out_date = null, notes = null } = {}) => {
    const stay = await this.findById(stay_id);
    if (!stay) {
      throw new AppError('Stay record not found', HTTP_STATUS.NOT_FOUND);
    }

    if (stay.status !== 'active') {
      throw new AppError(`Stay is already marked as ${stay.status}`, HTTP_STATUS.BAD_REQUEST);
    }

    const effective_check_out = check_out_date || new Date().toISOString().split('T')[0];

    const updated_notes = notes
      ? (stay.notes ? `${stay.notes} | ${notes}` : notes)
      : stay.notes;

    await db.transaction(async (trx) => {
      await trx('resident_pg_stays')
        .where({ id: stay_id })
        .update({
          check_out_date: effective_check_out,
          status: 'completed',
          notes: updated_notes,
          updated_at: db.fn.now(),
        });

      // If no other active resident in this room, set room to vacant
      const remaining_active = await trx('resident_pg_stays')
        .where({ room_id: stay.room_id, status: 'active' })
        .whereNull('deleted_at')
        .whereNot({ id: stay_id })
        .first();

      if (!remaining_active) {
        await trx('rooms')
          .where({ id: stay.room_id })
          .update({ status: 'vacant', updated_at: db.fn.now() });

        const roomRecord = await trx('rooms').where({ id: stay.room_id }).first();
        if (roomRecord && roomRecord.branch_id) {
          await syncBranchStats(roomRecord.branch_id, trx);
        }
      }
    });

    return await this.findById(stay_id);
  };

  /**
   * Get all stay records for a resident with pagination, filters, and is_current_stay flag.
   * @param {number|string} resident_id
   * @param {object} options
   * @returns {Promise<{ stays: Array, pagination: object }>}
   */
  getResidentStayHistory = async (
    resident_id,
    { status = '', pg_id = null, branch_id = null, search = '', page = 1, limit = 10 } = {}
  ) => {
    const offset = (page - 1) * limit;

    let query = db('resident_pg_stays')
      .where('resident_pg_stays.resident_id', resident_id)
      .whereNull('resident_pg_stays.deleted_at')
      .join('pgs', (join) => {
        join.on('resident_pg_stays.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .leftJoin('branches', (join) => {
        join.on('resident_pg_stays.branch_id', '=', 'branches.id').andOnNull('branches.deleted_at');
      })
      .join('rooms', (join) => {
        join.on('resident_pg_stays.room_id', '=', 'rooms.id').andOnNull('rooms.deleted_at');
      })
      .join('users as owner', (join) => {
        join.on('pgs.owner_id', '=', 'owner.id').andOnNull('owner.deleted_at');
      })
      .leftJoin('buildings', 'rooms.building_id', 'buildings.id')
      .leftJoin('floors', 'rooms.floor_id', 'floors.id')
      .select(
        'resident_pg_stays.id',
        'resident_pg_stays.resident_id',
        'resident_pg_stays.pg_id',
        'resident_pg_stays.branch_id',
        db.raw('COALESCE(branches.name, pgs.name) as branch_name'),
        'pgs.name as pg_name',
        'pgs.type as pg_type',
        'pgs.address as pg_address',
        'pgs.city as pg_city',
        'pgs.state as pg_state',
        'pgs.pincode as pg_pincode',
        'pgs.phone as pg_phone',
        'owner.name as pg_owner_name',
        'owner.phone as pg_owner_phone',
        'resident_pg_stays.room_id',
        'rooms.room_no as room_number',
        'rooms.room_type',
        'floors.floor_number as room_floor',
        'buildings.name as room_building',
        'resident_pg_stays.bed_number',
        'resident_pg_stays.monthly_rent',
        'resident_pg_stays.security_deposit',
        'resident_pg_stays.check_in_date',
        'resident_pg_stays.check_out_date',
        'resident_pg_stays.status',
        'resident_pg_stays.notes',
        'resident_pg_stays.created_at',
        'resident_pg_stays.updated_at'
      );

    let count_query = db('resident_pg_stays')
      .where('resident_pg_stays.resident_id', resident_id)
      .whereNull('resident_pg_stays.deleted_at')
      .join('pgs', (join) => {
        join.on('resident_pg_stays.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .join('rooms', (join) => {
        join.on('resident_pg_stays.room_id', '=', 'rooms.id').andOnNull('rooms.deleted_at');
      })
      .count('resident_pg_stays.id as total');

    if (status) {
      query = query.where('resident_pg_stays.status', status);
      count_query = count_query.where('resident_pg_stays.status', status);
    }

    if (pg_id) {
      query = query.where('resident_pg_stays.pg_id', pg_id);
      count_query = count_query.where('resident_pg_stays.pg_id', pg_id);
    }

    if (branch_id) {
      query = query.where('resident_pg_stays.branch_id', branch_id);
      count_query = count_query.where('resident_pg_stays.branch_id', branch_id);
    }

    if (search) {
      const search_filter = (q) => {
        q.where('rooms.room_no', 'like', `%${search}%`)
          .orWhere('pgs.name', 'like', `%${search}%`)
          .orWhere('pgs.city', 'like', `%${search}%`);
      };
      query = query.where(search_filter);
      count_query = count_query.where(search_filter);
    }

    const [raw_stays, total_result] = await Promise.all([
      query
        .orderBy([
          { column: 'resident_pg_stays.check_in_date', order: 'desc' },
          { column: 'resident_pg_stays.id', order: 'desc' },
        ])
        .limit(limit)
        .offset(offset),
      count_query.first(),
    ]);

    const total = total_result ? Number(total_result.total) : 0;
    const total_pages = Math.ceil(total / limit) || 1;

    const formatted_stays = raw_stays.map((stay) => ({
      ...stay,
      is_current_stay: stay.status === 'active',
    }));

    return {
      stays: formatted_stays,
      pagination: {
        total,
        page,
        limit,
        total_pages,
        has_next: page < total_pages,
        has_prev: page > 1,
      },
    };
  };
}

export default new StayService();
