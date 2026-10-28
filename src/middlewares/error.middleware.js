import { HTTP_STATUS } from '../constants/index.js';
import { AppError } from '../utils/apiResponse.js';
import config from '../config/index.js';

/**
 * Handle 404 Route Not Found
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const notFoundHandler = (req, res, next) => {
  const err = new AppError(`Route not found: ${req.method} ${req.originalUrl}`, HTTP_STATUS.NOT_FOUND);
  next(err);
};

/**
 * Global Error Handler Middleware
 * @param {Error|AppError} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || [];

  // Handle MySQL Duplicate Entry Error (ER_DUP_ENTRY)
  if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
    statusCode = HTTP_STATUS.CONFLICT;
    message = 'Duplicate entry error: Resource already exists';
  }

  // Handle Multer file upload errors
  if (err.name === 'MulterError') {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Image file size exceeds the 5MB limit';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = `Unexpected file field '${err.field}'. Use 'image' as the field name.`;
    }
  }

  // Handle JSON parse error in body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = HTTP_STATUS.BAD_REQUEST;
    message = 'Malformed JSON in request body';
  }

  const response = {
    success: false,
    message,
    ...(errors.length > 0 && { errors }),
    ...(err.forceLogout && { force_logout: true }),
    ...(err.dueAmount !== null && err.dueAmount !== undefined && { due_amount: err.dueAmount }),
    ...(err.code && typeof err.code === 'string' && !['ER_DUP_ENTRY'].includes(err.code) && { code: err.code }),
  };

  if (statusCode === HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    console.error(`[Unhandled Error]`, err);
  }

  return res.status(statusCode).json(response);
};

export default {
  notFoundHandler,
  errorHandler,
};
