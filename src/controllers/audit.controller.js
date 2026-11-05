import auditService from '../services/audit.service.js';
import { success } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';

class AuditController {
  /**
   * Get KPI statistics and metrics for Administrative Activity Log
   * Card 1: Total Activities
   * Card 2: Today
   * Card 3: Last 7 Days
   * Card 4: Last 30 Days
   * @route GET /api/v1/audits/stats
   */
  getAuditStats = async (req, res, next) => {
    try {
      const stats = await auditService.getStats(req.user, req.query);
      return success(res, 'Audit statistics retrieved successfully', stats);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Export administrative activity logs as formatted Excel (.xlsx) or PDF (.pdf) file
   * Supports two formats: pdf and xlsx (default: xlsx)
   * @route GET /api/v1/audits/export
   */
  exportAudits = async (req, res, next) => {
    try {
      const rawFormat = String(req.query.format || 'xlsx').trim().toLowerCase();
      const format = rawFormat === 'pdf' ? 'pdf' : 'xlsx';

      let result;
      if (format === 'pdf') {
        result = await auditService.exportAuditsPdf(req.user, req.query);
      } else {
        result = await auditService.exportAuditsExcel(req.user, req.query);
      }

      const message = format === 'pdf'
        ? 'Administrative activity log PDF report generated successfully'
        : 'Administrative activity log Excel report generated successfully';

      return success(res, message, result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * List paginated audit logs with multi-dimensional filtering (branch, module, action, actor, date range, search)
   * Matches columns: [Sr no.] [User] [Action] [Module] [Details] [Timestamp] [IP address] [Action]
   * @route GET /api/v1/audits
   */
  getAllAudits = async (req, res, next) => {
    try {
      const result = await auditService.findAll(req.user, req.query);
      return success(
        res,
        'Audit logs retrieved successfully',
        result.audits,
        HTTP_STATUS.OK,
        result.pagination
      );
    } catch (err) {
      next(err);
    }
  };

  /**
   * Get single audit record by ID with full state details
   * @route GET /api/v1/audits/:id
   */
  getAuditById = async (req, res, next) => {
    try {
      const audit = await auditService.findById(req.params.id, req.user);
      return success(res, 'Audit log retrieved successfully', audit);
    } catch (err) {
      next(err);
    }
  };
}

export default new AuditController();
