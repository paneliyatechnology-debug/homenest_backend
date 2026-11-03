import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES, STAFF_ROLES } from '../constants/index.js';
import { formatDate } from '../utils/date.js';
import { buildFileUrl } from '../utils/url.js';

// Standard system fallback catalog pricing matching Image 1 Mobile Screen
export const LAUNDRY_CATALOG = [
  { name: 'Shirt', rate: 20 },
  { name: 'T-Shirt', rate: 15 },
  { name: 'Jeans', rate: 30 },
  { name: 'Towel', rate: 40 },
  { name: 'Other', rate: 20 },
];

export const LAUNDRY_PICKUP_TIME_SLOT = '09:00 AM - 11:00 AM (Mon - Sat)';
export const LAUNDRY_SERVICE_TYPES = ['Wash & Fold', 'Dry Cleaning'];

/**
 * Format items into compact request detail summary string for Admin Table (Image 3)
 * e.g., "2 t-shirt, 1 Jeans" or "2 Shirt, 3 T-Shirt, 1 Jeans, +1 more"
 */
export const generateRequestDetail = (items) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return 'General Service';
  }

  const nonZero = items.filter((item) => (parseInt(item.quantity, 10) || 0) > 0);
  if (nonZero.length === 0) {
    return 'General Service';
  }

  const parts = nonZero.map((item) => `${item.quantity} ${item.name}`);
  if (parts.length <= 3) {
    return parts.join(', ');
  }
  return `${parts.slice(0, 3).join(', ')}, +${parts.length - 3} more`;
};

/**
 * Format pickup schedule string for Admin Table (Image 3)
 * e.g., "31 Dec 2026, 09:00 AM" or "26 Mar 2026, 09:00 AM - 11:00 AM"
 */
export const formatPickupSchedule = (pickupDate, pickupTime) => {
  if (!pickupDate) return '-';
  const d = new Date(pickupDate);
  const formattedDate = !isNaN(d.getTime())
    ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : pickupDate;

  if (pickupTime) {
    return `${formattedDate}, ${pickupTime}`;
  }
  return formattedDate;
};

/**
 * Generate unique request number formatted like #CL-1024 (Image 1 & 3)
 */
const generateRequestNumber = async (trx) => {
  const query = trx ? trx('laundry_requests') : db('laundry_requests');
  const countRes = await query.count('id as total').first();
  const nextNum = 1024 + parseInt(countRes?.total || 0, 10);
  return `CL-${nextNum}`;
};

/**
 * Resolves user's assigned/accessible branches under the 1 Admin = 1 PG = Multiple Branches architecture.
 */
const resolveUserBranches = async (user, trx) => {
  const query = trx ? trx : db;

  if (user.role === ROLES.SUPER_ADMIN) {
    const pg = await query('pgs').whereNull('deleted_at').orderBy('id', 'asc').first();
    return { isSuperAdmin: true, branchIds: null, pgId: pg?.id || null };
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
        if (branch) pg = { id: branch.pg_id };
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
    return { isSuperAdmin: false, branchIds, pgId: pg.id };
  }

  if (user.role === ROLES.STAFF || user.role === ROLES.BRANCH_MANAGER) {
    const assignedBranches = await query('user_branches').where({ user_id: user.id }).select('branch_id');
    const branchIds = assignedBranches.map((b) => b.branch_id);
    return { isSuperAdmin: false, branchIds, pgId: user.pg_id || null };
  }

  if (user.role === ROLES.RESIDENT) {
    const activeStay = await query('resident_pg_stays')
      .where({ resident_id: user.id, status: 'active' })
      .whereNull('deleted_at')
      .first();

    if (!activeStay) {
      throw new AppError('No active stay found for this resident', HTTP_STATUS.BAD_REQUEST);
    }
    return {
      isSuperAdmin: false,
      branchIds: [activeStay.branch_id],
      pgId: activeStay.pg_id,
      stay: activeStay,
    };
  }

  return { isSuperAdmin: false, branchIds: [], pgId: null };
};

/**
 * Service: Laundry Catalog and Pricing (Branch-wise or All Branches Default)
 */
export const getLaundryCatalog = async (user, query = {}) => {
  const context = await resolveUserBranches(user);
  let targetBranchId = null;

  if (user.role === ROLES.RESIDENT) {
    targetBranchId = context.branchIds[0];
  } else if (query.branch_id && query.branch_id !== 'all') {
    targetBranchId = parseInt(query.branch_id, 10);
    if (!context.isSuperAdmin && !context.branchIds.includes(targetBranchId)) {
      throw new AppError('Access denied to specified branch', HTTP_STATUS.FORBIDDEN);
    }
  }

  const pgId = context.pgId;

  // 1. Look for branch-specific catalog if targetBranchId is specified
  let catalogRecord = null;
  let scope = 'system_default';

  if (targetBranchId && pgId) {
    catalogRecord = await db('laundry_catalogs')
      .where({ pg_id: pgId, branch_id: targetBranchId })
      .whereNull('deleted_at')
      .first();
    if (catalogRecord) {
      scope = 'branch_specific';
    }
  }

  // 2. Fallback to PG-wide default catalog (where branch_id IS NULL)
  if (!catalogRecord && pgId) {
    catalogRecord = await db('laundry_catalogs')
      .where({ pg_id: pgId })
      .whereNull('branch_id')
      .whereNull('deleted_at')
      .first();
    if (catalogRecord) {
      scope = 'all_branches_default';
    }
  }

  // 3. Fallback to system default
  let items = LAUNDRY_CATALOG;
  let pickupTimeSlot = LAUNDRY_PICKUP_TIME_SLOT;
  let serviceTypes = LAUNDRY_SERVICE_TYPES;
  let importantNotes = [
    'Pickup will be done from your room',
    'Laundry will be returned within 2-3 days',
    'For delicate items, please specify in notes.',
  ];

  if (catalogRecord) {
    try {
      items = typeof catalogRecord.items === 'string' ? JSON.parse(catalogRecord.items) : catalogRecord.items;
    } catch {}
    if (catalogRecord.pickup_time_slot) pickupTimeSlot = catalogRecord.pickup_time_slot;
    if (catalogRecord.service_types) {
      try {
        serviceTypes = typeof catalogRecord.service_types === 'string' ? JSON.parse(catalogRecord.service_types) : catalogRecord.service_types;
      } catch {}
    }
    if (catalogRecord.important_notes) {
      try {
        importantNotes = typeof catalogRecord.important_notes === 'string' ? JSON.parse(catalogRecord.important_notes) : catalogRecord.important_notes;
      } catch {}
    }
  }

  return {
    pg_id: pgId || null,
    branch_id: targetBranchId || null,
    scope,
    pickup_time_slot: pickupTimeSlot,
    service_types: serviceTypes,
    items,
    important_notes: importantNotes,
  };
};

