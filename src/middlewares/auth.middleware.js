import { HTTP_STATUS, ROLES } from '../constants/index.js';
import { AppError } from '../utils/apiResponse.js';
import { verifyAccessToken } from '../utils/jwt.js';
import userService from '../services/user.service.js';
import db from '../config/db.js';

/**
 * Authenticate JWT middleware.
 * Verifies token from Authorization header or HTTP-only cookies.
 */
export const authenticate = async (req, res, next) => {
  try {
    let token = null;
    const auth_header = req.headers.authorization;

    if (auth_header && auth_header.startsWith('Bearer ')) {
      token = auth_header.split(' ')[1];
    } else if (req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) {
      throw new AppError('Access token is missing or invalid. Please login', HTTP_STATUS.UNAUTHORIZED);
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AppError('Access token has expired. Please refresh your session or login again', HTTP_STATUS.UNAUTHORIZED);
      }
      throw new AppError('Invalid access token', HTTP_STATUS.UNAUTHORIZED);
    }

    const user = await userService.findById(decoded.id, decoded.pg_id);

    if (!user) {
      throw new AppError('User belonging to this token no longer exists', HTTP_STATUS.UNAUTHORIZED);
    }

    if (!user.is_active) {
      throw new AppError('User account is deactivated', HTTP_STATUS.FORBIDDEN);
    }

    let resolved_pg_id = decoded.pg_id || user.pg?.id || user.room_info?.pg_id || user.pg_id || null;
    if (!resolved_pg_id) {
      if (user.role === ROLES.ADMIN) {
        const pg = await db('pgs').where({ owner_id: user.id }).whereNull('deleted_at').orderBy('id', 'asc').first();
        if (pg) resolved_pg_id = pg.id;
      } else if (user.role === ROLES.RESIDENT) {
        const stay = await db('resident_pg_stays').where({ resident_id: user.id, status: 'active' }).whereNull('deleted_at').orderBy('id', 'desc').first();
        if (stay) resolved_pg_id = stay.pg_id;
      }
    }
    if (user.role === ROLES.RESIDENT) {
      user.pg_id = resolved_pg_id;
    }
    req.user = user;
    req.pg_id = resolved_pg_id;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Role-based authorization middleware.
 * @param {...string} roles - Permitted roles (e.g. 'admin', 'super_admin', 'resident')
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          `Permission denied. You do not have permission to perform this action.`,
          HTTP_STATUS.FORBIDDEN
        )
      );
    }

    next();
  };
};

export default {
  authenticate,
  authorize,
};
