/**
 * API response helpers.
 *
 * Operational error class and standardized response formatters.
 */
import { HTTP_STATUS } from '../constants/index.js';
import { formatResponseDates } from './date.js';

// ==========================================
// Operational Error class
// ==========================================

/**
 * Operational application error with HTTP status code and field-level errors.
 */
export class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} [statusCode=500] - HTTP status code
   * @param {Array<{field?: string, message: string}>} [errors=[]] - Field-level validation errors
   * @param {Object} [options={}]
   * @param {boolean} [options.forceLogout=false] - Tell the frontend to clear the session and log out
   * @param {string|null} [options.code=null] - Stable machine-readable error code
   * @param {number|null} [options.dueAmount=null] - Remaining due, returned as due_amount
   */
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errors = [], options = {}) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    this.forceLogout = Boolean(options.forceLogout);
    this.code = options.code || null;
    this.dueAmount = options.dueAmount === undefined || options.dueAmount === null ? null : options.dueAmount;
  }
}

// ==========================================
// Standardized Success responses (Arrow functions)
// ==========================================

/**
 * Send a standardized JSON success response.
 * @param {import('express').Response} res - Express response
 * @param {string} message - Success message
 * @param {Object} [data={}] - Response payload
 * @param {number} [statusCode=200] - HTTP status code
 * @param {Object|null} [meta=null] - Optional pagination metadata
 * @returns {import('express').Response}
 */
export const success = (res, message, data = {}, statusCode = HTTP_STATUS.OK, meta = null) => {
  const payload = {
    success: true,
    message,
    data: formatResponseDates(data),
  };

  if (meta && typeof meta === 'object') {
    payload.meta = formatResponseDates({
      page: meta.page !== undefined ? Number(meta.page) : undefined,
      limit: meta.limit !== undefined ? Number(meta.limit) : undefined,
      total_records: meta.total_records !== undefined ? Number(meta.total_records) : (meta.totalRecords !== undefined ? Number(meta.totalRecords) : undefined),
      total_pages: meta.total_pages !== undefined ? Number(meta.total_pages) : (meta.totalPages !== undefined ? Number(meta.totalPages) : undefined),
      has_next: meta.has_next !== undefined ? Boolean(meta.has_next) : (meta.hasNext !== undefined ? Boolean(meta.hasNext) : undefined),
      has_prev: meta.has_prev !== undefined ? Boolean(meta.has_prev) : (meta.hasPrev !== undefined ? Boolean(meta.hasPrev) : undefined),
      ...meta,
    });
  }

  return res.status(statusCode).json(payload);
};

/**
 * Send a success response that carries only a message and no data.
 * Used by logout, reset-password and change-password.
 * @param {import('express').Response} res - Express response
 * @param {string} message - Success message
 * @param {number} [statusCode=200] - HTTP status code
 * @returns {import('express').Response}
 */
export const successMessage = (res, message, statusCode = HTTP_STATUS.OK) => {
  return res.status(statusCode).json({
    success: true,
    message,
  });
};

/**
 * Send a standardized response for create, update, and delete actions.
 * Returns only success, message, and id.
 * @param {import('express').Response} res - Express response
 * @param {string} message - Action completion message
 * @param {number|string} id - Identifier of created, updated, or deleted entity
 * @param {number} [statusCode=200] - HTTP status code (201 for create, 200 for update/delete)
 * @returns {import('express').Response}
 */
export const successAction = (res, message, id, statusCode = HTTP_STATUS.OK) => {
  return res.status(statusCode).json({
    success: true,
    message,
    id,
  });
};

/**
 * Standardized error response formatter.
 * @param {import('express').Response} res - Express response
 * @param {string} message - Error description
 * @param {number} [statusCode=500] - HTTP status code
 * @param {Array} [errors=[]] - Detailed validation or field errors
 * @returns {import('express').Response}
 */
export const error = (res, message = 'Internal Server Error', statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errors = []) => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors && errors.length > 0 && { errors }),
  });
};

export default {
  AppError,
  success,
  successMessage,
  successAction,
  error,
};

