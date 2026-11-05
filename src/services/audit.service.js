import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import moment from 'moment';
import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES, AUDIT_MODULES, AUDIT_ACTIONS } from '../constants/index.js';
import { buildFileUrl } from '../utils/url.js';

/**
 * Friendly Module Names matching HomeNest UI design
 */
const MODULE_DISPLAY_MAP = {
  AUTH: 'Authentication',
  USER: 'Residents',
  RESIDENT: 'Residents',
  STAFF: 'Staff Management',
  ROOM: 'Rooms',
  STAY: 'Stays & Checkout',
  PAYMENT: 'Payments',
  COMPLAINT: 'Complaints',
  VISITOR: 'Visitors',
  NOTICE: 'Notices',
  BRANCH: 'Branch Management',
  BUILDING: 'Buildings',
  FLOOR: 'Floors',
  AGREEMENT: 'Agreements',
  COMMUNITY: 'Community',
  LAUNDRY: 'Laundry',
};

/**
 * Service managing System Audit Logs & Administrative Activity Trail
 * Provides multi-branch & PG scoping, UI-matching table format, KPI metrics, and Excel export.
 */
class AuditService {
  /**
   * Helper: Resolve Admin PG context
   * @param {Object} user
   * @returns {Promise<Object>} PG record
   */
  resolveAdminPg = async (user) => {
    if (user.role === ROLES.ADMIN) {
      const pg = await db('pgs').where({ owner_id: user.id }).whereNull('deleted_at').first();
      if (!pg) {
        throw new AppError('No active PG property found under your account', HTTP_STATUS.FORBIDDEN);
      }
      return pg;
    }

    if (user.role === ROLES.RESIDENT) {
      const stay = await db('resident_pg_stays')
        .where({ resident_id: user.id, status: 'active' })
        .whereNull('deleted_at')
        .orderBy('id', 'desc')
        .first();

      if (!stay || !stay.pg_id) {
        throw new AppError('No active PG stay found for resident', HTTP_STATUS.FORBIDDEN);
      }

      return { id: stay.pg_id, branch_id: stay.branch_id };
    }

    return null;
  };

  /**
   * Safe asynchronous audit logger
   * Catches all exceptions so audit logging failures never break primary workflows.
   */
  log = async ({
    pg_id = null,
    branch_id = null,
    user_id = null,
    user_name = null,
    user_role = null,
    module,
    action,
    entity_type = null,
    entity_id = null,
    description = null,
    old_values = null,
    new_values = null,
    metadata = null,
    ip_address = null,
    user_agent = null,
    req = null,
  }) => {
    try {
      let resolvedPgId = pg_id;
      let resolvedBranchId = branch_id;
      let resolvedUserId = user_id;
      let resolvedUserName = user_name;
      let resolvedUserRole = user_role;
      let resolvedIp = ip_address;
      let resolvedUa = user_agent;

      // Automatically extract contextual information from Express request if provided
      if (req) {
        if (!resolvedIp) {
          resolvedIp = (
            req.headers['x-forwarded-for'] ||
            req.ip ||
            req.socket?.remoteAddress ||
            ''
          ).split(',')[0].trim();
        }
        if (!resolvedUa) {
          resolvedUa = (req.headers['user-agent'] || '').slice(0, 255);
        }

        if (req.user) {
          if (!resolvedUserId) resolvedUserId = req.user.id;
          if (!resolvedUserName) resolvedUserName = req.user.name;
          if (!resolvedUserRole) resolvedUserRole = req.user.role;
        }

        if (!resolvedPgId) {
          resolvedPgId = req.pg_id || req.user?.pg_id || req.user?.pg?.id || null;
        }

        if (!resolvedBranchId) {
          resolvedBranchId = req.branch_id || req.user?.branch_id || req.body?.branch_id || req.query?.branch_id || null;
        }
      }

      // If pg_id is still missing but branch_id is known, resolve pg_id from branches table
      if (!resolvedPgId && resolvedBranchId) {
        const branch = await db('branches').where({ id: resolvedBranchId }).first();
        if (branch) resolvedPgId = branch.pg_id;
      }

      // If pg_id is still missing and actor is Admin, resolve via owned PG
      if (!resolvedPgId && resolvedUserId) {
        const pg = await db('pgs').where({ owner_id: resolvedUserId }).whereNull('deleted_at').first();
        if (pg) resolvedPgId = pg.id;
      }

      // If pg_id still could not be determined, fallback to first active PG (safe fallback)
      if (!resolvedPgId) {
        const firstPg = await db('pgs').whereNull('deleted_at').first();
        if (firstPg) resolvedPgId = firstPg.id;
      }

      if (!resolvedPgId) {
        console.warn('[AuditService] Skipping audit log: pg_id could not be resolved');
        return null;
      }

      // Format JSON values safely
      const safeOldValues = old_values ? (typeof old_values === 'object' ? JSON.stringify(old_values) : old_values) : null;
      const safeNewValues = new_values ? (typeof new_values === 'object' ? JSON.stringify(new_values) : new_values) : null;
      const safeMetadata = metadata ? (typeof metadata === 'object' ? JSON.stringify(metadata) : metadata) : null;

      const [insertId] = await db('audit_logs').insert({
        pg_id: resolvedPgId,
        branch_id: resolvedBranchId ? Number(resolvedBranchId) : null,
        user_id: resolvedUserId ? Number(resolvedUserId) : null,
        user_name: resolvedUserName ? String(resolvedUserName).slice(0, 150) : null,
        user_role: resolvedUserRole ? String(resolvedUserRole).slice(0, 50) : null,
        module: String(module || 'SYSTEM').toUpperCase(),
        action: String(action || 'ACTION').toUpperCase(),
        entity_type: entity_type ? String(entity_type).toLowerCase() : null,
        entity_id: entity_id !== null && entity_id !== undefined ? String(entity_id).slice(0, 100) : null,
        description: description || `${action} on ${entity_type || 'system'}`,
        old_values: safeOldValues,
        new_values: safeNewValues,
        metadata: safeMetadata,
        ip_address: resolvedIp ? resolvedIp.slice(0, 45) : null,
        user_agent: resolvedUa ? resolvedUa.slice(0, 255) : null,
        created_at: db.fn.now(),
      });

      return insertId;
    } catch (err) {
      console.error('[AuditService.log] Failed to write audit log entry:', err.message);
      return null;
    }
  };

