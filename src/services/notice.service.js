import moment from 'moment';
import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';
import { buildFileUrl } from '../utils/url.js';
import { deleteNoticeAttachmentFile } from '../middlewares/upload.middleware.js';

/**
 * Notice & Communication Management Service
 *
 * Implements multi-tenancy (1 Admin = 1 PG = Multiple Branches),
 * notice scheduling, audience targeting, file attachments, and
 * resident notification center with read/unread tracking.
 */
class NoticeService {
  /**
   * Helper: Format notice database record into standardized API object
   *
   * @param {Object} row - Raw database row from `notices`
   * @param {number|null} [srNo=null] - Sequential row number for table display
   * @returns {Object} Formatted notice object
   */
  formatNotice = (row, srNo = null) => {
    if (!row) return null;

    // Format schedule / delivery date
    let scheduleDateStr = '-';
    if (row.scheduled_at) {
      scheduleDateStr = moment(row.scheduled_at).format('DD MMM YYYY, hh:mm A');
    } else if (row.sent_at) {
      scheduleDateStr = moment(row.sent_at).format('DD MMM YYYY, hh:mm A');
    } else if (row.created_at) {
      scheduleDateStr = moment(row.created_at).format('DD MMM YYYY, hh:mm A');
    }

    // Format resident display timestamp: e.g. "24 March 2026 • 10:30 AM"
    const effectiveDate = row.sent_at || row.scheduled_at || row.created_at;
    const residentDateTime = effectiveDate ? moment(effectiveDate).format('DD MMMM YYYY • hh:mm A') : '-';

    // Format audience label
    let audienceLabel = 'All Residents';
    if (row.audience_type === 'branch') {
      audienceLabel = row.branch_name ? `Branch: ${row.branch_name}` : 'Specific Branch';
    } else if (row.audience_type === 'room') {
      audienceLabel = row.room_no ? `Room ${row.room_no}` : 'Specific Room';
    } else if (row.audience_type === 'resident') {
      audienceLabel = row.target_resident_name ? `Resident: ${row.target_resident_name}` : 'Specific Resident';
    }

    // Attachment details
    const hasAttachment = Boolean(row.attachment_name);
    const attachment = hasAttachment
      ? {
          file_name: row.attachment_original_name || row.attachment_name,
          file_url: buildFileUrl('notices', row.attachment_name),
          file_size: row.attachment_size ? `${(row.attachment_size / (1024 * 1024)).toFixed(1)} MB` : null,
          file_mime: row.attachment_mime || null,
        }
      : null;

    // Clean plain text summary (first 120 chars)
    const cleanContent = (row.content || '').replace(/<[^>]*>/g, '').trim();
    const summary = cleanContent.length > 120 ? `${cleanContent.slice(0, 117)}...` : cleanContent;

    return {
      id: Number(row.id),
      ...(srNo !== null ? { sr_no: srNo } : {}),
      title: row.title,
      category: row.category || 'General',
      priority: (row.priority || 'medium').toLowerCase(),
      audience: audienceLabel,
      audience_type: row.audience_type || 'all',
      branch_id: row.branch_id ? Number(row.branch_id) : null,
      branch_name: row.branch_name || null,
      room_id: row.target_room_id ? Number(row.target_room_id) : null,
      room_no: row.room_no || null,
      resident_id: row.target_resident_id ? Number(row.target_resident_id) : null,
      resident_name: row.target_resident_name || null,
      summary,
      content: row.content,
      schedule_date: scheduleDateStr,
      date_time: residentDateTime,
      scheduled_at: row.scheduled_at,
      sent_at: row.sent_at,
      status: (row.status || 'draft').toLowerCase(),
      has_attachment: hasAttachment,
      attachment,
      file_url: attachment?.file_url || null,
      file_name: attachment?.file_name || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  };

  /**
   * Automatically transition any scheduled notices whose schedule time has arrived to 'sent'
   */
  publishDueScheduledNotices = async () => {
    try {
      await db('notices')
        .where('status', 'scheduled')
        .where('scheduled_at', '<=', db.fn.now())
        .whereNull('deleted_at')
        .update({
          status: 'sent',
          sent_at: db.fn.now(),
          updated_at: db.fn.now(),
        });
    } catch (err) {
      console.warn('[NoticeService] Background notice transition warning:', err.message);
    }
  };

  /**
   * Resolve PG ID and branch context for the user
   *
   * @param {Object} user - Authenticated user object
   * @param {number|string|null} preferredBranchId - Optional specific branch ID
   * @returns {Promise<{ pg_id: number, branch_id: number|null, accessibleBranchIds: number[]|null }>}
   */
  resolveUserContext = async (user, preferredBranchId = null) => {
    if (user.role === ROLES.SUPER_ADMIN) {
      let pgId = user.pg_id;
      if (!pgId) {
        const firstPg = await db('pgs').whereNull('deleted_at').orderBy('id', 'asc').first();
        pgId = firstPg?.id || 1;
      }
      return {
        pg_id: Number(pgId),
        branch_id: preferredBranchId ? Number(preferredBranchId) : null,
        room_id: null,
        accessibleBranchIds: null,
        isAdmin: true,
      };
    }

    if (user.role === ROLES.ADMIN || user.role === ROLES.STAFF || user.role === ROLES.BRANCH_MANAGER) {
      let pg = await db('pgs').where({ owner_id: user.id }).whereNull('deleted_at').first();
      if (!pg && user.pg_id) {
        pg = await db('pgs').where({ id: user.pg_id }).whereNull('deleted_at').first();
      }
      if (!pg) {
        const staffBranch = await db('user_branches').where({ user_id: user.id }).first();
        if (staffBranch) {
          const branch = await db('branches').where({ id: staffBranch.branch_id }).first();
          if (branch) pg = { id: branch.pg_id };
        }
      }
      if (!pg) {
        throw new AppError('No active PG property found for this account', HTTP_STATUS.BAD_REQUEST);
      }

      // Query accessible branches for this PG
      const branchRows = await db('branches').where({ pg_id: pg.id }).whereNull('deleted_at').select('id');
      const accessibleBranchIds = branchRows.map((b) => b.id);

      let targetBranchId = preferredBranchId ? Number(preferredBranchId) : null;
      if (targetBranchId && !accessibleBranchIds.includes(targetBranchId)) {
        throw new AppError('Access denied to specified branch', HTTP_STATUS.FORBIDDEN);
      }

      return {
        pg_id: Number(pg.id),
        branch_id: targetBranchId,
        room_id: null,
        accessibleBranchIds,
        isAdmin: true,
      };
    }

    if (user.role === ROLES.RESIDENT) {
      const activeStay = await db('resident_pg_stays')
        .where({ resident_id: user.id, status: 'active' })
        .whereNull('deleted_at')
        .orderBy('id', 'desc')
        .first();

      let pgId = activeStay ? activeStay.pg_id : user.pg_id;
      let branchId = activeStay ? activeStay.branch_id : user.branch_id;
      let roomId = activeStay ? activeStay.room_id : null;

      if (!pgId) {
        const firstPg = await db('pgs').whereNull('deleted_at').orderBy('id', 'asc').first();
        pgId = firstPg?.id || 1;
      }

      return {
        pg_id: Number(pgId),
        branch_id: branchId ? Number(branchId) : null,
        room_id: roomId ? Number(roomId) : null,
        stay_id: activeStay ? Number(activeStay.id) : null,
        isAdmin: false,
      };
    }

    throw new AppError('Unauthorized role', HTTP_STATUS.FORBIDDEN);
  };

  /**
   * Get Notice KPI statistics for Admin Dashboard (Screen 1 Cards)
   * Returns: Total Notices, Drafts, Scheduled, Sent
   *
   * @param {Object} params - User context and optional query filters
   * @returns {Promise<{ total_notices: number, drafts: number, scheduled: number, sent: number }>}
   */
  getStats = async ({ user, pg_id = null, branch_id = null }) => {
    await this.publishDueScheduledNotices();

    const context = await this.resolveUserContext(user, branch_id);
    const effectivePgId = pg_id ? Number(pg_id) : context.pg_id;

    const query = db('notices')
      .where('notices.pg_id', effectivePgId)
      .whereNull('notices.deleted_at');

    if (context.branch_id) {
      query.where((qb) => {
        qb.where('notices.branch_id', context.branch_id)
          .orWhere('notices.audience_type', 'all');
      });
    }

    const counts = await query
      .select(
        db.raw('COUNT(id) as total_notices'),
        db.raw("COUNT(CASE WHEN status = 'draft' THEN 1 END) as drafts"),
        db.raw("COUNT(CASE WHEN status = 'scheduled' THEN 1 END) as scheduled"),
        db.raw("COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent")
      )
      .first();

    return {
      total_notices: parseInt(counts?.total_notices || 0, 10),
      drafts: parseInt(counts?.drafts || 0, 10),
      scheduled: parseInt(counts?.scheduled || 0, 10),
      sent: parseInt(counts?.sent || 0, 10),
    };
  };

  /**
   * Get paginated notices list with tabs, filters, and search (Screen 1 Table)
   *
   * @param {Object} user - Authenticated user context
   * @param {Object} query - Filter parameters
   * @returns {Promise<{ notices: Object[], pagination: Object }>}
   */
  findAll = async (user, query = {}) => {
    await this.publishDueScheduledNotices();

    const {
      status,
      tab,
      category,
      priority,
      audience_type,
      branch_id,
      search,
      page = 1,
      limit = 10,
    } = query;

    const context = await this.resolveUserContext(user, branch_id);
    const effectivePgId = query.pg_id ? Number(query.pg_id) : context.pg_id;

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (currentPage - 1) * perPage;

    // Resolve active tab / status filter
    const activeTab = (tab || status || 'all').toLowerCase();

    const baseQuery = db('notices')
      .where('notices.pg_id', effectivePgId)
      .whereNull('notices.deleted_at')
      .leftJoin('branches', 'notices.branch_id', 'branches.id')
      .leftJoin('rooms', 'notices.target_room_id', 'rooms.id')
      .leftJoin('users as target_user', 'notices.target_resident_id', 'target_user.id');

    // Scoping to selected branch
    if (context.branch_id) {
      baseQuery.where((qb) => {
        qb.where('notices.branch_id', context.branch_id)
          .orWhere('notices.audience_type', 'all');
      });
    }

    // Status / Tab filter
    if (activeTab === 'draft' || activeTab === 'drafts') {
      baseQuery.where('notices.status', 'draft');
    } else if (activeTab === 'scheduled') {
      baseQuery.where('notices.status', 'scheduled');
    } else if (activeTab === 'sent') {
      baseQuery.where('notices.status', 'sent');
    } else if (status && status !== 'all') {
      baseQuery.where('notices.status', status.toLowerCase());
    }

    // Category filter
    if (category && category.toLowerCase() !== 'all') {
      baseQuery.whereILike('notices.category', category.trim());
    }

    // Priority filter
    if (priority && priority.toLowerCase() !== 'all') {
      baseQuery.where('notices.priority', priority.toLowerCase().trim());
    }

    // Audience type filter
    if (audience_type && audience_type.toLowerCase() !== 'all') {
      baseQuery.where('notices.audience_type', audience_type.toLowerCase().trim());
    }

    // Search filter across title, content, category
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      baseQuery.where((qb) => {
        qb.whereILike('notices.title', term)
          .orWhereILike('notices.content', term)
          .orWhereILike('notices.category', term)
          .orWhereILike('branches.name', term);
      });
    }

    // Total count for pagination
    const countRes = await baseQuery.clone().count('notices.id as total').first();
    const totalRecords = countRes ? parseInt(countRes.total, 10) : 0;

    // Fetch paginated rows with audience labels
    const rows = await baseQuery
      .clone()
      .select(
        'notices.*',
        'branches.name as branch_name',
        'rooms.room_no',
        'target_user.name as target_resident_name'
      )
      .orderByRaw('COALESCE(notices.scheduled_at, notices.sent_at, notices.created_at) DESC')
      .orderBy('notices.id', 'desc')
      .limit(perPage)
      .offset(offset);

    const formattedNotices = rows.map((row, idx) => {
      const srNo = offset + idx + 1;
      return this.formatNotice(row, srNo);
    });

    const totalPages = Math.ceil(totalRecords / perPage) || 1;

    return {
      notices: formattedNotices,
      pagination: {
        page: currentPage,
        limit: perPage,
        total_records: totalRecords,
        total_pages: totalPages,
        has_next: currentPage < totalPages,
        has_prev: currentPage > 1,
      },
    };
  };

