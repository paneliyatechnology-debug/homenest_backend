import { Router } from 'express';
import { getDashboard } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

/**
 * @route   GET /api/v1/dashboard
 * @desc    Get dashboard data dynamically tailored to user's role:
 *          - Admin / Super Admin: Operations Dashboard (Residents, Occupancy, Revenue, Dues, Complaints, Trends, Room Breakdown, Activity)
 *          - Resident: Resident Dashboard (Stay details, Rent due, Next event, Gate pass, Quick actions, Today's menu, Complaints, Notice, Notifications)
 * @access  Private (Authenticated users: Resident, Admin, Super Admin, Branch Manager)
 */
router.get('/', authenticate, getDashboard);

export default router;

