import { Router } from 'express';
import paymentController from '../controllers/payment.controller.js';
import {
  createPaymentValidator,
  updatePaymentValidator,
  processPaymentValidator,
  paymentIdParamValidator,
  listPaymentsValidator,
  exportPaymentsValidator,
  paymentStatsValidator,
  residentOverviewValidator,
} from '../validators/payment.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import ROLES from '../constants/roles.js';

const router = Router();

// All payment routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/payments/stats
 * @desc    Get unified KPI statistics for payments (Revenue, Transactions, Collections, Pending, Overdue, Refunds)
 * @access  Private (Admin / Super Admin)
 */
router.get(
  '/stats',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(paymentStatsValidator),
  paymentController.getPaymentStats
);

/**
 * @route   GET /api/v1/payments/resident/overview
 * @desc    Get Resident Mobile Payment Overview (Outstanding amount, breakdown, security deposit, recent transactions)
 * @access  Private (Resident / Admin)
 */
router.get(
  '/resident/overview',
  validate(residentOverviewValidator),
  paymentController.getResidentOverview
);

/**
 * @route   POST /api/v1/payments
 * @desc    Create a new invoice / billing demand
 * @access  Private (Admin / Super Admin)
 */
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(createPaymentValidator),
  paymentController.createPayment
);

/**
 * @route   GET /api/v1/payments
 * @desc    List payments with status filtering (all, pending, overdue, paid, refunded), room type, method, date range, pagination
 * @access  Private
 */
router.get('/', validate(listPaymentsValidator), paymentController.getAllPayments);

/**
 * @route   GET /api/v1/payments/export
 * @desc    Export payments report as Excel (.xlsx) or PDF (.pdf) with all table filters
 * @access  Private
 */
router.get('/export', validate(exportPaymentsValidator), paymentController.exportPayments);

/**
 * @route   PUT /api/v1/payments/:id
 * @desc    Update billing demand / invoice details
 * @access  Private (Admin / Super Admin)
 */
router.put(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(updatePaymentValidator),
  paymentController.updatePayment
);

/**
 * @route   DELETE /api/v1/payments/:id
 * @desc    Soft delete payment demand / invoice
 * @access  Private (Admin / Super Admin)
 */
router.delete(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(paymentIdParamValidator),
  paymentController.deletePayment
);

/**
 * @route   GET /api/v1/payments/:id
 * @desc    Get payment invoice details by primary ID
 * @access  Private
 */
router.get(
  '/:id',
  validate(paymentIdParamValidator),
  paymentController.getPaymentById
);

/**
 * @route   POST /api/v1/payments/:id/initiate-upi
 * @desc    Initiate UPI QR checkout for payment bill
 * @access  Private
 */
router.post(
  '/:id/initiate-upi',
  validate(paymentIdParamValidator),
  paymentController.initiateUpi
);

/**
 * @route   POST /api/v1/payments/:id/pay
 * @desc    Complete and record payment
 * @access  Private
 */
router.post(
  '/:id/pay',
  validate(processPaymentValidator),
  paymentController.processPayment
);

export default router;
