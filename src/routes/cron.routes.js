/**
 * Cron Job Scheduler & Management Router
 * 
 * Automatically initializes recurring background maintenance tasks upon module loading.
 * Provides a clean mount point under /api/v1/crons for future automated endpoints or webhooks.
 */
import { Router } from 'express';
import cron from 'node-cron';
import cronController from '../controllers/cron.controller.js';

const router = Router();

/**
 * Scheduled Daily Task: Automated Payment Proof & Uploads Cleanup
 * Runs daily at 03:00 AM IST to purge orphaned upload files and temporary assets.
 */
cron.schedule(
  '0 3 * * *',
  async () => {
    console.log('[Cron] Executing scheduled daily payment uploads cleanup at 3:00 AM IST...');
    await cronController.cleanPaymentUploads();
  },
  { timezone: 'Asia/Kolkata' }
);

export default router;
