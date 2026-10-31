import moment from 'moment';
import db from '../config/db.js';
import config from '../config/index.js';
import { hashPassword, generateSecurePassword } from '../utils/password.js';
import emailService from './email.service.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';
import { deleteUserPhotoFile, deleteDocumentFile } from '../middlewares/upload.middleware.js';
import { buildFileUrl } from '../utils/url.js';
import { syncBranchStats } from './branch.service.js';

/**
 * Helper to safely parse JSON strings
 * @param {string|any} val
 * @param {any} [fallback=[]]
 * @returns {any}
 */
const safeJsonParse = (val, fallback = []) => {
  if (!val) return fallback;
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};

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
 * Format admin user profile cleanly without resident-only fields or duplicated groups
 * @param {Object} user - User record from DB
 * @param {Object} [options={}] - PG facility data
 * @returns {Object} Formatted admin profile
 */
const formatAdminUser = (user, options = {}) => {
  if (!user) return null;

  const age = calculateAge(user.date_of_birth);
  const dob_display = user.date_of_birth
    ? (age !== null ? `${moment(user.date_of_birth).format('DD MMMM YYYY')} (${age} Years)` : moment(user.date_of_birth).format('DD MMMM YYYY'))
    : null;

  const profile_photo_url = buildFileUrl('users', user.profile_photo);
  const pg = options.pg || null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    gender: user.gender || null,
    address: user.address || user.address_line_1 || null,
    city: user.city || null,
    state: user.state || null,
    pincode: user.pincode || null,
    date_of_birth: user.date_of_birth || null,
    age,
    dob_display,
    nationality: user.nationality || 'Indian',
    marital_status: user.marital_status || 'single',
    occupation: user.occupation || null,
    profile_photo: user.profile_photo || null,
    profile_photo_url,
    status: user.status || 'active',
    role: user.role,
    is_active: user.is_active !== undefined ? user.is_active : 1,
    created_at: user.created_at,
    updated_at: user.updated_at,

    // Clean Structured PG Facility Object
    pg: pg
      ? {
          id: pg.id,
          name: pg.name,
          type: pg.type,
          phone: pg.phone,
          email: pg.email,
          address: pg.address,
          city: pg.city,
          state: pg.state,
          pincode: pg.pincode,
          total_rooms: pg.total_rooms !== undefined ? Number(pg.total_rooms) : 0,
          total_beds: pg.total_beds !== undefined ? Number(pg.total_beds) : 0,
          amenities: typeof pg.amenities === 'string' ? safeJsonParse(pg.amenities, []) : (pg.amenities || []),
          rules: pg.rules || null,
          status: pg.status || 'active',
          logo: pg.logo || null,
          logo_url: buildFileUrl('pgs', pg.logo),
          pg_upi_id: pg.pg_upi_id || null,
          pg_bank_name: pg.pg_bank_name || null,
          pg_account_number: pg.pg_account_number || null,
          pg_ifsc_code: pg.pg_ifsc_code || null,
          pg_account_holder_name: pg.pg_account_holder_name || null,
          bank_details: {
            pg_upi_id: pg.pg_upi_id || null,
            pg_bank_name: pg.pg_bank_name || null,
            pg_account_number: pg.pg_account_number || null,
            pg_ifsc_code: pg.pg_ifsc_code || null,
            pg_account_holder_name: pg.pg_account_holder_name || null,
          },
          active_residents_count: pg.active_residents_count !== undefined ? Number(pg.active_residents_count) : 0,
        }
      : null,
  };
};

/**
 * Format resident user record into structured domain sections
 * Eliminates root-level duplication of room, stay, document, pg, and address columns.
 * @param {Object} user - User record from DB
 * @param {Object} [options={}] - Additional joined data (active_stay, agreements)
 * @returns {Object} Formatted resident user object
 */
