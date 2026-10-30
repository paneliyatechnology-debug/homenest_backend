import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';

/**
 * Service managing Resident Agreement Records.
 * Handles agreement creation, listing, updates, and removals.
 */
class AgreementService {
  /**
   * Safe fields to select for agreement queries
   */
  static selectFields = [
    'agreements.id',
    'agreements.agreement_no',
    'agreements.resident_id',
    'resident.name as resident_name',
    'resident.email as resident_email',
    'resident.phone as resident_phone',
    'agreements.pg_id',
    'pgs.name as pg_name',
    'pgs.owner_id',
    'agreements.room_id',
    'rooms.room_no as room_number',
    'agreements.room_type',
    'agreements.agreement_type',
    'agreements.start_date',
    'agreements.end_date',
    'agreements.status',
    'agreements.created_at',
    'agreements.updated_at',
    'agreements.deleted_at',
  ];

  /**
   * Find agreement record by ID
   * @param {number|string} id - Agreement ID
   * @param {object} [trx=null] - Optional Knex transaction
   * @returns {Promise<object|null>}
   */
  findById = async (id, trx = null) => {
    const query = trx ? db('agreements').transacting(trx) : db('agreements');

    return await query
      .where('agreements.id', id)
      .whereNull('agreements.deleted_at')
      .join('users as resident', (join) => {
        join.on('agreements.resident_id', '=', 'resident.id').andOnNull('resident.deleted_at');
      })
      .join('pgs', (join) => {
        join.on('agreements.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .leftJoin('rooms', (join) => {
        join.on('agreements.room_id', '=', 'rooms.id').andOnNull('rooms.deleted_at');
      })
      .select(AgreementService.selectFields)
      .first();
  };

  /**
   * Find agreement by unique agreement number
   * @param {string} agreement_no
   * @returns {Promise<object|null>}
   */
  findByAgreementNo = async (agreement_no) => {
    if (!agreement_no) return null;
    return await db('agreements')
      .where({ agreement_no: String(agreement_no).trim() })
      .whereNull('deleted_at')
      .first();
  };

  /**
   * Create a new agreement record
   * @param {object} data - Agreement payload
   * @returns {Promise<object>} Created agreement record
   */
  create = async (data) => {
    const {
      agreement_no,
      resident_id,
      pg_id,
      room_id = null,
      room_type = null,
      agreement_type = 'rental',
      start_date,
      end_date = null,
      status = 'draft',
    } = data;

    // Verify resident exists
    const resident = await db('users').where({ id: resident_id }).whereNull('deleted_at').first();
    if (!resident) {
      throw new AppError('Resident not found', HTTP_STATUS.NOT_FOUND);
    }

    // Verify PG exists
    const pg = await db('pgs').where({ id: pg_id }).whereNull('deleted_at').first();
    if (!pg) {
      throw new AppError('PG facility not found', HTTP_STATUS.NOT_FOUND);
    }

    // Check unique agreement number
    const existing = await this.findByAgreementNo(agreement_no);
    if (existing) {
      throw new AppError(`Agreement number '${agreement_no}' already exists`, HTTP_STATUS.CONFLICT);
    }

    // Resolve room details if room_id is passed
    let resolved_room_type = room_type;
    if (room_id) {
      const room = await db('rooms').where({ id: room_id }).whereNull('deleted_at').first();
      if (!room) {
        throw new AppError('Room not found', HTTP_STATUS.NOT_FOUND);
      }
      if (Number(room.pg_id) !== Number(pg_id)) {
        throw new AppError('Selected room does not belong to the specified PG facility', HTTP_STATUS.BAD_REQUEST);
      }
      if (!resolved_room_type) {
        resolved_room_type = room.room_type;
      }
    }

    const [id] = await db('agreements').insert({
      agreement_no: String(agreement_no).trim(),
      resident_id: Number(resident_id),
      pg_id: Number(pg_id),
      room_id: room_id ? Number(room_id) : null,
      room_type: resolved_room_type || null,
      agreement_type: String(agreement_type).trim().toLowerCase(),
      start_date,
      end_date: end_date || null,
      status: String(status).trim().toLowerCase(),
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    return await this.findById(id);
  };

  /**
   * Find all agreement records with filters and pagination
   * @param {object} options
   * @returns {Promise<{ agreements: Array, pagination: object }>}
   */
  findAll = async (options = {}) => {
    const {
      resident_id = null,
      pg_id = null,
      owner_id = null,
      status = '',
      agreement_type = '',
      search = '',
      page = 1,
      limit = 10,
    } = options;

    const current_page = Math.max(1, parseInt(page, 10) || 1);
    const per_page = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (current_page - 1) * per_page;

    const base_query = db('agreements')
      .whereNull('agreements.deleted_at')
      .join('users as resident', (join) => {
        join.on('agreements.resident_id', '=', 'resident.id').andOnNull('resident.deleted_at');
      })
      .join('pgs', (join) => {
        join.on('agreements.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .leftJoin('rooms', (join) => {
        join.on('agreements.room_id', '=', 'rooms.id').andOnNull('rooms.deleted_at');
      })
      .modify((qb) => {
        if (owner_id) {
          qb.where('pgs.owner_id', owner_id);
        }
        if (resident_id) {
          qb.where('agreements.resident_id', resident_id);
        }
        if (pg_id) {
          qb.where('agreements.pg_id', pg_id);
        }
        if (status) {
          qb.where('agreements.status', status);
        }
        if (agreement_type) {
          qb.where('agreements.agreement_type', agreement_type);
        }
        if (search) {
          const pattern = `%${search}%`;
          qb.where((search_qb) => {
            search_qb
              .where('agreements.agreement_no', 'like', pattern)
              .orWhere('resident.name', 'like', pattern)
              .orWhere('resident.email', 'like', pattern)
              .orWhere('resident.phone', 'like', pattern)
              .orWhere('rooms.room_no', 'like', pattern);
          });
        }
      });

    // Count total records
    const count_result = await base_query.clone().count('agreements.id as total').first();
    const total = count_result ? parseInt(count_result.total, 10) : 0;

    // Fetch paginated rows
    const agreements = await base_query
      .clone()
      .select(AgreementService.selectFields)
      .orderBy('agreements.id', 'desc')
      .limit(per_page)
      .offset(offset);

    return {
      agreements,
      pagination: {
        total,
        page: current_page,
        limit: per_page,
        total_pages: Math.ceil(total / per_page) || 1,
      },
    };
  };

  /**
   * Update an agreement record
   * @param {number|string} id - Agreement ID
   * @param {object} update_data - Allowed updates
   * @returns {Promise<object>} Updated agreement record
   */
  update = async (id, update_data) => {
    const existing = await this.findById(id);
    if (!existing) {
      throw new AppError('Agreement record not found', HTTP_STATUS.NOT_FOUND);
    }

    // Check unique agreement_no if changing
    if (update_data.agreement_no && update_data.agreement_no !== existing.agreement_no) {
      const duplicate = await db('agreements')
        .where({ agreement_no: update_data.agreement_no })
        .whereNull('deleted_at')
        .whereNot({ id })
        .first();

      if (duplicate) {
        throw new AppError(`Agreement number '${update_data.agreement_no}' is already in use`, HTTP_STATUS.CONFLICT);
      }
    }

    let resolved_room_type = update_data.room_type !== undefined ? update_data.room_type : existing.room_type;
    if (update_data.room_id && update_data.room_id !== existing.room_id) {
      const room = await db('rooms').where({ id: update_data.room_id }).whereNull('deleted_at').first();
      if (!room) {
        throw new AppError('Room not found', HTTP_STATUS.NOT_FOUND);
      }
      if (Number(room.pg_id) !== Number(update_data.pg_id || existing.pg_id)) {
        throw new AppError('Selected room does not belong to the specified PG facility', HTTP_STATUS.BAD_REQUEST);
      }
      if (update_data.room_type === undefined) {
        resolved_room_type = room.room_type;
      }
    }

    const allowed_updates = {
      ...(update_data.agreement_no !== undefined && { agreement_no: String(update_data.agreement_no).trim() }),
      ...(update_data.room_id !== undefined && { room_id: update_data.room_id ? Number(update_data.room_id) : null }),
      ...(resolved_room_type !== undefined && { room_type: resolved_room_type }),
      ...(update_data.agreement_type !== undefined && { agreement_type: String(update_data.agreement_type).trim().toLowerCase() }),
      ...(update_data.start_date !== undefined && { start_date: update_data.start_date }),
      ...(update_data.end_date !== undefined && { end_date: update_data.end_date || null }),
      ...(update_data.status !== undefined && { status: String(update_data.status).trim().toLowerCase() }),
      updated_at: db.fn.now(),
    };

    await db('agreements').where({ id }).whereNull('deleted_at').update(allowed_updates);

    return await this.findById(id);
  };

  /**
   * Get KPI statistical counts for agreements (Total Agreements, Draft, Pending Sign, Signed, Expired)
   * Supports filtering by owner_id (for admin), resident_id, pg_id (branch), and agreement_type.
   * @param {object} options
   * @returns {Promise<{ total_agreements: number, draft: number, pending_sign: number, signed: number, expired: number }>}
   */
  getStats = async (options = {}) => {
    const { owner_id, resident_id, pg_id, agreement_type } = options;

    const base_query = db('agreements')
      .whereNull('agreements.deleted_at')
      .join('pgs', (join) => {
        join.on('agreements.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .modify((qb) => {
        if (owner_id) {
          qb.where('pgs.owner_id', owner_id);
        }
        if (resident_id) {
          qb.where('agreements.resident_id', resident_id);
        }
        if (pg_id) {
          qb.where('agreements.pg_id', pg_id);
        }
        if (agreement_type) {
          qb.where('agreements.agreement_type', agreement_type);
        }
      });

    const [counts] = await base_query.select(
      db.raw('COUNT(agreements.id) as total_agreements'),
      db.raw("SUM(CASE WHEN agreements.status = 'draft' THEN 1 ELSE 0 END) as draft"),
      db.raw("SUM(CASE WHEN agreements.status IN ('pending', 'pending_sign', 'pending_signature') THEN 1 ELSE 0 END) as pending_sign"),
      db.raw("SUM(CASE WHEN agreements.status = 'signed' THEN 1 ELSE 0 END) as signed"),
      db.raw("SUM(CASE WHEN agreements.status = 'expired' THEN 1 ELSE 0 END) as expired")
    );

    const total_agreements = parseInt(counts?.total_agreements, 10) || 0;
    const draft = parseInt(counts?.draft, 10) || 0;
    const pending_sign = parseInt(counts?.pending_sign, 10) || 0;
    const signed = parseInt(counts?.signed, 10) || 0;
    const expired = parseInt(counts?.expired, 10) || 0;

    return {
      total_agreements,
      total: total_agreements,
      draft,
      pending_sign,
      pending: pending_sign,
      signed,
      expired,
    };
  };

  /**
   * Delete an agreement record (Soft Delete)
   * @param {number|string} id - Agreement ID
   * @returns {Promise<boolean>}
   */
  remove = async (id) => {
    const existing = await this.findById(id);
    if (!existing) {
      throw new AppError('Agreement record not found', HTTP_STATUS.NOT_FOUND);
    }

    await db('agreements').where({ id }).whereNull('deleted_at').update({
      deleted_at: db.fn.now(),
      status: 'expired',
      updated_at: db.fn.now(),
    });
    return true;
  };
}

export default new AgreementService();

