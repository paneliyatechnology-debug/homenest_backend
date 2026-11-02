import moment from 'moment';
import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';
import { buildFileUrl } from '../utils/url.js';
import { deleteFoodMenuImageFile, deleteFoodFeedbackImageFile } from '../middlewares/upload.middleware.js';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

class FoodMenuService {
  /**
   * Helper: Get current IST Date ('YYYY-MM-DD')
   */
  static getTodayISTDate = () => {
    return moment().utcOffset('+05:30').format('YYYY-MM-DD');
  };

  /**
   * Helper: Get IST Day of Week for a given date ('monday', 'tuesday', etc.)
   */
  static getDayOfWeekFromDate = (dateStr) => {
    return moment(dateStr).format('dddd').toLowerCase();
  };

  /**
   * Helper: Format Date string strictly to 'YYYY-MM-DD'
   */
  static formatDateStr = (dateVal) => {
    if (!dateVal) return null;
    return moment(dateVal).format('YYYY-MM-DD');
  };

  /**
   * Helper: Calculate the meal serving start moment in IST (+05:30)
   * Falls back to standard PG meal schedule if start_time is missing:
   * - Breakfast: 07:30 AM
   * - Lunch: 12:30 PM
   * - Dinner: 07:30 PM
   */
  static getMealStartMoment = (menuDateVal, startTimeStr, mealType) => {
    const dateStr = FoodMenuService.formatDateStr(menuDateVal);

    const DEFAULT_START_TIMES = {
      breakfast: '07:30 AM',
      lunch: '12:30 PM',
      dinner: '07:30 PM',
    };

    const rawTime = (startTimeStr || DEFAULT_START_TIMES[mealType] || '07:00 AM').trim();
    const formats = ['h:mm A', 'hh:mm A', 'h:mma', 'hh:mma', 'H:mm', 'HH:mm', 'h A', 'ha'];
    const parsedTime = moment(rawTime, formats, false);

    const hours = parsedTime.isValid() ? parsedTime.hours() : 7;
    const minutes = parsedTime.isValid() ? parsedTime.minutes() : 0;

    const timeFormatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    const isoStr = `${dateStr}T${timeFormatted}+05:30`;

    return {
      dateStr,
      displayTime: rawTime,
      mealStartMoment: moment(isoStr),
    };
  };

