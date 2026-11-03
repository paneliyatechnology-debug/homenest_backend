import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';

class SubscriptionService {
  /**
   * Helper: Parse features JSON string or array safely
   */
  static parseFeatures = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return val.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    return [];
  };

  /**
   * Helper: Format subscription plan row for API responses
   */
  static formatPlan = (plan) => {
    if (!plan) return null;
    const isActive = plan.is_active === 1 || plan.is_active === true || plan.is_active === '1';

    return {
      id: plan.id,
      pg_id: plan.pg_id,
      pg_name: plan.pg_name || null,
      name: plan.name,
      plan_type: plan.plan_type,
      price: parseFloat(plan.price) || 0,
      duration: plan.duration,
      description: plan.description || null,
      features: SubscriptionService.parseFeatures(plan.features),
      is_active: isActive ? 1 : 0,
      status: isActive ? 'active' : 'inactive', // Backwards-compatible badge display
      subscribers_count: Number(plan.subscribers_count) || 0,
      created_at: plan.created_at,
      updated_at: plan.updated_at,
    };
  };

  /**
   * Get KPI statistics for subscription plans
   * Corresponds to the 4 dashboard summary cards in Screen 1:
   * Total Plans, Total Subscribers, Active Plans, Inactive Plans
   *
   * @param {Object} options - Scoping options (pg_id, owner_id)
   * @returns {Promise<{total_plans: number, total_subscribers: number, active_plans: number, inactive_plans: number}>}
   */
  getStats = async (options = {}) => {
    const { pg_id, owner_id } = options;

    const query = db('subscription_plans')
      .whereNull('subscription_plans.deleted_at')
      .join('pgs', (join) => {
        join.on('subscription_plans.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .modify((qb) => {
        if (pg_id) qb.where('subscription_plans.pg_id', pg_id);
        if (owner_id) qb.where('pgs.owner_id', owner_id);
      });

    const [stats] = await query.select(
      db.raw('COUNT(subscription_plans.id) as total_plans'),
      db.raw('COALESCE(SUM(subscription_plans.subscribers_count), 0) as total_subscribers'),
      db.raw('COALESCE(SUM(CASE WHEN subscription_plans.is_active = 1 THEN 1 ELSE 0 END), 0) as active_plans'),
      db.raw('COALESCE(SUM(CASE WHEN subscription_plans.is_active = 0 THEN 1 ELSE 0 END), 0) as inactive_plans')
    );

    return {
      total_plans: parseInt(stats?.total_plans, 10) || 0,
      total_subscribers: parseInt(stats?.total_subscribers, 10) || 0,
      active_plans: parseInt(stats?.active_plans, 10) || 0,
      inactive_plans: parseInt(stats?.inactive_plans, 10) || 0,
    };
  };

  /**
   * List subscription plans with filtering, search, and pagination
   *
   * @param {Object} options - Query filters and pagination
   * @returns {Promise<{plans: Array<Object>, pagination: Object}>}
   */
  findAll = async (options = {}) => {
    const {
      pg_id,
      owner_id,
      plan_type,
      is_active,
      status,
      search,
      page = 1,
      limit = 10,
    } = options;

    const current_page = Math.max(1, parseInt(page, 10) || 1);
    const per_page = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (current_page - 1) * per_page;

    const base_query = db('subscription_plans')
      .whereNull('subscription_plans.deleted_at')
      .join('pgs', (join) => {
        join.on('subscription_plans.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .modify((qb) => {
        if (pg_id) qb.where('subscription_plans.pg_id', pg_id);
        if (owner_id) qb.where('pgs.owner_id', owner_id);

        if (plan_type && plan_type !== 'all') {
          qb.where('subscription_plans.plan_type', plan_type.toLowerCase());
        }

        // Filter by is_active (supports 1/0 or legacy status='active'/'inactive')
        if (is_active !== undefined) {
          qb.where('subscription_plans.is_active', Number(is_active) === 1 ? 1 : 0);
        } else if (status && status !== 'all') {
          if (status === 'active') qb.where('subscription_plans.is_active', 1);
          if (status === 'inactive') qb.where('subscription_plans.is_active', 0);
        }

        if (search && search.trim()) {
          const term = `%${search.trim()}%`;
          qb.where((sqb) => {
            sqb.where('subscription_plans.name', 'like', term)
              .orWhere('subscription_plans.description', 'like', term);
          });
        }
      });

    // Calculate total matching records for pagination
    const count_res = await base_query.clone().count('subscription_plans.id as total').first();
    const total = count_res ? parseInt(count_res.total, 10) : 0;

    // Retrieve paginated records
    const raw_plans = await base_query
      .clone()
      .select(
        'subscription_plans.*',
        'pgs.name as pg_name'
      )
      .orderBy('subscription_plans.id', 'desc')
      .limit(per_page)
      .offset(offset);

    const total_pages = Math.ceil(total / per_page) || 1;

    return {
      plans: raw_plans.map(SubscriptionService.formatPlan),
      pagination: {
        total,
        page: current_page,
        limit: per_page,
        total_pages,
        has_next: current_page < total_pages,
        has_prev: current_page > 1,
      },
    };
  };

  /**
   * Find single subscription plan by ID
   *
   * @param {number|string} id - Plan ID
   * @param {Object} [scoping={}] - Optional pg_id/owner_id verification
   * @returns {Promise<Object|null>}
   */
  findById = async (id, scoping = {}) => {
    const query = db('subscription_plans')
      .where('subscription_plans.id', id)
      .whereNull('subscription_plans.deleted_at')
      .join('pgs', (join) => {
        join.on('subscription_plans.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .select(
        'subscription_plans.*',
        'pgs.name as pg_name',
        'pgs.owner_id'
      );

    if (scoping.pg_id) {
      query.where('subscription_plans.pg_id', scoping.pg_id);
    }
    if (scoping.owner_id) {
      query.where('pgs.owner_id', scoping.owner_id);
    }

    const plan = await query.first();
    return SubscriptionService.formatPlan(plan);
  };

  /**
   * Create a new subscription plan
   *
   * @param {Object} data - Plan data payload
   * @returns {Promise<Object>} Created plan
   */
  create = async (data) => {
    const {
      pg_id,
      name,
      plan_type,
      price,
      duration,
      description,
      features,
      is_active = 1,
      subscribers_count = 0,
    } = data;

    // Verify parent PG exists and is active
    const pg = await db('pgs').where({ id: pg_id }).whereNull('deleted_at').first();
    if (!pg) {
      throw new AppError('PG facility not found', HTTP_STATUS.NOT_FOUND);
    }

    const cleanName = String(name).trim();

    // Enforce unique plan name within the same PG property
    const existing = await db('subscription_plans')
      .where({ pg_id, name: cleanName })
      .whereNull('deleted_at')
      .first();

    if (existing) {
      throw new AppError(
        `A subscription plan named '${cleanName}' already exists in this facility`,
        HTTP_STATUS.CONFLICT
      );
    }

    const normalizedFeatures = SubscriptionService.parseFeatures(features);
    const activeValue = is_active === 1 || is_active === '1' || is_active === true ? 1 : 0;

    const [id] = await db('subscription_plans').insert({
      pg_id: Number(pg_id),
      name: cleanName,
      plan_type: String(plan_type).toLowerCase(),
      price: parseFloat(price),
      duration: String(duration).trim(),
      description: description ? String(description).trim() : null,
      features: JSON.stringify(normalizedFeatures),
      is_active: activeValue,
      subscribers_count: Number(subscribers_count) || 0,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    return this.findById(id);
  };

  /**
   * Update subscription plan details
   *
   * @param {number|string} id - Plan ID
   * @param {Object} data - Update fields
   * @param {Object} [scoping={}] - Scoping guard
   * @returns {Promise<Object>} Updated plan
   */
  update = async (id, data, scoping = {}) => {
    const plan = await this.findById(id, scoping);
    if (!plan) {
      throw new AppError('Subscription plan not found', HTTP_STATUS.NOT_FOUND);
    }

    const updatePayload = {
      updated_at: db.fn.now(),
    };

    if (data.name !== undefined) {
      const cleanName = String(data.name).trim();
      if (cleanName.toLowerCase() !== plan.name.toLowerCase()) {
        const duplicate = await db('subscription_plans')
          .where({ pg_id: plan.pg_id, name: cleanName })
          .whereNull('deleted_at')
          .whereNot({ id })
          .first();

        if (duplicate) {
          throw new AppError(
            `A subscription plan named '${cleanName}' already exists`,
            HTTP_STATUS.CONFLICT
          );
        }
      }
      updatePayload.name = cleanName;
    }

    if (data.plan_type !== undefined) {
      updatePayload.plan_type = String(data.plan_type).toLowerCase();
    }
    if (data.price !== undefined) {
      updatePayload.price = parseFloat(data.price);
    }
    if (data.duration !== undefined) {
      updatePayload.duration = String(data.duration).trim();
    }
    if (data.description !== undefined) {
      updatePayload.description = data.description ? String(data.description).trim() : null;
    }
    if (data.features !== undefined) {
      const parsed = SubscriptionService.parseFeatures(data.features);
      updatePayload.features = JSON.stringify(parsed);
    }
    if (data.is_active !== undefined) {
      updatePayload.is_active = data.is_active === 1 || data.is_active === '1' || data.is_active === true ? 1 : 0;
    }

    await db('subscription_plans').where({ id }).update(updatePayload);
    return this.findById(id);
  };

  /**
   * Toggle or update plan is_active status (Pause Plan / Activate Plan)
   *
   * @param {number|string} id - Plan ID
   * @param {number|boolean|null} [explicitIsActive] - Optional target (1 / 0)
   * @param {Object} [scoping={}] - Tenancy guard
   * @returns {Promise<Object>}
   */
  updateStatus = async (id, explicitIsActive = null, scoping = {}) => {
    const plan = await this.findById(id, scoping);
    if (!plan) {
      throw new AppError('Subscription plan not found', HTTP_STATUS.NOT_FOUND);
    }

    let targetIsActive;
    if (explicitIsActive !== null && explicitIsActive !== undefined) {
      targetIsActive = explicitIsActive === 1 || explicitIsActive === '1' || explicitIsActive === true ? 1 : 0;
    } else {
      // Toggle current is_active
      targetIsActive = plan.is_active === 1 ? 0 : 1;
    }

    await db('subscription_plans').where({ id }).update({
      is_active: targetIsActive,
      updated_at: db.fn.now(),
    });

    return this.findById(id);
  };

  /**
   * Soft-delete subscription plan
   *
   * @param {number|string} id - Plan ID
   * @param {Object} [scoping={}] - Tenancy guard
   * @returns {Promise<boolean>}
   */
  remove = async (id, scoping = {}) => {
    const plan = await this.findById(id, scoping);
    if (!plan) {
      throw new AppError('Subscription plan not found', HTTP_STATUS.NOT_FOUND);
    }

    await db('subscription_plans').where({ id }).update({
      deleted_at: db.fn.now(),
      is_active: 0,
      updated_at: db.fn.now(),
    });

    return true;
  };
}

export default new SubscriptionService();
