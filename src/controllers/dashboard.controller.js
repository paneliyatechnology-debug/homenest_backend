import dashboardService from '../services/dashboard.service.js';
import { success } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';

/**
 * Controller managing Role-Based Dashboard Metrics
 * Returns Operations Dashboard for Admin/Super Admin
 * and Resident Dashboard for Resident based on JWT token role.
 */
export const getDashboard = async (req, res, next) => {
  try {
    const data = await dashboardService.getDashboard(req.user, req.query);
    const message = data.role === 'resident'
      ? 'Resident dashboard data retrieved successfully'
      : 'Operations dashboard data retrieved successfully';

    return success(res, message, data, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

export default {
  getDashboard,
};