  /**
   * Helper: Parse JSON field safely
   */
  parseJsonField = (val) => {
    if (!val) return null;
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  };

  /**
   * Normalize input module name from UI dropdown to system module constant
   */
  normalizeModuleInput = (mod) => {
    if (!mod || mod === 'all' || mod === 'All') return null;
    const lower = String(mod).toLowerCase().trim();
    if (lower.includes('resident') || lower === 'user') return 'USER';
    if (lower.includes('staff')) return 'USER';
    if (lower.includes('room')) return 'ROOM';
    if (lower.includes('stay') || lower.includes('checkout')) return 'STAY';
    if (lower.includes('pay') || lower.includes('bill') || lower.includes('invoice')) return 'PAYMENT';
    if (lower.includes('complaint')) return 'COMPLAINT';
    if (lower.includes('visitor')) return 'VISITOR';
    if (lower.includes('notice')) return 'NOTICE';
    if (lower.includes('branch')) return 'BRANCH';
    if (lower.includes('building')) return 'BUILDING';
    if (lower.includes('floor')) return 'FLOOR';
    if (lower.includes('agreement')) return 'AGREEMENT';
    if (lower.includes('laundry')) return 'LAUNDRY';
    if (lower.includes('auth')) return 'AUTH';
    return String(mod).trim().toUpperCase();
  };

  /**
   * Normalize input action name from UI dropdown to system action constant
   */
  normalizeActionInput = (act) => {
    if (!act || act === 'all' || act === 'All') return null;
    const lower = String(act).toLowerCase().trim();
    if (lower.includes('create')) return 'CREATE';
    if (lower.includes('update')) return 'UPDATE';
    if (lower.includes('delete') || lower.includes('remove')) return 'DELETE';
    if (lower.includes('login')) return 'LOGIN';
    if (lower.includes('logout')) return 'LOGOUT';
    if (lower.includes('status')) return 'STATUS_CHANGE';
    if (lower.includes('assign')) return 'ASSIGN';
    if (lower.includes('approve')) return 'APPROVE';
    if (lower.includes('reject')) return 'REJECT';
    if (lower.includes('gate') && lower.includes('entry')) return 'GATE_ENTRY';
    if (lower.includes('gate') && lower.includes('exit')) return 'GATE_EXIT';
    if (lower.includes('payment')) return 'PAYMENT_RECORD';
    if (lower.includes('checkout')) return 'CHECK_OUT';
    return String(act).trim().toUpperCase();
  };

  /**
   * Parse flexible date range strings e.g. "01 mar 2026 - 31 mar 2026"
   */
  parseDateRange = (startDate, endDate, dateRangeStr) => {
    let effectiveStart = startDate || null;
    let effectiveEnd = endDate || null;

    if (dateRangeStr && (!effectiveStart || !effectiveEnd)) {
      const parts = String(dateRangeStr).split(/[-–—to]/i).map((s) => s.trim());
      if (parts.length >= 2) {
        const parsedStart = moment(parts[0], ['DD MMM YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM/DD/YYYY']);
        const parsedEnd = moment(parts[1], ['DD MMM YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM/DD/YYYY']);
        if (parsedStart.isValid()) effectiveStart = parsedStart.format('YYYY-MM-DD');
        if (parsedEnd.isValid()) effectiveEnd = parsedEnd.format('YYYY-MM-DD');
      }
    }

    return { effectiveStart, effectiveEnd };
  };

