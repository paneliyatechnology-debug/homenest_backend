import moment from 'moment';
import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES, AUDIT_MODULES, AUDIT_ACTIONS } from '../constants/index.js';
import { buildFileUrl } from '../utils/url.js';
import socketService, { SOCKET_EVENTS } from './socket.service.js';
import auditService from './audit.service.js';

class ComplaintService {
  /**
   * Helper: Format Date string strictly to 'YYYY-MM-DD'
   */
  static formatDateStr = (dateVal) => {
    if (!dateVal) return null;
    return moment(dateVal).format('YYYY-MM-DD');
  };

  /**
   * Helper: Check if a complaint is overdue dynamically
   */
  static isOverdue = (complaint) => {
    if (!complaint || complaint.status === 'RESOLVED' || !complaint.due_date) {
      return false;
    }
    return moment().isAfter(moment(complaint.due_date));
  };

  /**
   * Helper: Generate a unique complaint number
   * Format: CMP-YYYYMM-XXXX (e.g. CMP-202611-0001)
   */
  static generateComplaintNumber = async () => {
    const yearMonth = moment().format('YYYYMM');
    const prefix = `CMP-${yearMonth}-`;

    const latest = await db('complaints')
      .where('complaint_number', 'like', `${prefix}%`)
      .orderBy('id', 'desc')
      .select('complaint_number')
      .first();

    let seq = 1;
    if (latest && latest.complaint_number) {
      const parts = latest.complaint_number.split('-');
      if (parts.length === 3) {
        const lastNum = parseInt(parts[2], 10);
        if (!isNaN(lastNum)) seq = lastNum + 1;
      }
    }

    return `${prefix}${String(seq).padStart(4, '0')}`;
  };

  /**
   * Helper: Resolve branch and property context for user
   */
  resolveBranchContext = async (user, candidateBranchId = null) => {
    if (user.role === ROLES.RESIDENT) {
      const stay = await db('resident_pg_stays')
        .where({ resident_id: user.id, status: 'active' })
        .whereNull('deleted_at')
        .orderBy('id', 'desc')
        .first();

      if (!stay || !stay.branch_id || !stay.room_id) {
        throw new AppError(
          'No active PG branch stay found for resident. Contact your property manager.',
          HTTP_STATUS.FORBIDDEN
        );
      }

      const branch = await db('branches')
        .where({ id: stay.branch_id })
        .whereNull('deleted_at')
        .first();

      if (!branch) {
        throw new AppError('Assigned branch is no longer active', HTTP_STATUS.NOT_FOUND);
      }

      return {
        branch_id: branch.id,
        pg_id: branch.pg_id,
        branch_name: branch.name,
        room_id: stay.room_id,
        stay_id: stay.id,
      };
    }

    if (user.role === ROLES.ADMIN) {
      if (candidateBranchId) {
        const branch = await db('branches')
          .join('pgs', 'branches.pg_id', 'pgs.id')
          .where('branches.id', candidateBranchId)
          .where('pgs.owner_id', user.id)
          .whereNull('branches.deleted_at')
          .select('branches.id', 'branches.pg_id', 'branches.name')
          .first();

        if (!branch) {
          throw new AppError(
            'Branch not found or access denied. You do not manage this branch.',
            HTTP_STATUS.FORBIDDEN
          );
        }

        return {
          branch_id: branch.id,
          pg_id: branch.pg_id,
          branch_name: branch.name,
        };
      }

      // Default to first branch of admin
      const branch = await db('branches')
        .join('pgs', 'branches.pg_id', 'pgs.id')
        .where('pgs.owner_id', user.id)
        .whereNull('branches.deleted_at')
        .orderBy('branches.id', 'asc')
        .select('branches.id', 'branches.pg_id', 'branches.name')
        .first();

      if (!branch) {
        throw new AppError(
          'No active branch found under your property. Please create a branch first.',
          HTTP_STATUS.NOT_FOUND
        );
      }

      return {
        branch_id: branch.id,
        pg_id: branch.pg_id,
        branch_name: branch.name,
      };
    }

    // Super Admin
    if (candidateBranchId) {
      const branch = await db('branches')
        .where({ id: candidateBranchId })
        .whereNull('deleted_at')
        .first();

      if (!branch) {
        throw new AppError('Branch not found', HTTP_STATUS.NOT_FOUND);
      }

      return {
        branch_id: branch.id,
        pg_id: branch.pg_id,
        branch_name: branch.name,
      };
    }

    const firstBranch = await db('branches').whereNull('deleted_at').orderBy('id', 'asc').first();
    if (!firstBranch) {
      throw new AppError('No branches found in system', HTTP_STATUS.NOT_FOUND);
    }

    return {
      branch_id: firstBranch.id,
      pg_id: firstBranch.pg_id,
      branch_name: firstBranch.name,
    };
  };

