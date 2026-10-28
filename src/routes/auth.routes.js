import { Router } from 'express';
import authController from '../controllers/auth.controller.js';
import {
  registerOwnerWithPgValidator,
  loginValidator,
  sendOtpValidator,
  verifyOtpValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
} from '../validators/auth.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { handlePgRegistrationUpload } from '../middlewares/upload.middleware.js';

const router = Router();

/**
 * @route   POST /api/v1/auth/register-pg
 * @desc    Dedicated PG Register Flow: Registers Owner (role: admin) + creates first PG.
 *          Supports FormData with optional owner profile photo and PG logo.
 * @access  Public
 */
router.post(
  '/register-pg',
  handlePgRegistrationUpload,
  validate(registerOwnerWithPgValidator),
  authController.registerOwnerWithPg
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user with email & password (sets HTTP-only cookies)
 * @access  Public
 */
router.post('/login', validate(loginValidator), authController.login);

/**
 * @route   POST /api/v1/auth/send-otp
 * @desc    Send OTP to mobile number (stored in Redis with 5-min TTL)
 * @access  Public
 */
router.post('/send-otp', validate(sendOtpValidator), authController.sendOtp);

/**
 * @route   POST /api/v1/auth/verify-otp
 * @desc    Verify OTP and log in (sets HTTP-only cookies)
 * @access  Public
 */
router.post('/verify-otp', validate(verifyOtpValidator), authController.verifyOtp);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Request password reset code (enqueued to BullMQ & delivered via Brevo)
 * @access  Public
 */
router.post('/forgot-password', validate(forgotPasswordValidator), authController.forgotPassword);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password using verification code
 * @access  Public
 */
router.post('/reset-password', validate(resetPasswordValidator), authController.resetPassword);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token using refreshToken cookie or payload
 * @access  Public
 */
router.post('/refresh', authController.refresh);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user and clear auth cookies
 * @access  Public
 */
router.post('/logout', authController.logout);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current authenticated user profile
 * @access  Private
 */
router.get('/me', authenticate, authController.me);

export default router;
