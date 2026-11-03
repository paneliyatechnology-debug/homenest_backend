import { Server } from 'socket.io';
import config from '../config/index.js';
import { verifyAccessToken } from '../utils/jwt.js';
import db from '../config/db.js';
import { ROLES } from '../constants/index.js';

/**
 * Standard Real-Time Socket Event Names
 */
export const SOCKET_EVENTS = {
  // General & Notifications
  NOTIFICATION_NEW: 'notification:new',

  // Notices & Announcements
  NOTICE_NEW: 'notice:new',

  // Complaints & Maintenance
  COMPLAINT_NEW: 'complaint:new',
  COMPLAINT_STATUS_UPDATED: 'complaint:status_updated',
  COMPLAINT_ACTIVITY: 'complaint:activity',

  // Visitors & Gate Access
  VISITOR_NEW: 'visitor:new',
  VISITOR_STATUS_UPDATED: 'visitor:status_updated',
  VISITOR_ENTRY: 'visitor:entry',

  // Community Feed & Social
  COMMUNITY_POST_NEW: 'community:post_new',
  COMMUNITY_POST_LIKED: 'community:post_liked',
  COMMUNITY_COMMENT_NEW: 'community:comment_new',
  COMMUNITY_EVENT_UPDATED: 'community:event_updated',

  // Room Shift & Checkout Requests
  ROOM_SHIFT_NEW: 'room_shift:new',
  ROOM_SHIFT_STATUS_UPDATED: 'room_shift:status_updated',
  CHECKOUT_NEW: 'checkout:new',
  CHECKOUT_STATUS_UPDATED: 'checkout:status_updated',

  // Operations Dashboard Live Refresh
  DASHBOARD_STATS_UPDATED: 'dashboard:stats_updated',
};

class SocketService {
  constructor() {
    this.io = null;
  }

  /**
   * Initialize Socket.IO with HTTP Server
   * Configures authentication, tenant rooms, and error handling.
   *
   * @param {import('http').Server} httpServer
   * @returns {Server} Socket.IO instance
   */
  init = (httpServer) => {
    this.io = new Server(httpServer, {
      cors: {
        origin: config.cors.origin,
        credentials: true,
      },
      pingTimeout: 30000,
      pingInterval: 25000,
    });

    // Authentication Middleware: Verifies JWT token on handshake
    this.io.use(async (socket, next) => {
      try {
        let token = null;

        // 1. From handshake auth object
        if (socket.handshake.auth && socket.handshake.auth.token) {
          token = socket.handshake.auth.token;
        }

        // 2. From Authorization header
        if (!token && socket.handshake.headers && socket.handshake.headers.authorization) {
          const authHeader = socket.handshake.headers.authorization;
          if (authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7).trim();
          } else {
            token = authHeader.trim();
          }
        }

        if (!token || token === 'undefined' || token === 'null') {
          return next(new Error('Authentication error: Access token missing'));
        }

        // Clean quotes or template artifacts if passed by clients
        token = token.replace(/^"(.*)"$/, '$1');

        const decoded = verifyAccessToken(token);
        if (!decoded || !decoded.id) {
          return next(new Error('Authentication error: Invalid access token'));
        }

        // Fetch user from DB
        const user = await db('users')
          .where({ id: decoded.id })
          .whereNull('deleted_at')
          .first();

        if (!user || user.status === 'inactive') {
          return next(new Error('Authentication error: User not found or inactive'));
        }

        // Resolve user's PG and Branch scoping
        let pgId = user.pg_id || null;
        let branchId = user.branch_id || null;

        if (user.role === ROLES.RESIDENT) {
          const activeStay = await db('resident_pg_stays')
            .where({ resident_id: user.id, status: 'active' })
            .whereNull('deleted_at')
            .first();

          if (activeStay) {
            pgId = activeStay.pg_id;
            branchId = activeStay.branch_id;
          }
        } else if (user.role === ROLES.ADMIN) {
          let pg = await db('pgs').where({ owner_id: user.id }).whereNull('deleted_at').first();
          if (pg) pgId = pg.id;
        }

        // Attach user and property context to socket
        socket.user = {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          pg_id: pgId ? Number(pgId) : null,
          branch_id: branchId ? Number(branchId) : null,
        };

        return next();
      } catch (err) {
        return next(new Error(`Authentication error: ${err.message}`));
      }
    });

