import moment from 'moment';
import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';
import { buildFileUrl } from '../utils/url.js';

/**
 * Service managing System Dashboards
 * Dispatches Operations Dashboard for Admins / Super Admins
 * and Resident Dashboard for Tenants.
 */
class DashboardService {
  /**
   * Helper: Format relative time string e.g. "2h ago", "3h ago", "1d ago"
   * @param {Date|string} date
   * @returns {string} Formatted relative time
   */
  formatTimeAgo = (date) => {
    if (!date) return '-';
    const now = moment();
    const then = moment(date);
    const diffMinutes = now.diff(then, 'minutes');
    const diffHours = now.diff(then, 'hours');
    const diffDays = now.diff(then, 'days');

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.format('DD MMM');
  };

  /**
   * Helper: Format number into Indian Rupee string e.g. "₹ 18,40,000"
   * @param {number} amount
   * @returns {string} Formatted INR string
   */
  formatINR = (amount) => {
    const val = Number(amount) || 0;
    return `₹ ${val.toLocaleString('en-IN')}`;
  };

  /**
   * Helper: Calculate Month-over-Month change percentage and trend direction
   * @param {number} current
   * @param {number} previous
   * @returns {{ change_percentage: number, trend: 'up' | 'down' | 'neutral' }}
   */
  calculateTrend = (current, previous) => {
    const curr = Number(current) || 0;
    const prev = Number(previous) || 0;

    if (prev === 0) {
      if (curr === 0) {
        return { change_percentage: 0, trend: 'neutral' };
      }
      return { change_percentage: 100, trend: 'up' };
    }

    const diff = curr - prev;
    const pct = Math.round((diff / prev) * 100);

    return {
      change_percentage: pct,
      trend: pct > 0 ? 'up' : (pct < 0 ? 'down' : 'neutral'),
    };
  };