/**
 * Service: Update Laundry Catalog and Pricing (Branch-wise or All Branches)
 * - If apply_to_all_branches = true or branch_id is omitted/null: updates PG-level default pricing for all branches
 * - If branch_id is specified: updates branch-specific pricing override
 */
export const updateLaundryCatalog = async (user, data) => {
  const context = await resolveUserBranches(user);
  const pgId = context.pgId;
  if (!pgId && !context.isSuperAdmin) {
    throw new AppError('No PG associated with this account', HTTP_STATUS.BAD_REQUEST);
  }

  const effectivePgId = pgId || 1;
  const applyToAll = Boolean(data.apply_to_all_branches || !data.branch_id);
  const targetBranchId = applyToAll ? null : parseInt(data.branch_id, 10);

  if (targetBranchId && !context.isSuperAdmin && !context.branchIds.includes(targetBranchId)) {
    throw new AppError('Access denied to specified branch', HTTP_STATUS.FORBIDDEN);
  }

  const items = data.items.map((it) => ({
    name: String(it.name).trim(),
    rate: Number(it.rate) >= 0 ? Number(it.rate) : 0,
  }));

  const pickupTimeSlot = data.pickup_time_slot || LAUNDRY_PICKUP_TIME_SLOT;
  const serviceTypes = data.service_types || LAUNDRY_SERVICE_TYPES;
  const importantNotes = data.important_notes || [
    'Pickup will be done from your room',
    'Laundry will be returned within 2-3 days',
    'For delicate items, please specify in notes.',
  ];

  await db.transaction(async (trx) => {
    if (applyToAll) {
      // 1. Upsert PG-level default catalog (branch_id = null)
      const existing = await trx('laundry_catalogs')
        .where({ pg_id: effectivePgId })
        .whereNull('branch_id')
        .whereNull('deleted_at')
        .first();

      if (existing) {
        await trx('laundry_catalogs').where({ id: existing.id }).update({
          items: JSON.stringify(items),
          pickup_time_slot: pickupTimeSlot,
          service_types: JSON.stringify(serviceTypes),
          important_notes: JSON.stringify(importantNotes),
          updated_at: db.fn.now(),
        });
      } else {
        await trx('laundry_catalogs').insert({
          pg_id: effectivePgId,
          branch_id: null,
          items: JSON.stringify(items),
          pickup_time_slot: pickupTimeSlot,
          service_types: JSON.stringify(serviceTypes),
          important_notes: JSON.stringify(importantNotes),
          created_at: db.fn.now(),
          updated_at: db.fn.now(),
        });
      }

      // If apply_to_all_branches is explicitly true, clear specific branch overrides so all branches adopt this pricing
      if (data.apply_to_all_branches) {
        await trx('laundry_catalogs')
          .where({ pg_id: effectivePgId })
          .whereNotNull('branch_id')
          .update({ deleted_at: db.fn.now() });
      }
    } else {
      // Upsert branch-specific catalog
      const existing = await trx('laundry_catalogs')
        .where({ pg_id: effectivePgId, branch_id: targetBranchId })
        .whereNull('deleted_at')
        .first();

      if (existing) {
        await trx('laundry_catalogs').where({ id: existing.id }).update({
          items: JSON.stringify(items),
          pickup_time_slot: pickupTimeSlot,
          service_types: JSON.stringify(serviceTypes),
          important_notes: JSON.stringify(importantNotes),
          updated_at: db.fn.now(),
        });
      } else {
        await trx('laundry_catalogs').insert({
          pg_id: effectivePgId,
          branch_id: targetBranchId,
          items: JSON.stringify(items),
          pickup_time_slot: pickupTimeSlot,
          service_types: JSON.stringify(serviceTypes),
          important_notes: JSON.stringify(importantNotes),
          created_at: db.fn.now(),
          updated_at: db.fn.now(),
        });
      }
    }
  });

  return await getLaundryCatalog(user, { branch_id: targetBranchId });
};

/**
 * Service: Create a new Laundry Request (Resident Mobile & Admin Web Form)
 */
