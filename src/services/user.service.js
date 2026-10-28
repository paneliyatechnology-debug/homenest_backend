import moment from 'moment';
import db from '../config/db.js';
import config from '../config/index.js';
import { hashPassword, generateSecurePassword } from '../utils/password.js';
import emailService from './email.service.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';
import { deleteUserPhotoFile, deleteDocumentFile } from '../middlewares/upload.middleware.js';

/**
 * Helper to compute age from birth date
 * @param {string|Date} dob
 * @returns {number|null}
 */
const calculateAge = (dob) => {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
};

/**
 * Format user record with full profile photo URL, document URLs, and structured groups
 * matching the Resident Profile Admin UI (Personal, Room, Contact, Documents, Agreements, Stays)
 * @param {Object} user - User record from DB
 * @param {string} [base_url=''] - Base URL prefix (e.g. 'http://localhost:5000')
 * @param {Object} [options={}] - Additional joined data (agreements, stays history)
 * @returns {Object} Formatted user object
 */
const formatUser = (user, base_url = '', options = {}) => {
  if (!user) return null;

  const age = calculateAge(user.date_of_birth);
  const dob_display = user.date_of_birth
    ? (age !== null ? `${moment(user.date_of_birth).format('DD MMMM YYYY')} (${age} Years)` : moment(user.date_of_birth).format('DD MMMM YYYY'))
    : null;

  const profile_photo_url = user.profile_photo
    ? `${base_url}/uploads/users/${user.profile_photo}`
    : null;
  const aadhar_card_url = user.aadhar_card
    ? `${base_url}/uploads/documents/${user.aadhar_card}`
    : null;
  const address_proof_url = user.address_proof
    ? `${base_url}/uploads/documents/${user.address_proof}`
    : null;
  const education_certificate_url = user.education_certificate
    ? `${base_url}/uploads/documents/${user.education_certificate}`
    : null;
  const signature_url = user.signature && !user.signature.startsWith('data:')
    ? `${base_url}/uploads/documents/${user.signature}`
    : user.signature || null;
  const room_image_url = user.room_image
    ? `${base_url}/uploads/rooms/${user.room_image}`
    : null;
  const pg_logo_url = user.pg_logo
    ? `${base_url}/uploads/pgs/${user.pg_logo}`
    : null;

  return {
    ...user,
    age,
    dob_display,
    profile_photo_url,
    aadhar_card_url,
    address_proof_url,
    education_certificate_url,
    signature_url,
    room_image_url,
    pg_logo_url,

    // Structured Card Groups matching the Admin Resident Profile UI
    personal_info: {
      name: user.name || null,
      date_of_birth: user.date_of_birth || null,
      age,
      dob_display,
      gender: user.gender || null,
      nationality: user.nationality || 'Indian',
      marital_status: user.marital_status || 'single',
      occupation: user.occupation || null,
    },

    room_info: {
      room_id: user.room_id || null,
      room_no: user.room_no || null,
      room_type: user.room_type || null,
      room_capacity: user.room_capacity || null,
      room_size: user.room_size || null,
      building_id: user.building_id || null,
      building_name: user.building_name || null,
      floor_id: user.floor_id || null,
      floor_number: user.floor_number !== undefined ? user.floor_number : null,
      floor_name: user.floor_name || null,
      bed_number: user.bed_number || null,
      monthly_rent: user.monthly_rent !== undefined && user.monthly_rent !== null ? Number(user.monthly_rent) : null,
      security_deposit: user.security_deposit !== undefined && user.security_deposit !== null ? Number(user.security_deposit) : null,
      check_in_date: user.check_in_date || null,
      check_out_date: user.check_out_date || null,
      current_status: user.stay_status || user.status || 'active',
      stay_notes: user.stay_notes || null,
      room_image_url,
      pg_id: user.pg_id || null,
      pg_name: user.pg_name || user.branch_name || null,
    },

    contact_info: {
      phone: user.phone || null,
      email: user.email || null,
      emergency_contact_name: user.emergency_contact_name || null,
      emergency_contact_relationship: user.emergency_contact_relationship || null,
      emergency_contact_phone: user.emergency_contact_phone || null,
      emergency_contact_display: user.emergency_contact_name
        ? `${user.emergency_contact_name}${user.emergency_contact_relationship ? ` (${user.emergency_contact_relationship})` : ''}`
        : null,
      address_line_1: user.address_line_1 || user.address || null,
      address: user.address || user.address_line_1 || null,
      city: user.city || null,
      state: user.state || null,
      pincode: user.pincode || null,
      location_display: [user.city, user.state].filter(Boolean).join(', ') || null,
    },

    documents: {
      aadhar_card: user.aadhar_card || null,
      aadhar_card_url,
      passport_photo: user.profile_photo || null,
      profile_photo_url,
      address_proof: user.address_proof || null,
      address_proof_url,
      education_certificate: user.education_certificate || null,
      education_certificate_url,
      signature: user.signature || null,
      signature_url,
      terms_accepted: Boolean(user.terms_accepted),
      terms_accepted_at: user.terms_accepted_at || null,
    },

    agreements: options.agreements || [],
    stays: options.stays || [],
  };
};

