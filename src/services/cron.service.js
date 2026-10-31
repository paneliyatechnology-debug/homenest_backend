import fs from 'fs';
import path from 'path';

class CronService {
  /**
   * Delete all generated payment report files from uploads/payments directory
   * @returns {Promise<{ deleted_files_count: number, deleted_files: string[], folder: string }>}
   */
  cleanPaymentUploads = async () => {
    const folders = [
      path.join(process.cwd(), 'uploads', 'payments'),
      path.join(process.cwd(), 'uploads', 'payment'),
    ];

    let totalDeleted = 0;
    const deletedFiles = [];

    for (const folder of folders) {
      if (fs.existsSync(folder)) {
        const files = fs.readdirSync(folder);
        for (const file of files) {
          const filePath = path.join(folder, file);
          try {
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
              fs.unlinkSync(filePath);
              deletedFiles.push(file);
              totalDeleted++;
            }
          } catch (err) {
            console.error(`[Cron Service] Error deleting file ${filePath}:`, err.message);
          }
        }
      }
    }

    return {
      deleted_files_count: totalDeleted,
      deleted_files: deletedFiles,
      folder: 'uploads/payments',
    };
  };
}

export default new CronService();
