import db from '../config/db.js';

/**
 * Service managing Paying Guest (PG) facilities
 * Handles PG creation, updates, deletions, and resident listings.
 */
class PgService {
  /**
   * Safe columns to select for PG entities
   */
  static selectFields = [
    'id',
    'owner_id',
    'name',
    'type',
    'phone',
    'email',
    'address',
    'city',
    'state',
    'pincode',
    'total_rooms',
    'total_beds',
    'amenities',
    'rules',
    'status',
    'logo',
    'created_at',
    'updated_at',
    'deleted_at',
  ];

  /**
   * Create a new PG for an owner (admin)
   * @param {number|string} owner_id - User ID of the owner
   * @param {object} pg_data - Details of the PG facility
   * @param {object} [trx=null] - Optional Knex transaction instance
   * @returns {Promise<object>} Created PG object
   */
  create = async (owner_id, pg_data, trx = null) => {
    const query = trx ? db('pgs').transacting(trx) : db('pgs');

    const [pg_id] = await query.insert({
      owner_id,
      name: pg_data.name,
      type: pg_data.type || 'coed',
      phone: pg_data.phone,
      email: pg_data.email || null,
      address: pg_data.address,
      city: pg_data.city,
      state: pg_data.state,
      pincode: pg_data.pincode,
      total_rooms: pg_data.total_rooms || 0,
      total_beds: pg_data.total_beds || 0,
      amenities: Array.isArray(pg_data.amenities)
        ? JSON.stringify(pg_data.amenities)
        : pg_data.amenities || null,
      rules: pg_data.rules || null,
      status: pg_data.status || 'active',
      logo: pg_data.logo || null,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    return await this.findById(pg_id, trx);
  };

  /**
   * Find PG by ID with owner information and active resident count
   * @param {number|string} id - PG ID
   * @param {object} [trx=null] - Optional Knex transaction instance
   * @param {string} [base_url=''] - Base URL prefix for static files
   * @returns {Promise<object|null>}
   */
  findById = async (id, trx = null, base_url = '') => {
    const query = trx ? db('pgs').transacting(trx) : db('pgs');

    const pg = await query
      .where('pgs.id', id)
      .whereNull('pgs.deleted_at')
      .leftJoin('users', (join) => {
        join.on('pgs.owner_id', '=', 'users.id').andOnNull('users.deleted_at');
      })
      .select(
        'pgs.*',
        'users.name as owner_name',
        'users.email as owner_email',
        'users.phone as owner_phone',
        'users.profile_photo as owner_profile_photo'
      )
      .first();

    if (!pg) return null;

    // Parse amenities JSON if stored as string
    if (typeof pg.amenities === 'string') {
      try {
        pg.amenities = JSON.parse(pg.amenities);
      } catch {
        // Keep string if not valid JSON
      }
    }

    // Get current active resident count
    const active_stay_query = trx ? db('resident_pg_stays').transacting(trx) : db('resident_pg_stays');
    const [{ active_residents }] = await active_stay_query
      .where({ pg_id: id, status: 'active' })
      .whereNull('deleted_at')
      .count('id as active_residents');

    pg.active_residents_count = Number(active_residents);
    pg.logo_url = pg.logo ? `${base_url}/uploads/pgs/${pg.logo}` : null;
    pg.owner_profile_photo_url = pg.owner_profile_photo
      ? `${base_url}/uploads/users/${pg.owner_profile_photo}`
      : null;
    return pg;
  };

  /**
   * Find all PGs with pagination and filters
   * @param {object} options
   * @returns {Promise<{ pgs: Array, pagination: object }>}
   */
  findAll = async ({ owner_id = null, city = '', type = '', status = '', search = '', page = 1, limit = 10, base_url = '' }) => {
    const offset = (page - 1) * limit;

    let query = db('pgs')
      .whereNull('pgs.deleted_at')
      .leftJoin('users', (join) => {
        join.on('pgs.owner_id', '=', 'users.id').andOnNull('users.deleted_at');
      })
      .select(
        'pgs.*',
        'users.name as owner_name',
        'users.email as owner_email',
        'users.phone as owner_phone',
        'users.profile_photo as owner_profile_photo'
      );

    let count_query = db('pgs').whereNull('pgs.deleted_at').count('pgs.id as total');

    if (owner_id) {
      query = query.where('pgs.owner_id', owner_id);
      count_query = count_query.where('pgs.owner_id', owner_id);
    }

    if (city) {
      query = query.where('pgs.city', 'like', `%${city}%`);
      count_query = count_query.where('pgs.city', 'like', `%${city}%`);
    }

    if (type) {
      query = query.where('pgs.type', type);
      count_query = count_query.where('pgs.type', type);
    }

    if (status) {
      query = query.where('pgs.status', status);
      count_query = count_query.where('pgs.status', status);
    }

    if (search) {
      const search_pattern = `%${search}%`;
      const search_filter = (builder) => {
        builder
          .where('pgs.name', 'like', search_pattern)
          .orWhere('pgs.address', 'like', search_pattern)
          .orWhere('pgs.city', 'like', search_pattern);
      };
      query = query.where(search_filter);
      count_query = count_query.where(search_filter);
    }

    const [pgs, [{ total }]] = await Promise.all([
      query.orderBy('pgs.id', 'desc').limit(limit).offset(offset),
      count_query,
    ]);

    pgs.forEach((pg) => {
      if (typeof pg.amenities === 'string') {
        try {
          pg.amenities = JSON.parse(pg.amenities);
        } catch {
          // Keep string
        }
      }
      pg.logo_url = pg.logo ? `${base_url}/uploads/pgs/${pg.logo}` : null;
      pg.owner_profile_photo_url = pg.owner_profile_photo
        ? `${base_url}/uploads/users/${pg.owner_profile_photo}`
        : null;
    });

    const total_records = Number(total);
    const total_pages = Math.ceil(total_records / limit);

    return {
      pgs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total_records,
        total_pages,
        has_next: page < total_pages,
        has_prev: page > 1,
      },
    };
  };

  /**
   * Get all residents who stayed or are currently staying in a PG
   * @param {number|string} pg_id - PG ID
   * @param {object} options
   * @returns {Promise<{ residents: Array, pagination: object }>}
   */
  getPgResidents = async (pg_id, { status = '', page = 1, limit = 10 }) => {
    const offset = (page - 1) * limit;

    let query = db('resident_pg_stays')
      .where('resident_pg_stays.pg_id', pg_id)
      .whereNull('resident_pg_stays.deleted_at')
      .join('users', (join) => {
        join.on('resident_pg_stays.resident_id', '=', 'users.id').andOnNull('users.deleted_at');
      })
      .join('rooms', (join) => {
        join.on('resident_pg_stays.room_id', '=', 'rooms.id').andOnNull('rooms.deleted_at');
      })
      .select(
        'resident_pg_stays.id as stay_id',
        'resident_pg_stays.pg_id',
        'resident_pg_stays.room_id',
        'rooms.room_no as room_number',
        'rooms.room_type',
        'resident_pg_stays.bed_number',
        'resident_pg_stays.monthly_rent',
        'resident_pg_stays.security_deposit',
        'resident_pg_stays.check_in_date',
        'resident_pg_stays.check_out_date',
        'resident_pg_stays.status as stay_status',
        'resident_pg_stays.notes',
        'resident_pg_stays.created_at as stay_created_at',
        'resident_pg_stays.deleted_at as stay_deleted_at',
        'users.id as resident_id',
        'users.name as resident_name',
        'users.email as resident_email',
        'users.phone as resident_phone',
        'users.gender as resident_gender'
      );

    let count_query = db('resident_pg_stays')
      .where('resident_pg_stays.pg_id', pg_id)
      .whereNull('resident_pg_stays.deleted_at')
      .count('resident_pg_stays.id as total');

    if (status) {
      query = query.where('resident_pg_stays.status', status);
      count_query = count_query.where('resident_pg_stays.status', status);
    }

    const [stays, [{ total }]] = await Promise.all([
      query.orderBy('resident_pg_stays.id', 'desc').limit(limit).offset(offset),
      count_query,
    ]);

    const total_records = Number(total);
    const total_pages = Math.ceil(total_records / limit);

    return {
      residents: stays,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total_records,
        total_pages,
        has_next: page < total_pages,
        has_prev: page > 1,
      },
    };
  };
}

export default new PgService();
