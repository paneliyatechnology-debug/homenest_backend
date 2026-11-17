import fs from 'fs';
import path from 'path';

class CronService {
  /**
   * Delete all generated payment report files and receipt PDFs from uploads/payments, uploads/receipts, etc.
   * @returns {Promise<{ deleted_files_count: number, deleted_files: string[], folders: string[] }>}
   */
  cleanPaymentUploads = async () => {
    const folders = [
      path.join(process.cwd(), 'uploads', 'receipts'),
      path.join(process.cwd(), 'uploads', 'payments'),
      path.join(process.cwd(), 'uploads', 'payment'),
    ];

    let totalDeleted = 0;
    const deletedFiles = [];
    const scannedFolders = [];

    for (const folder of folders) {
      if (fs.existsSync(folder)) {
        scannedFolders.push(path.relative(process.cwd(), folder));
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
      folders: scannedFolders,
    };
  };
}

export default new CronService();
