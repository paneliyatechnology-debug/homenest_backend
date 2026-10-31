import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';
import { buildFileUrl } from '../utils/url.js';
import emailService from './email.service.js';
import { deleteVisitorPhotoFile } from '../middlewares/upload.middleware.js';

class VisitorService {
  /**
   * Helper: Format current IST time string (e.g. "10:24 AM")
   */
  static formatCurrentTimeIST = () => {
    return new Date().toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  /**
   * Helper: Format date to YYYY-MM-DD
   */
  /**
   * Helper: Format current IST date (YYYY-MM-DD)
   */
  static getCurrentDateIST = () => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  };

  static formatDateStr = (dateInput) => {
    if (!dateInput) return null;
    if (typeof dateInput === 'string') {
      const match = dateInput.trim().match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  };

  /**
   * Helper: Generate unique visitor pass code
   */
  static generatePassCode = () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `VP-${today}-${rand}`;
  };

  /**
   * Helper: Generate QR Code data URL
   */
  /**
   * Helper: Generate QR Code PNG file in uploads/visitors/
   * Stores image locally and returns filename to store in DB
   * @param {Object|string} payload - Encoded information in the QR code
   * @param {string} pass_code - Visitor pass code used for unique filename
   * @returns {Promise<string>} Saved file name (e.g. 'qr-VP-20260324-A1B2C1.png')
   */
  static generateQrCodeFile = async (payload, pass_code) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'visitors');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const cleanPassCode = (pass_code || `pass-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const qrFilename = `qr-${cleanPassCode}.png`;
    const qrFilePath = path.join(uploadDir, qrFilename);

    const qrString = typeof payload === 'string' ? payload : JSON.stringify(payload);

    await QRCode.toFile(qrFilePath, qrString, {
      errorCorrectionLevel: 'H',
      type: 'png',
      margin: 2,
      width: 280,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    return qrFilename;
  };

  /**
   * Format a raw database row into clean API response
   */
  static formatVisitor = (row) => {
    if (!row) return null;

    const room_no = row.room_no || row.db_room_no || null;
    const room_type = row.room_type || row.db_room_type || null;
    const room_id = row.room_id || row.resident_room_id || null;

    const host_resident_display = room_no && row.resident_name
      ? `${room_no} (${row.resident_name})`
      : (row.resident_name || room_no || 'Unassigned');

    return {
      id: row.id,
      pass_code: row.pass_code || null,
      visitor_name: row.visitor_name,
      visitor_phone: row.visitor_phone,
      visitor_photo: row.visitor_photo || null,
      visitor_photo_url: buildFileUrl('visitors', row.visitor_photo),
      purpose: row.purpose,
      visit_date: VisitorService.formatDateStr(row.visit_date),
      valid_until: VisitorService.formatDateStr(row.valid_until || row.visit_date),
      entry_time: row.entry_time || null,
      exit_time: row.exit_time || null,
      last_entry_time: row.last_entry_time || row.entry_time || null,
      last_exit_time: row.last_exit_time || row.exit_time || null,
      status: row.status,
      is_on_site: row.status === 'in_office',
      total_entries: Number(row.total_entries) || 0,
      qr_code: buildFileUrl('visitors', row.qr_code) || row.qr_code || null,
      admin_notes: row.admin_notes || null,
      entry_exit_logs: row.entry_exit_logs || [],
      host_resident: host_resident_display,
      resident: {
        id: row.resident_id,
        name: row.resident_name || null,
        email: row.resident_email || null,
        phone: row.resident_phone || null,
      },
      room: {
        id: room_id,
        room_no: room_no,
        room_type: room_type,
      },
      pg: {
        id: row.pg_id,
        name: row.pg_name || null,
        address: row.pg_address || null,
        city: row.pg_city || null,
      },
      branch: {
        id: row.branch_id || row.pg_id,
        name: row.branch_name || row.pg_name,
      },
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  };

  /**
   * Base SQL query selecting visitor, resident, room, and PG fields
   */
  static baseQuery = () => {
    return db('visitors')
      .whereNull('visitors.deleted_at')
      .join('users as resident', (join) => {
        join.on('visitors.resident_id', '=', 'resident.id').andOnNull('resident.deleted_at');
      })
      .join('pgs', (join) => {
        join.on('visitors.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .leftJoin('branches', (join) => {
        join.on('visitors.branch_id', '=', 'branches.id').andOnNull('branches.deleted_at');
      })
      .leftJoin('resident_pg_stays as stay', (join) => {
        join.on('visitors.resident_id', '=', 'stay.resident_id')
          .andOn('stay.status', '=', db.raw('?', ['active']))
          .andOnNull('stay.deleted_at');
      })
      .leftJoin('rooms', (join) => {
        join.on(db.raw('COALESCE(visitors.room_id, stay.room_id)'), '=', 'rooms.id')
          .andOnNull('rooms.deleted_at');
      })
      .select(
        'visitors.*',
        'resident.name as resident_name',
        'resident.email as resident_email',
        'resident.phone as resident_phone',
        'pgs.name as pg_name',
        db.raw('COALESCE(branches.name, pgs.name) as branch_name'),
        'pgs.address as pg_address',
        'pgs.city as pg_city',
        'pgs.owner_id',
        'rooms.id as resident_room_id',
        'rooms.room_no',
        'rooms.room_type'
      );
  };

  /**
   * Create a new visitor request / pass
   * Resident creation: defaults to status 'pending' (requires admin approval)
   * Admin creation: defaults to status 'approved' (auto-generates pass code and QR code)
   */
  create = async (data, user, file = null) => {
    const is_resident = user.role === ROLES.RESIDENT;
    const is_admin = [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role);

    let resident_id = is_resident ? user.id : Number(data.resident_id);
    if (!resident_id) {
      throw new AppError('Host resident ID is required', HTTP_STATUS.BAD_REQUEST);
    }

    // Verify resident exists
    const resident = await db('users').where({ id: resident_id }).whereNull('deleted_at').first();
    if (!resident) {
      throw new AppError('Host resident not found', HTTP_STATUS.NOT_FOUND);
    }

    // Auto-resolve resident's active stay (room and PG facility)
    const active_stay = await db('resident_pg_stays')
      .where({ 'resident_pg_stays.resident_id': resident_id, 'resident_pg_stays.status': 'active' })
      .whereNull('resident_pg_stays.deleted_at')
      .leftJoin('rooms', 'resident_pg_stays.room_id', 'rooms.id')
      .leftJoin('pgs', 'resident_pg_stays.pg_id', 'pgs.id')
      .select(
        'resident_pg_stays.id as stay_id',
        'resident_pg_stays.pg_id',
        'resident_pg_stays.branch_id',
        'resident_pg_stays.room_id',
        'rooms.room_no',
        'rooms.room_type',
        'pgs.name as pg_name',
        'pgs.address as pg_address',
        'pgs.owner_id'
      )
      .orderBy('resident_pg_stays.id', 'desc')
      .first();

    const pg_id = data.pg_id ? Number(data.pg_id) : (active_stay?.pg_id || user.pg_id);
    if (!pg_id) {
      throw new AppError('PG facility branch is required. Resident must be assigned to an active stay or specified', HTTP_STATUS.BAD_REQUEST);
    }

    const room_id = data.room_id ? Number(data.room_id) : (active_stay?.room_id || null);
    const room_no = active_stay?.room_no || null;
    const room_type = active_stay?.room_type || null;

    // Check branch ownership for Admin
    if (is_admin && user.role === ROLES.ADMIN) {
      const targetPg = await db('pgs').where({ id: pg_id }).whereNull('deleted_at').first();
      if (!targetPg || targetPg.owner_id !== user.id) {
        throw new AppError('Unauthorized access to this PG branch', HTTP_STATUS.FORBIDDEN);
      }
    }

    // Status logic:
    // If resident creates: strictly 'pending'
    // If admin creates: default to 'approved' (or explicitly chosen status like 'in_office')
    let status = 'pending';
    if (is_admin) {
      status = data.status || 'approved';
    }

    const pass_code = VisitorService.generatePassCode();
    let qr_code = null;

    // Generate QR Code PNG image in uploads/visitors/ if approved or in_office
    if (['approved', 'in_office'].includes(status)) {
      qr_code = await VisitorService.generateQrCodeFile(
        {
          type: 'HOMENEST_VISITOR_PASS',
          pass_code,
          visitor_name: data.visitor_name,
          visitor_phone: data.visitor_phone,
          resident_name: resident.name,
          room_no: room_no || 'Unassigned',
          visit_date: VisitorService.formatDateStr(data.visit_date),
          pg_id,
        },
        pass_code
      );
    }

    const visitor_photo = file ? file.filename : (data.visitor_photo || null);

    let branch_id = data.branch_id ? Number(data.branch_id) : (active_stay?.branch_id || null);
    if (!branch_id) {
      const defaultBranch = await db('branches').where({ pg_id }).whereNull('deleted_at').orderBy('id', 'asc').first();
      if (defaultBranch) branch_id = defaultBranch.id;
    }

    const visit_date = VisitorService.formatDateStr(data.visit_date) || VisitorService.getCurrentDateIST();
    const valid_until = data.valid_until ? VisitorService.formatDateStr(data.valid_until) : visit_date;
    const initial_entry_time = data.entry_time || (status === 'in_office' ? VisitorService.formatCurrentTimeIST() : null);

    const [id] = await db('visitors').insert({
      pass_code,
      visitor_name: data.visitor_name,
      visitor_phone: data.visitor_phone,
      visitor_photo,
      resident_id,
      pg_id,
      branch_id,
      room_id,
      purpose: data.purpose || 'Meeting',
      visit_date,
      valid_until,
      entry_time: initial_entry_time,
      last_entry_time: initial_entry_time,
      exit_time: data.exit_time || null,
      last_exit_time: data.exit_time || null,
      status,
      total_entries: status === 'in_office' ? 1 : 0,
      qr_code,
      admin_notes: data.admin_notes || null,
      created_by: user.id,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    if (status === 'in_office') {
      await db('visitor_logs').insert({
        visitor_id: id,
        pg_id,
        branch_id: branch_id || null,
        pass_code,
        type: 'entry',
        log_date: visit_date,
        log_time: initial_entry_time || VisitorService.formatCurrentTimeIST(),
        gate_name: 'Main Gate',
        logged_by: user.id || null,
        notes: 'Initial check-in upon creation',
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
    }

    const createdRecord = await this.findById(id);

    // If created directly as approved, dispatch pass email to resident with QR code
    if (status === 'approved' && resident.email) {
      try {
        await emailService.sendVisitorPassApprovedEmail({
          residentEmail: resident.email,
          residentName: resident.name,
          visitorName: data.visitor_name,
          visitorPhone: data.visitor_phone,
          purpose: data.purpose || 'Meeting',
          visitDate: VisitorService.formatDateStr(data.visit_date),
          entryTime: data.entry_time || 'On Arrival',
          roomNo: room_no,
          roomType: room_type,
          pgName: active_stay?.pg_name || null,
          pgAddress: active_stay?.pg_address || null,
          passCode: pass_code,
          qrCodeUrl: buildFileUrl('visitors', qr_code),
          qrCodeFilename: qr_code,
          qrCodeDataUrl: qr_code,
        });
      } catch (err) {
        console.warn('[Warning] Failed to enqueue visitor pass email:', err.message);
      }
    }

    return createdRecord;
  };

  /**
   * Get all visitor records with filtering, searching, and pagination.
   * Shared by both Admin and Resident:
   * - Admin: views all visitors across their managed PG(s)
   * - Resident: automatically scoped to visitors where resident_id === user.id
   */
  findAll = async (options = {}) => {
    const {
      owner_id,
      resident_id,
      pg_id,
      branch_id,
      status,
      purpose,
      start_date,
      end_date,
      search,
      page = 1,
      limit = 10,
    } = options;

    const offset = (Number(page) - 1) * Number(limit);

    const applyFilters = (qb) => {
      qb.whereNull('visitors.deleted_at');

      if (resident_id) {
        qb.where('visitors.resident_id', resident_id);
      }
      if (owner_id) {
        qb.where('pgs.owner_id', owner_id);
      }
      if (pg_id) {
        qb.where('visitors.pg_id', pg_id);
      }
      if (branch_id) {
        qb.where('visitors.branch_id', branch_id);
      }
      if (purpose && purpose !== 'all' && purpose !== 'All') {
        qb.where('visitors.purpose', purpose);
      }
      if (status && status !== 'all' && status !== 'All') {
        qb.where('visitors.status', status);
      }
      if (start_date) {
        qb.where('visitors.visit_date', '>=', start_date);
      }
      if (end_date) {
        qb.where('visitors.visit_date', '<=', end_date);
      }
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        qb.where((builder) => {
          builder
            .where('visitors.visitor_name', 'like', term)
            .orWhere('visitors.visitor_phone', 'like', term)
            .orWhere('visitors.pass_code', 'like', term)
            .orWhere('rooms.room_no', 'like', term)
            .orWhere('resident.name', 'like', term);
        });
      }
    };

    const countQuery = db('visitors')
      .join('users as resident', 'visitors.resident_id', 'resident.id')
      .join('pgs', 'visitors.pg_id', 'pgs.id')
      .leftJoin('resident_pg_stays as stay', (join) => {
        join.on('visitors.resident_id', '=', 'stay.resident_id')
          .andOn('stay.status', '=', db.raw('?', ['active']))
          .andOnNull('stay.deleted_at');
      })
      .leftJoin('rooms', (join) => {
        join.on(db.raw('COALESCE(visitors.room_id, stay.room_id)'), '=', 'rooms.id')
          .andOnNull('rooms.deleted_at');
      })
      .modify(applyFilters)
      .count('visitors.id as total')
      .first();

    const dataQuery = VisitorService.baseQuery()
      .modify(applyFilters)
      .orderBy('visitors.id', 'desc')
      .limit(Number(limit))
      .offset(offset);

    const [countResult, rows] = await Promise.all([countQuery, dataQuery]);

    const total = parseInt(countResult?.total || 0, 10);
    const total_pages = Math.ceil(total / Number(limit)) || 1;

    return {
      visitors: rows.map(VisitorService.formatVisitor),
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        total_pages,
      },
    };
  };

  /**
   * Find visitor record by ID
   */
  findById = async (id, user = null) => {
    const row = await VisitorService.baseQuery()
      .where('visitors.id', id)
      .first();

    if (!row) {
      throw new AppError('Visitor record not found', HTTP_STATUS.NOT_FOUND);
    }

    // Role-based authorization check
    if (user) {
      if (user.role === ROLES.RESIDENT && row.resident_id !== user.id) {
        throw new AppError('Access denied. You can only view your own visitors', HTTP_STATUS.FORBIDDEN);
      }
      if (user.role === ROLES.ADMIN && row.owner_id !== user.id) {
        throw new AppError('Access denied. Visitor belongs to another property', HTTP_STATUS.FORBIDDEN);
      }
    }

    // Fetch full movement audit trail (all entries and exits)
    const logs = await db('visitor_logs')
      .where({ visitor_id: id })
      .whereNull('visitor_logs.deleted_at')
      .leftJoin('users as guard', 'visitor_logs.logged_by', 'guard.id')
      .select('visitor_logs.*', 'guard.name as logged_by_name')
      .orderBy('visitor_logs.id', 'desc');

    row.entry_exit_logs = logs.map(l => ({
      id: l.id,
      type: l.type,
      direction: l.type === 'entry' ? 'IN' : 'OUT',
      log_date: VisitorService.formatDateStr(l.log_date),
      log_time: l.log_time,
      gate_name: l.gate_name,
      logged_by_name: l.logged_by_name || 'System Gate',
      notes: l.notes || null,
      created_at: l.created_at,
    }));

    return VisitorService.formatVisitor(row);
  };

  /**
   * Find visitor pass by pass code (Used by pass viewer and gate QR scanner)
   */
  findByPassCode = async (pass_code) => {
    const row = await VisitorService.baseQuery()
      .where('visitors.pass_code', pass_code)
      .first();

    if (!row) {
      throw new AppError('Visitor pass not found or invalid pass code', HTTP_STATUS.NOT_FOUND);
    }

    const logs = await db('visitor_logs')
      .where({ visitor_id: row.id })
      .whereNull('visitor_logs.deleted_at')
      .leftJoin('users as guard', 'visitor_logs.logged_by', 'guard.id')
      .select('visitor_logs.*', 'guard.name as logged_by_name')
      .orderBy('visitor_logs.id', 'desc');

    row.entry_exit_logs = logs.map(l => ({
      id: l.id,
      type: l.type,
      direction: l.type === 'entry' ? 'IN' : 'OUT',
      log_date: VisitorService.formatDateStr(l.log_date),
      log_time: l.log_time,
      gate_name: l.gate_name,
      logged_by_name: l.logged_by_name || 'System Gate',
      notes: l.notes || null,
      created_at: l.created_at,
    }));

    return VisitorService.formatVisitor(row);
  };

  /**
   * Update visitor record
   * If Resident: can only update if status is 'pending'
   * If Admin: can update anytime
   */
  update = async (id, data, user, file = null) => {
    const existing = await db('visitors')
      .where({ 'visitors.id': id })
      .whereNull('visitors.deleted_at')
      .join('pgs', 'visitors.pg_id', 'pgs.id')
      .select('visitors.*', 'pgs.owner_id')
      .first();

    if (!existing) {
      throw new AppError('Visitor record not found', HTTP_STATUS.NOT_FOUND);
    }

    // Check permissions
    if (user.role === ROLES.RESIDENT) {
      if (existing.resident_id !== user.id) {
        throw new AppError('Access denied. You can only update your own visitors', HTTP_STATUS.FORBIDDEN);
      }
      if (existing.status !== 'pending') {
        throw new AppError('Approved or processed visitor passes cannot be edited by residents. Please contact admin.', HTTP_STATUS.FORBIDDEN);
      }
    } else if (user.role === ROLES.ADMIN && existing.owner_id !== user.id) {
      throw new AppError('Access denied to this property record', HTTP_STATUS.FORBIDDEN);
    }

    const updatePayload = {
      updated_at: db.fn.now(),
    };

    if (data.visitor_name !== undefined) updatePayload.visitor_name = data.visitor_name;
    if (data.visitor_phone !== undefined) updatePayload.visitor_phone = data.visitor_phone;
    if (data.purpose !== undefined) updatePayload.purpose = data.purpose;
    if (data.visit_date !== undefined) updatePayload.visit_date = VisitorService.formatDateStr(data.visit_date);
    if (data.entry_time !== undefined) updatePayload.entry_time = data.entry_time;
    if (data.exit_time !== undefined) updatePayload.exit_time = data.exit_time;
    if (data.admin_notes !== undefined) updatePayload.admin_notes = data.admin_notes;

    // Only Admin can update status, room, resident, branch via update API
    if ([ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) {
      if (data.status !== undefined) updatePayload.status = data.status;
      if (data.branch_id !== undefined) updatePayload.branch_id = Number(data.branch_id);
    }

    if (file) {
      if (existing.visitor_photo) {
        deleteVisitorPhotoFile(existing.visitor_photo);
      }
      updatePayload.visitor_photo = file.filename;
    }

    await db('visitors').where({ id }).update(updatePayload);

    return await this.findById(id);
  };

  /**
   * Change visitor pass status (Approve, Reject, In Office, Left)
   * Only Admin / Super Admin can change status.
   * When approved: Generates QR Code and sends email to Resident.
   */
  updateStatus = async (id, statusPayload, user) => {
    const status = typeof statusPayload === 'string' ? statusPayload : statusPayload?.status;
    const admin_notes = typeof statusPayload === 'object' ? statusPayload?.admin_notes : undefined;

    const existing = await db('visitors')
      .where('visitors.id', id)
      .whereNull('visitors.deleted_at')
      .join('users as resident', 'visitors.resident_id', 'resident.id')
      .join('pgs', 'visitors.pg_id', 'pgs.id')
      .leftJoin('resident_pg_stays as stay', (join) => {
        join.on('visitors.resident_id', '=', 'stay.resident_id')
          .andOn('stay.status', '=', db.raw('?', ['active']))
          .andOnNull('stay.deleted_at');
      })
      .leftJoin('rooms', (join) => {
        join.on(db.raw('COALESCE(visitors.room_id, stay.room_id)'), '=', 'rooms.id')
          .andOnNull('rooms.deleted_at');
      })
      .select(
        'visitors.*',
        'resident.name as resident_name',
        'resident.email as resident_email',
        'pgs.name as pg_name',
        'pgs.address as pg_address',
        'pgs.owner_id',
        'rooms.room_no',
        'rooms.room_type'
      )
      .first();

    if (!existing) {
      throw new AppError('Visitor record not found', HTTP_STATUS.NOT_FOUND);
    }

    if (user.role === ROLES.ADMIN && existing.owner_id !== user.id) {
      throw new AppError('Access denied to this property record', HTTP_STATUS.FORBIDDEN);
    }

    const updatePayload = {
      status,
      updated_at: db.fn.now(),
    };

    if (admin_notes !== undefined) {
      updatePayload.admin_notes = admin_notes;
    }

    let pass_code = existing.pass_code;
    let qr_code = existing.qr_code;

    // When transitioning to approved: generate pass code & QR code if not present
    if (status === 'approved') {
      if (!pass_code) {
        pass_code = VisitorService.generatePassCode();
        updatePayload.pass_code = pass_code;
      }

      if (!qr_code || qr_code.startsWith('data:')) {
        qr_code = await VisitorService.generateQrCodeFile(
          {
            type: 'HOMENEST_VISITOR_PASS',
            pass_code,
            visitor_name: existing.visitor_name,
            visitor_phone: existing.visitor_phone,
            resident_name: existing.resident_name,
            room_no: existing.room_no || 'Unassigned',
            visit_date: VisitorService.formatDateStr(existing.visit_date),
            pg_id: existing.pg_id,
          },
          pass_code
        );
        updatePayload.qr_code = qr_code;
      }
    } else if (status === 'in_office') {
      const currentTime = VisitorService.formatCurrentTimeIST();
      const currentDate = VisitorService.getCurrentDateIST();
      const newTotalEntries = (Number(existing.total_entries) || 0) + 1;
      updatePayload.entry_time = currentTime;
      updatePayload.last_entry_time = currentTime;
      updatePayload.total_entries = newTotalEntries;

      await db('visitor_logs').insert({
        visitor_id: id,
        pg_id: existing.pg_id,
        branch_id: existing.branch_id || null,
        pass_code: pass_code,
        type: 'entry',
        log_date: currentDate,
        log_time: currentTime,
        gate_name: 'Main Gate',
        logged_by: user.id || null,
        notes: `Manual entry recorded by Admin (${user.role})`,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
    } else if (status === 'left') {
      const currentTime = VisitorService.formatCurrentTimeIST();
      const currentDate = VisitorService.getCurrentDateIST();
      updatePayload.exit_time = currentTime;
      updatePayload.last_exit_time = currentTime;

      await db('visitor_logs').insert({
        visitor_id: id,
        pg_id: existing.pg_id,
        branch_id: existing.branch_id || null,
        pass_code: pass_code,
        type: 'exit',
        log_date: currentDate,
        log_time: currentTime,
        gate_name: 'Main Gate',
        logged_by: user.id || null,
        notes: `Manual exit recorded by Admin (${user.role})`,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
    }

    await db('visitors').where({ id }).update(updatePayload);

    // If approved, send professional email with QR code to the host resident
    if (status === 'approved' && existing.resident_email) {
      try {
        await emailService.sendVisitorPassApprovedEmail({
          residentEmail: existing.resident_email,
          residentName: existing.resident_name,
          visitorName: existing.visitor_name,
          visitorPhone: existing.visitor_phone,
          purpose: existing.purpose,
          visitDate: VisitorService.formatDateStr(existing.visit_date),
          entryTime: existing.entry_time || 'On Arrival',
          roomNo: existing.room_no,
          roomType: existing.room_type,
          pgName: existing.pg_name,
          pgAddress: existing.pg_address,
          passCode: pass_code,
          qrCodeUrl: buildFileUrl('visitors', qr_code),
          qrCodeFilename: qr_code,
          qrCodeDataUrl: qr_code,
        });
      } catch (err) {
        console.warn('[Warning] Failed to enqueue visitor pass email on approval:', err.message);
      }
    }

    return await this.findById(id);
  };

  /**
   * Scan QR Code for Gate Entry / Exit Tracking
   * Workflow:
   * 1. If status is 'approved' -> Marks 'in_office' (Entry recorded)
   * 2. If status is 'in_office' -> Marks 'left' (Exit recorded)
   * 3. If status is 'left' -> Alerts already exited
   * 4. If status is 'pending' or 'rejected' -> Alerts access denied
   */
  scanQrCode = async (pass_code, user, options = {}) => {
    if (!pass_code || !pass_code.trim()) {
      throw new AppError('Pass code is required for QR scan', HTTP_STATUS.BAD_REQUEST);
    }

    let cleanCode = String(pass_code).trim();
    if (cleanCode.startsWith('{') && cleanCode.endsWith('}')) {
      try {
        const parsed = JSON.parse(cleanCode);
        if (parsed.pass_code) cleanCode = parsed.pass_code.trim();
      } catch {}
    }

    const existing = await db('visitors')
      .where('visitors.pass_code', cleanCode)
      .whereNull('visitors.deleted_at')
      .join('users as resident', 'visitors.resident_id', 'resident.id')
      .join('pgs', 'visitors.pg_id', 'pgs.id')
      .select(
        'visitors.*',
        'resident.name as resident_name',
        'resident.phone as resident_phone',
        'pgs.name as pg_name',
        'pgs.owner_id'
      )
      .first();

    if (!existing) {
      throw new AppError('Invalid QR code or visitor pass not found', HTTP_STATUS.NOT_FOUND);
    }

    // Role check if admin
    if (user.role === ROLES.ADMIN && existing.owner_id !== user.id) {
      throw new AppError('Access denied. Visitor belongs to another property branch', HTTP_STATUS.FORBIDDEN);
    }

    const currentDate = VisitorService.getCurrentDateIST();
    const currentTime = VisitorService.formatCurrentTimeIST();

    if (existing.status === 'pending') {
      throw new AppError('Visitor pass is still pending admin approval. Gate access cannot be granted.', HTTP_STATUS.BAD_REQUEST);
    }

    if (existing.status === 'rejected') {
      throw new AppError('Visitor pass was rejected by administration. Gate access denied.', HTTP_STATUS.BAD_REQUEST);
    }

    // Check time period authorization (visit_date to valid_until)
    const visitDateStr = VisitorService.formatDateStr(existing.visit_date);
    const validUntilStr = VisitorService.formatDateStr(existing.valid_until || existing.visit_date);

    if (currentDate < visitDateStr) {
      throw new AppError(
        `Visitor pass is not yet active. Authorized for visit date ${visitDateStr}.`,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    if (currentDate > validUntilStr) {
      throw new AppError(
        `Visitor pass has expired. Pass was valid until ${validUntilStr}. Please request a new pass.`,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Toggle multi-entry and exit:
    // If currently 'in_office' -> Visitor is inside -> Action: EXIT
    // If currently 'approved' or 'left' -> Visitor is outside -> Action: ENTRY
    const isCurrentlyInside = existing.status === 'in_office';

    if (isCurrentlyInside) {
      // Record EXIT
      await db('visitors')
        .where({ id: existing.id })
        .update({
          status: 'left',
          exit_time: currentTime,
          last_exit_time: currentTime,
          updated_at: db.fn.now(),
        });

      await db('visitor_logs').insert({
        visitor_id: existing.id,
        pg_id: existing.pg_id,
        branch_id: existing.branch_id || null,
        pass_code: existing.pass_code,
        type: 'exit',
        log_date: currentDate,
        log_time: currentTime,
        gate_name: options?.gate_name || 'Main Gate',
        logged_by: user.id || null,
        notes: options?.notes || `Exit recorded at ${currentTime}`,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

      const updated = await this.findById(existing.id);
      return {
        action: 'EXIT',
        direction: 'OUT',
        log_time: currentTime,
        log_date: currentDate,
        ...updated,
      };
    } else {
      // Record ENTRY (supports multiple entries within set time period)
      const newTotalEntries = (Number(existing.total_entries) || 0) + 1;

      await db('visitors')
        .where({ id: existing.id })
        .update({
          status: 'in_office',
          entry_time: currentTime,
          last_entry_time: currentTime,
          total_entries: newTotalEntries,
          updated_at: db.fn.now(),
        });

      await db('visitor_logs').insert({
        visitor_id: existing.id,
        pg_id: existing.pg_id,
        branch_id: existing.branch_id || null,
        pass_code: existing.pass_code,
        type: 'entry',
        log_date: currentDate,
        log_time: currentTime,
        gate_name: options?.gate_name || 'Main Gate',
        logged_by: user.id || null,
        notes: options?.notes || `Entry #${newTotalEntries} recorded at ${currentTime}`,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

      const updated = await this.findById(existing.id);
      return {
        action: 'ENTRY',
        direction: 'IN',
        log_time: currentTime,
        log_date: currentDate,
        ...updated,
      };
    }
  };

  /**
   * Delete visitor pass (Soft delete)
   * Resident: Can only delete if status is 'pending'
   * Admin: Can delete anytime
   */
  delete = async (id, user) => {
    const existing = await db('visitors')
      .where('visitors.id', id)
      .whereNull('visitors.deleted_at')
      .join('pgs', 'visitors.pg_id', 'pgs.id')
      .select('visitors.*', 'pgs.owner_id')
      .first();

    if (!existing) {
      throw new AppError('Visitor record not found', HTTP_STATUS.NOT_FOUND);
    }

    if (user.role === ROLES.RESIDENT) {
      if (existing.resident_id !== user.id) {
        throw new AppError('Access denied. You can only delete your own visitors', HTTP_STATUS.FORBIDDEN);
      }
      if (existing.status !== 'pending') {
        throw new AppError('Approved or active visitor passes cannot be deleted by residents. Please contact admin.', HTTP_STATUS.FORBIDDEN);
      }
    } else if (user.role === ROLES.ADMIN && existing.owner_id !== user.id) {
      throw new AppError('Access denied to this property record', HTTP_STATUS.FORBIDDEN);
    }

    await db('visitors').where({ id }).update({
      deleted_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    if (existing.visitor_photo) {
      deleteVisitorPhotoFile(existing.visitor_photo);
    }

    return true;
  };

  /**
   * Retrieve KPI statistics for Visitor Records dashboard
   * Cards:
   * - Total Visitors
   * - Today
   * - Active on-site (in_office)
   * - Pending Approval (pending)
   */
  getStats = async (options = {}) => {
    const { owner_id, resident_id, pg_id, branch_id } = options;

    const base_query = db('visitors')
      .whereNull('visitors.deleted_at')
      .join('pgs', 'visitors.pg_id', 'pgs.id')
      .modify((qb) => {
        if (owner_id) {
          qb.where('pgs.owner_id', owner_id);
        }
        if (resident_id) {
          qb.where('visitors.resident_id', resident_id);
        }
        if (pg_id) {
          qb.where('visitors.pg_id', pg_id);
        }
        if (branch_id) {
          qb.where('visitors.branch_id', branch_id);
        }
      });

    const todayDate = new Date().toISOString().split('T')[0];

    const [row] = await base_query.select(
      db.raw('COUNT(visitors.id) as total_visitors'),
      db.raw('COALESCE(SUM(CASE WHEN visitors.visit_date = ? THEN 1 ELSE 0 END), 0) as today', [todayDate]),
      db.raw("COALESCE(SUM(CASE WHEN visitors.status = 'in_office' THEN 1 ELSE 0 END), 0) as active_on_site"),
      db.raw("COALESCE(SUM(CASE WHEN visitors.status = 'pending' THEN 1 ELSE 0 END), 0) as pending_approval")
    );

    return {
      total_visitors: parseInt(row?.total_visitors, 10) || 0,
      today: parseInt(row?.today, 10) || 0,
      active_on_site: parseInt(row?.active_on_site, 10) || 0,
      pending_approval: parseInt(row?.pending_approval, 10) || 0,
    };
  };

  /**
   * Get all entry and exit movement logs for a specific visitor
   */
  getVisitorLogs = async (visitor_id, user = null) => {
    const visitor = await this.findById(visitor_id, user);

    const logs = await db('visitor_logs')
      .where({ visitor_id })
      .whereNull('visitor_logs.deleted_at')
      .leftJoin('users as guard', 'visitor_logs.logged_by', 'guard.id')
      .select('visitor_logs.*', 'guard.name as logged_by_name')
      .orderBy('visitor_logs.id', 'desc');

    return {
      visitor: {
        id: visitor.id,
        pass_code: visitor.pass_code,
        visitor_name: visitor.visitor_name,
        visitor_phone: visitor.visitor_phone,
        status: visitor.status,
        is_on_site: visitor.is_on_site,
        total_entries: visitor.total_entries,
        visit_date: visitor.visit_date,
        valid_until: visitor.valid_until,
      },
      total_logs: logs.length,
      logs: logs.map(l => ({
        id: l.id,
        type: l.type,
        direction: l.type === 'entry' ? 'IN' : 'OUT',
        log_date: VisitorService.formatDateStr(l.log_date),
        log_time: l.log_time,
        gate_name: l.gate_name,
        logged_by_name: l.logged_by_name || 'System Gate',
        notes: l.notes || null,
        created_at: l.created_at,
      })),
    };
  };

  /**
   * Real-time gate monitoring: list all visitor entry & exit activity across property / branch
   */
  getGateLogs = async (options = {}) => {
    const {
      owner_id,
      pg_id,
      branch_id,
      visitor_id,
      resident_id,
      type,
      date,
      search,
      page = 1,
      limit = 20,
    } = options;

    const current_page = Math.max(1, parseInt(page, 10) || 1);
    const per_page = Math.max(1, parseInt(limit, 10) || 20);
    const offset = (current_page - 1) * per_page;

    const base_query = db('visitor_logs')
      .whereNull('visitor_logs.deleted_at')
      .join('visitors', 'visitor_logs.visitor_id', 'visitors.id')
      .join('pgs', 'visitor_logs.pg_id', 'pgs.id')
      .leftJoin('branches', 'visitor_logs.branch_id', 'branches.id')
      .leftJoin('users as resident', 'visitors.resident_id', 'resident.id')
      .leftJoin('resident_pg_stays as stay', (join) => {
        join.on('visitors.resident_id', '=', 'stay.resident_id')
          .andOn('stay.status', '=', db.raw('?', ['active']))
          .andOnNull('stay.deleted_at');
      })
      .leftJoin('rooms', (join) => {
        join.on(db.raw('COALESCE(visitors.room_id, stay.room_id)'), '=', 'rooms.id')
          .andOnNull('rooms.deleted_at');
      })
      .leftJoin('users as guard', 'visitor_logs.logged_by', 'guard.id')
      .modify((qb) => {
        if (owner_id) qb.where('pgs.owner_id', owner_id);
        if (pg_id) qb.where('visitor_logs.pg_id', pg_id);
        if (branch_id) qb.where('visitor_logs.branch_id', branch_id);
        if (visitor_id) qb.where('visitor_logs.visitor_id', visitor_id);
        if (resident_id) qb.where('visitors.resident_id', resident_id);
        if (type && type !== 'all') qb.where('visitor_logs.type', type);
        if (date) qb.where('visitor_logs.log_date', date);
        if (search) {
          const term = `%${search}%`;
          qb.where((sqb) => {
            sqb.where('visitors.visitor_name', 'like', term)
              .orWhere('visitors.visitor_phone', 'like', term)
              .orWhere('visitor_logs.pass_code', 'like', term)
              .orWhere('resident.name', 'like', term);
          });
        }
      });

    const count_res = await base_query.clone().count('visitor_logs.id as total').first();
    const total = count_res ? parseInt(count_res.total, 10) : 0;

    const raw_logs = await base_query
      .clone()
      .select(
        'visitor_logs.*',
        'visitors.visitor_name',
        'visitors.visitor_phone',
        'visitors.visitor_photo',
        'visitors.resident_id',
        'rooms.room_no',
        'visitors.purpose',
        'resident.name as resident_name',
        'pgs.name as pg_name',
        'branches.name as branch_name',
        'guard.name as logged_by_name'
      )
      .orderBy('visitor_logs.id', 'desc')
      .limit(per_page)
      .offset(offset);

    return {
      logs: raw_logs.map(l => ({
        id: l.id,
        visitor_id: l.visitor_id,
        resident_id: l.resident_id,
        pass_code: l.pass_code,
        type: l.type,
        direction: l.type === 'entry' ? 'IN' : 'OUT',
        log_date: VisitorService.formatDateStr(l.log_date),
        log_time: l.log_time,
        gate_name: l.gate_name,
        visitor_name: l.visitor_name,
        visitor_phone: l.visitor_phone,
        visitor_photo_url: buildFileUrl('visitors', l.visitor_photo),
        room_no: l.room_no,
        purpose: l.purpose,
        resident_name: l.resident_name,
        branch_name: l.branch_name || l.pg_name,
        logged_by_name: l.logged_by_name || 'System Gate',
        notes: l.notes,
        created_at: l.created_at,
      })),
      pagination: {
        total,
        page: current_page,
        limit: per_page,
        total_pages: Math.ceil(total / per_page) || 1,
      },
    };
  };
}

export default new VisitorService();
