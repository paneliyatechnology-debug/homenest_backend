import branchService from '../services/branch.service.js';
import { success, successAction } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';

class BranchController {
  /**
   * Get KPI statistics for Branches dashboard cards
   */
  getBranchStats = async (req, res, next) => {
    try {
      const stats = await branchService.getStats({
        user: req.user,
        pg_id: req.query.pg_id,
      });

      return success(res, 'Branch statistics retrieved successfully', stats);
    } catch (err) {
      next(err);
    }
  };

  /**
   * List all branches with filters and pagination
   */
  getAllBranches = async (req, res, next) => {
    try {
      const {
        pg_id,
        status,
        search,
        location,
        sort_by,
        order,
        page = 1,
        limit = 10,
      } = req.query;

      const result = await branchService.findAll({
        user: req.user,
        pg_id,
        status,
        search,
        location,
        sort_by,
        order,
        page,
        limit,
      });

      return success(
        res,
        'Branches retrieved successfully',
        result.branches,
        HTTP_STATUS.OK,
        result.pagination
      );
    } catch (err) {
      next(err);
    }
  };

  /**
   * Get single branch details by ID
   */
  getBranchById = async (req, res, next) => {
    try {
      const branch = await branchService.findById(req.params.id, {
        user: req.user,
      });

      return success(res, 'Branch details retrieved successfully', branch);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Create a new branch
   */
  createBranch = async (req, res, next) => {
    try {
      const branch_photo = req.file ? req.file.filename : null;

      const branch = await branchService.create(
        {
          ...req.body,
          branch_photo,
        },
        req.user
      );

      return successAction(
        res,
        'Branch created successfully',
        branch.id,
        HTTP_STATUS.CREATED
      );
    } catch (err) {
      next(err);
    }
  };

  /**
   * Update an existing branch
   */
  updateBranch = async (req, res, next) => {
    try {
      const updateData = { ...req.body };
      if (req.file) {
        updateData.branch_photo = req.file.filename;
      }

      const branch = await branchService.update(
        req.params.id,
        updateData,
        req.user
      );

      return successAction(res, 'Branch updated successfully', branch.id, HTTP_STATUS.OK);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Soft delete a branch
   */
  deleteBranch = async (req, res, next) => {
    try {
      await branchService.delete(req.params.id, req.user);
      return successAction(res, 'Branch deleted successfully', parseInt(req.params.id, 10), HTTP_STATUS.OK);
    } catch (err) {
      next(err);
    }
  };
}

export default new BranchController();

