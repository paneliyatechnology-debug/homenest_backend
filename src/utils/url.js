import config from '../config/index.js';

/**
 * Build an absolute URL for an uploaded file using the configured BACKEND_URL
 * @param {string} folder - Uploads subfolder (e.g. 'users', 'pgs', 'rooms', 'documents')
 * @param {string|null} filename - Uploaded file name or existing URL
 * @returns {string|null} Clean absolute URL
 */
export const buildFileUrl = (folder, filename) => {
  if (!filename || typeof filename !== 'string') return null;
  const trimmed = filename.trim();
  if (!trimmed) return null;

  // Return as-is if already an absolute URL or data URI
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }

  const backendUrl = (config.backendUrl || process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const cleanFile = trimmed.replace(/^\/+/, '');

  return `${backendUrl}/uploads/${folder}/${cleanFile}`;
};

export default {
  buildFileUrl,
};
