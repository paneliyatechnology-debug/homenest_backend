import fs from 'fs';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import path from 'path';
import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import { buildFileUrl } from '../utils/url.js';
import QRCode from 'qrcode';

/**
 * Service managing Payments, Invoices, Billing Breakdowns, QR/UPI Checkout, and Receipts.
 */
class PaymentService {
  /**
   * Safe fields to select for payment queries
   */
  static selectFields = [
    'payments.id',
    'payments.transaction_id',
    'payments.receipt_no',
    'payments.resident_id',
    'resident.name as resident_name',
    'resident.email as resident_email',
    'resident.phone as resident_phone',
    'resident.profile_photo as resident_photo',
    'payments.pg_id',
    'pgs.name as branch_name',
    'pgs.name as pg_name',
    'pgs.owner_id',
    'payments.stay_id',
    'stay.bed_number as bed_number',
    'payments.room_id',
    'rooms.room_no',
    'rooms.room_type',
    'rooms.building_id',
    'buildings.name as building_name',
    'floors.name as floor_name',
    'floors.floor_number',
    'payments.title',
    'payments.payment_type',
    'payments.billing_period_start',
    'payments.billing_period_end',
    'payments.due_date',
    'payments.rent_amount',
    'payments.deposit_amount',
    'payments.maintenance_amount',
    'payments.electricity_amount',
    'payments.other_amount',
    'payments.amount',
    'payments.paid_amount',
    'payments.payment_method',
    'payments.payment_method_details',
    'payments.upi_id',
    'payments.upi_ref_no',
    'payments.status',
    'payments.paid_at',
    'payments.refund_amount',
    'payments.refund_reason',
    'payments.refunded_at',
    'payments.notes',
    'payments.created_at',
    'payments.updated_at',
    'payments.deleted_at',
  ];

