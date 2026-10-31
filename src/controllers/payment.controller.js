import db from '../config/db.js';
import paymentService from '../services/payment.service.js';
import { success, successAction, AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';

/**
 * Controller managing Payments, Overview KPIs, History & Receipts, and Resident Checkout
 */

/**
 * Get unified KPI statistics for payments (Revenue, Transactions, Collections, Pending, Overdue, Refunds)
 * Serves both Payment Overview and Payment History screens.
 */
export const getPaymentStats = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const owner_id = is_admin ? req.user.id : undefined;
    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);
    const { start_date, end_date } = req.query;

    const stats = await paymentService.getPaymentStats({
      owner_id,
      pg_id,
      start_date,
      end_date,
    });
    return success(res, 'Payment statistics retrieved successfully', stats);
  } catch (err) {
    next(err);
  }
};

// Aliases for full backward compatibility
export const getOverviewStats = getPaymentStats;

/**
 * List all payments with filtering by branch, room type, status, date range, search, and pagination.
 * Supports UI Tabs: 'all', 'pending', 'overdue', 'refunds'.
 */
export const getAllPayments = async (req, res, next) => {
  try {
    const is_admin = req.user.role === ROLES.ADMIN;
    const is_resident = req.user.role === ROLES.RESIDENT;

    const owner_id = is_admin ? req.user.id : undefined;
    const resident_id = is_resident ? req.user.id : (req.query.resident_id ? Number(req.query.resident_id) : undefined);
    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);

    const {
      status,
      tab,
      payment_type,
      payment_method,
      room_type,
      start_date,
      end_date,
      date_by,
      search,
      page = 1,
      limit = 10,
    } = req.query;

    let resolved_status = status || tab || 'all';
    if (resolved_status === 'refunds') resolved_status = 'refunded';

    const { payments, pagination } = await paymentService.findAll({
      owner_id,
      resident_id,
      pg_id,
      status: resolved_status,
      payment_type,
      payment_method,
      room_type,
      start_date,
      end_date,
      date_by,
      search,
      page,
      limit,
    });

    return success(res, 'Payments fetched successfully', payments, HTTP_STATUS.OK, pagination);
  } catch (err) {
    next(err);
  }
};

/**
 * Get Resident Mobile Payment Overview
 * Returns outstanding dues card, billing breakdown, refundable security deposit, and recent transactions.
 */
export const getResidentOverview = async (req, res, next) => {
  try {
    const resident_id = req.user.role === ROLES.RESIDENT ? req.user.id : (req.query.resident_id || req.user.id);
    const overview = await paymentService.getResidentOverview(resident_id);
    return success(res, 'Resident payment overview retrieved successfully', overview);
  } catch (err) {
    next(err);
  }
};

/**
 * Get payment details by ID
 */
export const getPaymentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payment = await paymentService.findById(id);

    if (!payment) {
      throw new AppError('Payment record not found', HTTP_STATUS.NOT_FOUND);
    }

    // Role check: Resident can only view their own payment; Admin must own the PG
    if (req.user.role === ROLES.RESIDENT && payment.resident.id !== req.user.id) {
      throw new AppError('Access denied to this payment record', HTTP_STATUS.FORBIDDEN);
    }

    return success(res, 'Payment details retrieved successfully', payment);
  } catch (err) {
    next(err);
  }
};

/**
 * Initiate UPI QR checkout for a pending bill
 * Returns dynamic UPI intent string and standard Base64 QR Code image
 */
export const initiateUpi = async (req, res, next) => {
  try {
    const { id } = req.params;
    const resident_id = req.user.role === ROLES.RESIDENT ? req.user.id : (req.query.resident_id || null);

    const checkoutData = await paymentService.generateQrCheckout(id, resident_id);
    return success(res, 'UPI QR checkout initiated successfully', checkoutData);
  } catch (err) {
    next(err);
  }
};

/**
 * Complete / record a payment
 */
