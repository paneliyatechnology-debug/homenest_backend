import moment from 'moment';

export const DATE_TIME_FORMAT = 'DD-MM-YYYY HH:mm';
export const DATE_ONLY_FORMAT = 'DD-MM-YYYY';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})?$/;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATE_KEY_REGEX = /(_at|_date|date_of_birth|timestamp)$/i;

/**
 * Format a single date value using moment
 * @param {Date|string|any} val
 * @param {string} [key='']
 * @returns {string|any}
 */
export const formatDate = (val, key = '') => {
  if (val === null || val === undefined) return val;

  const lowerKey = String(key).toLowerCase();

  // If it's date of birth, use date-only format DD-MM-YYYY
  if (lowerKey === 'date_of_birth') {
    const m = moment(val);
    return m.isValid() ? m.format(DATE_ONLY_FORMAT) : val;
  }

  // Date instance
  if (val instanceof Date) {
    return moment(val).format(DATE_TIME_FORMAT);
  }

  // String checking
  if (typeof val === 'string') {
    // If strict ISO timestamp string: e.g. 2026-10-28T08:44:17.000Z
    if (ISO_DATE_REGEX.test(val)) {
      const m = moment(val);
      return m.isValid() ? m.format(DATE_TIME_FORMAT) : val;
    }

    // If key indicates a date column and string is a date representation
    if (DATE_KEY_REGEX.test(lowerKey)) {
      if (DATE_ONLY_REGEX.test(val) || moment(val).isValid()) {
        const m = moment(val);
        return m.isValid() ? m.format(DATE_TIME_FORMAT) : val;
      }
    }
  }

  return val;
};

/**
 * Recursively format date fields within any object, array, or primitive for API responses
 * @param {any} data
 * @returns {any}
 */
export const formatResponseDates = (data) => {
  if (data === null || data === undefined) {
    return data;
  }

  if (data instanceof Date) {
    return moment(data).format(DATE_TIME_FORMAT);
  }

  if (Array.isArray(data)) {
    return data.map((item) => formatResponseDates(item));
  }

  if (typeof data === 'object') {
    if (Buffer.isBuffer(data)) {
      return data;
    }

    const formatted = {};
    for (const [key, val] of Object.entries(data)) {
      if (val === null || val === undefined) {
        formatted[key] = val;
      } else if (val instanceof Date) {
        formatted[key] = formatDate(val, key);
      } else if (Array.isArray(val) || (typeof val === 'object' && !Buffer.isBuffer(val))) {
        formatted[key] = formatResponseDates(val);
      } else if (typeof val === 'string') {
        formatted[key] = formatDate(val, key);
      } else {
        formatted[key] = val;
      }
    }
    return formatted;
  }

  return data;
};

export default {
  formatDate,
  formatResponseDates,
  DATE_TIME_FORMAT,
  DATE_ONLY_FORMAT,
};

