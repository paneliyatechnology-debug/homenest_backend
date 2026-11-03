import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import moment from 'moment';
import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES, STAFF_ROLES } from '../constants/index.js';
import { syncBranchStats } from './branch.service.js';
import { buildFileUrl } from '../utils/url.js';
import socketService, { SOCKET_EVENTS } from './socket.service.js';

/**
 * Format timestamp for departure stepper timeline: "05 March 2026 | 10:30 AM" using moment
 *
 * @param {string|Date} dateVal - Input date/timestamp
 * @returns {string|null} Formatted date and time string
 */
const formatTimelineTimestamp = (dateVal) => {
  if (!dateVal) return null;
  const m = moment(dateVal);
  return m.isValid() ? m.format('DD MMMM YYYY | hh:mm A') : String(dateVal);
};

/**
 * Format date for tabular reports and review screens: "31 Dec 2026" using moment
 *
 * @param {string|Date} dateVal - Input date value
 * @returns {string|null} Short formatted date string
 */
const formatDisplayDate = (dateVal) => {
  if (!dateVal) return null;
  const m = moment(dateVal);
  return m.isValid() ? m.format('DD MMM YYYY') : String(dateVal);
};

/**
 * Helper to resolve user branches and multi-branch tenancy
 */
const resolveUserBranches = async (user, trx) => {
  const query = trx ? trx : db;

  if (user.role === ROLES.SUPER_ADMIN) {
    const pg = await query('pgs').whereNull('deleted_at').orderBy('id', 'asc').first();
    return { isSuperAdmin: true, branchIds: null, pgId: pg?.id || null, pgName: pg?.name || 'HomeNest PG' };
  }

  if (user.role === ROLES.ADMIN) {
    let pg = await query('pgs').where({ owner_id: user.id }).whereNull('deleted_at').first();
    if (!pg && user.pg_id) {
      pg = await query('pgs').where({ id: user.pg_id }).whereNull('deleted_at').first();
    }
    if (!pg) {
      const staffBranch = await query('user_branches').where({ user_id: user.id }).first();
      if (staffBranch) {
        const branch = await query('branches').where({ id: staffBranch.branch_id }).first();
        if (branch) pg = await query('pgs').where({ id: branch.pg_id }).whereNull('deleted_at').first();
      }
    }
    if (!pg) {
      throw new AppError('No PG associated with this Admin account', HTTP_STATUS.BAD_REQUEST);
    }

    const branches = await query('branches')
      .where({ pg_id: pg.id })
      .whereNull('deleted_at')
      .select('id');
    const branchIds = branches.map((b) => b.id);
    return { isSuperAdmin: false, branchIds, pgId: pg.id, pgName: pg.name || 'HomeNest PG' };
  }

  if (user.role === ROLES.STAFF || user.staff_role === STAFF_ROLES.BRANCH_MANAGER || user.role === ROLES.BRANCH_MANAGER) {
    const assignedBranches = await query('user_branches').where({ user_id: user.id }).select('branch_id');
    const branchIds = assignedBranches.map((b) => b.branch_id);
    let pg = null;
    if (user.pg_id) {
      pg = await query('pgs').where({ id: user.pg_id }).whereNull('deleted_at').first();
    } else if (branchIds.length > 0) {
      const branch = await query('branches').where({ id: branchIds[0] }).first();
      if (branch) pg = await query('pgs').where({ id: branch.pg_id }).whereNull('deleted_at').first();
    }
    return { isSuperAdmin: false, branchIds, pgId: pg?.id || user.pg_id || null, pgName: pg?.name || 'HomeNest PG' };
  }

  if (user.role === ROLES.RESIDENT) {
    const activeStay = await query('resident_pg_stays')
      .where({ resident_id: user.id, status: 'active' })
      .whereNull('deleted_at')
      .first();

    if (!activeStay) {
      throw new AppError('No active stay found for this resident', HTTP_STATUS.BAD_REQUEST);
    }
    return { isSuperAdmin: false, branchIds: [activeStay.branch_id], pgId: activeStay.pg_id, stayId: activeStay.id };
  }

  return { isSuperAdmin: false, branchIds: [], pgId: null };
};

/**
 * Service managing resident stays across multiple PGs.
 * Supports residents moving between PGs over time (e.g. Month 1 at PG A, Month 3 at PG B),
 * tracking active vs past stays, rooms, beds, and rent/deposit agreements.
 */
