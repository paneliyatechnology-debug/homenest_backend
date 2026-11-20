import crypto from 'crypto';
import userService from './user.service.js';
import pgService from './pg.service.js';
import emailService from './email.service.js';
import redis from '../config/redis.js';
import config from '../config/index.js';
import db from '../config/db.js';
import { ROLES, HTTP_STATUS } from '../constants/index.js';
import { hashPassword, comparePassword, generateSecurePassword } from '../utils/password.js';
import { generateAuthTokens, verifyRefreshToken } from '../utils/jwt.js';
import { AppError } from '../utils/apiResponse.js';

/**
 * Service managing user authentication, registration, OTP login,
 * password resets, and session tokens.
 */
class AuthService {
  /**
   * Helper: Normalize 10-digit Indian phone number
   * @param {string|number} phone
   * @returns {string} 10-digit mobile number
   */
  normalizePhone = (phone) => {
    if (!phone) return '';
    const cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return cleaned.slice(2);
    }
    if (cleaned.length === 11 && cleaned.startsWith('0')) {
      return cleaned.slice(1);
    }
    return cleaned;
  };

  /**
   * Helper: Normalize user role string to standard system role
   * @param {string} role - Raw role input
   * @returns {string} Standardized role ('admin', 'super_admin', 'staff', or 'resident')
   */
  normalizeRole = (role) => {
    if (!role) return ROLES.RESIDENT;
    const lower = String(role).toLowerCase().trim();
    if (lower === ROLES.ADMIN) return ROLES.ADMIN;
    if (lower === ROLES.SUPER_ADMIN) return ROLES.SUPER_ADMIN;
    if (lower === ROLES.STAFF) return ROLES.STAFF;
    return ROLES.RESIDENT;
  };

  /**
   * Helper: Resolve primary or active PG ID associated with a user
   * @param {object} user
   * @returns {Promise<number|null>}
   */
  getUserPgId = async (user) => {
    if (!user) return null;
    if (user.role === ROLES.ADMIN) {
      const pg = await db('pgs')
        .where({ owner_id: user.id })
        .whereNull('deleted_at')
        .orderBy('id', 'asc')
        .first();
      return pg ? pg.id : null;
    }
    if (user.role === ROLES.RESIDENT) {
      const stay = await db('resident_pg_stays')
        .where({ resident_id: user.id, status: 'active' })
        .whereNull('deleted_at')
        .orderBy('id', 'desc')
        .first();
      return stay ? stay.pg_id : null;
    }
    return null;
  };

  /**
   * Dedicated PG Owner + Initial PG Registration Flow
   * Stores owner details in users table with role 'admin'
   * and creates the first PG linked to this owner atomically.
   * @param {object} payload
   * @returns {Promise<{ owner_id: number, pg_id: number }>}
   */
  registerOwnerWithPg = async ({
    name,
    email,
    password,
    phone,
    gender = null,
    address = null,
    profile_photo = null,
    pg_name,
    pg_type = 'coed',
    pg_phone = null,
    pg_address,
    pg_city,
    pg_state,
    pg_pincode,
    total_rooms = 0,
    total_beds = 0,
    amenities = [],
    rules = null,
    logo = null,
    pg_upi_id = null,
    pg_bank_name = null,
    pg_account_number = null,
    pg_ifsc_code = null,
    pg_account_holder_name = null,
  }) => {
    const clean_phone = this.normalizePhone(phone);
    const clean_pg_phone = pg_phone ? this.normalizePhone(pg_phone) : clean_phone;

    // Resolve password: if provided by user, use it; otherwise generate a secure 10-char password
    const has_custom_password = Boolean(password && String(password).trim().length > 0);
    const plain_password = has_custom_password ? String(password).trim() : generateSecurePassword(10);
    const hashed_password = await hashPassword(plain_password);

    // Safely parse amenities if sent as string (e.g. via multipart/form-data)
    let parsed_amenities = amenities;
    if (typeof amenities === 'string' && amenities.trim().startsWith('[')) {
      try {
        parsed_amenities = JSON.parse(amenities);
      } catch {
        parsed_amenities = amenities;
      }
    }

    const registrationResult = await db.transaction(async (trx) => {
      // 1. Create owner with role 'admin'
      const [owner_id] = await trx('users').insert({
        name,
        email,
        password: hashed_password,
        phone: clean_phone || null,
        gender: gender ? String(gender).toLowerCase() : null,
        address: address || null,
        profile_photo: profile_photo || null,
        role: ROLES.ADMIN,
        status: 'active',
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

      // 2. Create the PG linked to this owner
      const created_pg = await pgService.create(owner_id, {
        name: pg_name,
        type: pg_type,
        phone: clean_pg_phone,
        address: pg_address,
        city: pg_city,
        state: pg_state,
        pincode: pg_pincode,
        total_rooms: Number(total_rooms) || 0,
        total_beds: Number(total_beds) || 0,
        amenities: parsed_amenities,
        rules,
        logo: logo || null,
        pg_upi_id: pg_upi_id || null,
        pg_bank_name: pg_bank_name || null,
        pg_account_number: pg_account_number || null,
        pg_ifsc_code: pg_ifsc_code ? String(pg_ifsc_code).toUpperCase() : null,
        pg_account_holder_name: pg_account_holder_name || null,
      }, trx);

      // 3. Atomically create the primary initial branch for this PG
      const [initial_branch_id] = await trx('branches').insert({
        pg_id: created_pg.id,
        name: 'Main Branch',
        location: pg_city || pg_address,
        total_rooms: Number(total_rooms) || 0,
        occupied_rooms: 0,
        available_rooms: Number(total_rooms) || 0,
        status: 'active',
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

      // Link owner to initial branch in user_branches
      await trx('user_branches').insert({
        user_id: owner_id,
        branch_id: initial_branch_id,
      });

      const tokens = generateAuthTokens({
        id: owner_id,
        email,
        role: ROLES.ADMIN,
        pg_id: created_pg.id,
        branch_id: initial_branch_id,
      });

      return {
        owner_id,
        pg_id: created_pg.id,
        branch_id: initial_branch_id,
        ...tokens,
      };
    });

    // Send professional welcome credentials email asynchronously (safe error boundary)
    try {
      await emailService.sendPgOwnerWelcomeEmail({
        email,
        name,
        password: plain_password,
        pgName: pg_name,
        branchName: 'Main Branch',
        city: pg_city || null,
        isAutoGenerated: !has_custom_password,
      });
    } catch (emailError) {
      console.error('[Auth Service] Welcome credentials email delivery failed:', emailError.message);
    }

    return registrationResult;
  };

  /**
   * Update PG and Owner details
   * Resolves target PG, validates owner uniqueness for phone/email if updated,
   * and atomically updates users and pgs tables.
   * @param {object} currentUser - Authenticated user from req.user
   * @param {object} payload - Fields to update
   * @returns {Promise<object>} Updated PG object
   */
  updateOwnerWithPg = async (currentUser, payload) => {
    // 1. Identify which PG to update
    let targetPgId = currentUser.pg_id || currentUser.pg?.id;
    if (!targetPgId && currentUser.role === ROLES.ADMIN) {
      const ownedPg = await db('pgs')
        .where({ owner_id: currentUser.id })
        .whereNull('deleted_at')
        .orderBy('id', 'asc')
        .first();
      if (ownedPg) targetPgId = ownedPg.id;
    } else if (currentUser.role === ROLES.SUPER_ADMIN && payload.pg_id) {
      targetPgId = payload.pg_id;
    }

    if (!targetPgId) {
      throw new AppError('No PG facility found for this account', HTTP_STATUS.NOT_FOUND);
    }

    // Verify PG exists and permission
    const existingPg = await db('pgs')
      .where({ id: targetPgId })
      .whereNull('deleted_at')
      .first();

    if (!existingPg) {
      throw new AppError('PG facility not found', HTTP_STATUS.NOT_FOUND);
    }

    if (currentUser.role !== ROLES.SUPER_ADMIN && existingPg.owner_id !== currentUser.id) {
      throw new AppError('You do not have permission to update this PG facility', HTTP_STATUS.FORBIDDEN);
    }

    const owner_id = existingPg.owner_id;

    // Safely parse amenities if sent as string (e.g. via multipart/form-data)
    let parsed_amenities = payload.amenities;
    if (typeof payload.amenities === 'string' && payload.amenities.trim().startsWith('[')) {
      try {
        parsed_amenities = JSON.parse(payload.amenities);
      } catch {
        parsed_amenities = payload.amenities;
      }
    }

    // Normalize phone numbers if provided
    let clean_owner_phone = undefined;
    const raw_owner_phone = payload.owner_phone !== undefined ? payload.owner_phone : payload.phone;
    if (raw_owner_phone !== undefined) {
      clean_owner_phone = this.normalizePhone(raw_owner_phone);
      if (clean_owner_phone) {
        const phoneConflict = await db('users')
          .where({ phone: clean_owner_phone })
          .whereNot({ id: owner_id })
          .whereNull('deleted_at')
          .first();
        if (phoneConflict) {
          throw new AppError('Owner phone number is already registered with another account', HTTP_STATUS.CONFLICT);
        }
      }
    }

    let clean_owner_email = undefined;
    const raw_owner_email = payload.owner_email !== undefined ? payload.owner_email : payload.email;
    if (raw_owner_email !== undefined) {
      clean_owner_email = String(raw_owner_email).trim().toLowerCase();
      const emailConflict = await db('users')
        .where({ email: clean_owner_email })
        .whereNot({ id: owner_id })
        .whereNull('deleted_at')
        .first();
      if (emailConflict) {
        throw new AppError('Owner email address is already registered with another account', HTTP_STATUS.CONFLICT);
      }
    }

    let clean_pg_phone = undefined;
    if (payload.pg_phone !== undefined) {
      clean_pg_phone = this.normalizePhone(payload.pg_phone);
    }

    return await db.transaction(async (trx) => {
      // 1. Update owner in users table if any owner fields provided
      const userUpdateFields = {};
      const owner_name = payload.owner_name !== undefined ? payload.owner_name : (payload.pg_name !== undefined ? payload.name : (payload.name || undefined));
      if (owner_name !== undefined && payload.name !== undefined && payload.pg_name === undefined && payload.owner_name === undefined) {
        userUpdateFields.name = payload.name;
      } else if (payload.owner_name !== undefined) {
        userUpdateFields.name = payload.owner_name;
      } else if (payload.name !== undefined && payload.pg_name !== undefined) {
        userUpdateFields.name = payload.name;
      }

      if (clean_owner_email !== undefined) {
        userUpdateFields.email = clean_owner_email;
      }
      if (clean_owner_phone !== undefined) userUpdateFields.phone = clean_owner_phone || null;
      if (payload.gender !== undefined) userUpdateFields.gender = String(payload.gender).toLowerCase();
      const owner_address = payload.owner_address !== undefined ? payload.owner_address : (payload.address !== undefined ? payload.address : undefined);
      if (owner_address !== undefined) userUpdateFields.address = owner_address;
      if (payload.profile_photo !== undefined) userUpdateFields.profile_photo = payload.profile_photo;

      if (Object.keys(userUpdateFields).length > 0) {
        userUpdateFields.updated_at = db.fn.now();
        await trx('users').where({ id: owner_id }).update(userUpdateFields);
      }

      // 2. Update PG details
      const pgUpdateData = {};
      const pg_name = payload.pg_name !== undefined ? payload.pg_name : (payload.owner_name !== undefined ? payload.name : undefined);
      if (pg_name !== undefined) pgUpdateData.name = pg_name;
      if (payload.pg_type !== undefined || payload.type !== undefined) {
        pgUpdateData.type = payload.pg_type || payload.type;
      }
      if (clean_pg_phone !== undefined) pgUpdateData.phone = clean_pg_phone;
      const pg_address = payload.pg_address !== undefined ? payload.pg_address : undefined;
      if (pg_address !== undefined) pgUpdateData.address = pg_address;
      if (payload.pg_city !== undefined || payload.city !== undefined) {
        pgUpdateData.city = payload.pg_city || payload.city;
      }
      if (payload.pg_state !== undefined || payload.state !== undefined) {
        pgUpdateData.state = payload.pg_state || payload.state;
      }
      if (payload.pg_pincode !== undefined || payload.pincode !== undefined) {
        pgUpdateData.pincode = payload.pg_pincode || payload.pincode;
      }
      if (payload.total_rooms !== undefined) pgUpdateData.total_rooms = payload.total_rooms;
      if (payload.total_beds !== undefined) pgUpdateData.total_beds = payload.total_beds;
      if (parsed_amenities !== undefined) pgUpdateData.amenities = parsed_amenities;
      if (payload.rules !== undefined) pgUpdateData.rules = payload.rules;
      if (payload.status !== undefined) pgUpdateData.status = payload.status;
      if (payload.logo !== undefined) pgUpdateData.logo = payload.logo;
      if (payload.pg_upi_id !== undefined) pgUpdateData.pg_upi_id = payload.pg_upi_id;
      if (payload.pg_bank_name !== undefined) pgUpdateData.pg_bank_name = payload.pg_bank_name;
      if (payload.pg_account_number !== undefined) pgUpdateData.pg_account_number = payload.pg_account_number;
      if (payload.pg_ifsc_code !== undefined) pgUpdateData.pg_ifsc_code = payload.pg_ifsc_code;
      if (payload.pg_account_holder_name !== undefined) pgUpdateData.pg_account_holder_name = payload.pg_account_holder_name;

      return await pgService.update(targetPgId, pgUpdateData, trx);
    });
  };


  /**
   * Authenticate user by email & password
   * @param {object} credentials
   * @returns {Promise<{ user: object, access_token: string, refresh_token: string }>}
   */
  login = async ({ email, password }) => {
    const user = await userService.findByEmail(email);
    if (!user) {
      throw new AppError('Invalid email or password', HTTP_STATUS.UNAUTHORIZED);
    }

    if (user.status !== 'active') {
      throw new AppError('Your account is deactivated. Please contact support', HTTP_STATUS.FORBIDDEN);
    }

    const is_password_valid = await comparePassword(password, user.password);
    if (!is_password_valid) {
      throw new AppError('Invalid email or password', HTTP_STATUS.UNAUTHORIZED);
    }

    const { password: _, ...user_without_password } = user;
    const pg_id = await this.getUserPgId(user);

    const tokens = generateAuthTokens({
      id: user.id,
      email: user.email,
      role: user.role,
      pg_id,
    });

    const formatted_user = await userService.findById(user.id, pg_id);

    return {
      user: formatted_user || {
        ...user_without_password,
        pg_id,
      },
      ...tokens,
    };
  };

  /**
   * Send one-time login code (OTP) to registered mobile number
   * @param {string} raw_phone
   * @returns {Promise<{ phone: string, message: string, expires_in: string, dev_otp?: string }>}
   */
  sendLoginOtp = async (raw_phone) => {
    const phone = this.normalizePhone(raw_phone);

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in Redis with 5-minute TTL (300 seconds)
    const redis_key = `otp:phone:${phone}`;
    await redis.set(redis_key, otp, 300);

    // SMS Gateway log (Simulated / Gateway provider)
    console.log(`================ SMS OTP DISPATCH ================`);
    console.log(`[SMS Gateway] Sent OTP [${otp}] to +91 ${phone}`);
    console.log(`[Expires in 5 minutes]`);
    console.log(`===================================================`);

    return {
      phone,
      message: `OTP sent successfully to +91 ${phone}`,
      expires_in: '5 minutes',
      ...(config.env === 'development' && { dev_otp: otp }),
    };
  };

  /**
   * Verify mobile OTP and issue authenticated session tokens
   * @param {object} param0
   * @returns {Promise<{ user: object, access_token: string, refresh_token: string }>}
   */
  verifyLoginOtp = async ({ phone: raw_phone, otp }) => {
    const phone = this.normalizePhone(raw_phone);
    const redis_key = `otp:phone:${phone}`;

    const stored_otp = await redis.get(redis_key);
    if (!stored_otp) {
      throw new AppError('OTP has expired or was not requested. Please request a new OTP.', HTTP_STATUS.UNAUTHORIZED);
    }

    if (String(stored_otp).trim() !== String(otp).trim()) {
      throw new AppError('Invalid OTP. Please check the code and try again.', HTTP_STATUS.UNAUTHORIZED);
    }

    // Invalidate OTP after successful match
    await redis.del(redis_key);

    const user = await userService.findByPhone(phone);
    if (!user || user.status !== 'active') {
      throw new AppError('User no longer exists or is deactivated.', HTTP_STATUS.UNAUTHORIZED);
    }

    const { password: _, ...user_without_password } = user;
    const pg_id = await this.getUserPgId(user);

    const tokens = generateAuthTokens({
      id: user.id,
      email: user.email,
      role: user.role,
      pg_id,
    });

    const formatted_user = await userService.findById(user.id, pg_id);

    return {
      user: formatted_user || {
        ...user_without_password,
        pg_id,
      },
      ...tokens,
    };
  };

  /**
   * Enqueue password reset email with reset link via BullMQ & Brevo
   * @param {string} email
   * @returns {Promise<{ email: string, message: string, expires_in: string, reset_token?: string, reset_url?: string }>}
   */
  forgotPassword = async (email) => {
    const clean_email = String(email).trim().toLowerCase();
    const user = await userService.findByEmail(clean_email);

    if (!user) {
      throw new AppError('No account found with this email address.', HTTP_STATUS.NOT_FOUND);
    }

    // Generate secure 32-byte cryptographic hex token
    const reset_token = crypto.randomBytes(32).toString('hex');

    // Store in Redis with 15-minute TTL (900 seconds)
    const redis_key = `pwd_reset_token:${reset_token}`;
    await redis.set(redis_key, JSON.stringify({ id: user.id, email: clean_email }), 900);

    const frontend_url = config.frontendUrl || 'http://localhost:3000';
    const reset_url = `${frontend_url.replace(/\/+$/, '')}/reset-password?token=${reset_token}`;

    // Enqueue professional email via BullMQ & Brevo
    await emailService.sendPasswordResetEmail(clean_email, user.name, reset_url);

    return {
      email: clean_email,
      message: 'Password reset link has been sent to your email address.',
      expires_in: '15 minutes',
      ...(config.env === 'development' && {
        reset_token,
        reset_url,
      }),
    };
  };

  /**
   * Reset user password using verified reset token
   * @param {object} param0
   * @returns {Promise<{ message: string }>}
   */
  resetPassword = async ({ token, password }) => {
    if (!token) {
      throw new AppError('Password reset token is required.', HTTP_STATUS.BAD_REQUEST);
    }

    const redis_key = `pwd_reset_token:${String(token).trim()}`;
    const raw_data = await redis.get(redis_key);

    if (!raw_data) {
      throw new AppError('Password reset link is invalid or has expired. Please request a new one.', HTTP_STATUS.BAD_REQUEST);
    }

    let payload;
    try {
      payload = JSON.parse(raw_data);
    } catch {
      payload = { email: raw_data };
    }

    const user = payload.id
      ? await userService.findById(payload.id)
      : await userService.findByEmail(payload.email);

    if (!user) {
      throw new AppError('User account not found.', HTTP_STATUS.NOT_FOUND);
    }

    // Hash new password
    const hashed_password = await hashPassword(password);

    // Persist updated credentials in database
    await userService.updatePassword(user.id, hashed_password);

    // Invalidate reset token in Redis
    await redis.del(redis_key);

    return {
      message: 'Password has been reset successfully. You can now login with your new password.',
    };
  };

  /**
   * Issue fresh access token using a valid refresh token
   * @param {string} refresh_token
   * @returns {Promise<{ user: object, access_token: string, refresh_token: string }>}
   */
  refreshToken = async (refresh_token) => {
    let decoded;
    try {
      decoded = verifyRefreshToken(refresh_token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AppError('Refresh token has expired. Please login again', HTTP_STATUS.UNAUTHORIZED);
      }
      throw new AppError('Invalid refresh token', HTTP_STATUS.UNAUTHORIZED);
    }

    const user = await userService.findById(decoded.id, decoded.pg_id);
    if (!user || user.status !== 'active') {
      throw new AppError('User no longer exists or is deactivated', HTTP_STATUS.UNAUTHORIZED);
    }

    const pg_id = await this.getUserPgId(user);

    const tokens = generateAuthTokens({
      id: user.id,
      email: user.email,
      role: user.role,
      pg_id,
    });

    return {
      user: user.role === ROLES.RESIDENT ? { ...user, pg_id } : user,
      ...tokens,
    };
  };
}

export default new AuthService();
