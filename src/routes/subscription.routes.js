import { Router } from 'express';
import * as subscriptionController from '../controllers/subscription.controller.js';
import {
  createSubscriptionValidator,
  updateSubscriptionValidator,
  updateStatusValidator,
  querySubscriptionsValidator,
} from '../validators/subscription.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import ROLES from '../constants/roles.js';

const router = Router();

// All subscription routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/subscriptions/stats
 * @desc    Get subscription dashboard KPI statistics
 * @access  Private (Admin / Super Admin / Branch Manager)
 */
router.get(
  '/stats',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  subscriptionController.getSubscriptionStats
);

/**
 * @route   GET /api/v1/subscriptions
 * @desc    List subscription plans with filtering and pagination
 * @access  Private
 */
router.get(
  '/',
  validate(querySubscriptionsValidator),
  subscriptionController.getAllSubscriptions
);

/**
 * @route   POST /api/v1/subscriptions
 * @desc    Create a new subscription plan
 * @access  Private (Admin / Super Admin / Branch Manager)
 */
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  validate(createSubscriptionValidator),
  subscriptionController.createSubscription
);

/**
 * @route   GET /api/v1/subscriptions/:id
 * @desc    Get subscription plan details by ID
 * @access  Private
 */
router.get(
  '/:id',
  subscriptionController.getSubscriptionById
);

/**
 * @route   PUT /api/v1/subscriptions/:id
 * @desc    Update an existing subscription plan
 * @access  Private (Admin / Super Admin / Branch Manager)
 */
router.put(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  validate(updateSubscriptionValidator),
  subscriptionController.updateSubscription
);

/**
 * @route   PATCH /api/v1/subscriptions/:id/status
 * @desc    Quick toggle or update plan is_active status (Pause Plan / Activate Plan)
 * @access  Private (Admin / Super Admin / Branch Manager)
 */
router.patch(
  '/:id/status',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  validate(updateStatusValidator),
  subscriptionController.updateSubscriptionStatus
);

/**
 * @route   DELETE /api/v1/subscriptions/:id
 * @desc    Soft-delete a subscription plan
 * @access  Private (Admin / Super Admin / Branch Manager)
 */
router.delete(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  subscriptionController.deleteSubscription
);

export default router;