  /**
   * Operations Dashboard for Admin / Super Admin (Image 1)
   *
   * @param {Object} user - Authenticated user context
   * @param {Object} query - Optional branch filter
   * @returns {Promise<Object>} Operations dashboard dataset
   */
  getAdminDashboard = async (user, query = {}) => {
    // 1. Resolve PG & Branch scoping
    let pgId = null;
    let targetBranchId = query.branch_id ? Number(query.branch_id) : null;

    if (user.role === ROLES.SUPER_ADMIN) {
      pgId = query.pg_id ? Number(query.pg_id) : user.pg_id;
      if (!pgId) {
        const firstPg = await db('pgs').whereNull('deleted_at').orderBy('id', 'asc').first();
        pgId = firstPg ? Number(firstPg.id) : null;
      }
    } else {
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
      if (pg) {
        pgId = Number(pg.id);
      }
    }

    // If no PG facility is associated yet, return clean empty dashboard without mock values
    if (!pgId) {
      return {
        role: 'admin',
        pg_id: null,
        branch_id: targetBranchId,
        metrics: {
          total_residents: { value: 0, change_percentage: 0, trend: 'neutral', comparison_label: 'vs. last month' },
          occupancy_rate: { value: 0, formatted: '0%', change_percentage: 0, trend: 'neutral', comparison_label: 'vs. last month' },
          monthly_revenue: { value: 0, formatted: this.formatINR(0), change_percentage: 0, trend: 'neutral', comparison_label: 'vs. last month' },
          pending_dues: { value: 0, formatted: this.formatINR(0), change_percentage: 0, trend: 'neutral', comparison_label: 'vs. last month' },
          open_complaints: { value: 0, change_percentage: 0, trend: 'neutral', comparison_label: 'vs. last month' },
        },
        occupancy_trend: { timeframe: 'Last 6 months', data: [] },
        room_distribution: { total_residents: 0, distribution: [] },
        recent_activity: [],
      };
    }

    const currentMonthStart = moment().startOf('month').format('YYYY-MM-DD HH:mm:ss');
    const currentMonthEnd = moment().endOf('month').format('YYYY-MM-DD HH:mm:ss');
    const lastMonthStart = moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD HH:mm:ss');
    const lastMonthEnd = moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD HH:mm:ss');

    // 2. Total Residents & Monthly Trend
    const residentsQuery = db('resident_pg_stays')
      .where('resident_pg_stays.pg_id', pgId)
      .where('resident_pg_stays.status', 'active')
      .whereNull('resident_pg_stays.deleted_at');

    if (targetBranchId) {
      residentsQuery.where('resident_pg_stays.branch_id', targetBranchId);
    }

    const currentResidentsRes = await residentsQuery.clone().countDistinct('resident_id as total').first();
    const totalResidents = parseInt(currentResidentsRes?.total || 0, 10);

    const lastMonthResidentsRes = await db('resident_pg_stays')
      .where('resident_pg_stays.pg_id', pgId)
      .whereNull('resident_pg_stays.deleted_at')
      .where('resident_pg_stays.created_at', '<=', lastMonthEnd)
      .where((qb) => {
        qb.whereNull('resident_pg_stays.check_out_date')
          .orWhere('resident_pg_stays.check_out_date', '>=', lastMonthStart);
      })
      .modify((qb) => {
        if (targetBranchId) qb.where('resident_pg_stays.branch_id', targetBranchId);
      })
      .countDistinct('resident_id as total')
      .first();

    const lastMonthResidents = parseInt(lastMonthResidentsRes?.total || 0, 10);
    const residentsTrend = this.calculateTrend(totalResidents, lastMonthResidents);

    // 3. Rooms & Occupancy Rate
    const roomsQuery = db('rooms')
      .where('rooms.pg_id', pgId)
      .whereNull('rooms.deleted_at');

    if (targetBranchId) {
      roomsQuery.where('rooms.branch_id', targetBranchId);
    }

    const roomsStats = await roomsQuery.clone()
      .select(
        db.raw('COUNT(id) as total_rooms'),
        db.raw("COALESCE(SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END), 0) as occupied_rooms")
      )
      .first();

    const totalRooms = parseInt(roomsStats?.total_rooms || 0, 10);
    const occupiedRooms = parseInt(roomsStats?.occupied_rooms || 0, 10);
    const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

    const lastMonthStaysRes = await db('resident_pg_stays')
      .where('resident_pg_stays.pg_id', pgId)
      .whereNull('resident_pg_stays.deleted_at')
      .where('resident_pg_stays.created_at', '<=', lastMonthEnd)
      .where((qb) => {
        qb.whereNull('resident_pg_stays.check_out_date')
          .orWhere('resident_pg_stays.check_out_date', '>=', lastMonthStart);
      })
      .modify((qb) => {
        if (targetBranchId) qb.where('resident_pg_stays.branch_id', targetBranchId);
      })
      .countDistinct('room_id as occupied_rooms')
      .first();

    const lastMonthOccupied = Math.min(totalRooms, parseInt(lastMonthStaysRes?.occupied_rooms || 0, 10));
    const lastMonthOccupancyRate = totalRooms > 0 ? Math.round((lastMonthOccupied / totalRooms) * 100) : 0;
    const occupancyTrendMoM = this.calculateTrend(occupancyRate, lastMonthOccupancyRate);

    // 4. Monthly Revenue (Current Month Collections)
    const paymentsQuery = db('payments')
      .where('payments.pg_id', pgId)
      .whereNull('payments.deleted_at');

    if (targetBranchId) {
      paymentsQuery.where('payments.branch_id', targetBranchId);
    }

    const revenueRes = await paymentsQuery.clone()
      .where('payments.created_at', '>=', currentMonthStart)
      .where('payments.status', 'paid')
      .sum('payments.paid_amount as total_revenue')
      .first();

    const monthlyRevenue = parseFloat(revenueRes?.total_revenue || 0);

    const lastRevenueRes = await paymentsQuery.clone()
      .where('payments.created_at', '>=', lastMonthStart)
      .where('payments.created_at', '<=', lastMonthEnd)
      .where('payments.status', 'paid')
      .sum('payments.paid_amount as total_revenue')
      .first();

    const lastMonthlyRevenue = parseFloat(lastRevenueRes?.total_revenue || 0);
    const revenueTrend = this.calculateTrend(monthlyRevenue, lastMonthlyRevenue);

    // 5. Pending Dues
    const duesRes = await paymentsQuery.clone()
      .whereIn('payments.status', ['pending', 'overdue'])
      .select(
        db.raw('COALESCE(SUM(amount - paid_amount), 0) as total_dues')
      )
      .first();

    const pendingDues = parseFloat(duesRes?.total_dues || 0);

    // 6. Open / Pending Complaints
    const complaintsQuery = db('complaints')
      .where('complaints.pg_id', pgId)
      .whereIn('complaints.status', ['PENDING', 'OPEN', 'IN_PROGRESS'])
      .whereNull('complaints.deleted_at');

    if (targetBranchId) {
      complaintsQuery.where('complaints.branch_id', targetBranchId);
    }

    const complaintsRes = await complaintsQuery.clone().count('id as total').first();
    const openComplaints = parseInt(complaintsRes?.total || 0, 10);

    const lastComplaintsRes = await db('complaints')
      .where('complaints.pg_id', pgId)
      .whereNull('complaints.deleted_at')
      .where('complaints.created_at', '>=', lastMonthStart)
      .where('complaints.created_at', '<=', lastMonthEnd)
      .modify((qb) => {
        if (targetBranchId) qb.where('complaints.branch_id', targetBranchId);
      })
      .count('id as total')
      .first();

    const lastMonthComplaints = parseInt(lastComplaintsRes?.total || 0, 10);
    const complaintsTrend = this.calculateTrend(openComplaints, lastMonthComplaints);

    // 7. Last 6 Months Occupancy Rate Trend (Actual Database Data)
    const occupancyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const m = moment().subtract(i, 'months');
      const mStart = m.clone().startOf('month').format('YYYY-MM-DD HH:mm:ss');
      const mEnd = m.clone().endOf('month').format('YYYY-MM-DD HH:mm:ss');

      const staysInMonthRes = await db('resident_pg_stays')
        .where('resident_pg_stays.pg_id', pgId)
        .whereNull('resident_pg_stays.deleted_at')
        .where('resident_pg_stays.created_at', '<=', mEnd)
        .where((qb) => {
          qb.whereNull('resident_pg_stays.check_out_date')
            .orWhere('resident_pg_stays.check_out_date', '>=', mStart);
        })
        .modify((qb) => {
          if (targetBranchId) qb.where('resident_pg_stays.branch_id', targetBranchId);
        })
        .countDistinct('room_id as occupied_rooms')
        .first();

      const mOccupiedRooms = Math.min(totalRooms, parseInt(staysInMonthRes?.occupied_rooms || 0, 10));
      const mOccupancyRate = totalRooms > 0 ? Math.round((mOccupiedRooms / totalRooms) * 100) : 0;

      occupancyTrend.push({
        month: m.format('MMM'),
        occupancy_rate: mOccupancyRate,
        total_rooms: totalRooms,
        occupied_rooms: mOccupiedRooms,
      });
    }

