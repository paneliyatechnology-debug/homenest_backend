/**
 * Reusable File & Image Update Helper Utility
 * Standardizes file update, replacement, and removal behavior across all modules.
 */

/**
 * Checks whether an incoming field value explicitly signals removal of an existing file.
 * Treats null, 'null', '', 'undefined', and 'delete' as explicit removals.
 * 
 * @param {any} val - The input value to check
 * @returns {boolean} True if explicit removal is requested
 */
export const isExplicitFileRemoval = (val) => {
  if (val === null) return true;
  if (typeof val === 'string') {
    const trimmed = val.trim().toLowerCase();
    return trimmed === 'null' || trimmed === '' || trimmed === 'undefined' || trimmed === 'delete';
  }
  return false;
};

/**
 * Resolves the updated file state for an update/edit operation:
 * 
 * 1. New file uploaded (file.filename present):
 *    - Replaces existing file.
 *    - Calls deleteFn on the old file if one existed.
 *    - Returns { shouldUpdate: true, newFilename: file.filename }.
 * 
 * 2. Explicit removal (fieldValue is null, 'null', '', 'undefined', or 'delete'):
 *    - Calls deleteFn on the old file if one existed.
 *    - Returns { shouldUpdate: true, newFilename: null }.
 * 
 * 3. Specific non-empty string passed (e.g. keeping existing filename or custom filename):
 *    - If changed, deletes previous file.
 *    - Returns { shouldUpdate: true, newFilename: cleanStr }.
 * 
 * 4. Field omitted (fieldValue is undefined and no file uploaded):
 *    - Preserves existing file without any database or filesystem modification.
 *    - Returns { shouldUpdate: false, newFilename: existingFilename }.
 * 
 * @param {object} options
 * @param {object|null} [options.file] - Multer uploaded file object (req.file)
 * @param {any} [options.fieldValue] - Raw value from request body
 * @param {string|null} [options.existingFilename] - Current filename in database
 * @param {Function} [options.deleteFn] - Optional callback function to delete old file from disk
 * @returns {{ shouldUpdate: boolean, newFilename: string|null }}
 */
export const resolveFileUpdate = ({ file, fieldValue, existingFilename, deleteFn }) => {
  // Case 1: A new file was uploaded via multipart/form-data
  if (file && file.filename) {
    if (existingFilename && existingFilename !== file.filename && typeof deleteFn === 'function') {
      try {
        deleteFn(existingFilename);
      } catch (err) {
        console.warn(`[Warning] Could not delete old file on replacement: ${existingFilename}`, err.message);
      }
    }
    return { shouldUpdate: true, newFilename: file.filename };
  }

  // Case 2 & 3: Field was explicitly provided in the payload
  if (fieldValue !== undefined) {
    if (isExplicitFileRemoval(fieldValue)) {
      // Explicit removal requested
      if (existingFilename && typeof deleteFn === 'function') {
        try {
          deleteFn(existingFilename);
        } catch (err) {
          console.warn(`[Warning] Could not delete old file on removal: ${existingFilename}`, err.message);
        }
      }
      return { shouldUpdate: true, newFilename: null };
    }

    // A valid string or filename was provided
    const cleanStr = typeof fieldValue === 'string' ? fieldValue.trim() : fieldValue;
    if (existingFilename && cleanStr !== existingFilename && typeof deleteFn === 'function') {
      try {
        deleteFn(existingFilename);
      } catch (err) {
        console.warn(`[Warning] Could not delete old file on update: ${existingFilename}`, err.message);
      }
    }
    return { shouldUpdate: true, newFilename: cleanStr || null };
  }

  // Case 4: Field was omitted - do not touch the existing file
  return { shouldUpdate: false, newFilename: existingFilename || null };
};

export default {
  isExplicitFileRemoval,
  resolveFileUpdate,
};