const formatResidentUser = (user, options = {}) => {
  if (!user) return null;

  const age = calculateAge(user.date_of_birth);
  const dob_display = user.date_of_birth
    ? (age !== null ? `${moment(user.date_of_birth).format('DD MMMM YYYY')} (${age} Years)` : moment(user.date_of_birth).format('DD MMMM YYYY'))
    : null;

  const profile_photo_url = buildFileUrl('users', user.profile_photo);
  const aadhar_card_url = buildFileUrl('documents', user.aadhar_card);
  const address_proof_url = buildFileUrl('documents', user.address_proof);
  const education_certificate_url = buildFileUrl('documents', user.education_certificate);
  const signature_url = user.signature && !user.signature.startsWith('data:')
    ? buildFileUrl('documents', user.signature)
    : user.signature || null;

  const stay = options.active_stay || (user.room_id ? user : null);
  const room_image_url = stay ? buildFileUrl('rooms', stay.room_image) : null;

  return {
    id: user.id,
    name: user.name || null,
    email: user.email || null,
    phone: user.phone || null,
    gender: user.gender || null,
    profile_photo: user.profile_photo || null,
    profile_photo_url,
    status: user.status || 'active',
    role: user.role || ROLES.RESIDENT,
    is_active: user.is_active !== undefined ? user.is_active : 1,
    created_at: user.created_at || null,
    updated_at: user.updated_at || null,
    deleted_at: user.deleted_at || null,

    // Personal details section
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

    // Contact & Emergency contact details section
    contact_info: {
      phone: user.phone || null,
      email: user.email || null,
      address: user.address || user.address_line_1 || null,
      address_line_1: user.address_line_1 || user.address || null,
      city: user.city || null,
      state: user.state || null,
      pincode: user.pincode || null,
      location_display: [user.city, user.state].filter(Boolean).join(', ') || null,
      emergency_contact_name: user.emergency_contact_name || null,
      emergency_contact_relationship: user.emergency_contact_relationship || null,
      emergency_contact_phone: user.emergency_contact_phone || null,
      emergency_contact_display: user.emergency_contact_name
        ? `${user.emergency_contact_name}${user.emergency_contact_relationship ? ` (${user.emergency_contact_relationship})` : ''}`
        : null,
    },

    // Current room & stay allocation section
    room_info: stay
      ? {
          room_id: stay.room_id || null,
          room_no: stay.room_no || null,
          room_type: stay.room_type || null,
          room_capacity: stay.room_capacity || null,
          room_size: stay.room_size || null,
          room_status: stay.room_status || null,
          room_image_url,
          building_id: stay.building_id || null,
          building_name: stay.building_name || null,
          floor_id: stay.floor_id || null,
          floor_number: stay.floor_number !== undefined && stay.floor_number !== null ? Number(stay.floor_number) : null,
          floor_name: stay.floor_name || null,
          bed_number: stay.bed_number || null,
          monthly_rent: stay.monthly_rent !== undefined && stay.monthly_rent !== null ? Number(stay.monthly_rent) : null,
          security_deposit: stay.security_deposit !== undefined && stay.security_deposit !== null ? Number(stay.security_deposit) : null,
          check_in_date: stay.check_in_date || null,
          check_out_date: stay.check_out_date || null,
          current_status: stay.stay_status || stay.status || 'active',
          stay_notes: stay.stay_notes || stay.notes || null,
          pg_id: stay.pg_id || null,
          pg_name: stay.pg_name || null,
          branch_id: stay.branch_id || null,
          branch_name: stay.branch_name || stay.pg_name || null,
        }
      : {
          room_id: null,
          room_no: null,
          room_type: null,
          room_capacity: null,
          room_size: null,
          room_status: null,
          room_image_url: null,
          building_id: null,
          building_name: null,
          floor_id: null,
          floor_number: null,
          floor_name: null,
          bed_number: null,
          monthly_rent: null,
          security_deposit: null,
          check_in_date: null,
          check_out_date: null,
          current_status: 'active',
          stay_notes: null,
          pg_id: null,
          pg_name: null,
          branch_id: null,
          branch_name: null,
        },

    // Uploaded documents & signature section
    documents: {
      aadhar_card: user.aadhar_card || null,
      aadhar_card_url,
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
    due_amount: options.pending_payment ? Number(options.pending_payment.amount) : 0,
    payment_info: options.pending_payment ? {
      payment_id: options.pending_payment.id,
      title: options.pending_payment.title,
      due_amount: Number(options.pending_payment.amount) || 0,
      paid_amount: Number(options.pending_payment.paid_amount) || 0,
      status: options.pending_payment.status,
      due_date: options.pending_payment.due_date || null,
      billing_period: {
        start: options.pending_payment.billing_period_start || null,
        end: options.pending_payment.billing_period_end || null,
      },
      breakdown: {
        rent: Number(options.pending_payment.rent_amount) || 0,
        deposit: Number(options.pending_payment.deposit_amount) || 0,
        security_deposit: Number(options.pending_payment.deposit_amount) || 0,
        maintenance: Number(options.pending_payment.maintenance_amount) || 0,
        electricity: Number(options.pending_payment.electricity_amount) || 0,
        other: Number(options.pending_payment.other_amount) || 0,
        total: Number(options.pending_payment.amount) || 0,
      },
    } : null,
  };
};

const formatUserListItem = (user) => {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name || null,
    email: user.email || null,
    phone: user.phone || null,
    gender: user.gender || null,
    status: user.status || 'active',
    profile_photo_url: buildFileUrl('users', user.profile_photo),
    room_no: user.room_no || null,
    building_name: user.building_name || null,
    floor_name: user.floor_name || null,
    room_id: user.room_id ? Number(user.room_id) : null,
    floor_id: user.floor_id ? Number(user.floor_id) : null,
    floor_number: user.floor_number !== undefined && user.floor_number !== null ? Number(user.floor_number) : null,
    bed_number: user.bed_number || null,
    created_at: user.created_at || null,
    updated_at: user.updated_at || null,
    deleted_at: user.deleted_at || null,
    role: user.role || ROLES.RESIDENT,
    building_id: user.building_id ? Number(user.building_id) : null,
  };
};