    // 8. Room Type Distribution (Donut Chart)
    const roomTypeRows = await roomsQuery.clone()
      .select('room_type')
      .count('id as count')
      .groupBy('room_type');

    let totalTypeCount = 0;
    const rawDistribution = roomTypeRows.map((r) => {
      const c = parseInt(r.count, 10);
      totalTypeCount += c;
      const label = r.room_type ? r.room_type.charAt(0).toUpperCase() + r.room_type.slice(1).toLowerCase() : 'Other';
      return {
        type: label,
        count: c,
      };
    });

    const roomTypeDistribution = rawDistribution.map((item) => ({
      type: item.type,
      count: item.count,
      percentage: totalTypeCount > 0 ? Math.round((item.count / totalTypeCount) * 100) : 0,
    }));

    // 9. Recent Activity Feed (Image 1 Bottom Section)
    const activityItems = [];

    // Latest Complaints
    const recentComplaints = await db('complaints')
      .where('complaints.pg_id', pgId)
      .whereNull('complaints.deleted_at')
      .leftJoin('rooms', 'complaints.room_id', 'rooms.id')
      .select(
        'complaints.id',
        'complaints.complaint_number',
        'complaints.title',
        'complaints.status',
        'complaints.created_at',
        'rooms.room_no'
      )
      .orderBy('complaints.created_at', 'desc')
      .limit(3);