export const processPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await paymentService.processPayment(id, req.body);
    return success(res, 'Payment processed successfully', updated);
  } catch (err) {
    next(err);
  }
};


/**
 * Create a new bill / payment demand (Admin)
 */
export const createPayment = async (req, res, next) => {
  try {
    let pg_id = req.body.pg_id ? Number(req.body.pg_id) : req.pg_id;

    if (!pg_id && req.body.resident_id) {
      const activeStay = await db('resident_pg_stays')
        .where({ resident_id: Number(req.body.resident_id), status: 'active' })
        .whereNull('deleted_at')
        .orderBy('id', 'desc')
        .first();
      if (activeStay) {
        pg_id = activeStay.pg_id;
      }
    }

    if (!pg_id) {
      throw new AppError('PG facility ID is required. Please specify a PG or assign the resident to an active stay', HTTP_STATUS.BAD_REQUEST);
    }

    const payment = await paymentService.create({
      ...req.body,
      pg_id,
    });
    return successAction(res, 'Payment demand created successfully', payment.id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * Export payments list as Excel (.xlsx) or PDF (.pdf)
 * Supports all filters: tab, status, pg_id, room_type, payment_method, payment_type, start_date, end_date, date_by, search
 */
export const exportPayments = async (req, res, next) => {
  try {
    const format = (req.query.format || 'xlsx').toLowerCase();
    const is_admin = req.user.role === ROLES.ADMIN;
    const is_resident = req.user.role === ROLES.RESIDENT;

    const owner_id = is_admin ? req.user.id : undefined;
    const resident_id = is_resident ? req.user.id : (req.query.resident_id ? Number(req.query.resident_id) : undefined);
    const pg_id = req.query.pg_id ? Number(req.query.pg_id) : (req.pg_id || undefined);

    const {
      status,
      tab,
      payment_type,
      payment_method,
      room_type,
      start_date,
      end_date,
      date_by,
      search,
    } = req.query;

    let resolved_status = status || tab || 'all';
    if (resolved_status === 'refunds') resolved_status = 'refunded';

    const options = {
      owner_id,
      resident_id,
      pg_id,
      status: resolved_status,
      payment_type,
      payment_method,
      room_type,
      start_date,
      end_date,
      date_by,
      search,
    };

    let result;
    if (format === 'pdf') {
      result = await paymentService.exportPdf(options);
    } else if (format === 'both' || format === 'all') {
      const [excelResult, pdfResult] = await Promise.all([
        paymentService.exportExcel(options),
        paymentService.exportPdf(options),
      ]);
      result = {
        excel_url: excelResult.file_url,
        pdf_url: pdfResult.file_url,
        excel_filename: excelResult.filename,
        pdf_filename: pdfResult.filename,
        total_records: excelResult.total_records,
        total_amount: excelResult.total_amount,
        total_paid: excelResult.total_paid,
        total_due: excelResult.total_due,
      };
    } else {
      result = await paymentService.exportExcel(options);
    }

    const message = format === 'pdf'
      ? 'Payment PDF report generated successfully'
      : (format === 'both' || format === 'all'
        ? 'Payment PDF and Excel reports generated successfully'
        : 'Payment Excel report generated successfully');

    return success(res, message, result);
  } catch (err) {
    next(err);
  }
};

/**
 * Update payment demand / bill details (Admin)
 */
export const updatePayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payment = await paymentService.update(Number(id), req.body);
    return success(res, 'Payment demand updated successfully', payment);
  } catch (err) {
    next(err);
  }
};

/**
 * Delete payment demand / invoice (Soft delete - Admin)
 */
export const deletePayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    await paymentService.delete(Number(id));
    return success(res, 'Payment demand deleted successfully');
  } catch (err) {
    next(err);
  }
};

export default {
  getPaymentStats,
  getOverviewStats,
  getAllPayments,
  getResidentOverview,
  getPaymentById,
  initiateUpi,
  processPayment,
  createPayment,
  updatePayment,
  deletePayment,
  exportPayments,
};