class UserService {
  /**
   * Safe fields to select when querying users
   */
  /**
   * Fields to select for paginated users list (/api/v1/users)
   */
  static listSelectFields = [
    'users.id',
    'users.name',
    'users.email',
    'users.phone',
    'users.gender',
    'users.status',
    'users.role',
    'users.profile_photo',
    'users.created_at',
    'users.updated_at',
    'users.deleted_at',
    'resident_pg_stays.branch_id',
    'resident_pg_stays.room_id',
    'rooms.room_no',
    'rooms.building_id',
    'buildings.name as building_name',
    'rooms.floor_id',
    'floors.floor_number',
    'floors.name as floor_name',
    'resident_pg_stays.bed_number',
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
     * @returns {Promise<Object|null>}
   */
  findById = async (id, requested_pg_id = null) => {
    const raw_user = await db('users')
      .where('users.id', id)
      .whereNull('users.deleted_at')
      .first();

    if (!raw_user) return null;

    if (raw_user.role === ROLES.ADMIN || raw_user.role === ROLES.SUPER_ADMIN) {
      const owned_pgs = await db('pgs')
        .where('pgs.owner_id', id)
        .whereNull('pgs.deleted_at')
        .orderBy('pgs.id', 'asc');

      let primary_pg = null;
      if (requested_pg_id) {
        primary_pg = owned_pgs.find((p) => p.id === Number(requested_pg_id)) || owned_pgs[0] || null;
      } else {
        primary_pg = owned_pgs[0] || null;
      }

      if (primary_pg) {
        const [{ active_residents }] = await db('resident_pg_stays')
          .where({ pg_id: primary_pg.id, status: 'active' })
          .whereNull('deleted_at')
          .count('id as active_residents');
        primary_pg.active_residents_count = Number(active_residents) || 0;
      }

      return formatAdminUser(raw_user, { pg: primary_pg });
    }

    // Role is resident: fetch active stay details, agreements, and current pending payment in parallel
    const [active_stay, agreements, pending_payment] = await Promise.all([
      db('resident_pg_stays')
        .where({ 'resident_pg_stays.resident_id': id, 'resident_pg_stays.status': 'active' })
        .whereNull('resident_pg_stays.deleted_at')
        .leftJoin('pgs', (join) => join.on('resident_pg_stays.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at'))
        .leftJoin('branches', (join) => join.on('resident_pg_stays.branch_id', '=', 'branches.id').andOnNull('branches.deleted_at'))
        .leftJoin('rooms', (join) => join.on('resident_pg_stays.room_id', '=', 'rooms.id').andOnNull('rooms.deleted_at'))
        .leftJoin('buildings', (join) => join.on('rooms.building_id', '=', 'buildings.id').andOnNull('buildings.deleted_at'))
        .leftJoin('floors', (join) => join.on('rooms.floor_id', '=', 'floors.id').andOnNull('floors.deleted_at'))
        .select(
          'resident_pg_stays.id as stay_id',
          'resident_pg_stays.pg_id',
          'resident_pg_stays.branch_id',
          db.raw('COALESCE(branches.name, pgs.name) as branch_name'),
          'pgs.name as pg_name',
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
        .first(),
      db('agreements')
        .where({ resident_id: id })
        .whereNull('deleted_at')
        .orderBy('id', 'desc'),
      db('payments')
        .where({ resident_id: id })
        .whereIn('status', ['pending', 'overdue'])
        .whereNull('deleted_at')
        .orderBy('due_date', 'asc')
        .first(),
    ]);

    return formatResidentUser(raw_user, { active_stay, agreements, pending_payment });
  };
  /**
   * Create a new user record (Resident, Admin, Super Admin).
   * If role is resident and room assignment is provided, atomically assigns room.
   * @param {Object} user_data
     * @returns {Promise<Object>} Created user record
   */
  create = async (user_data) => {
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
      branch_id = null,
      maintenance_amount = 0.0,
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

    // If resident and room allocation is requested, validate upfront
    let target_room = null;
    if (role === ROLES.RESIDENT && (room_id || (room_no && pg_id))) {
      if (room_id) {
        target_room = await db('rooms').where({ id: room_id }).whereNull('deleted_at').first();
        if (!target_room) {
          throw new AppError('Room not found', HTTP_STATUS.NOT_FOUND);
        }
        if (pg_id && Number(target_room.pg_id) !== Number(pg_id)) {
          throw new AppError('Selected room does not belong to the specified PG facility', HTTP_STATUS.BAD_REQUEST);
        }
      } else if (room_no && pg_id) {
        target_room = await db('rooms').where({ pg_id, room_no }).whereNull('deleted_at').first();
        if (!target_room) {
          throw new AppError(`Room '${room_no}' not found for the specified PG facility`, HTTP_STATUS.NOT_FOUND);
        }
      }
    }

    let allocatedPgName = null;
    let allocatedRoomNo = null;
    let allocatedBedNumber = null;
    let allocatedTotalDue = 0;
    let allocatedRentVal = 0;
    let allocatedDepositVal = 0;
    let allocatedMaintVal = 0;

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

      // If user is resident and room was resolved, allocate room stay
      if (role === ROLES.RESIDENT && target_room) {
        allocatedRoomNo = target_room.room_no;
        allocatedBedNumber = bed_number || 'Bed-1';

        const targetPg = await trx('pgs').where({ id: target_room.pg_id }).first();
        if (targetPg) {
          allocatedPgName = targetPg.name;
        }

        const [stay_id] = await trx('resident_pg_stays').insert({
          resident_id: user_id,
          pg_id: target_room.pg_id,
          branch_id: branch_id ? Number(branch_id) : (target_room.branch_id || null),
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
          if (target_room.branch_id) {
            await syncBranchStats(target_room.branch_id, trx);
          }
        }

        // Automatically create initial onboarding payment demand with total of all three: rent, deposit, maintenance
        const rent_val = parseFloat(monthly_rent) || 0.0;
        const deposit_val = parseFloat(security_deposit) || 0.0;
        const maint_val = parseFloat(user_data.maintenance_amount) || 0.0;
        const total_due = rent_val + deposit_val + maint_val;
        allocatedTotalDue = total_due;
        allocatedRentVal = rent_val;
        allocatedDepositVal = deposit_val;
        allocatedMaintVal = maint_val;

        if (total_due > 0) {
          const checkInObj = new Date(effective_check_in);
          const year = checkInObj.getFullYear();
          const monthIndex = checkInObj.getMonth();
          const monthName = checkInObj.toLocaleString('en-US', { month: 'long' });

          const billingStart = new Date(Date.UTC(year, monthIndex, 1)).toISOString().split('T')[0];
          const billingEnd = new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().split('T')[0];

          const dueDay = Math.min(25, new Date(year, monthIndex + 1, 0).getDate());
          const defaultDueDate = new Date(Date.UTC(year, monthIndex, dueDay)).toISOString().split('T')[0];
          const due_date = effective_check_in > defaultDueDate ? effective_check_in : defaultDueDate;

          const titleParts = [];
          if (rent_val > 0) titleParts.push('Rent');
          if (deposit_val > 0) titleParts.push('Deposit');
          if (maint_val > 0) titleParts.push('Maintenance');
          const titleDesc = titleParts.length > 0 ? titleParts.join(', ') : 'Rent & Deposit';

          await trx('payments').insert({
            resident_id: user_id,
            pg_id: target_room.pg_id,
            stay_id,
            branch_id: branch_id ? Number(branch_id) : (target_room.branch_id || null),
            room_id: target_room.id,
            title: `Onboarding Due (${titleDesc}) - ${monthName} ${year}`,
            payment_type: 'rent',
            billing_period_start: billingStart,
            billing_period_end: billingEnd,
            due_date,
            rent_amount: rent_val,
            deposit_amount: deposit_val,
            maintenance_amount: maint_val,
            electricity_amount: 0.00,
            other_amount: 0.00,
            amount: total_due,
            paid_amount: 0.00,
            status: 'pending',
            notes: 'Total onboarding due includes Monthly Rent, Refundable Security Deposit, and Maintenance Fee.',
            created_at: db.fn.now(),
            updated_at: db.fn.now(),
          });
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

        dueAmount: allocatedTotalDue > 0 ? allocatedTotalDue : null,
        rentAmount: allocatedRentVal,
        depositAmount: allocatedDepositVal,
        maintenanceAmount: allocatedMaintVal,
      });
    } catch (emailError) {
      console.error('[User Service] Welcome credentials email delivery failed:', emailError.message);
    }

    return await this.findById(inserted_id);
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
      branch_id = null,
      maintenance_amount = 0.0,
    owner_id = null,
    search = '',
    page = 1,
    limit = 10,
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
      .select(...UserService.listSelectFields);

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
      if (branch_id) {
        builder.where('resident_pg_stays.branch_id', branch_id);
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
    const users = raw_users.map((u) => formatUserListItem(u));

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
     * @returns {Promise<Object>} Updated user
   */
  update = async (id, update_data) => {
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
    const prevAadhar = existing.documents?.aadhar_card || existing.aadhar_card;
    if (update_data.aadhar_card && prevAadhar && update_data.aadhar_card !== prevAadhar) {
      deleteDocumentFile(prevAadhar);
    }
    const prevAddressProof = existing.documents?.address_proof || existing.address_proof;
    if (update_data.address_proof && prevAddressProof && update_data.address_proof !== prevAddressProof) {
      deleteDocumentFile(prevAddressProof);
    }
    const prevCert = existing.documents?.education_certificate || existing.education_certificate;
    if (update_data.education_certificate && prevCert && update_data.education_certificate !== prevCert) {
      deleteDocumentFile(prevCert);
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

      let target_room = null;
      if (update_data.room_id) {
        target_room = await db('rooms').where({ id: update_data.room_id }).whereNull('deleted_at').first();
        if (!target_room) {
          throw new AppError('Room not found', HTTP_STATUS.NOT_FOUND);
        }
        const effective_pg_id = update_data.pg_id || active_stay?.pg_id;
        if (effective_pg_id && Number(target_room.pg_id) !== Number(effective_pg_id)) {
          throw new AppError('Selected room does not belong to the specified PG facility', HTTP_STATUS.BAD_REQUEST);
        }
      }

      if (active_stay) {
        const stay_updates = {
          ...(update_data.branch_id !== undefined && { branch_id: Number(update_data.branch_id) }),
          ...(target_room?.branch_id && { branch_id: target_room.branch_id }),
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
      } else if (target_room) {
        await db('resident_pg_stays').insert({
          resident_id: id,
          pg_id: target_room.pg_id,
          branch_id: update_data.branch_id ? Number(update_data.branch_id) : (target_room.branch_id || null),
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

    return await this.findById(id);
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
    const roomId = user.room_id || user.room_info?.room_id;
    if (roomId) {
      const remaining = await db('resident_pg_stays')
        .where({ room_id: roomId, status: 'active' })
        .whereNull('deleted_at')
        .whereNot({ resident_id: id })
        .first();

      if (!remaining) {
        await db('rooms').where({ id: roomId }).update({
          status: 'vacant',
          updated_at: db.fn.now(),
        });
        const rm = await db('rooms').where({ id: roomId }).first();
        if (rm && rm.branch_id) {
          await syncBranchStats(rm.branch_id);
        }
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
