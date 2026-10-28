import jwt from 'jsonwebtoken';
import config from '../config/index.js';

/**
 * Generate short-lived JSON Web Access Token
 * @param {object} payload - Claims to encode in the token (e.g. { id, email, role })
 * @param {string} [expiresIn] - Expiry string (default from config: 15m)
 * @returns {string} Signed JWT token string
 */
export const generateAccessToken = (payload, expiresIn = config.jwt.accessExpiresIn) => {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn,
  });
};

/**
 * Generate long-lived JSON Web Refresh Token
 * @param {object} payload - Claims to encode in the refresh token
 * @param {string} [expiresIn] - Expiry string (default from config: 7d)
 * @returns {string} Signed JWT refresh token string
 */
export const generateRefreshToken = (payload, expiresIn = config.jwt.refreshExpiresIn) => {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn,
  });
};

/**
 * Generate both Access and Refresh Tokens in snake_case format
 * @param {object} payload - User claims (e.g. { id, email, role })
 * @returns {{ access_token: string, refresh_token: string }}
 */
export const generateAuthTokens = (payload) => {
  const access_token = generateAccessToken(payload);
  const refresh_token = generateRefreshToken(payload);

  return {
    access_token,
    refresh_token,
  };
};

/**
 * Verify and decode an Access Token
 * @param {string} token - Signed JWT access token
 * @returns {object} Decoded token payload
 * @throws {jwt.JsonWebTokenError|jwt.TokenExpiredError}
 */
export const verifyAccessToken = (token) => {
  return jwt.verify(token, config.jwt.accessSecret);
};

/**
 * Verify and decode a Refresh Token
 * @param {string} token - Signed JWT refresh token
 * @returns {object} Decoded token payload
 * @throws {jwt.JsonWebTokenError|jwt.TokenExpiredError}
 */
export const verifyRefreshToken = (token) => {
  return jwt.verify(token, config.jwt.refreshSecret);
};

/**
 * Helper to construct secure HTTP-only cookie options
 * @param {number} max_age_ms - Cookie lifetime in milliseconds
 * @returns {import('express').CookieOptions} Cookie configuration object
 */
export const getCookieOptions = (max_age_ms) => {
  return {
    httpOnly: true, // Prevents client-side script access (mitigating XSS)
    secure: Boolean(config.jwt.cookieSecure), // Require HTTPS in production
    sameSite: config.jwt.cookieSecure ? 'none' : 'lax', // CSRF mitigation
    maxAge: max_age_ms,
    path: '/',
  };
};

export default {
  generateAccessToken,
  generateRefreshToken,
  generateAuthTokens,
  verifyAccessToken,
  verifyRefreshToken,
  getCookieOptions,
};
