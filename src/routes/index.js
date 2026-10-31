import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import stayRoutes from './stay.routes.js';
import roomRoutes from './room.routes.js';
import buildingRoutes from './building.routes.js';
import floorRoutes from './floor.routes.js';
import agreementRoutes from './agreement.routes.js';
import paymentRoutes from './payment.routes.js';
import visitorRoutes from './visitor.routes.js';
import branchRoutes from './branch.routes.js';
import cronRoutes from './cron.routes.js';
import { success } from '../utils/apiResponse.js';

const router = Router();

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  return success(res, 'System is healthy', {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Mount domain routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/stays', stayRoutes);
router.use('/buildings', buildingRoutes);
router.use('/floors', floorRoutes);
router.use('/rooms', roomRoutes);
router.use('/agreements', agreementRoutes);
router.use('/payments', paymentRoutes);
router.use('/visitors', visitorRoutes);
router.use('/branches', branchRoutes);
router.use('/crons', cronRoutes);

export default router;
