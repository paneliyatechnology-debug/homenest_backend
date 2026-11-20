/**
 * Indian phone number normalization and common validation patterns.
 */

export const INDIAN_PHONE_REGEX = /^(\+91[\-\s]?)?[6-9]\d{9}$/;
export const GENERAL_PHONE_REGEX = /^[+]?[\d\s\-]{7,20}$/;
export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

/**
 * Normalizes an Indian phone number to 10 standard digits.
 * Strips non-digit characters, leading +91 / 91 country code, and leading 0.
 *
 * @param {string|number} phone - Raw input phone number
 * @returns {string} 10-digit mobile number string, or empty string if falsy
 */
export const normalizePhone = (phone) => {
  if (!phone) return '';
  const cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return cleaned.slice(2);
  }
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return cleaned.slice(1);
  }
  return cleaned;
};

export default {
  INDIAN_PHONE_REGEX,
  GENERAL_PHONE_REGEX,
  PINCODE_REGEX,
  normalizePhone,
};