  /**
   * Format single audit log for API response matching the Administrative Activity Log UI:
   * Columns: [Sr no.] [User] [Action] [Module] [Details] [Timestamp] [IP address] [Action]
   */
  formatAuditItem = (item, index = 0, page = 1, limit = 10) => {
    if (!item) return null;

    const sr_no = (page - 1) * limit + (index + 1);
    const formattedTimestamp = item.created_at
      ? moment(item.created_at).format('DD MMM YYYY, hh:mm A')
      : '-';

    const rawModule = String(item.module || 'SYSTEM').toUpperCase();
    const rawAction = String(item.action || 'ACTION').toUpperCase();

    // Map system module code to friendly title case shown in UI (e.g. "Residents")
    const moduleLabel = MODULE_DISPLAY_MAP[rawModule] || (rawModule.charAt(0) + rawModule.slice(1).toLowerCase());

    // Generate readable action description
    let actionLabel = item.action;
    if (rawAction === 'CREATE') {
      actionLabel = item.entity_type === 'resident' || item.entity_type === 'user' ? 'Create resident profile' : `Create ${item.entity_type || 'record'}`;
    } else if (rawAction === 'UPDATE') {
      actionLabel = item.entity_type === 'resident' || item.entity_type === 'user' ? 'Update resident profile' : `Update ${item.entity_type || 'record'}`;
    } else if (rawAction === 'DELETE') {
      actionLabel = item.entity_type === 'resident' || item.entity_type === 'user' ? 'Delete resident profile' : `Delete ${item.entity_type || 'record'}`;
    } else if (rawAction === 'LOGIN') {
      actionLabel = 'User login';
    } else if (rawAction === 'LOGOUT') {
      actionLabel = 'User logout';
    } else if (rawAction === 'STATUS_CHANGE') {
      actionLabel = 'Update status';
    } else if (rawAction === 'ASSIGN') {
      actionLabel = 'Assign complaint';
    } else if (rawAction === 'APPROVE') {
      actionLabel = 'Approve request';
    } else if (rawAction === 'REJECT') {
      actionLabel = 'Reject request';
    } else if (rawAction === 'GATE_ENTRY') {
      actionLabel = 'Gate entry scan';
    } else if (rawAction === 'GATE_EXIT') {
      actionLabel = 'Gate exit scan';
    } else if (rawAction === 'PAYMENT_RECORD') {
      actionLabel = 'Record payment';
    } else if (rawAction === 'CHECK_OUT') {
      actionLabel = 'Check out resident';
    } else if (rawAction === 'CHECKOUT_REQUEST') {
      actionLabel = 'Submit checkout request';
    } else if (rawAction === 'SEND') {
      actionLabel = 'Broadcast notice';
    }

    const userName = item.user_name || item.actor_name || 'System';
    const details = item.description || `${actionLabel} on ${moduleLabel}`;

    return {
      id: item.id,
      sr_no,

      // Directly accessible column fields matching table columns in UI
      user: userName,
      user_name: userName,
      action: actionLabel,
      action_code: rawAction,
      module: moduleLabel,
      module_code: rawModule,
      details: details,
      description: details,
      timestamp: formattedTimestamp,
      created_at_formatted: formattedTimestamp,
      created_at: item.created_at,
      ip_address: item.ip_address || '-',

      // Rich metadata
      user_details: {
        id: item.user_id || null,
        name: userName,
        role: item.user_role || item.actor_role || 'system',
        profile_photo_url: item.user_profile_photo ? buildFileUrl('users', item.user_profile_photo) : null,
      },
      entity_type: item.entity_type || null,
      entity_id: item.entity_id || null,
      branch_id: item.branch_id || null,
      branch_name: item.branch_name || 'All Branches / Head Office',
      pg_id: item.pg_id,
      pg_name: item.pg_name || null,
      user_agent: item.user_agent || null,
      old_values: this.parseJsonField(item.old_values),
      new_values: this.parseJsonField(item.new_values),
      metadata: this.parseJsonField(item.metadata),
    };
  };

  /**
   * Helper: Build query filter constraints
   */
  buildFilterConstraints = (qb, effectivePgId, query = {}) => {
    const {
      branch_id,
      module,
      action,
      user_id,
      user: userFilter,
      start_date,
      end_date,
      date_range,
      search,
    } = query;

    if (effectivePgId) {
      qb.where('audit_logs.pg_id', effectivePgId);
    }

    if (branch_id && branch_id !== 'all') {
      qb.where('audit_logs.branch_id', Number(branch_id));
    }

    const normalizedModule = this.normalizeModuleInput(module);
    if (normalizedModule) {
      qb.where('audit_logs.module', normalizedModule);
    }

    const normalizedAction = this.normalizeActionInput(action);
    if (normalizedAction) {
      qb.where('audit_logs.action', normalizedAction);
    }

    if (user_id) {
      qb.where('audit_logs.user_id', Number(user_id));
    } else if (userFilter && userFilter !== 'all' && userFilter !== 'All') {
      if (Number.isInteger(Number(userFilter))) {
        qb.where('audit_logs.user_id', Number(userFilter));
      } else {
        const pattern = `%${userFilter.trim()}%`;
        qb.where((builder) => {
          builder.where('audit_logs.user_name', 'like', pattern).orWhere('actor.name', 'like', pattern);
        });
      }
    }

    const { effectiveStart, effectiveEnd } = this.parseDateRange(start_date, end_date, date_range);

    if (effectiveStart) {
      qb.where('audit_logs.created_at', '>=', moment(effectiveStart).startOf('day').toDate());
    }

    if (effectiveEnd) {
      qb.where('audit_logs.created_at', '<=', moment(effectiveEnd).endOf('day').toDate());
    }

    if (search) {
      const pattern = `%${search.trim()}%`;
      qb.where((search_builder) => {
        search_builder
          .where('audit_logs.description', 'like', pattern)
          .orWhere('audit_logs.user_name', 'like', pattern)
          .orWhere('audit_logs.entity_id', 'like', pattern)
          .orWhere('audit_logs.action', 'like', pattern)
          .orWhere('audit_logs.module', 'like', pattern)
          .orWhere('audit_logs.ip_address', 'like', pattern)
          .orWhere('branches.name', 'like', pattern)
          .orWhere('actor.name', 'like', pattern);
      });
    }
  };

