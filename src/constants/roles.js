/**
 * System Role Constants
 */
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',       // PG Owner / Manager
  RESIDENT: 'resident', // Resident staying in PGs
};

export const ALL_ROLES = Object.values(ROLES);

export default ROLES;