/**
 * Service managing user entity records (Admin, Resident, Super Admin).
 */
class UserService {
  /**
   * Safe fields to select when querying users
   */
  static selectFields = [
    'users.id',
    'users.name',
    'users.email',
    'users.phone',
    'users.gender',
    'users.address',
    'users.address_line_1',
    'users.city',
    'users.state',
    'users.pincode',
    'users.emergency_contact_name',
    'users.emergency_contact_relationship',
    'users.emergency_contact_phone',
    'users.date_of_birth',
    'users.nationality',
    'users.marital_status',
    'users.occupation',
    'users.profile_photo',
    'users.aadhar_card',
    'users.address_proof',
    'users.education_certificate',
    'users.terms_accepted',
    'users.terms_accepted_at',
    'users.signature',
    'users.status',
    'users.role',
    'users.is_active',
    'users.created_at',
    'users.updated_at',
    'users.deleted_at',
  ];

  /**
   * Find user by email address
   * @param {string} email
   * @returns {Promise<Object|null>}
   */
  findByEmail = async (email) => {
    if (!email) return null;
    return await db('users')
      .where({ email: String(email).trim().toLowerCase() })
      .whereNull('deleted_at')
      .first();
  };

  /**
   * Find user by phone number
   * @param {string} phone
   * @returns {Promise<Object|null>}
   */
  findByPhone = async (phone) => {
    if (!phone) return null;
    return await db('users')
      .where({ phone: String(phone).trim() })
      .whereNull('deleted_at')
      .first();
  };

