import subscriptionService from '../services/subscription.service.js';
import { success, successAction, successMessage, AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';

/**
 * Controller for managing Resident Subscription Plans
 */

/**
 * Get Subscription Dashboard KPI Statistics (Screen 1 KPI Cards)
 * Returns total plans, total subscribers, active plans, and inactive plans.
 */
export const getSubscriptionStats = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const owner_id = is_admin ? req.user.id : undefined;
    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);

    const stats = await subscriptionService.getStats({ pg_id, owner_id });
    return success(res, 'Subscription plan statistics retrieved successfully', stats);
  } catch (err) {
    next(err);
  }
};

/**
 * Get paginated list of subscription plans with filters (Screen 1 Table)
 */
export const getAllSubscriptions = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const owner_id = is_admin ? req.user.id : undefined;
    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);

    const {
      plan_type,
      is_active,
      status,
      search,
      page = 1,
      limit = 10,
    } = req.query;

    const { plans, pagination } = await subscriptionService.findAll({
      pg_id,
      owner_id,
      plan_type,
      is_active,
      status,
      search,
      page,
      limit,
    });

    return success(res, 'Subscription plans retrieved successfully', plans, HTTP_STATUS.OK, pagination);
  } catch (err) {
    next(err);
  }
};

/**
 * Get subscription plan details by ID (Screen 3 View)
 */
export const getSubscriptionById = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const owner_id = is_admin ? req.user.id : undefined;
    const pg_id = req.pg_id || undefined;

    const plan = await subscriptionService.findById(req.params.id, { pg_id, owner_id });
    if (!plan) {
      throw new AppError('Subscription plan not found', HTTP_STATUS.NOT_FOUND);
    }

    return success(res, 'Subscription plan retrieved successfully', plan);
  } catch (err) {
    next(err);
  }
};

/**
 * Create a new subscription plan (Screen 2 Form Submission)
 */
export const createSubscription = async (req, res, next) => {
  try {
    let pg_id = req.body.pg_id ? Number(req.body.pg_id) : req.pg_id;

    if (!pg_id) {
      throw new AppError(
        'Property (PG ID) is required. Please provide pg_id or authenticate under an authorized PG account',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const plan = await subscriptionService.create({
      ...req.body,
      pg_id,
    });

    return successAction(res, 'Subscription plan created successfully', plan.id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * Update an existing subscription plan (Screen 3 "Edit Plan")
 */
export const updateSubscription = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const owner_id = is_admin ? req.user.id : undefined;
    const pg_id = req.pg_id || undefined;

    const plan = await subscriptionService.update(req.params.id, req.body, { pg_id, owner_id });
    return success(res, 'Subscription plan updated successfully', plan);
  } catch (err) {
    next(err);
  }
};

/**
 * Toggle or update plan is_active status (Screen 3 "Pause Plan" / "Activate Plan")
 */
export const updateSubscriptionStatus = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const owner_id = is_admin ? req.user.id : undefined;
    const pg_id = req.pg_id || undefined;

    const explicitIsActive = req.body.is_active !== undefined ? req.body.is_active : (req.body.status !== undefined ? (req.body.status === 'active' ? 1 : 0) : null);
    const plan = await subscriptionService.updateStatus(req.params.id, explicitIsActive, { pg_id, owner_id });

    const statusLabel = plan.is_active === 1 ? 'activated' : 'paused';
    return success(res, `Subscription plan ${statusLabel} successfully`, plan);
  } catch (err) {
    next(err);
  }
};

/**
 * Soft-delete a subscription plan (Screen 3 "Delete Plan")
 */
export const deleteSubscription = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const owner_id = is_admin ? req.user.id : undefined;
    const pg_id = req.pg_id || undefined;

    await subscriptionService.remove(req.params.id, { pg_id, owner_id });
    return successMessage(res, 'Subscription plan deleted successfully');
  } catch (err) {
    next(err);
  }
};