    recentComplaints.forEach((c) => {
      const isResolved = c.status === 'RESOLVED';
      activityItems.push({
        id: `complaint-${c.id}`,
        type: isResolved ? 'complaint_resolved' : 'maintenance',
        title: isResolved ? 'Complaint Resolved' : 'New maintenance request',
        subtitle: `${c.complaint_number || `#CL-${c.id}`}${c.room_no ? `, Room ${c.room_no}` : ''}`,
        time_ago: this.formatTimeAgo(c.created_at),
        created_at: c.created_at,
      });
    });

    // Latest Payments
    const recentPayments = await db('payments')
      .where('payments.pg_id', pgId)
      .where('payments.status', 'paid')
      .whereNull('payments.deleted_at')
      .leftJoin('rooms', 'payments.room_id', 'rooms.id')
      .select(
        'payments.id',
        'payments.receipt_no',
        'payments.paid_amount',
        'payments.created_at',
        'rooms.room_no'
      )
      .orderBy('payments.created_at', 'desc')
      .limit(2);

    recentPayments.forEach((p) => {
      activityItems.push({
        id: `payment-${p.id}`,
        type: 'payment',
        title: 'Payment Received',
        subtitle: `${this.formatINR(p.paid_amount)}${p.room_no ? `, Room ${p.room_no}` : ''}`,
        time_ago: this.formatTimeAgo(p.created_at),
        created_at: p.created_at,
      });
    });

    // Latest Visitor Check-ins
    const recentVisitors = await db('visitors')
      .where('visitors.pg_id', pgId)
      .whereNull('visitors.deleted_at')
      .leftJoin('rooms', 'visitors.room_id', 'rooms.id')
      .select(
        'visitors.id',
        'visitors.visitor_name',
        'visitors.created_at',
        'rooms.room_no'
      )
      .orderBy('visitors.created_at', 'desc')
      .limit(2);

    recentVisitors.forEach((v) => {
      activityItems.push({
        id: `visitor-${v.id}`,
        type: 'visitor',
        title: 'New Visitor check-in',
        subtitle: `${v.visitor_name}${v.room_no ? `, Room ${v.room_no}` : ''}`,
        time_ago: this.formatTimeAgo(v.created_at),
        created_at: v.created_at,
      });
    });

    // Sort combined activities by latest timestamp
    activityItems.sort((a, b) => moment(b.created_at).valueOf() - moment(a.created_at).valueOf());

