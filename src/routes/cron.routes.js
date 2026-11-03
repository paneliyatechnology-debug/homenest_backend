/**
 * Cron Job Scheduler & Management Router
 * 
 * Automatically initializes recurring background maintenance tasks upon module loading.
 * Provides a clean mount point under /api/v1/crons for future automated endpoints or webhooks.
 */
import { Router } from 'express';
import cron from 'node-cron';
import cronController from '../controllers/cron.controller.js';
import noticeService from '../services/notice.service.js';

const router = Router();

/**
 * Scheduled Recurring Task: Auto-publish due scheduled notices
 * Runs every minute to transition scheduled notices whose scheduled_at <= NOW() to 'sent'.
 */
cron.schedule(
  '* * * * *',
  async () => {
    try {
      await noticeService.publishDueScheduledNotices();
    } catch (err) {
      console.warn('[Cron] Scheduled notices publication error:', err.message);
    }
  },
  { timezone: 'Asia/Kolkata' }
);

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
