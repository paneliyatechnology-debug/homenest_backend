/**
 * System Role Constants
 */
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',       // PG Owner / Manager
  RESIDENT: 'resident', // Resident staying in PGs
  STAFF: 'staff',       // Staff member
};

export const ALL_ROLES = Object.values(ROLES);

/**
 * Operational Staff Roles (Managed under User Module)
 */
export const STAFF_ROLES = {
  KITCHEN_STAFF: 'KITCHEN_STAFF',
  HOUSEKEEPING: 'HOUSEKEEPING',
  SECURITY_GUARD: 'SECURITY_GUARD',
  ACCOUNTANT: 'ACCOUNTANT',
  BRANCH_MANAGER: 'BRANCH_MANAGER',
  WARDEN: 'WARDEN',
  MAINTENANCE: 'MAINTENANCE',
};

export const ALL_STAFF_ROLES = Object.values(STAFF_ROLES);

export default ROLES;
