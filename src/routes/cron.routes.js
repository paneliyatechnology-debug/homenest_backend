import { Router } from 'express';
import cron from 'node-cron';
import cronController from '../controllers/cron.controller.js';

const router = Router();

// Schedule cron job: Every day at 3:00 AM IST
cron.schedule(
  '0 3 * * *',
  async () => {
    console.log('[Cron] Executing scheduled daily payment uploads cleanup at 3:00 AM IST...');
    await cronController.cleanPaymentUploads();
  },
  { timezone: 'Asia/Kolkata' }
);

export default router;
