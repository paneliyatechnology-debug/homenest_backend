import authService from '../services/auth.service.js';
import { success, successMessage, successAction, AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import { getCookieOptions } from '../utils/jwt.js';

// Cookie Lifetimes (in milliseconds)
const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Register a PG Owner and initial PG facility.
 * Response returns success, message, and owner id.
 */
export const registerOwnerWithPg = async (req, res, next) => {
  try {
    const result = await authService.registerOwnerWithPg(req.body);

    // Set secure HTTP-only cookies
    res.cookie('access_token', result.access_token, getCookieOptions(ACCESS_TOKEN_MAX_AGE));
    res.cookie('refresh_token', result.refresh_token, getCookieOptions(REFRESH_TOKEN_MAX_AGE));

    return successAction(res, 'PG Owner and PG registered successfully', result.owner_id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * Login user with email and password.
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });

    // Set secure HTTP-only cookies
    res.cookie('access_token', result.access_token, getCookieOptions(ACCESS_TOKEN_MAX_AGE));
    res.cookie('refresh_token', result.refresh_token, getCookieOptions(REFRESH_TOKEN_MAX_AGE));

    return success(res, 'Login successful', result);
  } catch (err) {
    next(err);
  }
};

/**
 * Refresh expired access token using refresh token from cookie or body.
 */
export const refresh = async (req, res, next) => {
  try {
    const refresh_token = req.cookies?.refresh_token || req.body?.refresh_token;

    if (!refresh_token) {
      throw new AppError('Refresh token is required', HTTP_STATUS.UNAUTHORIZED);
    }

    const result = await authService.refreshToken(refresh_token);

    // Rotate cookies
    res.cookie('access_token', result.access_token, getCookieOptions(ACCESS_TOKEN_MAX_AGE));
    if (result.refresh_token) {
      res.cookie('refresh_token', result.refresh_token, getCookieOptions(REFRESH_TOKEN_MAX_AGE));
    }

    return success(res, 'Token refreshed successfully', result);
  } catch (err) {
    next(err);
  }
};

/**
 * Logout user and clear all authentication cookies.
 * Response carries only success and message.
 */
export const logout = async (req, res, next) => {
  try {
    res.clearCookie('access_token', getCookieOptions(0));
    res.clearCookie('refresh_token', getCookieOptions(0));

    return successMessage(res, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * Send one-time password (OTP) to registered mobile number for login.
 */
export const sendOtp = async (req, res, next) => {
  try {
    const { phone } = req.body;
    const result = await authService.sendLoginOtp(phone);

    return success(res, result.message, result);
  } catch (err) {
    next(err);
  }
};

/**
 * Verify mobile OTP and issue authenticated session.
 */
export const verifyOtp = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    const result = await authService.verifyLoginOtp({ phone, otp });

    // Set secure HTTP-only cookies
    res.cookie('access_token', result.access_token, getCookieOptions(ACCESS_TOKEN_MAX_AGE));
    res.cookie('refresh_token', result.refresh_token, getCookieOptions(REFRESH_TOKEN_MAX_AGE));

    return success(res, 'OTP verified successfully. Login successful', result);
  } catch (err) {
    next(err);
  }
};

/**
 * Request password reset code via email.
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await authService.forgotPassword(email);

    return success(res, result.message, result);
  } catch (err) {
    next(err);
  }
};

/**
 * Reset password using token from reset email.
 * Accepts { token, password }.
 * Response carries only success and message.
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { token, password, new_password } = req.body;
    const effective_password = password || new_password;

    const result = await authService.resetPassword({
      token,
      password: effective_password,
    });

    return successMessage(res, result.message);
  } catch (err) {
    next(err);
  }
};

/**
 * Retrieve current authenticated user profile.
 */
export const me = async (req, res, next) => {
  try {
    return success(res, 'Authenticated user fetched successfully', req.user);
  } catch (err) {
    next(err);
  }
};

export default {
  registerOwnerWithPg,
  login,
  refresh,
  logout,
  sendOtp,
  verifyOtp,
  forgotPassword,
  resetPassword,
  me,
};