  /**
   * List paginated audit logs with multi-dimensional filtering
   * Supports: branch_id, pg_id, module, action, user_id, user, start_date, end_date, date_range, search, page, limit
   *
   * @param {Object} user - Authenticated user context
   * @param {Object} query - Filter parameters
   * @returns {Promise<{ audits: Object[], pagination: Object }>}
   */
  findAll = async (user, query = {}) => {
    const is_admin = user.role === ROLES.ADMIN;
    let effectivePgId = query.pg_id ? Number(query.pg_id) : undefined;

    if (is_admin) {
      const pg = await this.resolveAdminPg(user);
      effectivePgId = pg.id;
    }

    const { page = 1, limit = 10 } = query;
    const current_page = Math.max(1, parseInt(page, 10) || 1);
    const per_page = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (current_page - 1) * per_page;

    const base_query = db('audit_logs')
      .leftJoin('branches', 'audit_logs.branch_id', 'branches.id')
      .leftJoin('pgs', 'audit_logs.pg_id', 'pgs.id')
      .leftJoin('users as actor', 'audit_logs.user_id', 'actor.id');

    this.buildFilterConstraints(base_query, effectivePgId, query);

    const count_query = db('audit_logs')
      .leftJoin('branches', 'audit_logs.branch_id', 'branches.id')
      .leftJoin('pgs', 'audit_logs.pg_id', 'pgs.id')
      .leftJoin('users as actor', 'audit_logs.user_id', 'actor.id');

    this.buildFilterConstraints(count_query, effectivePgId, query);

    const [raw_items, [count_row]] = await Promise.all([
      base_query
        .select(
          'audit_logs.*',
          'branches.name as branch_name',
          'pgs.name as pg_name',
          'actor.name as actor_name',
          'actor.role as actor_role',
          'actor.profile_photo as user_profile_photo'
        )
        .orderBy('audit_logs.created_at', 'desc')
        .limit(per_page)
        .offset(offset),
      count_query.count('audit_logs.id as total'),
    ]);

    const total = count_row ? parseInt(count_row.total, 10) : 0;
    const audits = raw_items.map((item, index) =>
      this.formatAuditItem(item, index, current_page, per_page)
    );

    const fromRecord = total > 0 ? offset + 1 : 0;
    const toRecord = Math.min(offset + per_page, total);

    return {
      audits,
      pagination: {
        total,
        total_records: total,
        page: current_page,
        limit: per_page,
        total_pages: Math.ceil(total / per_page) || 1,
        from: fromRecord,
        to: toRecord,
        showing: `Showing ${fromRecord}-${toRecord} of ${total}`,
      },
    };
  };

  /**
   * Get single audit record by primary ID with full before/after state
   */
  findById = async (id, user) => {
    const is_admin = user.role === ROLES.ADMIN;
    let effectivePgId = null;

    if (is_admin) {
      const pg = await this.resolveAdminPg(user);
      effectivePgId = pg.id;
    }

    const query = db('audit_logs')
      .leftJoin('branches', 'audit_logs.branch_id', 'branches.id')
      .leftJoin('pgs', 'audit_logs.pg_id', 'pgs.id')
      .leftJoin('users as actor', 'audit_logs.user_id', 'actor.id')
      .where('audit_logs.id', id);

    if (effectivePgId) {
      query.where('audit_logs.pg_id', effectivePgId);
    }

    const item = await query
      .select(
        'audit_logs.*',
        'branches.name as branch_name',
        'pgs.name as pg_name',
        'actor.name as actor_name',
        'actor.role as actor_role',
        'actor.profile_photo as user_profile_photo'
      )
      .first();

    if (!item) {
      throw new AppError('Audit log record not found', HTTP_STATUS.NOT_FOUND);
    }

    return this.formatAuditItem(item);
  };