class StayService {
  /**
   * Find stay record by ID with associated PG, room, and resident details
   * @param {number|string} id - Stay record ID
   * @param {object} [trx=null] - Optional Knex transaction instance
   * @returns {Promise<object|null>}
   */
  findById = async (id, trx = null) => {
    const query = trx ? db('resident_pg_stays').transacting(trx) : db('resident_pg_stays');

    return await query
      .where('resident_pg_stays.id', id)
      .whereNull('resident_pg_stays.deleted_at')
      .join('pgs', (join) => {
        join.on('resident_pg_stays.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .join('rooms', (join) => {
        join.on('resident_pg_stays.room_id', '=', 'rooms.id').andOnNull('rooms.deleted_at');
      })
      .join('users as resident', (join) => {
        join.on('resident_pg_stays.resident_id', '=', 'resident.id').andOnNull('resident.deleted_at');
      })
      .join('users as owner', (join) => {
        join.on('pgs.owner_id', '=', 'owner.id').andOnNull('owner.deleted_at');
      })
      .leftJoin('branches', (join) => {
        join.on('resident_pg_stays.branch_id', '=', 'branches.id').andOnNull('branches.deleted_at');
      })
      .leftJoin('buildings', 'rooms.building_id', 'buildings.id')
      .leftJoin('floors', 'rooms.floor_id', 'floors.id')
      .select(
        'resident_pg_stays.*',
        'resident_pg_stays.branch_id',
        db.raw('COALESCE(branches.name, pgs.name) as branch_name'),
        'rooms.room_no as room_number',
        'rooms.room_type',
        'floors.floor_number as room_floor',
        'buildings.name as room_building',
        'pgs.name as pg_name',
        'pgs.type as pg_type',
        'pgs.address as pg_address',
        'pgs.city as pg_city',
        'pgs.state as pg_state',
        'pgs.pincode as pg_pincode',
        'pgs.phone as pg_phone',
        'owner.id as owner_id',
        'owner.name as owner_name',
        'owner.phone as owner_phone',
        'resident.name as resident_name',
        'resident.email as resident_email',
        'resident.phone as resident_phone'
      )
      .first();
  };

  /**
   * Vacate / Check-out resident from PG stay
   * Updates room status to 'vacant' if no remaining active residents in this room.
   * @param {number|string} stay_id
   * @param {object} options
   * @returns {Promise<object>} Updated stay record
   */
  vacateStay = async (stay_id, { check_out_date = null, notes = null } = {}) => {
    const stay = await this.findById(stay_id);
    if (!stay) {
      throw new AppError('Stay record not found', HTTP_STATUS.NOT_FOUND);
    }

    if (stay.status !== 'active') {
      throw new AppError(`Stay is already marked as ${stay.status}`, HTTP_STATUS.BAD_REQUEST);
    }

    const effective_check_out = check_out_date || moment().format('YYYY-MM-DD');

    const updated_notes = notes
      ? (stay.notes ? `${stay.notes} | ${notes}` : notes)
      : stay.notes;

    await db.transaction(async (trx) => {
      await trx('resident_pg_stays')
        .where({ id: stay_id })
        .update({
          check_out_date: effective_check_out,
          status: 'completed',
          notes: updated_notes,
          updated_at: db.fn.now(),
        });

      // If no other active resident in this room, set room to vacant
      const remaining_active = await trx('resident_pg_stays')
        .where({ room_id: stay.room_id, status: 'active' })
        .whereNull('deleted_at')
        .whereNot({ id: stay_id })
        .first();

      if (!remaining_active) {
        await trx('rooms')
          .where({ id: stay.room_id })
          .update({ status: 'vacant', updated_at: db.fn.now() });

        const roomRecord = await trx('rooms').where({ id: stay.room_id }).first();
        if (roomRecord && roomRecord.branch_id) {
          await syncBranchStats(roomRecord.branch_id, trx);
        }
      }
    });

    return await this.findById(stay_id);
  };

  /**
   * Get all stay records for a resident with pagination, filters, and is_current_stay flag.
   * @param {number|string} resident_id
   * @param {object} options
   * @returns {Promise<{ stays: Array, pagination: object }>}
   */
  getResidentStayHistory = async (
    resident_id,
    { status = '', pg_id = null, branch_id = null, search = '', page = 1, limit = 10 } = {}
  ) => {
    const offset = (page - 1) * limit;

    let query = db('resident_pg_stays')
      .where('resident_pg_stays.resident_id', resident_id)
      .whereNull('resident_pg_stays.deleted_at')
      .join('pgs', (join) => {
        join.on('resident_pg_stays.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .leftJoin('branches', (join) => {
        join.on('resident_pg_stays.branch_id', '=', 'branches.id').andOnNull('branches.deleted_at');
      })
      .join('rooms', (join) => {
        join.on('resident_pg_stays.room_id', '=', 'rooms.id').andOnNull('rooms.deleted_at');
      })
      .join('users as owner', (join) => {
        join.on('pgs.owner_id', '=', 'owner.id').andOnNull('owner.deleted_at');
      })
      .leftJoin('buildings', 'rooms.building_id', 'buildings.id')
      .leftJoin('floors', 'rooms.floor_id', 'floors.id')
      .select(
        'resident_pg_stays.id',
        'resident_pg_stays.resident_id',
        'resident_pg_stays.pg_id',
        'resident_pg_stays.branch_id',
        db.raw('COALESCE(branches.name, pgs.name) as branch_name'),
        'pgs.name as pg_name',
        'pgs.type as pg_type',
        'pgs.address as pg_address',
        'pgs.city as pg_city',
        'pgs.state as pg_state',
        'pgs.pincode as pg_pincode',
        'pgs.phone as pg_phone',
        'owner.name as pg_owner_name',
        'owner.phone as pg_owner_phone',
        'resident_pg_stays.room_id',
        'rooms.room_no as room_number',
        'rooms.room_type',
        'floors.floor_number as room_floor',
        'buildings.name as room_building',
        'resident_pg_stays.bed_number',
        'resident_pg_stays.monthly_rent',
        'resident_pg_stays.security_deposit',
        'resident_pg_stays.check_in_date',
        'resident_pg_stays.check_out_date',
        'resident_pg_stays.status',
        'resident_pg_stays.notes',
        'resident_pg_stays.created_at',
        'resident_pg_stays.updated_at'
      );

    let count_query = db('resident_pg_stays')
      .where('resident_pg_stays.resident_id', resident_id)
      .whereNull('resident_pg_stays.deleted_at')
      .join('pgs', (join) => {
        join.on('resident_pg_stays.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .join('rooms', (join) => {
        join.on('resident_pg_stays.room_id', '=', 'rooms.id').andOnNull('rooms.deleted_at');
      })
      .count('resident_pg_stays.id as total');

    if (status) {
      query = query.where('resident_pg_stays.status', status);
      count_query = count_query.where('resident_pg_stays.status', status);
    }

    if (pg_id) {
      query = query.where('resident_pg_stays.pg_id', pg_id);
      count_query = count_query.where('resident_pg_stays.pg_id', pg_id);
    }

    if (branch_id) {
      query = query.where('resident_pg_stays.branch_id', branch_id);
      count_query = count_query.where('resident_pg_stays.branch_id', branch_id);
    }

    if (search) {
      const search_filter = (q) => {
        q.where('rooms.room_no', 'like', `%${search}%`)
          .orWhere('pgs.name', 'like', `%${search}%`)
          .orWhere('pgs.city', 'like', `%${search}%`);
      };
      query = query.where(search_filter);
      count_query = count_query.where(search_filter);
    }

    const [raw_stays, total_result] = await Promise.all([
      query
        .orderBy([
          { column: 'resident_pg_stays.check_in_date', order: 'desc' },
          { column: 'resident_pg_stays.id', order: 'desc' },
        ])
        .limit(limit)
        .offset(offset),
      count_query.first(),
    ]);

    const total = total_result ? Number(total_result.total) : 0;
    const total_pages = Math.ceil(total / limit) || 1;

    const formatted_stays = raw_stays.map((stay) => ({
      ...stay,
      is_current_stay: stay.status === 'active',
    }));

    return {
      stays: formatted_stays,
      pagination: {
        total,
        page,
        limit,
        total_pages,
        has_next: page < total_pages,
        has_prev: page > 1,
      },
    };
  };

  /**
   * ============================================================================
   * CHECKOUT & REFUND APPROVALS SERVICE METHODS
   * ============================================================================
   */

  /**
   * Retrieve resident checkout departure review, dues calculation, and NOC preview.
   * Calculates live pending dues from rent and laundry payments and estimates net deposit refund.
   *
   * @param {object} user - Authenticated user context
   * @param {object} query - Optional query filters (resident_id, stay_id)
   * @returns {Promise<object>} Comprehensive departure financial breakdown
   */
  getCheckoutReview = async (user, query = {}) => {
    let targetResidentId = user.id;

    if (user.role !== ROLES.RESIDENT) {
      if (query.resident_id) {
        targetResidentId = parseInt(query.resident_id, 10);
      } else if (query.stay_id) {
        const stayRec = await db('resident_pg_stays').where({ id: query.stay_id }).first();
        if (stayRec) targetResidentId = stayRec.resident_id;
      }
    }

    // 1. Fetch active stay for the resident
    let stayQuery = db('resident_pg_stays')
      .where('resident_pg_stays.resident_id', targetResidentId)
      .where('resident_pg_stays.status', 'active')
      .whereNull('resident_pg_stays.deleted_at')
      .join('rooms', (join) => {
        join.on('resident_pg_stays.room_id', '=', 'rooms.id').andOnNull('rooms.deleted_at');
      })
      .join('users as resident', (join) => {
        join.on('resident_pg_stays.resident_id', '=', 'resident.id').andOnNull('resident.deleted_at');
      })
      .leftJoin('branches', (join) => {
        join.on('resident_pg_stays.branch_id', '=', 'branches.id').andOnNull('branches.deleted_at');
      })
      .leftJoin('pgs', 'resident_pg_stays.pg_id', 'pgs.id');

    if (query.stay_id) {
      stayQuery = stayQuery.where('resident_pg_stays.id', query.stay_id);
    }

    const stay = await stayQuery
      .select(
        'resident_pg_stays.id as stay_id',
        'resident_pg_stays.resident_id',
        'resident_pg_stays.pg_id',
        'resident_pg_stays.branch_id',
        db.raw('COALESCE(branches.name, pgs.name) as branch_name'),
        'resident_pg_stays.room_id',
        'rooms.room_no',
        'rooms.room_type',
        'resident_pg_stays.bed_number',
        'resident_pg_stays.monthly_rent',
        'resident_pg_stays.security_deposit',
        'resident_pg_stays.check_in_date',
        'resident.name as resident_name',
        'resident.email as resident_email',
        'resident.phone as resident_phone',
        'resident.profile_photo'
      )
      .first();

    if (!stay) {
      throw new AppError('No active PG stay found for this resident', HTTP_STATUS.NOT_FOUND);
    }

    // Verify property ownership and branch authorization for administrative caller
    if (user.role !== ROLES.RESIDENT && user.role !== ROLES.SUPER_ADMIN) {
      const context = await resolveUserBranches(user);
      if (!context.branchIds.includes(stay.branch_id)) {
        throw new AppError('Access denied to resident stay outside your managed branches', HTTP_STATUS.FORBIDDEN);
      }
    }

    // 2. Fetch pending dues from payments table
    const pendingPayments = await db('payments')
      .where('payments.resident_id', targetResidentId)
      .whereIn('payments.status', ['pending', 'overdue'])
      .whereNull('payments.deleted_at')
      .orderBy('payments.due_date', 'asc');

    let duesItems = [];
    let totalDues = 0;

    for (const p of pendingPayments) {
      const due = Math.max(0, (Number(p.amount) || 0) - (Number(p.paid_amount) || 0));
      if (due > 0) {
        totalDues += due;
        duesItems.push({
          id: p.id,
          title: p.title || `${(p.payment_type || 'rent').toUpperCase()} Bill`,
          payment_type: p.payment_type || 'rent',
          amount: parseFloat(due.toFixed(2)),
          due_date: p.due_date ? formatDisplayDate(p.due_date) : null,
        });
      }
    }

    // 3. Security deposit & estimated refund calculation
    const originalDeposit = parseFloat(Number(stay.security_deposit || 0).toFixed(2));
    const finalTotalDues = parseFloat(totalDues.toFixed(2));
    const estimatedRefund = Math.max(0, parseFloat((originalDeposit - finalTotalDues).toFixed(2)));

    const departureDate = query.departure_date || null;

    return {
      stay: {
        id: stay.stay_id,
        resident_id: stay.resident_id,
        resident_name: stay.resident_name,
        branch_id: stay.branch_id,
        branch_name: stay.branch_name || '-',
        room_id: stay.room_id,
        room_no: stay.room_no,
        bed_no: stay.bed_number || '-',
        check_in_date: stay.check_in_date ? formatDisplayDate(stay.check_in_date) : null,
        departure_date: departureDate ? formatDisplayDate(departureDate) : null,
        departure_date_raw: departureDate,
      },
      pending_dues: {
        items: duesItems,
        total_due: finalTotalDues,
      },
      security_deposit: {
        original_deposit: originalDeposit,
        total_due: finalTotalDues,
        estimated_refund: estimatedRefund,
      },
      clearance_checklist: {
        room_inspection: false,
        return_room_key: false,
        no_pending_dues: finalTotalDues <= 0,
      },
    };
  };

  /**
   * Submit resident checkout departure request with planned notice date and refund details.
   *
   * @param {object} user - Authenticated user context
   * @param {object} data - Departure request payload
   * @returns {Promise<object>} Created checkout request record with timeline
   */
  createCheckoutRequest = async (user, data) => {
    let targetResidentId = user.id;

    if (user.role !== ROLES.RESIDENT && data.resident_id) {
      targetResidentId = parseInt(data.resident_id, 10);
    }

    // 1. Resolve active stay
    let stayQuery = db('resident_pg_stays')
      .where('resident_pg_stays.resident_id', targetResidentId)
      .where('resident_pg_stays.status', 'active')
      .whereNull('resident_pg_stays.deleted_at');

    if (data.stay_id) {
      stayQuery = stayQuery.where('resident_pg_stays.id', data.stay_id);
    }

    const stay = await stayQuery.first();
    if (!stay) {
      throw new AppError('No active PG stay found for this resident to checkout', HTTP_STATUS.BAD_REQUEST);
    }

    // Tenancy guard
    if (user.role !== ROLES.RESIDENT && user.role !== ROLES.SUPER_ADMIN) {
      const context = await resolveUserBranches(user);
      if (!context.branchIds.includes(stay.branch_id)) {
        throw new AppError('Access denied to resident stay outside your managed branches', HTTP_STATUS.FORBIDDEN);
      }
    }

    // 2. Prevent duplicate open checkout requests for the same stay
    const existingOpen = await db('checkout_requests')
      .where({ stay_id: stay.id })
      .whereNotIn('status', ['rejected', 'completed'])
      .whereNull('deleted_at')
      .first();

    if (existingOpen) {
      throw new AppError('A checkout request is already pending or in progress for this stay', HTTP_STATUS.CONFLICT);
    }

    // 3. Calculate snapshot of pending dues & refund
    const pendingPayments = await db('payments')
      .where('payments.resident_id', targetResidentId)
      .whereIn('payments.status', ['pending', 'overdue'])
      .whereNull('payments.deleted_at');

    let duesItems = [];
    let totalDues = 0;

    for (const p of pendingPayments) {
      const due = Math.max(0, (Number(p.amount) || 0) - (Number(p.paid_amount) || 0));
      if (due > 0) {
        totalDues += due;
        duesItems.push({
          id: p.id,
          title: p.title || `${(p.payment_type || 'rent').toUpperCase()} Bill`,
          payment_type: p.payment_type || 'rent',
          amount: parseFloat(due.toFixed(2)),
          due_date: p.due_date ? formatDisplayDate(p.due_date) : null,
        });
      }
    }

    const depositAmount = parseFloat(Number(stay.security_deposit || 0).toFixed(2));
    const finalTotalDues = parseFloat(totalDues.toFixed(2));
    const estimatedRefund = Math.max(0, parseFloat((depositAmount - finalTotalDues).toFixed(2)));

    // 4. Insert checkout request
    const [insertId] = await db('checkout_requests').insert({
      pg_id: stay.pg_id,
      branch_id: stay.branch_id,
      resident_id: targetResidentId,
      stay_id: stay.id,
      room_id: stay.room_id,
      departure_date: data.departure_date,
      reason: data.reason.trim(),
      additional_notes: data.additional_notes ? data.additional_notes.trim() : null,
      dues_amount: finalTotalDues,
      dues_breakdown: JSON.stringify(duesItems),
      deposit_amount: depositAmount,
      estimated_refund: estimatedRefund,
      refund_amount: null,
      status: 'pending',
      clearance_room_inspected: false,
      clearance_key_returned: false,
      clearance_dues_cleared: finalTotalDues <= 0,
      noc_issued: false,
      refund_processed: false,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    // Real-time: Notify PG admins of new checkout request
    socketService.emitToPgAdmins(stay.pg_id, SOCKET_EVENTS.CHECKOUT_NEW, {
      id: insertId,
      resident_id: targetResidentId,
      room_id: stay.room_id,
      departure_date: data.departure_date,
      reason: data.reason.trim(),
      created_at: moment().toISOString(),
    });

    // Real-time: Notify PG admins of new checkout request
    socketService.emitToPgAdmins(stay.pg_id, SOCKET_EVENTS.CHECKOUT_NEW, {
      id: insertId,
      resident_id: targetResidentId,
      room_id: stay.room_id,
      departure_date: data.departure_date,
      reason: data.reason.trim(),
      created_at: new Date().toISOString(),
    });

    return await this.findCheckoutRequestById(insertId, user);
  };

  /**
   * Helper: Format checkout request entity with full 5-step operational timeline and financial breakdown.
   *
   * @param {object} row - Raw checkout request record
   * @returns {object} Standardized checkout timeline object
   */
  formatCheckoutTimeline = (row) => {
    let breakdown = [];
    try {
      breakdown = typeof row.dues_breakdown === 'string' ? JSON.parse(row.dues_breakdown) : (row.dues_breakdown || []);
    } catch {
      breakdown = [];
    }

    const isRoomCleared = Boolean(row.clearance_room_inspected && row.clearance_key_returned);
    const isNocIssued = Boolean(row.noc_issued);
    const isRefundProcessed = Boolean(row.refund_processed || row.status === 'completed');
    const isCompleted = row.status === 'completed';
    const isApproved = row.status === 'approved' || isCompleted;

    const timeline = [
      {
        step: 1,
        title: 'Request Submitted',
        status: 'completed',
        timestamp: formatTimelineTimestamp(row.created_at),
      },
      {
        step: 2,
        title: 'Under Review',
        status: ['under_review', 'in_progress', 'approved', 'completed'].includes(row.status)
          ? 'completed'
          : 'pending',
        timestamp: row.reviewed_at
          ? formatTimelineTimestamp(row.reviewed_at)
          : formatTimelineTimestamp(row.created_at),
      },
      {
        step: 3,
        title: 'Room Clearance',
        status: isRoomCleared || isApproved
          ? 'completed'
          : row.status === 'in_progress'
          ? 'in_progress'
          : 'pending',
        timestamp: isRoomCleared ? formatTimelineTimestamp(row.updated_at) : null,
      },
      {
        step: 4,
        title: 'NOC issued',
        status: isNocIssued || isCompleted ? 'completed' : 'pending',
        timestamp: isNocIssued ? formatTimelineTimestamp(row.updated_at) : null,
      },
      {
        step: 5,
        title: 'Refund Processed',
        status: isRefundProcessed ? 'completed' : 'pending',
        timestamp: isRefundProcessed && row.completed_at ? formatTimelineTimestamp(row.completed_at) : null,
      },
    ];

    const finalRefund = row.refund_amount !== null && row.refund_amount !== undefined
      ? parseFloat(Number(row.refund_amount).toFixed(2))
      : parseFloat(Number(row.estimated_refund || 0).toFixed(2));

    return {
      id: row.id,
      resident: {
        id: row.resident_id,
        name: row.resident_name,
        phone: row.resident_phone,
        email: row.resident_email,
        profile_photo: row.profile_photo,
        photo_url: buildFileUrl('users', row.profile_photo),
      },
      stay: {
        id: row.stay_id,
        branch_id: row.branch_id,
        branch_name: row.branch_name || '-',
        room_id: row.room_id,
        room_no: row.room_no,
        room_type: row.room_type,
        bed_no: row.bed_number || '-',
        check_in_date: row.check_in_date ? formatDisplayDate(row.check_in_date) : null,
      },
      departure_date: formatDisplayDate(row.departure_date),
      departure_date_raw: row.departure_date,
      reason: row.reason,
      additional_notes: row.additional_notes || null,
      financials: {
        dues_amount: parseFloat(Number(row.dues_amount || 0).toFixed(2)),
        deposit_amount: parseFloat(Number(row.deposit_amount || 0).toFixed(2)),
        estimated_refund: parseFloat(Number(row.estimated_refund || 0).toFixed(2)),
        refund_amount: row.refund_amount !== null ? parseFloat(Number(row.refund_amount).toFixed(2)) : null,
        display_refund: finalRefund,
        dues_breakdown: breakdown,
      },
      status: row.status,
      clearance_checklist: {
        room_inspection: Boolean(row.clearance_room_inspected),
        return_room_key: Boolean(row.clearance_key_returned),
        no_pending_dues: Boolean(row.clearance_dues_cleared || row.dues_amount <= 0),
      },
      timeline,
      estimated_refund_card: {
        amount: finalRefund,
        note: isRefundProcessed ? 'Refund processed successfully' : 'Will be credited after final clearance',
      },
      review_info: {
        reviewed_by: row.reviewer_name || null,
        reviewed_at: row.reviewed_at ? formatDisplayDate(row.reviewed_at) : null,
        admin_notes: row.admin_notes || null,
        completed_at: row.completed_at ? formatDisplayDate(row.completed_at) : null,
      },
      created_at: formatDisplayDate(row.created_at),
      updated_at: formatDisplayDate(row.updated_at),
    };
  };

  /**
   * Get checkout request details by ID
   */
  findCheckoutRequestById = async (id, user) => {
    const row = await db('checkout_requests')
      .where('checkout_requests.id', id)
      .whereNull('checkout_requests.deleted_at')
      .join('users as resident', 'checkout_requests.resident_id', 'resident.id')
      .join('resident_pg_stays as stay', 'checkout_requests.stay_id', 'stay.id')
      .join('rooms', 'checkout_requests.room_id', 'rooms.id')
      .leftJoin('branches', 'checkout_requests.branch_id', 'branches.id')
      .leftJoin('users as reviewer', 'checkout_requests.reviewed_by', 'reviewer.id')
      .select(
        'checkout_requests.*',
        'resident.name as resident_name',
        'resident.phone as resident_phone',
        'resident.email as resident_email',
        'resident.profile_photo',
        'rooms.room_no',
        'rooms.room_type',
        'stay.bed_number',
        'stay.check_in_date',
        'branches.name as branch_name',
        'reviewer.name as reviewer_name'
      )
      .first();

    if (!row) {
      throw new AppError('Checkout request not found', HTTP_STATUS.NOT_FOUND);
    }

    // Permission check
    if (user.role === ROLES.RESIDENT && user.id !== row.resident_id) {
      throw new AppError('Access denied to this checkout request', HTTP_STATUS.FORBIDDEN);
    }
    if (user.role !== ROLES.RESIDENT && user.role !== ROLES.SUPER_ADMIN) {
      const context = await resolveUserBranches(user);
      if (!context.branchIds.includes(row.branch_id)) {
        throw new AppError('Access denied to checkout requests outside your branch', HTTP_STATUS.FORBIDDEN);
      }
    }

    return this.formatCheckoutTimeline(row);
  };

  /**
   * List checkout departure requests for administration with status filter tabs, search, and pagination.
   *
   * @param {object} user - Authenticated user context
   * @param {object} query - Filtering and pagination parameters
   * @returns {Promise<object>} Filtered requests list and dashboard summary
   */
  findAllCheckoutRequests = async (user, query = {}) => {
    const context = await resolveUserBranches(user);

    if (user.role === ROLES.RESIDENT) {
      throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
    }

    let baseQuery = db('checkout_requests')
      .whereNull('checkout_requests.deleted_at')
      .join('users as resident', 'checkout_requests.resident_id', 'resident.id')
      .join('resident_pg_stays as stay', 'checkout_requests.stay_id', 'stay.id')
      .join('rooms', 'checkout_requests.room_id', 'rooms.id')
      .leftJoin('floors', 'rooms.floor_id', 'floors.id')
      .leftJoin('buildings', 'rooms.building_id', 'buildings.id')
      .leftJoin('branches', 'checkout_requests.branch_id', 'branches.id');

    // Tenant / Branch scoping
    if (!context.isSuperAdmin) {
      if (!context.branchIds || context.branchIds.length === 0) {
        return {
          data: [],
          total_records: 0,
          summary: { all: 0, pending: 0, in_progress: 0, approved: 0, rejected: 0 },
        };
      }
      baseQuery.whereIn('checkout_requests.branch_id', context.branchIds);
    }

    // Branch filter
    if (query.branch_id && query.branch_id !== 'all') {
      const fBranchId = parseInt(query.branch_id, 10);
      if (!context.isSuperAdmin && !context.branchIds.includes(fBranchId)) {
        throw new AppError('Access denied to specified branch', HTTP_STATUS.FORBIDDEN);
      }
      baseQuery.where('checkout_requests.branch_id', fBranchId);
    }

    // Search filter
    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      baseQuery.where((qb) => {
        qb.whereILike('resident.name', term)
          .orWhereILike('resident.phone', term)
          .orWhereILike('resident.email', term)
          .orWhereILike('rooms.room_no', term)
          .orWhereILike('buildings.name', term)
          .orWhereILike('floors.name', term);
      });
    }

    // Date range filter (start_date, end_date)
    const dateBy = query.date_by === 'created_at' ? 'created_at' : 'departure_date';
    if (query.start_date) {
      if (dateBy === 'created_at') {
        baseQuery.where('checkout_requests.created_at', '>=', `${query.start_date} 00:00:00`);
      } else {
        baseQuery.where('checkout_requests.departure_date', '>=', query.start_date);
      }
    }
    if (query.end_date) {
      if (dateBy === 'created_at') {
        baseQuery.where('checkout_requests.created_at', '<=', `${query.end_date} 23:59:59`);
      } else {
        baseQuery.where('checkout_requests.departure_date', '<=', query.end_date);
      }
    }

    // Calculate tab summary counters (All, Pending, In Progress, Approved, Rejected)
    const summaryRow = await baseQuery.clone().clearSelect().select(
      db.raw('COUNT(checkout_requests.id) as total_all'),
      db.raw("COALESCE(SUM(CASE WHEN checkout_requests.status IN ('pending', 'under_review') THEN 1 ELSE 0 END), 0) as total_pending"),
      db.raw("COALESCE(SUM(CASE WHEN checkout_requests.status = 'in_progress' THEN 1 ELSE 0 END), 0) as total_in_progress"),
      db.raw("COALESCE(SUM(CASE WHEN checkout_requests.status IN ('approved', 'completed') THEN 1 ELSE 0 END), 0) as total_approved"),
      db.raw("COALESCE(SUM(CASE WHEN checkout_requests.status = 'rejected' THEN 1 ELSE 0 END), 0) as total_rejected")
    ).first();

    const summary = {
      all: parseInt(summaryRow?.total_all || 0, 10),
      pending: parseInt(summaryRow?.total_pending || 0, 10),
      in_progress: parseInt(summaryRow?.total_in_progress || 0, 10),
      approved: parseInt(summaryRow?.total_approved || 0, 10),
      rejected: parseInt(summaryRow?.total_rejected || 0, 10),
    };

    // Tab status filter
    if (query.status && query.status !== 'all') {
      const statusFilter = query.status.toLowerCase();
      if (statusFilter === 'pending') {
        baseQuery.whereIn('checkout_requests.status', ['pending', 'under_review']);
      } else if (statusFilter === 'approved') {
        baseQuery.whereIn('checkout_requests.status', ['approved', 'completed']);
      } else {
        baseQuery.where('checkout_requests.status', statusFilter);
      }
    }

    // If format is requested (excel or pdf), return export file
    const isExport = Boolean(query.format);

    let recordsQuery = baseQuery
      .select(
        'checkout_requests.*',
        'resident.name as resident_name',
        'resident.phone as resident_phone',
        'resident.email as resident_email',
        'resident.profile_photo',
        'rooms.room_no',
        'rooms.room_type',
        'floors.name as floor_name',
        'floors.floor_number',
        'buildings.name as building_name',
        'stay.bed_number',
        'branches.name as branch_name'
      )
      .orderBy('checkout_requests.id', 'desc');

    const rows = await recordsQuery;

    const formattedRows = rows.map((r, idx) => {
      const dues = parseFloat(Number(r.dues_amount || 0).toFixed(2));
      const deposit = parseFloat(Number(r.deposit_amount || 0).toFixed(2));
      const refund = r.refund_amount !== null
        ? parseFloat(Number(r.refund_amount).toFixed(2))
        : parseFloat(Number(r.estimated_refund || 0).toFixed(2));

      const floorDisplay = r.floor_name || (r.floor_number !== null && r.floor_number !== undefined ? `Floor ${r.floor_number}` : '-');
      const buildingDisplay = r.building_name || '-';

      return {
        sr_no: idx + 1,
        id: r.id,
        resident: {
          id: r.resident_id,
          name: r.resident_name,
          phone: r.resident_phone,
          email: r.resident_email,
          profile_photo: r.profile_photo,
          photo_url: buildFileUrl('users', r.profile_photo),
        },
        building_name: buildingDisplay,
        floor_name: floorDisplay,
        room: {
          id: r.room_id,
          room_no: r.room_no,
          room_type: r.room_type,
          bed_number: r.bed_number || '-',
          building_name: buildingDisplay,
          floor_name: floorDisplay,
        },
        branch: {
          id: r.branch_id,
          name: r.branch_name || '-',
        },
        check_out_date: formatDisplayDate(r.departure_date),
        dues,
        deposit,
        refund,
        status: r.status,
        step: (r.clearance_room_inspected && r.clearance_key_returned) || ['approved', 'completed'].includes(r.status)
          ? 'Room Clearance'
          : r.status === 'in_progress'
          ? 'In Progress'
          : 'Pending',
        created_at: formatDisplayDate(r.created_at),
      };
    });

    // If an export file is requested (Excel or PDF)
    if (isExport) {
      const requestedFormat = (query.format || 'excel').toLowerCase();
      const format = requestedFormat === 'pdf' ? 'pdf' : 'excel';
      const exportOptions = {
        pg_name: context.pgName || 'HomeNest PG',
        status: query.status || 'all',
        start_date: query.start_date || null,
        end_date: query.end_date || null,
        date_by: query.date_by || 'departure_date',
      };

      if (format === 'pdf') {
        const pdfResult = await this.exportCheckoutsPdf(rows, exportOptions);
        return {
          is_export: true,
          data: {
            format: 'pdf',
            file_url: pdfResult.file_url,
            filename: pdfResult.filename,
            file_path: pdfResult.file_path,
            total_records: pdfResult.total_records,
            total_dues: pdfResult.total_dues,
            total_deposits: pdfResult.total_deposits,
            total_refunds: pdfResult.total_refunds,
          },
        };
      }

      // Default export is Excel
      const excelResult = await this.exportCheckoutsExcel(rows, exportOptions);
      return {
        is_export: true,
        data: {
          format: 'excel',
          file_url: excelResult.file_url,
          filename: excelResult.filename,
          file_path: excelResult.file_path,
          total_records: excelResult.total_records,
          total_dues: excelResult.total_dues,
          total_deposits: excelResult.total_deposits,
          total_refunds: excelResult.total_refunds,
        },
      };
    }

    return {
      data: formattedRows,
      total_records: rows.length,
      summary,
    };
  };

  /**
   * Generate downloadable Microsoft Excel (.xlsx) report for checkout requests and refund approvals.
   *
   * @param {Array<object>} rows - List of checkout records
   * @param {object} [options] - Additional formatting options
   * @returns {Promise<object>} Export payload with file buffer and metadata
   */
  exportCheckoutsExcel = async (rows = [], options = {}) => {
    const totalRecords = rows.length;
    let totalDues = 0;
    let totalDeposits = 0;
    let totalRefunds = 0;

    for (const r of rows) {
      totalDues += Number(r.dues_amount || 0);
      totalDeposits += Number(r.deposit_amount || 0);
      totalRefunds += Number(r.refund_amount !== null && r.refund_amount !== undefined ? r.refund_amount : (r.estimated_refund || 0));
    }

    totalDues = parseFloat(totalDues.toFixed(2));
    totalDeposits = parseFloat(totalDeposits.toFixed(2));
    totalRefunds = parseFloat(totalRefunds.toFixed(2));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HomeNest PG Management';
    workbook.created = moment().toDate();

    const worksheet = workbook.addWorksheet('Checkout Approvals', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 7, showGridLines: true }],
    });

    // Title Row
    worksheet.mergeCells('A1:J1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'HomeNest - Checkout and Refund Approvals Report';
    titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FF0D9488' } };
    titleCell.alignment = { vertical: 'middle' };
    worksheet.getRow(1).height = 30;

    // Subtitle Row
    worksheet.mergeCells('A2:J2');
    const subCell = worksheet.getCell('A2');
    let periodInfo = '';
    if (options.start_date && options.end_date) {
      periodInfo = ` | Period: ${formatDisplayDate(options.start_date)} to ${formatDisplayDate(options.end_date)}`;
    } else if (options.start_date) {
      periodInfo = ` | From: ${formatDisplayDate(options.start_date)}`;
    } else if (options.end_date) {
      periodInfo = ` | Until: ${formatDisplayDate(options.end_date)}`;
    }
    subCell.value = `Facility: ${options.pg_name || 'HomeNest PG'} | Status: ${(options.status || 'All').toUpperCase()}${periodInfo} | Generated: ${moment().format('DD/MM/YYYY HH:mm')}`;
    subCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF64748B' } };
    subCell.alignment = { vertical: 'middle' };
    worksheet.getRow(2).height = 20;

    // KPI Cards Block (Rows 4-5)
    const styleKpi = (startCol, endCol, label, val, valColor) => {
      worksheet.mergeCells(`${startCol}4:${endCol}4`);
      worksheet.mergeCells(`${startCol}5:${endCol}5`);

      const lblCell = worksheet.getCell(`${startCol}4`);
      lblCell.value = label;
      lblCell.font = { name: 'Segoe UI', size: 8, bold: true, color: { argb: 'FF64748B' } };
      lblCell.alignment = { vertical: 'middle', horizontal: 'center' };
      lblCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

      const valCell = worksheet.getCell(`${startCol}5`);
      valCell.value = val;
      valCell.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: valColor } };
      valCell.alignment = { vertical: 'middle', horizontal: 'center' };
      valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    };

    styleKpi('A', 'B', 'TOTAL REQUESTS', totalRecords, 'FF0F172A');
    styleKpi('C', 'D', 'TOTAL PENDING DUES', `₹${totalDues.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'FFDC2626');
    styleKpi('E', 'F', 'TOTAL DEPOSITS', `₹${totalDeposits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'FF2563EB');
    styleKpi('G', 'H', 'EST. / APPROVED REFUND', `₹${totalRefunds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'FF16A34A');

    // Blank row 6
    worksheet.getRow(6).height = 10;

    // Table Header (Row 7)
    const headers = [
      'SR NO',
      'RESIDENT NAME',
      'PHONE',
      'BUILDING',
      'FLOOR',
      'ROOM NO',
      'BED NO',
      'BRANCH',
      'CHECK-OUT DATE',
      'REASON',
      'DUES (₹)',
      'DEPOSIT (₹)',
      'REFUND (₹)',
      'STATUS',
      'CLEARANCE STATUS',
      'REQUEST DATE',
    ];

    const headerRow = worksheet.getRow(7);
    headerRow.values = headers;
    headerRow.height = 24;
    headerRow.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF0F766E' } },
        bottom: { style: 'thin', color: { argb: 'FF0F766E' } },
      };
    });

    // Populate Data Rows
    rows.forEach((r, idx) => {
      const rowIndex = 8 + idx;
      const dues = parseFloat(Number(r.dues_amount || 0).toFixed(2));
      const deposit = parseFloat(Number(r.deposit_amount || 0).toFixed(2));
      const refund = r.refund_amount !== null && r.refund_amount !== undefined
        ? parseFloat(Number(r.refund_amount).toFixed(2))
        : parseFloat(Number(r.estimated_refund || 0).toFixed(2));

      const isRoomCleared = Boolean(r.clearance_room_inspected && r.clearance_key_returned);
      const floorStr = r.floor_name || (r.floor_number !== null && r.floor_number !== undefined ? `Floor ${r.floor_number}` : '-');
      const row = worksheet.getRow(rowIndex);
      row.height = 20;
      row.values = [
        idx + 1,
        r.resident_name || '-',
        r.resident_phone || '-',
        r.building_name || '-',
        floorStr,
        r.room_no || '-',
        r.bed_number || '-',
        r.branch_name || '-',
        formatDisplayDate(r.departure_date),
        r.reason || '-',
        dues,
        deposit,
        refund,
        (r.status || 'pending').toUpperCase(),
        isRoomCleared ? 'Room Cleared' : 'Inspection Pending',
        formatDisplayDate(r.created_at),
      ];

      // Formatting & Zebra background
      const isEven = idx % 2 === 0;
      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF334155' } };
        cell.alignment = { vertical: 'middle' };
        if (isEven) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        // Alignments & numbers
        if ([1, 4, 5, 6, 7, 9, 14, 15, 16].includes(colNumber)) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
        if ([11, 12, 13].includes(colNumber)) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '₹#,##0.00';
          if (colNumber === 11 && dues > 0) {
            cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFDC2626' } };
          }
          if (colNumber === 13 && refund > 0) {
            cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF16A34A' } };
          }
        }
      });
    });

    // Summary Totals Row at Bottom
    const totalRowIndex = 8 + rows.length;
    const summaryRow = worksheet.getRow(totalRowIndex);
    summaryRow.height = 24;
    summaryRow.getCell(1).value = '';
    summaryRow.getCell(2).value = 'TOTALS';
    summaryRow.getCell(2).font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
    summaryRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };

    summaryRow.getCell(11).value = totalDues;
    summaryRow.getCell(11).numFmt = '₹#,##0.00';
    summaryRow.getCell(11).font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFDC2626' } };
    summaryRow.getCell(11).alignment = { vertical: 'middle', horizontal: 'right' };

    summaryRow.getCell(12).value = totalDeposits;
    summaryRow.getCell(12).numFmt = '₹#,##0.00';
    summaryRow.getCell(12).font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF2563EB' } };
    summaryRow.getCell(12).alignment = { vertical: 'middle', horizontal: 'right' };

    summaryRow.getCell(13).value = totalRefunds;
    summaryRow.getCell(13).numFmt = '₹#,##0.00';
    summaryRow.getCell(13).font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF16A34A' } };
    summaryRow.getCell(13).alignment = { vertical: 'middle', horizontal: 'right' };

    summaryRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'double', color: { argb: 'FF0F172A' } },
      };
    });

    // Column widths
    worksheet.columns = [
      { width: 8 },  // 1: Sr
      { width: 22 }, // 2: Resident
      { width: 14 }, // 3: Phone
      { width: 18 }, // 4: Building
      { width: 14 }, // 5: Floor
      { width: 12 }, // 6: Room
      { width: 10 }, // 7: Bed
      { width: 16 }, // 8: Branch
      { width: 15 }, // 9: Check-out date
      { width: 24 }, // 10: Reason
      { width: 14 }, // 11: Dues
      { width: 14 }, // 12: Deposit
      { width: 14 }, // 13: Refund
      { width: 14 }, // 14: Status
      { width: 18 }, // 15: Clearance
      { width: 14 }, // 16: Request date
    ];

    const filename = `checkout-refunds-${Date.now()}.xlsx`;
    const uploadDir = path.join(process.cwd(), 'uploads', 'checkouts');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, filename);
    await workbook.xlsx.writeFile(filePath);

    const file_url = buildFileUrl('checkouts', filename);

    return {
      file_url,
      file_path: filePath,
      filename,
      total_records: totalRecords,
      total_dues: totalDues,
      total_deposits: totalDeposits,
      total_refunds: totalRefunds,
    };
  };

  /**
   * Generate downloadable PDF statement report for checkout requests and refund approvals.
   *
   * @param {Array<object>} rows - List of checkout records
   * @param {object} [options] - Additional styling and report options
   * @returns {Promise<object>} PDF export payload with base64/buffer data
   */
  exportCheckoutsPdf = async (rows = [], options = {}) => {
    const totalRecords = rows.length;
    let totalDues = 0;
    let totalDeposits = 0;
    let totalRefunds = 0;

    for (const r of rows) {
      totalDues += Number(r.dues_amount || 0);
      totalDeposits += Number(r.deposit_amount || 0);
      totalRefunds += Number(r.refund_amount !== null && r.refund_amount !== undefined ? r.refund_amount : (r.estimated_refund || 0));
    }

    totalDues = parseFloat(totalDues.toFixed(2));
    totalDeposits = parseFloat(totalDeposits.toFixed(2));
    totalRefunds = parseFloat(totalRefunds.toFixed(2));

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 24,
      bufferPages: true,
    });

    // Register Roboto font family
    const robotoRegular = path.join(process.cwd(), 'node_modules/roboto-fontface/fonts/roboto/Roboto-Regular.woff');
    const robotoBold = path.join(process.cwd(), 'node_modules/roboto-fontface/fonts/roboto/Roboto-Bold.woff');
    const robotoMedium = path.join(process.cwd(), 'node_modules/roboto-fontface/fonts/roboto/Roboto-Medium.woff');

    let fontRegular = 'Helvetica';
    let fontBold = 'Helvetica-Bold';
    let fontMedium = 'Helvetica-Bold';

    if (fs.existsSync(robotoRegular) && fs.existsSync(robotoBold)) {
      try {
        doc.registerFont('Roboto', robotoRegular);
        doc.registerFont('Roboto-Bold', robotoBold);
        if (fs.existsSync(robotoMedium)) {
          doc.registerFont('Roboto-Medium', robotoMedium);
          fontMedium = 'Roboto-Medium';
        } else {
          fontMedium = 'Roboto-Bold';
        }
        fontRegular = 'Roboto';
        fontBold = 'Roboto-Bold';
      } catch (e) {
        // Fallback to Helvetica
      }
    }

    const filename = `checkout-refunds-${Date.now()}.pdf`;
    const uploadDir = path.join(process.cwd(), 'uploads', 'checkouts');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, filename);
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const startX = 24;
    const pageWidth = 794;

    const brandTeal = '#0D9488';
    const textTitle = '#0F172A';
    const textBody = '#334155';
    const textMuted = '#64748B';
    const textLight = '#94A3B8';
    const borderSubtle = '#E2E8F0';
    const rowZebra = '#F8FAFC';

    const fmtCurr = (val) => Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pgName = options.pg_name || 'HomeNest PG Facility';

    // 12 Columns in Logical Accounting & Departure Order (Total = 794 pt):
    const columns = [
      { key: 'sr', label: '#', width: 22, align: 'center' },
      { key: 'resident', label: 'RESIDENT', width: 95, align: 'left' },
      { key: 'building', label: 'BUILDING', width: 75, align: 'left' },
      { key: 'floor', label: 'FLOOR', width: 55, align: 'left' },
      { key: 'room', label: 'ROOM / BED', width: 62, align: 'left' },
      { key: 'branch', label: 'BRANCH', width: 75, align: 'left' },
      { key: 'checkout', label: 'CHECK-OUT', width: 65, align: 'center' },
      { key: 'reason', label: 'REASON', width: 95, align: 'left' },
      { key: 'dues', label: 'DUES (INR)', width: 60, align: 'right' },
      { key: 'deposit', label: 'DEPOSIT (INR)', width: 60, align: 'right' },
      { key: 'refund', label: 'REFUND (INR)', width: 60, align: 'right' },
      { key: 'status', label: 'STATUS', width: 70, align: 'center' },
    ];

    const drawHeader = (doc, isFirst) => {
      // Subtle top accent line
      doc.rect(0, 0, 842, 3).fill(brandTeal);

      if (isFirst) {
        // 1. Brand Logo Badge & Title (Displays PG Name, not single branch)
        doc.roundedRect(startX, 14, 28, 28, 4).fill(brandTeal);
        doc.fillColor('#FFFFFF').font(fontBold).fontSize(12).text('HN', startX, 21.5, { width: 28, align: 'center', lineBreak: false });

        doc.fillColor(textTitle).font(fontBold).fontSize(13).text(pgName, startX + 36, 14, { lineBreak: false });
        doc.fillColor(textMuted).font(fontRegular).fontSize(7.5).text('Checkout and Refund Approvals Statement • HomeNest System', startX + 36, 29.5, { lineBreak: false });

        // 2. Right Meta Information Box
        const metaBoxW = 250;
        const metaBoxX = startX + pageWidth - metaBoxW;
        const metaBoxY = 12;
        const metaBoxH = 34;

        doc.roundedRect(metaBoxX, metaBoxY, metaBoxW, metaBoxH, 4).fillAndStroke('#F8FAFC', borderSubtle);

        doc.fillColor(textMuted).font(fontRegular).fontSize(6.5).text('GENERATED ON:', metaBoxX + 8, metaBoxY + 6, { lineBreak: false });
        const nowFormatted = moment().format('DD/MM/YYYY HH:mm');
        doc.fillColor(textTitle).font(fontMedium).fontSize(7).text(nowFormatted, metaBoxX + 85, metaBoxY + 5.5, { lineBreak: false });

        let periodScope = '';
        if (options.start_date && options.end_date) {
          periodScope = ` (${formatDisplayDate(options.start_date)} - ${formatDisplayDate(options.end_date)})`;
        } else if (options.start_date) {
          periodScope = ` (From ${formatDisplayDate(options.start_date)})`;
        } else if (options.end_date) {
          periodScope = ` (To ${formatDisplayDate(options.end_date)})`;
        }

        doc.fillColor(textMuted).font(fontRegular).fontSize(6.5).text('STATEMENT SCOPE:', metaBoxX + 8, metaBoxY + 18, { lineBreak: false });
        doc.fillColor(brandTeal).font(fontMedium).fontSize(7).text(`${(options.status || 'All Records').toUpperCase()}${periodScope}`, metaBoxX + 85, metaBoxY + 17.5, { width: metaBoxW - 90, lineBreak: false });

        // 3. KPI Summary Cards (Clean, corporate styling)
        const cardY = 52;
        const cardH = 34;
        const cardGap = 8;
        const cardW = (pageWidth - cardGap * 3) / 4;

        const kpis = [
          { label: 'TOTAL REQUESTS', value: String(totalRecords), sub: 'Departure files', color: textTitle },
          { label: 'OUTSTANDING DUES', value: `INR ${fmtCurr(totalDues)}`, sub: totalDues > 0 ? 'Pending collection' : 'Fully cleared', color: totalDues > 0 ? '#DC2626' : '#16A34A' },
          { label: 'SECURITY DEPOSITS', value: `INR ${fmtCurr(totalDeposits)}`, sub: 'Held against stays', color: '#2563EB' },
          { label: 'EST. / APPROVED REFUND', value: `INR ${fmtCurr(totalRefunds)}`, sub: 'Payable to residents', color: '#16A34A' },
        ];

        kpis.forEach((kpi, i) => {
          const cx = startX + i * (cardW + cardGap);
          doc.roundedRect(cx, cardY, cardW, cardH, 4).fillAndStroke('#FFFFFF', borderSubtle);
          doc.fillColor(textMuted).font(fontRegular).fontSize(6).text(kpi.label, cx + 8, cardY + 5.5, { lineBreak: false });
          doc.fillColor(kpi.color).font(fontMedium).fontSize(9).text(kpi.value, cx + 8, cardY + 14.5, { width: cardW - 16, lineBreak: false });
          doc.fillColor(textLight).font(fontRegular).fontSize(5.5).text(kpi.sub, cx + 8, cardY + 24.5, { lineBreak: false });
        });

        return cardY + cardH + 10;
      } else {
        doc.fillColor(brandTeal).font(fontBold).fontSize(8).text(`${pgName} — Checkout and Refund Approvals (Continued)`, startX, 12, { lineBreak: false });
        return 24;
      }
    };

    const drawTableHeader = (doc, yPos) => {
      doc.rect(startX, yPos, pageWidth, 20).fill('#0D9488');
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

    const rowHeight = 22;

    // Render Table Rows
    rows.forEach((r, idx) => {
      if (currentY + rowHeight > 540) {
        doc.addPage();
        currentY = drawHeader(doc, false);
        currentY = drawTableHeader(doc, currentY);
      }

      const isEven = idx % 2 === 0;
      if (isEven) {
        doc.rect(startX, currentY, pageWidth, rowHeight).fill(rowZebra);
      }
      doc.rect(startX, currentY + rowHeight - 0.5, pageWidth, 0.5).fill(borderSubtle);

      const dues = parseFloat(Number(r.dues_amount || 0).toFixed(2));
      const deposit = parseFloat(Number(r.deposit_amount || 0).toFixed(2));
      const refund = r.refund_amount !== null && r.refund_amount !== undefined
        ? parseFloat(Number(r.refund_amount).toFixed(2))
        : parseFloat(Number(r.estimated_refund || 0).toFixed(2));

      let curX = startX;

      // 1. Sr
      doc.fillColor(textMuted).font(fontRegular).fontSize(7).text(String(idx + 1), curX, currentY + 6.5, {
        width: columns[0].width,
        align: 'center',
        lineBreak: false,
      });
      curX += columns[0].width;

      // 2. Resident
      doc.fillColor(textTitle).font(fontBold).fontSize(7.5).text(r.resident_name || '-', curX + 2, currentY + 3, {
        width: columns[1].width - 4,
        lineBreak: false,
      });
      doc.fillColor(textMuted).font(fontRegular).fontSize(6).text(r.resident_phone || '', curX + 2, currentY + 12, {
        width: columns[1].width - 4,
        lineBreak: false,
      });
      curX += columns[1].width;

      // 3. Building
      doc.fillColor(textBody).font(fontRegular).fontSize(6.5).text(r.building_name || '-', curX + 2, currentY + 6.5, {
        width: columns[2].width - 4,
        lineBreak: false,
      });
      curX += columns[2].width;

      // 4. Floor
      const floorStr = r.floor_name || (r.floor_number !== null && r.floor_number !== undefined ? `Floor ${r.floor_number}` : '-');
      doc.fillColor(textBody).font(fontRegular).fontSize(6.5).text(floorStr, curX + 2, currentY + 6.5, {
        width: columns[3].width - 4,
        lineBreak: false,
      });
      curX += columns[3].width;

      // 5. Room / Bed
      doc.fillColor(textBody).font(fontRegular).fontSize(7).text(`${r.room_no || '-'}${r.bed_number ? ` (${r.bed_number})` : ''}`, curX + 2, currentY + 6.5, {
        width: columns[4].width - 4,
        lineBreak: false,
      });
      curX += columns[4].width;

      // 6. Branch
      doc.fillColor(textBody).font(fontRegular).fontSize(6.5).text(r.branch_name || '-', curX + 2, currentY + 6.5, {
        width: columns[5].width - 4,
        lineBreak: false,
      });
      curX += columns[5].width;

      // 7. Checkout date
      doc.fillColor(textBody).font(fontRegular).fontSize(6.5).text(formatDisplayDate(r.departure_date) || '-', curX, currentY + 6.5, {
        width: columns[6].width,
        align: 'center',
        lineBreak: false,
      });
      curX += columns[6].width;

      // 8. Reason
      doc.fillColor(textBody).font(fontRegular).fontSize(6.5).text(r.reason || '-', curX + 2, currentY + 6.5, {
        width: columns[7].width - 4,
        lineBreak: false,
      });
      curX += columns[7].width;

      // 9. Dues
      doc.fillColor(dues > 0 ? '#DC2626' : textMuted).font(dues > 0 ? fontBold : fontRegular).fontSize(7).text(fmtCurr(dues), curX, currentY + 6.5, {
        width: columns[8].width - 4,
        align: 'right',
        lineBreak: false,
      });
      curX += columns[8].width;

      // 10. Deposit
      doc.fillColor(textBody).font(fontRegular).fontSize(7).text(fmtCurr(deposit), curX, currentY + 6.5, {
        width: columns[9].width - 4,
        align: 'right',
        lineBreak: false,
      });
      curX += columns[9].width;

      // 11. Refund
      doc.fillColor(refund > 0 ? '#16A34A' : textMuted).font(refund > 0 ? fontBold : fontRegular).fontSize(7).text(fmtCurr(refund), curX, currentY + 6.5, {
        width: columns[10].width - 4,
        align: 'right',
        lineBreak: false,
      });
      curX += columns[10].width;

      // 12. Status pill badge
      const st = (r.status || 'pending').toLowerCase();
      let pillBg = '#FEF3C7';
      let pillText = '#B45309';
      let statusLabel = 'PENDING';

      if (['approved', 'completed'].includes(st)) {
        pillBg = '#DCFCE7';
        pillText = '#15803D';
        statusLabel = 'APPROVED';
      } else if (st === 'in_progress') {
        pillBg = '#E0F2FE';
        pillText = '#0369A1';
        statusLabel = 'IN PROGRESS';
      } else if (st === 'rejected') {
        pillBg = '#FEE2E2';
        pillText = '#B91C1C';
        statusLabel = 'REJECTED';
      }

      const pillW = 58;
      const pillH = 12;
      const pillX = curX + (columns[11].width - pillW) / 2;
      const pillY = currentY + 5;
      doc.roundedRect(pillX, pillY, pillW, pillH, 2).fill(pillBg);
      doc.fillColor(pillText).font(fontBold).fontSize(5.5).text(statusLabel, pillX, pillY + 3, {
        width: pillW,
        align: 'center',
        lineBreak: false,
      });

      currentY += rowHeight;
    });

    // Grand Totals Summary Row
    if (currentY + 24 > 540) {
      doc.addPage();
      currentY = drawHeader(doc, false);
      currentY = drawTableHeader(doc, currentY);
    }

    currentY += 4;
    doc.roundedRect(startX, currentY, pageWidth, 20, 2).fillAndStroke('#F8FAFC', borderSubtle);

    doc.fillColor(textTitle).font(fontBold).fontSize(7.5).text('GRAND TOTAL', startX + 10, currentY + 6.5, { lineBreak: false });
    doc.fillColor(textMuted).font(fontRegular).fontSize(6.5).text(`(${totalRecords} total records)`, startX + 75, currentY + 7, { lineBreak: false });

    // Dues total
    const duesX = startX + 22 + 95 + 75 + 55 + 62 + 75 + 65 + 95;
    doc.fillColor('#DC2626').font(fontBold).fontSize(7.5).text(fmtCurr(totalDues), duesX, currentY + 6.5, {
      width: columns[8].width - 4,
      align: 'right',
      lineBreak: false,
    });

    // Deposit total
    const depX = duesX + columns[8].width;
    doc.fillColor('#2563EB').font(fontBold).fontSize(7.5).text(fmtCurr(totalDeposits), depX, currentY + 6.5, {
      width: columns[9].width - 4,
      align: 'right',
      lineBreak: false,
    });

    // Refund total
    const refX = depX + columns[9].width;
    doc.fillColor('#16A34A').font(fontBold).fontSize(7.5).text(fmtCurr(totalRefunds), refX, currentY + 6.5, {
      width: columns[10].width - 4,
      align: 'right',
      lineBreak: false,
    });

    // Clean, Professional Footer (Single line, consistent on EVERY page, zero blank pages)
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      const prevBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      // Divider line
      doc.moveTo(startX, 568).lineTo(startX + pageWidth, 568).strokeColor(borderSubtle).lineWidth(0.5).stroke();

      // Left: Clean professional mark with PG name
      doc.fillColor(textMuted).font(fontRegular).fontSize(7).text(
        `${pgName} • Confidential`,
        startX,
        573,
        { lineBreak: false }
      );

      // Right: Page numbering
      doc.fillColor(textTitle).font(fontMedium).fontSize(7).text(
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

    const file_url = buildFileUrl('checkouts', filename);

    return {
      file_url,
      file_path: filePath,
      filename,
      total_records: totalRecords,
      total_dues: totalDues,
      total_deposits: totalDeposits,
      total_refunds: totalRefunds,
    };
  };

  /**
   * Update checkout request status, room inspection clearance, NOC issuance, and security deposit refund.
   *
   * @param {number|string} id - Checkout request ID
   * @param {object} user - Authenticated user context
   * @param {object} data - Update payload with clearance checklist and notes
   * @returns {Promise<object>} Updated checkout entity
   */
  updateCheckoutStatus = async (id, user, data) => {
    const existing = await db('checkout_requests')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!existing) {
      throw new AppError('Checkout request not found', HTTP_STATUS.NOT_FOUND);
    }

    // Tenancy check
    if (user.role !== ROLES.SUPER_ADMIN) {
      const context = await resolveUserBranches(user);
      if (!context.branchIds.includes(existing.branch_id)) {
        throw new AppError('Access denied to checkout requests outside your branch', HTTP_STATUS.FORBIDDEN);
      }
    }

    const updatePayload = {
      reviewed_by: user.id,
      reviewed_at: db.fn.now(),
      updated_at: db.fn.now(),
    };

    if (data.status) {
      updatePayload.status = data.status;
    }
    if (data.clearance_room_inspected !== undefined) {
      updatePayload.clearance_room_inspected = Boolean(data.clearance_room_inspected);
    }
    if (data.clearance_key_returned !== undefined) {
      updatePayload.clearance_key_returned = Boolean(data.clearance_key_returned);
    }
    if (data.clearance_dues_cleared !== undefined) {
      updatePayload.clearance_dues_cleared = Boolean(data.clearance_dues_cleared);
    }
    if (data.noc_issued !== undefined) {
      updatePayload.noc_issued = Boolean(data.noc_issued);
    }
    if (data.refund_amount !== undefined) {
      updatePayload.refund_amount = data.refund_amount !== null ? parseFloat(Number(data.refund_amount).toFixed(2)) : null;
    }
    if (data.refund_processed !== undefined) {
      updatePayload.refund_processed = Boolean(data.refund_processed);
    }
    if (data.admin_notes !== undefined) {
      updatePayload.admin_notes = data.admin_notes ? data.admin_notes.trim() : null;
    }

    const isFinalApproval = ['approved', 'completed'].includes(data.status);
    if (isFinalApproval) {
      updatePayload.completed_at = db.fn.now();
    }

    await db.transaction(async (trx) => {
      await trx('checkout_requests').where({ id }).update(updatePayload);

      // If approved or completed, finalize the stay and room status atomically
      if (isFinalApproval) {
        await trx('resident_pg_stays')
          .where({ id: existing.stay_id })
          .update({
            status: 'completed',
            check_out_date: existing.departure_date,
            updated_at: db.fn.now(),
          });

        // Verify whether any other active resident stays remain in this room
        const remainingOccupants = await trx('resident_pg_stays')
          .where({ room_id: existing.room_id, status: 'active' })
          .whereNull('deleted_at')
          .whereNot({ id: existing.stay_id })
          .first();

        if (!remainingOccupants) {
          await trx('rooms')
            .where({ id: existing.room_id })
            .update({ status: 'vacant', updated_at: db.fn.now() });

          await syncBranchStats(existing.branch_id, trx);
        }
      }
    });

    // Real-time: Notify resident that checkout request status was updated
    socketService.emitToUser(existing.resident_id, SOCKET_EVENTS.CHECKOUT_STATUS_UPDATED, {
      id,
      status: data.status,
      admin_notes: data.admin_notes || null,
      updated_at: moment().toISOString(),
    });

    // Real-time: Notify resident that checkout request status was updated
    socketService.emitToUser(existing.resident_id, SOCKET_EVENTS.CHECKOUT_STATUS_UPDATED, {
      id,
      status: data.status,
      admin_notes: data.admin_notes || null,
      updated_at: new Date().toISOString(),
    });

    return await this.findCheckoutRequestById(id, user);
  };

  /**
   * Cancel or soft delete checkout request
   */
  deleteCheckoutRequest = async (id, user) => {
    const existing = await db('checkout_requests')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!existing) {
      throw new AppError('Checkout request not found', HTTP_STATUS.NOT_FOUND);
    }

    // If resident, can only cancel their own pending request
    if (user.role === ROLES.RESIDENT) {
      if (existing.resident_id !== user.id) {
        throw new AppError('Access denied to this checkout request', HTTP_STATUS.FORBIDDEN);
      }
      if (existing.status !== 'pending') {
        throw new AppError('Cannot cancel a checkout request that is already under review or processed', HTTP_STATUS.BAD_REQUEST);
      }
    } else if (user.role !== ROLES.SUPER_ADMIN) {
      const context = await resolveUserBranches(user);
      if (!context.branchIds.includes(existing.branch_id)) {
        throw new AppError('Access denied to checkout requests outside your branch', HTTP_STATUS.FORBIDDEN);
      }
    }

    await db('checkout_requests')
      .where({ id })
      .update({
        status: 'rejected',
        deleted_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

    return { id, message: 'Checkout request cancelled successfully' };
  };
}

export default new StayService();