export const create = async (user, data) => {
  return await db.transaction(async (trx) => {
    let residentId;
    let pgId;
    let branchId;
    let roomId = null;

    if (user.role === ROLES.RESIDENT) {
      residentId = user.id;
      const residentContext = await resolveUserBranches(user, trx);
      pgId = residentContext.pgId;
      branchId = residentContext.branchIds[0];
      roomId = residentContext.stay?.room_id || null;
    } else {
      if (!data.resident_id) {
        throw new AppError('Resident ID is required when creating request as admin', HTTP_STATUS.BAD_REQUEST);
      }
      residentId = parseInt(data.resident_id, 10);

      const residentUser = await trx('users')
        .where({ id: residentId, role: ROLES.RESIDENT })
        .whereNull('deleted_at')
        .first();

      if (!residentUser) {
        throw new AppError('Resident user not found', HTTP_STATUS.NOT_FOUND);
      }

      const activeStay = await trx('resident_pg_stays')
        .where({ resident_id: residentId, status: 'active' })
        .whereNull('deleted_at')
        .first();

      if (!activeStay) {
        throw new AppError('Selected resident does not have an active stay', HTTP_STATUS.BAD_REQUEST);
      }

      const adminContext = await resolveUserBranches(user, trx);
      if (!adminContext.isSuperAdmin && !adminContext.branchIds.includes(activeStay.branch_id)) {
        throw new AppError('Resident does not belong to your managed branches', HTTP_STATUS.FORBIDDEN);
      }

      pgId = activeStay.pg_id;
      branchId = activeStay.branch_id;
      roomId = activeStay.room_id || null;
    }

    // Resolve branch-specific or PG pricing catalog
    const catalogData = await getLaundryCatalog(user, { branch_id: branchId });
    const catalogItems = catalogData.items || LAUNDRY_CATALOG;

    // Process itemized quantities and totals
    let items = [];
    let totalItemsCount = 0;
    let totalAmount = 0.0;

    if (data.items && Array.isArray(data.items)) {
      items = data.items.map((item) => {
        const qty = parseInt(item.quantity, 10) || 0;
        const catalogItem = catalogItems.find(
          (c) => c.name.toLowerCase() === (item.name || '').trim().toLowerCase()
        );
        const rate = item.rate !== undefined ? parseFloat(item.rate) : (catalogItem ? catalogItem.rate : 20.0);
        const itemTotal = qty * rate;

        if (qty > 0) {
          totalItemsCount += qty;
          totalAmount += itemTotal;
        }

        return {
          name: (item.name || 'Item').trim(),
          rate,
          total: itemTotal,
          quantity: qty,
        };
      });
    }

    // Validate staff assignment if provided
    let assignedTo = null;
    if (data.assigned_to) {
      if (user.role === ROLES.RESIDENT) {
        throw new AppError('Residents cannot assign staff directly', HTTP_STATUS.FORBIDDEN);
      }
      const staffUser = await trx('users')
        .where({ id: data.assigned_to })
        .whereIn('role', [ROLES.STAFF, ROLES.ADMIN, ROLES.SUPER_ADMIN])
        .whereNull('deleted_at')
        .first();

      if (!staffUser) {
        throw new AppError('Assigned staff member not found', HTTP_STATUS.NOT_FOUND);
      }
      assignedTo = staffUser.id;
    }

    const requestNumber = await generateRequestNumber(trx);
    const initialStatus = 'pending';

    const [requestId] = await trx('laundry_requests').insert({
      request_number: requestNumber,
      pg_id: pgId,
      branch_id: branchId,
      resident_id: residentId,
      room_id: roomId,
      request_type: data.request_type || 'Laundry',
      service_subtype: data.service_subtype || 'Wash & Fold',
      items: JSON.stringify(items),
      total_items_count: totalItemsCount,
      total_amount: totalAmount,
      pickup_date: data.pickup_date,
      pickup_time: data.pickup_time || '09:00 AM - 11:00 AM',
      special_instructions: data.special_instructions || null,
      status: initialStatus,
      assigned_to: assignedTo,
      admin_notes: data.admin_notes || null,
      is_billed: false,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    return await findById(requestId, user, trx);
  });
};

/**
 * Service: List Laundry Requests with filtering, search, and pagination
 */
export const findAll = async (user, query) => {
  const { isSuperAdmin, branchIds } = await resolveUserBranches(user);

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  const offset = (page - 1) * limit;

  const baseQuery = db('laundry_requests')
    .leftJoin('users as resident', 'laundry_requests.resident_id', 'resident.id')
    .leftJoin('rooms', 'laundry_requests.room_id', 'rooms.id')
    .leftJoin('branches', 'laundry_requests.branch_id', 'branches.id')
    .leftJoin('users as staff', 'laundry_requests.assigned_to', 'staff.id')
    .whereNull('laundry_requests.deleted_at');

  // Role scoping
  if (user.role === ROLES.RESIDENT) {
    baseQuery.where('laundry_requests.resident_id', user.id);
  } else if (!isSuperAdmin) {
    if (!branchIds || branchIds.length === 0) {
      return { data: [], pagination: { total: 0, page, limit, total_pages: 0 } };
    }
    baseQuery.whereIn('laundry_requests.branch_id', branchIds);
  }

  // Branch filter from query
  if (query.branch_id && query.branch_id !== 'all') {
    const filterBranchId = parseInt(query.branch_id, 10);
    if (!isSuperAdmin && !branchIds.includes(filterBranchId)) {
      throw new AppError('Access denied to specified branch', HTTP_STATUS.FORBIDDEN);
    }
    baseQuery.where('laundry_requests.branch_id', filterBranchId);
  }

  // Tabs (Image 1 Mobile & Image 3 Admin Table)
  if (query.tab) {
    const tab = query.tab.toLowerCase();
    if (tab === 'current') {
      baseQuery.whereIn('laundry_requests.status', ['pending', 'in_progress']);
    } else if (tab === 'history') {
      baseQuery.whereIn('laundry_requests.status', ['completed', 'cancelled']);
    } else if (tab === 'service') {
      baseQuery.whereNot('laundry_requests.request_type', 'Laundry');
    } else if (tab === 'laundry') {
      baseQuery.where('laundry_requests.request_type', 'Laundry');
    }
  }

  // Status filter
  if (query.status && query.status !== 'all') {
    baseQuery.where('laundry_requests.status', query.status.toLowerCase());
  }

  // Type filter
  const requestType = query.type || query.request_type;
  if (requestType && requestType !== 'all') {
    baseQuery.where('laundry_requests.request_type', requestType);
  }

  // Search keyword (resident name, room no, or request number)
  if (query.search && query.search.trim()) {
    const term = `%${query.search.trim()}%`;
    baseQuery.where((qb) => {
      qb.whereILike('resident.name', term)
        .orWhereILike('rooms.room_no', term)
        .orWhereILike('laundry_requests.request_number', term);
    });
  }

  const countQuery = baseQuery.clone().count('laundry_requests.id as total').first();
  const countRes = await countQuery;
  const total = parseInt(countRes?.total || 0, 10);

  const rows = await baseQuery
    .select(
      'laundry_requests.id',
      'laundry_requests.request_number',
      'laundry_requests.pg_id',
      'laundry_requests.branch_id',
      'branches.name as branch_name',
      'laundry_requests.request_type',
      'laundry_requests.service_subtype',
      'laundry_requests.items',
      'laundry_requests.total_items_count',
      'laundry_requests.total_amount',
      'laundry_requests.pickup_date',
      'laundry_requests.pickup_time',
      'laundry_requests.special_instructions',
      'laundry_requests.status',
      'laundry_requests.assigned_to',
      'laundry_requests.is_billed',
      'laundry_requests.payment_id',
      'staff.name as assigned_name',
      'staff.phone as assigned_phone',
      'laundry_requests.admin_notes',
      'laundry_requests.completed_at',
      'laundry_requests.created_at',
      'laundry_requests.updated_at',
      'resident.id as resident_id',
      'resident.name as resident_name',
      'resident.email as resident_email',
      'resident.phone as resident_phone',
      'resident.profile_photo as resident_photo',
      'rooms.id as room_id',
      'rooms.room_no',
      'rooms.room_type'
    )
    .orderBy('laundry_requests.created_at', 'desc')
    .limit(limit)
    .offset(offset);

  const formattedRows = rows.map((row) => {
    let parsedItems = [];
    try {
      parsedItems = typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []);
    } catch {
      parsedItems = [];
    }

    return {
      id: row.id,
      request_number: row.request_number,
      pg_id: row.pg_id,
      branch_id: row.branch_id,
      branch_name: row.branch_name,
      request_type: row.request_type,
      service_subtype: row.service_subtype,
      request_detail: generateRequestDetail(parsedItems),
      items: parsedItems,
      total_items_count: row.total_items_count,
      total_amount: parseFloat(row.total_amount || 0),
      pickup_date: formatDate(row.pickup_date),
      pickup_time: row.pickup_time,
      pickup_schedule: formatPickupSchedule(row.pickup_date, row.pickup_time),
      special_instructions: row.special_instructions,
      status: row.status,
      is_billed: Boolean(row.is_billed),
      payment_id: row.payment_id,
      resident: {
        id: row.resident_id,
        name: row.resident_name,
        email: row.resident_email,
        phone: row.resident_phone,
        profile_photo: row.resident_photo,
        photo_url: row.resident_photo ? `/uploads/profiles/${row.resident_photo}` : null,
      },
      room: row.room_id
        ? {
            id: row.room_id,
            room_no: row.room_no,
            room_type: row.room_type,
          }
        : null,
      assigned_staff: row.assigned_to
        ? {
            id: row.assigned_to,
            name: row.assigned_name,
            phone: row.assigned_phone,
          }
        : null,
      assigned_name: row.assigned_name || '-',
      admin_notes: row.admin_notes,
      completed_at: row.completed_at ? formatDate(row.completed_at) : null,
      created_at: formatDate(row.created_at),
      updated_at: formatDate(row.updated_at),
    };
  });

  return {
    data: formattedRows,
    pagination: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Service: Find Laundry Request by ID
 */
export const findById = async (id, user, trx) => {
  const query = trx ? trx : db;

  const row = await query('laundry_requests')
    .leftJoin('users as resident', 'laundry_requests.resident_id', 'resident.id')
    .leftJoin('rooms', 'laundry_requests.room_id', 'rooms.id')
    .leftJoin('branches', 'laundry_requests.branch_id', 'branches.id')
    .leftJoin('users as staff', 'laundry_requests.assigned_to', 'staff.id')
    .where('laundry_requests.id', id)
    .whereNull('laundry_requests.deleted_at')
    .select(
      'laundry_requests.*',
      'branches.name as branch_name',
      'staff.name as assigned_name',
      'staff.phone as assigned_phone',
      'staff.staff_role as assigned_role',
      'resident.id as resident_id',
      'resident.name as resident_name',
      'resident.email as resident_email',
      'resident.phone as resident_phone',
      'resident.profile_photo as resident_photo',
      'rooms.id as room_id',
      'rooms.room_no',
      'rooms.room_type'
    )
    .first();

  if (!row) {
    throw new AppError('Laundry request not found', HTTP_STATUS.NOT_FOUND);
  }

  // Scoping check
  if (user.role === ROLES.RESIDENT && row.resident_id !== user.id) {
    throw new AppError('You can only access your own requests', HTTP_STATUS.FORBIDDEN);
  }

  if (user.role !== ROLES.SUPER_ADMIN && user.role !== ROLES.RESIDENT) {
    const context = await resolveUserBranches(user, trx);
    if (!context.isSuperAdmin && !context.branchIds.includes(row.branch_id)) {
      throw new AppError('Access denied to requests from this branch', HTTP_STATUS.FORBIDDEN);
    }
  }

  let parsedItems = [];
  try {
    parsedItems = typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []);
  } catch {
    parsedItems = [];
  }

  return {
    id: row.id,
    request_number: row.request_number,
    pg_id: row.pg_id,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    request_type: row.request_type,
    service_subtype: row.service_subtype,
    request_detail: generateRequestDetail(parsedItems),
    items: parsedItems,
    total_items_count: row.total_items_count,
    total_amount: parseFloat(row.total_amount || 0),
    pickup_date: formatDate(row.pickup_date),
    pickup_time: row.pickup_time,
    pickup_schedule: formatPickupSchedule(row.pickup_date, row.pickup_time),
    special_instructions: row.special_instructions,
    status: row.status,
    is_billed: Boolean(row.is_billed),
    payment_id: row.payment_id,
    resident: {
      id: row.resident_id,
      name: row.resident_name,
      email: row.resident_email,
      phone: row.resident_phone,
      profile_photo: row.resident_photo,
      photo_url: row.resident_photo ? `/uploads/profiles/${row.resident_photo}` : null,
    },
    room: row.room_id
      ? {
          id: row.room_id,
          room_no: row.room_no,
          room_type: row.room_type,
        }
      : null,
    assigned_staff: row.assigned_to
      ? {
          id: row.assigned_to,
          name: row.assigned_name,
          phone: row.assigned_phone,
          role: row.assigned_role,
        }
      : null,
    assigned_name: row.assigned_name || '-',
    admin_notes: row.admin_notes,
    completed_at: row.completed_at ? formatDate(row.completed_at) : null,
    created_at: formatDate(row.created_at),
    updated_at: formatDate(row.updated_at),
  };
};

/**
 * Service: Get KPI statistics for top 4 cards (Image 3)
 */
export const getStats = async (user, query = {}) => {
  const { isSuperAdmin, branchIds, pgId } = await resolveUserBranches(user);

  let targetBranchIds = branchIds;
  if (query.branch_id && query.branch_id !== 'all') {
    const filterBranchId = parseInt(query.branch_id, 10);
    if (!isSuperAdmin && !branchIds.includes(filterBranchId)) {
      throw new AppError('Access denied to specified branch', HTTP_STATUS.FORBIDDEN);
    }
    targetBranchIds = [filterBranchId];
  }

  const baseQuery = db('laundry_requests').whereNull('deleted_at');

  if (!isSuperAdmin && targetBranchIds) {
    if (targetBranchIds.length === 0) {
      return { total_requests: 0, total: 0, in_progress: 0, pending: 0, completed: 0, cancelled: 0 };
    }
    baseQuery.whereIn('branch_id', targetBranchIds);
  }

  if (query.type && query.type !== 'all') {
    baseQuery.where('request_type', query.type);
  }

  const statsRes = await baseQuery
    .select(
      db.raw('COUNT(id) as total_requests'),
      db.raw("COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress"),
      db.raw("COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending"),
      db.raw("COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed"),
      db.raw("COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled")
    )
    .first();

  const total = parseInt(statsRes?.total_requests || 0, 10);
  const inProgress = parseInt(statsRes?.in_progress || 0, 10);
  const pending = parseInt(statsRes?.pending || 0, 10);
  const completed = parseInt(statsRes?.completed || 0, 10);
  const cancelled = parseInt(statsRes?.cancelled || 0, 10);

  return {
    pg_id: pgId,
    branch_id: query.branch_id && query.branch_id !== 'all' ? parseInt(query.branch_id, 10) : null,
    total_requests: total,
    total,
    in_progress: inProgress,
    pending,
    completed,
    cancelled,
  };
};

/**
 * Service: Update status of laundry request (pending -> in_progress -> completed)
 */
export const updateStatus = async (id, user, data) => {
  const current = await findById(id, user);

  const updates = {
    status: data.status.toLowerCase(),
    updated_at: db.fn.now(),
  };

  if (data.admin_notes !== undefined) {
    updates.admin_notes = data.admin_notes;
  }

  if (data.status.toLowerCase() === 'completed') {
    updates.completed_at = db.fn.now();
  }

  await db('laundry_requests').where({ id }).update(updates);
  return await findById(id, user);
};

/**
 * Service: Assign staff member to laundry request
 */
export const assignStaff = async (id, user, staffId) => {
  const current = await findById(id, user);

  const staffUser = await db('users')
    .where({ id: staffId })
    .whereIn('role', [ROLES.STAFF, ROLES.ADMIN, ROLES.SUPER_ADMIN])
    .whereNull('deleted_at')
    .first();

  if (!staffUser) {
    throw new AppError('Staff user not found', HTTP_STATUS.NOT_FOUND);
  }

  await db('laundry_requests').where({ id }).update({
    assigned_to: staffId,
    updated_at: db.fn.now(),
  });

  return await findById(id, user);
};

/**
 * Service: Soft delete / Cancel a laundry request
 */
export const remove = async (id, user) => {
  const current = await findById(id, user);

  if (user.role === ROLES.RESIDENT) {
    if (current.status === 'completed') {
      throw new AppError('Completed requests cannot be cancelled', HTTP_STATUS.BAD_REQUEST);
    }
  }

  await db('laundry_requests').where({ id }).update({
    deleted_at: db.fn.now(),
    status: 'cancelled',
  });

  return { success: true, message: 'Laundry request cancelled successfully' };
};

/**
 * Service: Get resident-wise laundry orders and payment history overview
 */
export const getResidentLaundryBilling = async (user, residentId) => {
  let targetResidentId;

  if (user.role === ROLES.RESIDENT) {
    targetResidentId = user.id;
  } else {
    if (!residentId) {
      throw new AppError('Resident ID is required', HTTP_STATUS.BAD_REQUEST);
    }
    targetResidentId = parseInt(residentId, 10);
  }

  // Resident details & active stay
  const resident = await db('users')
    .where('users.id', targetResidentId)
    .whereNull('users.deleted_at')
    .leftJoin('resident_pg_stays as stay', function () {
      this.on('stay.resident_id', '=', 'users.id')
        .andOn('stay.status', '=', db.raw('?', ['active']))
        .andOnNull('stay.deleted_at');
    })
    .leftJoin('branches', 'stay.branch_id', 'branches.id')
    .leftJoin('rooms', 'stay.room_id', 'rooms.id')
    .select(
      'users.id',
      'users.name',
      'users.email',
      'users.phone',
      'users.profile_photo',
      'stay.id as stay_id',
      'stay.pg_id',
      'stay.branch_id',
      'branches.name as branch_name',
      'rooms.id as room_id',
      'rooms.room_no',
      'rooms.room_type'
    )
    .first();

  if (!resident) {
    throw new AppError('Resident not found', HTTP_STATUS.NOT_FOUND);
  }

  // Permission check for admin
  if (user.role !== ROLES.RESIDENT && user.role !== ROLES.SUPER_ADMIN) {
    const context = await resolveUserBranches(user);
    if (!context.branchIds.includes(resident.branch_id)) {
      throw new AppError('Resident does not belong to your managed branches', HTTP_STATUS.FORBIDDEN);
    }
  }

  // 1. Fetch all laundry requests for this resident
  const laundryRequests = await db('laundry_requests')
    .where({ resident_id: targetResidentId })
    .whereNull('deleted_at')
    .orderBy('created_at', 'desc')
    .select(
      'id',
      'request_number',
      'request_type',
      'service_subtype',
      'items',
      'total_items_count',
      'total_amount',
      'pickup_date',
      'pickup_time',
      'special_instructions',
      'status',
      'is_billed',
      'payment_id',
      'created_at',
      'completed_at'
    );

  const formattedRequests = laundryRequests.map((r) => {
    let parsedItems = [];
    try {
      parsedItems = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []);
    } catch {}

    return {
      id: r.id,
      request_number: r.request_number,
      request_type: r.request_type,
      service_subtype: r.service_subtype,
      request_detail: generateRequestDetail(parsedItems),
      items: parsedItems,
      total_items_count: r.total_items_count,
      total_amount: parseFloat(r.total_amount || 0),
      pickup_date: formatDate(r.pickup_date),
      pickup_time: r.pickup_time,
      pickup_schedule: formatPickupSchedule(r.pickup_date, r.pickup_time),
      status: r.status,
      is_billed: Boolean(r.is_billed),
      payment_id: r.payment_id,
      created_at: formatDate(r.created_at),
      completed_at: r.completed_at ? formatDate(r.completed_at) : null,
    };
  });

  // 2. Fetch all laundry payments for this resident
  const paymentEntries = await db('payments')
    .where({ resident_id: targetResidentId, payment_type: 'laundry' })
    .whereNull('deleted_at')
    .orderBy('created_at', 'desc')
    .select(
      'id',
      'transaction_id',
      'receipt_no',
      'title',
      'amount',
      'paid_amount',
      'payment_method',
      'status',
      'due_date',
      'paid_at',
      'notes',
      'created_at'
    );

  const formattedPayments = paymentEntries.map((p) => {
    const amount = parseFloat(p.amount || 0);
    const paidAmount = parseFloat(p.paid_amount || 0);
    const dueAmount = Math.max(0, amount - paidAmount);

    return {
      id: p.id,
      receipt_no: p.receipt_no || '-',
      transaction_id: p.transaction_id || '-',
      title: p.title,
      amount,
      paid_amount: paidAmount,
      due_amount: dueAmount,
      payment_method: p.payment_method || '-',
      status: p.status,
      due_date: p.due_date ? formatDate(p.due_date) : null,
      paid_at: p.paid_at ? formatDate(p.paid_at) : null,
      notes: p.notes,
      created_at: formatDate(p.created_at),
    };
  });

  // 3. Compute billing metrics
  const totalOrders = formattedRequests.length;
  const totalAmountIncurred = formattedRequests.reduce((sum, r) => sum + r.total_amount, 0);

  // Unbilled requests are non-cancelled requests where is_billed is false
  const unbilledRequests = formattedRequests.filter((r) => !r.is_billed && r.status !== 'cancelled');
  const unbilledAmount = unbilledRequests.reduce((sum, r) => sum + r.total_amount, 0);

  // Billed requests
  const billedRequests = formattedRequests.filter((r) => r.is_billed);
  const billedAmount = billedRequests.reduce((sum, r) => sum + r.total_amount, 0);

  // Payments totals
  const totalPaid = formattedPayments.reduce((sum, p) => sum + p.paid_amount, 0);
  const totalDue = formattedPayments
    .filter((p) => ['pending', 'overdue'].includes(p.status))
    .reduce((sum, p) => sum + p.due_amount, 0);

  return {
    resident: {
      id: resident.id,
      name: resident.name,
      email: resident.email,
      phone: resident.phone,
      photo_url: resident.profile_photo ? `/uploads/profiles/${resident.profile_photo}` : null,
      stay_id: resident.stay_id,
      branch_id: resident.branch_id,
      branch_name: resident.branch_name || '-',
      room: resident.room_id
        ? {
            id: resident.room_id,
            room_no: resident.room_no,
            room_type: resident.room_type,
          }
        : null,
    },
    summary: {
      total_orders: totalOrders,
      total_amount_incurred: parseFloat(totalAmountIncurred.toFixed(2)),
      unbilled_orders_count: unbilledRequests.length,
      unbilled_amount: parseFloat(unbilledAmount.toFixed(2)),
      billed_orders_count: billedRequests.length,
      billed_amount: parseFloat(billedAmount.toFixed(2)),
      total_paid: parseFloat(totalPaid.toFixed(2)),
      total_due: parseFloat(totalDue.toFixed(2)),
    },
    laundry_requests: formattedRequests,
    payment_entries: formattedPayments,
  };
};

/**
 * Service: Create Laundry Payment Entry for Resident(s) - Supports Single and Bulk Creation
 * Creates entry in payments table so resident can view and pay dues via standard payment checkout.
 */
export const createLaundryPaymentEntries = async (user, payload) => {
  const context = await resolveUserBranches(user);

  // Normalize entries from single resident or bulk entries array
  let entries = [];
  if (Array.isArray(payload.entries) && payload.entries.length > 0) {
    entries = payload.entries;
  } else if (payload.resident_id) {
    entries = [
      {
        resident_id: parseInt(payload.resident_id, 10),
        amount: payload.amount !== undefined && payload.amount !== null ? parseFloat(payload.amount) : undefined,
        laundry_request_ids: payload.laundry_request_ids,
      },
    ];
  } else {
    throw new AppError('No resident billing entries provided', HTTP_STATUS.BAD_REQUEST);
  }

  const title = payload.title || 'Laundry Charges';
  const dueDate = payload.due_date || null;
  const notes = payload.notes || 'Generated laundry payment invoice';

  const createdPayments = [];

  await db.transaction(async (trx) => {
    for (const entry of entries) {
      const resId = parseInt(entry.resident_id, 10);

      const residentUser = await trx('users')
        .where({ id: resId, role: ROLES.RESIDENT })
        .whereNull('deleted_at')
        .first();

      if (!residentUser) {
        throw new AppError(`Resident with ID ${resId} not found`, HTTP_STATUS.NOT_FOUND);
      }

      const activeStay = await trx('resident_pg_stays')
        .where({ resident_id: resId, status: 'active' })
        .whereNull('deleted_at')
        .first();

      if (!activeStay) {
        throw new AppError(`Resident ${residentUser.name} does not have an active stay`, HTTP_STATUS.BAD_REQUEST);
      }

      if (!context.isSuperAdmin && !context.branchIds.includes(activeStay.branch_id)) {
        throw new AppError(`Resident ${residentUser.name} does not belong to your managed branches`, HTTP_STATUS.FORBIDDEN);
      }

      // Query unbilled requests to link
      let reqQuery = trx('laundry_requests')
        .where({ resident_id: resId, is_billed: false })
        .whereNot('status', 'cancelled')
        .whereNull('deleted_at');

      if (Array.isArray(entry.laundry_request_ids) && entry.laundry_request_ids.length > 0) {
        reqQuery = reqQuery.whereIn('id', entry.laundry_request_ids);
      }

      const unbilledReqs = await reqQuery;

      let billAmount = 0.0;
      if (entry.amount !== undefined && entry.amount !== null && Number(entry.amount) > 0) {
        billAmount = parseFloat(entry.amount);
      } else {
        billAmount = unbilledReqs.reduce((sum, r) => sum + parseFloat(r.total_amount || 0), 0);
      }

      if (billAmount <= 0) {
        throw new AppError(
          `Cannot create laundry payment for ${residentUser.name}: amount is 0 and no unbilled requests exist`,
          HTTP_STATUS.BAD_REQUEST
        );
      }

      const receiptNo = `LND-${Date.now().toString().slice(-6)}-${resId}`;
      const transactionId = `TXN-LND-${Date.now()}-${resId}`;

      // Insert into payments table
      const [paymentId] = await trx('payments').insert({
        transaction_id: transactionId,
        receipt_no: receiptNo,
        resident_id: resId,
        pg_id: activeStay.pg_id,
        branch_id: activeStay.branch_id,
        stay_id: activeStay.id,
        room_id: activeStay.room_id || null,
        title,
        payment_type: 'laundry',
        due_date: dueDate,
        amount: billAmount,
        other_amount: billAmount,
        paid_amount: 0.00,
        status: 'pending',
        notes,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

      // Mark the requests as billed
      if (unbilledReqs.length > 0) {
        const billedIds = unbilledReqs.map((r) => r.id);
        await trx('laundry_requests')
          .whereIn('id', billedIds)
          .update({
            is_billed: true,
            payment_id: paymentId,
            updated_at: db.fn.now(),
          });
      }

      createdPayments.push({
        id: paymentId,
        resident_id: resId,
        resident_name: residentUser.name,
        branch_id: activeStay.branch_id,
        receipt_no: receiptNo,
        transaction_id: transactionId,
        title,
        amount: billAmount,
        due_date: dueDate ? formatDate(dueDate) : null,
        status: 'pending',
        linked_laundry_requests_count: unbilledReqs.length,
      });
    }
  });

  const totalAmountBilled = createdPayments.reduce((sum, p) => sum + p.amount, 0);

  return {
    total_residents_billed: createdPayments.length,
    total_amount_billed: parseFloat(totalAmountBilled.toFixed(2)),
    payments: createdPayments,
  };
};

/**
 * Service: List residents with their laundry activity, order counts, unbilled amounts, and payment status
 * Powers Admin Laundry Residents Dashboard & Billing views.
 */
export const findAllResidentsWithLaundry = async (user, query = {}) => {
  const context = await resolveUserBranches(user);

  if (user.role === ROLES.RESIDENT) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  const offset = (page - 1) * limit;

  // 1. Subquery for Laundry Request Aggregates
  const lSub = db('laundry_requests')
    .select('resident_id')
    .count('id as total_orders')
    .sum('total_items_count as total_items_cleaned')
    .sum('total_amount as total_charges')
    .select(db.raw("COALESCE(SUM(CASE WHEN is_billed = 0 AND status != 'cancelled' THEN 1 ELSE 0 END), 0) as unbilled_orders_count"))
    .select(db.raw("COALESCE(SUM(CASE WHEN is_billed = 0 AND status != 'cancelled' THEN total_amount ELSE 0 END), 0) as unbilled_amount"))
    .select(db.raw("COALESCE(SUM(CASE WHEN is_billed = 1 THEN total_amount ELSE 0 END), 0) as billed_amount"))
    .select(db.raw("COALESCE(SUM(CASE WHEN status IN ('pending', 'in_progress') THEN 1 ELSE 0 END), 0) as active_orders_count"))
    .select(db.raw("COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed_orders_count"))
    .whereNull('deleted_at')
    .groupBy('resident_id')
    .as('laundry_stats');

  // 2. Subquery for Laundry Payment Aggregates
  const pSub = db('payments')
    .select('resident_id')
    .sum('paid_amount as total_paid')
    .select(db.raw("COALESCE(SUM(CASE WHEN status IN ('pending', 'overdue') THEN (amount - paid_amount) ELSE 0 END), 0) as total_due"))
    .select(db.raw("COALESCE(SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END), 0) as overdue_payments_count"))
    .where('payment_type', 'laundry')
    .whereNull('deleted_at')
    .groupBy('resident_id')
    .as('payment_stats');

  // 3. Base Query joining active stays
  let baseQuery = db('users')
    .where('users.role', ROLES.RESIDENT)
    .whereNull('users.deleted_at')
    .join('resident_pg_stays as stay', function () {
      this.on('stay.resident_id', '=', 'users.id')
        .andOn('stay.status', '=', db.raw('?', ['active']))
        .andOnNull('stay.deleted_at');
    })
    .leftJoin('branches', 'stay.branch_id', 'branches.id')
    .leftJoin('rooms', 'stay.room_id', 'rooms.id')
    .leftJoin(lSub, 'users.id', 'laundry_stats.resident_id')
    .leftJoin(pSub, 'users.id', 'payment_stats.resident_id');

  // Tenant / Branch scoping
  if (!context.isSuperAdmin) {
    if (!context.branchIds || context.branchIds.length === 0) {
      return {
        data: [],
        pagination: { total_records: 0, page, limit, total_pages: 0, has_next: false, has_prev: false },
        overview: { total_residents: 0, residents_with_laundry: 0, residents_with_unbilled: 0, total_unbilled_amount: 0, total_due_amount: 0 },
      };
    }
    baseQuery.whereIn('stay.branch_id', context.branchIds);
  }

  // Branch filter from query
  if (query.branch_id && query.branch_id !== 'all') {
    const filterBranchId = parseInt(query.branch_id, 10);
    if (!context.isSuperAdmin && !context.branchIds.includes(filterBranchId)) {
      throw new AppError('Access denied to specified branch', HTTP_STATUS.FORBIDDEN);
    }
    baseQuery.where('stay.branch_id', filterBranchId);
  }

  // Search keyword (resident name, phone, email, or room number)
  if (query.search && query.search.trim()) {
    const term = `%${query.search.trim()}%`;
    baseQuery.where((qb) => {
      qb.whereILike('users.name', term)
        .orWhereILike('users.phone', term)
        .orWhereILike('users.email', term)
        .orWhereILike('rooms.room_no', term);
    });
  }

  // Filter by laundry activity status
  if (query.laundry_status && query.laundry_status !== 'all') {
    const lStatus = query.laundry_status.toLowerCase();
    if (lStatus === 'has_orders') {
      baseQuery.where('laundry_stats.total_orders', '>', 0);
    } else if (lStatus === 'has_unbilled') {
      baseQuery.where('laundry_stats.unbilled_amount', '>', 0);
    } else if (lStatus === 'has_due') {
      baseQuery.where('payment_stats.total_due', '>', 0);
    } else if (lStatus === 'active_orders') {
      baseQuery.where('laundry_stats.active_orders_count', '>', 0);
    }
  }

  // Count total matching records
  const countRow = await baseQuery.clone().count('users.id as total').first();
  const total = parseInt(countRow?.total || 0, 10);

  // Sorting
  const sortBy = (query.sort_by || 'unbilled_amount').toLowerCase();
  const sortOrder = (query.order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  if (sortBy === 'name') {
    baseQuery.orderBy('users.name', sortOrder);
  } else if (sortBy === 'room_no') {
    baseQuery.orderBy('rooms.room_no', sortOrder);
  } else if (sortBy === 'total_orders') {
    baseQuery.orderBy(db.raw('COALESCE(laundry_stats.total_orders, 0)'), sortOrder);
  } else if (sortBy === 'total_due') {
    baseQuery.orderBy(db.raw('COALESCE(payment_stats.total_due, 0)'), sortOrder);
  } else if (sortBy === 'created_at') {
    baseQuery.orderBy('users.created_at', sortOrder);
  } else {
    // Default: unbilled amount desc, then total orders desc
    baseQuery.orderBy(db.raw('COALESCE(laundry_stats.unbilled_amount, 0)'), sortOrder)
      .orderBy(db.raw('COALESCE(laundry_stats.total_orders, 0)'), 'desc');
  }

  const rows = await baseQuery
    .select(
      'users.id as resident_id',
      'users.name as resident_name',
      'users.email',
      'users.phone',
      'users.profile_photo',
      'users.status as resident_status',
      'stay.id as stay_id',
      'stay.branch_id',
      'branches.name as branch_name',
      'rooms.id as room_id',
      'rooms.room_no',
      'rooms.room_type',
      'stay.bed_number',
      'laundry_stats.total_orders',
      'laundry_stats.total_items_cleaned',
      'laundry_stats.total_charges',
      'laundry_stats.unbilled_orders_count',
      'laundry_stats.unbilled_amount',
      'laundry_stats.billed_amount',
      'laundry_stats.active_orders_count',
      'laundry_stats.completed_orders_count',
      'payment_stats.total_paid',
      'payment_stats.total_due',
      'payment_stats.overdue_payments_count'
    )
    .limit(limit)
    .offset(offset);

  // Fetch latest order for each resident in this page
  const residentIds = rows.map((r) => r.resident_id);
  const latestOrdersMap = {};

  if (residentIds.length > 0) {
    const latestOrders = await db('laundry_requests')
      .whereIn('resident_id', residentIds)
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
      .select(
        'id',
        'request_number',
        'resident_id',
        'items',
        'total_amount',
        'pickup_date',
        'pickup_time',
        'status',
        'is_billed',
        'created_at'
      );

    latestOrders.forEach((o) => {
      if (!latestOrdersMap[o.resident_id]) {
        let parsedItems = [];
        try {
          parsedItems = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []);
        } catch {}

        latestOrdersMap[o.resident_id] = {
          id: o.id,
          request_number: o.request_number,
          request_detail: generateRequestDetail(parsedItems),
          pickup_schedule: formatPickupSchedule(o.pickup_date, o.pickup_time),
          total_amount: parseFloat(o.total_amount || 0),
          status: o.status,
          is_billed: Boolean(o.is_billed),
          created_at: formatDate(o.created_at),
        };
      }
    });
  }

  // Format each row
  const formattedData = rows.map((r) => {
    const totalOrders = parseInt(r.total_orders || 0, 10);
    const unbilledOrdersCount = parseInt(r.unbilled_orders_count || 0, 10);
    const unbilledAmount = parseFloat(r.unbilled_amount || 0);
    const billedAmount = parseFloat(r.billed_amount || 0);
    const totalCharges = parseFloat(r.total_charges || 0);
    const activeOrdersCount = parseInt(r.active_orders_count || 0, 10);
    const completedOrdersCount = parseInt(r.completed_orders_count || 0, 10);
    const totalItemsCleaned = parseInt(r.total_items_cleaned || 0, 10);

    const totalPaid = parseFloat(r.total_paid || 0);
    const totalDue = parseFloat(r.total_due || 0);
    const overdueCount = parseInt(r.overdue_payments_count || 0, 10);

    let paymentStatus = 'paid';
    if (totalOrders === 0 && totalDue === 0) {
      paymentStatus = 'no_orders';
    } else if (overdueCount > 0) {
      paymentStatus = 'overdue';
    } else if (totalDue > 0 || unbilledAmount > 0) {
      paymentStatus = 'pending';
    }

    return {
      resident: {
        id: r.resident_id,
        name: r.resident_name,
        email: r.email,
        phone: r.phone,
        profile_photo: r.profile_photo,
        photo_url: buildFileUrl('users', r.profile_photo),
        status: r.resident_status,
        stay_id: r.stay_id,
        branch_id: r.branch_id,
        branch_name: r.branch_name || '-',
        room: r.room_id
          ? {
              id: r.room_id,
              room_no: r.room_no,
              room_type: r.room_type,
              bed_number: r.bed_number || null,
            }
          : null,
      },
      laundry_summary: {
        total_orders: totalOrders,
        total_items_cleaned: totalItemsCleaned,
        total_charges: totalCharges,
        unbilled_orders_count: unbilledOrdersCount,
        unbilled_amount: unbilledAmount,
        billed_amount: billedAmount,
        active_orders_count: activeOrdersCount,
        completed_orders_count: completedOrdersCount,
      },
      payment_summary: {
        total_paid: totalPaid,
        total_due: totalDue,
        payment_status: paymentStatus,
      },
      last_order: latestOrdersMap[r.resident_id] || null,
    };
  });

  // Calculate overview metrics for top KPI cards
  const overviewRow = await baseQuery.clone().clearSelect().select(
    db.raw('COUNT(users.id) as total_residents'),
    db.raw('COALESCE(SUM(CASE WHEN laundry_stats.total_orders > 0 THEN 1 ELSE 0 END), 0) as residents_with_laundry'),
    db.raw('COALESCE(SUM(CASE WHEN laundry_stats.unbilled_amount > 0 THEN 1 ELSE 0 END), 0) as residents_with_unbilled'),
    db.raw('COALESCE(SUM(laundry_stats.unbilled_amount), 0) as total_unbilled_amount'),
    db.raw('COALESCE(SUM(payment_stats.total_due), 0) as total_due_amount')
  ).first();

  const totalPages = Math.ceil(total / limit);

  return {
    data: formattedData,
    pagination: {
      page,
      limit,
      total_records: total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
      overview: {
        total_residents: parseInt(overviewRow?.total_residents || 0, 10),
        residents_with_laundry: parseInt(overviewRow?.residents_with_laundry || 0, 10),
        residents_with_unbilled: parseInt(overviewRow?.residents_with_unbilled || 0, 10),
        total_unbilled_amount: parseFloat(overviewRow?.total_unbilled_amount || 0),
        total_due_amount: parseFloat(overviewRow?.total_due_amount || 0),
      },
    },
  };
};

export const findAllLaundryUsers = findAllResidentsWithLaundry;

export default {
  LAUNDRY_CATALOG,
  LAUNDRY_PICKUP_TIME_SLOT,
  LAUNDRY_SERVICE_TYPES,
  getLaundryCatalog,
  updateLaundryCatalog,
  create,
  findAll,
  findById,
  getStats,
  updateStatus,
  assignStaff,
  remove,
  getResidentLaundryBilling,
  createLaundryPaymentEntries,
  findAllResidentsWithLaundry,
  findAllLaundryUsers,
};