  /**
   * Find single notice details by ID
   *
   * @param {number|string} id - Notice ID
   * @param {Object} user - Authenticated user context
   * @returns {Promise<Object>} Formatted notice details
   */
  findById = async (id, user) => {
    await this.publishDueScheduledNotices();

    const context = await this.resolveUserContext(user);

    const row = await db('notices')
      .where('notices.id', id)
      .where('notices.pg_id', context.pg_id)
      .whereNull('notices.deleted_at')
      .leftJoin('branches', 'notices.branch_id', 'branches.id')
      .leftJoin('rooms', 'notices.target_room_id', 'rooms.id')
      .leftJoin('users as target_user', 'notices.target_resident_id', 'target_user.id')
      .select(
        'notices.*',
        'branches.name as branch_name',
        'rooms.room_no',
        'target_user.name as target_resident_name'
      )
      .first();

    if (!row) {
      throw new AppError('Notice not found', HTTP_STATUS.NOT_FOUND);
    }

    return this.formatNotice(row);
  };

  /**
   * Create a new notice or schedule a communication (Screen 2 Form)
   *
   * @param {Object} data - Notice payload
   * @param {Object|null} file - Optional uploaded attachment file
   * @param {Object} user - Authenticated user context
   * @returns {Promise<{ id: number }>}
   */
  create = async (data, file, user) => {
    const context = await this.resolveUserContext(user, data.branch_id);

    // Resolve target audience
    const audienceType = (data.audience_type || 'all').toLowerCase();
    let targetBranchId = null;
    let targetRoomId = null;
    let targetResidentId = null;

    if (audienceType === 'branch') {
      targetBranchId = data.branch_id ? Number(data.branch_id) : (context.branch_id || null);
      if (!targetBranchId) {
        throw new AppError('Please select a branch when targeting a specific branch', HTTP_STATUS.BAD_REQUEST);
      }
    } else if (audienceType === 'room') {
      targetRoomId = data.room_id ? Number(data.room_id) : null;
      if (!targetRoomId) {
        throw new AppError('Please select a room when targeting a specific room', HTTP_STATUS.BAD_REQUEST);
      }
      const room = await db('rooms').where({ id: targetRoomId }).whereNull('deleted_at').first();
      if (!room) {
        throw new AppError('Specified room not found', HTTP_STATUS.NOT_FOUND);
      }
      targetBranchId = room.branch_id;
    } else if (audienceType === 'resident') {
      targetResidentId = data.resident_id ? Number(data.resident_id) : null;
      if (!targetResidentId) {
        throw new AppError('Please select a resident when targeting an individual resident', HTTP_STATUS.BAD_REQUEST);
      }
      const targetUser = await db('users').where({ id: targetResidentId }).whereNull('deleted_at').first();
      if (!targetUser) {
        throw new AppError('Specified resident user not found', HTTP_STATUS.NOT_FOUND);
      }
    } else if (data.branch_id) {
      targetBranchId = Number(data.branch_id);
    }

    // Resolve scheduled datetime
    let scheduledAt = null;
    if (data.scheduled_at) {
      scheduledAt = moment(data.scheduled_at).toDate();
    } else if (data.schedule_date) {
      const timePart = data.schedule_time || '10:00 AM';
      const parsed = moment(`${data.schedule_date} ${timePart}`, ['YYYY-MM-DD hh:mm A', 'DD MMM YYYY hh:mm A', 'YYYY-MM-DD HH:mm', 'DD-MM-YYYY HH:mm']);
      if (parsed.isValid()) {
        scheduledAt = parsed.toDate();
      } else {
        scheduledAt = moment(data.schedule_date).toDate();
      }
    }

    // Resolve status: default status is strictly 'draft' upon creation
    const requestedStatus = (data.status || '').toLowerCase().trim();
    let status = 'draft';
    let sentAt = null;

    // Check if send immediately was chosen
    const sendNow = data.send_now === true || data.send_now === 'true' || data.send_now === 1 || data.send_now === '1';

    if (sendNow || requestedStatus === 'sent') {
      status = 'sent';
      sentAt = new Date();
      scheduledAt = null;
    } else if (requestedStatus === 'scheduled') {
      status = 'scheduled';
      if (scheduledAt && moment(scheduledAt).isSameOrBefore(moment())) {
        status = 'sent';
        sentAt = scheduledAt;
      }
    } else {
      status = 'draft';
    }

    // Process attachment file
    let attachmentName = null;
    let attachmentOriginalName = null;
    let attachmentSize = null;
    let attachmentMime = null;

    if (file) {
      attachmentName = file.filename;
      attachmentOriginalName = file.originalname;
      attachmentSize = file.size;
      attachmentMime = file.mimetype;
    }

    const [id] = await db('notices').insert({
      pg_id: context.pg_id,
      branch_id: targetBranchId,
      created_by: user.id,
      title: data.title.trim(),
      category: data.category ? data.category.trim() : 'General',
      priority: (data.priority || 'medium').toLowerCase(),
      audience_type: audienceType,
      target_room_id: targetRoomId,
      target_resident_id: targetResidentId,
      content: data.content.trim(),
      attachment_name: attachmentName,
      attachment_original_name: attachmentOriginalName,
      attachment_size: attachmentSize,
      attachment_mime: attachmentMime,
      scheduled_at: scheduledAt,
      sent_at: sentAt,
      status,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    return { id };
  };

  /**
   * Update an existing notice
   *
   * @param {number|string} id - Notice ID
   * @param {Object} data - Updated fields
   * @param {Object|null} file - Optional uploaded attachment replacement
   * @param {Object} user - Authenticated user context
   * @returns {Promise<{ id: number }>}
   */
  update = async (id, data, file, user) => {
    const existing = await this.findById(id, user);

    const updatePayload = {
      updated_at: db.fn.now(),
    };

    if (data.title !== undefined) updatePayload.title = data.title.trim();
    if (data.category !== undefined) updatePayload.category = data.category.trim();
    if (data.priority !== undefined) updatePayload.priority = data.priority.toLowerCase().trim();
    if (data.content !== undefined) updatePayload.content = data.content.trim();

    if (data.audience_type !== undefined) {
      updatePayload.audience_type = data.audience_type.toLowerCase().trim();
    }
    if (data.branch_id !== undefined) {
      updatePayload.branch_id = data.branch_id ? Number(data.branch_id) : null;
    }
    if (data.room_id !== undefined) {
      updatePayload.target_room_id = data.room_id ? Number(data.room_id) : null;
    }
    if (data.resident_id !== undefined) {
      updatePayload.target_resident_id = data.resident_id ? Number(data.resident_id) : null;
    }

    // Schedule updates
    if (data.scheduled_at !== undefined || data.schedule_date !== undefined) {
      if (data.scheduled_at) {
        updatePayload.scheduled_at = moment(data.scheduled_at).toDate();
      } else if (data.schedule_date) {
        const timePart = data.schedule_time || '10:00 AM';
        const parsed = moment(`${data.schedule_date} ${timePart}`, ['YYYY-MM-DD hh:mm A', 'DD MMM YYYY hh:mm A', 'YYYY-MM-DD HH:mm']);
        updatePayload.scheduled_at = parsed.isValid() ? parsed.toDate() : moment(data.schedule_date).toDate();
      } else {
        updatePayload.scheduled_at = null;
      }
    }

    if (data.status !== undefined) {
      const st = data.status.toLowerCase().trim();
      updatePayload.status = st;
      if (st === 'sent' && !existing.sent_at) {
        updatePayload.sent_at = db.fn.now();
      }
    }

    // Handle attachment replacement
    if (file) {
      if (existing.attachment?.file_name) {
        deleteNoticeAttachmentFile(existing.attachment.file_name);
      }
      updatePayload.attachment_name = file.filename;
      updatePayload.attachment_original_name = file.originalname;
      updatePayload.attachment_size = file.size;
      updatePayload.attachment_mime = file.mimetype;
    }

    await db('notices').where({ id }).update(updatePayload);

    return { id: Number(id) };
  };

  /**
   * Soft-delete a notice
   *
   * @param {number|string} id - Notice ID
   * @param {Object} user - Authenticated user context
   * @returns {Promise<{ id: number }>}
   */
  remove = async (id, user) => {
    const existing = await this.findById(id, user);

    await db('notices').where({ id: existing.id }).update({
      deleted_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    if (existing.attachment?.file_name) {
      deleteNoticeAttachmentFile(existing.attachment.file_name);
    }

    return { id: Number(id) };
  };

  /**
   * Immediately publish / send a draft or scheduled notice
   *
   * @param {number|string} id - Notice ID
   * @param {Object} user - Authenticated user context
   * @returns {Promise<{ id: number }>}
   */
  sendNow = async (id, user) => {
    const existing = await this.findById(id, user);

    await db('notices').where({ id: existing.id }).update({
      status: 'sent',
      sent_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    return { id: Number(id) };
  };

  /**
   * Helper: Apply audience targeting filter for resident notifications safely without undefined bindings
   *
   * @param {Object} qb - Knex query builder
   * @param {Object} context - Audience context
   */
  applyResidentAudienceScope = (qb, { branch_id, room_id, resident_id, isAdmin = false }) => {
    qb.where('notices.audience_type', 'all');

    if (isAdmin) {
      // Admins previewing or testing resident notifications can view all audience types under the PG
      qb.orWhereIn('notices.audience_type', ['branch', 'room', 'resident']);
      return;
    }

    if (branch_id !== null && branch_id !== undefined) {
      qb.orWhere(function () {
        this.where('notices.audience_type', 'branch')
          .andWhere('notices.branch_id', Number(branch_id));
      });
    }

    if (room_id !== null && room_id !== undefined) {
      qb.orWhere(function () {
        this.where('notices.audience_type', 'room')
          .andWhere('notices.target_room_id', Number(room_id));
      });
    }

    if (resident_id !== null && resident_id !== undefined) {
      qb.orWhere(function () {
        this.where('notices.audience_type', 'resident')
          .andWhere('notices.target_resident_id', Number(resident_id));
      });
    }
  };

  /**
   * Retrieve resident notification center notices (Mobile Screen 1)
   * Scoped to the resident's PG, active branch, and room.
   * Includes read/unread tracking and filter pills (All, Important, General, Events).
   *
   * @param {Object} user - Authenticated resident user
   * @param {Object} query - Query parameters (category, is_read, search, page, limit)
   * @returns {Promise<{ notices: Object[], meta: Object }>}
   */
  getResidentNotices = async (user, query = {}) => {
    await this.publishDueScheduledNotices();

    const residentContext = await this.resolveUserContext(user);
    const { pg_id, branch_id, room_id, isAdmin } = residentContext;

    const {
      category = 'all',
      is_read,
      search,
      page = 1,
      limit = 10,
    } = query;

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (currentPage - 1) * perPage;

    // Base query: only 'sent' notices that target this resident
    const baseQuery = db('notices')
      .where('notices.pg_id', pg_id)
      .where('notices.status', 'sent')
      .whereNull('notices.deleted_at')
      .leftJoin('notice_reads', function () {
        this.on('notices.id', '=', 'notice_reads.notice_id')
          .andOn('notice_reads.resident_id', '=', db.raw('?', [user.id]));
      })
      .where((qb) => {
        this.applyResidentAudienceScope(qb, {
          branch_id,
          room_id,
          resident_id: user.id,
          isAdmin,
        });
      });

    // Mobile category filter pills: [All] [Important] [General] [Events]
    const filterCat = category.toLowerCase().trim();
    if (filterCat !== 'all' && filterCat !== '') {
      if (filterCat === 'important') {
        baseQuery.where((qb) => {
          qb.whereILike('notices.category', '%important%')
            .orWhere('notices.priority', 'high');
        });
      } else if (filterCat === 'general') {
        baseQuery.whereILike('notices.category', '%general%');
      } else if (filterCat === 'events' || filterCat === 'event') {
        baseQuery.whereILike('notices.category', '%event%');
      } else {
        baseQuery.whereILike('notices.category', `%${filterCat}%`);
      }
    }

    // Read / Unread filter
    if (is_read !== undefined && is_read !== '') {
      const readBool = is_read === true || is_read === 'true' || is_read === 1 || is_read === '1';
      if (readBool) {
        baseQuery.whereNotNull('notice_reads.id');
      } else {
        baseQuery.whereNull('notice_reads.id');
      }
    }

    // Search filter
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      baseQuery.where((qb) => {
        qb.whereILike('notices.title', term)
          .orWhereILike('notices.content', term);
      });
    }

    // Count total matching
    const countRes = await baseQuery.clone().count('notices.id as total').first();
    const totalRecords = countRes ? parseInt(countRes.total, 10) : 0;

    // Count total unread notices across all notifications for this resident
    const unreadRes = await db('notices')
      .where('notices.pg_id', pg_id)
      .where('notices.status', 'sent')
      .whereNull('notices.deleted_at')
      .leftJoin('notice_reads', function () {
        this.on('notices.id', '=', 'notice_reads.notice_id')
          .andOn('notice_reads.resident_id', '=', db.raw('?', [user.id]));
      })
      .whereNull('notice_reads.id')
      .where((qb) => {
        this.applyResidentAudienceScope(qb, {
          branch_id,
          room_id,
          resident_id: user.id,
          isAdmin,
        });
      })
      .count('notices.id as unread')
      .first();

    const unreadCount = unreadRes ? parseInt(unreadRes.unread, 10) : 0;

    // Query rows ordered by latest sent/schedule date
    const rows = await baseQuery
      .clone()
      .select(
        'notices.*',
        'notice_reads.read_at'
      )
      .orderByRaw('COALESCE(notices.sent_at, notices.scheduled_at, notices.created_at) DESC')
      .orderBy('notices.id', 'desc')
      .limit(perPage)
      .offset(offset);

    const formattedNotices = rows.map((row) => {
      const formatted = this.formatNotice(row);
      const isRead = Boolean(row.read_at);
      return {
        id: formatted.id,
        title: formatted.title,
        category: formatted.category,
        priority: formatted.priority,
        summary: formatted.summary,
        content: formatted.content,
        date_time: formatted.date_time,
        sent_at: formatted.sent_at,
        is_read: isRead,
        read_at: row.read_at || null,
        has_attachment: formatted.has_attachment,
        attachment: formatted.attachment,
      };
    });

    const totalPages = Math.ceil(totalRecords / perPage) || 1;

    return {
      notices: formattedNotices,
      meta: {
        page: currentPage,
        limit: perPage,
        total_records: totalRecords,
        total_pages: totalPages,
        unread_count: unreadCount,
        has_next: currentPage < totalPages,
        has_prev: currentPage > 1,
      },
    };
  };

  /**
   * Get single notice detail for resident and mark as read (Mobile Screen 2)
   *
   * @param {number|string} id - Notice ID
   * @param {Object} user - Authenticated resident user
   * @returns {Promise<Object>} Formatted notice detail with attachment card
   */
  getResidentNoticeById = async (id, user) => {
    await this.publishDueScheduledNotices();

    const residentContext = await this.resolveUserContext(user);
    const { pg_id, branch_id, room_id, isAdmin } = residentContext;

    const row = await db('notices')
      .where('notices.id', id)
      .where('notices.pg_id', pg_id)
      .where('notices.status', 'sent')
      .whereNull('notices.deleted_at')
      .where((qb) => {
        this.applyResidentAudienceScope(qb, {
          branch_id,
          room_id,
          resident_id: user.id,
          isAdmin,
        });
      })
      .first();

    if (!row) {
      throw new AppError('Notice not found or not accessible', HTTP_STATUS.NOT_FOUND);
    }

    // Automatically mark as read in junction table
    await this.markAsRead(id, user);

    const formatted = this.formatNotice(row);

    return {
      id: formatted.id,
      title: formatted.title,
      category: formatted.category,
      priority: formatted.priority,
      content: formatted.content,
      date_time: formatted.date_time,
      sent_at: formatted.sent_at,
      is_read: true,
      has_attachment: formatted.has_attachment,
      attachment: formatted.attachment,
    };
  };

  /**
   * Explicitly mark notice as read by resident
   *
   * @param {number|string} noticeId - Notice ID
   * @param {Object} user - Resident user
   */
  markAsRead = async (noticeId, user) => {
    try {
      const existing = await db('notice_reads')
        .where({ notice_id: Number(noticeId), resident_id: user.id })
        .first();

      if (!existing) {
        await db('notice_reads').insert({
          notice_id: Number(noticeId),
          resident_id: user.id,
          read_at: db.fn.now(),
        });
      }
    } catch (err) {
      // Ignore duplicate key race conditions
      if (!err.message?.includes('Duplicate entry')) {
        console.warn('[NoticeService] Mark read error:', err.message);
      }
    }
  };

  /**
   * Mark all notices as read for resident
   *
   * @param {Object} user - Resident user
   */
  markAllAsRead = async (user) => {
    const residentContext = await this.resolveUserContext(user);
    const { pg_id, branch_id, room_id, isAdmin } = residentContext;

    const unreadNoticeIds = await db('notices')
      .where('notices.pg_id', pg_id)
      .where('notices.status', 'sent')
      .whereNull('notices.deleted_at')
      .leftJoin('notice_reads', function () {
        this.on('notices.id', '=', 'notice_reads.notice_id')
          .andOn('notice_reads.resident_id', '=', db.raw('?', [user.id]));
      })
      .whereNull('notice_reads.id')
      .where((qb) => {
        this.applyResidentAudienceScope(qb, {
          branch_id,
          room_id,
          resident_id: user.id,
          isAdmin,
        });
      })
      .select('notices.id');

    if (unreadNoticeIds.length > 0) {
      const inserts = unreadNoticeIds.map((n) => ({
        notice_id: n.id,
        resident_id: user.id,
        read_at: db.fn.now(),
      }));

      await db('notice_reads').insert(inserts);
    }

    return { total_marked: unreadNoticeIds.length };
  };
}

export default new NoticeService();

