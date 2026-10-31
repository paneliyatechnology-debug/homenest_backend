import cronService from '../services/cron.service.js';

/**
 * Controller function for executing payment uploads cleanup
 */
export const cleanPaymentUploads = async () => {
  try {
    const result = await cronService.cleanPaymentUploads();
    console.log(
      `[Cron Controller] Payment uploads folder cleaned successfully. ${result.deleted_files_count} file(s) removed.`
    );
    return result;
  } catch (err) {
    console.error('[Cron Controller Error]:', err);
  }
};

export default {
  cleanPaymentUploads,
};