    // Connection Handler
    this.io.on('connection', (socket) => {
      const user = socket.user;
      if (!user) return;

      // Automatically join user-specific room for private alerts
      socket.join(`user:${user.id}`);

      // Automatically join role-specific room (e.g. role:admin, role:resident)
      socket.join(`role:${user.role}`);

      // Automatically join PG property room
      if (user.pg_id) {
        socket.join(`pg:${user.pg_id}`);
      }

      // Automatically join branch room
      if (user.branch_id) {
        socket.join(`branch:${user.branch_id}`);
      }

      if (config.env === 'development') {
        console.log(`[Socket] Connected: user=${user.email} (id=${user.id}, role=${user.role}) socket_id=${socket.id}`);
      }

      // Allow client to subscribe to a specific post comments/activity thread
      socket.on('subscribe:post', (postId) => {
        if (postId) {
          socket.join(`post:${postId}`);
        }
      });

      socket.on('unsubscribe:post', (postId) => {
        if (postId) {
          socket.leave(`post:${postId}`);
        }
      });

      // Disconnect listener
      socket.on('disconnect', (reason) => {
        if (config.env === 'development') {
          console.log(`[Socket] Disconnected: user=${user.email} reason=${reason}`);
        }
      });
    });

    return this.io;
  };

  /**
   * Get Socket.IO instance
   * @returns {Server|null}
   */
  getIO = () => this.io;

  /**
   * Emit event to an individual user (e.g. personal notification, complaint status, visitor arrival)
   *
   * @param {number|string} userId
   * @param {string} event
   * @param {Object} payload
   */
  emitToUser = (userId, event, payload) => {
    if (!this.io || !userId) return;
    try {
      this.io.to(`user:${userId}`).emit(event, payload);
    } catch (err) {
      console.warn(`[Socket Warning] emitToUser failed:`, err.message);
    }
  };

  /**
   * Emit event to all connected users within a PG property (e.g. notices, community posts)
   *
   * @param {number|string} pgId
   * @param {string} event
   * @param {Object} payload
   */
  emitToPg = (pgId, event, payload) => {
    if (!this.io || !pgId) return;
    try {
      this.io.to(`pg:${pgId}`).emit(event, payload);
    } catch (err) {
      console.warn(`[Socket Warning] emitToPg failed:`, err.message);
    }
  };

  /**
   * Emit event to all users within a specific Branch
   *
   * @param {number|string} branchId
   * @param {string} event
   * @param {Object} payload
   */
  emitToBranch = (branchId, event, payload) => {
    if (!this.io || !branchId) return;
    try {
      this.io.to(`branch:${branchId}`).emit(event, payload);
    } catch (err) {
      console.warn(`[Socket Warning] emitToBranch failed:`, err.message);
    }
  };

  /**
   * Emit event to users with a specific role (e.g. 'admin', 'resident')
   *
   * @param {string} role
   * @param {string} event
   * @param {Object} payload
   */
  emitToRole = (role, event, payload) => {
    if (!this.io || !role) return;
    try {
      this.io.to(`role:${role}`).emit(event, payload);
    } catch (err) {
      console.warn(`[Socket Warning] emitToRole failed:`, err.message);
    }
  };

  /**
   * Emit event to admins/super admins of a specific PG property
   *
   * @param {number|string} pgId
   * @param {string} event
   * @param {Object} payload
   */
  emitToPgAdmins = (pgId, event, payload) => {
    if (!this.io) return;
    try {
      if (pgId) {
        this.io.to(`pg:${pgId}`).to(`role:${ROLES.ADMIN}`).to(`role:${ROLES.SUPER_ADMIN}`).emit(event, payload);
      } else {
        this.io.to(`role:${ROLES.ADMIN}`).to(`role:${ROLES.SUPER_ADMIN}`).emit(event, payload);
      }
    } catch (err) {
      console.warn(`[Socket Warning] emitToPgAdmins failed:`, err.message);
    }
  };

  /**
   * Emit event to all subscribers of a specific community post thread
   *
   * @param {number|string} postId
   * @param {string} event
   * @param {Object} payload
   */
  emitToPost = (postId, event, payload) => {
    if (!this.io || !postId) return;
    try {
      this.io.to(`post:${postId}`).emit(event, payload);
    } catch (err) {
      console.warn(`[Socket Warning] emitToPost failed:`, err.message);
    }
  };

  /**
   * Broadcast event globally to all connected clients
   *
   * @param {string} event
   * @param {Object} payload
   */
  emitToAll = (event, payload) => {
    if (!this.io) return;
    try {
      this.io.emit(event, payload);
    } catch (err) {
      console.warn(`[Socket Warning] emitToAll failed:`, err.message);
    }
  };
}

export default new SocketService();