  /**
   * Get KPI statistics and metrics for Audit Dashboard
   * Accurately powers the 4 cards shown in the UI:
   * [Total Activities] [Today] [Last 7 Days] [Last 30 Days]
   *
   * @param {Object} user - Authenticated user context
   * @param {Object} query - Filter parameters (branch_id, start_date, end_date, date_range)
   * @returns {Promise<Object>} KPI statistics dataset
   */
  getStats = async (user, query = {}) => {
    const is_admin = user.role === ROLES.ADMIN;
    let effectivePgId = query.pg_id ? Number(query.pg_id) : undefined;

    if (is_admin) {
      const pg = await this.resolveAdminPg(user);
      effectivePgId = pg.id;
    }

    const { branch_id, start_date, end_date, date_range } = query;
    const { effectiveStart, effectiveEnd } = this.parseDateRange(start_date, end_date, date_range);

    const base = db('audit_logs');
    if (effectivePgId) base.where('audit_logs.pg_id', effectivePgId);
    if (branch_id && branch_id !== 'all') base.where('audit_logs.branch_id', Number(branch_id));
    if (effectiveStart) base.where('audit_logs.created_at', '>=', moment(effectiveStart).startOf('day').toDate());
    if (effectiveEnd) base.where('audit_logs.created_at', '<=', moment(effectiveEnd).endOf('day').toDate());

    const todayStart = moment().startOf('day').toDate();
    const sevenDaysAgo = moment().subtract(7, 'days').startOf('day').toDate();
    const thirtyDaysAgo = moment().subtract(30, 'days').startOf('day').toDate();

    // 1. Exactly calculate the 4 cards from the screenshot:
    // [Total Activities] [Today] [Last 7 Days] [Last 30 Days]
    const counts = await base.clone()
      .select(
        db.raw('COUNT(id) as total_activities'),
        db.raw('COUNT(CASE WHEN created_at >= ? THEN 1 END) as today_activities', [todayStart]),
        db.raw('COUNT(CASE WHEN created_at >= ? THEN 1 END) as last_7_days_activities', [sevenDaysAgo]),
        db.raw('COUNT(CASE WHEN created_at >= ? THEN 1 END) as last_30_days_activities', [thirtyDaysAgo])
      )
      .first();

    const total = parseInt(counts?.total_activities || 0, 10);
    const today = parseInt(counts?.today_activities || 0, 10);
    const last7Days = parseInt(counts?.last_7_days_activities || 0, 10);
    const last30Days = parseInt(counts?.last_30_days_activities || 0, 10);

    // 2. Modules breakdown
    const moduleCounts = await base.clone()
      .select('module', db.raw('COUNT(id) as count'))
      .groupBy('module')
      .orderBy('count', 'desc');

    const modulesBreakdown = {};
    moduleCounts.forEach((m) => {
      modulesBreakdown[m.module] = parseInt(m.count, 10);
    });

    // 3. Top actions breakdown
    const actionCounts = await base.clone()
      .select('action', db.raw('COUNT(id) as count'))
      .groupBy('action')
      .orderBy('count', 'desc')
      .limit(8);

    const actionsBreakdown = {};
    actionCounts.forEach((a) => {
      actionsBreakdown[a.action] = parseInt(a.count, 10);
    });

    // 4. Branch breakdown
    let branchBreakdown = [];
    if (!branch_id || branch_id === 'all') {
      const bCounts = await base.clone()
        .leftJoin('branches', 'audit_logs.branch_id', 'branches.id')
        .select(
          'audit_logs.branch_id',
          db.raw('COALESCE(branches.name, "Head Office / General") as branch_name'),
          db.raw('COUNT(audit_logs.id) as count')
        )
        .groupBy('audit_logs.branch_id', 'branches.name')
        .orderBy('count', 'desc');

      branchBreakdown = bCounts.map((b) => ({
        branch_id: b.branch_id,
        branch_name: b.branch_name,
        count: parseInt(b.count, 10),
      }));
    }

    // 5. Recent 5 activities
    const recentItems = await base.clone()
      .leftJoin('branches', 'audit_logs.branch_id', 'branches.id')
      .leftJoin('pgs', 'audit_logs.pg_id', 'pgs.id')
      .leftJoin('users as actor', 'audit_logs.user_id', 'actor.id')
      .select(
        'audit_logs.*',
        'branches.name as branch_name',
        'pgs.name as pg_name',
        'actor.name as actor_name',
        'actor.role as actor_role',
        'actor.profile_photo as user_profile_photo'
      )
      .orderBy('audit_logs.created_at', 'desc')
      .limit(5);

    return {
      // 4 Main KPI Cards shown on the UI:
      total_activities: total,
      today: today,
      last_7_days: last7Days,
      last_30_days: last30Days,

      // Universal aliases for frontend consumption
      total: total,
      total_audits: total,
      today_activities: today,
      today_audits: today,
      last_7_days_activities: last7Days,
      last_7_days_audits: last7Days,
      last_30_days_activities: last30Days,
      last_30_days_audits: last30Days,

      modules: modulesBreakdown,
      actions: actionsBreakdown,
      branches: branchBreakdown,
      recent: recentItems.map((r, idx) => this.formatAuditItem(r, idx, 1, 5)),
    };
  };