  /**
   * Helper: Resolve branch and pg for the caller with strict permission checks
   * - Resident: always locked to their assigned active branch stay.
   * - Admin: verified ownership of candidate branch or defaults to primary branch.
   * - Super Admin: allows any valid branch.
   */
  resolveBranchContext = async (user, candidateBranchId = null) => {
    if (user.role === ROLES.RESIDENT) {
      const stay = await db('resident_pg_stays')
        .where({ resident_id: user.id, status: 'active' })
        .whereNull('deleted_at')
        .orderBy('id', 'desc')
        .first();

      if (!stay || !stay.branch_id) {
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

      // Default to first active branch for admin's PG
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
   * Helper: Format a single food menu entry with clean types and file URLs
   */
  static formatMenuItem = (item) => {
    const mealStart = FoodMenuService.getMealStartMoment(item.menu_date, item.start_time, item.meal_type);
    const nowIST = moment().utcOffset('+05:30');
    const isFeedbackOpen = nowIST.isSameOrAfter(mealStart.mealStartMoment);

    return {
      id: item.id,
      branch_id: item.branch_id,
      menu_date: FoodMenuService.formatDateStr(item.menu_date),
      day_of_week: item.day_of_week,
      meal_type: item.meal_type,
      name: item.name,
      description: item.description || null,
      image: item.image || null,
      image_url: buildFileUrl('food_menu', item.image),
      start_time: item.start_time || null,
      end_time: item.end_time || null,
      included_items: item.included_items || null,
      is_active: Boolean(item.is_active),
      is_feedback_open: isFeedbackOpen,
      sort_order: item.sort_order || 0,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  };

  // ==========================================
  // Food Menu Queries (Date-wise & Range-wise)
  // ==========================================

  /**
   * Get Food Menus Date-Wise with Start Date & End Date Filter
   * Supports:
   * - date: single date filter
   * - start_date & end_date: range filter (e.g. weekly or monthly)
   * - meal_type: optional filter (breakfast, lunch, dinner, all)
   * Defaults to 7 days from today if no date filter is passed.
   */
  getMenuByDateRange = async (user, options = {}) => {
    const {
      branch_id,
      date,
      start_date,
      end_date,
      day_of_week,
      meal_type,
      page = 1,
      limit = 30,
    } = options;

    const branchContext = await this.resolveBranchContext(user, branch_id);
    const todayDate = FoodMenuService.getTodayISTDate();

    // Determine target date range
    let queryStartDate = start_date;
    let queryEndDate = end_date;

    if (date) {
      queryStartDate = date;
      queryEndDate = date;
    } else if (!queryStartDate && !queryEndDate) {
      queryStartDate = todayDate;
      queryEndDate = moment(todayDate).add(6, 'days').format('YYYY-MM-DD');
    }

    const current_page = Math.max(1, parseInt(page, 10) || 1);
    const per_page = Math.max(1, parseInt(limit, 10) || 30);
    const offset = (current_page - 1) * per_page;

    const base_query = db('food_menus')
      .where('food_menus.branch_id', branchContext.branch_id)
      .whereNull('food_menus.deleted_at')
      .modify((qb) => {
        if (queryStartDate) qb.where('food_menus.menu_date', '>=', queryStartDate);
        if (queryEndDate) qb.where('food_menus.menu_date', '<=', queryEndDate);
        if (day_of_week) qb.where('food_menus.day_of_week', day_of_week.toLowerCase());
        if (meal_type && meal_type !== 'all') qb.where('food_menus.meal_type', meal_type.toLowerCase());
      });

    const count_res = await base_query.clone().count('food_menus.id as total').first();
    const total = count_res ? parseInt(count_res.total, 10) : 0;

    const allItems = await base_query
      .clone()
      .select('food_menus.*')
      .orderBy('food_menus.menu_date', 'asc')
      .orderBy('food_menus.sort_order', 'asc')
      .orderBy('food_menus.id', 'asc')
      .limit(per_page)
      .offset(offset);

    // If caller is resident, fetch their feedback for these menu items
    let residentFeedbackByMenuId = {};
    if (user.role === ROLES.RESIDENT && allItems.length > 0) {
      const menuIds = allItems.map((it) => it.id);
      const fbRows = await db('food_feedback')
        .where({ resident_id: user.id })
        .whereIn('menu_id', menuIds)
        .whereNull('deleted_at');

      fbRows.forEach((fb) => {
        residentFeedbackByMenuId[fb.menu_id] = {
          id: fb.id,
          rating: fb.rating,
          comments: fb.comments,
          image: fb.image || null,
          image_url: buildFileUrl('food_feedback', fb.image),
          feedback_date: fb.feedback_date,
          created_at: fb.created_at,
        };
      });
    }

    // Group items date-wise and meal-wise
    const menusByDate = {};
    allItems.forEach((it) => {
      const dateStr = FoodMenuService.formatDateStr(it.menu_date);
      if (!menusByDate[dateStr]) {
        menusByDate[dateStr] = {
          date: dateStr,
          day_of_week: it.day_of_week,
          total_items: 0,
          meals: {
            breakfast: [],
            lunch: [],
            dinner: [],
          },
        };
      }
      const formattedItem = {
        ...FoodMenuService.formatMenuItem(it),
        my_feedback: user.role === ROLES.RESIDENT ? (residentFeedbackByMenuId[it.id] || null) : undefined,
      };
      if (menusByDate[dateStr].meals[it.meal_type]) {
        menusByDate[dateStr].meals[it.meal_type].push(formattedItem);
      }
      menusByDate[dateStr].total_items += 1;
    });

    return {
      branch_id: branchContext.branch_id,
      branch_name: branchContext.branch_name,
      start_date: queryStartDate || null,
      end_date: queryEndDate || null,
      menus: Object.values(menusByDate),
      items: allItems.map((it) => ({
        ...FoodMenuService.formatMenuItem(it),
        my_feedback: user.role === ROLES.RESIDENT ? (residentFeedbackByMenuId[it.id] || null) : undefined,
      })),
      pagination: {
        total,
        page: current_page,
        limit: per_page,
        total_pages: Math.ceil(total / per_page) || 1,
      },
    };
  };

  /**
   * Get single menu item details by ID
   */
  getMenuById = async (id, user) => {
    const item = await db('food_menus')
      .join('branches', 'food_menus.branch_id', 'branches.id')
      .join('pgs', 'food_menus.pg_id', 'pgs.id')
      .where('food_menus.id', id)
      .whereNull('food_menus.deleted_at')
      .select(
        'food_menus.*',
        'branches.name as branch_name',
        'pgs.owner_id'
      )
      .first();

    if (!item) {
      throw new AppError('Food menu item not found', HTTP_STATUS.NOT_FOUND);
    }

    if (user.role === ROLES.ADMIN && item.owner_id !== user.id) {
      throw new AppError('Access denied. You do not manage this branch menu.', HTTP_STATUS.FORBIDDEN);
    }

    return {
      ...FoodMenuService.formatMenuItem(item),
      branch_name: item.branch_name,
    };
  };

  getMenuItemById = this.getMenuById;

  // ==========================================
  // Admin Menu Management (CRUD)
  // ==========================================

  /**
   * Create a single menu item (Date-wise)
   */
  createMenu = async (data, file, user) => {
    const branchContext = await this.resolveBranchContext(user, data.branch_id);
    const menuDate = data.menu_date || data.date;

    if (!menuDate) {
      throw new AppError('Menu date is required (YYYY-MM-DD)', HTTP_STATUS.BAD_REQUEST);
    }

    const formattedDate = FoodMenuService.formatDateStr(menuDate);
    const dayOfWeek = FoodMenuService.getDayOfWeekFromDate(formattedDate);
    const imageFilename = file ? file.filename : (data.image || null);

    const [itemId] = await db('food_menus').insert({
      pg_id: branchContext.pg_id,
      branch_id: branchContext.branch_id,
      menu_date: formattedDate,
      day_of_week: dayOfWeek,
      meal_type: data.meal_type.toLowerCase(),
      name: data.name.trim(),
      description: data.description ? data.description.trim() : null,
      image: imageFilename,
      start_time: data.start_time ? data.start_time.trim() : null,
      end_time: data.end_time ? data.end_time.trim() : null,
      included_items: data.included_items ? data.included_items.trim() : null,
      is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
      sort_order: data.sort_order ? parseInt(data.sort_order, 10) : 0,
    });

    return itemId;
  };

  createMenuItem = this.createMenu;

  /**
   * Update a menu item (supports changing menu_date, image, meal details)
   */
  updateMenu = async (id, data, file, user) => {
    const item = await db('food_menus')
      .join('pgs', 'food_menus.pg_id', 'pgs.id')
      .where('food_menus.id', id)
      .whereNull('food_menus.deleted_at')
      .select('food_menus.*', 'pgs.owner_id')
      .first();

    if (!item) {
      throw new AppError('Food menu item not found', HTTP_STATUS.NOT_FOUND);
    }

    if (user.role === ROLES.ADMIN && item.owner_id !== user.id) {
      throw new AppError('Access denied. You do not manage this branch menu.', HTTP_STATUS.FORBIDDEN);
    }

    const updatePayload = {
      updated_at: db.fn.now(),
    };

    if (data.name !== undefined) updatePayload.name = data.name.trim();
    if (data.description !== undefined) updatePayload.description = data.description ? data.description.trim() : null;
    if (data.meal_type !== undefined) updatePayload.meal_type = data.meal_type.toLowerCase();
    if (data.start_time !== undefined) updatePayload.start_time = data.start_time ? data.start_time.trim() : null;
    if (data.end_time !== undefined) updatePayload.end_time = data.end_time ? data.end_time.trim() : null;
    if (data.included_items !== undefined) updatePayload.included_items = data.included_items ? data.included_items.trim() : null;
    if (data.is_active !== undefined) updatePayload.is_active = Boolean(data.is_active);
    if (data.sort_order !== undefined) updatePayload.sort_order = parseInt(data.sort_order, 10);

    const targetDate = data.menu_date || data.date;
    if (targetDate) {
      const formattedDate = FoodMenuService.formatDateStr(targetDate);
      updatePayload.menu_date = formattedDate;
      updatePayload.day_of_week = FoodMenuService.getDayOfWeekFromDate(formattedDate);
    }

    if (file) {
      if (item.image) {
        deleteFoodMenuImageFile(item.image);
      }
      updatePayload.image = file.filename;
    }

    await db('food_menus').where({ id }).update(updatePayload);
    return id;
  };

  updateMenuItem = this.updateMenu;

  /**
   * Delete a single menu item (soft delete)
   */
  deleteMenu = async (id, user) => {
    const item = await db('food_menus')
      .join('pgs', 'food_menus.pg_id', 'pgs.id')
      .where('food_menus.id', id)
      .whereNull('food_menus.deleted_at')
      .select('food_menus.*', 'pgs.owner_id')
      .first();

    if (!item) {
      throw new AppError('Food menu item not found', HTTP_STATUS.NOT_FOUND);
    }

    if (user.role === ROLES.ADMIN && item.owner_id !== user.id) {
      throw new AppError('Access denied. You do not manage this branch menu.', HTTP_STATUS.FORBIDDEN);
    }

    await db('food_menus').where({ id }).update({
      deleted_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    return id;
  };

  deleteMenuItem = this.deleteMenu;

  // ==========================================
  // Food Feedback Module
  // ==========================================

  /**
   * Submit or update resident food feedback for a specific menu item
   * - menu_id passed in URL param (/feedback/:menu_id) or form-data
   * - Automatically derives meal_type, branch_id, and pg_id from the menu item
   * - Automatically sets feedback_date to current timestamp (when API is called)
   * - Supports optional rating (1-5), optional comments (max 300 chars), and optional image file
   * - Enforces 1 feedback per resident per menu item (upserts/updates if already exists)
   */
  submitFeedback = async (data, file, user) => {
    if (user.role !== ROLES.RESIDENT) {
      throw new AppError('Only residents can submit food feedback', HTTP_STATUS.FORBIDDEN);
    }

    const branchContext = await this.resolveBranchContext(user);
    const targetMenuId = Number(data.menu_id || data.id || data.menu_item_id);

    if (!targetMenuId || isNaN(targetMenuId)) {
      throw new AppError('Valid menu ID is required in URL or request', HTTP_STATUS.BAD_REQUEST);
    }

    // Look up the food menu entry
    const menuItem = await db('food_menus')
      .where('id', targetMenuId)
      .whereNull('deleted_at')
      .first();

    if (!menuItem) {
      throw new AppError('Food menu item not found', HTTP_STATUS.NOT_FOUND);
    }

    // Verify cross-branch access: resident can only review their assigned branch menu
    if (menuItem.branch_id !== branchContext.branch_id) {
      throw new AppError('Access denied. You cannot submit feedback for another branch menu.', HTTP_STATUS.FORBIDDEN);
    }

    // Verify that the meal serving start time has already begun
    const mealStart = FoodMenuService.getMealStartMoment(menuItem.menu_date, menuItem.start_time, menuItem.meal_type);
    const nowIST = moment().utcOffset('+05:30');

    if (mealStart.mealStartMoment.isAfter(nowIST)) {
      throw new AppError(
        `Feedback can only be submitted after the meal serving start time (${mealStart.dateStr} at ${mealStart.displayTime}). You cannot submit feedback before the meal is served.`,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const rating = parseInt(data.rating, 10);
    const comments = data.comments ? data.comments.trim().slice(0, 300) : null;
    const imageFilename = file ? file.filename : null;

    // Check if feedback already exists for this resident and menu_id
    const existing = await db('food_feedback')
      .where({
        resident_id: user.id,
        menu_id: menuItem.id,
      })
      .whereNull('deleted_at')
      .first();

    if (existing) {
      const updatePayload = {
        rating,
        comments,
        meal_type: menuItem.meal_type,
        branch_id: menuItem.branch_id,
        pg_id: menuItem.pg_id,
        feedback_date: db.fn.now(),
        updated_at: db.fn.now(),
      };

      if (imageFilename) {
        if (existing.image) {
          deleteFoodFeedbackImageFile(existing.image);
        }
        updatePayload.image = imageFilename;
      }

      await db('food_feedback')
        .where({ id: existing.id })
        .update(updatePayload);

      return {
        id: existing.id,
        is_updated: true,
        message: `Your feedback for ${menuItem.name} was updated successfully`,
      };
    }

    // Insert new feedback
    const [newId] = await db('food_feedback').insert({
      pg_id: menuItem.pg_id,
      branch_id: menuItem.branch_id,
      resident_id: user.id,
      menu_id: menuItem.id,
      meal_type: menuItem.meal_type,
      feedback_date: db.fn.now(),
      rating,
      comments,
      image: imageFilename,
    });

    return {
      id: newId,
      is_updated: false,
      message: `Your feedback for ${menuItem.name} was submitted successfully`,
    };
  };

  /**
   * Get feedback for a specific food menu item
   * - If resident: returns this resident's feedback for this menu item (or null)
   * - If admin / super_admin: returns feedback summary and list of resident feedbacks for this menu item
   */
  getFeedbackByMenuId = async (menuId, user) => {
    const targetMenuId = Number(menuId);
    if (!targetMenuId || isNaN(targetMenuId)) {
      throw new AppError('Valid menu ID is required', HTTP_STATUS.BAD_REQUEST);
    }

    const menuItem = await db('food_menus')
      .where('id', targetMenuId)
      .whereNull('deleted_at')
      .first();

    if (!menuItem) {
      throw new AppError('Food menu item not found', HTTP_STATUS.NOT_FOUND);
    }

    const branchContext = await this.resolveBranchContext(user, menuItem.branch_id);

    const mealStart = FoodMenuService.getMealStartMoment(menuItem.menu_date, menuItem.start_time, menuItem.meal_type);
    const nowIST = moment().utcOffset('+05:30');
    const isFeedbackOpen = nowIST.isSameOrAfter(mealStart.mealStartMoment);

    const formattedMenuItem = {
      id: menuItem.id,
      name: menuItem.name,
      meal_type: menuItem.meal_type,
      menu_date: FoodMenuService.formatDateStr(menuItem.menu_date),
      start_time: menuItem.start_time || null,
      end_time: menuItem.end_time || null,
      branch_id: menuItem.branch_id,
      is_feedback_open: isFeedbackOpen,
    };

    if (user.role === ROLES.RESIDENT) {
      if (menuItem.branch_id !== branchContext.branch_id) {
        throw new AppError('Access denied. You cannot view feedback for another branch menu.', HTTP_STATUS.FORBIDDEN);
      }

      const myFeedback = await db('food_feedback')
        .where({
          resident_id: user.id,
          menu_id: menuItem.id,
        })
        .whereNull('deleted_at')
        .first();

      return {
        menu_item: formattedMenuItem,
        feedback: myFeedback
          ? {
              id: myFeedback.id,
              menu_id: myFeedback.menu_id,
              meal_type: myFeedback.meal_type,
              rating: myFeedback.rating,
              comments: myFeedback.comments,
              image: myFeedback.image,
              image_url: buildFileUrl('food_feedback', myFeedback.image),
              feedback_date: myFeedback.feedback_date,
              created_at: myFeedback.created_at,
              updated_at: myFeedback.updated_at,
            }
          : null,
      };
    }

    // Admin / Super Admin
    const feedbacks = await db('food_feedback')
      .join('users as resident', 'food_feedback.resident_id', 'resident.id')
      .where('food_feedback.menu_id', menuItem.id)
      .whereNull('food_feedback.deleted_at')
      .select(
        'food_feedback.*',
        'resident.name as resident_name',
        'resident.phone as resident_phone'
      )
      .orderBy('food_feedback.id', 'desc');

    const totalCount = feedbacks.length;
    const avgRating =
      totalCount > 0
        ? parseFloat((feedbacks.reduce((acc, f) => acc + Number(f.rating), 0) / totalCount).toFixed(2))
        : 0;

    return {
      menu_item: formattedMenuItem,
      stats: {
        total_feedbacks: totalCount,
        average_rating: avgRating,
      },
      feedbacks: feedbacks.map((f) => ({
        id: f.id,
        resident_id: f.resident_id,
        resident_name: f.resident_name,
        resident_phone: f.resident_phone,
        meal_type: f.meal_type,
        rating: f.rating,
        comments: f.comments,
        image: f.image,
        image_url: buildFileUrl('food_feedback', f.image),
        feedback_date: f.feedback_date,
        created_at: f.created_at,
        updated_at: f.updated_at,
      })),
    };
  };

  /**
   * Get resident's own feedback history
   */
  getMyFeedback = async (user, options = {}) => {
    const { page = 1, limit = 20, date, start_date, end_date, meal_type } = options;
    const current_page = Math.max(1, parseInt(page, 10) || 1);
    const per_page = Math.max(1, parseInt(limit, 10) || 20);
    const offset = (current_page - 1) * per_page;

    const base_query = db('food_feedback')
      .where('food_feedback.resident_id', user.id)
      .whereNull('food_feedback.deleted_at')
      .leftJoin('food_menus', 'food_feedback.menu_id', 'food_menus.id')
      .modify((qb) => {
        if (date) qb.whereRaw('DATE(food_feedback.feedback_date) = ?', [date]);
        if (start_date) qb.where('food_feedback.feedback_date', '>=', `${start_date} 00:00:00`);
        if (end_date) qb.where('food_feedback.feedback_date', '<=', `${end_date} 23:59:59`);
        if (meal_type && meal_type !== 'all') qb.where('food_feedback.meal_type', meal_type.toLowerCase());
      });

    const count_res = await base_query.clone().count('food_feedback.id as total').first();
    const total = count_res ? parseInt(count_res.total, 10) : 0;

    const rows = await base_query
      .clone()
      .select(
        'food_feedback.*',
        'food_menus.name as menu_name'
      )
      .orderBy('food_feedback.feedback_date', 'desc')
      .orderBy('food_feedback.id', 'desc')
      .limit(per_page)
      .offset(offset);

    return {
      feedback: rows.map((r) => ({
        id: r.id,
        menu_id: r.menu_id,
        menu_name: r.menu_name || null,
        meal_type: r.meal_type,
        rating: r.rating,
        comments: r.comments,
        image: r.image || null,
        image_url: buildFileUrl('food_feedback', r.image),
        feedback_date: r.feedback_date,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
      pagination: {
        total,
        page: current_page,
        limit: per_page,
        total_pages: Math.ceil(total / per_page) || 1,
      },
    };
  };

  /**
   * Get branch-wise food feedback for Admin
   * Filters: branch_id, date, start_date, end_date, meal_type, rating, page, limit
   */
  getBranchFeedback = async (options = {}, user) => {
    const {
      branch_id,
      date,
      start_date,
      end_date,
      meal_type,
      rating,
      page = 1,
      limit = 20,
    } = options;

    const branchContext = await this.resolveBranchContext(user, branch_id);
    const current_page = Math.max(1, parseInt(page, 10) || 1);
    const per_page = Math.max(1, parseInt(limit, 10) || 20);
    const offset = (current_page - 1) * per_page;

    const base_query = db('food_feedback')
      .where('food_feedback.branch_id', branchContext.branch_id)
      .whereNull('food_feedback.deleted_at')
      .join('users as resident', 'food_feedback.resident_id', 'resident.id')
      .leftJoin('resident_pg_stays as stay', (join) => {
        join.on('resident.id', '=', 'stay.resident_id')
          .andOn('stay.status', '=', db.raw('?', ['active']))
          .andOnNull('stay.deleted_at');
      })
      .leftJoin('rooms', 'stay.room_id', 'rooms.id')
      .leftJoin('food_menus', 'food_feedback.menu_id', 'food_menus.id')
      .modify((qb) => {
        if (date) qb.whereRaw('DATE(food_feedback.feedback_date) = ?', [date]);
        if (start_date) qb.where('food_feedback.feedback_date', '>=', `${start_date} 00:00:00`);
        if (end_date) qb.where('food_feedback.feedback_date', '<=', `${end_date} 23:59:59`);
        if (meal_type && meal_type !== 'all') qb.where('food_feedback.meal_type', meal_type.toLowerCase());
        if (rating) qb.where('food_feedback.rating', parseInt(rating, 10));
      });

    const count_res = await base_query.clone().count('food_feedback.id as total').first();
    const total = count_res ? parseInt(count_res.total, 10) : 0;

    const rows = await base_query
      .clone()
      .select(
        'food_feedback.*',
        'resident.name as resident_name',
        'resident.phone as resident_phone',
        'rooms.room_no',
        'food_menus.name as menu_name'
      )
      .orderBy('food_feedback.feedback_date', 'desc')
      .orderBy('food_feedback.id', 'desc')
      .limit(per_page)
      .offset(offset);

    return {
      branch_id: branchContext.branch_id,
      branch_name: branchContext.branch_name,
      feedback: rows.map((r) => ({
        id: r.id,
        menu_id: r.menu_id,
        menu_name: r.menu_name || null,
        resident_id: r.resident_id,
        resident_name: r.resident_name,
        resident_phone: r.resident_phone,
        room_no: r.room_no || 'N/A',
        meal_type: r.meal_type,
        rating: r.rating,
        comments: r.comments,
        image: r.image || null,
        image_url: buildFileUrl('food_feedback', r.image),
        feedback_date: r.feedback_date,
        created_at: r.created_at,
      })),
      pagination: {
        total,
        page: current_page,
        limit: per_page,
        total_pages: Math.ceil(total / per_page) || 1,
      },
    };
  };

  /**
   * Get feedback analytics and ratings summary for Admin
   * Includes:
   * - Overall average rating
   * - Total review count
   * - Meal-wise breakdown (Breakfast, Lunch, Dinner average and count)
   * - Star breakdown (5, 4, 3, 2, 1 star counts and percentages)
   */
  getFeedbackSummary = async (options = {}, user) => {
    const { branch_id, date, start_date, end_date } = options;
    const branchContext = await this.resolveBranchContext(user, branch_id);

    const base_query = db('food_feedback')
      .where('food_feedback.branch_id', branchContext.branch_id)
      .whereNull('food_feedback.deleted_at')
      .modify((qb) => {
        if (date) qb.whereRaw('DATE(food_feedback.feedback_date) = ?', [date]);
        if (start_date) qb.where('food_feedback.feedback_date', '>=', `${start_date} 00:00:00`);
        if (end_date) qb.where('food_feedback.feedback_date', '<=', `${end_date} 23:59:59`);
      });

    // Overall stats
    const overall = await base_query.clone()
      .select(
        db.raw('COUNT(id) as total_reviews'),
        db.raw('ROUND(AVG(rating), 2) as average_rating')
      )
      .first();

    const totalReviews = overall && overall.total_reviews ? parseInt(overall.total_reviews, 10) : 0;
    const averageRating = overall && overall.average_rating ? parseFloat(overall.average_rating) : 0;

    // Meal category breakdown
    const mealRows = await base_query.clone()
      .select(
        'meal_type',
        db.raw('COUNT(id) as count'),
        db.raw('ROUND(AVG(rating), 2) as avg_rating')
      )
      .groupBy('meal_type');

    const mealStats = {
      breakfast: { total: 0, average_rating: 0 },
      lunch: { total: 0, average_rating: 0 },
      dinner: { total: 0, average_rating: 0 },
    };

    mealRows.forEach((row) => {
      if (mealStats[row.meal_type]) {
        mealStats[row.meal_type] = {
          total: parseInt(row.count, 10),
          average_rating: parseFloat(row.avg_rating) || 0,
        };
      }
    });

    // Star rating breakdown (1 to 5 stars)
    const starRows = await base_query.clone()
      .select(
        'rating',
        db.raw('COUNT(id) as count')
      )
      .groupBy('rating');

    const starCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    starRows.forEach((row) => {
      if (starCounts[row.rating] !== undefined) {
        starCounts[row.rating] = parseInt(row.count, 10);
      }
    });

    const starBreakdown = {};
    for (let s = 5; s >= 1; s--) {
      const count = starCounts[s] || 0;
      const percentage = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
      starBreakdown[s] = { count, percentage };
    }

    return {
      branch_id: branchContext.branch_id,
      branch_name: branchContext.branch_name,
      total_reviews: totalReviews,
      average_rating: averageRating,
      meals: mealStats,
      stars: starBreakdown,
    };
  };
}

export default new FoodMenuService();
