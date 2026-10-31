import { HTTP_STATUS, ROLES } from '../constants/index.js';
import { AppError } from '../utils/apiResponse.js';
import { verifyAccessToken } from '../utils/jwt.js';
import userService from '../services/user.service.js';
import db from '../config/db.js';

/**
 * Authenticate JWT middleware.
 * Verifies token from Authorization header (Bearer) or HTTP-only cookies (access_token).
 * Smoothly falls back to cookies if the Authorization header is empty or an unresolved Postman variable.
 */
export const authenticate = async (req, res, next) => {
  try {
    let token = null;
    const auth_header = req.headers.authorization;

    // 1. Extract from Authorization Bearer header
    if (auth_header && auth_header.startsWith('Bearer ')) {
      const candidate = auth_header.slice(7).trim();
      // Validate candidate is not empty and not an unparsed template like {{accessToken}}
      if (candidate && candidate !== 'undefined' && candidate !== 'null' && !candidate.startsWith('{{')) {
        token = candidate;
      }
    }

    // 2. Fall back to HTTP-only cookie if Authorization header is missing or empty
    if (!token && req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) {
      throw new AppError('Access token is missing or invalid. Please login', HTTP_STATUS.UNAUTHORIZED);
    }

    // 3. Verify access token with cookie fallback if header candidate fails
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (req.cookies && req.cookies.access_token && req.cookies.access_token !== token) {
        try {
          decoded = verifyAccessToken(req.cookies.access_token);
          token = req.cookies.access_token;
        } catch (cookieErr) {
          if (err.name === 'TokenExpiredError') {
            throw new AppError('Access token has expired. Please refresh your session or login again', HTTP_STATUS.UNAUTHORIZED);
          }
          throw new AppError('Invalid access token', HTTP_STATUS.UNAUTHORIZED);
        }
      } else {
        if (err.name === 'TokenExpiredError') {
          throw new AppError('Access token has expired. Please refresh your session or login again', HTTP_STATUS.UNAUTHORIZED);
        }
        throw new AppError('Invalid access token', HTTP_STATUS.UNAUTHORIZED);
      }
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

    let resolved_branch_id = decoded.branch_id || user.room_info?.branch_id || null;
    if (!resolved_branch_id && resolved_pg_id) {
      if (user.role === ROLES.RESIDENT) {
        const stay = await db('resident_pg_stays').where({ resident_id: user.id, status: 'active' }).whereNull('deleted_at').orderBy('id', 'desc').first();
        if (stay?.branch_id) resolved_branch_id = stay.branch_id;
      } else if (user.role === ROLES.ADMIN) {
        const branch = await db('branches').where({ pg_id: resolved_pg_id }).whereNull('deleted_at').orderBy('id', 'asc').first();
        if (branch) resolved_branch_id = branch.id;
      }
    }

    req.user = user;
    req.pg_id = resolved_pg_id;
    req.branch_id = resolved_branch_id;
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