  /**
   * Export administrative activity logs as formatted Excel (.xlsx) file
   * Supports the "Export Log" button from the screenshot.
   *
   * @param {Object} user - Authenticated user context
   * @param {Object} query - Active filter parameters
   * @returns {Promise<{ download_url: string, filename: string, total_records: number }>}
   */
  exportAuditsExcel = async (user, query = {}) => {
    const is_admin = user.role === ROLES.ADMIN;
    let effectivePgId = query.pg_id ? Number(query.pg_id) : undefined;
    let pgName = 'HomeNest PG';

    if (is_admin) {
      const pg = await this.resolveAdminPg(user);
      effectivePgId = pg.id;
      pgName = pg.name || pgName;
    }

    // Fetch matching audit logs (up to 5000 for export)
    const exportQuery = db('audit_logs')
      .leftJoin('branches', 'audit_logs.branch_id', 'branches.id')
      .leftJoin('pgs', 'audit_logs.pg_id', 'pgs.id')
      .leftJoin('users as actor', 'audit_logs.user_id', 'actor.id');

    this.buildFilterConstraints(exportQuery, effectivePgId, query);

    const rawRows = await exportQuery
      .select(
        'audit_logs.*',
        'branches.name as branch_name',
        'pgs.name as pg_name',
        'actor.name as actor_name',
        'actor.role as actor_role',
        'actor.profile_photo as user_profile_photo'
      )
      .orderBy('audit_logs.created_at', 'desc')
      .limit(5000);

    const rows = rawRows.map((item, idx) => this.formatAuditItem(item, idx, 1, rawRows.length));

    // Also get KPI metrics for export summary header
    const stats = await this.getStats(user, query);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HomeNest PG Management';
    workbook.created = moment().toDate();

    const worksheet = workbook.addWorksheet('Activity Log', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 7, showGridLines: true }],
    });

    // 1. Title Row
    worksheet.mergeCells('A1:H1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'HomeNest - Administrative Activity Log';
    titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FF166534' } };
    titleCell.alignment = { vertical: 'middle' };
    worksheet.getRow(1).height = 32;

    // 2. Subtitle Row
    worksheet.mergeCells('A2:H2');
    const subCell = worksheet.getCell('A2');
    subCell.value = `Facility: ${pgName} | Track all admin actions and system changes | Generated: ${moment().format('DD MMM YYYY, hh:mm A')}`;
    subCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF64748B' } };
    subCell.alignment = { vertical: 'middle' };
    worksheet.getRow(2).height = 20;

    // 3. KPI Cards Block (Rows 4-5) matching the 4 cards in the screenshot
    const styleKpi = (startCol, endCol, label, val, valColor) => {
      worksheet.mergeCells(`${startCol}4:${endCol}4`);
      worksheet.mergeCells(`${startCol}5:${endCol}5`);

      const lbl = worksheet.getCell(`${startCol}4`);
      lbl.value = label;
      lbl.font = { name: 'Segoe UI', size: 8, bold: true, color: { argb: 'FF64748B' } };
      lbl.alignment = { vertical: 'middle', horizontal: 'center' };
      lbl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

      const v = worksheet.getCell(`${startCol}5`);
      v.value = val;
      v.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: valColor } };
      v.alignment = { vertical: 'middle', horizontal: 'center' };
      v.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    };

    styleKpi('A', 'B', 'TOTAL ACTIVITIES', stats.total_activities, 'FF166534');
    styleKpi('C', 'D', 'TODAY', stats.today, 'FF2563EB');
    styleKpi('E', 'F', 'LAST 7 DAYS', stats.last_7_days, 'FFD97706');
    styleKpi('G', 'H', 'LAST 30 DAYS', stats.last_30_days, 'FFE11D48');

    worksheet.getRow(4).height = 18;
    worksheet.getRow(5).height = 24;

    // 4. Header Row (Row 7)
    const headers = [
      'Sr no.',
      'User',
      'Action',
      'Module',
      'Details',
      'Timestamp',
      'IP address',
      'Branch',
    ];
    const headerRow = worksheet.getRow(7);
    headerRow.values = headers;
    headerRow.height = 28;

    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F766E' },
      };
      cell.font = {
        name: 'Segoe UI',
        size: 9.5,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // 5. Data Rows
    rows.forEach((r, idx) => {
      const rowIdx = 8 + idx;
      const row = worksheet.getRow(rowIdx);
      row.height = 22;

      row.values = [
        r.sr_no,
        r.user,
        r.action,
        r.module,
        r.details,
        r.timestamp,
        r.ip_address,
        r.branch_name,
      ];

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF1E293B' } };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
        if ([1, 6, 7].includes(colNumber)) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });
    });

    // Column Widths
    worksheet.columns = [
      { width: 8 },  // 1: Sr no.
      { width: 22 }, // 2: User
      { width: 26 }, // 3: Action
      { width: 18 }, // 4: Module
      { width: 36 }, // 5: Details
      { width: 24 }, // 6: Timestamp
      { width: 16 }, // 7: IP address
      { width: 22 }, // 8: Branch
    ];

    const filename = `administrative-activity-log-${Date.now()}.xlsx`;
    const uploadDir = path.join(process.cwd(), 'uploads', 'audits');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, filename);
    await workbook.xlsx.writeFile(filePath);

    const download_url = buildFileUrl('audits', filename);

    return {
      format: 'xlsx',
      download_url,
      file_url: download_url,
      filename,
      total_records: rows.length,
    };
  };

  /**
   * Export administrative activity logs as downloadable PDF (.pdf) report
   * Generates a styled landscape A4 document matching the UI cards & table.
   *
   * @param {Object} user - Authenticated user context
   * @param {Object} query - Active filter parameters
   * @returns {Promise<{ format: string, download_url: string, file_url: string, filename: string, total_records: number }>}
   */
  exportAuditsPdf = async (user, query = {}) => {
    const is_admin = user.role === ROLES.ADMIN;
    let effectivePgId = query.pg_id ? Number(query.pg_id) : undefined;
    let pgName = 'HomeNest PG';

    if (is_admin) {
      const pg = await this.resolveAdminPg(user);
      effectivePgId = pg.id;
      pgName = pg.name || pgName;
    }

    const exportQuery = db('audit_logs')
      .leftJoin('branches', 'audit_logs.branch_id', 'branches.id')
      .leftJoin('pgs', 'audit_logs.pg_id', 'pgs.id')
      .leftJoin('users as actor', 'audit_logs.user_id', 'actor.id');

    this.buildFilterConstraints(exportQuery, effectivePgId, query);

    const rawRows = await exportQuery
      .select(
        'audit_logs.*',
        'branches.name as branch_name',
        'pgs.name as pg_name',
        'actor.name as actor_name',
        'actor.role as actor_role',
        'actor.profile_photo as user_profile_photo'
      )
      .orderBy('audit_logs.created_at', 'desc')
      .limit(5000);

    const rows = rawRows.map((item, idx) => this.formatAuditItem(item, idx, 1, rawRows.length));
    const stats = await this.getStats(user, query);

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 24,
      bufferPages: true,
    });

    const filename = `administrative-activity-log-${Date.now()}.pdf`;
    const uploadDir = path.join(process.cwd(), 'uploads', 'audits');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, filename);
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const fontRegular = 'Helvetica';
    const fontBold = 'Helvetica-Bold';
    const fontMedium = 'Helvetica-Bold';

    const pageWidth = 841.89 - 48; // A4 landscape width (793.89 pt)
    const startX = 24;

    const brandDark = '#166534';
    const brandHeader = '#0F766E';
    const textTitle = '#0F172A';
    const textMuted = '#64748B';
    const borderSubtle = '#E2E8F0';

    const columns = [
      { label: 'Sr no.', width: 35, align: 'center' },
      { label: 'User', width: 105, align: 'left' },
      { label: 'Action', width: 125, align: 'left' },
      { label: 'Module', width: 80, align: 'center' },
      { label: 'Details', width: 205, align: 'left' },
      { label: 'Timestamp', width: 110, align: 'center' },
      { label: 'IP address', width: 75, align: 'center' },
      { label: 'Branch', width: 58, align: 'left' },
    ];

    const drawHeader = (doc, isFirstPage) => {
      if (isFirstPage) {
        // Document Title
        doc.fillColor(brandDark).font(fontBold).fontSize(14).text('HomeNest — Administrative Activity Log', startX, 20, { lineBreak: false });
        doc.fillColor(textMuted).font(fontRegular).fontSize(7.5).text(
          `Facility: ${pgName} | Track all admin actions and system changes | Generated: ${moment().format('DD MMM YYYY, hh:mm A')}`,
          startX,
          37,
          { lineBreak: false }
        );

        // 4 KPI Cards Block (Total Activities, Today, Last 7 Days, Last 30 Days)
        const cardY = 52;
        const cardH = 34;
        const cardGap = 8;
        const cardW = (pageWidth - 3 * cardGap) / 4;

        const kpis = [
          { label: 'TOTAL ACTIVITIES', value: String(stats.total_activities || 0), sub: 'All system activities', color: '#166534' },
          { label: 'TODAY', value: String(stats.today || 0), sub: 'Logged today', color: '#2563EB' },
          { label: 'LAST 7 DAYS', value: String(stats.last_7_days || 0), sub: 'Past 7 days trail', color: '#D97706' },
          { label: 'LAST 30 DAYS', value: String(stats.last_30_days || 0), sub: 'Past 30 days trail', color: '#E11D48' },
        ];

        kpis.forEach((kpi, i) => {
          const cx = startX + i * (cardW + cardGap);
          doc.roundedRect(cx, cardY, cardW, cardH, 4).fillAndStroke('#FFFFFF', borderSubtle);
          doc.fillColor(textMuted).font(fontBold).fontSize(6).text(kpi.label, cx + 8, cardY + 5.5, { lineBreak: false });
          doc.fillColor(kpi.color).font(fontBold).fontSize(10).text(kpi.value, cx + 8, cardY + 14.5, { width: cardW - 16, lineBreak: false });
          doc.fillColor(textMuted).font(fontRegular).fontSize(5.5).text(kpi.sub, cx + 8, cardY + 24.5, { lineBreak: false });
        });

        return cardY + cardH + 10;
      } else {
        doc.fillColor(brandHeader).font(fontBold).fontSize(8).text(`${pgName} — Administrative Activity Log (Continued)`, startX, 14, { lineBreak: false });
        return 26;
      }
    };

    const drawTableHeader = (doc, yPos) => {
      doc.rect(startX, yPos, pageWidth, 20).fill(brandHeader);
      let hX = startX;
      columns.forEach((col) => {
        doc.fillColor('#FFFFFF').font(fontBold).fontSize(7).text(col.label, hX + 2, yPos + 6, {
          width: col.width - 4,
          align: col.align,
          lineBreak: false,
        });
        hX += col.width;
      });
      return yPos + 20;
    };

    let currentY = drawHeader(doc, true);
    currentY = drawTableHeader(doc, currentY);

    const rowHeight = 20;

    // Render Table Rows
    rows.forEach((r, idx) => {
      if (currentY + rowHeight > 540) {
        doc.addPage();
        currentY = drawHeader(doc, false);
        currentY = drawTableHeader(doc, currentY);
      }

      const isEven = idx % 2 === 0;
      doc.rect(startX, currentY, pageWidth, rowHeight).fill(isEven ? '#FFFFFF' : '#F8FAFC');

      let curX = startX;

      // 1. Sr no.
      doc.fillColor(textTitle).font(fontRegular).fontSize(6.5).text(String(r.sr_no), curX, currentY + 6, {
        width: columns[0].width,
        align: 'center',
        lineBreak: false,
      });
      curX += columns[0].width;

      // 2. User
      doc.fillColor(textTitle).font(fontBold).fontSize(6.5).text(r.user || '-', curX + 2, currentY + 6, {
        width: columns[1].width - 4,
        lineBreak: false,
      });
      curX += columns[1].width;

      // 3. Action
      doc.fillColor(textTitle).font(fontRegular).fontSize(6.5).text(r.action || '-', curX + 2, currentY + 6, {
        width: columns[2].width - 4,
        lineBreak: false,
      });
      curX += columns[2].width;

      // 4. Module
      doc.fillColor(brandDark).font(fontBold).fontSize(6.5).text(r.module || '-', curX, currentY + 6, {
        width: columns[3].width,
        align: 'center',
        lineBreak: false,
      });
      curX += columns[3].width;

      // 5. Details
      doc.fillColor(textTitle).font(fontRegular).fontSize(6.5).text(r.details || '-', curX + 2, currentY + 6, {
        width: columns[4].width - 4,
        lineBreak: false,
      });
      curX += columns[4].width;

      // 6. Timestamp
      doc.fillColor(textMuted).font(fontRegular).fontSize(6.5).text(r.timestamp || '-', curX, currentY + 6, {
        width: columns[5].width,
        align: 'center',
        lineBreak: false,
      });
      curX += columns[5].width;

      // 7. IP address
      doc.fillColor(textMuted).font(fontRegular).fontSize(6.5).text(r.ip_address || '-', curX, currentY + 6, {
        width: columns[6].width,
        align: 'center',
        lineBreak: false,
      });
      curX += columns[6].width;

      // 8. Branch
      doc.fillColor(textTitle).font(fontRegular).fontSize(6.5).text(r.branch_name || '-', curX + 2, currentY + 6, {
        width: columns[7].width - 4,
        lineBreak: false,
      });

      // Bottom border line
      doc.moveTo(startX, currentY + rowHeight).lineTo(startX + pageWidth, currentY + rowHeight).strokeColor(borderSubtle).lineWidth(0.5).stroke();

      currentY += rowHeight;
    });

    // Page Numbering & Footer on all buffered pages
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      const prevBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      doc.moveTo(startX, 568).lineTo(startX + pageWidth, 568).strokeColor(borderSubtle).lineWidth(0.5).stroke();

      doc.fillColor(textMuted).font(fontRegular).fontSize(6.5).text(
        `${pgName} • Administrative Activity Log • Confidential`,
        startX,
        573,
        { lineBreak: false }
      );

      doc.fillColor(textTitle).font(fontMedium).fontSize(6.5).text(
        `Page ${i + 1} of ${range.count}`,
        startX,
        573,
        { width: pageWidth, align: 'right', lineBreak: false }
      );

      doc.page.margins.bottom = prevBottom;
    }

    doc.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const file_url = buildFileUrl('audits', filename);

    return {
      format: 'pdf',
      download_url: file_url,
      file_url,
      filename,
      total_records: rows.length,
    };
  };
}

export default new AuditService();