    return {
      role: 'admin',
      pg_id: pgId,
      branch_id: targetBranchId,
      metrics: {
        total_residents: {
          value: totalResidents,
          change_percentage: residentsTrend.change_percentage,
          trend: residentsTrend.trend,
          comparison_label: 'vs. last month',
        },
        occupancy_rate: {
          value: occupancyRate,
          formatted: `${occupancyRate}%`,
          change_percentage: occupancyTrendMoM.change_percentage,
          trend: occupancyTrendMoM.trend,
          comparison_label: 'vs. last month',
        },
        monthly_revenue: {
          value: monthlyRevenue,
          formatted: this.formatINR(monthlyRevenue),
          change_percentage: revenueTrend.change_percentage,
          trend: revenueTrend.trend,
          comparison_label: 'vs. last month',
        },
        pending_dues: {
          value: pendingDues,
          formatted: this.formatINR(pendingDues),
          change_percentage: 0,
          trend: 'neutral',
          comparison_label: 'vs. last month',
        },
        open_complaints: {
          value: openComplaints,
          change_percentage: complaintsTrend.change_percentage,
          trend: complaintsTrend.trend,
          comparison_label: 'vs. last month',
        },
        pending_complaints: {
          value: openComplaints,
          change_percentage: complaintsTrend.change_percentage,
          trend: complaintsTrend.trend,
          comparison_label: 'vs. last month',
        },
      },
      occupancy_trend: {
        timeframe: 'Last 6 months',
        data: occupancyTrend,
      },
      room_distribution: {
        total_residents: totalResidents,
        distribution: roomTypeDistribution,
      },
      recent_activity: activityItems.slice(0, 6),
    };
  };

  /**
   * Resident Mobile Dashboard for Tenants (Image 2)
   *
   * @param {Object} user - Authenticated resident user
   * @returns {Promise<Object>} Resident dashboard dataset
   */
  getResidentDashboard = async (user) => {
    // 1. Resolve Resident's Active Stay
    const activeStay = await db('resident_pg_stays')
      .where('resident_pg_stays.resident_id', user.id)
      .where('resident_pg_stays.status', 'active')
      .whereNull('resident_pg_stays.deleted_at')
      .leftJoin('pgs', 'resident_pg_stays.pg_id', 'pgs.id')
      .leftJoin('branches', 'resident_pg_stays.branch_id', 'branches.id')
      .leftJoin('rooms', 'resident_pg_stays.room_id', 'rooms.id')
      .select(
        'resident_pg_stays.*',
        'pgs.name as pg_name',
        'branches.name as branch_name',
        'rooms.room_no'
      )
      .first();

    const effectivePgId = activeStay?.pg_id || user.pg_id || null;
    const effectiveBranchId = activeStay?.branch_id || user.branch_id || null;

    // 2. Next Rent Due Card
    const nextRentQuery = db('payments')
      .where('payments.resident_id', user.id)
      .whereIn('payments.status', ['pending', 'overdue'])
      .whereNull('payments.deleted_at')
      .orderBy('payments.due_date', 'asc')
      .first();

    const pendingBill = await nextRentQuery;
    let rentDue = null;
    if (pendingBill) {
      const remainingDue = Math.max(0, parseFloat(pendingBill.amount) - parseFloat(pendingBill.paid_amount || 0));
      rentDue = {
        payment_id: pendingBill.id,
        amount: remainingDue,
        formatted: this.formatINR(remainingDue),
        due_date: pendingBill.due_date,
        due_date_formatted: pendingBill.due_date ? `Due on ${moment(pendingBill.due_date).format('DD MMMM YYYY')}` : 'Due this month',
        status: pendingBill.status,
      };
    } else {
      rentDue = {
        payment_id: null,
        amount: 0,
        formatted: '₹ 0',
        due_date: null,
        due_date_formatted: 'All dues cleared',
        status: 'paid',
      };
    }

    // 3. Next Event Notice Card
    let nextEvent = null;
    if (effectivePgId) {
      const nextEventNotice = await db('notices')
        .where('notices.pg_id', effectivePgId)
        .where('notices.status', 'sent')
        .whereNull('notices.deleted_at')
        .where((qb) => {
          qb.whereILike('notices.category', '%event%')
            .orWhereILike('notices.category', '%activity%')
            .orWhere('notices.priority', 'high');
        })
        .orderBy('notices.created_at', 'desc')
        .first();

      if (nextEventNotice) {
        nextEvent = {
          id: nextEventNotice.id,
          title: nextEventNotice.title,
          badge: 'Next Event',
          date: nextEventNotice.scheduled_at || nextEventNotice.sent_at || nextEventNotice.created_at,
          date_formatted: moment(nextEventNotice.scheduled_at || nextEventNotice.sent_at || nextEventNotice.created_at).format('DD MMM YYYY, hh:mm A'),
          image_url: nextEventNotice.attachment_name ? buildFileUrl('notices', nextEventNotice.attachment_name) : null,
        };
      }
    }

    // 4. Gate Pass Card
    const latestVisitorPass = await db('visitors')
      .where('visitors.resident_id', user.id)
      .whereNull('visitors.deleted_at')
      .orderBy('visitors.created_at', 'desc')
      .first();

    const gatePass = latestVisitorPass
      ? {
          pass_code: latestVisitorPass.pass_code,
          qr_code_url: latestVisitorPass.qr_code ? buildFileUrl('visitors', latestVisitorPass.qr_code) : null,
          status: latestVisitorPass.status,
          action_label: 'Scan at Gate',
        }
      : null;

    // 5. Today's Full Day Menu Array
    let todayMenus = [];

    if (effectivePgId) {
      const todayDate = moment().utcOffset('+05:30').format('YYYY-MM-DD');
      const todayDayOfWeek = moment().utcOffset('+05:30').format('dddd').toLowerCase();

      // Helper query for active food menus
      const fetchMenus = async (filterBranchId = null, filterDateOnly = false) => {
        let qb = db('food_menus')
          .where('food_menus.pg_id', effectivePgId)
          .whereNull('food_menus.deleted_at')
          .where('food_menus.is_active', 1);

        if (filterBranchId) {
          qb = qb.where('food_menus.branch_id', filterBranchId);
        }

        if (filterDateOnly) {
          qb = qb.whereRaw('DATE(food_menus.menu_date) = ?', [todayDate]);
        } else {
          qb = qb.where((inner) => {
            inner.whereRaw('DATE(food_menus.menu_date) = ?', [todayDate])
              .orWhere('food_menus.day_of_week', todayDayOfWeek);
          });
        }

        return await qb.orderBy('food_menus.sort_order', 'asc').orderBy('food_menus.id', 'asc');
      };

      // 1. Try branch-specific menu for today's exact date
      let rawMenuItems = [];
      if (effectiveBranchId) {
        rawMenuItems = await fetchMenus(effectiveBranchId, true);
        // 2. If no exact date for branch, try branch-specific day_of_week fallback
        if (rawMenuItems.length === 0) {
          rawMenuItems = await fetchMenus(effectiveBranchId, false);
        }
      }

      // 3. If no branch-specific menu found, try PG-wide exact date
      if (rawMenuItems.length === 0) {
        rawMenuItems = await fetchMenus(null, true);
      }

      // 4. If no PG-wide exact date found, try PG-wide day_of_week fallback
      if (rawMenuItems.length === 0) {
        rawMenuItems = await fetchMenus(null, false);
      }

      // Sort meals chronologically (Breakfast -> Lunch -> Snacks -> Dinner)
      const MEAL_ORDER = { breakfast: 1, lunch: 2, snacks: 3, dinner: 4 };
      rawMenuItems.sort((a, b) => {
        const orderA = (a.sort_order && a.sort_order > 0)
          ? a.sort_order
          : (MEAL_ORDER[(a.meal_type || '').toLowerCase()] || 99);
        const orderB = (b.sort_order && b.sort_order > 0)
          ? b.sort_order
          : (MEAL_ORDER[(b.meal_type || '').toLowerCase()] || 99);
        if (orderA !== orderB) return orderA - orderB;
        return a.id - b.id;
      });

      todayMenus = rawMenuItems.map((m) => {
        const mealTypeTitle = m.meal_type
          ? m.meal_type.charAt(0).toUpperCase() + m.meal_type.slice(1).toLowerCase()
          : 'Meal';

        return {
          id: m.id,
          branch_id: m.branch_id,
          meal_type: mealTypeTitle,
          raw_meal_type: (m.meal_type || '').toLowerCase(),
          food_name: m.name,
          name: m.name,
          description: m.description || null,
          items: m.included_items ? `${m.name} • ${m.included_items}` : m.name,
          included_items: m.included_items || null,
          start_time: m.start_time || null,
          end_time: m.end_time || null,
          timings: m.start_time && m.end_time ? `${m.start_time} - ${m.end_time}` : (m.timings || null),
          image: m.image || null,
          image_url: m.image ? buildFileUrl('food_menu', m.image) : null,
          day_of_week: m.day_of_week || null,
          menu_date: m.menu_date ? moment(m.menu_date).format('YYYY-MM-DD') : null,
          is_active: Boolean(m.is_active !== undefined ? m.is_active : true),
        };
      });
    }

    // 6. Resident's Latest Active Complaint
    const recentComplaintRow = await db('complaints')
      .where('complaints.resident_id', user.id)
      .whereNull('complaints.deleted_at')
      .leftJoin('rooms', 'complaints.room_id', 'rooms.id')
      .select('complaints.*', 'rooms.room_no')
      .orderBy('complaints.created_at', 'desc')
      .first();

    const recentComplaint = recentComplaintRow
      ? {
          id: recentComplaintRow.id,
          ticket_number: recentComplaintRow.complaint_number || `#CL-${recentComplaintRow.id}`,
          title: recentComplaintRow.title,
          status: recentComplaintRow.status === 'IN_PROGRESS' ? 'In Progress' : (recentComplaintRow.status === 'RESOLVED' ? 'Resolved' : 'Open'),
          location_and_time: `${recentComplaintRow.room_no ? `Room ${recentComplaintRow.room_no} • ` : ''}${moment(recentComplaintRow.created_at).format('DD MMMM YYYY, hh:mm A')}`,
          created_at: recentComplaintRow.created_at,
        }
      : null;

    // 7. Latest Important Notice / Alert
    let latestNotice = null;
    if (effectivePgId) {
      const latestNoticeRow = await db('notices')
        .where('notices.pg_id', effectivePgId)
        .where('notices.status', 'sent')
        .whereNull('notices.deleted_at')
        .orderBy('notices.created_at', 'desc')
        .first();

      if (latestNoticeRow) {
        latestNotice = {
          id: latestNoticeRow.id,
          category: latestNoticeRow.category || 'Important',
          priority: (latestNoticeRow.priority || 'medium').toLowerCase(),
          title: latestNoticeRow.title,
          summary: latestNoticeRow.content?.slice(0, 100) || '',
          date_time: moment(latestNoticeRow.sent_at || latestNoticeRow.created_at).format('DD MMMM YYYY • hh:mm A'),
        };
      }
    }

    // 8. Unread Notifications Count
    let unreadNotificationsCount = 0;
    if (effectivePgId) {
      const unreadRes = await db('notices')
        .where('notices.pg_id', effectivePgId)
        .where('notices.status', 'sent')
        .whereNull('notices.deleted_at')
        .leftJoin('notice_reads', function () {
          this.on('notices.id', '=', 'notice_reads.notice_id')
            .andOn('notice_reads.resident_id', '=', db.raw('?', [user.id]));
        })
        .whereNull('notice_reads.id')
        .count('notices.id as unread')
        .first();

      unreadNotificationsCount = unreadRes ? parseInt(unreadRes.unread, 10) : 0;
    }

    return {
      role: 'resident',
      stay: activeStay
        ? {
            pg_name: activeStay.pg_name || null,
            room_no: activeStay.room_no || null,
            bed_number: activeStay.bed_number || null,
            branch_name: activeStay.branch_name || null,
          }
        : null,
      rent_due: rentDue,
      next_event: nextEvent,
      gate_pass: gatePass,
      today_menu: todayMenus,
      recent_complaint: recentComplaint,
      latest_notice: latestNotice,
      unread_notifications_count: unreadNotificationsCount,
    };
  };

  /**
   * Unified Dashboard Dispatcher
   * Automatically resolves and returns either Admin Operations Dashboard or Resident Dashboard based on token role.
   *
   * @param {Object} user - Authenticated user context from JWT
   * @param {Object} query - Query parameters (e.g. branch_id, preview role)
   * @returns {Promise<Object>} Role-tailored dashboard data
   */
  getDashboard = async (user, query = {}) => {
    // If Admin/Super Admin explicitly requests resident preview via ?role=resident
    if (query.role === 'resident' && (user.role === ROLES.ADMIN || user.role === ROLES.SUPER_ADMIN)) {
      // Find a resident to preview or mock with user context
      const sampleResident = await db('resident_pg_stays')
        .where('resident_pg_stays.status', 'active')
        .whereNull('resident_pg_stays.deleted_at')
        .leftJoin('users', 'resident_pg_stays.resident_id', 'users.id')
        .select('users.*')
        .first();

      return await this.getResidentDashboard(sampleResident || user);
    }

    if (user.role === ROLES.ADMIN || user.role === ROLES.SUPER_ADMIN || user.role === ROLES.BRANCH_MANAGER) {
      return await this.getAdminDashboard(user, query);
    }

    if (user.role === ROLES.RESIDENT) {
      return await this.getResidentDashboard(user);
    }

    // Default to admin operations dashboard for other staff
    return await this.getAdminDashboard(user, query);
  };
}

export default new DashboardService();