  /**
   * Helper to format a single payment record cleanly
   */
  static formatIST = (date, withTime = true) => {
    if (!date) return '-';
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);

    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: withTime ? '2-digit' : undefined,
      minute: withTime ? '2-digit' : undefined,
      hour12: false,
    });

    const parts = formatter.formatToParts(d);
    const map = {};
    parts.forEach((p) => { map[p.type] = p.value; });

    if (withTime && map.hour && map.minute) {
      return `${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute}`;
    }
    return `${map.day}/${map.month}/${map.year}`;
  };

  static formatReportDate = (date) => PaymentService.formatIST(date, true);

  static formatPayment = (item) => {
    if (!item) return null;

    const amount = Number(item.amount) || 0;
    const rent_amount = Number(item.rent_amount) || 0;
    const deposit_amount = Number(item.deposit_amount) || 0;
    const maintenance_amount = Number(item.maintenance_amount) || 0;
    const electricity_amount = Number(item.electricity_amount) || 0;
    const other_amount = Number(item.other_amount) || 0;
    const paid_amount = Number(item.paid_amount) || 0;
    const refund_amount = Number(item.refund_amount) || 0;

    return {
      id: item.id,
      transaction_id: item.transaction_id || null,
      receipt_no: item.receipt_no || null,
      title: item.title || 'Monthly Rent',
      payment_type: item.payment_type || 'rent',
      status: item.status || 'pending',
      amount,
      paid_amount,
      due_date: item.due_date || null,
      paid_at: item.paid_at || null,
      payment_method: item.payment_method || null,
      payment_method_details: item.payment_method_details || null,

      // Resident Information
      resident: {
        id: item.resident_id,
        name: item.resident_name || null,
        email: item.resident_email || null,
        phone: item.resident_phone || null,
        profile_photo_url: buildFileUrl('users', item.resident_photo),
      },

      // Branch & Room Allocation
      stay_id: item.stay_id ? Number(item.stay_id) : null,
      bed_number: item.bed_number || null,
      room_id: item.room_id ? Number(item.room_id) : null,
      branch_name: item.branch_name || null,
      pg_name: item.pg_name || null,
      pg_id: item.pg_id,
      room_no: item.room_no || null,
      room_type: item.room_type || null,
      building_name: item.building_name || null,
      floor_name: item.floor_name || null,
      floor_number: item.floor_number !== undefined && item.floor_number !== null ? Number(item.floor_number) : null,

      // Billing Breakdown
      billing_period: {
        start: item.billing_period_start || null,
        end: item.billing_period_end || null,
      },
      breakdown: {
        rent: rent_amount,
        deposit: deposit_amount,
        security_deposit: deposit_amount,
        maintenance: maintenance_amount,
        electricity: electricity_amount,
        other: other_amount,
        total: amount,
      },

      // UPI & Transaction references
      upi_id: item.upi_id || null,
      upi_ref_no: item.upi_ref_no || null,

      // Refund information (if applicable)
      refund: item.status === 'refunded' || refund_amount > 0 ? {
        amount: refund_amount,
        reason: item.refund_reason || null,
        refunded_at: item.refunded_at || null,
      } : null,

      notes: item.notes || null,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  };

  /**
   * Find payment record by ID
   * @param {number|string} id - Payment ID
   * @returns {Promise<object|null>}
   */
  findById = async (id) => {
    const raw = await db('payments')
      .where('payments.id', id)
      .whereNull('payments.deleted_at')
      .join('users as resident', (join) => {
        join.on('payments.resident_id', '=', 'resident.id').andOnNull('resident.deleted_at');
      })
      .join('pgs', (join) => {
        join.on('payments.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .leftJoin('resident_pg_stays as stay', (join) => {
        join.on('payments.stay_id', '=', 'stay.id').andOnNull('stay.deleted_at');
      })
      .leftJoin('rooms', (join) => {
        join.on('payments.room_id', '=', 'rooms.id').andOnNull('rooms.deleted_at');
      })
      .leftJoin('buildings', (join) => {
        join.on('rooms.building_id', '=', 'buildings.id').andOnNull('buildings.deleted_at');
      })
      .leftJoin('floors', (join) => {
        join.on('rooms.floor_id', '=', 'floors.id').andOnNull('floors.deleted_at');
      })
      .select(PaymentService.selectFields)
      .first();

    return PaymentService.formatPayment(raw);
  };

  /**
   * Helper to apply date filtering:
   * date_by = 'created_at' | 'due_date' | 'paid_at' | '' (default: paid_at or due_date)
   */
  static applyDateFilter = (qb, start_date, end_date, date_by = '') => {
    const col = date_by === 'created_at' ? 'payments.created_at'
      : date_by === 'due_date' ? 'payments.due_date'
        : date_by === 'paid_at' ? 'payments.paid_at'
          : null;

    if (col) {
      if (start_date) qb.where(col, '>=', start_date);
      if (end_date) qb.where(col, '<=', end_date);
    } else {
      if (start_date) {
        qb.where((date_qb) => {
          date_qb
            .where('payments.paid_at', '>=', start_date)
            .orWhere((d2) => d2.whereNull('payments.paid_at').andWhere('payments.due_date', '>=', start_date));
        });
      }
      if (end_date) {
        qb.where((date_qb) => {
          date_qb
            .where('payments.paid_at', '<=', end_date)
            .orWhere((d2) => d2.whereNull('payments.paid_at').andWhere('payments.due_date', '<=', end_date));
        });
      }
    }
  };

  /**
   * Reusable Knex query builder for filtering payments across list and exports
   */
  buildFilterQuery = (options = {}) => {
    const {
      owner_id = null,
      resident_id = null,
      pg_id = null,
      status = '',
      payment_type = '',
      payment_method = '',
      room_type = '',
      start_date = '',
      end_date = '',
      date_by = '',
      search = '',
    } = options;

    return db('payments')
      .whereNull('payments.deleted_at')
      .join('users as resident', (join) => {
        join.on('payments.resident_id', '=', 'resident.id').andOnNull('resident.deleted_at');
      })
      .join('pgs', (join) => {
        join.on('payments.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .leftJoin('resident_pg_stays as stay', (join) => {
        join.on('payments.stay_id', '=', 'stay.id').andOnNull('stay.deleted_at');
      })
      .leftJoin('rooms', (join) => {
        join.on('payments.room_id', '=', 'rooms.id').andOnNull('rooms.deleted_at');
      })
      .leftJoin('buildings', (join) => {
        join.on('rooms.building_id', '=', 'buildings.id').andOnNull('buildings.deleted_at');
      })
      .leftJoin('floors', (join) => {
        join.on('rooms.floor_id', '=', 'floors.id').andOnNull('floors.deleted_at');
      })
      .modify((qb) => {
        if (owner_id) {
          qb.where('pgs.owner_id', owner_id);
        }
        if (resident_id) {
          qb.where('payments.resident_id', resident_id);
        }
        if (pg_id) {
          qb.where('payments.pg_id', pg_id);
        }
        if (status && status !== 'all') {
          if (status === 'completed') {
            qb.where('payments.status', 'paid');
          } else if (status === 'refunds') {
            qb.where('payments.status', 'refunded');
          } else {
            qb.where('payments.status', status);
          }
        }
        if (payment_type) {
          qb.where('payments.payment_type', payment_type);
        }
        if (payment_method) {
          qb.where('payments.payment_method', payment_method);
        }
        if (room_type) {
          qb.where('rooms.room_type', room_type);
        }
        if (start_date || end_date) {
          PaymentService.applyDateFilter(qb, start_date, end_date, date_by);
        }
        if (search) {
          const pattern = `%${search}%`;
          qb.where((search_qb) => {
            search_qb
              .where('payments.transaction_id', 'like', pattern)
              .orWhere('payments.receipt_no', 'like', pattern)
              .orWhere('resident.name', 'like', pattern)
              .orWhere('resident.phone', 'like', pattern)
              .orWhere('rooms.room_no', 'like', pattern);
          });
        }
      });
  };

  /**
   * Find all payment records with filters (tab status, room type, branch, date range, search) and pagination
   * @param {object} options
   * @returns {Promise<{ payments: Array, pagination: object }>}
   */
  findAll = async (options = {}) => {
    const { page = 1, limit = 10 } = options;

    const current_page = Math.max(1, parseInt(page, 10) || 1);
    const per_page = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (current_page - 1) * per_page;

    const base_query = this.buildFilterQuery(options);

    // Count total records
    const count_result = await base_query.clone().count('payments.id as total').first();
    const total = count_result ? parseInt(count_result.total, 10) : 0;

    // Fetch paginated rows
    const raw_rows = await base_query
      .clone()
      .select(PaymentService.selectFields)
      .orderBy('payments.id', 'desc')
      .limit(per_page)
      .offset(offset);

    const payments = raw_rows.map(PaymentService.formatPayment);

    return {
      payments,
      pagination: {
        total,
        page: current_page,
        limit: per_page,
        total_pages: Math.ceil(total / per_page) || 1,
      },
    };
  };

  /**
   * Export payment records as formatted Excel (.xlsx) file
   * Features executive KPI cards, freeze panes, auto-filter, currency formatting, and formula totals.
   * @param {object} options Filter options
   * @returns {Promise<object>} Export metadata with public file_url
   */
  exportExcel = async (options = {}) => {
    const base_query = this.buildFilterQuery(options);
    const raw_rows = await base_query
      .clone()
      .select(PaymentService.selectFields)
      .orderBy('payments.id', 'desc');

    const payments = raw_rows.map(PaymentService.formatPayment);

    const totalRecords = payments.length;
    const totalAmount = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const totalPaid = payments.reduce((acc, p) => acc + (p.paid_amount || 0), 0);
    const totalDue = Math.max(0, totalAmount - totalPaid);
    const collectionRate = totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0;

    const branchName = options.pg_name || payments[0]?.branch_name || payments[0]?.pg_name || 'HouseNest PG Facility';
    const residentFilterName = options.resident_id && payments[0]?.resident?.name ? payments[0].resident.name : null;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HomeNest PG Management';
    workbook.lastModifiedBy = 'HomeNest System';
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet('Payments Ledger', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 8, showGridLines: true }],
      properties: { defaultRowHeight: 20 },
    });

    // Padded professional column widths
    worksheet.columns = [
      { key: 'sr', width: 7 },
      { key: 'receipt_no', width: 20 },
      { key: 'txn_id', width: 26 },
      { key: 'resident_name', width: 24 },
      { key: 'resident_phone', width: 16 },
      { key: 'building', width: 18 },
      { key: 'floor', width: 15 },
      { key: 'room_no', width: 14 },
      { key: 'bed_no', width: 14 },
      { key: 'room_type', width: 16 },
      { key: 'payment_type', width: 16 },
      { key: 'status', width: 16 },
      { key: 'payment_method', width: 18 },
      { key: 'due_date', width: 20 },
      { key: 'paid_at', width: 20 },
      { key: 'amount', width: 20 },
      { key: 'paid_amount', width: 20 },
    ];

    // --- 1. Document Title ---
    worksheet.mergeCells('A1:Q1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = branchName.toUpperCase();
    titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FF0F172A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    worksheet.getRow(1).height = 30;

    // --- 2. Subtitle ---
    worksheet.mergeCells('A2:Q2');
    const subTitleCell = worksheet.getCell('A2');
    const subTitle = residentFilterName
      ? `Official Payments & Billing Ledger Statement • Resident: ${residentFilterName} (ID: ${options.resident_id})`
      : 'Official Payments & Billing Ledger Statement • HomeNest PG Management System';
    subTitleCell.value = subTitle;
    subTitleCell.font = { name: 'Segoe UI', size: 10, bold: false, color: { argb: 'FF64748B' } };
    subTitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    worksheet.getRow(2).height = 20;

    // Row 3: Spacer
    worksheet.getRow(3).height = 8;

    // --- 3. Executive KPI Dashboard Cards (Rows 4 & 5) ---
    // Helper to style a card box
    const styleCard = (startCell, endCell, label, value, valColor = 'FF0F172A', bgColor = 'FFF8FAFC', borderColor = 'FFE2E8F0') => {
      worksheet.mergeCells(`${startCell.col}4:${endCell.col}4`);
      worksheet.mergeCells(`${startCell.col}5:${endCell.col}5`);

      const lCell = worksheet.getCell(`${startCell.col}4`);
      lCell.value = label;
      lCell.font = { name: 'Segoe UI', size: 8, bold: true, color: { argb: 'FF64748B' } };
      lCell.alignment = { vertical: 'middle', horizontal: 'center' };

      const vCell = worksheet.getCell(`${startCell.col}5`);
      vCell.value = value;
      vCell.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: valColor } };
      vCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Apply borders and fill
      for (let r = 4; r <= 5; r++) {
        const row = worksheet.getRow(r);
        for (let c = startCell.idx; c <= endCell.idx; c++) {
          const cell = row.getCell(c);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          cell.border = {
            top: r === 4 ? { style: 'thin', color: { argb: borderColor } } : undefined,
            bottom: r === 5 ? { style: 'thin', color: { argb: borderColor } } : undefined,
            left: c === startCell.idx ? { style: 'thin', color: { argb: borderColor } } : undefined,
            right: c === endCell.idx ? { style: 'thin', color: { argb: borderColor } } : undefined,
          };
        }
      }
    };

    worksheet.getRow(4).height = 18;
    worksheet.getRow(5).height = 24;

    const resolvedStatus = options.status || options.tab || 'ALL';

    styleCard({ col: 'A', idx: 1 }, { col: 'C', idx: 3 }, 'TOTAL INVOICES', `${totalRecords} Transactions`, 'FF0F172A', 'FFF8FAFC', 'FFCBD5E1');
    styleCard({ col: 'D', idx: 4 }, { col: 'F', idx: 6 }, 'GROSS BILLED', `₹${Number(totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'FF0F172A', 'FFF8FAFC', 'FFCBD5E1');
    styleCard({ col: 'G', idx: 7 }, { col: 'I', idx: 9 }, 'TOTAL COLLECTED', `₹${Number(totalPaid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'FF15803D', 'FFF0FDF4', 'FFBBF7D0');
    styleCard({ col: 'J', idx: 10 }, { col: 'L', idx: 12 }, 'OUTSTANDING DUES', `₹${Number(totalDue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, totalDue > 0 ? 'FFB45309' : 'FF15803D', totalDue > 0 ? 'FFFFFBEB' : 'FFF0FDF4', totalDue > 0 ? 'FFFDE68A' : 'FFBBF7D0');
    styleCard({ col: 'M', idx: 13 }, { col: 'N', idx: 14 }, 'COLLECTION RATE', `${collectionRate}%`, 'FF0D9488', 'FFF0FDFA', 'FF99F6E4');
    styleCard({ col: 'O', idx: 15 }, { col: 'Q', idx: 17 }, 'STATUS / SCOPE', resolvedStatus.toUpperCase(), 'FF475569', 'FFF8FAFC', 'FFCBD5E1');

    // Row 6: Meta period subtitle
    worksheet.getRow(6).height = 18;
    worksheet.mergeCells('A6:Q6');
    const metaRowCell = worksheet.getCell('A6');
    const dateRangeStr = options.start_date && options.end_date
      ? `${PaymentService.formatIST(options.start_date, false)} to ${PaymentService.formatIST(options.end_date, false)}`
      : options.start_date
        ? `From ${PaymentService.formatIST(options.start_date, false)}`
        : options.end_date
          ? `Until ${PaymentService.formatIST(options.end_date, false)}`
          : 'All Recorded Dates';
    metaRowCell.value = `Statement Period: ${dateRangeStr}  •  Report Generated (IST): ${PaymentService.formatIST(new Date(), true)}  •  Source: HomeNest Core`;
    metaRowCell.font = { name: 'Segoe UI', size: 8.5, italic: true, color: { argb: 'FF64748B' } };
    metaRowCell.alignment = { vertical: 'middle', horizontal: 'left' };

    // Row 7: Spacer
    worksheet.getRow(7).height = 8;

    // --- 4. Table Header Row (Row 8) ---
    const headerRow = worksheet.getRow(8);
    headerRow.values = [
      '#',
      'Receipt No',
      'Transaction ID',
      'Resident Name',
      'Phone',
      'Building',
      'Floor',
      'Room No',
      'Bed No',
      'Room Type',
      'Bill Type',
      'Status',
      'Payment Method',
      'Due Date (IST)',
      'Paid Date (IST)',
      'Total Amount (INR)',
      'Paid Amount (INR)',
    ];
    headerRow.height = 26;

    headerRow.eachCell((cell) => {
      cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }, // Executive Slate-800
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF1E293B' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        right: { style: 'thin', color: { argb: 'FF334155' } },
      };
    });

    // AutoFilter across all table columns
    worksheet.autoFilter = 'A8:Q8';

    // --- 5. Data Rows (Starting Row 9) ---
    payments.forEach((p, index) => {
      const rowIndex = 9 + index;
      const row = worksheet.getRow(rowIndex);

      const statusUpper = (p.status || '').toUpperCase();
      const methodUpper = (p.payment_method || '-').toUpperCase().replace(/_/g, ' ');
      const dueDateStr = PaymentService.formatIST(p.due_date, true);
      const paidDateStr = PaymentService.formatIST(p.paid_at, true);

      row.values = [
        index + 1,
        p.receipt_no || '-',
        p.transaction_id || '-',
        p.resident?.name || '-',
        p.resident?.phone || '-',
        p.building_name || '-',
        p.floor_name || (p.floor_number ? `Floor ${p.floor_number}` : '-'),
        p.room_no || '-',
        p.bed_number || '-',
        p.room_type ? p.room_type.toUpperCase() : '-',
        p.payment_type ? p.payment_type.toUpperCase().replace(/_/g, ' ') : '-',
        statusUpper || 'PENDING',
        methodUpper,
        dueDateStr,
        paidDateStr,
        p.amount || 0,
        p.paid_amount || 0,
      ];
      row.height = 22;

      const isEven = index % 2 === 1;
      const rowBg = isEven ? 'FFF8FAFC' : 'FFFFFFFF';

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 9 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowBg },
        };

        if ([1, 5, 7, 8, 9, 10, 11, 13, 14, 15].includes(colNumber)) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else if (colNumber === 16 || colNumber === 17) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '₹#,##0.00';
          cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: colNumber === 17 ? 'FF166534' : 'FF0F172A' } };
        } else if (colNumber === 12) {
          // Status Badge (Inside column)
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.font = { name: 'Segoe UI', size: 8.5, bold: true };
          if (statusUpper === 'PAID') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
            cell.font = { name: 'Segoe UI', size: 8.5, bold: true, color: { argb: 'FF166534' } };
          } else if (statusUpper === 'PENDING') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
            cell.font = { name: 'Segoe UI', size: 8.5, bold: true, color: { argb: 'FF92400E' } };
          } else if (statusUpper === 'OVERDUE') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            cell.font = { name: 'Segoe UI', size: 8.5, bold: true, color: { argb: 'FF991B1B' } };
          } else if (statusUpper === 'REFUNDED') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
            cell.font = { name: 'Segoe UI', size: 8.5, bold: true, color: { argb: 'FF475569' } };
          }
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });
    });

    // --- 6. Summary Total Row with Excel Formulas ---
    const summaryRowIndex = 9 + payments.length;
    const summaryRow = worksheet.getRow(summaryRowIndex);
    summaryRow.height = 25;

    worksheet.mergeCells(`A${summaryRowIndex}:O${summaryRowIndex}`);
    const sumLabel = worksheet.getCell(`A${summaryRowIndex}`);
    sumLabel.value = `GRAND TOTAL (${totalRecords} Transactions)`;
    sumLabel.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
    sumLabel.alignment = { vertical: 'middle', horizontal: 'right' };

    const amountSumCell = worksheet.getCell(`P${summaryRowIndex}`);
    if (payments.length > 0) {
      amountSumCell.value = { formula: `SUM(P9:P${summaryRowIndex - 1})`, result: totalAmount };
    } else {
      amountSumCell.value = 0;
    }
    amountSumCell.numFmt = '₹#,##0.00';
    amountSumCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
    amountSumCell.alignment = { vertical: 'middle', horizontal: 'right' };

    const paidSumCell = worksheet.getCell(`Q${summaryRowIndex}`);
    if (payments.length > 0) {
      paidSumCell.value = { formula: `SUM(Q9:Q${summaryRowIndex - 1})`, result: totalPaid };
    } else {
      paidSumCell.value = 0;
    }
    paidSumCell.numFmt = '₹#,##0.00';
    paidSumCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF166534' } };
    paidSumCell.alignment = { vertical: 'middle', horizontal: 'right' };

    // Format remaining cells in total row
    summaryRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'double', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });

    const filename = `payments-report-${Date.now()}.xlsx`;
    const uploadDir = path.join(process.cwd(), 'uploads', 'payments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, filename);
    await workbook.xlsx.writeFile(filePath);

    const file_url = buildFileUrl('payments', filename);

    return {
      file_url,
      file_path: `uploads/payments/${filename}`,
      filename,
      format: 'xlsx',
      total_records: payments.length,
      total_amount: totalAmount,
      total_paid: totalPaid,
      total_due: totalDue,
    };
  };

  exportPdf = async (options = {}) => {
    const base_query = this.buildFilterQuery(options);
    const raw_rows = await base_query
      .clone()
      .select(PaymentService.selectFields)
      .orderBy('payments.id', 'desc');

    const payments = raw_rows.map(PaymentService.formatPayment);

    // Financial totals
    const totalRecords = payments.length;
    const totalBilled = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const totalCollected = payments.reduce((acc, p) => acc + (p.paid_amount || 0), 0);
    const totalDue = Math.max(0, totalBilled - totalCollected);
    const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

    const branchName = options.pg_name || payments[0]?.branch_name || payments[0]?.pg_name || 'HouseNest PG Facility';
    const residentFilterName = options.resident_id && payments[0]?.resident?.name ? payments[0].resident.name : null;

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 24,
      bufferPages: true,
    });

    // Register Roboto fonts
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

    const filename = `payments-report-${Date.now()}.pdf`;
    const uploadDir = path.join(process.cwd(), 'uploads', 'payments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, filename);
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const startX = 24;
    const pageWidth = 794;

    // Palette: Light, Clean, Elegant Corporate Statement Theme
    const brandTeal = '#0D9488';     // Refined Teal Accent
    const headerBg = '#F8FAFC';      // Light slate header
    const borderSubtle = '#E2E8F0';  // Crisp light border
    const borderStrong = '#CBD5E1';  // Medium divider
    const textTitle = '#0F172A';     // Slate-900
    const textBody = '#334155';      // Slate-700
    const textMuted = '#64748B';     // Slate-500
    const textLight = '#94A3B8';     // Slate-400
    const rowZebra = '#F8FAFC';

    const fmtCurr = (val) => Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // 11 Columns in Logical Accounting Order (Total = 794 pt):
    const columns = [
      { key: 'sr', label: '#', width: 22, align: 'center' },
      { key: 'receipt', label: 'RECEIPT / TXN ID', width: 94, align: 'left' },
      { key: 'resident', label: 'RESIDENT', width: 104, align: 'left' },
      { key: 'allocation', label: 'ROOM & ALLOCATION', width: 114, align: 'left' },
      { key: 'type', label: 'BILL TYPE', width: 60, align: 'center' },
      { key: 'status', label: 'STATUS', width: 58, align: 'center' },
      { key: 'method', label: 'METHOD', width: 58, align: 'center' },
      { key: 'due_date', label: 'DUE DATE (IST)', width: 74, align: 'center' },
      { key: 'paid_at', label: 'PAID DATE (IST)', width: 74, align: 'center' },
      { key: 'amount', label: 'AMOUNT (INR)', width: 68, align: 'right' },
      { key: 'paid', label: 'PAID (INR)', width: 68, align: 'right' },
    ];

    const drawHeader = (doc, isFirst) => {
      // Subtle top accent line
      doc.rect(0, 0, 842, 3).fill(brandTeal);

      if (isFirst) {
        // 1. Brand Logo & Title (Light & Elegant)
        doc.roundedRect(startX, 14, 28, 28, 4).fill(brandTeal);
        doc.fillColor('#FFFFFF').font(fontBold).fontSize(12).text('HN', startX, 21.5, { width: 28, align: 'center', lineBreak: false });

        doc.fillColor(textTitle).font(fontBold).fontSize(13).text(branchName, startX + 36, 14, { lineBreak: false });
        const subTitle = residentFilterName
          ? `Payment Ledger Statement • Resident: ${residentFilterName} (ID: ${options.resident_id})`
          : 'Payment & Billing Ledger Statement • HomeNest System';
        doc.fillColor(textMuted).font(fontRegular).fontSize(7.5).text(subTitle, startX + 36, 29.5, { lineBreak: false });

        // 2. Right Meta Information Box
        const metaBoxW = 250;
        const metaBoxX = startX + pageWidth - metaBoxW;
        const metaBoxY = 12;
        const metaBoxH = 36;

        doc.roundedRect(metaBoxX, metaBoxY, metaBoxW, metaBoxH, 4).fillAndStroke('#F8FAFC', borderSubtle);

        doc.fillColor(textMuted).font(fontRegular).fontSize(6.5).text('GENERATED ON (IST):', metaBoxX + 8, metaBoxY + 6, { lineBreak: false });
        doc.fillColor(textTitle).font(fontMedium).fontSize(7).text(PaymentService.formatIST(new Date(), true) + ' IST', metaBoxX + 90, metaBoxY + 5.5, { lineBreak: false });

        doc.fillColor(textMuted).font(fontRegular).fontSize(6.5).text('STATEMENT SCOPE:', metaBoxX + 8, metaBoxY + 18, { lineBreak: false });
        const scopeText = options.resident_id
          ? `Resident #${options.resident_id}`
          : (options.tab ? options.tab.toUpperCase() : (options.status ? options.status.toUpperCase() : 'All Records'));
        doc.fillColor(brandTeal).font(fontMedium).fontSize(7).text(scopeText, metaBoxX + 90, metaBoxY + 17.5, { lineBreak: false });

        // 3. KPI Summary Cards (Clean, light styling, not bold)
        const cardY = 54;
        const cardH = 34;
        const cardGap = 8;
        const cardW = (pageWidth - cardGap * 3) / 4;

        const kpis = [
          { label: 'TOTAL INVOICES', value: String(totalRecords), sub: 'Transactions recorded', color: textTitle },
          { label: 'GROSS BILLED', value: 'INR ' + fmtCurr(totalBilled), sub: 'Total charges', color: textTitle },
          { label: 'TOTAL COLLECTED', value: 'INR ' + fmtCurr(totalCollected), sub: `${collectionRate}% Collection rate`, color: '#0F766E' },
          { label: 'OUTSTANDING DUES', value: 'INR ' + fmtCurr(totalDue), sub: totalDue > 0 ? 'Pending realization' : 'Fully settled', color: totalDue > 0 ? '#B45309' : '#0F766E' },
        ];

        kpis.forEach((kpi, i) => {
          const cx = startX + i * (cardW + cardGap);
          doc.roundedRect(cx, cardY, cardW, cardH, 4).fillAndStroke('#FFFFFF', borderSubtle);

          doc.fillColor(textMuted).font(fontRegular).fontSize(6).text(kpi.label, cx + 8, cardY + 5.5, { lineBreak: false });
          doc.fillColor(kpi.color).font(fontMedium).fontSize(9).text(kpi.value, cx + 8, cardY + 14.5, { width: cardW - 16, ellipsis: true, lineBreak: false });
          doc.fillColor(textLight).font(fontRegular).fontSize(5.5).text(kpi.sub, cx + 8, cardY + 24.5, { lineBreak: false });
        });

        return cardY + cardH + 10;
      } else {
        doc.fillColor(brandTeal).font(fontBold).fontSize(8).text(`${branchName} — Payments Ledger (Continued)`, startX, 12, { lineBreak: false });
        return 24;
      }
    };

    const drawTableHeader = (doc, currentY) => {
      doc.roundedRect(startX, currentY, pageWidth, 18, 2).fill(headerBg);
      doc.moveTo(startX, currentY + 18).lineTo(startX + pageWidth, currentY + 18).strokeColor(borderStrong).lineWidth(0.5).stroke();

      let curX = startX;
      columns.forEach((col) => {
        doc.fillColor(textBody).font(fontBold).fontSize(6.5).text(col.label, curX + 2, currentY + 5.5, {
          width: col.width - 4,
          align: col.align,
          lineBreak: false,
        });
        curX += col.width;
      });

      return currentY + 19;
    };

    let currentY = drawHeader(doc, true);
    currentY = drawTableHeader(doc, currentY);

    const rowHeight = 24;

    payments.forEach((p, idx) => {
      if (currentY + rowHeight > 540) {
        doc.addPage();
        currentY = drawHeader(doc, false);
        currentY = drawTableHeader(doc, currentY);
      }

      const isEven = idx % 2 === 1;
      if (isEven) {
        doc.roundedRect(startX, currentY, pageWidth, rowHeight, 1).fill(rowZebra);
      }

      doc.moveTo(startX, currentY + rowHeight).lineTo(startX + pageWidth, currentY + rowHeight).strokeColor(borderSubtle).lineWidth(0.5).stroke();

      let curX = startX;

      // Col 1: #
      doc.fillColor(textMuted).font(fontRegular).fontSize(7).text(String(idx + 1), curX, currentY + 8.5, { width: columns[0].width, align: 'center', lineBreak: false });
      curX += columns[0].width;

      // Col 2: Receipt / Txn ID
      doc.fillColor(textTitle).font(fontMedium).fontSize(6.5).text(p.receipt_no || '-', curX + 2, currentY + 5, { width: columns[1].width - 4, lineBreak: false });
      doc.fillColor(textLight).font(fontRegular).fontSize(5.5).text(p.transaction_id || 'No Txn ID', curX + 2, currentY + 13.5, { width: columns[1].width - 4, ellipsis: true, lineBreak: false });
      curX += columns[1].width;

      // Col 3: Resident Details
      doc.fillColor(textTitle).font(fontRegular).fontSize(7).text(p.resident?.name || '-', curX + 2, currentY + 5, { width: columns[2].width - 4, ellipsis: true, lineBreak: false });
      doc.fillColor(textMuted).font(fontRegular).fontSize(5.5).text(p.resident?.phone || '-', curX + 2, currentY + 13.5, { width: columns[2].width - 4, ellipsis: true, lineBreak: false });
      curX += columns[2].width;

      // Col 4: Room & Bed Allocation
      const roomText = p.room_no ? `Room ${p.room_no}` : 'No Room';
      const bedText = p.bed_number ? ` • ${p.bed_number}` : '';
      const typeText = p.room_type ? ` (${p.room_type.toUpperCase()})` : '';
      const allocLine1 = `${roomText}${bedText}${typeText}`;

      const bldgText = p.building_name || '';
      const floorText = p.floor_name || (p.floor_number ? `Floor ${p.floor_number}` : '');
      const allocLine2 = [bldgText, floorText].filter(Boolean).join(' • ') || 'Main Facility';

      doc.fillColor(brandTeal).font(fontMedium).fontSize(6.5).text(allocLine1, curX + 2, currentY + 5, { width: columns[3].width - 4, ellipsis: true, lineBreak: false });
      doc.fillColor(textMuted).font(fontRegular).fontSize(5.5).text(allocLine2, curX + 2, currentY + 13.5, { width: columns[3].width - 4, ellipsis: true, lineBreak: false });
      curX += columns[3].width;

      // Col 5: Bill Type
      let typeClean = (p.payment_type || 'rent').replace(/_/g, ' ').toUpperCase();
      if (typeClean === 'SECURITY DEPOSIT') typeClean = 'SEC. DEPOSIT';
      doc.fillColor(textBody).font(fontRegular).fontSize(6).text(typeClean, curX + 1, currentY + 8.5, { width: columns[4].width - 2, align: 'center', lineBreak: false });
      curX += columns[4].width;

      // Col 6: Status (Inside Table)
      const statusUpper = (p.status || 'PENDING').toUpperCase();
      let pillBg = '#F1F5F9';
      let pillText = '#475569';
      if (statusUpper === 'PAID') {
        pillBg = '#DCFCE7';
        pillText = '#166534';
      } else if (statusUpper === 'PENDING') {
        pillBg = '#FEF3C7';
        pillText = '#92400E';
      } else if (statusUpper === 'OVERDUE') {
        pillBg = '#FEE2E2';
        pillText = '#991B1B';
      } else if (statusUpper === 'REFUNDED') {
        pillBg = '#F1F5F9';
        pillText = '#475569';
      }

      const pillW = columns[5].width - 6;
      const pillH = 11;
      const pillX = curX + 3;
      const pillY = currentY + 6.5;
      doc.roundedRect(pillX, pillY, pillW, pillH, 2).fill(pillBg);
      doc.fillColor(pillText).font(fontMedium).fontSize(5.5).text(statusUpper, pillX, pillY + 2.5, { width: pillW, align: 'center', lineBreak: false });
      curX += columns[5].width;

      // Col 7: Method (Inside Table)
      let methodClean = (p.payment_method || '-').toUpperCase().replace(/_/g, ' ');
      doc.fillColor(methodClean !== '-' ? textBody : textLight).font(fontRegular).fontSize(5.5).text(methodClean, curX + 1, currentY + 8.5, { width: columns[6].width - 2, align: 'center', lineBreak: false });
      curX += columns[6].width;

      // Col 8: Due Date (IST)
      const dueStr = PaymentService.formatIST(p.due_date, true);
      doc.fillColor(textBody).font(fontRegular).fontSize(6).text(dueStr, curX + 1, currentY + 8.5, { width: columns[7].width - 2, align: 'center', lineBreak: false });
      curX += columns[7].width;

      // Col 9: Paid Date (IST)
      const paidAtStr = PaymentService.formatIST(p.paid_at, true);
      doc.fillColor(p.paid_at ? '#0F766E' : textLight).font(fontRegular).fontSize(6).text(paidAtStr, curX + 1, currentY + 8.5, { width: columns[8].width - 2, align: 'center', lineBreak: false });
      curX += columns[8].width;

      // Col 10: Total (INR)
      doc.fillColor(textTitle).font(fontRegular).fontSize(7).text(fmtCurr(p.amount), curX + 1, currentY + 8.5, { width: columns[9].width - 3, align: 'right', lineBreak: false });
      curX += columns[9].width;

      // Col 11: Paid (INR)
      const paidColor = Number(p.paid_amount) > 0 ? '#0F766E' : textMuted;
      doc.fillColor(paidColor).font(fontRegular).fontSize(7).text(fmtCurr(p.paid_amount), curX + 1, currentY + 8.5, { width: columns[10].width - 3, align: 'right', lineBreak: false });
      curX += columns[10].width;

      currentY += rowHeight;
    });

    // Grand Total Summary Box (Light, Clean)
    if (currentY + 24 > 540) {
      doc.addPage();
      currentY = drawHeader(doc, false);
      currentY = drawTableHeader(doc, currentY);
    }

    currentY += 4;
    doc.roundedRect(startX, currentY, pageWidth, 20, 2).fillAndStroke('#F8FAFC', borderSubtle);

    doc.fillColor(textTitle).font(fontBold).fontSize(7.5).text('GRAND TOTAL', startX + 10, currentY + 6.5, { lineBreak: false });
    doc.fillColor(textMuted).font(fontRegular).fontSize(6.5).text(`(${totalRecords} total transactions)`, startX + 72, currentY + 7, { lineBreak: false });

    // Amount column position (columns 0 through 8: 22 + 94 + 104 + 114 + 60 + 58 + 58 + 74 + 74 = 658)
    const amountX = startX + 22 + 94 + 104 + 114 + 60 + 58 + 58 + 74 + 74;
    doc.fillColor(textTitle).font(fontBold).fontSize(7.5).text(
      fmtCurr(totalBilled),
      amountX + 1,
      currentY + 6.5,
      { width: columns[9].width - 3, align: 'right', lineBreak: false }
    );

    // Paid column position
    const paidX = amountX + columns[9].width;
    doc.fillColor('#0F766E').font(fontBold).fontSize(7.5).text(
      fmtCurr(totalCollected),
      paidX + 1,
      currentY + 6.5,
      { width: columns[10].width - 3, align: 'right', lineBreak: false }
    );

    // Balance summary displayed cleanly in left-mid section of the total bar
    doc.fillColor(totalDue > 0 ? '#B45309' : '#0F766E').font(fontBold).fontSize(7).text(
      `Balance Dues: INR ${fmtCurr(totalDue)}`,
      startX + 280,
      currentY + 6.5,
      { width: 360, align: 'right', lineBreak: false }
    );

    // Clean, Professional Minimal Footer (Single line, consistent on all pages, 0 blank pages)
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      const prevBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      doc.moveTo(startX, 570).lineTo(startX + pageWidth, 570).strokeColor(borderSubtle).lineWidth(0.5).stroke();

      doc.fillColor(textMuted).font(fontRegular).fontSize(6.5).text(
        `HomeNest PG Management System • Payment Ledger • ${branchName}`,
        startX,
        574.5,
        { lineBreak: false }
      );

      doc.fillColor(textTitle).font(fontMedium).fontSize(6.5).text(
        `Page ${i + 1} of ${range.count}`,
        startX,
        574.5,
        { width: pageWidth, align: 'right', lineBreak: false }
      );

      doc.page.margins.bottom = prevBottom;
    }

    doc.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const file_url = buildFileUrl('payments', filename);

    return {
      file_url,
      file_path: `uploads/payments/${filename}`,
      filename,
      format: 'pdf',
      total_records: totalRecords,
      total_amount: totalBilled,
      total_paid: totalCollected,
      total_due: totalDue,
    };
  };


  /**
   * Retrieve unified KPI statistics for payments (Revenue, Transactions, Collections, Pending, Overdue, Refunds)
   * Serves both Payment Overview and Payment History screens with a single high-performance aggregation query.
   * @param {object} options - { owner_id, pg_id, start_date, end_date }
   * @returns {Promise<object>} Unified payment statistics
   */
  getPaymentStats = async (options = {}) => {
    const { owner_id, pg_id, start_date, end_date } = options;

    const base_query = db('payments')
      .whereNull('payments.deleted_at')
      .join('pgs', (join) => {
        join.on('payments.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .leftJoin('resident_pg_stays as stay', (join) => {
        join.on('payments.stay_id', '=', 'stay.id').andOnNull('stay.deleted_at');
      })
      .modify((qb) => {
        if (owner_id) {
          qb.where('pgs.owner_id', owner_id);
        }
        if (pg_id) {
          qb.where('payments.pg_id', pg_id);
        }
        if (start_date) {
          qb.where('payments.created_at', '>=', start_date);
        }
        if (end_date) {
          qb.where('payments.created_at', '<=', end_date);
        }
      });

    const [row] = await base_query.select(
      db.raw('COUNT(payments.id) as total_transactions'),
      db.raw('COALESCE(SUM(payments.amount), 0) as total_revenue'),
      db.raw("COALESCE(SUM(CASE WHEN payments.status = 'paid' THEN payments.paid_amount ELSE 0 END), 0) as collected"),
      db.raw("COALESCE(SUM(CASE WHEN payments.status = 'pending' THEN payments.amount ELSE 0 END), 0) as pending_dues"),
      db.raw("COALESCE(SUM(CASE WHEN payments.status = 'overdue' THEN payments.amount ELSE 0 END), 0) as overdue"),
      db.raw("COALESCE(SUM(CASE WHEN payments.status IN ('pending', 'overdue') THEN payments.amount ELSE 0 END), 0) as total_pending"),
      db.raw("COALESCE(SUM(CASE WHEN payments.status = 'refunded' THEN payments.refund_amount ELSE 0 END), 0) as total_refunded")
    );

    const total_revenue = parseFloat(row?.total_revenue) || 0;
    const total_refunded = parseFloat(row?.total_refunded) || 0;
    const collected = (parseFloat(row?.collected) || 0) + total_refunded;
    const pending_dues = parseFloat(row?.pending_dues) || 0;
    const overdue = parseFloat(row?.overdue) || 0;

    const collected_percentage = total_revenue > 0 ? Math.round((collected / total_revenue) * 100) : 0;
    const pending_percentage = total_revenue > 0 ? Math.round((pending_dues / total_revenue) * 100) : 0;
    const overdue_percentage = total_revenue > 0 ? Math.round((overdue / total_revenue) * 100) : 0;

    return {
      total_revenue,
      total_transactions: parseInt(row?.total_transactions, 10) || 0,
      collected,
      collected_percentage,
      pending_dues,
      pending_percentage,
      overdue,
      overdue_percentage,
      total_pending: parseFloat(row?.total_pending) || 0,
      total_refunded,
    };
  };

  // Backward-compatible aliases for legacy routes
  getOverviewStats = async (options = {}) => this.getPaymentStats(options);

  /**
   * Get Resident Mobile Payment Overview & Rent Details
   * Returns:
   * - Outstanding amount card (status, due date)
   * - Breakdown (rent, maintenance, electricity, other)
   * - Security Deposit card (amount, refundable status)
   * - Recent Transactions list
   * @param {number|string} resident_id
   * @returns {Promise<object>}
   */
  getResidentOverview = async (resident_id) => {
    // 1. Get resident's active stay (to get security deposit)
    const active_stay = await db('resident_pg_stays')
      .where({ resident_id, status: 'active' })
      .whereNull('deleted_at')
      .first();

    const security_deposit = active_stay ? Number(active_stay.security_deposit) || 0 : 0;

    // 2. Get ALL pending and overdue bills for this resident
    const pending_bills = await db('payments')
      .where({ resident_id })
      .whereIn('status', ['pending', 'overdue'])
      .whereNull('deleted_at')
      .orderBy('due_date', 'asc');

    const total_outstanding = pending_bills.reduce((sum, b) => {
      const b_amount = Number(b.amount) || 0;
      const b_paid = Number(b.paid_amount) || 0;
      return sum + Math.max(0, b_amount - b_paid);
    }, 0);

    const primary_bill = pending_bills[0] || null;
    const due_date = primary_bill?.due_date || null;
    const hasOverdue = pending_bills.some((b) => b.status === 'overdue');
    const overall_status = hasOverdue ? 'overdue' : (pending_bills.length > 0 ? 'pending' : 'paid');

    // Aggregate breakdown sums across all pending bills
    let total_rent = 0;
    let total_deposit_bills = 0;
    let total_maintenance = 0;
    let total_electricity = 0;
    let total_other = 0;

    const entries = pending_bills.map((b) => {
      const b_amount = Number(b.amount) || 0;
      const b_paid = Number(b.paid_amount) || 0;
      const b_due = Math.max(0, b_amount - b_paid);
      const b_deposit = Number(b.deposit_amount) || 0;
      const b_rent = Number(b.rent_amount) || 0;
      const b_maint = Number(b.maintenance_amount) || 0;
      const b_elec = Number(b.electricity_amount) || 0;
      const b_other = Number(b.other_amount) || 0;

      total_rent += b_rent;
      total_deposit_bills += b_deposit;
      total_maintenance += b_maint;
      total_electricity += b_elec;
      total_other += b_other;

      return {
        id: b.id,
        payment_id: b.id,
        title: b.title || 'Payment Bill',
        payment_type: b.payment_type || 'rent',
        status: b.status || 'pending',
        amount: b_amount,
        paid_amount: b_paid,
        due_amount: b_due,
        due_date: b.due_date || null,
        due_date_text: b.due_date
          ? `Due on ${new Date(b.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`
          : null,
        billing_period_start: b.billing_period_start || null,
        billing_period_end: b.billing_period_end || null,
        notes: b.notes || null,
        breakdown: {
          rent: b_rent,
          deposit: b_deposit,
          maintenance: b_maint,
          electricity: b_elec,
          other: b_other,
          total: b_amount,
        },
      };
    });

    const breakdown = {
      rent: total_rent,
      deposit: total_deposit_bills,
      security_deposit: total_deposit_bills || security_deposit,
      maintenance: total_maintenance,
      electricity: total_electricity,
      other: total_other,
      total: total_outstanding,
    };

    // Billing period range across pending bills
    const validStarts = pending_bills.map((b) => b.billing_period_start).filter(Boolean).sort();
    const validEnds = pending_bills.map((b) => b.billing_period_end).filter(Boolean).sort();

    const billing_period = {
      start: validStarts[0] || primary_bill?.billing_period_start || null,
      end: validEnds[validEnds.length - 1] || primary_bill?.billing_period_end || null,
    };

    // 3. Get recent 5 completed transactions
    const recent_raw = await db('payments')
      .where('payments.resident_id', resident_id)
      .whereIn('payments.status', ['paid', 'completed'])
      .whereNull('payments.deleted_at')
      .join('users as resident', (join) => {
        join.on('payments.resident_id', '=', 'resident.id').andOnNull('resident.deleted_at');
      })
      .join('pgs', (join) => {
        join.on('payments.pg_id', '=', 'pgs.id').andOnNull('pgs.deleted_at');
      })
      .leftJoin('resident_pg_stays as stay', (join) => {
        join.on('payments.stay_id', '=', 'stay.id').andOnNull('stay.deleted_at');
      })
      .leftJoin('rooms', (join) => {
        join.on('payments.room_id', '=', 'rooms.id').andOnNull('rooms.deleted_at');
      })
      .leftJoin('buildings', (join) => {
        join.on('rooms.building_id', '=', 'buildings.id').andOnNull('buildings.deleted_at');
      })
      .leftJoin('floors', (join) => {
        join.on('rooms.floor_id', '=', 'floors.id').andOnNull('floors.deleted_at');
      })
      .select(PaymentService.selectFields)
      .orderBy('payments.paid_at', 'desc')
      .limit(5);

    const recent_transactions = recent_raw.map(PaymentService.formatPayment);

    return {
      outstanding: {
        payment_id: primary_bill?.id || null,
        amount: total_outstanding,
        total_entries: pending_bills.length,
        status: overall_status,
        due_date,
        due_date_text: due_date
          ? `Due on ${new Date(due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`
          : 'No pending dues',
        notes: primary_bill?.notes || (pending_bills.length > 0 ? 'Payment dues pending. Please clear on time.' : 'No pending dues.'),
        entries,
      },
      billing_period,
      breakdown,
      security_deposit: {
        amount: security_deposit,
        is_refundable: true,
        tag: 'Refundable',
      },
      recent_transactions,
    };
  };

  /**
   * Initiate UPI / QR Code checkout for an invoice or outstanding bill
   * Generates dynamic UPI intent URL, saves standard PNG QR image to disk, and returns direct file URL.
   * @param {number|string} payment_id
   * @param {number|string|null} [resident_id=null]
   * @returns {Promise<object>}
   */
  generateQrCheckout = async (payment_id, resident_id = null) => {
    const query = db('payments').where({ id: payment_id }).whereNull('deleted_at');
    if (resident_id) {
      query.where({ resident_id });
    }
    const payment = await query.first();

    if (!payment) {
      throw new AppError('Pending invoice not found for payment checkout', HTTP_STATUS.NOT_FOUND);
    }

    if (payment.status === 'paid') {
      throw new AppError('This invoice has already been paid in full', HTTP_STATUS.BAD_REQUEST);
    }

    const pg = await db('pgs').where({ id: payment.pg_id }).first();
    const payee_name = pg?.pg_account_holder_name || pg?.name || 'HouseNest Living';
    // Use the registered UPI ID of this PG facility so resident directly sends amount into that PG account
    const payee_upi = pg?.pg_upi_id || 'jasminkorat204@oksbi';

    // Standard NPCI UPI URI Scheme: upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...
    const amount = Number(payment.amount).toFixed(2);
    const note = `Rent Payment #${payment.id}`;
    const upi_intent_url = `upi://pay?pa=${encodeURIComponent(payee_upi)}&pn=${encodeURIComponent(payee_name)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;

    // Store QR code PNG image locally in uploads/payments/
    const uploadDir = path.join(process.cwd(), 'uploads', 'payments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const qrFilename = `qr-payment-${payment.id}.png`;
    const qrFilePath = path.join(uploadDir, qrFilename);

    await QRCode.toFile(qrFilePath, upi_intent_url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    const qr_code_url = buildFileUrl('payments', qrFilename);

    // Update payment record with payee UPI ID for transaction tracking
    await db('payments').where({ id: payment.id }).update({
      upi_id: payee_upi,
      updated_at: db.fn.now(),
    });

    return {
      payment_id: payment.id,
      amount: Number(payment.amount),
      payee_name,
      payee_upi,
      qr_code_url,
      upi_intent_url,
      supported_apps: ['GPay', 'PhonePe', 'Paytm', 'BHIM'],
    };
  };

  /**
   * Complete payment simulation / webhook / manual collection
   * Updates payment to 'paid', generates transaction ID, and generates official receipt.
   * @param {number|string} payment_id
   * @param {object} payload - { payment_method, payment_method_details, upi_ref_no, paid_amount }
   * @returns {Promise<object>}
   */
  processPayment = async (payment_id, payload) => {
    const payment = await db('payments')
      .where({ id: payment_id })
      .whereNull('deleted_at')
      .first();

    if (!payment) {
      throw new AppError('Payment invoice not found', HTTP_STATUS.NOT_FOUND);
    }

    if (payment.status === 'paid') {
      throw new AppError('Payment is already marked as paid', HTTP_STATUS.BAD_REQUEST);
    }

    const transaction_id = payload.transaction_id || `TXN${Date.now()}${Math.floor(100 + Math.random() * 900)}`;
    const receipt_no = payment.receipt_no || `RCPT-${new Date().getFullYear()}-${String(payment.id).padStart(4, '0')}`;
    const paid_amount = payload.paid_amount !== undefined ? Number(payload.paid_amount) : Number(payment.amount);
    const payment_method = payload.payment_method || 'upi';
    const payment_method_details = payload.payment_method_details || (payment_method === 'upi' ? 'UPI GPay' : payment_method);

    await db('payments')
      .where({ id: payment_id })
      .update({
        transaction_id,
        receipt_no,
        paid_amount,
        payment_method,
        payment_method_details,
        upi_ref_no: payload.upi_ref_no || null,
        status: 'paid',
        paid_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

    return await this.findById(payment_id);
  };

  /**
   * Create a new invoice / billing demand (Admin)
   * @param {object} data
   * @returns {Promise<object>}
   */
  create = async (data) => {
    const {
      resident_id,
      pg_id,
      stay_id = null,
      room_id = null,
      title = 'Monthly Rent',
      payment_type = 'rent',
      billing_period_start = null,
      billing_period_end = null,
      due_date = null,
      rent_amount = 0,
      deposit_amount = 0,
      maintenance_amount = 0,
      electricity_amount = 0,
      other_amount = 0,
      amount,
      notes = null,
    } = data;

    // Verify resident exists
    const resident = await db('users').where({ id: resident_id }).whereNull('deleted_at').first();
    if (!resident) {
      throw new AppError('Resident not found', HTTP_STATUS.NOT_FOUND);
    }

    // Auto-resolve current active stay, room_id, and pg_id if not explicitly provided
    let resolved_stay_id = stay_id ? Number(stay_id) : null;
    let resolved_room_id = room_id ? Number(room_id) : null;
    let resolved_pg_id = pg_id ? Number(pg_id) : null;

    if (!resolved_stay_id || !resolved_room_id || !resolved_pg_id) {
      const active_stay = await db('resident_pg_stays')
        .where({ resident_id: Number(resident_id), status: 'active' })
        .whereNull('deleted_at')
        .orderBy('id', 'desc')
        .first();

      if (active_stay) {
        if (!resolved_stay_id) resolved_stay_id = active_stay.id;
        if (!resolved_room_id) resolved_room_id = active_stay.room_id;
        if (!resolved_pg_id) resolved_pg_id = active_stay.pg_id;
      }
    }

    if (!resolved_pg_id) {
      throw new AppError('PG facility identification is required. Please specify pg_id or assign the resident to an active stay', HTTP_STATUS.BAD_REQUEST);
    }

    // Verify PG exists
    const pg = await db('pgs').where({ id: resolved_pg_id }).whereNull('deleted_at').first();
    if (!pg) {
      throw new AppError('PG facility not found', HTTP_STATUS.NOT_FOUND);
    }

    const calculated_total = amount !== undefined
      ? Number(amount)
      : (Number(rent_amount) + Number(deposit_amount) + Number(maintenance_amount) + Number(electricity_amount) + Number(other_amount));

    const [id] = await db('payments').insert({
      resident_id: Number(resident_id),
      pg_id: Number(resolved_pg_id),
      stay_id: resolved_stay_id ? Number(resolved_stay_id) : null,
      room_id: resolved_room_id ? Number(resolved_room_id) : null,
      title,
      payment_type,
      billing_period_start: billing_period_start || null,
      billing_period_end: billing_period_end || null,
      due_date: due_date || null,
      rent_amount: Number(rent_amount) || 0,
      deposit_amount: Number(deposit_amount) || 0,
      maintenance_amount: Number(maintenance_amount) || 0,
      electricity_amount: Number(electricity_amount) || 0,
      other_amount: Number(other_amount) || 0,
      amount: calculated_total,
      paid_amount: 0.00,
      status: 'pending',
      notes: notes || null,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    return await this.findById(id);
  };

  /**
   * Update payment bill / demand (Admin)
   * @param {number} id
   * @param {object} data
   * @returns {Promise<object>}
   */
  update = async (id, data) => {
    const existing = await db('payments').where({ id }).whereNull('deleted_at').first();
    if (!existing) {
      throw new AppError('Payment record not found', HTTP_STATUS.NOT_FOUND);
    }

    const {
      resident_id,
      pg_id,
      stay_id,
      room_id,
      title,
      payment_type,
      billing_period_start,
      billing_period_end,
      due_date,
      rent_amount,
      deposit_amount,
      maintenance_amount,
      electricity_amount,
      other_amount,
      amount,
      notes,
      status,
    } = data;

    const updatePayload = {
      updated_at: db.fn.now(),
    };

    if (resident_id !== undefined) {
      const resident = await db('users').where({ id: resident_id }).whereNull('deleted_at').first();
      if (!resident) {
        throw new AppError('Resident not found', HTTP_STATUS.NOT_FOUND);
      }
      updatePayload.resident_id = Number(resident_id);
    }

    if (pg_id !== undefined) {
      const pg = await db('pgs').where({ id: pg_id }).whereNull('deleted_at').first();
      if (!pg) {
        throw new AppError('PG facility not found', HTTP_STATUS.NOT_FOUND);
      }
      updatePayload.pg_id = Number(pg_id);
    }

    if (stay_id !== undefined) updatePayload.stay_id = stay_id ? Number(stay_id) : null;
    if (room_id !== undefined) updatePayload.room_id = room_id ? Number(room_id) : null;
    if (title !== undefined) updatePayload.title = title;
    if (payment_type !== undefined) updatePayload.payment_type = payment_type;
    if (billing_period_start !== undefined) updatePayload.billing_period_start = billing_period_start || null;
    if (billing_period_end !== undefined) updatePayload.billing_period_end = billing_period_end || null;
    if (due_date !== undefined) updatePayload.due_date = due_date || null;
    if (notes !== undefined) updatePayload.notes = notes;
    if (status !== undefined) updatePayload.status = status;

    if (rent_amount !== undefined) updatePayload.rent_amount = Number(rent_amount) || 0;
    if (deposit_amount !== undefined) updatePayload.deposit_amount = Number(deposit_amount) || 0;
    if (maintenance_amount !== undefined) updatePayload.maintenance_amount = Number(maintenance_amount) || 0;
    if (electricity_amount !== undefined) updatePayload.electricity_amount = Number(electricity_amount) || 0;
    if (other_amount !== undefined) updatePayload.other_amount = Number(other_amount) || 0;

    if (amount !== undefined) {
      updatePayload.amount = Number(amount);
    } else if (
      rent_amount !== undefined ||
      deposit_amount !== undefined ||
      maintenance_amount !== undefined ||
      electricity_amount !== undefined ||
      other_amount !== undefined
    ) {
      const r = rent_amount !== undefined ? Number(rent_amount) : Number(existing.rent_amount || 0);
      const d = deposit_amount !== undefined ? Number(deposit_amount) : Number(existing.deposit_amount || 0);
      const m = maintenance_amount !== undefined ? Number(maintenance_amount) : Number(existing.maintenance_amount || 0);
      const e = electricity_amount !== undefined ? Number(electricity_amount) : Number(existing.electricity_amount || 0);
      const o = other_amount !== undefined ? Number(other_amount) : Number(existing.other_amount || 0);
      updatePayload.amount = r + d + m + e + o;
    }

    await db('payments').where({ id }).update(updatePayload);

    return await this.findById(id);
  };

  /**
   * Soft delete a payment bill / record (Admin)
   * Sets deleted_at to current timestamp.
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  delete = async (id) => {
    const existing = await db('payments').where({ id }).whereNull('deleted_at').first();
    if (!existing) {
      throw new AppError('Payment record not found', HTTP_STATUS.NOT_FOUND);
    }

    await db('payments').where({ id }).update({
      deleted_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    return true;
  };

}

export default new PaymentService();
