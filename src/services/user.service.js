import moment from 'moment';
import db from '../config/db.js';
import config from '../config/index.js';
import { hashPassword, generateSecurePassword } from '../utils/password.js';
import emailService from './email.service.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES, STAFF_ROLES, ALL_STAFF_ROLES } from '../constants/index.js';
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
    subscription_plan: options.subscription_plan || null,
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
    subscription_plan: user.subscription_plan_id ? {
      id: Number(user.subscription_plan_id),
      name: user.plan_name || null,
      plan_type: user.plan_type || null,
      price: user.plan_price !== null && user.plan_price !== undefined ? parseFloat(user.plan_price) : null,
      duration: user.plan_duration || null,
    } : null,
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
    'users.subscription_plan_id',
    'subscription_plans.name as plan_name',
    'subscription_plans.plan_type as plan_type',
    'subscription_plans.price as plan_price',
    'subscription_plans.duration as plan_duration',
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

    let subscription_plan = null;
    if (raw_user.subscription_plan_id) {
      const plan = await db('subscription_plans')
        .where({ id: raw_user.subscription_plan_id })
        .whereNull('deleted_at')
        .first();
      if (plan) {
        subscription_plan = {
          id: plan.id,
          name: plan.name,
          plan_type: plan.plan_type,
          price: parseFloat(plan.price) || 0,
          duration: plan.duration,
          description: plan.description || null,
          features: typeof plan.features === 'string' ? JSON.parse(plan.features) : (plan.features || []),
          is_active: plan.is_active ? 1 : 0,
        };
      }
    }

    return formatResidentUser(raw_user, { active_stay, agreements, pending_payment, subscription_plan });
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
      subscription_plan_id = null,
    } = user_data;

    const target_subscription_plan_id = subscription_plan_id ? Number(subscription_plan_id) : null;
    let chosen_plan = null;
    if (role === ROLES.RESIDENT && target_subscription_plan_id) {
      chosen_plan = await db('subscription_plans')
        .where({ id: target_subscription_plan_id })
        .whereNull('deleted_at')
        .first();
      if (!chosen_plan) {
        throw new AppError('Selected subscription plan not found', HTTP_STATUS.NOT_FOUND);
      }
      if (!chosen_plan.is_active) {
        throw new AppError('Selected subscription plan is currently inactive', HTTP_STATUS.BAD_REQUEST);
      }
      const targetPgId = pg_id ? Number(pg_id) : null;
      if (targetPgId && Number(chosen_plan.pg_id) !== targetPgId) {
        throw new AppError('Selected subscription plan does not belong to the specified PG facility', HTTP_STATUS.BAD_REQUEST);
      }
    }

    // Validate email address is unique across active user accounts
    const existing_email = await this.findByEmail(email);
    if (existing_email) {
      throw new AppError('Email address is already registered', HTTP_STATUS.CONFLICT);
    }

    // Validate phone number is unique across active user accounts
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
        subscription_plan_id: chosen_plan ? chosen_plan.id : null,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

      // Increment subscriber count and record resident subscription purchase
      if (role === ROLES.RESIDENT && chosen_plan) {
        await trx('subscription_plans')
          .where({ id: chosen_plan.id })
          .increment('subscribers_count', 1);

        const subStartDate = effective_check_in;
        const startMoment = new Date(subStartDate);
        let endMoment = new Date(subStartDate);
        if (chosen_plan.plan_type === 'quarterly') {
          endMoment.setMonth(endMoment.getMonth() + 3);
        } else if (chosen_plan.plan_type === 'yearly') {
          endMoment.setFullYear(endMoment.getFullYear() + 1);
        } else {
          endMoment.setMonth(endMoment.getMonth() + 1);
        }
        const subEndDate = endMoment.toISOString().split('T')[0];

        await trx('resident_subscriptions').insert({
          resident_id: user_id,
          subscription_plan_id: chosen_plan.id,
          pg_id: chosen_plan.pg_id,
          price: chosen_plan.price,
          start_date: subStartDate,
          end_date: subEndDate,
          status: 'active',
          created_at: db.fn.now(),
          updated_at: db.fn.now(),
        });
      }

      // If user is resident and room was resolved, allocate room stay
      if (role === ROLES.RESIDENT && target_room) {
        allocatedRoomNo = target_room.room_no;
        allocatedBedNumber = bed_number || 'Bed-1';

        const targetPg = await trx('pgs').where({ id: target_room.pg_id }).first();
        if (targetPg) {
          allocatedPgName = targetPg.name;
        }

        const assignedBranchId = branch_id ? Number(branch_id) : (target_room.branch_id || null);

        const [stay_id] = await trx('resident_pg_stays').insert({
          resident_id: user_id,
          pg_id: target_room.pg_id,
          branch_id: assignedBranchId,
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

        // Sync resident branch in user_branches table
        if (assignedBranchId) {
          await trx('user_branches')
            .insert({
              user_id,
              branch_id: assignedBranchId,
            })
            .onConflict(['user_id', 'branch_id'])
            .ignore();
        }

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
      .leftJoin('subscription_plans', (join) => {
        join
          .on('users.subscription_plan_id', '=', 'subscription_plans.id')
          .andOnNull('subscription_plans.deleted_at');
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

    // Validate email address is unique across active user accounts
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

    // Validate phone number is unique across active user accounts
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
      ...(update_data.name !== undefined && update_data.name !== null && update_data.name !== '' && { name: update_data.name.trim() }),
      ...(update_data.email !== undefined && update_data.email !== null && update_data.email !== '' && { email: update_data.email.toLowerCase().trim() }),
      ...(update_data.phone !== undefined && update_data.phone !== null && update_data.phone !== '' && { phone: update_data.phone.trim() }),
      ...(update_data.gender !== undefined && update_data.gender !== null && update_data.gender !== '' && { gender: String(update_data.gender).toLowerCase() }),
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

        // Sync user_branches if branch updated
        if (stay_updates.branch_id) {
          await db('user_branches')
            .insert({ user_id: id, branch_id: stay_updates.branch_id })
            .onConflict(['user_id', 'branch_id'])
            .ignore();
        }
      } else if (target_room) {
        const assignedBranchId = update_data.branch_id ? Number(update_data.branch_id) : (target_room.branch_id || null);
        await db('resident_pg_stays').insert({
          resident_id: id,
          pg_id: target_room.pg_id,
          branch_id: assignedBranchId,
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

        // Sync user_branches
        if (assignedBranchId) {
          await db('user_branches')
            .insert({ user_id: id, branch_id: assignedBranchId })
            .onConflict(['user_id', 'branch_id'])
            .ignore();
        }
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
        status: 'inactive',
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

  // ==========================================
  // STAFF MANAGEMENT METHODS (Under User Module)
  // ==========================================

  /**
   * Helper: Normalize user-provided staff role to standard enum
   */
  static normalizeStaffRole = (roleInput) => {
    if (!roleInput || typeof roleInput !== 'string') return null;
    const clean = roleInput.trim().toUpperCase().replace(/[\s\-]+/g, '_');

    if (ALL_STAFF_ROLES.includes(clean)) {
      return clean;
    }

    if (clean === 'MANAGER' || clean === 'RESIDENT_MANAGER' || clean === 'PROPERTY_MANAGER') {
      return STAFF_ROLES.BRANCH_MANAGER;
    }
    if (clean === 'SECURITY' || clean === 'GUARD') {
      return STAFF_ROLES.SECURITY_GUARD;
    }
    if (clean === 'CLEANING' || clean === 'HOUSEKEEPING_STAFF' || clean === 'CLEANER') {
      return STAFF_ROLES.HOUSEKEEPING;
    }
    if (clean === 'COOK' || clean === 'KITCHEN' || clean === 'CHEF') {
      return STAFF_ROLES.KITCHEN_STAFF;
    }
    if (clean === 'TECHNICIAN' || clean === 'ELECTRICIAN' || clean === 'PLUMBER') {
      return STAFF_ROLES.MAINTENANCE;
    }

    return null;
  };

  /**
   * Helper: Resolve PG property context for staff management
   */
  resolveAdminPg = async (user, candidatePgId = null) => {
    if (user.role === ROLES.SUPER_ADMIN) {
      if (candidatePgId) {
        const pg = await db('pgs').where({ id: candidatePgId }).whereNull('deleted_at').first();
        if (!pg) throw new AppError('PG property not found', HTTP_STATUS.NOT_FOUND);
        return pg;
      }
      const pg = await db('pgs').whereNull('deleted_at').orderBy('id', 'asc').first();
      if (!pg) throw new AppError('No active PG properties found in the system', HTTP_STATUS.NOT_FOUND);
      return pg;
    }

    if (user.role === ROLES.ADMIN) {
      const pg = await db('pgs').where({ owner_id: user.id }).whereNull('deleted_at').first();
      if (!pg) {
        throw new AppError('No active PG property found under your account', HTTP_STATUS.FORBIDDEN);
      }
      return pg;
    }

    if (user.role === ROLES.RESIDENT) {
      const stay = await db('resident_pg_stays')
        .where({ resident_id: user.id, status: 'active' })
        .whereNull('deleted_at')
        .orderBy('id', 'desc')
        .first();

      if (!stay || !stay.pg_id || !stay.branch_id) {
        throw new AppError('No active PG stay found for resident', HTTP_STATUS.FORBIDDEN);
      }

      return {
        id: stay.pg_id,
        branch_id: stay.branch_id,
      };
    }

    throw new AppError('Unauthorized access', HTTP_STATUS.FORBIDDEN);
  };

  /**
   * Helper: Attach multi-branch assignments to staff user records
   */
  attachBranchesToUsers = async (userRecords = []) => {
    if (!userRecords.length) return [];

    const userIds = userRecords.map((u) => u.id);
    const branchLinks = await db('user_branches')
      .whereIn('user_branches.user_id', userIds)
      .join('branches', 'user_branches.branch_id', 'branches.id')
      .whereNull('branches.deleted_at')
      .select('user_branches.user_id', 'branches.id as branch_id', 'branches.name as branch_name')
      .orderBy('branches.name', 'asc');

    const branchMap = {};
    branchLinks.forEach((link) => {
      if (!branchMap[link.user_id]) {
        branchMap[link.user_id] = [];
      }
      branchMap[link.user_id].push({
        id: link.branch_id,
        name: link.branch_name,
      });
    });

    return userRecords.map((user) => {
      const branches = branchMap[user.id] || [];
      return {
        id: user.id,
        name: user.name,
        role: user.staff_role || user.role,
        staff_role: user.staff_role || null,
        email: user.email,
        phone: user.phone || null,
        status: user.status,
        profile_photo: user.profile_photo || null,
        photo: user.profile_photo || null,
        photo_url: buildFileUrl('users', user.profile_photo),
        branches,
        branch_names: branches.map((b) => b.name).join(', ') || 'Unassigned',
        created_at: user.created_at,
        updated_at: user.updated_at,
      };
    });
  };

  /**
   * Calculate KPI summary statistics for operational staff (total staff, active, on leave, inactive, and role breakdown).
   *
   * @param {object} user - Authenticated user context
   * @param {object} query - Filtering options (branch_id)
   * @returns {Promise<object>} Aggregated staff counts and metrics
   */
  getStaffStats = async (user, query = {}) => {
    const pg = await this.resolveAdminPg(user);

    let base = db('users')
      .where('users.role', ROLES.STAFF)
      .where('users.pg_id', pg.id)
      .whereNull('users.deleted_at');

    if (query.branch_id) {
      base = base.whereIn(
        'users.id',
        db('user_branches').where('branch_id', query.branch_id).select('user_id')
      );
    }

    const counts = await base.clone()
      .select(
        db.raw('COUNT(id) as total_staff'),
        db.raw('COUNT(CASE WHEN status = "active" THEN 1 END) as active_staff'),
        db.raw('COUNT(CASE WHEN status = "on_leave" THEN 1 END) as on_leave_staff'),
        db.raw('COUNT(CASE WHEN status = "inactive" THEN 1 END) as inactive_staff')
      )
      .first();

    const roleCounts = await base.clone()
      .select('staff_role', db.raw('COUNT(id) as count'))
      .whereNotNull('staff_role')
      .groupBy('staff_role');

    const rolesBreakdown = {};
    ALL_STAFF_ROLES.forEach((r) => {
      rolesBreakdown[r] = 0;
    });
    roleCounts.forEach((r) => {
      rolesBreakdown[r.staff_role] = parseInt(r.count, 10);
    });

    const total = parseInt(counts?.total_staff || 0, 10);
    const active = parseInt(counts?.active_staff || 0, 10);
    const onLeave = parseInt(counts?.on_leave_staff || 0, 10);
    const inactive = parseInt(counts?.inactive_staff || 0, 10);

    return {
      pg_id: pg.id,
      branch_id: query.branch_id ? Number(query.branch_id) : null,
      total_staff: total,
      total: total,
      active: active,
      on_leave: onLeave,
      inactive: inactive,
      roles: rolesBreakdown,
    };
  };

  /**
   * 2. List Staff Members & Directory (Unified for Resident Branch View & Admin Multi-Branch Table)
   *
   * - For Resident Token:
   *   Automatically locked to resident's active branch stay from resident_pg_stays.
   *   External branch_id filters are overridden/scoped to resident's branch.
   *   Defaults to active staff for direct calling and messaging.
   *   Attaches call_action and message_action.
   *
   * - For Admin / Super Admin Token:
   *   Multi-branch selection filter: if branch_id is provided, filters to that branch.
   *   If branch_id is omitted or 'all', returns staff across all branches of the PG.
   *   Full status filtering: 'all', 'active', 'on_leave', 'inactive'.
   *   Search across name, email, phone, role, with pagination.
   */
  getStaff = async (user, query = {}) => {
    const isResident = user.role === ROLES.RESIDENT;
    let targetPgId = null;
    let targetBranchId = null;
    let branchInfo = null;

    if (isResident) {
      const stay = await db('resident_pg_stays')
        .where({ resident_id: user.id, status: 'active' })
        .whereNull('deleted_at')
        .orderBy('id', 'desc')
        .first();

      if (!stay || !stay.branch_id) {
        throw new AppError('No active branch stay found for resident', HTTP_STATUS.FORBIDDEN);
      }
      targetBranchId = stay.branch_id;
      targetPgId = stay.pg_id;
    } else {
      const pg = await this.resolveAdminPg(user);
      targetPgId = pg.id;
      if (query.branch_id && query.branch_id !== 'all') {
        targetBranchId = Number(query.branch_id);
      }
    }

    if (targetBranchId) {
      const branch = await db('branches')
        .where({ id: targetBranchId })
        .whereNull('deleted_at')
        .select('id', 'name', 'location')
        .first();
      if (branch) {
        branchInfo = branch;
      }
    }

    const {
      staff_role,
      role,
      status,
      search,
      page = 1,
      limit = 10,
    } = query;

    const current_page = Math.max(1, parseInt(page, 10) || 1);
    const per_page = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (current_page - 1) * per_page;

    let base = db('users')
      .where('users.role', ROLES.STAFF)
      .where('users.pg_id', targetPgId)
      .whereNull('users.deleted_at');

    if (targetBranchId) {
      base = base.whereIn(
        'users.id',
        db('user_branches').where('branch_id', targetBranchId).select('user_id')
      );
    }

    const targetRole = staff_role || role;
    if (targetRole && targetRole !== 'all') {
      const normalized = UserService.normalizeStaffRole(targetRole);
      if (normalized) {
        base = base.where('users.staff_role', normalized);
      } else {
        base = base.where('users.staff_role', 'like', `%${targetRole.trim()}%`);
      }
    }

    if (isResident) {
      if (status && status !== 'all') {
        base = base.where('users.status', status.toLowerCase());
      } else {
        base = base.where('users.status', 'active');
      }
    } else {
      if (status && status !== 'all') {
        base = base.where('users.status', status.toLowerCase());
      }
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      base = base.where((builder) => {
        builder
          .where('users.name', 'like', q)
          .orWhere('users.email', 'like', q)
          .orWhere('users.phone', 'like', q)
          .orWhere('users.staff_role', 'like', q);
      });
    }

    const totalRow = await base.clone().count('users.id as total').first();
    const total = parseInt(totalRow?.total || 0, 10);

    const sortColumn = isResident ? 'users.name' : 'users.id';
    const sortOrder = isResident ? 'asc' : 'desc';

    const rows = await base.clone()
      .select('users.*')
      .orderBy(sortColumn, sortOrder)
      .limit(per_page)
      .offset(offset);

    const formattedStaff = await this.attachBranchesToUsers(rows);

    const staffWithActions = formattedStaff.map((s) => ({
      ...s,
      branch_name: branchInfo ? branchInfo.name : s.branch_names,
      call_action: s.phone ? `tel:${s.phone.replace(/[\s\-]/g, '')}` : null,
      message_action: s.phone ? `sms:${s.phone.replace(/[\s\-]/g, '')}` : null,
    }));

    return {
      staff: staffWithActions,
      data: staffWithActions,
      branch: branchInfo,
      pagination: {
        total,
        page: current_page,
        limit: per_page,
        total_pages: Math.ceil(total / per_page) || 1,
      },
    };
  };

  /**
   * 3. Resident Staff Contact Directory (Alias to unified getStaff)
   */
  getStaffDirectory = async (user, query = {}) => {
    return await this.getStaff(user, query);
  };

  /**
   * Onboard a new operational staff member with multi-branch assignments, hashed credentials, and optional photo.
   *
   * @param {object} data - Staff registration payload (name, email, phone, staff_role, branch_ids)
   * @param {Express.Multer.File|null} [file] - Uploaded profile photo file
   * @param {object} user - Authenticated user context
   * @returns {Promise<object>} Created staff member record
   */
  createStaff = async (data, file = null, user) => {
    const pg = await this.resolveAdminPg(user);

    const branchIds = data.branch_ids || [];
    if (!branchIds.length) {
      throw new AppError('At least one branch must be assigned to staff', HTTP_STATUS.BAD_REQUEST);
    }

    const validBranches = await db('branches')
      .whereIn('id', branchIds)
      .where('pg_id', pg.id)
      .whereNull('deleted_at')
      .select('id', 'name');

    if (validBranches.length !== branchIds.length) {
      throw new AppError('One or more selected branches do not belong to your property', HTTP_STATUS.BAD_REQUEST);
    }

    const roleInput = data.staff_role || data.role;
    const staffRole = UserService.normalizeStaffRole(roleInput);
    if (!staffRole) {
      throw new AppError(
        `Invalid staff role '${roleInput}'. Must be one of: ${ALL_STAFF_ROLES.join(', ')}`,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const email = data.email.trim().toLowerCase();
    const phone = data.phone.trim();
    const name = data.name.trim();
    const status = (data.status || 'active').toLowerCase();
    const photoFilename = file ? file.filename : null;

    const existingUser = await db('users')
      .where({ email })
      .whereNull('deleted_at')
      .first();

    if (existingUser) {
      throw new AppError(`A user with email '${email}' already exists`, HTTP_STATUS.CONFLICT);
    }

    const tempPassword = generateSecurePassword(12);
    const hashedPassword = await hashPassword(tempPassword);

    const newStaff = await db.transaction(async (trx) => {
      const [userId] = await trx('users').insert({
        name,
        email,
        phone,
        role: ROLES.STAFF,
        staff_role: staffRole,
        pg_id: pg.id,
        status,
        profile_photo: photoFilename,
        password: hashedPassword,
      });

      const branchInserts = branchIds.map((bId) => ({
        user_id: userId,
        branch_id: bId,
      }));
      await trx('user_branches').insert(branchInserts);

      return {
        id: userId,
        name,
        role: staffRole,
        staff_role: staffRole,
        email,
        phone,
        status,
        profile_photo: photoFilename,
        photo_url: buildFileUrl('users', photoFilename),
        branches: validBranches,
        branch_names: validBranches.map((b) => b.name).join(', '),
      };
    });

    return newStaff;
  };

  /**
   * 5. Get Staff Member Details by ID
   */
  getStaffById = async (id, user) => {
    const pg = await this.resolveAdminPg(user);

    const staff = await db('users')
      .where({ 'users.id': id, 'users.role': ROLES.STAFF })
      .where('users.pg_id', pg.id)
      .whereNull('users.deleted_at')
      .first();

    if (!staff) {
      throw new AppError('Staff member not found', HTTP_STATUS.NOT_FOUND);
    }

    const [formatted] = await this.attachBranchesToUsers([staff]);
    return formatted;
  };

  /**
   * Update staff contact details, status, operational role, or branch assignments.
   *
   * @param {number|string} id - Staff user ID
   * @param {object} data - Updated details payload
   * @param {Express.Multer.File|null} [file] - Optional replacement photo
   * @param {object} user - Authenticated user context
   * @returns {Promise<object>} Updated staff entity
   */
  updateStaff = async (id, data, file = null, user) => {
    const pg = await this.resolveAdminPg(user);

    const staff = await db('users')
      .where({ id, role: ROLES.STAFF, pg_id: pg.id })
      .whereNull('deleted_at')
      .first();

    if (!staff) {
      throw new AppError('Staff member not found', HTTP_STATUS.NOT_FOUND);
    }

    let branchIds = data.branch_ids;
    if (branchIds && branchIds.length) {
      const validBranches = await db('branches')
        .whereIn('id', branchIds)
        .where('pg_id', pg.id)
        .whereNull('deleted_at')
        .select('id', 'name');

      if (validBranches.length !== branchIds.length) {
        throw new AppError('One or more selected branches do not belong to your property', HTTP_STATUS.BAD_REQUEST);
      }
    }

    if (data.email && data.email.toLowerCase() !== staff.email.toLowerCase()) {
      const email = data.email.trim().toLowerCase();
      const duplicate = await db('users')
        .where({ email })
        .whereNot({ id })
        .whereNull('deleted_at')
        .first();

      if (duplicate) {
        throw new AppError(`A user with email '${email}' already exists`, HTTP_STATUS.CONFLICT);
      }
    }

    let photoFilename = staff.profile_photo;
    if (file) {
      if (staff.profile_photo) {
        deleteUserPhotoFile(staff.profile_photo);
      }
      photoFilename = file.filename;
    }

    const updatePayload = {
      updated_at: db.fn.now(),
    };
    if (data.name) updatePayload.name = data.name.trim();
    if (data.email) updatePayload.email = data.email.trim().toLowerCase();
    if (data.phone) updatePayload.phone = data.phone.trim();
    if (data.status) {
      updatePayload.status = data.status.toLowerCase();
    }
    if (data.staff_role || data.role) {
      const normalized = UserService.normalizeStaffRole(data.staff_role || data.role);
      if (normalized) updatePayload.staff_role = normalized;
    }
    if (photoFilename !== staff.profile_photo) {
      updatePayload.profile_photo = photoFilename;
    }

    await db.transaction(async (trx) => {
      await trx('users').where({ id }).update(updatePayload);

      if (branchIds && branchIds.length) {
        await trx('user_branches').where({ user_id: id }).delete();
        const branchInserts = branchIds.map((bId) => ({
          user_id: id,
          branch_id: bId,
        }));
        await trx('user_branches').insert(branchInserts);
      }
    });

    return await this.getStaffById(id, user);
  };

  /**
   * 7. Quick Update Staff Status (active | on_leave | inactive)
   */
  updateStaffStatus = async (id, status, user) => {
    const pg = await this.resolveAdminPg(user);
    const normalizedStatus = status.toLowerCase();

    const staff = await db('users')
      .where({ id, role: ROLES.STAFF, pg_id: pg.id })
      .whereNull('deleted_at')
      .first();

    if (!staff) {
      throw new AppError('Staff member not found', HTTP_STATUS.NOT_FOUND);
    }

    await db('users').where({ id }).update({
      status: normalizedStatus,
      updated_at: db.fn.now(),
    });

    return {
      id,
      name: staff.name,
      old_status: staff.status,
      new_status: normalizedStatus,
      message: `Staff status updated to ${normalizedStatus} successfully`,
    };
  };

  /**
   * 8. Soft Delete Staff Member
   */
  deleteStaff = async (id, user) => {
    const pg = await this.resolveAdminPg(user);

    const staff = await db('users')
      .where({ id, role: ROLES.STAFF, pg_id: pg.id })
      .whereNull('deleted_at')
      .first();

    if (!staff) {
      throw new AppError('Staff member not found', HTTP_STATUS.NOT_FOUND);
    }

    await db('users').where({ id }).update({
      status: 'inactive',
      deleted_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    return {
      id,
      name: staff.name,
      message: 'Staff member removed successfully',
    };
  };

}

export default new UserService();
