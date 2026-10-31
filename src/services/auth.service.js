import crypto from 'crypto';
import userService from './user.service.js';
import pgService from './pg.service.js';
import emailService from './email.service.js';
import redis from '../config/redis.js';
import config from '../config/index.js';
import db from '../config/db.js';
import { ROLES, HTTP_STATUS } from '../constants/index.js';
import { hashPassword, comparePassword } from '../utils/password.js';
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
   * Helper: Normalize and map user roles
   * @param {string} role
   * @returns {string} Standardized role string
   */
  normalizeRole = (role) => {
    if (!role) return ROLES.RESIDENT;
    const lower = String(role).toLowerCase().trim();
    if (lower === ROLES.RESIDENT) return ROLES.RESIDENT;
    if (lower === ROLES.ADMIN) return ROLES.ADMIN;
    if (lower === ROLES.SUPER_ADMIN) return ROLES.SUPER_ADMIN;
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
    pg_email = null,
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
    const hashed_password = await hashPassword(password);

    // Safely parse amenities if sent as string (e.g. via multipart/form-data)
    let parsed_amenities = amenities;
    if (typeof amenities === 'string' && amenities.trim().startsWith('[')) {
      try {
        parsed_amenities = JSON.parse(amenities);
      } catch {
        parsed_amenities = amenities;
      }
    }

    return await db.transaction(async (trx) => {
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
        is_active: true,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

      // 2. Create the PG linked to this owner
      const created_pg = await pgService.create(owner_id, {
        name: pg_name,
        type: pg_type,
        phone: clean_pg_phone,
        email: pg_email || email,
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

      const tokens = generateAuthTokens({
        id: owner_id,
        email,
        role: ROLES.ADMIN,
        pg_id: created_pg.id,
      });

      return {
        owner_id,
        pg_id: created_pg.id,
        ...tokens,
      };
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

    if (!user.is_active) {
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
    if (!user || !user.is_active) {
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

    // Update in database
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
    if (!user || !user.is_active) {
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