  /**
   * 1. Get Predefined Complaint Categories
   */
  getCategories = async () => {
    const categories = await db('complaint_categories')
      .where('is_active', true)
      .orderBy('id', 'asc');

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      key: c.key,
      icon: c.icon,
      description: c.description,
      ...(c.key === 'wifi'
        ? {
            wifi_options: {
              issue_types: ['NO_CONNECTION', 'SLOW_SPEED', 'INTERMITTENT_CONNECTION', 'OTHER'],
              device_types: ['MOBILE', 'LAPTOP', 'TABLET', 'SMART_TV', 'OTHER'],
            },
          }
        : {}),
    }));
  };

  /**
   * 2. Create Complaint
   * Resident / Admin
   */
  createComplaint = async (data, files = [], user) => {
    // 1. Resolve Category
    let category = null;
    if (data.category_id) {
      category = await db('complaint_categories')
        .where('id', data.category_id)
        .where('is_active', true)
        .first();
    }
    if (!category && data.category) {
      category = await db('complaint_categories')
        .where('key', String(data.category).toLowerCase())
        .where('is_active', true)
        .first();
    }

    if (!category) {
      throw new AppError('Invalid or inactive complaint category', HTTP_STATUS.BAD_REQUEST);
    }

    // 2. Resolve Location and Permissions
    let targetRoomId = null;
    let targetPgId = null;
    let targetBranchId = null;
    let residentId = user.id;

    if (user.role === ROLES.RESIDENT) {
      const residentContext = await this.resolveBranchContext(user);
      targetRoomId = residentContext.room_id;
      targetPgId = residentContext.pg_id;
      targetBranchId = residentContext.branch_id;

      // If resident explicitly passed location_id, verify it matches their assigned room
      if (data.location_id && Number(data.location_id) !== targetRoomId) {
        throw new AppError(
          'Access denied. You can only report issues for your assigned room.',
          HTTP_STATUS.FORBIDDEN
        );
      }
    } else {
      // Admin / Super Admin reporting issue
      if (!data.location_id) {
        throw new AppError('location_id (Room ID) is required when creating a complaint as admin', HTTP_STATUS.BAD_REQUEST);
      }
      targetRoomId = Number(data.location_id);

      const room = await db('rooms')
        .where('id', targetRoomId)
        .whereNull('deleted_at')
        .first();

      if (!room) {
        throw new AppError('Specified room / location not found', HTTP_STATUS.NOT_FOUND);
      }

      await this.resolveBranchContext(user, room.branch_id);
      targetPgId = room.pg_id;
      targetBranchId = room.branch_id;
      residentId = data.resident_id || user.id;
    }

    // 3. WiFi-specific fields validation
    let issueType = null;
    let deviceType = null;
    if (category.key === 'wifi') {
      if (data.issue_type) {
        issueType = String(data.issue_type).toUpperCase();
      }
      if (data.device_type) {
        deviceType = String(data.device_type).replace(/\s+/g, '_').toUpperCase();
      }
    }

    const complaintNumber = await ComplaintService.generateComplaintNumber();
    const priority = (data.priority ? String(data.priority).toUpperCase() : 'MEDIUM');

    // 4. Database Transaction
    const complaintId = await db.transaction(async (trx) => {
      const [newId] = await trx('complaints').insert({
        complaint_number: complaintNumber,
        pg_id: targetPgId,
        branch_id: targetBranchId,
        room_id: targetRoomId,
        resident_id: residentId,
        category_id: category.id,
        title: data.title ? data.title.trim() : `${category.name} Issue`,
        description: data.description.trim(),
        priority,
        status: 'OPEN',
        issue_type: issueType,
        device_type: deviceType,
        notify_updates: data.notify_updates !== undefined ? Boolean(data.notify_updates) : true,
      });

      // Associate uploaded proof attachments with the complaint record
      if (files && files.length > 0) {
        const attachmentRecords = files.map((file) => ({
          complaint_id: newId,
          file_name: file.filename,
          file_url: buildFileUrl('complaints', file.filename),
          file_type: file.mimetype,
          file_size: file.size,
        }));
        await trx('complaint_attachments').insert(attachmentRecords);
      }

      // Record initial history event
      await trx('complaint_history').insert({
        complaint_id: newId,
        event_type: 'CREATED',
        description: `Complaint created by ${user.name || 'Resident'} (${priority} priority)`,
        new_value: 'OPEN',
        performed_by: user.id,
      });

      return newId;
    });

    // Real-time: Notify property admins of new complaint request
    socketService.emitToPgAdmins(targetPgId, SOCKET_EVENTS.COMPLAINT_NEW, {
      id: complaintId,
      complaint_number: complaintNumber,
      title: data.title ? data.title.trim() : `${category.name} Issue`,
      priority,
      status: 'OPEN',
      room_id: targetRoomId,
      resident_id: residentId,
      created_at: moment().toISOString(),
    });

    auditService.log({
      pg_id: targetPgId,
      branch_id: targetBranchId,
      user_id: user.id,
      user_name: user.name,
      user_role: user.role,
      module: AUDIT_MODULES.COMPLAINT,
      action: AUDIT_ACTIONS.CREATE,
      entity_type: 'complaint',
      entity_id: complaintId,
      description: `Complaint #${complaintNumber} created: ${data.title ? data.title.trim() : category.name}`,
      new_values: { complaint_number: complaintNumber, title: data.title, priority, room_id: targetRoomId },
    });

    return {
      id: complaintId,
      complaint_number: complaintNumber,
      status: 'OPEN',
      priority,
      category: category.name,
      issue_type: data.issue_type || null,
      device_type: data.device_type || null,
    };
  };

  /**
   * 3. Get Complaints List (Shared Resident & Admin)
   * Token-based scoping:
   * - Resident: strictly their own complaints
   * - Admin: branch-wise / property-wise complaints
   */
  getComplaints = async (user, query = {}) => {
    const {
      status,
      category_id,
      category,
      priority,
      branch_id,
      search,
      start_date,
      end_date,
      page = 1,
      limit = 20,
    } = query;

    const current_page = Math.max(1, parseInt(page, 10) || 1);
    const per_page = Math.max(1, parseInt(limit, 10) || 20);
    const offset = (current_page - 1) * per_page;

    let branchContext = null;
    if (user.role === ROLES.ADMIN || user.role === ROLES.SUPER_ADMIN) {
      branchContext = await this.resolveBranchContext(user, branch_id);
    }

    const base_query = db('complaints')
      .whereNull('complaints.deleted_at')
      .join('complaint_categories as cat', 'complaints.category_id', 'cat.id')
      .join('rooms', 'complaints.room_id', 'rooms.id')
      .leftJoin('floors', 'rooms.floor_id', 'floors.id')
      .leftJoin('buildings', 'rooms.building_id', 'buildings.id')
      .join('branches', 'complaints.branch_id', 'branches.id')
      .join('users as resident', 'complaints.resident_id', 'resident.id')
      .leftJoin('users as staff', 'complaints.assigned_to', 'staff.id')
      .modify((qb) => {
        // Scoping
        if (user.role === ROLES.RESIDENT) {
          qb.where('complaints.resident_id', user.id);
        } else if (branchContext) {
          qb.where('complaints.branch_id', branchContext.branch_id);
        }

        // Status Filter
        if (status && status.toUpperCase() !== 'ALL') {
          qb.where('complaints.status', status.toUpperCase());
        }

        // Category Filter
        if (category_id) {
          qb.where('complaints.category_id', parseInt(category_id, 10));
        } else if (category && category.toLowerCase() !== 'all') {
          qb.where('cat.key', category.toLowerCase());
        }

        // Priority Filter
        if (priority && priority.toUpperCase() !== 'ALL') {
          qb.where('complaints.priority', priority.toUpperCase());
        }

        // Date Range
        if (start_date) {
          qb.where('complaints.created_at', '>=', `${start_date} 00:00:00`);
        }
        if (end_date) {
          qb.where('complaints.created_at', '<=', `${end_date} 23:59:59`);
        }

        // Search Filter (complaint_number, title, resident name, room_no)
        if (search) {
          const s = `%${search.trim()}%`;
          qb.where((sq) => {
            sq.where('complaints.complaint_number', 'like', s)
              .orWhere('complaints.title', 'like', s)
              .orWhere('complaints.description', 'like', s)
              .orWhere('resident.name', 'like', s)
              .orWhere('rooms.room_no', 'like', s);
          });
        }
      });

    // Calculate total matching complaints for pagination
    const countRes = await base_query.clone().count('complaints.id as total').first();
    const total = countRes ? parseInt(countRes.total, 10) : 0;

    // Retrieve paginated complaint records
    const rows = await base_query
      .clone()
      .select(
        'complaints.*',
        'cat.name as category_name',
        'cat.key as category_key',
        'cat.icon as category_icon',
        'rooms.room_no',
        'floors.floor_number',
        'buildings.name as building_name',
        'branches.name as branch_name',
        'resident.name as resident_name',
        'resident.phone as resident_phone',
        'staff.name as assigned_to_name',
        'staff.phone as assigned_to_phone'
      )
      .orderBy('complaints.created_at', 'desc')
      .orderBy('complaints.id', 'desc')
      .limit(per_page)
      .offset(offset);

    // Hydrate complaints with their uploaded photo/document attachments
    let attachmentsByComplaintId = {};
    if (rows.length > 0) {
      const complaintIds = rows.map((r) => r.id);
      const attachments = await db('complaint_attachments')
        .whereIn('complaint_id', complaintIds)
        .select('*');

      attachments.forEach((att) => {
        if (!attachmentsByComplaintId[att.complaint_id]) {
          attachmentsByComplaintId[att.complaint_id] = [];
        }
        attachmentsByComplaintId[att.complaint_id].push({
          id: att.id,
          file_name: att.file_name,
          file_url: buildFileUrl('complaints', att.file_name),
          file_type: att.file_type,
        });
      });
    }

    const formattedRows = rows.map((r) => ({
      id: r.id,
      complaint_number: r.complaint_number,
      title: r.title,
      description: r.description,
      category: {
        id: r.category_id,
        name: r.category_name,
        key: r.category_key,
        icon: r.category_icon,
      },
      location: {
        room_id: r.room_id,
        room_no: r.room_no,
        floor_number: r.floor_number || null,
        building_name: r.building_name || null,
        branch_name: r.branch_name,
      },
      resident: {
        id: r.resident_id,
        name: r.resident_name,
        phone: r.resident_phone,
      },
      priority: r.priority,
      status: r.status,
      is_overdue: ComplaintService.isOverdue(r),
      due_date: r.due_date,
      assigned_to: r.assigned_to
        ? {
            id: r.assigned_to,
            name: r.assigned_to_name,
            phone: r.assigned_to_phone,
          }
        : null,
      issue_type: r.issue_type,
      device_type: r.device_type,
      attachments: attachmentsByComplaintId[r.id] || [],
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return {
      data: formattedRows,
      complaints: formattedRows,
      pagination: {
        total,
        page: current_page,
        limit: per_page,
        total_pages: Math.ceil(total / per_page) || 1,
      },
    };
  };

  /**
   * 4. Get Single Complaint Details with Complete Timeline & Feedback
   */
  getComplaintById = async (id, user) => {
    const complaint = await db('complaints')
      .where('complaints.id', id)
      .whereNull('complaints.deleted_at')
      .join('complaint_categories as cat', 'complaints.category_id', 'cat.id')
      .join('rooms', 'complaints.room_id', 'rooms.id')
      .leftJoin('floors', 'rooms.floor_id', 'floors.id')
      .leftJoin('buildings', 'rooms.building_id', 'buildings.id')
      .join('branches', 'complaints.branch_id', 'branches.id')
      .join('pgs', 'complaints.pg_id', 'pgs.id')
      .join('users as resident', 'complaints.resident_id', 'resident.id')
      .leftJoin('users as staff', 'complaints.assigned_to', 'staff.id')
      .select(
        'complaints.*',
        'cat.name as category_name',
        'cat.key as category_key',
        'cat.icon as category_icon',
        'rooms.room_no',
        'floors.floor_number',
        'buildings.name as building_name',
        'branches.name as branch_name',
        'pgs.owner_id',
        'resident.name as resident_name',
        'resident.phone as resident_phone',
        'resident.email as resident_email',
        'staff.name as assigned_to_name',
        'staff.phone as assigned_to_phone',
        'staff.email as assigned_to_email'
      )
      .first();

    if (!complaint) {
      throw new AppError('Complaint not found', HTTP_STATUS.NOT_FOUND);
    }

    // Role-based Access Check
    if (user.role === ROLES.RESIDENT) {
      if (complaint.resident_id !== user.id) {
        throw new AppError('Access denied. You cannot view another resident\'s complaint.', HTTP_STATUS.FORBIDDEN);
      }
    } else if (user.role === ROLES.ADMIN) {
      if (complaint.owner_id !== user.id) {
        throw new AppError('Access denied. You do not manage this property.', HTTP_STATUS.FORBIDDEN);
      }
    }

    // Attachments
    const attachments = await db('complaint_attachments')
      .where('complaint_id', complaint.id)
      .select('*');

    // Complete Timeline History
    const historyRows = await db('complaint_history')
      .where('complaint_history.complaint_id', complaint.id)
      .join('users as performer', 'complaint_history.performed_by', 'performer.id')
      .select(
        'complaint_history.*',
        'performer.name as performer_name',
        'performer.role as performer_role'
      )
      .orderBy('complaint_history.created_at', 'asc')
      .orderBy('complaint_history.id', 'asc');

    // Feedback (if submitted)
    const feedback = await db('complaint_feedback')
      .where('complaint_id', complaint.id)
      .first();

    return {
      id: complaint.id,
      complaint_number: complaint.complaint_number,
      title: complaint.title,
      description: complaint.description,
      priority: complaint.priority,
      status: complaint.status,
      is_overdue: ComplaintService.isOverdue(complaint),
      category: {
        id: complaint.category_id,
        name: complaint.category_name,
        key: complaint.category_key,
        icon: complaint.category_icon,
      },
      location: {
        room_id: complaint.room_id,
        room_no: complaint.room_no,
        floor_number: complaint.floor_number || null,
        building_name: complaint.building_name || null,
        branch_id: complaint.branch_id,
        branch_name: complaint.branch_name,
      },
      resident: {
        id: complaint.resident_id,
        name: complaint.resident_name,
        phone: complaint.resident_phone,
        email: complaint.resident_email,
      },
      assigned_to: complaint.assigned_to
        ? {
            id: complaint.assigned_to,
            name: complaint.assigned_to_name,
            phone: complaint.assigned_to_phone,
            email: complaint.assigned_to_email,
          }
        : null,
      due_date: complaint.due_date,
      resolution_notes: complaint.resolution_notes,
      resolved_at: complaint.resolved_at,
      issue_type: complaint.issue_type,
      device_type: complaint.device_type,
      notify_updates: Boolean(complaint.notify_updates),
      attachments: attachments.map((att) => ({
        id: att.id,
        file_name: att.file_name,
        file_url: buildFileUrl('complaints', att.file_name),
        file_type: att.file_type,
        file_size: att.file_size,
        created_at: att.created_at,
      })),
      timeline: historyRows.map((h) => ({
        id: h.id,
        event_type: h.event_type,
        description: h.description,
        old_value: h.old_value,
        new_value: h.new_value,
        performed_by: {
          id: h.performed_by,
          name: h.performer_name,
          role: h.performer_role,
        },
        created_at: h.created_at,
      })),
      feedback: feedback
        ? {
            id: feedback.id,
            rating: feedback.rating,
            comments: feedback.comments,
            created_at: feedback.created_at,
          }
        : null,
      created_at: complaint.created_at,
      updated_at: complaint.updated_at,
    };
  };

  /**
   * 5. Get Complaint Dashboard KPI Statistics (Admin)
   */
  getComplaintStats = async (user, query = {}) => {
    const branchContext = await this.resolveBranchContext(user, query.branch_id);

    const base = db('complaints')
      .where('complaints.branch_id', branchContext.branch_id)
      .whereNull('complaints.deleted_at');

    // Aggregate counts
    const counts = await base.clone()
      .select(
        db.raw('COUNT(id) as total_complaints'),
        db.raw('COUNT(CASE WHEN status = "OPEN" THEN 1 END) as open_complaints'),
        db.raw('COUNT(CASE WHEN status = "IN_PROGRESS" THEN 1 END) as in_progress_complaints'),
        db.raw('COUNT(CASE WHEN status = "RESOLVED" THEN 1 END) as resolved_complaints'),
        db.raw('COUNT(CASE WHEN status != "RESOLVED" AND due_date IS NOT NULL AND due_date < NOW() THEN 1 END) as overdue_complaints')
      )
      .first();

    // Priority breakdown
    const priorityCounts = await base.clone()
      .select(
        'priority',
        db.raw('COUNT(id) as count')
      )
      .groupBy('priority');

    const priorities = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    priorityCounts.forEach((p) => {
      if (priorities[p.priority] !== undefined) {
        priorities[p.priority] = parseInt(p.count, 10);
      }
    });

    const totalCount = parseInt(counts?.total_complaints || 0, 10);
    const openCount = parseInt(counts?.open_complaints || 0, 10);
    const inProgressCount = parseInt(counts?.in_progress_complaints || 0, 10);
    const resolvedCount = parseInt(counts?.resolved_complaints || 0, 10);
    const overdueCount = parseInt(counts?.overdue_complaints || 0, 10);

    return {
      branch_id: branchContext.branch_id,
      branch_name: branchContext.branch_name,
      total: totalCount,
      total_complaints: totalCount,
      open: openCount,
      open_complaints: openCount,
      in_progress: inProgressCount,
      in_progress_complaints: inProgressCount,
      resolved: resolvedCount,
      resolved_complaints: resolvedCount,
      overdue: overdueCount,
      overdue_complaints: overdueCount,
      priorities,
    };
  };

  /**
   * 6. Assign Complaint & Set Due Date (Admin)
   */
  assignComplaint = async (id, data, user) => {
    const complaint = await db('complaints')
      .where('complaints.id', id)
      .whereNull('complaints.deleted_at')
      .join('pgs', 'complaints.pg_id', 'pgs.id')
      .select('complaints.*', 'pgs.owner_id')
      .first();

    if (!complaint) {
      throw new AppError('Complaint not found', HTTP_STATUS.NOT_FOUND);
    }

    if (user.role === ROLES.ADMIN && complaint.owner_id !== user.id) {
      throw new AppError('Access denied. You do not manage this complaint.', HTTP_STATUS.FORBIDDEN);
    }

    const assignedToId = Number(data.assigned_to || data.assigned_to_user_id);

    // Verify staff user exists
    const staffUser = await db('users')
      .where('id', assignedToId)
      .where('status', 'active')
      .first();

    if (!staffUser) {
      throw new AppError('Assigned staff / user not found or inactive', HTTP_STATUS.BAD_REQUEST);
    }

    const dueDate = data.due_date ? moment(data.due_date).format('YYYY-MM-DD HH:mm:ss') : complaint.due_date;

    await db.transaction(async (trx) => {
      await trx('complaints').where({ id }).update({
        assigned_to: staffUser.id,
        due_date: dueDate,
        updated_at: db.fn.now(),
      });

      await trx('complaint_history').insert({
        complaint_id: id,
        event_type: 'ASSIGNED',
        description: `Complaint assigned to ${staffUser.name}${dueDate ? ` (Due: ${dueDate})` : ''}`,
        new_value: staffUser.name,
        performed_by: user.id,
      });

      if (data.due_date && data.due_date !== complaint.due_date) {
        await trx('complaint_history').insert({
          complaint_id: id,
          event_type: 'DUE_DATE_UPDATED',
          description: `Due date set to ${dueDate}`,
          new_value: dueDate,
          performed_by: user.id,
        });
      }
    });

    // Real-time: Notify resident and assigned staff
    socketService.emitToUser(complaint.resident_id, SOCKET_EVENTS.COMPLAINT_ACTIVITY, {
      id,
      complaint_number: complaint.complaint_number,
      type: 'ASSIGNED',
      assigned_to: staffUser.name,
      due_date: dueDate,
    });
    socketService.emitToUser(staffUser.id, SOCKET_EVENTS.COMPLAINT_NEW, {
      id,
      complaint_number: complaint.complaint_number,
      title: complaint.title,
      due_date: dueDate,
    });

    auditService.log({
      pg_id: complaint.pg_id,
      branch_id: complaint.branch_id,
      user_id: user.id,
      user_name: user.name,
      user_role: user.role,
      module: AUDIT_MODULES.COMPLAINT,
      action: AUDIT_ACTIONS.ASSIGN,
      entity_type: 'complaint',
      entity_id: id,
      description: `Complaint #${complaint.complaint_number} assigned to ${staffUser.name}`,
      old_values: { assigned_to: complaint.assigned_to },
      new_values: { assigned_to: staffUser.id, staff_name: staffUser.name, due_date: dueDate },
    });

    return {
      id,
      assigned_to: staffUser.name,
      due_date: dueDate,
      message: `Complaint assigned to ${staffUser.name} successfully`,
    };
  };

  /**
   * 7. Update Complaint Status (Admin)
   * OPEN -> IN_PROGRESS -> RESOLVED
   */
  updateStatus = async (id, data, user) => {
    const complaint = await db('complaints')
      .where('complaints.id', id)
      .whereNull('complaints.deleted_at')
      .join('pgs', 'complaints.pg_id', 'pgs.id')
      .select('complaints.*', 'pgs.owner_id')
      .first();

    if (!complaint) {
      throw new AppError('Complaint not found', HTTP_STATUS.NOT_FOUND);
    }

    if (user.role === ROLES.ADMIN && complaint.owner_id !== user.id) {
      throw new AppError('Access denied. You do not manage this complaint.', HTTP_STATUS.FORBIDDEN);
    }

    const oldStatus = complaint.status;
    const newStatus = data.status.toUpperCase();

    if (oldStatus === newStatus) {
      return { id, status: newStatus, message: `Status is already ${newStatus}` };
    }

    const resolutionNotes = data.resolution_notes ? data.resolution_notes.trim() : null;

    await db.transaction(async (trx) => {
      const updateData = {
        status: newStatus,
        updated_at: db.fn.now(),
      };

      if (newStatus === 'RESOLVED') {
        updateData.resolved_at = db.fn.now();
        if (resolutionNotes) {
          updateData.resolution_notes = resolutionNotes;
        }
      }

      await trx('complaints').where({ id }).update(updateData);

      await trx('complaint_history').insert({
        complaint_id: id,
        event_type: newStatus === 'RESOLVED' ? 'RESOLVED' : 'STATUS_UPDATED',
        description: resolutionNotes || `Status updated from ${oldStatus} to ${newStatus}`,
        old_value: oldStatus,
        new_value: newStatus,
        performed_by: user.id,
      });
    });

    // Real-time: Notify resident and property admins of status change
    socketService.emitToUser(complaint.resident_id, SOCKET_EVENTS.COMPLAINT_STATUS_UPDATED, {
      id,
      complaint_number: complaint.complaint_number,
      old_status: oldStatus,
      status: newStatus,
      resolution_notes: resolutionNotes,
      updated_at: moment().toISOString(),
    });
    socketService.emitToPgAdmins(complaint.pg_id, SOCKET_EVENTS.COMPLAINT_STATUS_UPDATED, {
      id,
      complaint_number: complaint.complaint_number,
      old_status: oldStatus,
      status: newStatus,
      updated_at: moment().toISOString(),
    });

    auditService.log({
      pg_id: complaint.pg_id,
      branch_id: complaint.branch_id,
      user_id: user.id,
      user_name: user.name,
      user_role: user.role,
      module: AUDIT_MODULES.COMPLAINT,
      action: AUDIT_ACTIONS.STATUS_CHANGE,
      entity_type: 'complaint',
      entity_id: id,
      description: `Complaint #${complaint.complaint_number} status changed from ${oldStatus} to ${newStatus}`,
      old_values: { status: oldStatus },
      new_values: { status: newStatus, notes: resolutionNotes },
    });

    return {
      id,
      old_status: oldStatus,
      new_status: newStatus,
      message: `Complaint status updated to ${newStatus} successfully`,
    };
  };

  /**
   * 8. Add Complaint Progress Update / Resolution Note
   * Admin / Staff / Resident
   */
  addUpdate = async (id, data, files = [], user) => {
    const complaint = await db('complaints')
      .where('complaints.id', id)
      .whereNull('complaints.deleted_at')
      .join('pgs', 'complaints.pg_id', 'pgs.id')
      .select('complaints.*', 'pgs.owner_id')
      .first();

    if (!complaint) {
      throw new AppError('Complaint not found', HTTP_STATUS.NOT_FOUND);
    }

    if (user.role === ROLES.RESIDENT && complaint.resident_id !== user.id) {
      throw new AppError('Access denied.', HTTP_STATUS.FORBIDDEN);
    }

    if (user.role === ROLES.ADMIN && complaint.owner_id !== user.id) {
      throw new AppError('Access denied.', HTTP_STATUS.FORBIDDEN);
    }

    const updateText = (data.message || data.notes || '').trim();

    const historyId = await db.transaction(async (trx) => {
      const [hId] = await trx('complaint_history').insert({
        complaint_id: id,
        event_type: 'UPDATE_ADDED',
        description: updateText,
        performed_by: user.id,
      });

      if (files && files.length > 0) {
        const attachmentRecords = files.map((file) => ({
          complaint_id: id,
          file_name: file.filename,
          file_url: buildFileUrl('complaints', file.filename),
          file_type: file.mimetype,
          file_size: file.size,
        }));
        await trx('complaint_attachments').insert(attachmentRecords);
      }

      await trx('complaints').where({ id }).update({ updated_at: db.fn.now() });

      return hId;
    });

    return {
      id: historyId,
      message: 'Update note added successfully',
    };
  };

  /**
   * 9. Submit Complaint Feedback
   * Resident only (Only after status is RESOLVED)
   */
  submitFeedback = async (id, data, user) => {
    if (user.role !== ROLES.RESIDENT) {
      throw new AppError('Only residents can submit complaint feedback', HTTP_STATUS.FORBIDDEN);
    }

    const complaint = await db('complaints')
      .where('id', id)
      .whereNull('deleted_at')
      .first();

    if (!complaint) {
      throw new AppError('Complaint not found', HTTP_STATUS.NOT_FOUND);
    }

    if (complaint.resident_id !== user.id) {
      throw new AppError('Access denied. You can only give feedback for your own complaint.', HTTP_STATUS.FORBIDDEN);
    }

    if (complaint.status !== 'RESOLVED') {
      throw new AppError(
        'Feedback can only be submitted for RESOLVED complaints.',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Prevent duplicate feedback submission for the same complaint
    const existingFeedback = await db('complaint_feedback')
      .where('complaint_id', id)
      .first();

    if (existingFeedback) {
      throw new AppError(
        'Feedback has already been submitted for this complaint. Duplicate submissions are not allowed.',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const rating = parseInt(data.rating, 10);
    const comments = data.comments ? data.comments.trim().slice(0, 300) : null;

    const feedbackId = await db.transaction(async (trx) => {
      const [fId] = await trx('complaint_feedback').insert({
        complaint_id: id,
        resident_id: user.id,
        rating,
        comments,
      });

      await trx('complaint_history').insert({
        complaint_id: id,
        event_type: 'UPDATE_ADDED',
        description: `Resident submitted feedback rating: ${rating}/5 stars${comments ? ` - "${comments}"` : ''}`,
        performed_by: user.id,
      });

      return fId;
    });

    return {
      id: feedbackId,
      rating,
      message: 'Thank you! Your feedback has been submitted successfully.',
    };
  };
}

export default new ComplaintService();