  /**
   * Find user by primary ID with active stay/room information if resident
   * @param {number|string} id
   * @param {string} [base_url='']
   * @returns {Promise<Object|null>}
   */
  findById = async (id, base_url = '') => {
    const raw_user = await db('users')
      .where('users.id', id)
      .whereNull('users.deleted_at')
      .leftJoin('resident_pg_stays', (join) => {
        join
          .on('users.id', '=', 'resident_pg_stays.resident_id')
          .andOn('resident_pg_stays.status', '=', db.raw('?', ['active']))
          .andOnNull('resident_pg_stays.deleted_at');
      })
      .leftJoin('pgs', (join) => {
        join
          .on('resident_pg_stays.pg_id', '=', 'pgs.id')
          .andOnNull('pgs.deleted_at');
      })
      .leftJoin('rooms', (join) => {
        join
          .on('resident_pg_stays.room_id', '=', 'rooms.id')
          .andOnNull('rooms.deleted_at');
      })
      .leftJoin('buildings', (join) => {
        join
          .on('rooms.building_id', '=', 'buildings.id')
          .andOnNull('buildings.deleted_at');
      })
      .leftJoin('floors', (join) => {
        join
          .on('rooms.floor_id', '=', 'floors.id')
          .andOnNull('floors.deleted_at');
      })
      .select(
        ...UserService.selectFields,
        'resident_pg_stays.id as current_stay_id',
        'resident_pg_stays.pg_id',
        'pgs.name as branch_name',
        'pgs.name as pg_name',
        'pgs.type as pg_type',
        'pgs.phone as pg_phone',
        'pgs.email as pg_email',
        'pgs.address as pg_address',
        'pgs.city as pg_city',
        'pgs.state as pg_state',
        'pgs.pincode as pg_pincode',
        'pgs.logo as pg_logo',
        'resident_pg_stays.room_id',
        'rooms.room_no',
        'rooms.room_type',
        'rooms.capacity as room_capacity',
        'rooms.size as room_size',
        'rooms.image as room_image',
        'rooms.status as room_status',
        'rooms.building_id',
        'buildings.name as building_name',
        'rooms.floor_id',
        'floors.floor_number',
        'floors.name as floor_name',
        'resident_pg_stays.bed_number',
        'resident_pg_stays.monthly_rent',
        'resident_pg_stays.security_deposit',
        'resident_pg_stays.check_in_date',
        'resident_pg_stays.check_out_date',
        'resident_pg_stays.status as stay_status',
        'resident_pg_stays.notes as stay_notes'
      )
      .first();

    if (!raw_user) return null;

    // Fetch related records: agreements and stays history
    const [agreements, stays] = await Promise.all([
      db('agreements')
        .where({ resident_id: id })
        .whereNull('deleted_at')
        .orderBy('id', 'desc'),
      db('resident_pg_stays')
        .where('resident_pg_stays.resident_id', id)
        .whereNull('resident_pg_stays.deleted_at')
        .leftJoin('pgs', (join) => {
          join.on('resident_pg_stays.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
        })
        .leftJoin('rooms', (join) => {
          join.on('resident_pg_stays.room_id', '=', 'rooms.id').andOnNull('rooms.deleted_at');
        })
        .leftJoin('buildings', (join) => {
          join.on('rooms.building_id', '=', 'buildings.id').andOnNull('buildings.deleted_at');
        })
        .leftJoin('floors', (join) => {
          join.on('rooms.floor_id', '=', 'floors.id').andOnNull('floors.deleted_at');
        })
        .select(
          'resident_pg_stays.*',
          'pgs.name as pg_name',
          'rooms.room_no',
          'rooms.room_type',
          'buildings.name as building_name',
          'floors.floor_number'
        )
        .orderBy('resident_pg_stays.id', 'desc'),
    ]);

    return formatUser(raw_user, base_url, { agreements, stays });
  };

  /**
   * Create a new user record (Resident, Admin, Super Admin).
   * If role is resident and room assignment is provided, atomically assigns room.
   * @param {Object} user_data
   * @param {string} [base_url='']
   * @returns {Promise<Object>} Created user record
   */
  create = async (user_data, base_url = '') => {
    const {
      name,
      email,
      phone,
      gender,
      address,
      role = ROLES.RESIDENT,
      password = null,
      date_of_birth = null,
      nationality = 'Indian',
      marital_status = 'single',
      occupation = null,
      profile_photo = null,
      status = 'active',
      // Optional room allocation fields for resident onboarding
      pg_id = null,
      room_id = null,
      room_no = null,
      bed_number = 'Bed-1',
      monthly_rent = 0.0,
      security_deposit = 0.0,
      check_in_date = null,
      check_out_date = null,
    } = user_data;

    // Check duplicate email
    const existing_email = await this.findByEmail(email);
    if (existing_email) {
      throw new AppError('Email address is already registered', HTTP_STATUS.CONFLICT);
    }

    // Check duplicate phone
    if (phone) {
      const existing_phone = await this.findByPhone(phone);
      if (existing_phone) {
        throw new AppError('Phone number is already registered with another account', HTTP_STATUS.CONFLICT);
      }
    }

    // Generate random secure password if not explicitly supplied
    const plain_password = (password && String(password).trim().length > 0)
      ? String(password).trim()
      : generateSecurePassword(10);

    const hashed_password = await hashPassword(plain_password);
    const effective_check_in = check_in_date || new Date().toISOString().split('T')[0];

    let allocatedPgName = null;
    let allocatedRoomNo = null;
    let allocatedBedNumber = null;

    const inserted_id = await db.transaction(async (trx) => {
      const [user_id] = await trx('users').insert({
        name: name.trim(),
        email: String(email).trim().toLowerCase(),
        password: hashed_password,
        phone: phone ? String(phone).trim() : null,
        gender: gender ? String(gender).toLowerCase() : null,
        address: address || null,
        role: role || ROLES.RESIDENT,
        date_of_birth: date_of_birth || null,
        nationality: nationality || 'Indian',
        marital_status: marital_status ? String(marital_status).toLowerCase() : 'single',
        occupation: occupation || null,
        profile_photo: profile_photo || null,
        status: status || 'active',
        is_active: status !== 'inactive',
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

      // If user is resident and room is specified, allocate room stay
      if (role === ROLES.RESIDENT && (room_id || (room_no && pg_id))) {
        let target_room = null;
        if (room_id) {
          target_room = await trx('rooms').where({ id: room_id }).whereNull('deleted_at').first();
        } else if (room_no && pg_id) {
          target_room = await trx('rooms').where({ pg_id, room_no }).whereNull('deleted_at').first();
        }

        if (target_room) {
          allocatedRoomNo = target_room.room_no;
          allocatedBedNumber = bed_number || 'Bed-1';

          const targetPg = await trx('pgs').where({ id: target_room.pg_id }).first();
          if (targetPg) {
            allocatedPgName = targetPg.name;
          }

          await trx('resident_pg_stays').insert({
            resident_id: user_id,
            pg_id: target_room.pg_id,
            room_id: target_room.id,
            bed_number: bed_number || 'Bed-1',
            monthly_rent: parseFloat(monthly_rent) || 0.0,
            security_deposit: parseFloat(security_deposit) || 0.0,
            check_in_date: effective_check_in,
            check_out_date: check_out_date || null,
            status: status === 'active' ? 'active' : 'completed',
            notes: 'Created via User Management onboarding',
            created_at: db.fn.now(),
            updated_at: db.fn.now(),
          });

          if (status === 'active') {
            await trx('rooms').where({ id: target_room.id }).update({
              status: 'occupied',
              updated_at: db.fn.now(),
            });
          }
        }
      }

      if (!allocatedPgName && pg_id) {
        const directPg = await trx('pgs').where({ id: pg_id }).first();
        if (directPg) {
          allocatedPgName = directPg.name;
        }
      }

      return user_id;
    });

    // Send professional welcome credentials email asynchronously (safe error boundary)
    try {
      await emailService.sendWelcomeCredentialsEmail({
        email: String(email).trim().toLowerCase(),
        name: name.trim(),
        password: plain_password,
        role: role || ROLES.RESIDENT,
        pgName: allocatedPgName,
        roomNo: allocatedRoomNo,
        bedNumber: allocatedBedNumber,
        loginUrl: `${config.frontendUrl}/login`,
      });
    } catch (emailError) {
      console.error('[User Service] Welcome credentials email delivery failed:', emailError.message);
    }

    return await this.findById(inserted_id, base_url);
  };

  /**
   * Get paginated list of users filtered by role, status, pg_id, and search
   * @param {Object} options
   * @returns {Promise<{ users: Array, pagination: Object }>}
   */
  findAll = async ({
    role = '',
    status = '',
    pg_id = null,
    owner_id = null,
    search = '',
    page = 1,
    limit = 10,
    base_url = '',
  }) => {
    const current_page = Math.max(1, parseInt(page, 10) || 1);
    const per_page = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (current_page - 1) * per_page;

    let query = db('users')
      .whereNull('users.deleted_at')
      .leftJoin('resident_pg_stays', (join) => {
        join
          .on('users.id', '=', 'resident_pg_stays.resident_id')
          .andOn('resident_pg_stays.status', '=', db.raw('?', ['active']))
          .andOnNull('resident_pg_stays.deleted_at');
      })
      .leftJoin('pgs', (join) => {
        join
          .on('resident_pg_stays.pg_id', '=', 'pgs.id')
          .andOnNull('pgs.deleted_at');
      })
      .leftJoin('rooms', (join) => {
        join
          .on('resident_pg_stays.room_id', '=', 'rooms.id')
          .andOnNull('rooms.deleted_at');
      })
      .leftJoin('buildings', (join) => {
        join
          .on('rooms.building_id', '=', 'buildings.id')
          .andOnNull('buildings.deleted_at');
      })
      .leftJoin('floors', (join) => {
        join
          .on('rooms.floor_id', '=', 'floors.id')
          .andOnNull('floors.deleted_at');
      })
      .select(
        ...UserService.selectFields,
        'resident_pg_stays.id as current_stay_id',
        'resident_pg_stays.pg_id',
        'pgs.name as branch_name',
        'pgs.name as pg_name',
        'resident_pg_stays.room_id',
        'rooms.room_no',
        'rooms.room_type',
        'rooms.building_id',
        'buildings.name as building_name',
        'rooms.floor_id',
        'floors.floor_number',
        'floors.name as floor_name',
        'resident_pg_stays.bed_number',
        'resident_pg_stays.monthly_rent',
        'resident_pg_stays.security_deposit',
        'resident_pg_stays.check_in_date',
        'resident_pg_stays.check_out_date'
      );

    let count_query = db('users')
      .whereNull('users.deleted_at')
      .leftJoin('resident_pg_stays', (join) => {
        join
          .on('users.id', '=', 'resident_pg_stays.resident_id')
          .andOn('resident_pg_stays.status', '=', db.raw('?', ['active']))
          .andOnNull('resident_pg_stays.deleted_at');
      })
      .leftJoin('pgs', (join) => {
        join
          .on('resident_pg_stays.pg_id', '=', 'pgs.id')
          .andOnNull('pgs.deleted_at');
      })
      .leftJoin('rooms', (join) => {
        join
          .on('resident_pg_stays.room_id', '=', 'rooms.id')
          .andOnNull('rooms.deleted_at');
      })
      .countDistinct('users.id as total');

    const apply_filters = (builder) => {
      if (role) {
        builder.where('users.role', role);
      }
      if (status) {
        builder.where('users.status', status);
      }
      if (pg_id) {
        builder.where('resident_pg_stays.pg_id', pg_id);
      }
      if (owner_id) {
        builder.where((owner_qb) => {
          owner_qb.where('pgs.owner_id', owner_id).orWhereNull('pgs.owner_id');
        });
      }
      if (search) {
        const search_pattern = `%${search}%`;
        builder.where((search_builder) => {
          search_builder
            .where('users.name', 'like', search_pattern)
            .orWhere('users.email', 'like', search_pattern)
            .orWhere('users.phone', 'like', search_pattern)
            .orWhere('rooms.room_no', 'like', search_pattern);
        });
      }
    };

    apply_filters(query);
    apply_filters(count_query);

    const [raw_users, [count_row]] = await Promise.all([
      query.orderBy('users.id', 'desc').limit(per_page).offset(offset),
      count_query,
    ]);

    const total = count_row ? parseInt(count_row.total, 10) : 0;
    const users = raw_users.map((u) => formatUser(u, base_url));

    return {
      users,
      pagination: {
        total,
        page: current_page,
        limit: per_page,
        total_pages: Math.ceil(total / per_page) || 1,
      },
    };
  };

  /**
   * Update user profile fields and optional profile photo
   * @param {number|string} id
   * @param {Object} update_data
   * @param {string} [base_url='']
   * @returns {Promise<Object>} Updated user
   */
  update = async (id, update_data, base_url = '') => {
    const existing = await this.findById(id);
    if (!existing) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    // Check duplicate email
    if (update_data.email && update_data.email.toLowerCase().trim() !== existing.email) {
      const duplicate_email = await db('users')
        .where({ email: update_data.email.toLowerCase().trim() })
        .whereNull('deleted_at')
        .whereNot({ id })
        .first();
      if (duplicate_email) {
        throw new AppError('Email address is already in use by another account', HTTP_STATUS.CONFLICT);
      }
    }

    // Check duplicate phone
    if (update_data.phone && update_data.phone.trim() !== existing.phone) {
      const duplicate_phone = await db('users')
        .where({ phone: update_data.phone.trim() })
        .whereNull('deleted_at')
        .whereNot({ id })
        .first();
      if (duplicate_phone) {
        throw new AppError('Phone number is already in use by another account', HTTP_STATUS.CONFLICT);
      }
    }

    // If new profile photo provided, remove previous photo from disk
    if (update_data.profile_photo && existing.profile_photo && update_data.profile_photo !== existing.profile_photo) {
      deleteUserPhotoFile(existing.profile_photo);
    }
    if (update_data.aadhar_card && existing.aadhar_card && update_data.aadhar_card !== existing.aadhar_card) {
      deleteDocumentFile(existing.aadhar_card);
    }
    if (update_data.address_proof && existing.address_proof && update_data.address_proof !== existing.address_proof) {
      deleteDocumentFile(existing.address_proof);
    }
    if (update_data.education_certificate && existing.education_certificate && update_data.education_certificate !== existing.education_certificate) {
      deleteDocumentFile(existing.education_certificate);
    }

    const allowed_updates = {
      ...(update_data.name !== undefined && { name: update_data.name.trim() }),
      ...(update_data.email !== undefined && { email: update_data.email.toLowerCase().trim() }),
      ...(update_data.phone !== undefined && { phone: update_data.phone.trim() }),
      ...(update_data.gender !== undefined && { gender: String(update_data.gender).toLowerCase() }),
      ...(update_data.address !== undefined && { address: update_data.address }),
      ...(update_data.address_line_1 !== undefined && {
        address_line_1: update_data.address_line_1,
        address: update_data.address || update_data.address_line_1,
      }),
      ...(update_data.city !== undefined && { city: update_data.city ? update_data.city.trim() : null }),
      ...(update_data.state !== undefined && { state: update_data.state ? update_data.state.trim() : null }),
      ...(update_data.pincode !== undefined && { pincode: update_data.pincode ? update_data.pincode.trim() : null }),
      ...(update_data.emergency_contact_name !== undefined && {
        emergency_contact_name: update_data.emergency_contact_name ? update_data.emergency_contact_name.trim() : null,
      }),
      ...(update_data.emergency_contact_relationship !== undefined && {
        emergency_contact_relationship: update_data.emergency_contact_relationship
          ? update_data.emergency_contact_relationship.trim()
          : null,
      }),
      ...(update_data.emergency_contact_phone !== undefined && {
        emergency_contact_phone: update_data.emergency_contact_phone ? update_data.emergency_contact_phone.trim() : null,
      }),
      ...(update_data.date_of_birth !== undefined && { date_of_birth: update_data.date_of_birth || null }),
      ...(update_data.nationality !== undefined && { nationality: update_data.nationality || 'Indian' }),
      ...(update_data.marital_status !== undefined && { marital_status: update_data.marital_status || 'single' }),
      ...(update_data.occupation !== undefined && { occupation: update_data.occupation || null }),
      ...(update_data.profile_photo !== undefined && { profile_photo: update_data.profile_photo }),
      ...(update_data.aadhar_card !== undefined && { aadhar_card: update_data.aadhar_card }),
      ...(update_data.address_proof !== undefined && { address_proof: update_data.address_proof }),
      ...(update_data.education_certificate !== undefined && { education_certificate: update_data.education_certificate }),
      ...(update_data.terms_accepted !== undefined && {
        terms_accepted: Boolean(
          update_data.terms_accepted === true ||
          update_data.terms_accepted === 'true' ||
          update_data.terms_accepted === 1 ||
          update_data.terms_accepted === '1'
        ),
        terms_accepted_at: (
          update_data.terms_accepted === true ||
          update_data.terms_accepted === 'true' ||
          update_data.terms_accepted === 1 ||
          update_data.terms_accepted === '1'
        ) ? db.fn.now() : null,
      }),
      ...(update_data.signature !== undefined && { signature: update_data.signature }),
      ...(update_data.status !== undefined && {
        status: update_data.status,
        is_active: update_data.status !== 'inactive',
      }),
      ...(update_data.role !== undefined && { role: update_data.role }),
      updated_at: db.fn.now(),
    };

    await db('users').where({ id }).whereNull('deleted_at').update(allowed_updates);

    // If stay/room allocation updates are provided (e.g. admin updating resident)
    if (
      update_data.room_id !== undefined ||
      update_data.bed_number !== undefined ||
      update_data.monthly_rent !== undefined ||
      update_data.security_deposit !== undefined ||
      update_data.check_in_date !== undefined ||
      update_data.check_out_date !== undefined
    ) {
      const active_stay = await db('resident_pg_stays')
        .where({ resident_id: id, status: 'active' })
        .whereNull('deleted_at')
        .first();

      if (active_stay) {
        const stay_updates = {
          ...(update_data.room_id !== undefined && { room_id: update_data.room_id }),
          ...(update_data.bed_number !== undefined && { bed_number: update_data.bed_number }),
          ...(update_data.monthly_rent !== undefined && { monthly_rent: parseFloat(update_data.monthly_rent) || 0.0 }),
          ...(update_data.security_deposit !== undefined && { security_deposit: parseFloat(update_data.security_deposit) || 0.0 }),
          ...(update_data.check_in_date !== undefined && { check_in_date: update_data.check_in_date }),
          ...(update_data.check_out_date !== undefined && { check_out_date: update_data.check_out_date || null }),
          updated_at: db.fn.now(),
        };

        if (update_data.room_id && update_data.room_id !== active_stay.room_id) {
          // Free previous room if no other active residents
          const other_in_old = await db('resident_pg_stays')
            .where({ room_id: active_stay.room_id, status: 'active' })
            .whereNull('deleted_at')
            .whereNot({ id: active_stay.id })
            .first();
          if (!other_in_old) {
            await db('rooms').where({ id: active_stay.room_id }).update({ status: 'vacant', updated_at: db.fn.now() });
          }
          await db('rooms').where({ id: update_data.room_id }).update({ status: 'occupied', updated_at: db.fn.now() });
        }

        await db('resident_pg_stays').where({ id: active_stay.id }).update(stay_updates);
      } else if (update_data.room_id) {
        const target_room = await db('rooms').where({ id: update_data.room_id }).whereNull('deleted_at').first();
        if (target_room) {
          await db('resident_pg_stays').insert({
            resident_id: id,
            pg_id: target_room.pg_id,
            room_id: target_room.id,
            bed_number: update_data.bed_number || 'Bed-1',
            monthly_rent: parseFloat(update_data.monthly_rent) || 0.0,
            security_deposit: parseFloat(update_data.security_deposit) || 0.0,
            check_in_date: update_data.check_in_date || new Date().toISOString().split('T')[0],
            check_out_date: update_data.check_out_date || null,
            status: 'active',
            notes: 'Allocated via Admin User Update',
            created_at: db.fn.now(),
            updated_at: db.fn.now(),
          });
          await db('rooms').where({ id: target_room.id }).update({ status: 'occupied', updated_at: db.fn.now() });
        }
      }
    }

    return await this.findById(id, base_url);
  };

  /**
   * Delete user by ID and release any room stays (Soft Delete)
   * @param {number|string} id
   * @returns {Promise<boolean>}
   */
  remove = async (id) => {
    const user = await this.findById(id);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    // Remove profile photo from disk
    if (user.profile_photo) {
      deleteUserPhotoFile(user.profile_photo);
    }

    // If resident has an active stay in a room, set that room back to vacant
    if (user.room_id) {
      const remaining = await db('resident_pg_stays')
        .where({ room_id: user.room_id, status: 'active' })
        .whereNull('deleted_at')
        .whereNot({ resident_id: id })
        .first();

      if (!remaining) {
        await db('rooms').where({ id: user.room_id }).update({
          status: 'vacant',
          updated_at: db.fn.now(),
        });
      }
    }

    // Soft delete associated active stays and agreements
    await db('resident_pg_stays')
      .where({ resident_id: id })
      .whereNull('deleted_at')
      .update({
        status: 'completed',
        deleted_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

    await db('agreements')
      .where({ resident_id: id })
      .whereNull('deleted_at')
      .update({
        status: 'expired',
        deleted_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

    // Soft delete the user record
    await db('users')
      .where({ id })
      .update({
        deleted_at: db.fn.now(),
        is_active: false,
        updated_at: db.fn.now(),
      });

    return true;
  };

  /**
   * Update user password
   * @param {number|string} id
   * @param {string} hashed_password
   * @returns {Promise<boolean>}
   */
  updatePassword = async (id, hashed_password) => {
    const rows_affected = await db('users')
      .where({ id })
      .whereNull('deleted_at')
      .update({
        password: hashed_password,
        updated_at: db.fn.now(),
      });

    return rows_affected > 0;
  };
}

export default new UserService();
