import { Server } from 'socket.io';
import config from '../config/index.js';
import { verifyAccessToken } from '../utils/jwt.js';
import db from '../config/db.js';
import { ROLES } from '../constants/index.js';

/**
 * Complete Real-Time WebSocket Event Catalog
 * Standardized event constants for bidirectional client-server communication.
 */
export const SOCKET_EVENTS = {
  // ==========================================================================
  // 1. General & Notifications
  // ==========================================================================
  /** Triggered when an automated notification/alert is delivered to an individual user */
  NOTIFICATION_NEW: 'notification:new',

  // ==========================================================================
  // 2. Notices & Announcements
  // ==========================================================================
  /** Triggered when a new notice is published (broadcast to all residents, branch, or individual) */
  NOTICE_NEW: 'notice:new',
  /** Triggered on notice creation, update, or deletion to refresh notice KPI stats */
  NOTICE_STATS_UPDATED: 'notice:stats_updated',

  // ==========================================================================
  // 3. Maintenance & Complaints
  // ==========================================================================
  /** Triggered when a resident files a new complaint or when assigned to staff */
  COMPLAINT_NEW: 'complaint:new',
  /** Triggered when complaint status changes (pending -> in_progress -> resolved / rejected) */
  COMPLAINT_STATUS_UPDATED: 'complaint:status_updated',
  /** Triggered on staff assignment or scheduling updates on a complaint */
  COMPLAINT_ACTIVITY: 'complaint:activity',
  /** Triggered to refresh complaint metrics and KPI status cards */
  COMPLAINT_STATS_UPDATED: 'complaint:stats_updated',

  // ==========================================================================
  // 4. Visitors & Gate Access
  // ==========================================================================
  /** Triggered when a visitor pass is requested or registered */
  VISITOR_NEW: 'visitor:new',
  /** Triggered when visitor request is approved, rejected, or updated */
  VISITOR_STATUS_UPDATED: 'visitor:status_updated',
  /** Triggered when visitor checks in / enters the gate or checks out */
  VISITOR_ENTRY: 'visitor:entry',
  /** Triggered to refresh visitor KPI metrics (today visitors, currently inside, etc.) */
  VISITOR_STATS_UPDATED: 'visitor:stats_updated',

  // ==========================================================================
  // 5. Community Feed & Social Hub
  // ==========================================================================
  /** Broadcast to all property members when a resident or staff posts in community */
  COMMUNITY_POST_NEW: 'community:post_new',
  /** Broadcast when a community post is liked/unliked (live counter update) */
  COMMUNITY_POST_LIKED: 'community:post_liked',
  /** Dispatched to post thread subscribers when a new comment is posted */
  COMMUNITY_COMMENT_NEW: 'community:comment_new',
  /** Broadcast when a community event announcement or RSVP is updated */
  COMMUNITY_EVENT_UPDATED: 'community:event_updated',

  // ==========================================================================
  // 6. Rooms & Inventory
  // ==========================================================================
  /** Triggered when a new room is added to inventory */
  ROOM_NEW: 'room:new',
  /** Triggered when room details, capacity, or status change */
  ROOM_UPDATED: 'room:updated',
  /** Triggered when a room is soft-deleted from inventory */
  ROOM_DELETED: 'room:deleted',
  /** Triggered to refresh room inventory and occupancy KPI stats */
  ROOM_STATS_UPDATED: 'room:stats_updated',

  // ==========================================================================
  // 7. Room Shift Requests
  // ==========================================================================
  /** Triggered when a resident or admin submits a room shift request */
  ROOM_SHIFT_NEW: 'room_shift:new',
  /** Triggered when a room shift request is approved, rejected, or reviewed */
  ROOM_SHIFT_STATUS_UPDATED: 'room_shift:status_updated',
  /** Triggered to refresh room shift request metrics */
  ROOM_SHIFT_STATS_UPDATED: 'room_shift:stats_updated',

  // ==========================================================================
  // 8. Payments & Finance
  // ==========================================================================
  /** Triggered when a new invoice, fee, or onboarding demand is generated */
  PAYMENT_NEW: 'payment:new',
  /** Triggered when a payment is marked paid, verified, or receipt uploaded */
  PAYMENT_STATUS_UPDATED: 'payment:status_updated',
  /** Triggered to refresh payment/collection KPIs, dues, and revenue stats */
  PAYMENT_STATS_UPDATED: 'payment:stats_updated',

  // ==========================================================================
  // 9. Residents & Staff (Users)
  // ==========================================================================
  /** Triggered when a new user (resident or staff) is registered or onboarded */
  USER_NEW: 'user:new',
  /** Triggered when profile, room allocation, or user details change */
  USER_UPDATED: 'user:updated',
  /** Triggered when user active/inactive status changes */
  USER_STATUS_UPDATED: 'user:status_updated',
  /** Triggered to refresh resident counts, onboarding, and occupancy metrics */
  RESIDENT_STATS_UPDATED: 'resident:stats_updated',
  /** Triggered to refresh staff counts, roles, and branch staff metrics */
  STAFF_STATS_UPDATED: 'staff:stats_updated',

  // ==========================================================================
  // 10. Branches / Properties
  // ==========================================================================
  /** Triggered when a new branch/facility is created */
  BRANCH_NEW: 'branch:new',
  /** Triggered when branch details change */
  BRANCH_UPDATED: 'branch:updated',
  /** Triggered when a branch is soft-deleted */
  BRANCH_DELETED: 'branch:deleted',
  /** Triggered to refresh branch total rooms, occupied rooms, and occupancy rate */
  BRANCH_STATS_UPDATED: 'branch:stats_updated',

  // ==========================================================================
  // 11. Buildings & Floors
  // ==========================================================================
  /** Triggered when a new building is registered */
  BUILDING_NEW: 'building:new',
  /** Triggered when building details change */
  BUILDING_UPDATED: 'building:updated',
  /** Triggered when a building is soft-deleted */
  BUILDING_DELETED: 'building:deleted',
  /** Triggered to refresh building count and floor distribution metrics */
  BUILDING_STATS_UPDATED: 'building:stats_updated',

  // ==========================================================================
  // 12. Laundry Management
  // ==========================================================================
  /** Triggered when a resident submits a laundry pickup request */
  LAUNDRY_NEW: 'laundry:new',
  /** Triggered when laundry status updates (in_progress, ready, delivered) */
  LAUNDRY_STATUS_UPDATED: 'laundry:status_updated',
  /** Triggered to refresh laundry operational status and metrics */
  LAUNDRY_STATS_UPDATED: 'laundry:stats_updated',

  // ==========================================================================
  // 13. Subscription Plans
  // ==========================================================================
  /** Triggered when subscriptions are purchased or renewed to refresh subscriber counts */
  SUBSCRIPTION_STATS_UPDATED: 'subscription:stats_updated',

  // ==========================================================================
  // 14. Room Shift & Checkout Requests
  // ==========================================================================
  /** Triggered when a resident requests checkout/departure clearance */
  CHECKOUT_NEW: 'checkout:new',
  /** Triggered when checkout request is approved, rejected, or completed */
  CHECKOUT_STATUS_UPDATED: 'checkout:status_updated',
  /** Triggered to refresh checkout clearance stats */
  CHECKOUT_STATS_UPDATED: 'checkout:stats_updated',

  // ==========================================================================
  // 15. Operations Dashboard Live Refresh
  // ==========================================================================
  /** Broadcast across property to refresh top-level KPI cards and charts on operations dashboard */
  DASHBOARD_STATS_UPDATED: 'dashboard:stats_updated',

  // ==========================================================================
  // 16. Inbound Client-to-Server Subscription Events
  // ==========================================================================
  /** Client requests to join live discussion updates for a specific community post */
  SUBSCRIBE_POST: 'subscribe:post',
  /** Client requests to leave live discussion updates for a community post */
  UNSUBSCRIBE_POST: 'unsubscribe:post',
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

  /**
   * Helper: Emit stats update event for a specific module to PG Admins and PG Room
   *
   * @param {number|string} pgId
   * @param {string} event
   * @param {Object} [payload]
   */
  emitStatsUpdated = (pgId, event, payload = {}) => {
    if (!this.io || !event) return;
    try {
      const data = {
        pg_id: pgId ? Number(pgId) : null,
        timestamp: new Date().toISOString(),
        ...payload,
      };
      this.emitToPgAdmins(pgId, event, data);
      if (pgId) {
        this.emitToPg(pgId, event, data);
      }
    } catch (err) {
      console.warn(`[Socket Warning] emitStatsUpdated failed:`, err.message);
    }
  };
}

export default new SocketService();

